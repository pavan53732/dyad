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
// Tool 1: role_specialization (121)
// ============================================================================

const roleSpecializationSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        capabilities: z
          .array(z.string())
          .describe("Agent's capabilities and strengths"),
        experience: z
          .number()
          .optional()
          .default(0)
          .describe("Agent's experience level (0-10)"),
        currentRole: z
          .string()
          .optional()
          .describe("Agent's current role if any"),
      }),
    )
    .describe("Agents to assign specialized roles"),
  taskContext: z
    .string()
    .describe("Context and nature of tasks to be performed"),
  teamSize: z.number().optional().default(5).describe("Expected team size"),
});

export const roleSpecializationTool: ToolDefinition<
  z.infer<typeof roleSpecializationSchema>
> = {
  name: "role_specialization",
  description: `Assign specialized roles to agents based on their capabilities, experience, and task requirements. Creates a structured team with distinct responsibilities for optimal task execution. Useful for forming effective agent teams.`,
  inputSchema: roleSpecializationSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.taskContext) return undefined;
    let xml = `<dyad-role-specialization context="${escapeXmlAttr(args.taskContext.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-role-specialization>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, taskContext, teamSize = 5 } = args;

    ctx.onXmlStream(
      `<dyad-status title="Role Specialization">Analyzing ${agents.length} agents for role assignment...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Define standard roles for software development teams
    const standardRoles = [
      "Architect",
      "Lead Developer",
      "Code Reviewer",
      "Test Engineer",
      "Documentation Specialist",
      "Security Analyst",
      "Performance Optimizer",
      "Integration Specialist",
    ];

    // Analyze each agent and assign optimal roles
    const roleAssignments = await Promise.all(
      agents.map(async (agent) => {
        const prompt = `Analyze this agent for role assignment in a team of ${teamSize} working on: ${taskContext}

Agent Profile:
- ID: ${agent.id}
- Capabilities: ${agent.capabilities.join(", ")}
- Experience Level: ${agent.experience}/10
- Current Role: ${agent.currentRole || "None"}

Available Roles: ${standardRoles.join(", ")}

Select the TOP 2 most suitable roles for this agent based on:
1. Match between capabilities and role requirements
2. Experience level suitability
3. Synergy with other agents

Return JSON:
{
  "primaryRole": "role name",
  "secondaryRole": "role name",
  "rationale": "2-3 sentence explanation"
}`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.3,
        });

        try {
          const parsed = JSON.parse(text);
          return {
            agentId: agent.id,
            ...parsed,
            capabilities: agent.capabilities,
            experience: agent.experience,
          };
        } catch {
          return {
            agentId: agent.id,
            primaryRole:
              standardRoles[agents.indexOf(agent) % standardRoles.length],
            secondaryRole:
              standardRoles[(agents.indexOf(agent) + 1) % standardRoles.length],
            rationale: "Default assignment based on agent index",
            capabilities: agent.capabilities,
            experience: agent.experience,
          };
        }
      }),
    );

    // Ensure unique primary roles across the team
    const assignedRoles = new Set<string>();
    const finalAssignments = roleAssignments.map((assignment) => {
      if (!assignedRoles.has(assignment.primaryRole)) {
        assignedRoles.add(assignment.primaryRole);
        return assignment;
      }
      // Swap primary and secondary if primary is taken
      return {
        ...assignment,
        primaryRole: assignment.secondaryRole,
        secondaryRole: assignment.primaryRole,
      };
    });

    const summary = `## Role Specialization Complete

### Team of ${agents.length} Agents

| Agent | Primary Role | Secondary Role | Rationale |
|-------|--------------|----------------|-----------|
${finalAssignments
  .map(
    (a) =>
      `| ${a.agentId} | ${a.primaryRole} | ${a.secondaryRole} | ${a.rationale} |`,
  )
  .join("\n")}

---

### Role Distribution Summary

${[...new Set(finalAssignments.map((a) => a.primaryRole))].join(", ")}`;

    ctx.onXmlComplete(
      `<dyad-status title="Role Assignment Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 2: skill_matching (122)
// ============================================================================

const skillMatchingSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().describe("Task identifier"),
        requiredSkills: z
          .array(z.string())
          .describe("Skills required to complete the task"),
        priority: z
          .number()
          .optional()
          .default(1)
          .describe("Task priority (higher = more important)"),
        estimatedEffort: z
          .number()
          .optional()
          .default(1)
          .describe("Estimated effort in person-hours"),
      }),
    )
    .describe("Tasks to match with agents"),
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        skills: z.array(z.string()).describe("Agent's available skills"),
        availability: z
          .number()
          .optional()
          .default(1)
          .describe("Availability factor (0-1)"),
        maxLoad: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum task load capacity"),
      }),
    )
    .describe("Available agents with their skills"),
  matchingStrategy: z
    .enum(["best_fit", "load_balanced", "skill_first"])
    .optional()
    .default("best_fit")
    .describe("Strategy for matching tasks to agents"),
});

export const skillMatchingTool: ToolDefinition<
  z.infer<typeof skillMatchingSchema>
> = {
  name: "skill_matching",
  description: `Match tasks to agents based on skill alignment, availability, and workload. Optimizes task allocation for maximum efficiency and balanced team load.`,
  inputSchema: skillMatchingSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.tasks?.length) return undefined;
    let xml = `<dyad-skill-matching tasks="${args.tasks.length}">`;
    if (isComplete) {
      xml += "</dyad-skill-matching>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { tasks, agents, matchingStrategy = "best_fit" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Skill Matching">Matching ${tasks.length} tasks to ${agents.length} agents using ${matchingStrategy} strategy...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Calculate skill match scores
    const matchScores = tasks.map((task) => {
      const agentScores = agents.map((agent) => {
        const matchedSkills = task.requiredSkills.filter((skill) =>
          agent.skills.some(
            (agentSkill) =>
              agentSkill.toLowerCase() === skill.toLowerCase() ||
              agentSkill.toLowerCase().includes(skill.toLowerCase()) ||
              skill.toLowerCase().includes(agentSkill.toLowerCase()),
          ),
        );
        const matchScore = matchedSkills.length / task.requiredSkills.length;
        const loadFactor =
          agent.availability * (1 - (agent.maxLoad - 1) / agent.maxLoad);

        let finalScore: number;
        switch (matchingStrategy) {
          case "best_fit":
            finalScore = matchScore * 0.7 + loadFactor * 0.3;
            break;
          case "load_balanced":
            finalScore = loadFactor * 0.6 + matchScore * 0.4;
            break;
          case "skill_first":
            finalScore = matchScore;
            break;
          default:
            finalScore = matchScore;
        }

        return {
          agentId: agent.id,
          matchedSkills,
          matchScore: Math.round(matchScore * 100) / 100,
          loadFactor: Math.round(loadFactor * 100) / 100,
          finalScore: Math.round(finalScore * 100) / 100,
        };
      });

      // Sort by final score and get best match
      agentScores.sort((a, b) => b.finalScore - a.finalScore);

      return {
        taskId: task.id,
        requiredSkills: task.requiredSkills,
        priority: task.priority,
        bestMatch: agentScores[0],
        alternatives: agentScores.slice(1, 3),
      };
    });

    // Generate analysis using AI
    const analysisPrompt = `Analyze these task-agent skill matches:

Tasks:
${tasks
  .map(
    (t) =>
      `- ${t.id}: Required skills: ${t.requiredSkills.join(", ")}, Priority: ${t.priority}`,
  )
  .join("\n")}

Agents:
${agents
  .map(
    (a) =>
      `- ${a.id}: Skills: ${a.skills.join(", ")}, Availability: ${a.availability}, Max Load: ${a.maxLoad}`,
  )
  .join("\n")}

Matches:
${matchScores.map((m) => `${m.taskId} -> ${m.bestMatch.agentId} (score: ${m.bestMatch.finalScore})`).join("\n")}

Provide recommendations for optimal task assignment and any potential skill gaps.`;

    const { text: analysis } = await generateText({
      model: modelClient.model,
      prompt: analysisPrompt,
      temperature: 0.3,
    });

    const summary = `## Skill Matching Complete

### Task Assignments (${matchingStrategy} strategy)

| Task | Assigned Agent | Match Score | Matched Skills |
|------|----------------|-------------|-----------------|
${matchScores
  .map(
    (m) =>
      `| ${m.taskId} | ${m.bestMatch.agentId} | ${m.bestMatch.finalScore} | ${m.bestMatch.matchedSkills.join(", ") || "N/A"} |`,
  )
  .join("\n")}

---

### Analysis

${analysis}

---

### Skill Gap Analysis

${
  tasks
    .filter((t) => {
      const match = matchScores.find((m) => m.taskId === t.id);
      return match && match.bestMatch.finalScore < 0.5;
    })
    .map((t) => {
      const match = matchScores.find((m) => m.taskId === t.id);
      const score = match ? match.bestMatch.finalScore : 0;
      return `⚠️ ${t.id}: Only ${Math.round(score * 100)}% skill coverage`;
    })
    .join("\n") || "✅ All tasks have adequate skill coverage"
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Skill Matching Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 3: task_decomposition (123)
// ============================================================================

const taskDecompositionSchema = z.object({
  parentTask: z.string().describe("The high-level task to decompose"),
  decompositionType: z
    .enum(["sequential", "parallel", "hierarchical", "mixed"])
    .optional()
    .default("mixed")
    .describe("Type of decomposition"),
  maxSubtasks: z.number().optional().default(8).describe("Maximum subtasks"),
  includeDependencies: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include dependency relationships"),
  agentPool: z
    .array(z.string())
    .optional()
    .describe("Available agent IDs for assignment"),
});

export const taskDecompositionTool: ToolDefinition<
  z.infer<typeof taskDecompositionSchema>
> = {
  name: "task_decomposition",
  description: `Decompose complex tasks into smaller, manageable subtasks for parallel or sequential execution by multiple agents. Identifies dependencies and optimal execution order.`,
  inputSchema: taskDecompositionSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.parentTask) return undefined;
    let xml = `<dyad-task-decomposition task="${escapeXmlAttr(args.parentTask.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-task-decomposition>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      parentTask,
      decompositionType = "mixed",
      maxSubtasks = 8,
      agentPool = [],
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Task Decomposition">Decomposing task into subtasks...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    const prompt = `Decompose this complex task into ${maxSubtasks} or fewer subtasks:

**Task:** ${parentTask}
**Decomposition Type:** ${decompositionType}
${agentPool.length > 0 ? `**Available Agents:** ${agentPool.join(", ")}` : ""}

For each subtask, provide:
1. A clear, specific description
2. Estimated complexity (1-10)
3. Whether it can run in parallel with others
4. Prerequisites/dependencies (if any)
5. Suggested agent role (if agent pool available)

Return as JSON array:
[{
  "id": "subtask_1",
  "description": "...",
  "complexity": 5,
  "parallelizable": true,
  "dependencies": ["subtask_0"],
  "suggestedAgent": "Code Reviewer"
}]`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt,
      temperature: 0.4,
    });

    let subtasks: any[] = [];
    try {
      subtasks = JSON.parse(text);
    } catch {
      // Parse line by line if JSON fails
      const lines = text.split("\n").filter((l) => l.trim());
      subtasks = lines.slice(0, maxSubtasks).map((line, i) => ({
        id: `subtask_${i + 1}`,
        description: line.replace(/^\d+\.\s*/, "").trim(),
        complexity: 5,
        parallelizable: true,
        dependencies: [],
      }));
    }

    // Identify parallel execution groups
    const parallelGroups: string[][] = [];
    const processed = new Set<string>();

    while (processed.size < subtasks.length) {
      const currentGroup = subtasks
        .filter(
          (t) =>
            !processed.has(t.id) &&
            (t.dependencies || []).every((d: string) => processed.has(d)),
        )
        .map((t) => t.id);

      if (currentGroup.length === 0) break;
      parallelGroups.push(currentGroup);
      currentGroup.forEach((id) => processed.add(id));
    }

    const summary = `## Task Decomposition Complete

### Parent Task
${parentTask}

---

### Subtasks (${subtasks.length})

| ID | Description | Complexity | Parallel | Dependencies |
|----|-------------|------------|----------|--------------|
${subtasks
  .map(
    (t) =>
      `| ${t.id} | ${t.description.substring(0, 40)}... | ${t.complexity} | ${t.parallelizable ? "✅" : "❌"} | ${(t.dependencies || []).join(", ") || "-"} |`,
  )
  .join("\n")}

---

### Execution Plan

${parallelGroups
  .map((group, i) => `**Phase ${i + 1}** (parallel): ${group.join(", ")}`)
  .join("\n")}

---

### Total Estimated Complexity: ${subtasks.reduce((sum: number, t: any) => sum + t.complexity, 0)}`;

    ctx.onXmlComplete(
      `<dyad-status title="Decomposition Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 4: workload_balancing (124)
// ============================================================================

const workloadBalancingSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        currentLoad: z.number().describe("Current workload (0-100)"),
        capacity: z.number().describe("Maximum capacity (e.g., 100)"),
        efficiency: z
          .number()
          .optional()
          .default(1)
          .describe("Efficiency factor (0.5-1.5)"),
        unavailable: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether agent is unavailable"),
      }),
    )
    .describe("Agents and their current workloads"),
  tasks: z
    .array(
      z.object({
        id: z.string().describe("Task identifier"),
        effort: z.number().describe("Effort required (1-100)"),
        priority: z.number().optional().default(1).describe("Task priority"),
        deadlineSensitive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether task is deadline-sensitive"),
      }),
    )
    .describe("Tasks to be distributed"),
  strategy: z
    .enum(["balanced", "priority_first", "efficiency_first"])
    .optional()
    .default("balanced")
    .describe("Balancing strategy"),
});

export const workloadBalancingTool: ToolDefinition<
  z.infer<typeof workloadBalancingSchema>
> = {
  name: "workload_balancing",
  description: `Balance workload across agents considering their current load, capacity, and efficiency. Optimizes task distribution to prevent overloading and maximize throughput.`,
  inputSchema: workloadBalancingSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.tasks?.length) return undefined;
    let xml = `<dyad-workload-balancing tasks="${args.tasks.length}">`;
    if (isComplete) {
      xml += "</dyad-workload-balancing>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, tasks, strategy = "balanced" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Workload Balancing">Distributing ${tasks.length} tasks across ${agents.length} agents...</dyad-status>`,
    );

    // Sort tasks by priority (and deadline sensitivity)
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.deadlineSensitive && !b.deadlineSensitive) return -1;
      if (!a.deadlineSensitive && b.deadlineSensitive) return 1;
      return b.priority - a.priority;
    });

    // Initialize agent workloads
    const agentWorkloads = agents.map((a) => ({
      ...a,
      remainingCapacity: a.unavailable ? 0 : a.capacity - a.currentLoad,
      assignedTasks: [] as string[],
    }));

    // Filter available agents
    const availableAgents = agentWorkloads.filter(
      (a) => a.remainingCapacity > 0,
    );

    // Assign tasks
    const assignments: {
      taskId: string;
      agentId: string;
      loadAfter: number;
      reasoning: string;
    }[] = [];

    for (const task of sortedTasks) {
      if (availableAgents.length === 0) {
        assignments.push({
          taskId: task.id,
          agentId: "UNASSIGNED",
          loadAfter: 0,
          reasoning: "No available agents",
        });
        continue;
      }

      // Select agent based on strategy
      let selectedAgent: (typeof availableAgents)[0];

      switch (strategy) {
        case "priority_first":
          // Assign to agent with most remaining capacity
          selectedAgent = availableAgents.sort(
            (a, b) => b.remainingCapacity - a.remainingCapacity,
          )[0];
          break;
        case "efficiency_first":
          // Assign to most efficient agent with capacity
          selectedAgent = availableAgents.sort(
            (a, b) => b.efficiency - a.efficiency,
          )[0];
          break;
        case "balanced":
        default:
          // Assign to agent with best ratio of capacity to efficiency
          selectedAgent = availableAgents.sort(
            (a, b) =>
              b.remainingCapacity * b.efficiency -
              a.remainingCapacity * a.efficiency,
          )[0];
          break;
      }

      // Adjust effort by agent efficiency
      const adjustedEffort = Math.ceil(
        (task as any).effort / selectedAgent.efficiency,
      );

      if (selectedAgent.remainingCapacity >= adjustedEffort) {
        selectedAgent.remainingCapacity -= adjustedEffort;
        selectedAgent.assignedTasks.push(task.id);
        const loadAfter =
          ((selectedAgent.currentLoad + adjustedEffort) /
            selectedAgent.capacity) *
          100;

        assignments.push({
          taskId: task.id,
          agentId: selectedAgent.id,
          loadAfter: Math.round(loadAfter),
          reasoning: `${strategy} strategy selected ${selectedAgent.id}`,
        });
      } else {
        // Can't fit in current agent, try to find another
        const fittingAgent = availableAgents.find(
          (a) => a.remainingCapacity >= adjustedEffort,
        );
        if (fittingAgent) {
          fittingAgent.remainingCapacity -= adjustedEffort;
          fittingAgent.assignedTasks.push(task.id);
          assignments.push({
            taskId: task.id,
            agentId: fittingAgent.id,
            loadAfter: Math.round(
              ((fittingAgent.currentLoad + adjustedEffort) /
                fittingAgent.capacity) *
                100,
            ),
            reasoning: "Fallback to alternative agent",
          });
        } else {
          assignments.push({
            taskId: task.id,
            agentId: "UNASSIGNED",
            loadAfter: 0,
            reasoning: "Exceeds any agent's remaining capacity",
          });
        }
      }
    }

    const summary = `## Workload Balancing Complete

### Strategy: ${strategy}

### Task Assignments

| Task | Agent | Post-Load | Reasoning |
|------|-------|-----------|-----------|
${assignments
  .map(
    (a) => `| ${a.taskId} | ${a.agentId} | ${a.loadAfter}% | ${a.reasoning} |`,
  )
  .join("\n")}

---

### Final Agent Workloads

| Agent | Original | Final | Utilization |
|-------|----------|-------|-------------|
${agentWorkloads
  .map(
    (a) =>
      `| ${a.id} | ${a.currentLoad}% | ${Math.round(((a.capacity - a.remainingCapacity) / a.capacity) * 100)}% | ${a.unavailable ? "❌ Unavailable" : "✅ Available"} |`,
  )
  .join("\n")}

---

### Unassigned Tasks: ${assignments.filter((a) => a.agentId === "UNASSIGNED").length}`;

    ctx.onXmlComplete(
      `<dyad-status title="Workload Balancing Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 5: capability_mapping (125)
// ============================================================================

const capabilityMappingSchema = z.object({
  capabilityDomain: z
    .string()
    .describe(
      "The domain to map capabilities for (e.g., 'software development')",
    ),
  requiredCapabilities: z
    .array(z.string())
    .optional()
    .describe("Specific capabilities needed"),
  includeSubCapabilities: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include sub-capabilities"),
  agentCapabilities: z
    .array(
      z.object({
        agentId: z.string().describe("Agent identifier"),
        capabilities: z
          .array(z.string())
          .describe("Agent's claimed capabilities"),
      }),
    )
    .optional()
    .describe("Agent capabilities to map"),
});

export const capabilityMappingTool: ToolDefinition<
  z.infer<typeof capabilityMappingSchema>
> = {
  name: "capability_mapping",
  description: `Map and visualize the capabilities required for a task domain and how they relate to available agent capabilities. Identifies strengths, gaps, and development areas.`,
  inputSchema: capabilityMappingSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.capabilityDomain) return undefined;
    let xml = `<dyad-capability-mapping domain="${escapeXmlAttr(args.capabilityDomain)}">`;
    if (isComplete) {
      xml += "</dyad-capability-mapping>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      capabilityDomain,
      requiredCapabilities = [],
      includeSubCapabilities = true,
      agentCapabilities = [],
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Capability Mapping">Mapping capabilities for ${capabilityDomain}...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Generate capability map using AI
    const capabilityPrompt = `Map the capabilities needed for: ${capabilityDomain}

${
  requiredCapabilities.length > 0
    ? `Required capabilities: ${requiredCapabilities.join(", ")}`
    : "Identify all relevant capabilities for this domain"
}

${
  includeSubCapabilities
    ? "Include sub-capabilities and related skills"
    : "Focus on top-level capabilities only"
}

Return as JSON:
{
  "domain": "${capabilityDomain}",
  "coreCapabilities": [
    {"name": "Capability Name", "description": "...", "level": "foundational|intermediate|advanced"}
  ],
  "capabilityRelationships": [
    {"from": "capability A", "to": "capability B", "type": "requires|enables"}
  ]
}`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: capabilityPrompt,
      temperature: 0.4,
    });

    let capabilityMap: any = {
      coreCapabilities: [],
      capabilityRelationships: [],
    };
    try {
      capabilityMap = JSON.parse(text);
    } catch {
      // Use defaults if parsing fails
    }

    // If agent capabilities provided, analyze coverage
    let coverageAnalysis: any = { agentCoverage: [] };
    if (agentCapabilities.length > 0) {
      const coveragePrompt = `Analyze how these agents' capabilities map to the required capabilities:

Required: ${capabilityMap.coreCapabilities.map((c: any) => c.name).join(", ")}

Agent Capabilities:
${agentCapabilities.map((a) => `- ${a.agentId}: ${a.capabilities.join(", ")}`).join("\n")}

For each agent, identify:
1. Which required capabilities they cover
2. Gaps in their coverage
3. Overall coverage percentage

Return as JSON:
{
  "agentCoverage": [
    {"agentId": "...", "covered": [...], "gaps": [...], "coverage": 0.75}
  ]
}`;

      const { text: coverageText } = await generateText({
        model: modelClient.model,
        prompt: coveragePrompt,
        temperature: 0.3,
      });

      try {
        const parsed = JSON.parse(coverageText);
        coverageAnalysis = parsed;
      } catch {
        coverageAnalysis = { agentCoverage: [] };
      }
    }

    const summary = `## Capability Mapping Complete

### Domain: ${capabilityDomain}

#### Core Capabilities

| Capability | Level | Description |
|------------|-------|-------------|
${
  capabilityMap.coreCapabilities
    .map((c: any) => `| ${c.name} | ${c.level} | ${c.description || "-"} |`)
    .join("\n") || "| - | - | No capabilities defined |"
}

---

#### Capability Relationships

${
  capabilityMap.capabilityRelationships
    .map((r: any) => `- ${r.from} → ${r.to} (${r.type})`)
    .join("\n") || "No relationships defined"
}

---

${
  coverageAnalysis && (coverageAnalysis as any).agentCoverage?.length > 0
    ? `#### Agent Coverage
 
| Agent | Coverage | Covered | Gaps |
|-------|----------|---------|------|
${
  (coverageAnalysis.agentCoverage || [])
    .map(
      (a: any) =>
        `| ${a.agentId} | ${Math.round(a.coverage * 100)}% | ${a.covered.join(", ")} | ${a.gaps.join(", ")} |`,
    )
    .join("\n") || "| - | 0% | - | - |"
}
`
    : ""
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Capability Mapping Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 6: role_evolution (126)
// ============================================================================

const roleEvolutionSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        currentRole: z.string().describe("Current role"),
        performanceMetrics: z
          .object({
            tasksCompleted: z.number().describe("Tasks completed"),
            successRate: z.number().describe("Success rate (0-1)"),
            avgCompletionTime: z
              .number()
              .describe("Average completion time in minutes"),
            qualityScore: z.number().describe("Quality score (0-1)"),
            collaborationScore: z
              .number()
              .optional()
              .describe("Collaboration score (0-1)"),
          })
          .describe("Performance metrics"),
        tenure: z.number().describe("Time in current role (months)"),
      }),
    )
    .describe("Agents to evaluate for role evolution"),
  evolutionOptions: z
    .array(z.string())
    .optional()
    .describe(
      "Available evolution paths (e.g., 'promote', 'lateral', 'develop')",
    ),
});

export const roleEvolutionTool: ToolDefinition<
  z.infer<typeof roleEvolutionSchema>
> = {
  name: "role_evolution",
  description: `Analyze agent performance and recommend role evolution based on growth, performance trends, and team needs. Supports promotions, lateral moves, or skill development paths.`,
  inputSchema: roleEvolutionSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.agents?.length) return undefined;
    let xml = `<dyad-role-evolution agents="${args.agents.length}">`;
    if (isComplete) {
      xml += "</dyad-role-evolution>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, evolutionOptions = ["promote", "lateral", "develop"] } =
      args;

    ctx.onXmlStream(
      `<dyad-status title="Role Evolution">Analyzing ${agents.length} agents for evolution opportunities...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Calculate evolution scores for each agent
    const evolutionAnalysis = agents.map((agent) => {
      const { performanceMetrics, tenure } = agent;
      const {
        successRate,
        avgCompletionTime,
        qualityScore,
        collaborationScore = 0.5,
      } = performanceMetrics;

      // Performance score (0-100)
      const performanceScore =
        successRate * 30 +
        qualityScore * 30 +
        (1 - Math.min(1, avgCompletionTime / 120)) * 20 + // Faster = better
        collaborationScore * 20;

      // Growth indicators
      const highPerformer = performanceScore >= 75 && successRate >= 0.85;
      // Tenure bonus after 6 months
      const readyForPromotion = highPerformer && tenure >= 3;

      // Determine evolution path
      let recommendedPath: string;
      let newRole: string;
      let reasoning: string;

      if (readyForPromotion) {
        recommendedPath = "promote";
        newRole = `Senior ${agent.currentRole}`;
        reasoning =
          "Consistently high performance and sufficient tenure indicate readiness for advancement";
      } else if (performanceScore >= 60 && tenure >= 4) {
        recommendedPath = "lateral";
        newRole = `${agent.currentRole} (Specialized)`;
        reasoning =
          "Solid performance with opportunity to expand into adjacent areas";
      } else {
        recommendedPath = "develop";
        newRole = agent.currentRole;
        reasoning = "Focus on skill development before considering advancement";
      }

      return {
        agentId: agent.id,
        currentRole: agent.currentRole,
        performanceScore: Math.round(performanceScore),
        tenure,
        recommendedPath,
        newRole,
        reasoning,
        metrics: performanceMetrics,
      };
    });

    // Generate AI-powered insights
    const insightsPrompt = `Analyze these agent evolution recommendations:

${evolutionAnalysis
  .map(
    (a) =>
      `- ${a.agentId}: Current=${a.currentRole}, Score=${a.performanceScore}, Tenure=${a.tenure}mo, Recommended=${a.recommendedPath}->${a.newRole}`,
  )
  .join("\n")}

Available evolution paths: ${evolutionOptions.join(", ")}

Provide:
1. Team-level insights
2. Potential risks of the recommendations
3. Suggestions for team composition after evolution`;

    const { text: insights } = await generateText({
      model: modelClient.model,
      prompt: insightsPrompt,
      temperature: 0.3,
    });

    const summary = `## Role Evolution Analysis Complete

### Agent Evolution Recommendations

| Agent | Current Role | Score | Tenure | Evolution | New Role |
|-------|--------------|-------|--------|-----------|----------|
${evolutionAnalysis
  .map(
    (a) =>
      `| ${a.agentId} | ${a.currentRole} | ${a.performanceScore} | ${a.tenure}mo | ${a.recommendedPath} | ${a.newRole} |`,
  )
  .join("\n")}

---

### Detailed Reasoning

${evolutionAnalysis.map((a) => `**${a.agentId}**: ${a.reasoning}`).join("\n\n")}

---

### Team Insights

${insights}

---

### Evolution Summary

| Path | Count |
|------|-------|
${evolutionOptions
  .map(
    (opt) =>
      `| ${opt} | ${evolutionAnalysis.filter((a) => a.recommendedPath === opt).length} |`,
  )
  .join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-status title="Role Evolution Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// Export all tools from this file
export const agentRolesTools = {
  roleSpecializationTool,
  skillMatchingTool,
  taskDecompositionTool,
  workloadBalancingTool,
  capabilityMappingTool,
  roleEvolutionTool,
};
