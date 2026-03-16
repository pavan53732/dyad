/**
 * Distributed Agent Runtime - IPC Handlers
 *
 * Provides IPC interface for renderer process to interact with the distributed runtime.
 */

import { ipcMain } from "electron";
import { DistributedRuntime, DEFAULT_RUNTIME_CONFIG } from "./runtime_engine";
import type {
  DistributedAgent,
  DistributedNode,
  AgentStatus,
  AgentRole,
  AgentCapability,
  DistributedMessage,
  DistributionResult,
  RuntimeStats,
  Checkpoint,
} from "./types";

// ============================================================================
// IPC Channel Names
// ============================================================================

export const DISTRIBUTED_IPC_CHANNELS = {
  // Agent operations
  CREATE_AGENT: "distributed:create-agent",
  TERMINATE_AGENT: "distributed:terminate-agent",
  GET_AGENT: "distributed:get-agent",
  GET_AGENTS: "distributed:get-agents",
  UPDATE_AGENT_STATUS: "distributed:update-agent-status",

  // Node operations
  GET_NODE: "distributed:get-node",
  GET_NODES: "distributed:get-nodes",
  GET_LOCAL_NODE: "distributed:get-local-node",

  // Communication operations
  SEND_MESSAGE: "distributed:send-message",
  BROADCAST_MESSAGE: "distributed:broadcast-message",
  GET_MESSAGES: "distributed:get-messages",

  // Distribution operations
  DISTRIBUTE_TASK: "distributed:distribute-task",
  ASSIGN_TASK: "distributed:assign-task",

  // Checkpoint operations
  CREATE_CHECKPOINT: "distributed:create-checkpoint",
  GET_CHECKPOINT: "distributed:get-checkpoint",
  RESTORE_CHECKPOINT: "distributed:restore-checkpoint",

  // Statistics
  GET_STATS: "distributed:get-stats",

  // Lifecycle
  START_RUNTIME: "distributed:start",
  STOP_RUNTIME: "distributed:stop",

  // Events
  ON_RUNTIME_EVENT: "distributed:on-event",
} as const;

// ============================================================================
// IPC Request/Response Types
// ============================================================================

export interface CreateAgentRequest {
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  appId: number;
  config?: Partial<DistributedAgent["config"]>;
  parentId?: string;
}

export interface CreateAgentResponse {
  success: boolean;
  agent?: DistributedAgent;
  error?: string;
}

export interface SendMessageRequest {
  sourceId: string;
  targetId: string;
  type: DistributedMessage["type"];
  payload: unknown;
  priority?: number;
  requiresAck?: boolean;
}

export interface DistributeTaskRequest {
  taskId: string;
  strategy?: "round_robin" | "least_loaded" | "capability_match" | "random";
  requiredCapabilities?: AgentCapability[];
  preferredAgentId?: string;
  affinityRules?: Array<{
    type: "prefer" | "avoid" | "require";
    targetType: "agent" | "node" | "capability" | "tag";
    targetValue: string;
    weight: number;
  }>;
}

// ============================================================================
// Distributed IPC Handler Class
// ============================================================================

/**
 * Manages IPC handlers for the distributed runtime
 */
export class DistributedIpcHandlers {
  private runtime: DistributedRuntime;
  private eventListeners: Set<(event: unknown) => void> = new Set();

  constructor() {
    this.runtime = new DistributedRuntime(DEFAULT_RUNTIME_CONFIG, {
      onAgentCreated: (agent) => this.handleAgentEvent("agent_created", agent),
      onAgentStatusChanged: (agent, status) =>
        this.handleAgentStatusEvent("agent_status_changed", agent, status),
      onAgentTerminated: (agent) =>
        this.handleAgentEvent("agent_terminated", agent),
      onNodeJoined: (node) => this.handleNodeEvent("node_joined", node),
      onNodeLeft: (node) => this.handleNodeEvent("node_left", node),
      onMessageReceived: (message) => this.handleMessageEvent(message),
      onFailure: (event) => this.handleFailureEvent(event),
      onRecovery: (action) => this.handleRecoveryEvent(action),
    });

    this.registerHandlers();
  }

  /**
   * Register all IPC handlers
   */
  private registerHandlers(): void {
    // Agent operations
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.CREATE_AGENT,
      async (_, req: CreateAgentRequest): Promise<CreateAgentResponse> => {
        try {
          const agent = this.runtime.createAgent({
            name: req.name,
            role: req.role,
            capabilities: req.capabilities,
            appId: req.appId,
            config: req.config,
            parentId: req.parentId,
          });
          return { success: true, agent };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.TERMINATE_AGENT,
      async (_, agentId: string): Promise<{ success: boolean }> => {
        try {
          await this.runtime.terminateAgent(agentId);
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_AGENT,
      async (
        _,
        agentId: string,
      ): Promise<{ success: boolean; agent?: DistributedAgent }> => {
        const agent = this.runtime.getAgent(agentId);
        return { success: !!agent, agent };
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_AGENTS,
      async (
        _,
        appId?: number,
      ): Promise<{ success: boolean; agents: DistributedAgent[] }> => {
        const agents = appId
          ? this.runtime.getAgentsForApp(appId)
          : this.runtime.getAllAgents();
        return { success: true, agents };
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.UPDATE_AGENT_STATUS,
      async (
        _,
        req: { agentId: string; status: AgentStatus },
      ): Promise<{ success: boolean }> => {
        try {
          this.runtime.updateAgentStatus(req.agentId, req.status);
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    // Node operations
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_NODE,
      async (
        _,
        nodeId: string,
      ): Promise<{ success: boolean; node?: DistributedNode }> => {
        const node = this.runtime.getNode(nodeId);
        return { success: !!node, node };
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_NODES,
      async (): Promise<{ success: boolean; nodes: DistributedNode[] }> => {
        const nodes = this.runtime.getNodes();
        return { success: true, nodes };
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_LOCAL_NODE,
      async (): Promise<{ success: boolean; node?: DistributedNode }> => {
        const node = this.runtime.getLocalNode();
        return { success: true, node };
      },
    );

    // Communication operations
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.SEND_MESSAGE,
      async (
        _,
        req: SendMessageRequest,
      ): Promise<{ success: boolean; messageId?: string }> => {
        try {
          const message = this.runtime.sendMessage({
            sourceId: req.sourceId,
            targetId: req.targetId,
            type: req.type,
            payload: req.payload,
            priority: req.priority || 5,
            requiresAck: req.requiresAck || false,
          });
          return { success: true, messageId: message.id };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.BROADCAST_MESSAGE,
      async (
        _,
        req: Omit<SendMessageRequest, "targetId">,
      ): Promise<{ success: boolean; messageIds?: string[] }> => {
        try {
          const messages = this.runtime.broadcastMessage({
            sourceId: req.sourceId,
            type: req.type,
            payload: req.payload,
            priority: req.priority || 5,
          });
          return { success: true, messageIds: messages.map((m) => m.id) };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_MESSAGES,
      async (
        _,
        agentId: string,
      ): Promise<{ success: boolean; messages: DistributedMessage[] }> => {
        const messages = this.runtime.getMessagesForAgent(agentId);
        return { success: true, messages };
      },
    );

    // Distribution operations
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.DISTRIBUTE_TASK,
      async (
        _,
        req: DistributeTaskRequest,
      ): Promise<{ success: boolean; result?: DistributionResult }> => {
        try {
          const result = this.runtime.distributeTask(req);
          return { success: true, result };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.ASSIGN_TASK,
      async (
        _,
        req: { agentId: string; taskId: string },
      ): Promise<{ success: boolean }> => {
        try {
          this.runtime.assignTask(req.agentId, req.taskId);
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    // Checkpoint operations
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.CREATE_CHECKPOINT,
      async (
        _,
        req: { agentId: string; taskId: string; data: unknown },
      ): Promise<{ success: boolean; checkpoint?: Checkpoint }> => {
        try {
          const checkpoint = this.runtime.createCheckpoint(
            req.agentId,
            req.taskId,
            req.data,
          );
          return { success: true, checkpoint };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_CHECKPOINT,
      async (
        _,
        agentId: string,
      ): Promise<{ success: boolean; checkpoint?: Checkpoint }> => {
        const checkpoint = this.runtime.getLatestCheckpoint(agentId);
        return { success: !!checkpoint, checkpoint };
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.RESTORE_CHECKPOINT,
      async (
        _,
        agentId: string,
      ): Promise<{ success: boolean; data?: unknown }> => {
        try {
          const data = this.runtime.restoreFromCheckpoint(agentId);
          return { success: data !== undefined, data };
        } catch {
          return { success: false };
        }
      },
    );

    // Statistics
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.GET_STATS,
      async (): Promise<{ success: boolean; stats?: RuntimeStats }> => {
        const stats = this.runtime.getStats();
        return { success: true, stats };
      },
    );

    // Lifecycle
    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.START_RUNTIME,
      async (): Promise<{ success: boolean }> => {
        try {
          this.runtime.start();
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      DISTRIBUTED_IPC_CHANNELS.STOP_RUNTIME,
      async (): Promise<{ success: boolean }> => {
        try {
          await this.runtime.stop();
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );
  }

  /**
   * Handle agent event
   */
  private handleAgentEvent(type: string, agent: DistributedAgent): void {
    this.broadcastToRenderer({
      type,
      data: { agent },
      timestamp: new Date(),
    });
  }

  /**
   * Handle agent status event
   */
  private handleAgentStatusEvent(
    type: string,
    agent: DistributedAgent,
    status: AgentStatus,
  ): void {
    this.broadcastToRenderer({
      type,
      data: { agent, status },
      timestamp: new Date(),
    });
  }

  /**
   * Handle node event
   */
  private handleNodeEvent(type: string, node: DistributedNode): void {
    this.broadcastToRenderer({
      type,
      data: { node },
      timestamp: new Date(),
    });
  }

  /**
   * Handle message event
   */
  private handleMessageEvent(message: DistributedMessage): void {
    this.broadcastToRenderer({
      type: "message_received",
      data: { message },
      timestamp: new Date(),
    });
  }

  /**
   * Handle failure event
   */
  private handleFailureEvent(event: unknown): void {
    this.broadcastToRenderer({
      type: "failure",
      data: { event },
      timestamp: new Date(),
    });
  }

  /**
   * Handle recovery event
   */
  private handleRecoveryEvent(action: unknown): void {
    this.broadcastToRenderer({
      type: "recovery",
      data: { action },
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast event to renderer
   */
  private broadcastToRenderer(event: unknown): void {
    this.eventListeners.forEach((fn) => fn(event));
    // In real implementation, send to BrowserWindow via IPC
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: unknown) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Get runtime instance
   */
  getRuntime(): DistributedRuntime {
    return this.runtime;
  }

  /**
   * Unregister all handlers
   */
  unregister(): void {
    Object.values(DISTRIBUTED_IPC_CHANNELS).forEach((channel) => {
      ipcMain.removeHandler(channel);
    });
    this.eventListeners.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let distributedIpcHandlers: DistributedIpcHandlers | null = null;

export function initDistributedIpcHandlers(): DistributedIpcHandlers {
  if (!distributedIpcHandlers) {
    distributedIpcHandlers = new DistributedIpcHandlers();
  }
  return distributedIpcHandlers;
}

export function getDistributedIpcHandlers(): DistributedIpcHandlers | null {
  return distributedIpcHandlers;
}
