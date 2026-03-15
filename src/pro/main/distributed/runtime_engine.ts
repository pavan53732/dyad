/**
 * Distributed Agent Runtime - Core Engine
 * 
 * Manages distributed agent execution, communication, coordination,
 * and fault tolerance across multiple nodes.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  DistributedAgent,
  DistributedNode,
  DistributedMessage,
  AgentStatus,
  AgentRole,
  AgentCapability,
  DistributedCallbacks,
  FailureEvent,
  RecoveryAction,
  Checkpoint,
  DistributionStrategy,
  DistributionResult,
  AffinityRule,
  RuntimeStats,
  AgentConfig,
  ResourceLimits,
} from "./types";

// ============================================================================
// Runtime Configuration
// ============================================================================

/**
 * Distributed runtime configuration
 */
export interface DistributedRuntimeConfig {
  /** Node ID for this instance */
  nodeId: string;
  /** Node name */
  nodeName: string;
  /** Heartbeat interval (ms) */
  heartbeatInterval: number;
  /** Agent timeout (ms) */
  agentTimeout: number;
  /** Node timeout (ms) */
  nodeTimeout: number;
  /** Maximum agents per node */
  maxAgentsPerNode: number;
  /** Enable auto-recovery */
  enableAutoRecovery: boolean;
  /** Checkpoint interval (ms) */
  checkpointInterval: number;
  /** Default distribution strategy */
  defaultDistributionStrategy: DistributionStrategy;
  /** Message buffer size */
  messageBufferSize: number;
  /** Enable load balancing */
  enableLoadBalancing: boolean;
}

/**
 * Default runtime configuration
 */
export const DEFAULT_RUNTIME_CONFIG: DistributedRuntimeConfig = {
  nodeId: uuidv4(),
  nodeName: `node-${Date.now()}`,
  heartbeatInterval: 5000,
  agentTimeout: 30000,
  nodeTimeout: 60000,
  maxAgentsPerNode: 20,
  enableAutoRecovery: true,
  checkpointInterval: 60000,
  defaultDistributionStrategy: "capability_match",
  messageBufferSize: 1000,
  enableLoadBalancing: true,
};

// ============================================================================
// Distributed Runtime Class
// ============================================================================

/**
 * Distributed Agent Runtime
 * 
 * Core engine for managing distributed agent execution.
 */
export class DistributedRuntime {
  private config: DistributedRuntimeConfig;
  private callbacks: DistributedCallbacks;
  
  // Agent and node registries
  private agents: Map<string, DistributedAgent> = new Map();
  private nodes: Map<string, DistributedNode> = new Map();
  
  // Communication
  private messageQueue: DistributedMessage[] = [];
  private channels: Map<string, Set<string>> = new Map(); // channel -> agentIds
  
  // Coordination
  private locks: Map<string, { holderId?: string; expiresAt: Date }> = new Map();
  private barriers: Map<string, { count: number; agents: Set<string> }> = new Map();
  
  // Checkpoints
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  
  // Timers
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  
  // Local node
  private localNode: DistributedNode;

  constructor(
    config: Partial<DistributedRuntimeConfig> = {},
    callbacks: DistributedCallbacks = {},
  ) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.callbacks = callbacks;
    
    // Initialize local node
    this.localNode = {
      id: this.config.nodeId,
      name: this.config.nodeName,
      status: "active",
      address: "localhost:0",
      capabilities: {
        agentTypes: ["worker", "coordinator", "specialist"],
        capabilities: ["code_generation", "code_analysis", "testing"],
        maxAgents: this.config.maxAgentsPerNode,
        maxConcurrentTasks: 50,
        canAcceptAgents: true,
        regions: ["default"],
      },
      capacity: {
        cpuCores: 8,
        memory: 16384,
        diskSpace: 500000,
        networkBandwidth: 1000,
        maxProcesses: 1000,
      },
      usage: {
        cpuPercent: 0,
        memoryUsed: 0,
        diskUsed: 0,
        networkUsed: 0,
        runningProcesses: 0,
        activeAgents: 0,
      },
      metadata: {
        os: process.platform,
        arch: process.arch,
        runtimeVersion: process.version,
        labels: {},
        version: "1.0.0",
      },
      createdAt: new Date(),
      lastHeartbeat: new Date(),
    };
    
    this.nodes.set(this.localNode.id, this.localNode);
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start the runtime
   */
  start(): void {
    // Start heartbeat timer
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatInterval);
    
    // Start recovery timer
    if (this.config.enableAutoRecovery) {
      this.recoveryTimer = setInterval(() => {
        this.checkForFailures();
      }, this.config.heartbeatInterval * 2);
    }
  }

  /**
   * Stop the runtime
   */
  async stop(): Promise<void> {
    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
    
    // Terminate all agents
    for (const agent of this.agents.values()) {
      await this.terminateAgent(agent.id);
    }
    
    // Update node status
    this.localNode.status = "offline";
  }

  // ==========================================================================
  // Agent Management
  // ==========================================================================

  /**
   * Create a new agent
   */
  createAgent(request: {
    name: string;
    role: AgentRole;
    capabilities: AgentCapability[];
    appId: number;
    config?: Partial<AgentConfig>;
    parentId?: string;
  }): DistributedAgent {
    const agentId = uuidv4();
    
    const defaultConfig: AgentConfig = {
      maxConcurrentTasks: 1,
      taskTimeout: 300,
      heartbeatInterval: 5000,
      maxRetries: 3,
      autoRecovery: true,
      enableCheckpointing: true,
      checkpointInterval: 60000,
      priority: 5,
      tags: [],
    };
    
    const defaultLimits: ResourceLimits = {
      maxMemory: 1024, // 1GB
      maxCpuCores: 1,
      maxExecutionTime: 3600, // 1 hour
      maxFileDescriptors: 100,
      maxNetworkConnections: 10,
    };
    
    const agent: DistributedAgent = {
      id: agentId,
      name: request.name,
      role: request.role,
      status: "initializing",
      capabilities: request.capabilities,
      nodeId: this.config.nodeId,
      appId: request.appId,
      parentId: request.parentId,
      childIds: [],
      completedTasks: 0,
      failedTasks: 0,
      config: { ...defaultConfig, ...request.config },
      resourceLimits: defaultLimits,
      resourceUsage: {
        memory: 0,
        cpu: 0,
        fileDescriptors: 0,
        networkConnections: 0,
        totalExecutionTime: 0,
      },
      health: {
        status: "healthy",
        lastCheck: new Date(),
        score: 100,
        issues: [],
        uptimePercentage: 100,
      },
      createdAt: new Date(),
      lastHeartbeat: new Date(),
    };
    
    // Register agent
    this.agents.set(agentId, agent);
    
    // Update parent if specified
    if (request.parentId) {
      const parent = this.agents.get(request.parentId);
      if (parent) {
        parent.childIds.push(agentId);
      }
    }
    
    // Update node
    this.localNode.agentIds.push(agentId);
    this.localNode.usage.activeAgents++;
    
    // Set status to ready after initialization
    setTimeout(() => {
      agent.status = "ready";
      agent.lastHeartbeat = new Date();
    }, 100);
    
    // Emit event
    this.callbacks.onAgentCreated?.(agent);
    
    return agent;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): DistributedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents for an app
   */
  getAgentsForApp(appId: number): DistributedAgent[] {
    return [...this.agents.values()].filter((a) => a.appId === appId);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: AgentCapability): DistributedAgent[] {
    return [...this.agents.values()].filter(
      (a) => a.capabilities.includes(capability) && a.status === "ready",
    );
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    agent.status = status;
    agent.lastHeartbeat = new Date();
    
    this.callbacks.onAgentStatusChanged?.(agent, status);
    
    return true;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    // Update status
    agent.status = "terminated";
    
    // Terminate children first
    for (const childId of agent.childIds) {
      await this.terminateAgent(childId);
    }
    
    // Update parent
    if (agent.parentId) {
      const parent = this.agents.get(agent.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== agentId);
      }
    }
    
    // Update node
    this.localNode.agentIds = this.localNode.agentIds.filter((id) => id !== agentId);
    this.localNode.usage.activeAgents--;
    
    // Emit event
    this.callbacks.onAgentTerminated?.(agent);
    
    // Remove from registry
    this.agents.delete(agentId);
    
    return true;
  }

  // ==========================================================================
  // Task Distribution
  // ==========================================================================

  /**
   * Distribute a task to an agent
   */
  distributeTask(
    taskId: string,
    appId: number,
    requiredCapabilities: AgentCapability[],
    options: {
      strategy?: DistributionStrategy;
      affinityRules?: AffinityRule[];
      preferredAgentId?: string;
    } = {},
  ): DistributionResult | null {
    const strategy = options.strategy || this.config.defaultDistributionStrategy;
    
    // Get eligible agents
    let candidates = this.getAgentsForApp(appId).filter(
      (a) =>
        a.status === "ready" &&
        requiredCapabilities.every((c) => a.capabilities.includes(c)),
    );
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Apply affinity rules
    if (options.affinityRules) {
      candidates = this.applyAffinityRules(candidates, options.affinityRules);
    }
    
    // Apply preferred agent
    if (options.preferredAgentId) {
      const preferred = candidates.find((a) => a.id === options.preferredAgentId);
      if (preferred) {
        candidates = [preferred];
      }
    }
    
    // Apply distribution strategy
    let selectedAgent: DistributedAgent;
    let score = 0;
    
    switch (strategy) {
      case "round_robin":
        selectedAgent = candidates[Math.floor(Math.random() * candidates.length)];
        score = 1;
        break;
        
      case "least_loaded":
        selectedAgent = candidates.reduce((min, a) =>
          a.completedTasks < min.completedTasks ? a : min,
        );
        score = 1 - (selectedAgent.completedTasks / 100);
        break;
        
      case "capability_match":
        selectedAgent = candidates.reduce((best, a) => {
          const matchScore = a.capabilities.filter((c) =>
            requiredCapabilities.includes(c),
          ).length;
          return matchScore > score ? a : best;
        }, candidates[0]);
        score = selectedAgent.capabilities.filter((c) =>
          requiredCapabilities.includes(c),
        ).length / requiredCapabilities.length;
        break;
        
      case "random":
        selectedAgent = candidates[Math.floor(Math.random() * candidates.length)];
        score = 0.5;
        break;
        
      default:
        selectedAgent = candidates[0];
        score = 1;
    }
    
    // Update agent status
    selectedAgent.status = "busy";
    selectedAgent.currentTaskId = taskId;
    
    return {
      taskId,
      agentId: selectedAgent.id,
      nodeId: selectedAgent.nodeId,
      strategy,
      timestamp: new Date(),
      score,
    };
  }

  /**
   * Apply affinity rules to filter/rank agents
   */
  private applyAffinityRules(
    agents: DistributedAgent[],
    rules: AffinityRule[],
  ): DistributedAgent[] {
    const scored = agents.map((agent) => {
      let score = 0;
      
      for (const rule of rules) {
        const matches = this.matchesAffinityRule(agent, rule);
        
        switch (rule.type) {
          case "require":
            if (!matches) return { agent, score: -Infinity };
            score += rule.weight;
            break;
          case "prefer":
            if (matches) score += rule.weight;
            break;
          case "avoid":
            if (matches) score -= rule.weight;
            break;
        }
      }
      
      return { agent, score };
    });
    
    // Filter out invalid and sort by score
    return scored
      .filter((s) => s.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.agent);
  }

  /**
   * Check if agent matches affinity rule
   */
  private matchesAffinityRule(agent: DistributedAgent, rule: AffinityRule): boolean {
    switch (rule.targetType) {
      case "agent":
        return agent.id === rule.targetValue || agent.name === rule.targetValue;
      case "node":
        return agent.nodeId === rule.targetValue;
      case "capability":
        return agent.capabilities.includes(rule.targetValue as AgentCapability);
      case "tag":
        return agent.config.tags.includes(rule.targetValue);
      default:
        return false;
    }
  }

  // ==========================================================================
  // Communication
  // ==========================================================================

  /**
   * Send message to agent
   */
  sendMessage(message: Omit<DistributedMessage, "id" | "timestamp">): string {
    const fullMessage: DistributedMessage = {
      id: uuidv4(),
      timestamp: new Date(),
      ...message,
    };
    
    this.messageQueue.push(fullMessage);
    
    // Trim queue if needed
    if (this.messageQueue.length > this.config.messageBufferSize) {
      this.messageQueue.shift();
    }
    
    // Handle broadcast
    if (message.targetId === "*") {
      this.handleBroadcast(fullMessage);
    }
    
    return fullMessage.id;
  }

  /**
   * Get pending messages for agent
   */
  getMessagesForAgent(agentId: string): DistributedMessage[] {
    return this.messageQueue.filter(
      (m) => m.targetId === agentId || m.targetId === "*",
    );
  }

  /**
   * Handle broadcast message
   */
  private handleBroadcast(message: DistributedMessage): void {
    for (const agent of this.agents.values()) {
      if (agent.status !== "terminated") {
        this.callbacks.onMessageReceived?.({
          ...message,
          targetId: agent.id,
        });
      }
    }
  }

  /**
   * Subscribe agent to channel
   */
  subscribeToChannel(agentId: string, channelName: string): void {
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, new Set());
    }
    this.channels.get(channelName)!.add(agentId);
  }

  /**
   * Publish to channel
   */
  publishToChannel(
    channelName: string,
    message: Omit<DistributedMessage, "id" | "timestamp" | "targetId">,
  ): void {
    const subscribers = this.channels.get(channelName);
    if (!subscribers) return;
    
    for (const agentId of subscribers) {
      this.sendMessage({
        ...message,
        targetId: agentId,
      });
    }
  }

  // ==========================================================================
  // Coordination
  // ==========================================================================

  /**
   * Acquire distributed lock
   */
  acquireLock(lockName: string, agentId: string, timeout: number): boolean {
    const existing = this.locks.get(lockName);
    
    if (existing && existing.holderId && existing.expiresAt > new Date()) {
      return false; // Lock is held by another agent
    }
    
    this.locks.set(lockName, {
      holderId: agentId,
      expiresAt: new Date(Date.now() + timeout),
    });
    
    return true;
  }

  /**
   * Release distributed lock
   */
  releaseLock(lockName: string, agentId: string): boolean {
    const lock = this.locks.get(lockName);
    
    if (!lock || lock.holderId !== agentId) {
      return false;
    }
    
    this.locks.delete(lockName);
    return true;
  }

  /**
   * Wait at barrier
   */
  waitForBarrier(barrierName: string, agentId: string, count: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.barriers.has(barrierName)) {
        this.barriers.set(barrierName, { count, agents: new Set() });
      }
      
      const barrier = this.barriers.get(barrierName)!;
      barrier.agents.add(agentId);
      
      if (barrier.agents.size >= barrier.count) {
        this.barriers.delete(barrierName);
        resolve();
      } else {
        // Poll until barrier is reached
        const check = () => {
          if (!this.barriers.has(barrierName)) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      }
    });
  }

  // ==========================================================================
  // Checkpointing
  // ==========================================================================

  /**
   * Create checkpoint for agent
   */
  createCheckpoint(agentId: string, taskId: string, data: unknown): Checkpoint {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      agentId,
      taskId,
      data,
      sequence: (this.checkpoints.get(agentId)?.length || 0) + 1,
      createdAt: new Date(),
      size: JSON.stringify(data).length,
    };
    
    if (!this.checkpoints.has(agentId)) {
      this.checkpoints.set(agentId, []);
    }
    
    this.checkpoints.get(agentId)!.push(checkpoint);
    
    return checkpoint;
  }

  /**
   * Get latest checkpoint for agent
   */
  getLatestCheckpoint(agentId: string): Checkpoint | undefined {
    const checkpoints = this.checkpoints.get(agentId);
    if (!checkpoints || checkpoints.length === 0) return undefined;
    return checkpoints[checkpoints.length - 1];
  }

  /**
   * Restore from checkpoint
   */
  restoreFromCheckpoint(agentId: string): unknown | undefined {
    const checkpoint = this.getLatestCheckpoint(agentId);
    return checkpoint?.data;
  }

  // ==========================================================================
  // Fault Tolerance
  // ==========================================================================

  /**
   * Send heartbeats to all agents
   */
  private sendHeartbeats(): void {
    const now = new Date();
    
    for (const agent of this.agents.values()) {
      if (agent.status === "terminated") continue;
      
      // Update local node heartbeat
      this.localNode.lastHeartbeat = now;
      
      // Check agent timeout
      const timeSinceLastHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > this.config.agentTimeout) {
        this.handleAgentTimeout(agent);
      }
    }
  }

  /**
   * Handle agent timeout
   */
  private handleAgentTimeout(agent: DistributedAgent): void {
    const failureEvent: FailureEvent = {
      id: uuidv4(),
      type: "timeout",
      entityId: agent.id,
      entityType: "agent",
      error: `Agent ${agent.name} timed out after ${this.config.agentTimeout}ms`,
      timestamp: new Date(),
    };
    
    this.callbacks.onFailure?.(failureEvent);
    
    if (this.config.enableAutoRecovery) {
      this.recoverAgent(agent);
    }
  }

  /**
   * Check for failures
   */
  private checkForFailures(): void {
    const now = new Date();
    
    // Check for node failures
    for (const node of this.nodes.values()) {
      if (node.id === this.localNode.id) continue;
      
      const timeSinceLastHeartbeat = now.getTime() - node.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > this.config.nodeTimeout && node.status === "active") {
        node.status = "error";
        
        const failureEvent: FailureEvent = {
          id: uuidv4(),
          type: "node_failure",
          entityId: node.id,
          entityType: "node",
          error: `Node ${node.name} failed`,
          timestamp: new Date(),
        };
        
        this.callbacks.onFailure?.(failureEvent);
      }
    }
  }

  /**
   * Recover a failed agent
   */
  private recoverAgent(agent: DistributedAgent): void {
    const recoveryAction: RecoveryAction = {
      type: "restart",
      targetId: agent.id,
      status: "in_progress",
      startedAt: new Date(),
    };
    
    // Try to restore from checkpoint
    const checkpoint = this.getLatestCheckpoint(agent.id);
    if (checkpoint) {
      recoveryAction.type = "checkpoint_restore";
    }
    
    // Reset agent state
    agent.status = "recovering";
    agent.lastHeartbeat = new Date();
    
    // If has parent, notify parent
    if (agent.parentId) {
      this.sendMessage({
        sourceId: "system",
        targetId: agent.parentId,
        type: "recovery",
        payload: { agentId: agent.id, checkpoint: checkpoint?.data },
        priority: 10,
        requiresAck: true,
      });
    }
    
    // Complete recovery
    setTimeout(() => {
      agent.status = "ready";
      recoveryAction.status = "completed";
      recoveryAction.completedAt = new Date();
      this.callbacks.onRecovery?.(recoveryAction);
    }, 1000);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get runtime statistics
   */
  getStats(): RuntimeStats {
    const agents = [...this.agents.values()];
    const nodes = [...this.nodes.values()];
    
    const completedTasks = agents.reduce((sum, a) => sum + a.completedTasks, 0);
    const failedTasks = agents.reduce((sum, a) => sum + a.failedTasks, 0);
    
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === "ready" || a.status === "busy").length,
      totalNodes: nodes.length,
      activeNodes: nodes.filter((n) => n.status === "active").length,
      tasksInProgress: agents.filter((a) => a.status === "busy").length,
      tasksCompletedLastHour: completedTasks,
      tasksFailedLastHour: failedTasks,
      averageTaskDuration: 0,
      throughput: completedTasks / 60,
      errorRate: failedTasks / (completedTasks + failedTasks) || 0,
      resourceUtilization: this.localNode.usage.cpuPercent,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get local node
   */
  getLocalNode(): DistributedNode {
    return this.localNode;
  }

  /**
   * Get all nodes
   */
  getNodes(): DistributedNode[] {
    return [...this.nodes.values()];
  }
}

// ============================================================================
// Exports
// ============================================================================

export { DistributedRuntime, DEFAULT_RUNTIME_CONFIG };
export type { DistributedRuntimeConfig };
