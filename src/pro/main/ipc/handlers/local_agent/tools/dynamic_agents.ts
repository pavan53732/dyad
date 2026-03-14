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

// Import core tools for sub-agents
import { writeFileTool } from "./write_file";
import { readFileTool } from "./read_file";
import { listFilesTool } from "./list_files";
import { searchReplaceTool } from "./search_replace";

// In-memory agent registry (in production this would be persisted)
const agentRegistry = new Map<
  string,
  {
    id: string;
    type: string;
    capabilities: string[];
    createdAt: string;
    status: "active" | "idle" | "failed";
    parentId?: string;
  }
>();

// ============================================================================
// Tool 1: spawn_agent (201)
// ============================================================================

const spawnAgentSchema = z.object({
  agentType: z
    .enum(["researcher", "coder", "reviewer", "tester", "general"])
    .describe("Type of agent to spawn"),
  task: z.string().describe("Task for the spawned agent"),
  capabilities: z
    .array(z.string())
    .optional()
    .describe("Additional capabilities for the agent"),
  persistence: z
    .enum(["ephemeral", "persistent"])
    .optional()
    .default("ephemeral")
    .describe("Whether agent persists after task completion"),
});

export const spawnAgentTool: ToolDefinition<z.infer<typeof spawnAgentSchema>> =
  {
    name: "spawn_agent",
    description: `Dynamically spawn a new specialized agent to handle a specific task. The agent can be configured with different types (researcher, coder, reviewer, tester) and custom capabilities. Useful for parallelizing work or delegating subtasks to specialized agents.`,
    inputSchema: spawnAgentSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) =>
      `Spawn ${args.agentType} agent for: "${args.task.substring(0, 30)}..."`,

    buildXml: (args, isComplete) => {
      if (!args.task) return undefined;
      let xml = `<dyad-spawn-agent type="${args.agentType}">`;
      if (isComplete) {
        xml += "</dyad-spawn-agent>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const {
        agentType,
        task,
        capabilities = [],
        persistence = "ephemeral",
      } = args;

      const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      ctx.onXmlStream(
        `<dyad-status title="Spawning Agent">Creating ${agentType} agent: ${agentId}</dyad-status>`,
      );

      // Register the agent
      const baseCapabilities: Record<string, string[]> = {
        researcher: ["web_search", "web_fetch", "code_search"],
        coder: ["write_file", "read_file", "search_replace", "execute_command"],
        reviewer: ["read_file", "grep", "code_search"],
        tester: ["execute_command", "write_file", "read_file"],
        general: ["read_file", "write_file", "list_files"],
      };

      agentRegistry.set(agentId, {
        id: agentId,
        type: agentType,
        capabilities: [...(baseCapabilities[agentType] || []), ...capabilities],
        createdAt: new Date().toISOString(),
        status: "active",
      });

      const settings = readSettings();
      const { modelClient } = await getModelClient(
        settings.selectedModel || "gpt-4o",
        settings,
      );

      // Define agent personality and instructions based on type
      const agentPersonalities: Record<string, string> = {
        researcher:
          "You are a research specialist. Focus on finding relevant information, analyzing it thoroughly, and providing comprehensive summaries with sources.",
        coder:
          "You are a coding specialist. Focus on writing clean, efficient, well-documented code. Follow best practices and consider edge cases.",
        reviewer:
          "You are a code review specialist. Focus on identifying bugs, security issues, code smells, and improvement opportunities. Be thorough but constructive.",
        tester:
          "You are a testing specialist. Focus on writing comprehensive tests, identifying edge cases, and ensuring code reliability.",
        general:
          "You are a general-purpose assistant. Handle tasks efficiently and thoroughly.",
      };

      // Execute task with spawned agent
      const agentPrompt = `${agentPersonalities[agentType]}

Task: ${task}

You have access to file operations and code search tools. Complete the task and provide a summary of your work.`;

      const tools =
        agentType === "coder" || agentType === "tester"
          ? {
              write_file: {
                description: writeFileTool.description,
                inputSchema: writeFileTool.inputSchema as any,
                execute: async (toolArgs: any) =>
                  writeFileTool.execute(toolArgs, ctx),
              },
              read_file: {
                description: readFileTool.description,
                inputSchema: readFileTool.inputSchema as any,
                execute: async (toolArgs: any) =>
                  readFileTool.execute(toolArgs, ctx),
              },
              list_files: {
                description: listFilesTool.description,
                inputSchema: listFilesTool.inputSchema as any,
                execute: async (toolArgs: any) =>
                  listFilesTool.execute(toolArgs, ctx),
              },
              search_replace: {
                description: searchReplaceTool.description,
                inputSchema: searchReplaceTool.inputSchema as any,
                execute: async (toolArgs: any) =>
                  searchReplaceTool.execute(toolArgs, ctx),
              },
            }
          : {};

      const { text: result } = await generateText({
        model: modelClient.model,
        system: agentPrompt,
        prompt: `Complete this task: ${task}`,
        tools: tools as any,
      });

      // Update agent status
      const agent = agentRegistry.get(agentId);
      if (agent) {
        agent.status = persistence === "persistent" ? "idle" : "failed"; // Mark for cleanup if ephemeral
        if (persistence === "persistent") {
          ctx.onXmlStream(
            `<dyad-status title="Agent Spawned">${agentId} is now idle and available</dyad-status>`,
          );
        }
      }

      const summary = `## Agent Spawn Complete

**Agent ID:** ${agentId}
**Type:** ${agentType}
**Persistence:** ${persistence}
**Task:** ${task}

---

### Agent Output

${result}

---

${persistence === "persistent" ? "✅ Agent saved to registry for future use" : "⚠️ Agent will be cleaned up after this task"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Agent Task Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    },
  };

// ============================================================================
// Tool 2: clone_agent (202)
// ============================================================================

const cloneAgentSchema = z.object({
  sourceAgentId: z.string().describe("ID of the agent to clone"),
  modifications: z
    .object({
      capabilities: z
        .array(z.string())
        .optional()
        .describe("Additional capabilities to add"),
      task: z.string().optional().describe("New task for the cloned agent"),
    })
    .optional()
    .describe("Modifications to apply to the clone"),
});

export const cloneAgentTool: ToolDefinition<z.infer<typeof cloneAgentSchema>> =
  {
    name: "clone_agent",
    description: `Clone an existing agent with the same capabilities and configuration. The clone can be modified with additional capabilities or a different task. Useful for creating multiple workers from a template or for backup agents.`,
    inputSchema: cloneAgentSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => `Clone agent: ${args.sourceAgentId}`,

    buildXml: (args, isComplete) => {
      if (!args.sourceAgentId) return undefined;
      let xml = `<dyad-clone-agent source="${escapeXmlAttr(args.sourceAgentId)}">`;
      if (isComplete) {
        xml += "</dyad-clone-agent>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const { sourceAgentId, modifications } = args;

      const sourceAgent = agentRegistry.get(sourceAgentId);
      if (!sourceAgent) {
        // If not in runtime registry, create a template
        ctx.onXmlStream(
          `<dyad-status title="Creating Template Agent">Source not in registry, creating template</dyad-status>`,
        );
      }

      const cloneId = `agent_clone_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      ctx.onXmlStream(
        `<dyad-status title="Cloning Agent">Creating clone: ${cloneId} from ${sourceAgentId}</dyad-status>`,
      );

      // Create clone with merged capabilities
      const clonedCapabilities = sourceAgent
        ? [...sourceAgent.capabilities, ...(modifications?.capabilities || [])]
        : modifications?.capabilities || [];

      agentRegistry.set(cloneId, {
        id: cloneId,
        type: sourceAgent?.type || "general",
        capabilities: clonedCapabilities,
        createdAt: new Date().toISOString(),
        status: "idle",
        parentId: sourceAgentId,
      });

      const summary = `## Agent Cloned Successfully

**Original Agent:** ${sourceAgentId}
**Clone ID:** ${cloneId}
**Type:** ${sourceAgent?.type || "general"}

**Capabilities:** ${clonedCapabilities.join(", ") || "default"}

${
  modifications?.task
    ? `**New Task:** ${modifications.task}`
    : "**Task:** Inherited from source"
}

---

✅ Clone registered and ready to use`;

      ctx.onXmlComplete(
        `<dyad-status title="Clone Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    },
  };

// ============================================================================
// Tool 3: swarm_coordinate (203)
// ============================================================================

const swarmCoordinateSchema = z.object({
  task: z.string().describe("Task for the swarm to accomplish"),
  numAgents: z
    .number()
    .min(2)
    .max(20)
    .default(5)
    .describe("Number of agents in the swarm"),
  coordinationMode: z
    .enum(["parallel", "sequential", "hierarchical", "emergent"])
    .default("parallel")
    .describe("How agents coordinate their work"),
  agentTypes: z
    .array(z.enum(["researcher", "coder", "reviewer", "tester", "general"]))
    .optional()
    .describe("Types of agents to include"),
});

export const swarmCoordinateTool: ToolDefinition<
  z.infer<typeof swarmCoordinateSchema>
> = {
  name: "swarm_coordinate",
  description: `Coordinate a swarm of agents working together on a task. Supports different coordination modes: parallel (all work simultaneously), sequential (pass results to next), hierarchical (leader coordinates workers), or emergent (agents self-organize).`,
  inputSchema: swarmCoordinateSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Coordinate swarm of ${args.numAgents} agents for: "${args.task.substring(0, 30)}..."`,

  buildXml: (args, isComplete) => {
    if (!args.task) return undefined;
    let xml = `<dyad-swarm-coordinate mode="${args.coordinationMode}" count="${args.numAgents}">`;
    if (isComplete) {
      xml += "</dyad-swarm-coordinate>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      task,
      numAgents = 5,
      coordinationMode = "parallel",
      agentTypes,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Swarm Coordination">Initializing ${numAgents} agents in ${coordinationMode} mode...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Generate agent types if not specified
    const types =
      agentTypes ||
      Array.from(
        { length: numAgents },
        () =>
          ["coder", "reviewer", "researcher"][Math.floor(Math.random() * 3)],
      );

    // Create swarm agents
    const swarmAgents = Array.from({ length: numAgents }, (_, i) => ({
      id: `swarm_${Date.now()}_${i}`,
      type: types[i % types.length],
      status: "pending" as const,
    }));

    let swarmResult: string;

    if (coordinationMode === "parallel") {
      // All agents work on the task simultaneously
      ctx.onXmlStream(
        `<dyad-status title="Parallel Swarm">All agents working simultaneously...</dyad-status>`,
      );

      const agentPromises = swarmAgents.map(async (agent) => {
        const prompt = `You are Agent ${agent.id} (${agent.type}) in a parallel swarm.

Task: ${task}

Work on this task independently and provide your contribution.`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.4,
        });

        return { agentId: agent.id, type: agent.type, result: text };
      });

      const results = await Promise.all(agentPromises);

      // Aggregate results
      const aggregationPrompt = `Aggregate results from ${numAgents} parallel agents working on: ${task}

Results:
${results.map((r) => `## ${r.agentId} (${r.type})\n\n${r.result}`).join("\n\n---\n\n")}

Synthesize into a coherent final result.`;

      const { text: aggregated } = await generateText({
        model: modelClient.model,
        prompt: aggregationPrompt,
        temperature: 0.3,
      });

      swarmResult = aggregated;
    } else if (coordinationMode === "sequential") {
      // Agents work one after another, passing results
      ctx.onXmlStream(
        `<dyad-status title="Sequential Swarm">Agents working in sequence...</dyad-status>`,
      );

      let accumulatedWork = "";
      for (const agent of swarmAgents) {
        const prompt = `You are Agent ${agent.id} (${agent.type}) in a sequential swarm.

${
  accumulatedWork ? `Previous work:\n${accumulatedWork}\n\n---\n\n` : ""
}Task: ${task}

Build on the previous work and continue.`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.4,
        });

        accumulatedWork = text;
      }

      swarmResult = accumulatedWork;
    } else if (coordinationMode === "hierarchical") {
      // One leader coordinates workers
      ctx.onXmlStream(
        `<dyad-status title="Hierarchical Swarm">Leader coordinating workers...</dyad-status>`,
      );

      const leader = swarmAgents[0];
      const workers = swarmAgents.slice(1);

      // Leader assigns tasks
      const assignmentPrompt = `You are the swarm leader (${leader.type}). Assign tasks to ${workers.length} workers for: ${task}

Workers: ${workers.map((w) => `${w.id} (${w.type})`).join(", ")}

Provide task assignments.`;

      const { text: assignments } = await generateText({
        model: modelClient.model,
        prompt: assignmentPrompt,
        temperature: 0.4,
      });

      // Workers execute in parallel
      const workerPromises = workers.map(async (worker) => {
        const prompt = `You are Agent ${worker.id} (${worker.type}).

Task assignment: ${assignments}

Execute your assigned portion.`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.4,
        });

        return { agentId: worker.id, result: text };
      });

      const workerResults = await Promise.all(workerPromises);

      // Leader synthesizes
      const synthesisPrompt = `As the swarm leader, synthesize the results from your workers:

Task: ${task}

Worker Results:
${workerResults.map((r) => `${r.agentId}: ${r.result}`).join("\n\n")}

Provide the final integrated result.`;

      const { text: final } = await generateText({
        model: modelClient.model,
        prompt: synthesisPrompt,
        temperature: 0.3,
      });

      swarmResult = final;
    } else {
      // Emergent - agents self-organize
      ctx.onXmlStream(
        `<dyad-status title="Emergent Swarm">Agents self-organizing...</dyad-status>`,
      );

      // Run multiple rounds of self-organization
      let currentState = "";
      for (let round = 1; round <= 3; round++) {
        const emergentPrompt = `Round ${round} of emergent swarm coordination for: ${task}

${currentState ? `Current state:\n${currentState}\n\n` : ""}${swarmAgents.length} agents: ${swarmAgents.map((a) => `${a.id}(${a.type})`).join(", ")}

Let agents self-organize and contribute.`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt: emergentPrompt,
          temperature: 0.5,
        });

        currentState = text;
      }

      swarmResult = currentState;
    }

    const summary = `## Swarm Coordination Complete

**Task:** ${task}
**Mode:** ${coordinationMode}
**Agents:** ${numAgents}

---

### Final Result

${swarmResult}

---

✅ Swarm task completed`;

    ctx.onXmlComplete(
      `<dyad-status title="Swarm Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 4: agent_failover (208)
// ============================================================================

const agentFailoverSchema = z.object({
  failedAgentId: z.string().describe("ID of the failed agent"),
  task: z.string().describe("Task that the failed agent was working on"),
  reason: z.string().optional().describe("Reason for failure"),
  recoveryStrategy: z
    .enum(["retry", "replace", "escalate", "split"])
    .default("replace")
    .describe("Strategy to recover from failure"),
});

export const agentFailoverTool: ToolDefinition<
  z.infer<typeof agentFailoverSchema>
> = {
  name: "agent_failover",
  description: `Handle agent failure by implementing recovery strategies. Can retry the failed agent, replace with a new agent, escalate to human review, or split the task among multiple agents. Maintains task continuity when agents fail.`,
  inputSchema: agentFailoverSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Handle failover for failed agent: ${args.failedAgentId}`,

  buildXml: (args, isComplete) => {
    if (!args.failedAgentId) return undefined;
    let xml = `<dyad-failover agent="${escapeXmlAttr(args.failedAgentId)}" strategy="${args.recoveryStrategy}">`;
    if (isComplete) {
      xml += "</dyad-failover>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { failedAgentId, task, reason, recoveryStrategy = "replace" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Agent Failover">Handling failure of ${failedAgentId} using ${recoveryStrategy} strategy...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    let recoveryResult: string;
    let newAgentId: string | null = null;

    if (recoveryStrategy === "retry") {
      // Simple retry with same agent
      ctx.onXmlStream(
        `<dyad-status title="Retry Strategy">Retrying task with agent...</dyad-status>`,
      );

      const { text } = await generateText({
        model: modelClient.model,
        prompt: `Retry this task (previous attempt failed${reason ? `: ${reason}` : ""}):

Task: ${task}

Complete the task successfully.`,
        temperature: 0.3,
      });

      recoveryResult = text;
    } else if (recoveryStrategy === "replace") {
      // Spawn replacement agent
      newAgentId = `replacement_${Date.now()}`;

      ctx.onXmlStream(
        `<dyad-status title="Replace Strategy">Spawning replacement agent: ${newAgentId}</dyad-status>`,
      );

      const { text } = await generateText({
        model: modelClient.model,
        prompt: `A previous agent failed on this task${reason ? `: ${reason}` : ""}. You are the replacement agent.

Original Task: ${task}

Complete the task from scratch.`,
        temperature: 0.4,
      });

      recoveryResult = text;
    } else if (recoveryStrategy === "escalate") {
      // Escalate to human review
      ctx.onXmlStream(
        `<dyad-status title="Escalate Strategy">Preparing escalation report...</dyad-status>`,
      );

      const escalationReport = `## Agent Failure Escalation

**Failed Agent:** ${failedAgentId}
**Reason:** ${reason || "Unknown"}
**Task:** ${task}

### Failure Analysis

The agent encountered an issue that could not be automatically resolved. Human intervention may be required to:
1. Diagnose the root cause
2. Provide additional context or resources
3. Approve alternative approaches

Please review and either:
- Provide guidance for retry
- Modify the task requirements
- Assign to a different agent type`;

      recoveryResult = escalationReport;
    } else {
      // Split task among multiple agents
      ctx.onXmlStream(
        `<dyad-status title="Split Strategy">Dividing task among multiple agents...</dyad-status>`,
      );

      // Decompose task
      const decompositionPrompt = `Decompose this failed task into 3 independent subtasks that can be attempted in parallel:

Task: ${task}

Provide a JSON array of subtasks:
[{"id": 1, "description": "...", "priority": "high/medium/low"}, ...]`;

      const { text: decomposition } = await generateText({
        model: modelClient.model,
        prompt: decompositionPrompt,
        temperature: 0.3,
      });

      // Try each subtask
      const subtaskMatch = decomposition.match(/\[[\s\S]*\]/);
      const subtasks = subtaskMatch
        ? JSON.parse(subtaskMatch[0])
        : [{ id: 1, description: task, priority: "high" }];

      const subtaskPromises = subtasks.slice(0, 3).map(async (subtask: any) => {
        const { text } = await generateText({
          model: modelClient.model,
          prompt: `Attempt subtask: ${subtask.description}`,
          temperature: 0.4,
        });

        return { subtaskId: subtask.id, result: text, success: true };
      });

      const subtaskResults = await Promise.allSettled(subtaskPromises);

      const successfulResults = subtaskResults
        .filter((r) => r.status === "fulfilled")
        .map((r: any) => r.value);

      recoveryResult = `## Task Recovery via Split Strategy

Original task: ${task}
Failed agent: ${failedAgentId}

### Completed Subtasks

${successfulResults
  .map((r) => `**Subtask ${r.subtaskId}:** ${r.result}`)
  .join("\n\n")}

### Summary

Successfully recovered ${successfulResults.length}/${subtasks.length} portions of the task.`;
    }

    // Update registry
    const failedAgent = agentRegistry.get(failedAgentId);
    if (failedAgent) {
      failedAgent.status = "failed";
    }

    const summary = `## Agent Failover Complete

**Failed Agent:** ${failedAgentId}
**Recovery Strategy:** ${recoveryStrategy}
${reason ? `**Failure Reason:** ${reason}` : ""}

---

### Recovery Result

${recoveryResult}

---

${newAgentId ? `✅ Replacement agent ${newAgentId} available` : "✅ Task recovered"}`;

    ctx.onXmlComplete(
      `<dyad-status title="Failover Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// Export all tools from this file
export const dynamicAgentTools = {
  spawnAgentTool,
  cloneAgentTool,
  swarmCoordinateTool,
  agentFailoverTool,
};
