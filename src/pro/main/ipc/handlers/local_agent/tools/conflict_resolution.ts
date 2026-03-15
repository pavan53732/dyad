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
// Tool 1: detect_conflicts (161)
// ============================================================================

const detectConflictsSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        goals: z.array(z.string()).describe("Agent's current goals"),
        resourceUsage: z
          .object({
            cpu: z.number().describe("CPU usage percentage"),
            memory: z.number().describe("Memory usage percentage"),
            storage: z.number().describe("Storage usage percentage"),
          })
          .optional()
          .describe("Current resource usage"),
        status: z
          .enum(["active", "idle", "waiting", "blocked"])
          .optional()
          .default("active")
          .describe("Agent status"),
      }),
    )
    .describe("Agents to check for conflicts"),
  resources: z
    .array(
      z.object({
        id: z.string().describe("Resource identifier"),
        type: z.string().describe("Resource type"),
        capacity: z.number().describe("Total capacity"),
        allocated: z.number().describe("Currently allocated"),
        claimants: z
          .array(z.string())
          .optional()
          .describe("Agents claiming this resource"),
      }),
    )
    .optional()
    .describe("Shared resources to check"),
});

export const detectConflictsTool: ToolDefinition<
  z.infer<typeof detectConflictsSchema>
> = {
  name: "detect_conflicts",
  description: `Detect conflicts between agents including resource contention, goal interference, and deadlock risks. Analyzes agent states and resource allocation to identify potential issues.`,
  inputSchema: detectConflictsSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.agents?.length) return undefined;
    let xml = `<dyad-conflict-detection agents="${args.agents.length}">`;
    if (isComplete) {
      xml += "</dyad-conflict-detection>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, resources = [] } = args;

    ctx.onXmlStream(
      `<dyad-status title="Conflict Detection">Analyzing ${agents.length} agents for potential conflicts...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Detect resource conflicts
    const resourceConflicts: {
      resourceId: string;
      claimants: string[];
      severity: "high" | "medium" | "low";
      reason: string;
    }[] = [];

    for (const resource of resources) {
      if (resource.claimants && resource.claimants.length > 1) {
        const utilization = resource.allocated / resource.capacity;
        const severity: "high" | "medium" | "low" =
          utilization > 0.9 ? "high" : utilization > 0.7 ? "medium" : "low";

        resourceConflicts.push({
          resourceId: resource.id,
          claimants: resource.claimants,
          severity,
          reason: `${resource.claimants.length} agents competing for ${resource.type} (${Math.round(utilization * 100)}% utilized)`,
        });
      }
    }

    // Detect goal conflicts using AI
    const goalConflictPrompt = `Analyze these agent goals for conflicts:

${agents.map((a) => `- Agent ${a.id}: ${a.goals.join(", ")}`).join("\n")}

Identify:
1. Direct conflicts (opposing goals)
2. Indirect conflicts (goals that interfere with each other)
3. Resource competition (goals requiring same resources)

Return as JSON array:
[{
  "type": "direct|indirect|resource",
  "agents": ["agent1", "agent2"],
  "description": "...",
  "severity": "high|medium|low"
}]`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: goalConflictPrompt,
      temperature: 0.3,
    });

    let goalConflicts: any[] = [];
    try {
      goalConflicts = JSON.parse(text);
    } catch {
      goalConflicts = [];
    }

    // Detect status-based conflicts
    const statusConflicts: any[] = [];
    const blockedAgents = agents.filter((a) => a.status === "blocked");
    const waitingAgents = agents.filter((a) => a.status === "waiting");

    if (blockedAgents.length > 0) {
      statusConflicts.push({
        type: "blocked",
        agents: blockedAgents.map((a) => a.id),
        description: `${blockedAgents.length} agent(s) blocked`,
        severity: "high",
      });
    }

    if (waitingAgents.length > 0 && blockedAgents.length > 0) {
      statusConflicts.push({
        type: "deadlock_risk",
        agents: [
          ...waitingAgents.map((a) => a.id),
          ...blockedAgents.map((a) => a.id),
        ],
        description:
          "Potential deadlock - waiting agents blocked by other agents",
        severity: "high",
      });
    }

    // Combine all conflicts
    const allConflicts = [
      ...resourceConflicts.map((c) => ({
        ...c,
        type: "resource",
      })),
      ...goalConflicts,
      ...statusConflicts,
    ];

    const highSeverity = allConflicts.filter(
      (c) => c.severity === "high",
    ).length;
    const mediumSeverity = allConflicts.filter(
      (c) => c.severity === "medium",
    ).length;
    const lowSeverity = allConflicts.filter((c) => c.severity === "low").length;

    const summary = `## Conflict Detection Complete

### Summary: ${allConflicts.length} conflicts detected

- 🔴 High: ${highSeverity}
- 🟡 Medium: ${mediumSeverity}
- 🟢 Low: ${lowSeverity}

---

### Resource Conflicts

${resourceConflicts.length > 0 ? resourceConflicts.map((c) => `**${c.resourceId}** (${c.severity}): ${c.reason} - Claimants: ${c.claimants.join(", ")}`).join("\n\n") : "✅ No resource conflicts detected"}

---

### Goal Conflicts

${goalConflicts.length > 0 ? goalConflicts.map((c) => `**${c.type}** (${c.severity}): ${c.description} - Involved: ${c.agents.join(", ")}`).join("\n\n") : "✅ No goal conflicts detected"}

---

### Status Conflicts

${statusConflicts.length > 0 ? statusConflicts.map((c) => `**${c.type}** (${c.severity}): ${c.description} - Agents: ${c.agents.join(", ")}`).join("\n\n") : "✅ No status conflicts detected"}

---

${highSeverity > 0 ? "⚠️ **Recommendation**: High-severity conflicts require immediate attention" : "✅ No critical conflicts detected"}`;

    ctx.onXmlComplete(
      `<dyad-status title="Conflict Detection Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 2: mediate_disputes (162)
// ============================================================================

const mediateDisputesSchema = z.object({
  dispute: z.object({
    id: z.string().describe("Dispute identifier"),
    parties: z.array(z.string()).describe("Parties involved"),
    issue: z.string().describe("The disputed issue"),
    positions: z
      .array(
        z.object({
          party: z.string().describe("Party identifier"),
          position: z.string().describe("Party position"),
          arguments: z.array(z.string()).describe("Supporting arguments"),
          priority: z
            .number()
            .optional()
            .default(1)
            .describe("Priority/urgency"),
        }),
      )
      .describe("Each party's position"),
  }),
  resolutionApproach: z
    .enum(["collaborative", "competitive", "compromised", "avoiding"])
    .optional()
    .default("collaborative")
    .describe("Approach to resolution"),
  constraints: z
    .array(z.string())
    .optional()
    .describe("Constraints or boundaries for resolution"),
});

export const mediateDisputesTool: ToolDefinition<
  z.infer<typeof mediateDisputesSchema>
> = {
  name: "mediate_disputes",
  description: `Mediate disputes between agents using various resolution approaches. Facilitates finding mutually acceptable solutions while respecting constraints and priorities.`,
  inputSchema: mediateDisputesSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.dispute?.id) return undefined;
    let xml = `<dyad-dispute-mediation dispute="${escapeXmlAttr(args.dispute.id)}">`;
    if (isComplete) {
      xml += "</dyad-dispute-mediation>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      dispute,
      resolutionApproach = "collaborative",
      constraints = [],
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Dispute Mediation">Mediating dispute between ${dispute.parties.length} parties...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Phase 1: Understand each position
    ctx.onXmlStream(
      `<dyad-status title="Analyzing Positions">Understanding each party's perspective...</dyad-status>`,
    );

    // Phase 2: Generate resolution options
    const resolutionPrompt = `Mediate this dispute using ${resolutionApproach} approach:

**Dispute:** ${dispute.issue}
**Parties:** ${dispute.parties.join(", ")}

Positions:
${dispute.positions
  .map(
    (p) =>
      `- ${p.party}: ${p.position} (Priority: ${p.priority})\n  Arguments: ${p.arguments.join(", ")}`,
  )
  .join("\n")}

${constraints.length > 0 ? `**Constraints:** ${constraints.join(", ")}` : ""}

Generate a resolution that:
1. Addresses core interests of all parties
2. Is fair and balanced
3. Respects the constraints
4. Is implementable

Return as JSON:
{
  "resolution": "...",
  "explanation": "...",
  "benefits": ["..."],
  "implementation": ["..."],
  "parties_agreement": {"party1": true, "party2": false}
}`;

    const { text } = await generateText({
      model: modelClient.model,
      prompt: resolutionPrompt,
      temperature: 0.4,
    });

    let resolution: any = {
      resolution: "Could not generate resolution",
      explanation: "",
      benefits: [],
      implementation: [],
      parties_agreement: {},
    };
    try {
      resolution = JSON.parse(text);
    } catch {
      // Use default
    }

    // Phase 3: Validate with parties
    const agreementLevels = Object.entries(resolution.parties_agreement || {});
    const agreedParties = agreementLevels.filter(([, v]) => v).length;
    const totalParties = agreementLevels.length;

    const summary = `## Dispute Resolution Complete

### Dispute: ${dispute.issue}

**Resolution Approach:** ${resolutionApproach}

---

### Resolution

${resolution.resolution || "No resolution generated"}

---

### Explanation

${resolution.explanation || "No explanation available"}

---

### Benefits

${(resolution.benefits || []).map((b: string) => `- ${b}`).join("\n") || "No benefits identified"}

---

### Implementation Steps

${(resolution.implementation || []).map((s: string) => `- ${s}`).join("\n") || "No implementation steps"}

---

### Party Agreement

| Party | Agreement |
|-------|-----------|
${agreementLevels
  .map(
    ([party, agreed]) =>
      `| ${party} | ${agreed ? "✅ Agreed" : "❌ Not Agreed"} |`,
  )
  .join("\n")}

---

**Agreement Rate:** ${Math.round((agreedParties / totalParties) * 100)}% (${agreedParties}/${totalParties} parties)

${
  agreedParties === totalParties
    ? "✅ Full consensus reached!"
    : agreedParties > 0
      ? "⚠️ Partial agreement - some issues remain"
      : "❌ No agreement - alternative approaches needed"
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Dispute Resolution Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 3: resource_arbitration (163)
// ============================================================================

const resourceArbitrationSchema = z.object({
  resources: z
    .array(
      z.object({
        id: z.string().describe("Resource identifier"),
        type: z.string().describe("Resource type"),
        capacity: z.number().describe("Total capacity"),
        currentAllocation: z.number().describe("Currently allocated"),
        claimants: z
          .array(
            z.object({
              agentId: z.string().describe("Claimant agent ID"),
              requested: z.number().describe("Amount requested"),
              priority: z
                .number()
                .optional()
                .default(1)
                .describe("Request priority"),
              urgency: z
                .number()
                .optional()
                .default(1)
                .describe("Urgency factor (0-1)"),
            }),
          )
          .describe("Agents requesting this resource"),
      }),
    )
    .describe("Resources to arbitrate"),
  fairnessPolicy: z
    .enum(["priority_first", "equal_share", "need_based", "round_robin"])
    .optional()
    .default("need_based")
    .describe("Fairness policy for allocation"),
});

export const resourceArbitrationTool: ToolDefinition<
  z.infer<typeof resourceArbitrationSchema>
> = {
  name: "resource_arbitration",
  description: `Arbitrate resource allocation among competing agents. Applies fairness policies to distribute limited resources while considering priorities, urgency, and historical usage.`,
  inputSchema: resourceArbitrationSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.resources?.length) return undefined;
    let xml = `<dyad-resource-arbitration resources="${args.resources.length}">`;
    if (isComplete) {
      xml += "</dyad-resource-arbitration>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { resources, fairnessPolicy = "need_based" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Resource Arbitration">Arbitrating ${resources.length} resources using ${fairnessPolicy} policy...</dyad-status>`,
    );

    // Apply fairness policy for allocation
    const allocations = resources.map((resource) => {
      const { capacity, currentAllocation, claimants } = resource;
      const available = capacity - currentAllocation;

      if (available <= 0 || claimants.length === 0) {
        return {
          resourceId: resource.id,
          type: resource.type,
          available,
          allocations: [],
          rejected: claimants.map((c) => ({
            agentId: c.agentId,
            reason: "No available capacity",
          })),
        };
      }

      let finalAllocations: ((typeof claimants)[number] & {
        allocated: number;
      })[] = [];

      switch (fairnessPolicy) {
        case "priority_first": {
          // Sort by priority then urgency
          const sorted = [...claimants].sort(
            (a, b) => b.priority * b.urgency - a.priority * a.urgency,
          );
          let remaining = available;
          for (const claim of sorted) {
            const allocation = Math.min(claim.requested, remaining);
            if (allocation > 0) {
              finalAllocations.push({ ...claim, allocated: allocation });
              remaining -= allocation;
            }
          }
          break;
        }

        case "equal_share": {
          const equalShare = Math.floor(available / claimants.length);
          finalAllocations = claimants.map((c) => ({
            ...c,
            allocated: Math.min(c.requested, equalShare),
          }));
          break;
        }

        case "need_based": {
          // Prioritize those who need it most (low current allocation)
          const totalRequested = claimants.reduce(
            (sum, c) => sum + c.requested,
            0,
          );
          const scale = available / totalRequested;
          finalAllocations = claimants.map((c) => ({
            ...c,
            allocated: Math.floor(c.requested * scale),
          }));
          break;
        }

        case "round_robin": {
          // Simple round-robin
          let remaining = available;
          claimants.forEach((c, i) => {
            if (i % 2 === 0) {
              const allocation = Math.min(c.requested, remaining);
              finalAllocations.push({ ...c, allocated: allocation });
              remaining -= allocation;
            }
          });
          // Second pass for remaining
          if (remaining > 0) {
            claimants.forEach((c, i) => {
              if (i % 2 !== 0) {
                const allocation = Math.min(c.requested, remaining);
                const existing = finalAllocations.find(
                  (a) => a.agentId === c.agentId,
                );
                if (existing) {
                  existing.allocated += allocation;
                } else {
                  finalAllocations.push({ ...c, allocated: allocation });
                }
                remaining -= allocation;
              }
            });
          }
          break;
        }

        default:
          // This default case was previously empty, now it's explicitly setting allocated to 0
          finalAllocations = claimants.map((c) => ({ ...c, allocated: 0 }));
      }

      const rejected = claimants.filter(
        (c) => !finalAllocations.find((a) => a.agentId === c.agentId),
      );

      return {
        resourceId: resource.id,
        type: resource.type,
        available,
        allocations: finalAllocations,
        rejected: rejected.map((c) => ({
          agentId: c.agentId,
          requested: c.requested,
          reason: "Allocation exceeded available capacity",
        })),
      };
    });

    const totalAllocated = allocations.reduce(
      (sum, r) =>
        sum + r.allocations.reduce((s, a) => s + (a.allocated || 0), 0),
      0,
    );
    const totalRejected = allocations.reduce(
      (sum, r) => sum + r.rejected.length,
      0,
    );

    const summary = `## Resource Arbitration Complete

### Policy: ${fairnessPolicy}

---

### Allocation Results

${allocations
  .map(
    (r) =>
      `**${r.resourceId}** (${r.type}) - Available: ${r.available}

**Granted:**
${
  r.allocations
    .map((a: any) => `- ${a.agentId}: ${a.allocated}/${a.requested}`)
    .join("\n") || "None"
}

${r.rejected.length > 0 ? `**Rejected:**\n${r.rejected.map((a) => `- ${a.agentId}: ${a.reason}`).join("\n")}` : ""}`,
  )
  .join("\n\n---\n\n")}

---

### Summary

| Metric | Value |
|--------|-------|
| Total Resources | ${resources.length} |
| Total Allocated | ${totalAllocated} |
| Total Rejected | ${totalRejected} |

${totalRejected > 0 ? "⚠️ Some requests could not be fully satisfied" : "✅ All requests satisfied"}`;

    ctx.onXmlComplete(
      `<dyad-status title="Resource Arbitration Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 4: priority_negotiation (164)
// ============================================================================

const priorityNegotiationSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().describe("Task identifier"),
        name: z.string().describe("Task name"),
        priority: z.number().describe("Current priority (1-10)"),
        agentPriorities: z
          .record(z.string(), z.number())
          .describe("Priority assigned by each agent"),
        deadline: z.string().optional().describe("Task deadline (ISO string)"),
        dependencies: z
          .array(z.string())
          .optional()
          .describe("Task dependencies"),
      }),
    )
    .describe("Tasks to negotiate priorities for"),
  agents: z.array(z.string()).describe("Agents participating in negotiation"),
  negotiationRounds: z
    .number()
    .optional()
    .default(3)
    .describe("Number of negotiation rounds"),
});

export const priorityNegotiationTool: ToolDefinition<
  z.infer<typeof priorityNegotiationSchema>
> = {
  name: "priority_negotiation",
  description: `Negotiate task priorities among agents to reach consensus. Uses iterative rounds of priority adjustment until agreement or max rounds reached.`,
  inputSchema: priorityNegotiationSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.tasks?.length) return undefined;
    let xml = `<dyad-priority-negotiation tasks="${args.tasks.length}">`;
    if (isComplete) {
      xml += "</dyad-priority-negotiation>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { tasks, agents, negotiationRounds = 3 } = args;

    ctx.onXmlStream(
      `<dyad-status title="Priority Negotiation">Negotiating priorities across ${agents.length} agents...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Current priorities (start with average)
    let currentPriorities = tasks.map((t) => {
      const agentPriors = Object.values(t.agentPriorities || {});
      const avgPriority =
        agentPriors.length > 0
          ? agentPriors.reduce((a, b) => a + b, 0) / agentPriors.length
          : t.priority;
      return {
        taskId: t.id,
        taskName: t.name,
        priority: Math.round(avgPriority),
        deadline: t.deadline,
        dependencies: t.dependencies || [],
        history: [{ round: 0, priority: Math.round(avgPriority) }],
      };
    });

    // Iterative negotiation
    for (let round = 1; round <= negotiationRounds; round++) {
      ctx.onXmlStream(
        `<dyad-status title="Negotiation Round ${round}/${negotiationRounds}">Adjusting priorities...</dyad-status>`,
      );

      // Use AI to adjust priorities considering dependencies and deadlines
      const negotiationPrompt = `Round ${round} of priority negotiation for ${negotiationRounds} rounds.

Current priorities:
${currentPriorities
  .map(
    (t) =>
      `- ${t.taskName}: ${t.priority} ${t.dependencies.length > 0 ? `(depends on: ${t.dependencies.join(", ")})` : ""}`,
  )
  .join("\n")}

Agent perspectives:
${tasks
  .map(
    (t) =>
      `${t.id}: ${Object.entries(t.agentPriorities || {})
        .map(([a, p]) => `${a}: ${p}`)
        .join(", ")}`,
  )
  .join("\n")}

Adjust priorities to:
1. Respect dependencies (dependencies should have lower priority than what depends on them)
2. Consider any deadlines
3. Move toward consensus

Return as JSON array of adjusted priorities:
[{ "taskId": "...", "newPriority": 5 }]`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: negotiationPrompt,
        temperature: 0.3,
      });

      try {
        const adjustments = JSON.parse(text);
        currentPriorities = currentPriorities.map((t) => {
          const adjustment = adjustments.find(
            (a: any) => a.taskId === t.taskId,
          );
          return adjustment
            ? {
                ...t,
                priority: adjustment.newPriority,
                history: [
                  ...t.history,
                  { round, priority: adjustment.newPriority },
                ],
              }
            : t;
        });
      } catch {
        // Continue with current priorities
      }
    }

    // Final consensus check
    const priorityVariance = currentPriorities.map((t) => {
      const priorities = t.history.map((h) => h.priority);
      const variance =
        priorities.length > 1
          ? Math.max(...priorities) - Math.min(...priorities)
          : 0;
      return {
        taskId: t.taskId,
        variance,
        converged: variance <= 2,
      };
    });

    const summary = `## Priority Negotiation Complete

### Final Priorities (after ${negotiationRounds} rounds)

| Task | Priority | Dependencies | Status |
|------|----------|---------------|--------|
${currentPriorities
  .map(
    (t) =>
      `| ${t.taskName} | ${t.priority} | ${t.dependencies.join(", ") || "-"} | ${priorityVariance.find((v) => v.taskId === t.taskId)?.converged ? "✅ Converged" : "⚠️ Diverged"} |`,
  )
  .join("\n")}

---

### Priority History

${currentPriorities
  .map(
    (t) =>
      `**${t.taskName}**: ${t.history.map((h) => `R${h.round}:${h.priority}`).join(" → ")}`,
  )
  .join("\n")}

---

### Consensus Status

| Converged | Diverged |
|-----------|----------|
${`| ${priorityVariance.filter((v) => v.converged).length} | ${priorityVariance.filter((v) => !v.converged).length} |`}

${
  priorityVariance.every((v) => v.converged)
    ? "✅ Full consensus achieved!"
    : "⚠️ Some priorities did not fully converge"
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Priority Negotiation Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 5: deadlock_resolution (165)
// ============================================================================

const deadlockResolutionSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        state: z
          .enum(["running", "waiting", "blocked", "holding"])
          .describe("Agent state"),
        waitingFor: z
          .array(z.string())
          .optional()
          .describe("Resources/agents being waited for"),
        holding: z
          .array(z.string())
          .optional()
          .describe("Resources currently held"),
      }),
    )
    .describe("Agents in the system"),
  resources: z.array(z.string()).optional().describe("List of all resources"),
  resolutionStrategy: z
    .enum(["abort", "rollback", "preempt", "wait_die", "wound_wait"])
    .optional()
    .default("wound_wait")
    .describe("Deadlock resolution strategy"),
});

export const deadlockResolutionTool: ToolDefinition<
  z.infer<typeof deadlockResolutionSchema>
> = {
  name: "deadlock_resolution",
  description: `Detect and resolve deadlocks between agents using various strategies. Identifies circular wait conditions and applies resolution techniques.`,
  inputSchema: deadlockResolutionSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.agents?.length) return undefined;
    let xml = `<dyad-deadlock-resolution agents="${args.agents.length}">`;
    if (isComplete) {
      xml += "</dyad-deadlock-resolution>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, resolutionStrategy = "wound_wait" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Deadlock Resolution">Analyzing deadlock conditions...</dyad-status>`,
    );

    // Build wait graph
    interface WaitEdge {
      from: string;
      to: string;
    }

    const waitGraph: WaitEdge[] = [];
    agents.forEach((agent) => {
      (agent.waitingFor || []).forEach((resource) => {
        waitGraph.push({ from: agent.id, to: resource });
      });
    });

    // Detect cycles using DFS
    const detectCycles = (graph: WaitEdge[]): string[][] => {
      const adj: Record<string, string[]> = {};
      graph.forEach((edge) => {
        if (!adj[edge.from]) adj[edge.from] = [];
        adj[edge.from].push(edge.to);
      });

      const cycles: string[][] = [];
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const dfs = (node: string, path: string[]) => {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        const neighbors = adj[node] || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            const result = dfs(neighbor, [...path]);
            if (result) cycles.push(result);
          } else if (recursionStack.has(neighbor)) {
            // Found cycle
            const cycleStart = path.indexOf(neighbor);
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }

        recursionStack.delete(node);
        return null;
      };

      Object.keys(adj).forEach((node) => {
        if (!visited.has(node)) {
          dfs(node, []);
        }
      });

      return cycles;
    };

    const cycles = detectCycles(waitGraph);

    if (cycles.length === 0) {
      const summary = `## Deadlock Resolution Complete

✅ **No Deadlock Detected**

The wait graph contains no cycles. The system is in a safe state.

---

### Wait Graph

${waitGraph.length > 0 ? waitGraph.map((e) => `${e.from} → ${e.to}`).join("\n") : "No wait edges"}

---

### System Status: **SAFE**`;

      ctx.onXmlComplete(
        `<dyad-status title="No Deadlock">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    // Deadlock exists - apply resolution strategy
    ctx.onXmlStream(
      `<dyad-status title="Deadlock Detected">Applying ${resolutionStrategy} resolution...</dyad-status>`,
    );

    const resolutions: {
      agentId: string;
      action: string;
      reasoning: string;
    }[] = [];

    // Get agent priorities (lower number = higher priority)
    const agentPriority: Record<string, number> = {};
    agents.forEach((a, i) => {
      agentPriority[a.id] = i;
    });

    // Process each cycle
    for (const cycle of cycles) {
      const uniqueAgents = [
        ...new Set(cycle.filter((c) => agents.some((a) => a.id === c))),
      ];

      switch (resolutionStrategy) {
        case "abort":
          // Abort one agent in the cycle
          const abortCandidate = uniqueAgents[0];
          resolutions.push({
            agentId: abortCandidate,
            action: "ABORT",
            reasoning: "Selected as abort candidate (first in cycle)",
          });
          break;

        case "rollback":
          // Rollback one agent
          const rollbackCandidate = uniqueAgents[0];
          resolutions.push({
            agentId: rollbackCandidate,
            action: "ROLLBACK",
            reasoning: "Selected for state rollback",
          });
          break;

        case "preempt":
          // Preempt resources from youngest agent
          const preemptCandidates = uniqueAgents.sort(
            (a, b) => agentPriority[b] - agentPriority[a],
          );
          resolutions.push({
            agentId: preemptCandidates[0],
            action: "PREEMPT",
            reasoning: "Lowest priority - preempt resources",
          });
          break;

        case "wait_die":
        case "wound_wait": {
          // Younger agent waits/dies, older preempts
          const sorted = uniqueAgents.sort(
            (a, b) => agentPriority[a] - agentPriority[b],
          );
          const younger = sorted[sorted.length - 1];
          const older = sorted[0];
          resolutions.push({
            agentId: younger,
            action: resolutionStrategy === "wound_wait" ? "WOUND" : "DIE",
            reasoning: `${resolutionStrategy === "wound_wait" ? "Younger" : "Older"} agent forced to ${resolutionStrategy === "wound_wait" ? "release" : "wait"}`,
          });
          resolutions.push({
            agentId: older,
            action: resolutionStrategy === "wound_wait" ? "WAIT" : "CONTINUE",
            reasoning: "Higher priority - continues",
          });
          break;
        }
      }
    }

    const summary = `## Deadlock Resolution Complete

⚠️ **Deadlock Detected**

### Detected Cycles

${cycles.map((c) => `Cycle: ${c.join(" → ")}`).join("\n")}

---

### Resolution Strategy: ${resolutionStrategy}

| Agent | Action | Reasoning |
|-------|--------|-----------|
${resolutions
  .map((r) => `| ${r.agentId} | ${r.action} | ${r.reasoning} |`)
  .join("\n")}

---

### After Resolution

The deadlock should be broken. Re-run detection to verify.

---

### Strategy Explanation

${resolutionStrategy === "abort" ? "Terminates one agent to break the cycle" : resolutionStrategy === "rollback" ? "Rolls back one agent's state" : resolutionStrategy === "preempt" ? "Forcibly takes resources from lowest priority agent" : resolutionStrategy === "wound_wait" ? "Older agents wound (force release) younger agents" : "Younger agents die (restart) while older continue"}


`;

    ctx.onXmlComplete(
      `<dyad-status title="Deadlock Resolved">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 6: fairness_optimization (166)
// ============================================================================

const fairnessOptimizationSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        resourceUsage: z
          .record(z.string(), z.number())
          .describe("Current resource usage by type"),
        requests: z
          .record(z.string(), z.number())
          .describe("Pending requests by resource type"),
        historicalUsage: z
          .array(z.number())
          .optional()
          .describe("Historical usage over time periods"),
      }),
    )
    .describe("Agents to optimize fairness for"),
  resources: z
    .array(
      z.object({
        id: z.string().describe("Resource identifier"),
        type: z.string().describe("Resource type"),
        totalCapacity: z.number().describe("Total capacity"),
        currentAllocation: z.number().describe("Currently allocated"),
      }),
    )
    .describe("Available resources"),
  fairnessMetric: z
    .enum(["egalitarian", "proportional", "need_based", "sufficiency"])
    .optional()
    .default("proportional")
    .describe("Fairness metric to optimize"),
});

export const fairnessOptimizationTool: ToolDefinition<
  z.infer<typeof fairnessOptimizationSchema>
> = {
  name: "fairness_optimization",
  description: `Optimize resource distribution for fairness using various metrics. Ensures equitable allocation considering historical usage, current needs, and agent characteristics.`,
  inputSchema: fairnessOptimizationSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.agents?.length) return undefined;
    let xml = `<dyad-fairness-optimization agents="${args.agents.length}">`;
    if (isComplete) {
      xml += "</dyad-fairness-optimization>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, resources, fairnessMetric = "proportional" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Fairness Optimization">Optimizing for ${fairnessMetric} fairness...</dyad-status>`,
    );

    // Calculate fairness scores
    const fairnessAnalysis = resources.map((resource) => {
      const available = resource.totalCapacity - resource.currentAllocation;
      const resourceType = resource.type;

      // Get requests for this resource type
      const agentRequests = agents.map((agent) => ({
        id: agent.id,
        requested: agent.requests[resourceType] || 0,
        currentUsage: agent.resourceUsage[resourceType] || 0,
        historicalAvg:
          agent.historicalUsage && agent.historicalUsage.length > 0
            ? agent.historicalUsage.reduce((a, b) => a + b, 0) /
              agent.historicalUsage.length
            : agent.resourceUsage[resourceType] || 0,
      }));

      let allocations: {
        agentId: string;
        allocated: number;
        fairnessScore: number;
      }[] = [];

      switch (fairnessMetric) {
        case "egalitarian": {
          // Equal share to each
          const equalShare = Math.floor(available / agents.length);
          allocations = agentRequests.map((a) => ({
            agentId: a.id,
            allocated: Math.min(a.requested, equalShare),
            fairnessScore: 1,
          }));
          break;
        }

        case "proportional": {
          // Proportional to requests
          const totalRequested = agentRequests.reduce(
            (sum, a) => sum + a.requested,
            0,
          );
          allocations = agentRequests.map((a) => {
            const allocated =
              totalRequested > 0
                ? Math.floor((a.requested / totalRequested) * available)
                : 0;
            return {
              agentId: a.id,
              allocated,
              fairnessScore:
                a.requested > 0 ? allocated / (a.requested || 1) : 1,
            };
          });
          break;
        }

        case "need_based": {
          // Based on historical need
          const totalHistorical = agentRequests.reduce(
            (sum, a) => sum + a.historicalAvg,
            0,
          );
          allocations = agentRequests.map((a) => {
            const allocated =
              totalHistorical > 0
                ? Math.min(
                    a.requested,
                    Math.floor((a.historicalAvg / totalHistorical) * available),
                  )
                : 0;
            return {
              agentId: a.id,
              allocated,
              fairnessScore:
                a.historicalAvg > 0
                  ? Math.min(1, allocated / (a.requested || 1))
                  : 1,
            };
          });
          break;
        }

        case "sufficiency": {
          // Ensure everyone gets minimum viable amount
          const minSufficient = Math.floor(available * 0.1); // 10% minimum
          let remaining = available;
          allocations = agentRequests
            .sort((a, b) => b.historicalAvg - a.historicalAvg)
            .map((a) => {
              const allocation = Math.min(
                a.requested,
                minSufficient,
                remaining,
              );
              remaining -= allocation;
              return {
                agentId: a.id,
                allocated: allocation,
                fairnessScore: a.requested > 0 ? allocation / a.requested : 1,
              };
            });
          break;
        }
      }

      // Calculate Gini coefficient for this resource
      const allocatedValues = allocations
        .map((a) => a.allocated)
        .sort((a, b) => a - b);
      const n = allocatedValues.length;
      const mean = allocatedValues.reduce((a, b) => a + b, 0) / n;
      const gini =
        n > 0 && mean > 0
          ? allocatedValues.reduce(
              (sum, val, i) => sum + (2 * (i + 1) - n - 1) * val,
              0,
            ) /
            (n * n * mean)
          : 0;

      return {
        resource: resource.id,
        type: resource.type,
        available,
        allocations,
        giniCoefficient: Math.round(Math.abs(gini) * 100) / 100,
      };
    });

    // Overall fairness score
    const avgGini =
      fairnessAnalysis.reduce((sum, r) => sum + r.giniCoefficient, 0) /
      fairnessAnalysis.length;
    const fairnessScore = Math.round((1 - avgGini) * 100);

    const summary = `## Fairness Optimization Complete

### Fairness Metric: ${fairnessMetric}
### Overall Fairness Score: ${fairnessScore}/100

${fairnessScore >= 80 ? "✅ Excellent fairness" : fairnessScore >= 60 ? "⚠️ Moderate fairness" : "❌ Low fairness - consider rebalancing"}

---

### Resource Allocation

${fairnessAnalysis
  .map(
    (r) =>
      `**${r.resource}** (${r.type}) - Available: ${r.available}, Gini: ${r.giniCoefficient}

| Agent | Allocated | Fairness |
|-------|-----------|----------|
${r.allocations
  .map(
    (a) =>
      `| ${a.agentId} | ${a.allocated} | ${Math.round(a.fairnessScore * 100)}% |`,
  )
  .join("\n")}`,
  )
  .join("\n\n---\n\n")}

---

### Fairness Explanation

${fairnessMetric === "egalitarian" ? "Equal share distribution - each agent receives the same amount" : fairnessMetric === "proportional" ? "Resources allocated proportionally to requests" : fairnessMetric === "need_based" ? "Resources allocated based on historical needs" : "Ensures all agents receive minimum viable allocation"}


`;

    ctx.onXmlComplete(
      `<dyad-status title="Fairness Optimization Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// Export all tools from this file
export const conflictResolutionTools = {
  detectConflictsTool,
  mediateDisputesTool,
  resourceArbitrationTool,
  priorityNegotiationTool,
  deadlockResolutionTool,
  fairnessOptimizationTool,
};
