/**
 * Team Coordinator Tool
 * Capabilities 441-460: Coordinate multiple agents working on same task
 * - Task delegation and load balancing
 * - Conflict resolution between agents
 * - Progress tracking and synchronization
 * - Agent communication protocols
 */

import { z } from "zod";
import { ToolDefinition } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const TeamCoordinatorArgs = z.object({
  /** Action to perform */
  action: z.enum([
    "delegate_task",
    "check_progress",
    "resolve_conflict",
    "balance_load",
    "sync_state",
    "get_agent_status",
  ]),
  /** Task ID to delegate or track */
  taskId: z.string().optional(),
  /** Description of the task to delegate */
  taskDescription: z.string().optional(),
  /** Priority of the task (1-5, 1 is highest) */
  priority: z.number().min(1).max(5).default(3),
  /** Agent ID(s) to assign the task to */
  agentIds: z.array(z.string()).default([]),
  /** Maximum agents to assign */
  maxAgents: z.number().min(1).max(10).default(3),
  /** Conflict ID to resolve */
  conflictId: z.string().optional(),
  /** Conflict resolution strategy */
  resolutionStrategy: z
    .enum(["first_wins", "last_wins", "merge", "manual", "priority_based"])
    .default("priority_based"),
  /** Session ID for state synchronization */
  sessionId: z.string().optional(),
});

type TeamCoordinatorArgs = z.infer<typeof TeamCoordinatorArgs>;

// ============================================================================
// Types
// ============================================================================

type AgentStatus = "idle" | "busy" | "blocked" | "completed";
type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "failed";

interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTaskId?: string;
  capabilities: string[];
  workload: number; // 0-100
}

interface Task {
  id: string;
  description: string;
  priority: number;
  status: TaskStatus;
  assignedAgents: string[];
  progress: number; // 0-100
  dependencies: string[];
  result?: unknown;
}

interface Conflict {
  id: string;
  type: "resource" | "dependency" | "deadlock";
  involvedAgents: string[];
  involvedTasks: string[];
  description: string;
  resolved: boolean;
}

interface CoordinationResult {
  action: string;
  success: boolean;
  message: string;
  data?: {
    taskId?: string;
    agentId?: string;
    progress?: number;
    conflict?: Conflict;
    agents?: Agent[];
    tasks?: Task[];
    loadBalanced?: boolean;
    stateSynced?: boolean;
    sessionId?: string;
  };
}

// ============================================================================
// In-Memory State (simulates team coordination)
// ============================================================================

// Simulated agent registry
const agentRegistry = new Map<string, Agent>();
const taskRegistry = new Map<string, Task>();
const conflictRegistry = new Map<string, Conflict>();

// Initialize some demo agents
const demoAgents: Agent[] = [
  {
    id: "agent-1",
    name: "Code Reviewer",
    status: "idle",
    capabilities: ["code_review", "security_scan", "style_check"],
    workload: 20,
  },
  {
    id: "agent-2",
    name: "Feature Developer",
    status: "idle",
    capabilities: ["code_write", "test_write", "refactor"],
    workload: 30,
  },
  {
    id: "agent-3",
    name: "Documentation Agent",
    status: "idle",
    capabilities: ["docs_write", "api_docs", "readme"],
    workload: 15,
  },
  {
    id: "agent-4",
    name: "Test Engineer",
    status: "idle",
    capabilities: ["test_write", "test_run", "coverage"],
    workload: 25,
  },
];

// Initialize demo agents
demoAgents.forEach((agent) => agentRegistry.set(agent.id, agent));

// ============================================================================
// Coordination Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Delegate a task to available agents
 */
function delegateTask(args: TeamCoordinatorArgs): CoordinationResult {
  if (!args.taskDescription) {
    return {
      action: "delegate_task",
      success: false,
      message: "Task description is required",
    };
  }

  const taskId = args.taskId || generateId("task");
  const task: Task = {
    id: taskId,
    description: args.taskDescription,
    priority: args.priority,
    status: "pending",
    assignedAgents: [],
    progress: 0,
    dependencies: [],
  };

  // Find available agents with lowest workload
  const availableAgents = Array.from(agentRegistry.values())
    .filter((agent) => agent.status === "idle")
    .sort((a, b) => a.workload - b.workload)
    .slice(0, args.maxAgents);

  if (availableAgents.length === 0) {
    // Find agents with lowest workload regardless of status
    const leastBusyAgents = Array.from(agentRegistry.values())
      .sort((a, b) => a.workload - b.workload)
      .slice(0, args.maxAgents);

    if (leastBusyAgents.length === 0) {
      return {
        action: "delegate_task",
        success: false,
        message: "No agents available in the registry",
      };
    }

    // Assign to least busy agents
    leastBusyAgents.forEach((agent) => {
      agent.status = "busy";
      agent.currentTaskId = taskId;
      agent.workload = Math.min(100, agent.workload + 20);
      task.assignedAgents.push(agent.id);
      agentRegistry.set(agent.id, agent);
    });

    task.status = "in_progress";
    taskRegistry.set(taskId, task);

    return {
      action: "delegate_task",
      success: true,
      message: `Task delegated to ${leastBusyAgents.length} agent(s)`,
      data: {
        taskId,
        agents: leastBusyAgents,
        tasks: [task],
      },
    };
  }

  // Assign to available agents
  availableAgents.forEach((agent) => {
    agent.status = "busy";
    agent.currentTaskId = taskId;
    agent.workload = Math.min(100, agent.workload + 20);
    task.assignedAgents.push(agent.id);
    agentRegistry.set(agent.id, agent);
  });

  task.status = "in_progress";
  taskRegistry.set(taskId, task);

  return {
    action: "delegate_task",
    success: true,
    message: `Task delegated to ${availableAgents.length} agent(s)`,
    data: {
      taskId,
      agents: availableAgents,
      tasks: [task],
    },
  };
}

/**
 * Check progress of tasks
 */
function checkProgress(args: TeamCoordinatorArgs): CoordinationResult {
  const allTasks = Array.from(taskRegistry.values());
  const allAgents = Array.from(agentRegistry.values());

  if (args.taskId) {
    const task = taskRegistry.get(args.taskId);
    if (!task) {
      return {
        action: "check_progress",
        success: false,
        message: `Task ${args.taskId} not found`,
      };
    }

    const assignedAgents = allAgents.filter((a) =>
      task.assignedAgents.includes(a.id),
    );

    return {
      action: "check_progress",
      success: true,
      message: `Task progress: ${task.progress}%`,
      data: {
        taskId: task.id,
        progress: task.progress,
        agents: assignedAgents,
        tasks: [task],
      },
    };
  }

  // Return all tasks and agents
  return {
    action: "check_progress",
    success: true,
    message: `Tracking ${allTasks.length} tasks across ${allAgents.length} agents`,
    data: {
      agents: allAgents,
      tasks: allTasks,
      progress: Math.round(
        allTasks.reduce((sum, t) => sum + t.progress, 0) /
          (allTasks.length || 1),
      ),
    },
  };
}

/**
 * Resolve conflicts between agents
 */
function resolveConflict(args: TeamCoordinatorArgs): CoordinationResult {
  if (!args.conflictId) {
    // Find any unresolved conflict
    const unresolved = Array.from(conflictRegistry.values()).find(
      (c) => !c.resolved,
    );
    if (!unresolved) {
      return {
        action: "resolve_conflict",
        success: true,
        message: "No conflicts to resolve",
      };
    }
    return resolveConflictWithStrategy(unresolved, args.resolutionStrategy);
  }

  const conflict = conflictRegistry.get(args.conflictId);
  if (!conflict) {
    return {
      action: "resolve_conflict",
      success: false,
      message: `Conflict ${args.conflictId} not found`,
    };
  }

  return resolveConflictWithStrategy(conflict, args.resolutionStrategy);
}

/**
 * Resolve a conflict using the specified strategy
 */
function resolveConflictWithStrategy(
  conflict: Conflict,
  strategy: string,
): CoordinationResult {
  conflict.resolved = true;
  conflictRegistry.set(conflict.id, conflict);

  let resolutionMessage = "";
  switch (strategy) {
    case "first_wins":
      resolutionMessage = `Resolved: First agent (${conflict.involvedAgents[0]}) wins`;
      break;
    case "last_wins":
      resolutionMessage = `Resolved: Last agent (${conflict.involvedAgents[conflict.involvedAgents.length - 1]}) wins`;
      break;
    case "merge":
      resolutionMessage = "Resolved: Changes merged";
      break;
    case "manual":
      resolutionMessage = "Marked for manual resolution";
      break;
    case "priority_based":
      resolutionMessage = "Resolved: Based on task priority";
      break;
  }

  return {
    action: "resolve_conflict",
    success: true,
    message: resolutionMessage,
    data: {
      conflict,
    },
  };
}

/**
 * Balance workload across agents
 */
function balanceLoad(args: TeamCoordinatorArgs): CoordinationResult {
  const allAgents = Array.from(agentRegistry.values());

  // Calculate average workload
  const avgWorkload =
    allAgents.reduce((sum, a) => sum + a.workload, 0) / allAgents.length;

  // Reassign tasks from overloaded agents to underutilized ones
  const overloadedAgents = allAgents.filter(
    (a) => a.workload > avgWorkload + 20,
  );
  const underutilizedAgents = allAgents.filter(
    (a) => a.workload < avgWorkload - 20,
  );

  let rebalanced = 0;
  for (const overloaded of overloadedAgents) {
    if (underutilizedAgents.length === 0) break;

    const target = underutilizedAgents.shift()!;
    if (overloaded.currentTaskId) {
      // Move task from overloaded to underutilized
      const task = taskRegistry.get(overloaded.currentTaskId);
      if (task) {
        overloaded.status = "idle";
        overloaded.currentTaskId = undefined;
        target.status = "busy";
        target.currentTaskId = task.id;
        target.workload = Math.min(100, target.workload + 20);
        overloaded.workload = Math.max(0, overloaded.workload - 20);
        task.assignedAgents = [target.id];

        agentRegistry.set(overloaded.id, overloaded);
        agentRegistry.set(target.id, target);
        taskRegistry.set(task.id, task);
        rebalanced++;
      }
    }
  }

  return {
    action: "balance_load",
    success: true,
    message: `Load balancing complete: ${rebalanced} task(s) rebalanced`,
    data: {
      agents: Array.from(agentRegistry.values()),
      loadBalanced: true,
    },
  };
}

/**
 * Synchronize state across agents
 */
function syncState(args: TeamCoordinatorArgs): CoordinationResult {
  const sessionId = args.sessionId || generateId("session");

  const allAgents = Array.from(agentRegistry.values());
  const allTasks = Array.from(taskRegistry.values());

  // Simulate state sync
  return {
    action: "sync_state",
    success: true,
    message: `State synchronized for session ${sessionId}`,
    data: {
      sessionId,
      agents: allAgents,
      tasks: allTasks,
      stateSynced: true,
    },
  };
}

/**
 * Get agent status
 */
function getAgentStatus(): CoordinationResult {
  const allAgents = Array.from(agentRegistry.values());
  const allTasks = Array.from(taskRegistry.values());
  const allConflicts = Array.from(conflictRegistry.values());

  const idleCount = allAgents.filter((a) => a.status === "idle").length;
  const busyCount = allAgents.filter((a) => a.status === "busy").length;

  return {
    action: "get_agent_status",
    success: true,
    message: `Team status: ${idleCount} idle, ${busyCount} busy, ${allTasks.length} tasks, ${allConflicts.filter((c) => !c.resolved).length} conflicts`,
    data: {
      agents: allAgents,
      tasks: allTasks,
      progress: Math.round(
        allTasks.length > 0
          ? allTasks.reduce((sum, t) => sum + t.progress, 0) / allTasks.length
          : 0,
      ),
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateCoordinationXml(result: CoordinationResult): string {
  const lines: string[] = [
    `# Team Coordinator`,
    ``,
    `**Action:** ${result.action}`,
    `**Status:** ${result.success ? "✅ Success" : "❌ Failed"}`,
    ``,
    result.message,
    ``,
  ];

  if (result.data) {
    if (result.data.agents && result.data.agents.length > 0) {
      lines.push(`## Agents`);
      lines.push(``);
      for (const agent of result.data.agents) {
        const statusEmoji =
          agent.status === "idle"
            ? "🟢"
            : agent.status === "busy"
              ? "🔴"
              : agent.status === "blocked"
                ? "🟡"
                : "✅";
        lines.push(
          `- ${statusEmoji} **${agent.name}** (${agent.id}) - ${agent.status} - ${agent.workload}% workload`,
        );
      }
      lines.push(``);
    }

    if (result.data.tasks && result.data.tasks.length > 0) {
      lines.push(`## Tasks`);
      lines.push(``);
      for (const task of result.data.tasks) {
        const statusEmoji =
          task.status === "completed"
            ? "✅"
            : task.status === "in_progress"
              ? "🔄"
              : task.status === "blocked"
                ? "🛑"
                : task.status === "failed"
                  ? "❌"
                  : "⏳";
        lines.push(
          `- ${statusEmoji} **${task.id}**: ${task.description} (${task.progress}% - ${task.status})`,
        );
      }
      lines.push(``);
    }

    if (result.data.conflict) {
      lines.push(`## Conflict Resolution`);
      lines.push(``);
      lines.push(`**Conflict:** ${result.data.conflict.description}`);
      lines.push(
        `**Resolved:** ${result.data.conflict.resolved ? "Yes" : "No"}`,
      );
      lines.push(``);
    }

    if (result.data.progress !== undefined) {
      lines.push(`## Overall Progress`);
      lines.push(``);
      lines.push(`**Progress:** ${result.data.progress}%`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const teamCoordinatorTool: ToolDefinition<TeamCoordinatorArgs> = {
  name: "team_coordinator",
  description:
    "Coordinates multiple agents working on the same task. Use this to delegate tasks, check progress, resolve conflicts, balance load, and synchronize state across agents in a multi-agent system.",
  inputSchema: TeamCoordinatorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Team Coordinator">Processing ${args.action}...</dyad-status>`,
    );

    let result: CoordinationResult;

    switch (args.action) {
      case "delegate_task":
        result = delegateTask(args);
        break;
      case "check_progress":
        result = checkProgress(args);
        break;
      case "resolve_conflict":
        result = resolveConflict(args);
        break;
      case "balance_load":
        result = balanceLoad(args);
        break;
      case "sync_state":
        result = syncState(args);
        break;
      case "get_agent_status":
        result = getAgentStatus();
        break;
      default:
        result = {
          action: args.action,
          success: false,
          message: `Unknown action: ${args.action}`,
        };
    }

    const report = generateCoordinationXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Team Coordinator Complete">${result.message}</dyad-status>`,
    );

    return report;
  },
};
