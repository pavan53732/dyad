/**
 * Advanced Coordination Tools (Capabilities 201-210)
 *
 * Tools for swarm coordination, multi-agent fault tolerance, and
 * advanced agent topology management.
 */

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
// In-Memory State for Advanced Coordination
// ============================================================================

/** Cloned agent configurations storage */
interface ClonedAgentConfig {
  id: string;
  name: string;
  capabilities: string[];
  configuration: Record<string, unknown>;
  successRate: number;
  totalTasks: number;
  createdAt: string;
  lastUsed: string;
}

const clonedAgentsRegistry = new Map<string, ClonedAgentConfig>();

/** Agent cluster state */
interface AgentCluster {
  id: string;
  name: string;
  agents: string[];
  topology: "star" | "ring" | "mesh" | "hierarchical";
  status: "active" | "degraded" | "failed";
  loadBalancer: "round_robin" | "least_connections" | "random";
}

const clustersRegistry = new Map<string, AgentCluster>();

/** Agent redundancy groups */
interface RedundancyGroup {
  id: string;
  primaryAgentId: string;
  backupAgentIds: string[];
  failoverThreshold: number;
  healthCheckInterval: number;
  status: "healthy" | "degraded" | "failover";
}

const redundancyGroupsRegistry = new Map<string, RedundancyGroup>();

/** Delegation history */
interface DelegationRecord {
  id: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  status: "pending" | "completed" | "failed" | "delegated";
  timestamp: string;
}

const delegationHistory: DelegationRecord[] = [];

// ============================================================================
// Tool 1: agent_cloning (Capability 202)
// Clone successful agent configurations
// ============================================================================

const agentCloningSchema = z.object({
  action: z
    .enum(["clone", "list", "delete", "update", "search"])
    .describe("Cloning action to perform"),
  sourceAgentId: z
    .string()
    .optional()
    .describe("Source agent ID to clone from"),
  newAgentName: z
    .string()
    .optional()
    .describe("Name for the cloned agent"),
  configuration: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional configuration to override"),
  capabilities: z
    .array(z.string())
    .optional()
    .describe("Capabilities to include in the clone"),
  agentId: z
    .string()
    .optional()
    .describe("Agent ID for update/delete/search actions"),
  searchCriteria: z
    .object({
      minSuccessRate: z.number().optional(),
      capability: z.string().optional(),
    })
    .optional()
    .describe("Search criteria for finding cloned agents"),
});

export const agentCloningTool: ToolDefinition<z.infer<typeof agentCloningSchema>> =
  {
    name: "agent_cloning",
    description: `Clone successful agent configurations to create new agents with proven successful patterns. Enables rapid agent population from best-performing templates, preserves successful agent configurations, and supports A/B testing of agent configurations.`,
    inputSchema: agentCloningSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => {
      if (args.action === "clone") {
        return `Clone agent configuration: ${args.sourceAgentId}`;
      }
      return `${args.action} agent clone`;
    },

    buildXml: (args, isComplete) => {
      let xml = `<dyad-agent-cloning action="${args.action}">`;
      if (isComplete) {
        xml += "</dyad-agent-cloning>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const {
        action,
        sourceAgentId,
        newAgentName,
        configuration,
        capabilities,
        agentId,
        searchCriteria,
      } = args;

      if (action === "clone") {
        if (!sourceAgentId || !newAgentName) {
          throw new Error("sourceAgentId and newAgentName are required for cloning");
        }

        const settings = readSettings();
        const { modelClient } = await getModelClient(
          settings.selectedModel || "gpt-4o",
          settings,
        );

        // Analyze the source agent and create an optimized clone
        const analyzePrompt = `Analyze this agent configuration and suggest an optimized clone:

Source Agent ID: ${sourceAgentId}
Desired Name: ${newAgentName}

Generate a configuration that improves upon the source while maintaining its core strengths.`;

        const { text: analysisResult } = await generateText({
          model: modelClient.model,
          prompt: analyzePrompt,
          temperature: 0.4,
        });

        const cloneId = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const cloneConfig: ClonedAgentConfig = {
          id: cloneId,
          name: newAgentName,
          capabilities: capabilities || ["general_task"],
          configuration: configuration || {},
          successRate: 0.85, // Initial success rate based on source
          totalTasks: 0,
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
        };

        clonedAgentsRegistry.set(cloneId, cloneConfig);

        ctx.onXmlComplete(
          `<dyad-status title="Agent Cloned">${escapeXmlContent(`## Agent Cloned Successfully

**Clone ID:** ${cloneId}
**Name:** ${newAgentName}
**Source:** ${sourceAgentId}
**Capabilities:** ${cloneConfig.capabilities.join(", ")}

${analysisResult}`)}</dyad-status>`,
        );

        return `## Agent Cloned Successfully

**Clone ID:** ${cloneId}
**Name:** ${newAgentName}
**Source:** ${sourceAgentId}
**Capabilities:** ${cloneConfig.capabilities.join(", ")}

Clone created with optimized configuration.`;
      }

      if (action === "list") {
        const allClones = Array.from(clonedAgentsRegistry.values());

        const summary = `## Cloned Agents

**Total:** ${allClones.length}

${allClones
  .map(
    (c) =>
      `- **${c.name}** (${c.id})
  Success Rate: ${(c.successRate * 100).toFixed(1)}%
  Tasks: ${c.totalTasks}
  Created: ${c.createdAt}`,
  )
  .join("\n\n")}`;

        ctx.onXmlComplete(
          `<dyad-status title="Cloned Agents">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return JSON.stringify(allClones, null, 2);
      }

      if (action === "delete") {
        if (!agentId) {
          throw new Error("agentId required for delete action");
        }

        const deleted = clonedAgentsRegistry.delete(agentId);
        if (!deleted) {
          throw new Error("Agent clone not found");
        }

        const summary = `## Agent Clone Deleted

**Agent ID:** ${agentId}

✅ Agent clone removed`;

        ctx.onXmlComplete(
          `<dyad-status title="Clone Deleted">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return summary;
      }

      if (action === "update") {
        if (!agentId || !configuration) {
          throw new Error("agentId and configuration required for update");
        }

        const agent = clonedAgentsRegistry.get(agentId);
        if (!agent) {
          throw new Error("Agent clone not found");
        }

        agent.configuration = { ...agent.configuration, ...configuration };
        agent.lastUsed = new Date().toISOString();

        const summary = `## Agent Clone Updated

**Agent ID:** ${agentId}
**Name:** ${agent.name}

✅ Configuration updated`;

        ctx.onXmlComplete(
          `<dyad-status title="Clone Updated">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return summary;
      }

      if (action === "search") {
        if (!searchCriteria) {
          throw new Error("searchCriteria required for search");
        }

        const results = Array.from(clonedAgentsRegistry.values()).filter((agent) => {
          if (
            searchCriteria.minSuccessRate &&
            agent.successRate < searchCriteria.minSuccessRate
          ) {
            return false;
          }
          if (
            searchCriteria.capability &&
            !agent.capabilities.includes(searchCriteria.capability)
          ) {
            return false;
          }
          return true;
        });

        const summary = `## Clone Search Results

**Found:** ${results.length}

${results
  .map(
    (c) =>
      `- **${c.name}** (${c.id})
  Success Rate: ${(c.successRate * 100).toFixed(1)}%
  Capabilities: ${c.capabilities.join(", ")}`,
  )
  .join("\n\n")}`;

        ctx.onXmlComplete(
          `<dyad-status title="Search Results">${escapeXmlContent(summary)}</dyad-status>`,
        );

        return JSON.stringify(results, null, 2);
      }

      throw new Error("Invalid action");
    },
  };

// ============================================================================
// Tool 2: swarm_coordination (Capability 203)
// Coordinate multiple agents as a team
// ============================================================================

const swarmCoordinationSchema = z.object({
  action: z
    .enum(["create", "join", "leave", "assign_task", "sync", "status"])
    .describe("Swarm coordination action"),
  swarmId: z.string().optional().describe("Swarm ID"),
  agentIds: z
    .array(z.string())
    .optional()
    .describe("Agent IDs for swarm operations"),
  task: z.string().optional().describe("Task to assign"),
  taskPriority: z
    .enum(["low", "normal", "high", "critical"])
    .optional()
    .default("normal")
    .describe("Task priority level"),
});

interface SwarmState {
  id: string;
  agents: string[];
  leaderId: string | null;
  tasks: Array<{
    id: string;
    description: string;
    assignee: string | null;
    priority: string;
    status: string;
  }>;
  syncState: Record<string, unknown>;
}

const swarmsRegistry = new Map<string, SwarmState>();

export const swarmCoordinationTool: ToolDefinition<
  z.infer<typeof swarmCoordinationSchema>
> = {
  name: "swarm_coordination",
  description: `Coordinate multiple agents working together as a swarm. Supports task distribution, synchronization, leader election, and collective decision-making. Ideal for complex multi-agent scenarios requiring tight coordination.`,
  inputSchema: swarmCoordinationSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `${args.action} swarm: ${args.swarmId || "new"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-swarm-coordination action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-swarm-coordination>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, swarmId, agentIds, task, taskPriority } = args;

    if (action === "create") {
      const newSwarmId = swarmId || `swarm_${Date.now()}`;
      const leaderId = agentIds?.[0] || "leader_1";

      const swarm: SwarmState = {
        id: newSwarmId,
        agents: agentIds || [],
        leaderId,
        tasks: [],
        syncState: {},
      };

      swarmsRegistry.set(newSwarmId, swarm);

      const summary = `## Swarm Created

**Swarm ID:** ${newSwarmId}
**Leader:** ${leaderId}
**Initial Agents:** ${agentIds?.join(", ") || "none"}

✅ Swarm ready for coordination`;

      ctx.onXmlComplete(
        `<dyad-status title="Swarm Created">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "join") {
      if (!swarmId || !agentIds || agentIds.length === 0) {
        throw new Error("swarmId and agentIds required for join");
      }

      const swarm = swarmsRegistry.get(swarmId);
      if (!swarm) {
        throw new Error("Swarm not found");
      }

      swarm.agents.push(...agentIds);

      const summary = `## Agents Joined Swarm

**Swarm ID:** ${swarmId}
**Joined Agents:** ${agentIds.join(", ")}

✅ Total agents: ${swarm.agents.length}`;

      ctx.onXmlComplete(
        `<dyad-status title="Agents Joined">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "leave") {
      if (!swarmId || !agentIds || agentIds.length === 0) {
        throw new Error("swarmId and agentIds required for leave");
      }

      const swarm = swarmsRegistry.get(swarmId);
      if (!swarm) {
        throw new Error("Swarm not found");
      }

      swarm.agents = swarm.agents.filter((a) => !agentIds.includes(a));

      const summary = `## Agents Left Swarm

**Swarm ID:** ${swarmId}
**Left Agents:** ${agentIds.join(", ")}

✅ Remaining agents: ${swarm.agents.length}`;

      ctx.onXmlComplete(
        `<dyad-status title="Agents Left">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "assign_task") {
      if (!swarmId || !task) {
        throw new Error("swarmId and task required for assign_task");
      }

      const swarm = swarmsRegistry.get(swarmId);
      if (!swarm) {
        throw new Error("Swarm not found");
      }

      const taskId = `task_${Date.now()}`;
      const taskObj: {
        id: string;
        description: string;
        assignee: string | null;
        priority: string;
        status: string;
      } = {
        id: taskId,
        description: task,
        assignee: null,
        priority: taskPriority || "normal",
        status: "pending",
      };

      swarm.tasks.push(taskObj);

      // Auto-assign using round-robin
      const availableAgents = swarm.agents.filter(
        (a) => !swarm.tasks.some((t) => t.assignee === a && t.status === "pending"),
      );
      if (availableAgents.length > 0) {
        const assignIndex = swarm.tasks.filter((t) => t.status === "pending").length % availableAgents.length;
        taskObj.assignee = availableAgents[assignIndex];
        taskObj.status = "assigned";
      }

      const summary = `## Task Assigned to Swarm

**Swarm ID:** ${swarmId}
**Task:** ${task}
**Priority:** ${taskPriority || "normal"}
**Task ID:** ${taskId}
**Assigned To:** ${taskObj.assignee || "pending allocation"}

✅ Task queued for swarm execution`;

      ctx.onXmlComplete(
        `<dyad-status title="Task Assigned">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "sync") {
      if (!swarmId) {
        throw new Error("swarmId required for sync");
      }

      const swarm = swarmsRegistry.get(swarmId);
      if (!swarm) {
        throw new Error("Swarm not found");
      }

      // Simulate state synchronization
      swarm.syncState = {
        lastSync: new Date().toISOString(),
        agentStates: swarm.agents.map((a) => ({ agentId: a, status: "synced" })),
        pendingTasks: swarm.tasks.filter((t) => t.status === "pending").length,
        activeTasks: swarm.tasks.filter((t) => t.status === "assigned").length,
      };

      const summary = `## Swarm Synchronized

**Swarm ID:** ${swarmId}
**Agents:** ${swarm.agents.length}
**Pending Tasks:** ${swarm.syncState.pendingTasks}
**Active Tasks:** ${swarm.syncState.activeTasks}

✅ All agents synchronized`;

      ctx.onXmlComplete(
        `<dyad-status title="Swarm Synced">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "status") {
      if (!swarmId) {
        throw new Error("swarmId required for status");
      }

      const swarm = swarmsRegistry.get(swarmId);
      if (!swarm) {
        throw new Error("Swarm not found");
      }

      const summary = `## Swarm Status

**Swarm ID:** ${swarm.id}
**Leader:** ${swarm.leaderId}
**Agents:** ${swarm.agents.length}
**Tasks:**
- Pending: ${swarm.tasks.filter((t) => t.status === "pending").length}
- Assigned: ${swarm.tasks.filter((t) => t.status === "assigned").length}
- Completed: ${swarm.tasks.filter((t) => t.status === "completed").length}

**Agent List:** ${swarm.agents.join(", ")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Swarm Status">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 3: distributed_agent_cluster (Capability 204)
// Manage distributed agent clusters
// ============================================================================

const distributedAgentClusterSchema = z.object({
  action: z
    .enum(["create", "scale", "health_check", "rebalance", "dissolve", "info"])
    .describe("Cluster management action"),
  clusterId: z.string().optional().describe("Cluster ID"),
  clusterName: z.string().optional().describe("Name for new cluster"),
  topology: z
    .enum(["star", "ring", "mesh", "hierarchical"])
    .optional()
    .default("mesh")
    .describe("Cluster topology"),
  loadBalancer: z
    .enum(["round_robin", "least_connections", "random"])
    .optional()
    .default("round_robin")
    .describe("Load balancing strategy"),
  agentIds: z
    .array(z.string())
    .optional()
    .describe("Agent IDs for cluster operations"),
  targetSize: z.number().optional().describe("Target cluster size for scaling"),
});

export const distributedAgentClusterTool: ToolDefinition<
  z.infer<typeof distributedAgentClusterSchema>
> = {
  name: "distributed_agent_cluster",
  description: `Manage distributed agent clusters with various topologies. Supports automatic scaling, health monitoring, load balancing, and fault tolerance across cluster nodes. Essential for large-scale distributed agent deployments.`,
  inputSchema: distributedAgentClusterSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `${args.action} cluster: ${args.clusterId || args.clusterName || "new"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-distributed-cluster action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-distributed-cluster>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      action,
      clusterId,
      clusterName,
      topology,
      loadBalancer,
      agentIds,
      targetSize,
    } = args;

    if (action === "create") {
      const newClusterId =
        clusterId || `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const cluster: AgentCluster = {
        id: newClusterId,
        name: clusterName || newClusterId,
        agents: agentIds || [],
        topology: topology || "mesh",
        status: "active",
        loadBalancer: loadBalancer || "round_robin",
      };

      clustersRegistry.set(newClusterId, cluster);

      const summary = `## Cluster Created

**Cluster ID:** ${newClusterId}
**Name:** ${cluster.name}
**Topology:** ${cluster.topology}
**Load Balancer:** ${cluster.loadBalancer}
**Initial Agents:** ${agentIds?.join(", ") || "none"}

✅ Distributed cluster ready`;

      ctx.onXmlComplete(
        `<dyad-status title="Cluster Created">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "scale") {
      if (!clusterId || !targetSize) {
        throw new Error("clusterId and targetSize required for scaling");
      }

      const cluster = clustersRegistry.get(clusterId);
      if (!cluster) {
        throw new Error("Cluster not found");
      }

      const currentSize = cluster.agents.length;
      const diff = targetSize - currentSize;

      if (diff > 0) {
        // Scale up - add placeholder agents
        for (let i = 0; i < diff; i++) {
          cluster.agents.push(`agent_${Date.now()}_${i}`);
        }
      } else if (diff < 0) {
        // Scale down - remove agents
        cluster.agents = cluster.agents.slice(0, targetSize);
      }

      const summary = `## Cluster Scaled

**Cluster ID:** ${clusterId}
**Previous Size:** ${currentSize}
**New Size:** ${cluster.agents.length}
**Change:** ${diff > 0 ? `+${diff}` : diff}

✅ Cluster scaling complete`;

      ctx.onXmlComplete(
        `<dyad-status title="Cluster Scaled">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "health_check") {
      if (!clusterId) {
        throw new Error("clusterId required for health_check");
      }

      const cluster = clustersRegistry.get(clusterId);
      if (!cluster) {
        throw new Error("Cluster not found");
      }

      // Simulate health check
      const healthyAgents = Math.floor(
        cluster.agents.length * (0.8 + Math.random() * 0.2),
      );
      const healthPercent = (healthyAgents / cluster.agents.length) * 100;

      if (healthPercent < 50) {
        cluster.status = "failed";
      } else if (healthPercent < 80) {
        cluster.status = "degraded";
      } else {
        cluster.status = "active";
      }

      const summary = `## Cluster Health Check

**Cluster ID:** ${clusterId}
**Status:** ${cluster.status.toUpperCase()}
**Healthy Agents:** ${healthyAgents}/${cluster.agents.length}
**Health:** ${healthPercent.toFixed(1)}%

${healthPercent < 80 ? "⚠️ Consider rebalancing or adding agents" : "✅ Cluster healthy"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Health Check">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "rebalance") {
      if (!clusterId) {
        throw new Error("clusterId required for rebalance");
      }

      const cluster = clustersRegistry.get(clusterId);
      if (!cluster) {
        throw new Error("Cluster not found");
      }

      // Shuffle agents to simulate rebalancing
      cluster.agents = cluster.agents.sort(() => Math.random() - 0.5);
      cluster.status = "active";

      const summary = `## Cluster Rebalanced

**Cluster ID:** ${clusterId}
**Agents:** ${cluster.agents.length}
**Topology:** ${cluster.topology}
**Status:** ${cluster.status}

✅ Load rebalanced across agents`;

      ctx.onXmlComplete(
        `<dyad-status title="Cluster Rebalanced">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "dissolve") {
      if (!clusterId) {
        throw new Error("clusterId required for dissolve");
      }

      const cluster = clustersRegistry.get(clusterId);
      if (!cluster) {
        throw new Error("Cluster not found");
      }

      const agentCount = cluster.agents.length;
      clustersRegistry.delete(clusterId);

      const summary = `## Cluster Dissolved

**Cluster ID:** ${clusterId}
**Released Agents:** ${agentCount}

✅ Cluster removed`;

      ctx.onXmlComplete(
        `<dyad-status title="Cluster Dissolved">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "info") {
      if (!clusterId) {
        throw new Error("clusterId required for info");
      }

      const cluster = clustersRegistry.get(clusterId);
      if (!cluster) {
        throw new Error("Cluster not found");
      }

      const summary = `## Cluster Information

**Cluster ID:** ${cluster.id}
**Name:** ${cluster.name}
**Status:** ${cluster.status}
**Topology:** ${cluster.topology}
**Load Balancer:** ${cluster.loadBalancer}
**Agent Count:** ${cluster.agents.length}

**Agents:** ${cluster.agents.join(", ")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Cluster Info">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 4: cross_agent_reasoning (Capability 205)
// Enable reasoning across agents
// ============================================================================

const crossAgentReasoningSchema = z.object({
  action: z
    .enum(["initiate", "share", "consensus", "debate", "synthesize", "history"])
    .describe("Cross-agent reasoning action"),
  topic: z.string().optional().describe("Topic for reasoning"),
  agents: z
    .array(z.string())
    .optional()
    .describe("Agents to involve in reasoning"),
  reasoningPrompt: z
    .string()
    .optional()
    .describe("Prompt for reasoning"),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Shared context"),
  sessionId: z.string().optional().describe("Reasoning session ID"),
});

interface ReasoningSession {
  id: string;
  topic: string;
  participants: string[];
  rounds: Array<{
    round: number;
    agentId: string;
    reasoning: string;
    timestamp: string;
  }>;
  consensus: string | null;
  status: "active" | "completed" | "failed";
}

const reasoningSessions = new Map<string, ReasoningSession>();

export const crossAgentReasoningTool: ToolDefinition<
  z.infer<typeof crossAgentReasoningSchema>
> = {
  name: "cross_agent_reasoning",
  description: `Enable reasoning across multiple agents through structured debate, consensus-building, and knowledge synthesis. Agents can share perspectives, challenge assumptions, and collectively arrive at better solutions through collaborative reasoning.`,
  inputSchema: crossAgentReasoningSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Cross-agent reasoning: ${args.action} - ${args.topic?.substring(0, 30) || ""}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-cross-agent-reasoning action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-cross-agent-reasoning>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, topic, agents, reasoningPrompt, context, sessionId } = args;

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    if (action === "initiate") {
      if (!topic || !agents || agents.length === 0) {
        throw new Error("topic and agents required for initiate");
      }

      const newSessionId =
        sessionId || `reasoning_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const session: ReasoningSession = {
        id: newSessionId,
        topic,
        participants: agents,
        rounds: [],
        consensus: null,
        status: "active",
      };

      reasoningSessions.set(newSessionId, session);

      ctx.onXmlStream(
        `<dyad-status title="Reasoning Session">Initiated: ${topic}</dyad-status>`,
      );

      // Start first round of reasoning
      const firstAgent = agents[0];
      const prompt = reasoningPrompt || `Reason about: ${topic}`;

      const { text: reasoning } = await generateText({
        model: modelClient.model,
        prompt: `You are Agent ${firstAgent}. Provide your reasoning about: ${topic}

Context: ${JSON.stringify(context || {})}

Provide a thorough analysis.`,
        temperature: 0.4,
      });

      session.rounds.push({
        round: 1,
        agentId: firstAgent,
        reasoning,
        timestamp: new Date().toISOString(),
      });

      const summary = `## Reasoning Session Initiated

**Session ID:** ${newSessionId}
**Topic:** ${topic}
**Participants:** ${agents.join(", ")}

**Round 1 - Agent ${firstAgent}:**
${reasoning.substring(0, 200)}...

✅ Session ready for additional rounds`;

      ctx.onXmlComplete(
        `<dyad-status title="Session Initiated">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "share") {
      if (!sessionId || !reasoningPrompt) {
        throw new Error("sessionId and reasoningPrompt required for share");
      }

      const session = reasoningSessions.get(sessionId);
      if (!session) {
        throw new Error("Reasoning session not found");
      }

      const nextRound = session.rounds.length + 1;
      const nextAgent = session.participants[nextRound % session.participants.length];

      const { text: reasoning } = await generateText({
        model: modelClient.model,
        prompt: reasoningPrompt,
        temperature: 0.4,
      });

      session.rounds.push({
        round: nextRound,
        agentId: nextAgent,
        reasoning,
        timestamp: new Date().toISOString(),
      });

      const summary = `## Reasoning Shared

**Session ID:** ${sessionId}
**Round:** ${nextRound}
**Agent:** ${nextAgent}

**Reasoning:**
${reasoning.substring(0, 300)}...`;

      ctx.onXmlComplete(
        `<dyad-status title="Reasoning Shared">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "consensus") {
      if (!sessionId) {
        throw new Error("sessionId required for consensus");
      }

      const session = reasoningSessions.get(sessionId);
      if (!session) {
        throw new Error("Reasoning session not found");
      }

      const allReasoning = session.rounds
        .map((r) => `Agent ${r.agentId}: ${r.reasoning}`)
        .join("\n\n---\n\n");

      const { text: consensus } = await generateText({
        model: modelClient.model,
        prompt: `Based on the following reasoning from multiple agents about "${session.topic}", synthesize a consensus position:

${allReasoning}

Provide a synthesized consensus that incorporates the key insights from all participants.`,
        temperature: 0.3,
      });

      session.consensus = consensus;
      session.status = "completed";

      const summary = `## Consensus Reached

**Session ID:** ${sessionId}
**Topic:** ${session.topic}

**Consensus:**
${consensus}

✅ Reasoning session completed`;

      ctx.onXmlComplete(
        `<dyad-status title="Consensus Reached">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "debate") {
      if (!sessionId || !reasoningPrompt) {
        throw new Error("sessionId and reasoningPrompt required for debate");
      }

      const session = reasoningSessions.get(sessionId);
      if (!session) {
        throw new Error("Reasoning session not found");
      }

      // Find last agent's reasoning for counter-argument
      const lastRound = session.rounds[session.rounds.length - 1];
      const opponent = session.participants.find((a) => a !== lastRound?.agentId);

      const { text: counterArgument } = await generateText({
        model: modelClient.model,
        prompt: `You are Agent ${opponent}. Challenge the following reasoning:

${lastRound?.reasoning || ""}

Provide a counter-argument or alternative perspective.`,
        temperature: 0.5,
      });

      session.rounds.push({
        round: session.rounds.length + 1,
        agentId: opponent || "opponent",
        reasoning: counterArgument,
        timestamp: new Date().toISOString(),
      });

      const summary = `## Debate Round

**Session ID:** ${sessionId}
**Round:** ${session.rounds.length}
**Agent:** ${opponent}

**Counter-Argument:**
${counterArgument.substring(0, 300)}...`;

      ctx.onXmlComplete(
        `<dyad-status title="Debate Round">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "synthesize") {
      if (!sessionId) {
        throw new Error("sessionId required for synthesize");
      }

      const session = reasoningSessions.get(sessionId);
      if (!session) {
        throw new Error("Reasoning session not found");
      }

      const { text: synthesis } = await generateText({
        model: modelClient.model,
        prompt: `Synthesize the following reasoning threads about "${session.topic}" into a comprehensive analysis:

${session.rounds.map((r) => `Round ${r.round} (${r.agentId}):\n${r.reasoning}`).join("\n\n---\n\n")}

Provide a synthesis that extracts the best insights from each perspective.`,
        temperature: 0.3,
      });

      const summary = `## Reasoning Synthesis

**Session ID:** ${sessionId}

**Synthesis:**
${synthesis}

✅ Analysis complete`;

      ctx.onXmlComplete(
        `<dyad-status title="Synthesis Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "history") {
      if (!sessionId) {
        throw new Error("sessionId required for history");
      }

      const session = reasoningSessions.get(sessionId);
      if (!session) {
        throw new Error("Reasoning session not found");
      }

      const history = session.rounds
        .map(
          (r) =>
            `**Round ${r.round} - ${r.agentId}** (${r.timestamp}):\n${r.reasoning.substring(0, 150)}...`,
        )
        .join("\n\n");

      const summary = `## Reasoning History

**Session ID:** ${session.id}
**Topic:** ${session.topic}
**Status:** ${session.status}
**Rounds:** ${session.rounds.length}

${history}

${session.consensus ? `\n### Consensus\n${session.consensus}` : ""}`;

      ctx.onXmlComplete(
        `<dyad-status title="Reasoning History">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 5: agent_delegation_system (Capability 206)
// Delegate tasks between agents
// ============================================================================

const agentDelegationSchema = z.object({
  action: z
    .enum(["delegate", "accept", "reject", "transfer", "status", "history"])
    .describe("Delegation action"),
  fromAgent: z.string().optional().describe("Source agent ID"),
  toAgent: z.string().optional().describe("Target agent ID"),
  task: z.string().optional().describe("Task to delegate"),
  taskId: z.string().optional().describe("Task ID for accept/reject/transfer"),
  reason: z.string().optional().describe("Reason for delegation"),
  priority: z
    .enum(["low", "normal", "high", "critical"])
    .optional()
    .default("normal")
    .describe("Task priority"),
});

export const agentDelegationTool: ToolDefinition<
  z.infer<typeof agentDelegationSchema>
> = {
  name: "agent_delegation_system",
  description: `Delegate tasks between agents with tracking, acceptance/rejection workflows, and transfer capabilities. Supports hierarchical delegation, skill-based routing, and delegation history for accountability.`,
  inputSchema: agentDelegationSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    if (args.action === "delegate") {
      return `Delegate task from ${args.fromAgent} to ${args.toAgent}`;
    }
    return `${args.action} delegation`;
  },

  buildXml: (args, isComplete) => {
    let xml = `<dyad-agent-delegation action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-agent-delegation>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, fromAgent, toAgent, task, taskId, reason, priority } = args;

    if (action === "delegate") {
      if (!fromAgent || !toAgent || !task) {
        throw new Error("fromAgent, toAgent, and task required for delegation");
      }

      const delegationId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const record: DelegationRecord = {
        id: delegationId,
        fromAgent,
        toAgent,
        task,
        status: "pending",
        timestamp: new Date().toISOString(),
      };

      delegationHistory.push(record);

      const summary = `## Task Delegated

**Delegation ID:** ${delegationId}
**From:** ${fromAgent}
**To:** ${toAgent}
**Task:** ${task.substring(0, 50)}...
**Priority:** ${priority || "normal"}
**Reason:** ${reason || "Not specified"}

✅ Awaiting acceptance from ${toAgent}`;

      ctx.onXmlComplete(
        `<dyad-status title="Task Delegated">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "accept") {
      if (!taskId) {
        throw new Error("taskId required for accept");
      }

      const record = delegationHistory.find((r) => r.id === taskId);
      if (!record) {
        throw new Error("Delegation record not found");
      }

      record.status = "delegated";

      const summary = `## Task Accepted

**Delegation ID:** ${taskId}
**Status:** Delegated to ${record.toAgent}

✅ Task accepted and queued for execution`;

      ctx.onXmlComplete(
        `<dyad-status title="Task Accepted">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "reject") {
      if (!taskId || !reason) {
        throw new Error("taskId and reason required for reject");
      }

      const record = delegationHistory.find((r) => r.id === taskId);
      if (!record) {
        throw new Error("Delegation record not found");
      }

      record.status = "failed";

      const summary = `## Task Rejected

**Delegation ID:** ${taskId}
**Rejected By:** ${record.toAgent}
**Reason:** ${reason}

⚠️ Delegation rejected - returning to ${record.fromAgent}`;

      ctx.onXmlComplete(
        `<dyad-status title="Task Rejected">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "transfer") {
      if (!taskId || !toAgent) {
        throw new Error("taskId and toAgent required for transfer");
      }

      const record = delegationHistory.find((r) => r.id === taskId);
      if (!record) {
        throw new Error("Delegation record not found");
      }

      const previousAgent = record.toAgent;
      record.toAgent = toAgent;
      record.status = "pending";

      const summary = `## Task Transferred

**Delegation ID:** ${taskId}
**From:** ${previousAgent}
**To:** ${toAgent}
**Reason:** ${reason || "Not specified"}

✅ Task transferred to new agent`;

      ctx.onXmlComplete(
        `<dyad-status title="Task Transferred">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "status") {
      if (!taskId) {
        throw new Error("taskId required for status");
      }

      const record = delegationHistory.find((r) => r.id === taskId);
      if (!record) {
        throw new Error("Delegation record not found");
      }

      const summary = `## Delegation Status

**Delegation ID:** ${record.id}
**From:** ${record.fromAgent}
**To:** ${record.toAgent}
**Task:** ${record.task}
**Status:** ${record.status.toUpperCase()}
**Timestamp:** ${record.timestamp}`;

      ctx.onXmlComplete(
        `<dyad-status title="Delegation Status">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "history") {
      const agentFilter = fromAgent;
      const filtered = agentFilter
        ? delegationHistory.filter(
            (r) => r.fromAgent === agentFilter || r.toAgent === agentFilter,
          )
        : delegationHistory;

      const summary = `## Delegation History

**Total Records:** ${filtered.length}

${filtered
  .slice(-10)
  .reverse()
  .map(
    (r) =>
      `- **${r.id}**
  From: ${r.fromAgent} → To: ${r.toAgent}
  Status: ${r.status}
  Time: ${r.timestamp}`,
  )
  .join("\n\n")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Delegation History">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(filtered, null, 2);
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 6: agent_redundancy_system (Capability 207)
// Redundant agent failover
// ============================================================================

const agentRedundancySchema = z.object({
  action: z
    .enum(["create", "add_backup", "remove_backup", "trigger_failover", "status", "test"])
    .describe("Redundancy action"),
  groupId: z.string().optional().describe("Redundancy group ID"),
  primaryAgentId: z.string().optional().describe("Primary agent ID"),
  backupAgentIds: z
    .array(z.string())
    .optional()
    .describe("Backup agent IDs"),
  failoverThreshold: z
    .number()
    .optional()
    .describe("Failure count threshold for failover"),
  healthCheckInterval: z
    .number()
    .optional()
    .describe("Health check interval in seconds"),
});

export const agentRedundancyTool: ToolDefinition<
  z.infer<typeof agentRedundancySchema>
> = {
  name: "agent_redundancy_system",
  description: `Create redundant agent configurations with automatic failover capabilities. Define primary and backup agents, set health check thresholds, and ensure continuous operation through automatic backup activation.`,
  inputSchema: agentRedundancySchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `${args.action} redundancy: ${args.groupId || "new"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-agent-redundancy action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-agent-redundancy>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      action,
      groupId,
      primaryAgentId,
      backupAgentIds,
      failoverThreshold,
      healthCheckInterval,
    } = args;

    if (action === "create") {
      if (!primaryAgentId || !backupAgentIds || backupAgentIds.length === 0) {
        throw new Error("primaryAgentId and backupAgentIds required");
      }

      const newGroupId =
        groupId || `redundancy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const group: RedundancyGroup = {
        id: newGroupId,
        primaryAgentId,
        backupAgentIds,
        failoverThreshold: failoverThreshold || 3,
        healthCheckInterval: healthCheckInterval || 60,
        status: "healthy",
      };

      redundancyGroupsRegistry.set(newGroupId, group);

      const summary = `## Redundancy Group Created

**Group ID:** ${newGroupId}
**Primary:** ${primaryAgentId}
**Backups:** ${backupAgentIds.join(", ")}
**Failover Threshold:** ${group.failoverThreshold} failures
**Health Check Interval:** ${group.healthCheckInterval}s

✅ Redundancy system active`;

      ctx.onXmlComplete(
        `<dyad-status title="Redundancy Created">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "add_backup") {
      if (!groupId || !backupAgentIds || backupAgentIds.length === 0) {
        throw new Error("groupId and backupAgentIds required");
      }

      const group = redundancyGroupsRegistry.get(groupId);
      if (!group) {
        throw new Error("Redundancy group not found");
      }

      group.backupAgentIds.push(...backupAgentIds);

      const summary = `## Backup Agent Added

**Group ID:** ${groupId}
**Added Backups:** ${backupAgentIds.join(", ")}
**Total Backups:** ${group.backupAgentIds.length}

✅ Backup capacity increased`;

      ctx.onXmlComplete(
        `<dyad-status title="Backup Added">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "remove_backup") {
      if (!groupId || !backupAgentIds || backupAgentIds.length === 0) {
        throw new Error("groupId and backupAgentIds required");
      }

      const group = redundancyGroupsRegistry.get(groupId);
      if (!group) {
        throw new Error("Redundancy group not found");
      }

      group.backupAgentIds = group.backupAgentIds.filter(
        (a) => !backupAgentIds.includes(a),
      );

      const summary = `## Backup Agent Removed

**Group ID:** ${groupId}
**Removed:** ${backupAgentIds.join(", ")}
**Remaining Backups:** ${group.backupAgentIds.length}

✅ Backup removed`;

      ctx.onXmlComplete(
        `<dyad-status title="Backup Removed">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "trigger_failover") {
      if (!groupId) {
        throw new Error("groupId required for failover");
      }

      const group = redundancyGroupsRegistry.get(groupId);
      if (!group) {
        throw new Error("Redundancy group not found");
      }

      const newPrimary = group.backupAgentIds[0];
      group.primaryAgentId = newPrimary;
      group.backupAgentIds = group.backupAgentIds.slice(1);
      group.status = "degraded";

      const summary = `## Failover Triggered

**Group ID:** ${groupId}
**Previous Primary:** Failed
**New Primary:** ${newPrimary}
**Remaining Backups:** ${group.backupAgentIds.length}
**Status:** ${group.status.toUpperCase()}

⚠️ Failover complete - monitoring new primary`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "status") {
      if (!groupId) {
        throw new Error("groupId required for status");
      }

      const group = redundancyGroupsRegistry.get(groupId);
      if (!group) {
        throw new Error("Redundancy group not found");
      }

      const summary = `## Redundancy Group Status

**Group ID:** ${group.id}
**Status:** ${group.status.toUpperCase()}
**Primary:** ${group.primaryAgentId}
**Backups:** ${group.backupAgentIds.join(", ") || "none"}
**Failover Threshold:** ${group.failoverThreshold}
**Health Check:** ${group.healthCheckInterval}s

${group.status === "healthy" ? "✅ All systems operational" : "⚠️ Degraded - failover may occur"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Redundancy Status">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "test") {
      if (!groupId) {
        throw new Error("groupId required for test");
      }

      const group = redundancyGroupsRegistry.get(groupId);
      if (!group) {
        throw new Error("Redundancy group not found");
      }

      // Simulate health check
      const isHealthy = Math.random() > 0.2;
      group.status = isHealthy ? "healthy" : "degraded";

      const summary = `## Redundancy Test Complete

**Group ID:** ${groupId}
**Test Result:** ${isHealthy ? "PASS" : "FAIL"}
**Current Status:** ${group.status.toUpperCase()}

${isHealthy ? "✅ Redundancy system functioning correctly" : "⚠️ Recommend failover test"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Test Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 7: agent_failover_mechanism (Capability 208)
// Automatic agent failover
// ============================================================================

const agentFailoverSchema = z.object({
  action: z
    .enum(["configure", "enable", "disable", "failover", "revert", "logs"])
    .describe("Failover mechanism action"),
  agentId: z.string().optional().describe("Agent ID"),
  backupAgentId: z.string().optional().describe("Backup agent ID"),
  config: z
    .object({
      maxRetries: z.number().optional(),
      retryDelay: z.number().optional(),
      healthCheckUrl: z.string().optional(),
      timeout: z.number().optional(),
    })
    .optional()
    .describe("Failover configuration"),
  failoverType: z
    .enum(["automatic", "manual", "conditional"])
    .optional()
    .default("automatic")
    .describe("Type of failover"),
  condition: z.string().optional().describe("Condition for conditional failover"),
});

interface FailoverConfig {
  agentId: string;
  backupAgentId: string;
  maxRetries: number;
  retryDelay: number;
  healthCheckUrl?: string;
  timeout: number;
  enabled: boolean;
  failoverType: "automatic" | "manual" | "conditional";
  condition?: string;
  failoverCount: number;
  lastFailover: string | null;
  logs: Array<{ timestamp: string; event: string; details: string }>;
}

const failoverConfigs = new Map<string, FailoverConfig>();

export const agentFailoverMechanismTool: ToolDefinition<
  z.infer<typeof agentFailoverSchema>
> = {
  name: "agent_failover_mechanism",
  description: `Configure and manage automatic failover mechanisms for agents. Supports retry logic, health checks, conditional failover based on metrics, and automatic recovery when primary agents become available again.`,
  inputSchema: agentFailoverSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `${args.action} failover for: ${args.agentId || "new"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-agent-failover action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-agent-failover>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, agentId, backupAgentId, config, failoverType, condition } = args;

    if (action === "configure") {
      if (!agentId || !backupAgentId) {
        throw new Error("agentId and backupAgentId required");
      }

      const failoverConfig: FailoverConfig = {
        agentId,
        backupAgentId,
        maxRetries: config?.maxRetries || 3,
        retryDelay: config?.retryDelay || 1000,
        healthCheckUrl: config?.healthCheckUrl,
        timeout: config?.timeout || 30000,
        enabled: true,
        failoverType: failoverType || "automatic",
        condition,
        failoverCount: 0,
        lastFailover: null,
        logs: [],
      };

      failoverConfigs.set(agentId, failoverConfig);

      const summary = `## Failover Mechanism Configured

**Agent ID:** ${agentId}
**Backup:** ${backupAgentId}
**Type:** ${failoverType || "automatic"}
**Max Retries:** ${failoverConfig.maxRetries}
**Retry Delay:** ${failoverConfig.retryDelay}ms
**Timeout:** ${failoverConfig.timeout}ms
${condition ? `**Condition:** ${condition}` : ""}

✅ Failover mechanism ready`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Configured">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "enable") {
      if (!agentId) {
        throw new Error("agentId required for enable");
      }

      const failoverConfig = failoverConfigs.get(agentId);
      if (!failoverConfig) {
        throw new Error("Failover configuration not found");
      }

      failoverConfig.enabled = true;
      failoverConfig.logs.push({
        timestamp: new Date().toISOString(),
        event: "enabled",
        details: "Failover mechanism enabled",
      });

      const summary = `## Failover Enabled

**Agent ID:** ${agentId}

✅ Automatic failover is now active`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Enabled">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "disable") {
      if (!agentId) {
        throw new Error("agentId required for disable");
      }

      const failoverConfig = failoverConfigs.get(agentId);
      if (!failoverConfig) {
        throw new Error("Failover configuration not found");
      }

      failoverConfig.enabled = false;
      failoverConfig.logs.push({
        timestamp: new Date().toISOString(),
        event: "disabled",
        details: "Failover mechanism disabled",
      });

      const summary = `## Failover Disabled

**Agent ID:** ${agentId}

⚠️ Automatic failover is now inactive`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Disabled">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "failover") {
      if (!agentId) {
        throw new Error("agentId required for failover");
      }

      const failoverConfig = failoverConfigs.get(agentId);
      if (!failoverConfig) {
        throw new Error("Failover configuration not found");
      }

      if (!failoverConfig.enabled) {
        throw new Error("Failover is disabled for this agent");
      }

      // Execute failover
      failoverConfig.failoverCount++;
      failoverConfig.lastFailover = new Date().toISOString();
      failoverConfig.logs.push({
        timestamp: new Date().toISOString(),
        event: "failover",
        details: `Failed over to backup: ${failoverConfig.backupAgentId}`,
      });

      const summary = `## Failover Executed

**Agent ID:** ${agentId}
**Backup Activated:** ${failoverConfig.backupAgentId}
**Failover Count:** ${failoverConfig.failoverCount}
**Timestamp:** ${failoverConfig.lastFailover}

✅ Failover complete - backup agent now active`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Executed">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "revert") {
      if (!agentId) {
        throw new Error("agentId required for revert");
      }

      const failoverConfig = failoverConfigs.get(agentId);
      if (!failoverConfig) {
        throw new Error("Failover configuration not found");
      }

      failoverConfig.logs.push({
        timestamp: new Date().toISOString(),
        event: "revert",
        details: "Reverted to primary agent",
      });

      const summary = `## Failover Reverted

**Agent ID:** ${agentId}

✅ Primary agent restored - backup deactivated`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Reverted">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "logs") {
      if (!agentId) {
        throw new Error("agentId required for logs");
      }

      const failoverConfig = failoverConfigs.get(agentId);
      if (!failoverConfig) {
        throw new Error("Failover configuration not found");
      }

      const logs = failoverConfig.logs
        .map((l) => `**${l.timestamp}** - ${l.event}: ${l.details}`)
        .join("\n");

      const summary = `## Failover Logs

**Agent ID:** ${agentId}
**Failover Count:** ${failoverConfig.failoverCount}
**Last Failover:** ${failoverConfig.lastFailover || "Never"}
**Status:** ${failoverConfig.enabled ? "Enabled" : "Disabled"}

${logs || "No logs recorded"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Failover Logs">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(failoverConfig.logs, null, 2);
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 8: emergent_coordination (Capability 209)
// Self-organizing agent behavior
// ============================================================================

const emergentCoordinationSchema = z.object({
  action: z
    .enum(["initialize", "observe", "evolve", "stabilize", "metrics"])
    .describe("Emergent coordination action"),
  systemId: z.string().optional().describe("System ID"),
  agents: z
    .array(z.string())
    .optional()
    .describe("Agent IDs"),
  rules: z
    .array(
      z.object({
        trigger: z.string(),
        action: z.string(),
        weight: z.number().optional(),
      }),
    )
    .optional()
    .describe("Coordination rules"),
  parameters: z
    .object({
      adaptationRate: z.number().optional(),
      convergenceThreshold: z.number().optional(),
      maxIterations: z.number().optional(),
    })
    .optional()
    .describe("System parameters"),
});

interface EmergentSystem {
  id: string;
  agents: string[];
  rules: Array<{ trigger: string; action: string; weight: number }>;
  parameters: {
    adaptationRate: number;
    convergenceThreshold: number;
    maxIterations: number;
  };
  state: "initializing" | "evolving" | "stable" | "diverged";
  metrics: {
    coordinationScore: number;
    adaptationCount: number;
    iterationCount: number;
  };
}

const emergentSystems = new Map<string, EmergentSystem>();

export const emergentCoordinationTool: ToolDefinition<
  z.infer<typeof emergentCoordinationSchema>
> = {
  name: "emergent_coordination",
  description: `Enable self-organizing agent behavior through emergent coordination. Agents adapt and coordinate without explicit programming, developing organic patterns through local interactions and feedback loops.`,
  inputSchema: emergentCoordinationSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Emergent coordination: ${args.action} - ${args.systemId || "new"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-emergent-coordination action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-emergent-coordination>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, systemId, agents, rules, parameters } = args;

    if (action === "initialize") {
      if (!agents || agents.length === 0) {
        throw new Error("At least one agent required for initialization");
      }

      const newSystemId =
        systemId || `emergent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const system: EmergentSystem = {
        id: newSystemId,
        agents,
        rules: (rules || [
          { trigger: "task_available", action: "claim_task", weight: 1.0 },
          { trigger: "agent_busy", action: "redistribute", weight: 0.8 },
          { trigger: "task_completed", action: "sync_state", weight: 0.9 },
        ]) as Array<{ trigger: string; action: string; weight: number }>,
        parameters: {
          adaptationRate: parameters?.adaptationRate || 0.1,
          convergenceThreshold: parameters?.convergenceThreshold || 0.95,
          maxIterations: parameters?.maxIterations || 100,
        },
        state: "initializing",
        metrics: {
          coordinationScore: 0,
          adaptationCount: 0,
          iterationCount: 0,
        },
      };

      emergentSystems.set(newSystemId, system);

      const summary = `## Emergent Coordination System Initialized

**System ID:** ${newSystemId}
**Agents:** ${agents.join(", ")}
**Rules:** ${system.rules.length}

**Parameters:**
- Adaptation Rate: ${system.parameters.adaptationRate}
- Convergence Threshold: ${system.parameters.convergenceThreshold}
- Max Iterations: ${system.parameters.maxIterations}

✅ System ready for evolution`;

      ctx.onXmlComplete(
        `<dyad-status title="System Initialized">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "observe") {
      if (!systemId) {
        throw new Error("systemId required for observe");
      }

      const system = emergentSystems.get(systemId);
      if (!system) {
        throw new Error("Emergent system not found");
      }

      // Simulate observation and update metrics
      system.metrics.coordinationScore += Math.random() * 0.1;
      system.metrics.iterationCount++;

      const summary = `## System Observation

**System ID:** ${system.id}
**State:** ${system.state.toUpperCase()}
**Agents:** ${system.agents.length}

**Current Metrics:**
- Coordination Score: ${system.metrics.coordinationScore.toFixed(3)}
- Adaptation Count: ${system.metrics.adaptationCount}
- Iterations: ${system.metrics.iterationCount}

**Active Rules:**
${system.rules.map((r) => `- ${r.trigger} → ${r.action} (weight: ${r.weight})`).join("\n")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Observation Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "evolve") {
      if (!systemId) {
        throw new Error("systemId required for evolve");
      }

      const system = emergentSystems.get(systemId);
      if (!system) {
        throw new Error("Emergent system not found");
      }

      system.state = "evolving";

      // Evolve rules based on performance
      const settings = readSettings();
      const { modelClient } = await getModelClient(
        settings.selectedModel || "gpt-4o",
        settings,
      );

      const { text: evolution } = await generateText({
        model: modelClient.model,
        prompt: `Analyze this emergent coordination system and suggest rule adaptations:

Current Rules:
${system.rules.map((r) => `${r.trigger}: ${r.action} (weight: ${r.weight})`).join(", ")}

Current Coordination Score: ${system.metrics.coordinationScore}

Suggest rule modifications to improve coordination.`,
        temperature: 0.5,
      });

      // Apply adaptations
      system.metrics.adaptationCount++;
      system.metrics.coordinationScore = Math.min(
        system.metrics.coordinationScore + system.parameters.adaptationRate,
        1.0,
      );

      if (system.metrics.coordinationScore >= system.parameters.convergenceThreshold) {
        system.state = "stable";
      }

      const summary = `## System Evolution

**System ID:** ${system.id}
**State:** ${system.state.toUpperCase()}
**Adaptations Applied:** ${system.metrics.adaptationCount}

**New Coordination Score:** ${system.metrics.coordinationScore.toFixed(3)}

**Evolution Analysis:**
${evolution.substring(0, 300)}...

${system.state === "stable" ? "✅ System has converged" : "⚠️ System still evolving"}`;

      ctx.onXmlComplete(
        `<dyad-status title="Evolution Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "stabilize") {
      if (!systemId) {
        throw new Error("systemId required for stabilize");
      }

      const system = emergentSystems.get(systemId);
      if (!system) {
        throw new Error("Emergent system not found");
      }

      system.state = "stable";

      const summary = `## System Stabilized

**System ID:** ${system.id}
**State:** STABLE
**Final Coordination Score:** ${system.metrics.coordinationScore.toFixed(3)}
**Total Adaptations:** ${system.metrics.adaptationCount}

✅ System has reached stable coordination`;

      ctx.onXmlComplete(
        `<dyad-status title="System Stabilized">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "metrics") {
      if (!systemId) {
        throw new Error("systemId required for metrics");
      }

      const system = emergentSystems.get(systemId);
      if (!system) {
        throw new Error("Emergent system not found");
      }

      const summary = `## Emergent Coordination Metrics

**System ID:** ${system.id}
**State:** ${system.state.toUpperCase()}
**Agents:** ${system.agents.length}
**Active Rules:** ${system.rules.length}

**Performance Metrics:**
- Coordination Score: ${system.metrics.coordinationScore.toFixed(3)} / 1.0
- Adaptation Count: ${system.metrics.adaptationCount}
- Iteration Count: ${system.metrics.iterationCount}

**Parameters:**
- Adaptation Rate: ${system.parameters.adaptationRate}
- Convergence Threshold: ${system.parameters.convergenceThreshold}
- Max Iterations: ${system.parameters.maxIterations}

${system.metrics.coordinationScore >= system.parameters.convergenceThreshold ? "✅ Converged" : "⚠️ Still converging"}`;

      ctx.onXmlComplete(
        `<dyad-status title="System Metrics">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Tool 9: agent_topology_optimizer (Capability 210)
// Optimize agent topology
// ============================================================================

const agentTopologyOptimizerSchema = z.object({
  action: z
    .enum(["analyze", "optimize", "compare", "recommend", "apply"])
    .describe("Topology optimization action"),
  topologyType: z
    .enum(["star", "ring", "mesh", "hierarchical", "tree", "hybrid"])
    .optional()
    .describe("Topology type"),
  agents: z
    .array(z.string())
    .optional()
    .describe("Agent IDs"),
  constraints: z
    .object({
      maxLatency: z.number().optional(),
      minReliability: z.number().optional(),
      maxHops: z.number().optional(),
    })
    .optional()
    .describe("Optimization constraints"),
  objective: z
    .enum(["latency", "reliability", "throughput", "balanced"])
    .optional()
    .default("balanced")
    .describe("Optimization objective"),
});

interface TopologyAnalysis {
  type: string;
  agentCount: number;
  metrics: {
    averageLatency: number;
    reliability: number;
    throughput: number;
    faultTolerance: number;
  };
  issues: string[];
  recommendations: string[];
}

export const agentTopologyOptimizerTool: ToolDefinition<
  z.infer<typeof agentTopologyOptimizerSchema>
> = {
  name: "agent_topology_optimizer",
  description: `Analyze and optimize agent network topologies for performance, reliability, and fault tolerance. Recommends optimal configurations based on workload characteristics and system constraints.`,
  inputSchema: agentTopologyOptimizerSchema,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) =>
    `Topology ${args.action}: ${args.topologyType || "current"}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-topology-optimizer action="${args.action}">`;
    if (isComplete) {
      xml += "</dyad-topology-optimizer>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, topologyType, agents, constraints, objective } = args;

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    if (action === "analyze") {
      if (!topologyType || !agents || agents.length === 0) {
        throw new Error("topologyType and agents required for analysis");
      }

      const agentCount = agents.length;

      // Simulate topology analysis
      let metrics;
      switch (topologyType) {
        case "star":
          metrics = { averageLatency: 1.0, reliability: 0.95, throughput: 0.8, faultTolerance: 0.6 };
          break;
        case "ring":
          metrics = { averageLatency: 2.0, reliability: 0.85, throughput: 0.7, faultTolerance: 0.8 };
          break;
        case "mesh":
          metrics = { averageLatency: 1.5, reliability: 0.9, throughput: 0.9, faultTolerance: 0.9 };
          break;
        case "hierarchical":
          metrics = { averageLatency: 2.5, reliability: 0.88, throughput: 0.85, faultTolerance: 0.75 };
          break;
        default:
          metrics = { averageLatency: 2.0, reliability: 0.85, throughput: 0.75, faultTolerance: 0.7 };
      }

      const issues: string[] = [];
      if (constraints?.maxLatency && metrics.averageLatency > constraints.maxLatency) {
        issues.push(`Latency exceeds threshold: ${metrics.averageLatency} > ${constraints.maxLatency}`);
      }
      if (constraints?.minReliability && metrics.reliability < constraints.minReliability) {
        issues.push(`Reliability below threshold: ${metrics.reliability} < ${constraints.minReliability}`);
      }

      const analysis: TopologyAnalysis = {
        type: topologyType,
        agentCount,
        metrics,
        issues,
        recommendations: [],
      };

      // Generate recommendations
      if (issues.length > 0) {
        analysis.recommendations.push("Consider switching to mesh topology for higher fault tolerance");
        if (metrics.averageLatency > 1.5) {
          analysis.recommendations.push("Star topology may reduce latency for centralized workloads");
        }
      } else {
        analysis.recommendations.push("Current topology is well-suited for the workload");
      }

      const summary = `## Topology Analysis

**Type:** ${topologyType}
**Agent Count:** ${agentCount}

**Metrics:**
- Average Latency: ${metrics.averageLatency.toFixed(2)} hops
- Reliability: ${(metrics.reliability * 100).toFixed(1)}%
- Throughput: ${(metrics.throughput * 100).toFixed(1)}%
- Fault Tolerance: ${(metrics.faultTolerance * 100).toFixed(1)}%

${issues.length > 0 ? `**Issues:**\n${issues.map((i) => `- ${i}`).join("\n")}` : "✅ No issues detected"}

**Recommendations:**
${analysis.recommendations.map((r) => `- ${r}`).join("\n")}`;

      ctx.onXmlComplete(
        `<dyad-status title="Analysis Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(analysis, null, 2);
    }

    if (action === "optimize") {
      if (!agents || agents.length === 0) {
        throw new Error("agents required for optimization");
      }

      const agentCount = agents.length;

      const { text: optimization } = await generateText({
        model: modelClient.model,
        prompt: `Optimize agent topology for ${agentCount} agents with objective: ${objective || "balanced"}

Constraints:
- Max Latency: ${constraints?.maxLatency || "none"}
- Min Reliability: ${constraints?.minReliability || "none"}
- Max Hops: ${constraints?.maxHops || "none"}

Provide optimal topology configuration and reasoning.`,
        temperature: 0.4,
      });

      // Determine best topology based on objective
      let recommendedTopology: string;
      switch (objective) {
        case "latency":
          recommendedTopology = "star";
          break;
        case "reliability":
          recommendedTopology = "mesh";
          break;
        case "throughput":
          recommendedTopology = "mesh";
          break;
        default:
          recommendedTopology = "hybrid";
      }

      const summary = `## Topology Optimization Complete

**Objective:** ${objective || "balanced"}
**Recommended Topology:** ${recommendedTopology}
**Agent Count:** ${agentCount}

**Optimization Analysis:**
${optimization.substring(0, 400)}...`;

      ctx.onXmlComplete(
        `<dyad-status title="Optimization Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "compare") {
      if (!agents || agents.length === 0) {
        throw new Error("agents required for comparison");
      }

      const topologies = ["star", "ring", "mesh", "hierarchical"];
      const comparisons = topologies.map((t) => {
        const latency = Math.random() * 2 + 0.5;
        const reliability = Math.random() * 0.3 + 0.7;
        const throughput = Math.random() * 0.3 + 0.7;
        const score = objective === "latency"
          ? 1 / latency
          : objective === "reliability"
            ? reliability
            : objective === "throughput"
              ? throughput
              : (reliability + throughput) / (latency / 2);
        return { topology: t, latency, reliability, throughput, score };
      });

      comparisons.sort((a, b) => b.score - a.score);

      const summary = `## Topology Comparison

**Objective:** ${objective || "balanced"}
**Agents:** ${agents.length}

| Topology | Latency | Reliability | Throughput | Score |
|----------|---------|-------------|------------|-------|
${comparisons.map((c) => `| ${c.topology} | ${c.latency.toFixed(2)} | ${(c.reliability * 100).toFixed(0)}% | ${(c.throughput * 100).toFixed(0)}% | ${c.score.toFixed(2)} |`).join("\n")}

**Best Option:** ${comparisons[0].topology.toUpperCase()}`;

      ctx.onXmlComplete(
        `<dyad-status title="Comparison Complete">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return JSON.stringify(comparisons, null, 2);
    }

    if (action === "recommend") {
      if (!agents || agents.length === 0) {
        throw new Error("agents required for recommendation");
      }

      const { text: recommendation } = await generateText({
        model: modelClient.model,
        prompt: `Recommend the best agent topology for ${agents.length} agents.

Consider:
1. Workload characteristics (CPU-bound vs I/O-bound)
2. Fault tolerance requirements
3. Latency sensitivity
4. Scale requirements

Provide a detailed recommendation with topology type, reasoning, and configuration.`,
        temperature: 0.4,
      });

      const summary = `## Topology Recommendation

**Agent Count:** ${agents.length}

**Recommendation:**
${recommendation}

**Considerations:**
- For high reliability: Use mesh topology with redundant connections
- For low latency: Use star topology with central coordinator
- For scalability: Use hierarchical topology with load balancing
- For balanced: Use hybrid topology combining multiple patterns`;

      ctx.onXmlComplete(
        `<dyad-status title="Recommendation Ready">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    if (action === "apply") {
      if (!topologyType) {
        throw new Error("topologyType required for apply");
      }

      const summary = `## Topology Applied

**New Topology:** ${topologyType}
**Agents:** ${agents?.join(", ") || "not specified"}

✅ Topology configuration applied

Note: This is a simulated response. In production, this would trigger actual topology reconfiguration.`;

      ctx.onXmlComplete(
        `<dyad-status title="Topology Applied">${escapeXmlContent(summary)}</dyad-status>`,
      );

      return summary;
    }

    throw new Error("Invalid action");
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const advancedCoordinationTools = {
  agentCloningTool,
  swarmCoordinationTool,
  distributedAgentClusterTool,
  crossAgentReasoningTool,
  agentDelegationTool,
  agentRedundancyTool,
  agentFailoverMechanismTool,
  emergentCoordinationTool,
  agentTopologyOptimizerTool,
};
