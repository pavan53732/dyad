import { z } from "zod";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

// ============================================================================
// Tool 1: create_team (171)
// ============================================================================

const createTeamSchema = z.object({
  teamId: z.string().describe("Unique team identifier"),
  teamName: z.string().describe("Descriptive team name"),
  mission: z.string().describe("Team's mission and objectives"),
  memberIds: z.array(z.string()).describe("Initial team member IDs"),
  requiredRoles: z
    .array(
      z.object({
        role: z.string().describe("Role name"),
        count: z.number().describe("Number of people needed"),
        skills: z.array(z.string()).describe("Required skills"),
      }),
    )
    .optional()
    .describe("Required roles to fill"),
  teamType: z
    .enum(["project", "feature", "service", "task_force", "research"])
    .optional()
    .default("project")
    .describe("Type of team"),
});

export const createTeamTool: ToolDefinition<z.infer<typeof createTeamSchema>> =
  {
    name: "create_team",
    description: `Create a new agent team with a defined structure, mission, and roles. Establishes the foundation for hierarchical team organization and task coordination.`,
    inputSchema: createTeamSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) =>
      `Create team "${args.teamName}" with ${args.memberIds.length} members`,

    buildXml: (args, isComplete) => {
      if (!args.teamId) return undefined;
      let xml = `<dyad-create-team id="${escapeXmlAttr(args.teamId)}">`;
      if (isComplete) {
        xml += "</dyad-create-team>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const {
        teamId,
        teamName,
        mission,
        memberIds,
        requiredRoles = [],
        teamType = "project",
      } = args;

      ctx.onXmlStream(
        `<dyad-status title="Creating Team">Setting up team "${teamName}"...</dyad-status>`,
      );

      // Generate team structure
      const settings = readSettings();
      const { modelClient } = await getModelClient(
        settings.selectedModel || "gpt-4o",
        settings,
      );

      const structurePrompt = `Design a team structure for:

Team: ${teamName}
Mission: ${mission}
Type: ${teamType}
Members: ${memberIds.join(", ")}
Required Roles: ${JSON.stringify(requiredRoles)}

Create:
1. Team hierarchy (reporting lines)
2. Communication channels needed
3. Key responsibilities per role
4. Decision-making authority levels

Return as JSON:
{
  "hierarchy": [{"level": 1, "role": "...", "authority": "high|medium|low"}],
  "channels": [{"name": "...", "type": "sync|async", "participants": [...]}],
  "responsibilities": {"role": ["resp1", "resp2"]}
}`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: structurePrompt,
        temperature: 0.4,
      });

      let structure = { hierarchy: [], channels: [], responsibilities: {} };
      try {
        structure = JSON.parse(text);
      } catch {
        // Use defaults
      }

      const team = {
        id: teamId,
        name: teamName,
        mission,
        type: teamType,
        members: memberIds,
        hierarchy: structure.hierarchy,
        channels: structure.channels,
        responsibilities: structure.responsibilities,
        createdAt: new Date().toISOString(),
        status: "active",
      };

      const summary = `## Team Created Successfully

### Team Information

| Field | Value |
|-------|-------|
| ID | ${teamId} |
| Name | ${teamName} |
| Type | ${teamType} |
| Members | ${memberIds.length} |
| Status | ✅ Active |

---

### Mission

${mission}

---

### Team Hierarchy

| Level | Role | Authority |
|-------|------|-----------|
${
  structure.hierarchy
    .map((h: any) => `| ${h.level} | ${h.role} | ${h.authority} |`)
    .join("\n") || "| - | - | - |"
}

---

### Communication Channels

${
  structure.channels.length > 0
    ? structure.channels
        .map(
          (c: any) =>
            `- **${c.name}** (${c.type}): ${c.participants.join(", ")}`,
        )
        .join("\n")
    : "No specific channels defined"
}

---

### Responsibilities

${
  Object.entries(structure.responsibilities).length > 0
    ? Object.entries(structure.responsibilities)
        .map(
          ([role, resps]) => `**${role}**: ${(resps as string[]).join(", ")}`,
        )
        .join("\n")
    : "No specific responsibilities defined"
}

---

✅ Team "${teamName}" is now active and ready for task assignment`;

      ctx.onXmlComplete(
        `<dyad-status title="Team Created">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(team, null, 2);
    },
  };

// ============================================================================
// Tool 2: assign_leader (172)
// ============================================================================

const assignLeaderSchema = z.object({
  teamId: z.string().describe("Team identifier"),
  leaderId: z.string().describe("Agent ID to assign as leader"),
  leadershipStyle: z
    .enum(["directive", "participative", "delegative", "coaching"])
    .optional()
    .default("participative")
    .describe("Leadership style"),
  authority: z
    .object({
      budget: z
        .boolean()
        .optional()
        .default(false)
        .describe("Can approve budget"),
      hiring: z
        .boolean()
        .optional()
        .default(false)
        .describe("Can make hiring decisions"),
      firing: z
        .boolean()
        .optional()
        .default(false)
        .describe("Can remove team members"),
      technical: z
        .boolean()
        .optional()
        .default(true)
        .describe("Has final technical authority"),
    })
    .optional()
    .describe("Leader's authority levels"),
});

export const assignLeaderTool: ToolDefinition<
  z.infer<typeof assignLeaderSchema>
> = {
  name: "assign_leader",
  description: `Assign a leader to a team with specified authority levels and leadership style. Establishes clear chain of command and decision-making structure.`,
  inputSchema: assignLeaderSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Assign ${args.leaderId} as leader of team ${args.teamId}`,

  buildXml: (args, isComplete) => {
    if (!args.teamId) return undefined;
    let xml = `<dyad-assign-leader team="${escapeXmlAttr(args.teamId)}">`;
    if (isComplete) {
      xml += "</dyad-assign-leader>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      teamId,
      leaderId,
      leadershipStyle = "participative",
      authority = {
        budget: false,
        hiring: false,
        firing: false,
        technical: true,
      },
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Assigning Leader">Setting ${leaderId} as team leader...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Generate leadership guidance
    const guidancePrompt = `Provide leadership guidance for a ${leadershipStyle} leadership style.

Team: ${teamId}
New Leader: ${leaderId}
Authority: ${JSON.stringify(authority)}

Give:
1. Key characteristics of this leadership style
2. Recommended actions for the first week
3. Potential challenges and how to address them

Keep it concise (5-7 bullet points total).`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: guidancePrompt,
      temperature: 0.3,
    });

    const leadershipGuidance = text.split("\n").filter((l) => l.trim());

    const summary = `## Leader Assigned Successfully

### Assignment Details

| Field | Value |
|-------|-------|
| Team | ${teamId} |
| Leader | ${leaderId} |
| Style | ${leadershipStyle} |

---

### Authority Levels

| Capability | Granted |
|------------|---------|
| Technical Decisions | ${authority.technical ? "✅ Yes" : "❌ No"} |
| Budget Approval | ${authority.budget ? "✅ Yes" : "❌ No"} |
| Hiring Decisions | ${authority.hiring ? "✅ Yes" : "❌ No"} |
| Remove Members | ${authority.firing ? "✅ Yes" : "❌ No"} |

---

### Leadership Guidance

${leadershipGuidance.map((g) => `- ${g.replace(/^[-*]\s*/, "")}`).join("\n")}

---

✅ ${leaderId} is now the designated leader of team ${teamId}`;

    ctx.onXmlComplete(
      `<dyad-status title="Leader Assigned">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(
      {
        teamId,
        leaderId,
        leadershipStyle,
        authority,
        assignedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  },
};

// ============================================================================
// Tool 3: delegate_authority (173)
// ============================================================================

const delegateAuthoritySchema = z.object({
  teamId: z.string().describe("Team identifier"),
  delegatorId: z.string().describe("Current authority holder"),
  delegateId: z.string().describe("Agent receiving delegated authority"),
  authorityType: z
    .enum(["technical", "budget", "decision", "communication", "execution"])
    .describe("Type of authority to delegate"),
  scope: z
    .object({
      resources: z
        .array(z.string())
        .optional()
        .describe("Resources covered by delegation"),
      teams: z
        .array(z.string())
        .optional()
        .describe("Teams covered by delegation"),
      maxValue: z
        .number()
        .optional()
        .describe("Maximum value for budget delegation"),
    })
    .optional()
    .describe("Scope of delegation"),
  duration: z
    .string()
    .optional()
    .describe("Duration of delegation (e.g., '1 week', 'until task complete')"),
  conditions: z
    .array(z.string())
    .optional()
    .describe("Conditions for delegation revocation"),
});

export const delegateAuthorityTool: ToolDefinition<
  z.infer<typeof delegateAuthoritySchema>
> = {
  name: "delegate_authority",
  description: `Delegate specific authority from one agent to another within a team context. Defines scope, duration, and conditions for the delegation.`,
  inputSchema: delegateAuthoritySchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Delegate ${args.authorityType} authority from ${args.delegatorId} to ${args.delegateId}`,

  buildXml: (args, isComplete) => {
    if (!args.teamId) return undefined;
    let xml = `<dyad-delegate-authority team="${escapeXmlAttr(args.teamId)}">`;
    if (isComplete) {
      xml += "</dyad-delegate-authority>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      teamId,
      delegatorId,
      delegateId,
      authorityType,
      scope = {},
      duration,
      conditions = [],
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Delegating Authority">${delegatorId} delegating ${authorityType} to ${delegateId}...</dyad-status>`,
    );

    const delegation = {
      id: `delg_${Date.now()}`,
      teamId,
      delegator: delegatorId,
      delegate: delegateId,
      authorityType,
      scope,
      duration: duration || "indefinite",
      conditions,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    const summary = `## Authority Delegated Successfully

### Delegation Details

| Field | Value |
|-------|-------|
| Team | ${teamId} |
| From | ${delegatorId} |
| To | ${delegateId} |
| Authority Type | ${authorityType} |
| Duration | ${duration || "Indefinite"} |

---

### Scope

${scope.resources?.length ? `**Resources**: ${scope.resources.join(", ")}` : "All relevant resources"}
${scope.teams?.length ? `**Teams**: ${scope.teams.join(", ")}` : "All teams"}
${scope.maxValue ? `**Max Value**: ${scope.maxValue}` : "No limit"}

---

### Revocation Conditions

${conditions.length > 0 ? conditions.map((c) => `- ${c}`).join("\n") : "No specific conditions defined"}

---

✅ ${delegateId} now has ${authorityType} authority (delegated from ${delegatorId})`;

    ctx.onXmlComplete(
      `<dyad-status title="Authority Delegated">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(delegation, null, 2);
  },
};

// ============================================================================
// Tool 4: team_formation (174)
// ============================================================================

const teamFormationSchema = z.object({
  objective: z.string().describe("Team's objective or goal"),
  availableAgents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        skills: z.array(z.string()).describe("Agent skills"),
        experience: z.number().describe("Experience level (1-10)"),
        preferredRole: z.string().optional().describe("Preferred role"),
      }),
    )
    .describe("Available agents"),
  teamSize: z.number().optional().default(5).describe("Target team size"),
  hierarchy: z
    .enum(["flat", "hierarchical", "matrix", "network"])
    .optional()
    .default("hierarchical")
    .describe("Team structure type"),
  specialization: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable role specialization"),
});

export const teamFormationTool: ToolDefinition<
  z.infer<typeof teamFormationSchema>
> = {
  name: "team_formation",
  description: `Form a complete hierarchical team with appropriate roles and structure based on objectives and available agents. Optimizes team composition for the given goal.`,
  inputSchema: teamFormationSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.objective) return undefined;
    let xml = `<dyad-team-formation objective="${escapeXmlAttr(args.objective.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-team-formation>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      objective,
      availableAgents,
      teamSize = 5,
      hierarchy = "hierarchical",
      specialization = true,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Forming Team">Creating optimal team structure...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Select optimal team using AI
    const formationPrompt = `Form an optimal team for: ${objective}

Available Agents:
${availableAgents
  .map(
    (a) =>
      `- ${a.id}: Skills=[${a.skills.join(", ")}], Experience=${a.experience}, Preferred=${a.preferredRole || "None"}`,
  )
  .join("\n")}

Team Size: ${teamSize}
Structure: ${hierarchy}
Specialization: ${specialization}

Select the best ${teamSize} agents and assign roles. Consider:
1. Skill match to objective
2. Experience balance
3. Role coverage

Return as JSON:
{
  "team": [
    {"agentId": "...", "role": "...", "level": 1}
  ],
  "leadership": "agentId of team lead",
  "justification": "..."
}`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: formationPrompt,
      temperature: 0.4,
    });

    let formation = { team: [], leadership: null, justification: "" };
    try {
      formation = JSON.parse(text);
    } catch {
      // Fallback to simple selection
      const sorted = [...availableAgents].sort(
        (a, b) => b.experience - a.experience,
      );
      formation = {
        team: sorted.slice(0, teamSize).map((a, i) => ({
          agentId: a.id,
          role: i === 0 ? "Team Lead" : "Member",
          level: i === 0 ? 1 : 2,
        })),
        leadership: sorted[0]?.id,
        justification: "Fallback: Selected by experience",
      };
    }

    const summary = `## Team Formation Complete

### Objective
${objective}

---

### Team Structure (${hierarchy})

| Level | Role | Agent |
|-------|------|-------|
${formation.team
  .map((t: any) => `| ${t.level} | ${t.role} | ${t.agentId} |`)
  .join("\n")}

---

### Leadership

**Team Lead:** ${formation.leadership || "Not assigned"}

---

### Justification

${formation.justification || "No justification provided"}

---

### Hierarchy Type: ${hierarchy}

${hierarchy === "flat" ? "All members report directly to lead" : hierarchy === "hierarchical" ? "Clear chain of command with multiple levels" : hierarchy === "matrix" ? "Dual reporting structure" : "Network of peer collaborations"}

---

✅ Team formation complete with ${formation.team.length} members`;

    ctx.onXmlComplete(
      `<dyad-status title="Team Formed">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(formation, null, 2);
  },
};

// ============================================================================
// Tool 5: role_promotion (175)
// ============================================================================

const rolePromotionSchema = z.object({
  agentId: z.string().describe("Agent to promote"),
  currentRole: z.string().describe("Current role"),
  targetRole: z.string().describe("Target role"),
  teamId: z.string().describe("Team identifier"),
  justification: z.string().describe("Promotion justification"),
  performanceMetrics: z
    .object({
      tasksCompleted: z.number().describe("Tasks completed"),
      qualityScore: z.number().describe("Quality score (0-1)"),
      collaborationRating: z.number().describe("Collaboration rating (0-1)"),
      leadershipIndicators: z
        .array(z.string())
        .optional()
        .describe("Leadership behaviors demonstrated"),
    })
    .optional()
    .describe("Performance metrics supporting promotion"),
  effectiveDate: z.string().optional().describe("When promotion takes effect"),
});

export const rolePromotionTool: ToolDefinition<
  z.infer<typeof rolePromotionSchema>
> = {
  name: "role_promotion",
  description: `Promote an agent to a higher role based on performance and demonstrated capabilities. Updates role hierarchy and associated responsibilities.`,
  inputSchema: rolePromotionSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Promote ${args.agentId} from ${args.currentRole} to ${args.targetRole}`,

  buildXml: (args, isComplete) => {
    if (!args.agentId) return undefined;
    let xml = `<dyad-role-promotion agent="${escapeXmlAttr(args.agentId)}">`;
    if (isComplete) {
      xml += "</dyad-role-promotion>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      agentId,
      currentRole,
      targetRole,
      teamId,
      justification,
      performanceMetrics,
      effectiveDate,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Processing Promotion">Promoting ${agentId}...</dyad-status>`,
    );

    const promotion = {
      id: `promo_${Date.now()}`,
      agentId,
      fromRole: currentRole,
      toRole: targetRole,
      teamId,
      justification,
      metrics: performanceMetrics,
      effectiveDate: effectiveDate || new Date().toISOString(),
      status: "effective",
    };

    const summary = `## Role Promotion Complete

### Promotion Details

| Field | Value |
|-------|-------|
| Agent | ${agentId} |
| From | ${currentRole} |
| To | ${targetRole} |
| Team | ${teamId} |
| Effective | ${effectiveDate || "Immediately"} |

---

### Justification

${justification}

---

${
  performanceMetrics
    ? `### Performance Metrics

| Metric | Value |
|--------|-------|
| Tasks Completed | ${performanceMetrics.tasksCompleted} |
| Quality Score | ${Math.round(performanceMetrics.qualityScore * 100)}% |
| Collaboration | ${Math.round(performanceMetrics.collaborationRating * 100)}% |

${
  performanceMetrics.leadershipIndicators?.length
    ? `**Leadership Behaviors:**\n${performanceMetrics.leadershipIndicators.map((b) => `- ${b}`).join("\n")}`
    : ""
}`
    : ""
}

---

✅ ${agentId} has been promoted to ${targetRole}`;

    ctx.onXmlComplete(
      `<dyad-status title="Promotion Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(promotion, null, 2);
  },
};

// ============================================================================
// Tool 6: team_dissolve (176)
// ============================================================================

const teamDissolveSchema = z.object({
  teamId: z.string().describe("Team to dissolve"),
  reason: z.string().describe("Reason for dissolution"),
  windDownTasks: z
    .array(
      z.object({
        task: z.string().describe("Task to complete before dissolve"),
        assignee: z.string().describe("Agent responsible"),
        deadline: z.string().optional().describe("Task deadline"),
      }),
    )
    .optional()
    .describe("Tasks to complete before team dissolves"),
  memberAssignments: z
    .record(z.string(), z.string())
    .optional()
    .describe("Where each member goes after dissolution"),
  preserveKnowledge: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to archive team knowledge"),
});

export const teamDissolveTool: ToolDefinition<
  z.infer<typeof teamDissolveSchema>
> = {
  name: "team_dissolve",
  description: `Dissolve an existing team after completing wind-down activities. Handles member reassignment, knowledge preservation, and documentation.`,
  inputSchema: teamDissolveSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Dissolve team ${args.teamId}`,

  buildXml: (args, isComplete) => {
    if (!args.teamId) return undefined;
    let xml = `<dyad-team-dissolve team="${escapeXmlAttr(args.teamId)}">`;
    if (isComplete) {
      xml += "</dyad-team-dissolve>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      teamId,
      reason,
      windDownTasks = [],
      memberAssignments = {},
      preserveKnowledge = true,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Dissolving Team">Winding down team ${teamId}...</dyad-status>`,
    );

    const dissolution = {
      id: `dissolve_${Date.now()}`,
      teamId,
      reason,
      windDownTasks,
      memberAssignments,
      preserveKnowledge,
      status: windDownTasks.length > 0 ? "winding_down" : "dissolved",
      createdAt: new Date().toISOString(),
    };

    const summary = `## Team Dissolution Initiated

### Details

| Field | Value |
|-------|-------|
| Team | ${teamId} |
| Reason | ${reason} |
| Knowledge Preserved | ${preserveKnowledge ? "✅ Yes" : "❌ No"} |
| Status | ${windDownTasks.length > 0 ? "Winding Down" : "Dissolved"} |

---

${
  windDownTasks.length > 0
    ? `### Wind-Down Tasks

| Task | Assignee | Deadline |
|------|----------|----------|
${windDownTasks
  .map((t) => `| ${t.task} | ${t.assignee} | ${t.deadline || "TBD"} |`)
  .join("\n")}

---

`
    : ""
}${
      Object.keys(memberAssignments).length > 0
        ? `### Member Reassignments

| Member | New Assignment |
|--------|----------------|
${Object.entries(memberAssignments)
  .map(([member, assignment]) => `| ${member} | ${assignment} |`)
  .join("\n")}

---

`
        : ""
    }${
      windDownTasks.length > 0
        ? "⚠️ Team will be fully dissolved once all wind-down tasks are complete"
        : "✅ Team has been dissolved"
    }`;

    ctx.onXmlComplete(
      `<dyad-status title="Team Dissolved">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(dissolution, null, 2);
  },
};

// ============================================================================
// Tool 7: knowledge_hierarchy (177)
// ============================================================================

const knowledgeHierarchySchema = z.object({
  domain: z.string().describe("Knowledge domain"),
  expertiseLevels: z
    .array(
      z.object({
        agentId: z.string().describe("Agent identifier"),
        knowledgeAreas: z
          .array(
            z.object({
              topic: z.string().describe("Knowledge topic"),
              level: z.number().min(1).max(5).describe("Expertise level (1-5)"),
            }),
          )
          .describe("Agent's knowledge areas"),
      }),
    )
    .describe("Agents and their knowledge"),
  includeDependencies: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include knowledge dependencies"),
});

export const knowledgeHierarchyTool: ToolDefinition<
  z.infer<typeof knowledgeHierarchySchema>
> = {
  name: "knowledge_hierarchy",
  description: `Establish a knowledge hierarchy within a domain showing expertise levels, knowledge dependencies, and mentorship opportunities. Identifies who knows what and who should learn from whom.`,
  inputSchema: knowledgeHierarchySchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.domain) return undefined;
    let xml = `<dyad-knowledge-hierarchy domain="${escapeXmlAttr(args.domain)}">`;
    if (isComplete) {
      xml += "</dyad-knowledge-hierarchy>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { domain, expertiseLevels } = args;

    ctx.onXmlStream(
      `<dyad-status title="Building Knowledge Hierarchy">Analyzing expertise in ${domain}...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Calculate expertise hierarchy
    const agentExpertise = expertiseLevels.map((agent) => {
      const avgLevel =
        agent.knowledgeAreas.reduce((sum, k) => sum + k.level, 0) /
        agent.knowledgeAreas.length;
      const maxLevel = Math.max(...agent.knowledgeAreas.map((k) => k.level));

      return {
        agentId: agent.agentId,
        knowledgeAreas: agent.knowledgeAreas,
        avgLevel: Math.round(avgLevel * 10) / 10,
        maxLevel,
        expertiseTier:
          maxLevel >= 4
            ? "Expert"
            : maxLevel >= 3
              ? "Advanced"
              : maxLevel >= 2
                ? "Intermediate"
                : "Foundation",
      };
    });

    // Sort by expertise
    agentExpertise.sort((a, b) => b.maxLevel - a.maxLevel);

    // Identify mentorship pairs
    const mentorshipPairs: { mentor: string; mentee: string; topic: string }[] =
      [];
    for (const expert of agentExpertise.filter((a) => a.maxLevel >= 4)) {
      for (const learner of agentExpertise.filter(
        (a) => a.agentId !== expert.agentId && a.maxLevel < expert.maxLevel,
      )) {
        // Find overlapping topics
        const expertTopics = expert.knowledgeAreas.map((k) => k.topic);
        const learnerTopics = learner.knowledgeAreas.map((k) => k.topic);
        const commonTopics = expertTopics.filter((t) =>
          learnerTopics.includes(t),
        );

        if (commonTopics.length > 0) {
          mentorshipPairs.push({
            mentor: expert.agentId,
            mentee: learner.agentId,
            topic: commonTopics[0],
          });
        }
      }
    }

    // Generate AI insights
    const insightsPrompt = `Analyze this knowledge hierarchy for domain: ${domain}

Expertise:
${agentExpertise.map((a) => `- ${a.agentId}: ${a.expertiseTier} (avg: ${a.avgLevel}, max: ${a.maxLevel})`).join("\n")}

Provide:
1. Knowledge gaps in the team
2. Training recommendations
3. Optimal knowledge sharing structure`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: insightsPrompt,
      temperature: 0.3,
    });

    const summary = `## Knowledge Hierarchy Complete

### Domain: ${domain}

---

### Expertise Ranking

| Rank | Agent | Tier | Avg Level | Max Level |
|------|-------|------|-----------|-----------|
${agentExpertise
  .map(
    (a, i) =>
      `| ${i + 1} | ${a.agentId} | ${a.expertiseTier} | ${a.avgLevel} | ${a.maxLevel} |`,
  )
  .join("\n")}

---

### Detailed Expertise

${agentExpertise
  .map(
    (a) =>
      `**${a.agentId}** (${a.expertiseTier})\n${a.knowledgeAreas.map((k) => `- ${k.topic}: ${"★".repeat(k.level)}${"☆".repeat(5 - k.level)}`).join("\n")}`,
  )
  .join("\n\n")}

---

### Mentorship Opportunities

${
  mentorshipPairs.length > 0
    ? mentorshipPairs
        .map((m) => `- **${m.mentor}** → **${m.mentee}** (${m.topic})`)
        .join("\n")
    : "No mentorship pairs identified"
}

---

### AI Insights

${text}

---

### Summary

- Experts (Level 4-5): ${agentExpertise.filter((a) => a.maxLevel >= 4).length}
- Advanced (Level 3): ${agentExpertise.filter((a) => a.maxLevel === 3).length}
- Intermediate (Level 2): ${agentExpertise.filter((a) => a.maxLevel === 2).length}
- Foundation (Level 1): ${agentExpertise.filter((a) => a.maxLevel === 1).length}`;

    ctx.onXmlComplete(
      `<dyad-status title="Knowledge Hierarchy Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 8: escalation_path (178)
// ============================================================================

const escalationPathSchema = z.object({
  teamId: z.string().describe("Team identifier"),
  issueTypes: z
    .array(
      z.object({
        type: z.string().describe("Type of issue"),
        severity: z
          .enum(["low", "medium", "high", "critical"])
          .describe("Issue severity"),
        firstResponder: z.string().describe("First responder role"),
        escalationLevels: z
          .array(
            z.object({
              level: z.number().describe("Escalation level"),
              role: z.string().describe("Role at this level"),
              responseTime: z
                .string()
                .describe("Expected response time (e.g., '1 hour')"),
              authority: z
                .array(z.string())
                .describe("Decision authority at this level"),
            }),
          )
          .describe("Escalation path"),
      }),
    )
    .describe("Issue types and their escalation paths"),
  autoEscalate: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable automatic escalation"),
});

export const escalationPathTool: ToolDefinition<
  z.infer<typeof escalationPathSchema>
> = {
  name: "escalation_path",
  description: `Define escalation paths for different issue types and severity levels. Establishes clear procedures for when and how issues should be escalated within the team hierarchy.`,
  inputSchema: escalationPathSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Define escalation paths for team ${args.teamId}`,

  buildXml: (args, isComplete) => {
    if (!args.teamId) return undefined;
    let xml = `<dyad-escalation-path team="${escapeXmlAttr(args.teamId)}">`;
    if (isComplete) {
      xml += "</dyad-escalation-path>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { teamId, issueTypes, autoEscalate = true } = args;

    ctx.onXmlStream(
      `<dyad-status title="Defining Escalation Paths">Setting up escalation procedures...</dyad-status>`,
    );

    const escalationConfig = {
      teamId,
      issueTypes,
      autoEscalate,
      createdAt: new Date().toISOString(),
    };

    const summary = `## Escalation Paths Defined

### Team: ${teamId}

**Auto-Escalation:** ${autoEscalate ? "✅ Enabled" : "❌ Disabled"}

---

### Escalation Paths by Issue Type

${issueTypes
  .map(
    (issue) =>
      `#### ${issue.type} (${issue.severity})

**First Responder:** ${issue.firstResponder}

| Level | Role | Response Time | Authority |
|-------|------|---------------|-----------|
${issue.escalationLevels
  .map(
    (e) =>
      `| ${e.level} | ${e.role} | ${e.responseTime} | ${e.authority.join(", ")} |`,
  )
  .join("\n")}`,
  )
  .join("\n\n")}

---

### Quick Reference

| Severity | First Contact | Escalates To |
|----------|---------------|--------------|
${issueTypes
  .map(
    (i) =>
      `| ${i.severity} | ${i.firstResponder} | ${i.escalationLevels[i.escalationLevels.length - 1]?.role || "N/A"} |`,
  )
  .join("\n")}

---

✅ Escalation paths are now active for team ${teamId}`;

    ctx.onXmlComplete(
      `<dyad-status title="Escalation Paths Defined">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return JSON.stringify(escalationConfig, null, 2);
  },
};

// Export all tools from this file
export const hierarchicalTeamsTools = {
  createTeamTool,
  assignLeaderTool,
  delegateAuthorityTool,
  teamFormationTool,
  rolePromotionTool,
  teamDissolveTool,
  knowledgeHierarchyTool,
  escalationPathTool,
};
