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

// In-memory message bus for agent communication
interface AgentMessage {
  id: string;
  from: string;
  to: string | "broadcast";
  subject: string;
  content: string;
  timestamp: string;
  read: boolean;
}

const messageBus: AgentMessage[] = [];

// Agent discovery registry
interface DiscoveredAgent {
  id: string;
  name: string;
  capabilities: string[];
  status: "available" | "busy" | "offline";
  lastSeen: string;
}

const agentDiscoveryRegistry = new Map<string, DiscoveredAgent>();

const multiAgentCoordinatorSchema = z.object({
  task: z
    .string()
    .describe("High-level task to decompose and assign to multiple agents"),
  numAgents: z
    .number()
    .optional()
    .default(3)
    .describe("Number of parallel agents to spawn (default: 3)"),
  strategy: z
    .enum(["divide_conquer", "review", "consensus"])
    .optional()
    .default("divide_conquer")
    .describe(
      "Coordination strategy: divide_conquer (parallel work), review (agent reviews agent), consensus (vote on best)",
    ),
  aggregationPrompt: z
    .string()
    .optional()
    .describe("Optional prompt to aggregate results from multiple agents"),
});

interface _AgentResult {
  agentId: number;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
}

export const multiAgentCoordinatorTool: ToolDefinition<
  z.infer<typeof multiAgentCoordinatorSchema>
> = {
  name: "multi_agent_coordinator",
  description: `Coordinate multiple AI agents working in parallel on a complex task. Decomposes a task into subtasks, executes them concurrently, and aggregates results. Useful for parallel research, code generation across multiple files, or exploring different solution approaches.`,
  inputSchema: multiAgentCoordinatorSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Spawn ${args.numAgents || 3} parallel agents to work on: "${args.task.substring(0, 50)}..."`,

  buildXml: (args, isComplete) => {
    if (!args.task) return undefined;

    let xml = `<dyad-multi-agent task="${escapeXmlAttr(args.task.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-multi-agent>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      task,
      numAgents = 3,
      strategy = "divide_conquer",
      aggregationPrompt,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Multi-Agent Coordinator">Starting ${numAgents} agents with strategy: ${strategy}</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // 1. Decompose the task into subtasks
    ctx.onXmlStream(
      `<dyad-status title="Task Decomposition">Breaking down task into ${numAgents} subtasks...</dyad-status>`,
    );

    const decompositionPrompt = `Decompose the following task into ${numAgents} independent subtasks that can be executed in parallel.
Each subtask should be self-contained and not depend on the output of other subtasks.

Task: ${task}

Return a JSON array of subtask objects with "id", "description", and "approach" fields:
[
  {"id": 1, "description": "...", "approach": "..."},
  ...
]`;

    const { text: decompositionText } = await generateText({
      model: modelClient.model,
      prompt: decompositionPrompt,
      temperature: 0.3,
    });

    // Parse subtasks from the response
    let subtasks: { id: number; description: string; approach: string }[] = [];
    try {
      const jsonMatch = decompositionText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        subtasks = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: create simple subtasks
      subtasks = Array.from({ length: numAgents }, (_, i) => ({
        id: i + 1,
        description: `Subtask ${i + 1}: Part of "${task}"`,
        approach: "Work on this portion of the task independently",
      }));
    }

    ctx.onXmlStream(
      `<dyad-status title="Multi-Agent Coordinator">Executing ${subtasks.length} subtasks in parallel...</dyad-status>`,
    );

    // 2. Execute subtasks in parallel using Promise.all
    const agentPromises = subtasks.map(async (subtask, index) => {
      const agentId = index + 1;

      ctx.onXmlStream(
        `<dyad-status title="Agent ${agentId}/${subtasks.length}">Starting: ${escapeXmlAttr(subtask.description)}</dyad-status>`,
      );

      try {
        // Each sub-agent gets a focused system prompt
        const agentSystemPrompt = `You are Agent ${agentId} of a multi-agent team. Your role is to complete your assigned subtask independently.
        
Main Task: ${task}

Your Subtask: ${subtask.description}
Approach: ${subtask.approach}

You have access to file operations (read, write, search_replace), list_files, and code search tools.
Complete your subtask and provide a summary of what you accomplished.`;

        const { text: agentResult } = await generateText({
          model: modelClient.model,
          system: agentSystemPrompt,
          prompt: `Complete subtask ${agentId}: ${subtask.description}`,
          tools: {
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
          },
        });

        ctx.onXmlStream(
          `<dyad-status title="Agent ${agentId} Complete">Finished subtask ${agentId}</dyad-status>`,
        );

        return {
          agentId,
          status: "completed" as const,
          result: agentResult,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.onXmlStream(
          `<dyad-status title="Agent ${agentId} Failed">Error: ${escapeXmlAttr(errorMsg)}</dyad-status>`,
        );

        return {
          agentId,
          status: "failed" as const,
          error: errorMsg,
        };
      }
    });

    // Wait for all agents to complete
    const results = await Promise.all(agentPromises);

    // 3. Aggregate results based on strategy
    ctx.onXmlStream(
      `<dyad-status title="Aggregating Results">Combining outputs from ${results.length} agents...</dyad-status>`,
    );

    let finalResult: string;
    const completedResults = results.filter((r) => r.status === "completed");
    const failedResults = results.filter((r) => r.status === "failed");

    if (strategy === "divide_conquer") {
      // Simple concatenation of all results
      const aggregated = completedResults
        .map((r) => `## Agent ${r.agentId} Result\n\n${r.result}`)
        .join("\n\n---\n\n");

      finalResult = aggregated;
    } else if (strategy === "review") {
      // One agent reviews all results
      const reviewPrompt = `You are a senior reviewer. Review the following solutions from multiple agents and provide feedback.
      
Original Task: ${task}

${completedResults.map((r) => `### Agent ${r.agentId} Solution:\n${r.result}`).join("\n\n")}

${aggregationPrompt || "Provide a summary of the best approaches and any issues found."}`;

      const { text: reviewResult } = await generateText({
        model: modelClient.model,
        prompt: reviewPrompt,
        temperature: 0.2,
      });

      finalResult = reviewResult;
    } else if (strategy === "consensus") {
      // Agents vote on the best approach
      const consensusPrompt = `Given the following solutions from multiple agents for the task: ${task}

${completedResults.map((r) => `Agent ${r.agentId}: ${r.result}`).join("\n\n")}

${aggregationPrompt || "Synthesize these approaches into a single best solution. Explain your reasoning."}`;

      const { text: consensusResult } = await generateText({
        model: modelClient.model,
        prompt: consensusPrompt,
        temperature: 0.2,
      });

      finalResult = consensusResult;
    } else {
      finalResult = completedResults.map((r) => r.result).join("\n\n");
    }

    // 4. Format final output
    const summaryLines = [
      `Multi-Agent Coordination Complete`,
      `===================`,
      ``,
      `Strategy: ${strategy}`,
      `Total Agents: ${results.length}`,
      `Successful: ${completedResults.length}`,
      `Failed: ${failedResults.length}`,
      ``,
      `---`,
      ``,
      finalResult,
    ];

    if (failedResults.length > 0) {
      summaryLines.push(`\n---`);
      summaryLines.push(`\nFailed Agents:`);
      for (const r of failedResults) {
        summaryLines.push(`- Agent ${r.agentId}: ${r.error}`);
      }
    }

    const finalSummary = summaryLines.join("\n");
    ctx.onXmlComplete(
      `<dyad-status title="Multi-Agent Complete">${escapeXmlContent(finalSummary)}</dyad-status>`,
    );

    return finalSummary;
  },
};

// ============================================================================
// Tool 2: message_bus (capability ~142)
// ============================================================================

const messageBusSchema = z.object({
  action: z
    .enum(["send", "receive", "list", "mark_read"])
    .describe("Message bus action to perform"),
  to: z
    .string()
    .optional()
    .describe("Recipient agent ID (or 'broadcast' for all)"),
  subject: z.string().optional().describe("Message subject"),
  content: z.string().optional().describe("Message content"),
  messageId: z
    .string()
    .optional()
    .describe("Message ID for receive/mark_read actions"),
  filter: z
    .object({
      from: z.string().optional(),
      unreadOnly: z.boolean().optional(),
    })
    .optional()
    .describe("Filter for listing messages"),
});

export const messageBusTool: ToolDefinition<z.infer<typeof messageBusSchema>> =
  {
    name: "message_bus",
    description: `Agent message bus for inter-agent communication. Supports sending messages to specific agents or broadcasting to all, receiving messages, listing inbox, and marking messages as read. Essential for multi-agent coordination and information sharing.`,
    inputSchema: messageBusSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => {
      if (args.action === "send") {
        return `Send message to: ${args.to || "broadcast"}`;
      }
      return `${args.action} messages`;
    },

    buildXml: (args, isComplete) => {
      let xml = `<dyad-message-bus action="${args.action}">`;
      if (isComplete) {
        xml += "</dyad-message-bus>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const { action, to, subject, content, messageId, filter } = args;
      const senderId = ctx.dyadRequestId;

      if (action === "send") {
        if (!to || !subject || !content) {
          throw new Error("Missing required fields: to, subject, content");
        }

        const message: AgentMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          from: senderId,
          to: to,
          subject,
          content,
          timestamp: new Date().toISOString(),
          read: false,
        };

        messageBus.push(message);

        const summary = `## Message Sent

**Message ID:** ${message.id}
**To:** ${to}
**Subject:** ${subject}

✅ Message delivered to ${to === "broadcast" ? "all agents" : `agent ${to}`}`;

        ctx.onXmlComplete(
          `<dyad-status title="Message Sent">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return summary;
      }

      if (action === "receive") {
        if (!messageId) {
          throw new Error("messageId required for receive action");
        }

        const message = messageBus.find(
          (m) =>
            m.id === messageId && (m.to === senderId || m.to === "broadcast"),
        );

        if (!message) {
          throw new Error("Message not found or not authorized");
        }

        message.read = true;

        const summary = `## Message Received

**From:** ${message.from}
**Subject:** ${message.subject}
**Time:** ${message.timestamp}

---

${message.content}`;

        ctx.onXmlComplete(
          `<dyad-status title="Message">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return summary;
      }

      if (action === "list") {
        const messages = messageBus.filter((m) => {
          if (m.to !== senderId && m.to !== "broadcast") {
            return false;
          }
          if (filter?.from && m.from !== filter.from) {
            return false;
          }
          if (filter?.unreadOnly && m.read) {
            return false;
          }
          return true;
        });

        const summary = `## Message Inbox

**Total Messages:** ${messages.length}

${messages
  .map(
    (m) =>
      `- [${m.read ? " " : "*"}] ${m.id}: ${m.subject} from ${m.from} (${m.timestamp})`,
  )
  .join("\n")}

${messages.filter((m) => !m.read).length} unread`;

        ctx.onXmlComplete(
          `<dyad-status title="Inbox">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return JSON.stringify(messages, null, 2);
      }

      if (action === "mark_read") {
        if (!messageId) {
          throw new Error("messageId required for mark_read action");
        }

        const message = messageBus.find((m) => m.id === messageId);
        if (message) {
          message.read = true;
        }

        const summary = `## Message Marked Read

**Message ID:** ${messageId}

✅ Message marked as read`;

        ctx.onXmlComplete(
          `<dyad-status title="Marked Read">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return summary;
      }

      throw new Error("Invalid action");
    },
  };

// ============================================================================
// Tool 3: event_broadcast (capability ~144)
// ============================================================================

const eventBroadcastSchema = z.object({
  eventType: z
    .enum([
      "task_completed",
      "task_failed",
      "resource_available",
      "resource_needed",
      "status_change",
      "custom",
    ])
    .describe("Type of event to broadcast"),
  eventData: z
    .object({
      taskId: z.string().optional(),
      agentId: z.string().optional(),
      resource: z.string().optional(),
      status: z.string().optional(),
      message: z.string().optional(),
    })
    .optional()
    .describe("Event payload"),
  customType: z.string().optional().describe("Custom event type name"),
  listeners: z
    .array(z.string())
    .optional()
    .describe("Specific agents to notify (default: all)"),
});

export const eventBroadcastTool: ToolDefinition<
  z.infer<typeof eventBroadcastSchema>
> = {
  name: "event_broadcast",
  description: `Broadcast events to other agents in the system. Agents can subscribe to specific event types and react accordingly. Useful for coordination, signaling completion, or requesting help from other agents.`,
  inputSchema: eventBroadcastSchema,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) =>
    `Broadcast event: ${args.eventType}${args.customType ? `:${args.customType}` : ""}`,

  buildXml: (args, isComplete) => {
    const eventType = args.customType || args.eventType;
    let xml = `<dyad-event-broadcast type="${eventType}">`;
    if (isComplete) {
      xml += "</dyad-event-broadcast>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { eventType, eventData, customType, listeners } = args;

    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: customType || eventType,
      source: ctx.dyadRequestId,
      data: eventData || {},
      timestamp: new Date().toISOString(),
      targetAgents: listeners || ["all"],
    };

    ctx.onXmlStream(
      `<dyad-status title="Event Broadcast">Broadcasting ${event.type} event...</dyad-status>`,
    );

    // In a real implementation, this would notify subscribed agents
    // For now, we return the event details

    // Handle different event types with appropriate responses
    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    let response = "";

    if (eventType === "resource_needed") {
      const prompt = `An agent has requested a resource. Analyze this event:

Event: ${JSON.stringify(event)}

Determine if the current agent can help satisfy this resource request.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt,
        temperature: 0.3,
      });

      response = text;
    } else if (eventType === "task_failed") {
      const prompt = `A task has failed. Analyze this event:

Event: ${JSON.stringify(event)}

Determine if this failure impacts other tasks or if retry might help.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt,
        temperature: 0.3,
      });

      response = text;
    }

    const summary = `## Event Broadcast

**Event ID:** ${event.id}
**Type:** ${event.type}
**Source:** ${event.source}
**Targets:** ${event.targetAgents.join(", ")}

**Event Data:**
${JSON.stringify(event.data, null, 2)}

---

${
  response
    ? `### Analysis

${response}`
    : "✅ Event broadcast to all subscribed agents"
}

---

**Timestamp:** ${event.timestamp}`;

    ctx.onXmlComplete(
      `<dyad-status title="Event Broadcasted">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 4: agent_discovery (capability ~145)
// ============================================================================

const agentDiscoverySchema = z.object({
  action: z
    .enum(["register", "unregister", "search", "heartbeat", "list"])
    .describe("Discovery action to perform"),
  agentInfo: z
    .object({
      name: z.string().describe("Agent name"),
      capabilities: z.array(z.string()).describe("List of agent capabilities"),
    })
    .optional()
    .describe("Agent information for registration"),
  searchCriteria: z
    .object({
      capability: z.string().optional().describe("Required capability"),
      status: z
        .enum(["available", "busy", "offline"])
        .optional()
        .describe("Agent availability status"),
      namePattern: z.string().optional().describe("Name pattern to match"),
    })
    .optional()
    .describe("Search criteria for finding agents"),
  agentId: z.string().optional().describe("Agent ID for heartbeat/unregister"),
});

export const agentDiscoveryTool: ToolDefinition<
  z.infer<typeof agentDiscoverySchema>
> = {
  name: "agent_discovery",
  description: `Agent discovery network for finding and registering available agents. Allows agents to discover other agents by capability, maintain presence through heartbeats, and manage the agent registry. Essential for dynamic multi-agent systems.`,
  inputSchema: agentDiscoverySchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    if (args.action === "register") {
      return `Register agent: ${args.agentInfo?.name || "unknown"}`;
    }
    return `${args.action} agent discovery`;
  },

  buildXml: (args, isComplete) => {
    let xml = `<dyad-agent-discovery action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-agent-discovery>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, agentInfo, searchCriteria, agentId } = args;

    if (action === "register") {
      if (!agentInfo) {
        throw new Error("agentInfo required for registration");
      }

      const id = agentId || `agent_${Date.now()}`;

      const agent: DiscoveredAgent = {
        id,
        name: agentInfo.name,
        capabilities: agentInfo.capabilities,
        status: "available",
        lastSeen: new Date().toISOString(),
      };

      agentDiscoveryRegistry.set(id, agent);

      const summary = `## Agent Registered

**Agent ID:** ${id}
**Name:** ${agentInfo.name}
**Capabilities:** ${agentInfo.capabilities.join(", ")}

✅ Agent visible to discovery network`;

      ctx.onXmlComplete(
        `<dyad-status title="Agent Registered">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "unregister") {
      if (!agentId) {
        throw new Error("agentId required for unregister");
      }

      agentDiscoveryRegistry.delete(agentId);

      const summary = `## Agent Unregistered

**Agent ID:** ${agentId}

✅ Agent removed from discovery network`;

      ctx.onXmlComplete(
        `<dyad-status title="Agent Unregistered">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "heartbeat") {
      if (!agentId) {
        throw new Error("agentId required for heartbeat");
      }

      const agent = agentDiscoveryRegistry.get(agentId);
      if (agent) {
        agent.lastSeen = new Date().toISOString();
        agent.status = "available";
      }

      const summary = `## Heartbeat Received

**Agent ID:** ${agentId}
**Timestamp:** ${new Date().toISOString()}

✅ Agent status updated`;

      ctx.onXmlComplete(
        `<dyad-status title="Heartbeat">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "search") {
      if (!searchCriteria) {
        throw new Error("searchCriteria required for search");
      }

      const results = Array.from(agentDiscoveryRegistry.values()).filter(
        (agent) => {
          if (
            searchCriteria.capability &&
            !agent.capabilities.includes(searchCriteria.capability)
          ) {
            return false;
          }
          if (searchCriteria.status && agent.status !== searchCriteria.status) {
            return false;
          }
          if (
            searchCriteria.namePattern &&
            !agent.name.includes(searchCriteria.namePattern)
          ) {
            return false;
          }
          return true;
        },
      );

      const summary = `## Agent Discovery Results

**Found:** ${results.length} agent(s)

${results
  .map(
    (a) =>
      `- **${a.name}** (${a.id})
  Status: ${a.status}
  Capabilities: ${a.capabilities.join(", ")}
  Last seen: ${a.lastSeen}`,
  )
  .join("\n\n")}

${results.length === 0 ? "No agents match the criteria" : ""}`;

      ctx.onXmlComplete(
        `<dyad-status title="Discovery Results">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(results, null, 2);
    }

    if (action === "list") {
      const allAgents = Array.from(agentDiscoveryRegistry.values());

      const summary = `## All Registered Agents

**Total:** ${allAgents.length}

${allAgents
  .map(
    (a) =>
      `- **${a.name}** (${a.id})
  Status: ${a.status}
  Capabilities: ${a.capabilities.join(", ")}
  Last seen: ${a.lastSeen}`,
  )
  .join("\n\n")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Agent List">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(allAgents, null, 2);
    }

    throw new Error("Invalid action");
  },
};
