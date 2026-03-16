/**
 * Distributed Agent Runtime - Type Definitions
 *
 * Defines types for distributed agent execution, communication,
 * coordination, and fault tolerance.
 */

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent status in the distributed system
 */
export type AgentStatus =
  | "initializing" // Agent is being created
  | "ready" // Agent is ready to accept work
  | "busy" // Agent is executing a task
  | "paused" // Agent is paused
  | "error" // Agent is in error state
  | "terminated" // Agent has been terminated
  | "migrating" // Agent is being migrated to another node
  | "recovering"; // Agent is recovering from failure

/**
 * Agent capability type
 */
export type AgentCapability =
  | "code_generation" // Can generate code
  | "code_analysis" // Can analyze code
  | "testing" // Can run tests
  | "planning" // Can plan tasks
  | "coordination" // Can coordinate other agents
  | "monitoring" // Can monitor execution
  | "specialized"; // Specialized capability

/**
 * Agent role in the distributed system
 */
export type AgentRole =
  | "worker" // Executes tasks
  | "coordinator" // Coordinates workers
  | "specialist" // Specialized tasks
  | "supervisor" // Supervises other agents
  | "monitor"; // Monitors system health

/**
 * Distributed agent instance
 */
export interface DistributedAgent {
  /** Unique agent identifier */
  id: string;
  /** Agent name */
  name: string;
  /** Agent role */
  role: AgentRole;
  /** Current status */
  status: AgentStatus;
  /** Capabilities this agent has */
  capabilities: AgentCapability[];
  /** Node ID where agent is running */
  nodeId: string;
  /** Application ID */
  appId: number;
  /** Parent agent ID (if spawned by another agent) */
  parentId?: string;
  /** Child agent IDs */
  childIds: string[];
  /** Current task ID being executed */
  currentTaskId?: string;
  /** Completed task count */
  completedTasks: number;
  /** Failed task count */
  failedTasks: number;
  /** Agent configuration */
  config: AgentConfig;
  /** Resource limits */
  resourceLimits: ResourceLimits;
  /** Current resource usage */
  resourceUsage: ResourceUsage;
  /** Health status */
  health: AgentHealth;
  /** Creation timestamp */
  createdAt: Date;
  /** Last heartbeat */
  lastHeartbeat: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
  /** Task timeout (seconds) */
  taskTimeout: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Auto-recovery enabled */
  autoRecovery: boolean;
  /** Checkpointing enabled */
  enableCheckpointing: boolean;
  /** Checkpoint interval (ms) */
  checkpointInterval: number;
  /** Priority for task assignment */
  priority: number;
  /** Tags for task matching */
  tags: string[];
}

/**
 * Agent resource limits
 */
export interface ResourceLimits {
  /** Maximum memory (MB) */
  maxMemory: number;
  /** Maximum CPU cores */
  maxCpuCores: number;
  /** Maximum execution time (seconds) */
  maxExecutionTime: number;
  /** Maximum file descriptors */
  maxFileDescriptors: number;
  /** Maximum network connections */
  maxNetworkConnections: number;
}

/**
 * Agent resource usage
 */
export interface ResourceUsage {
  /** Current memory usage (MB) */
  memory: number;
  /** Current CPU usage (percentage) */
  cpu: number;
  /** Current file descriptors */
  fileDescriptors: number;
  /** Current network connections */
  networkConnections: number;
  /** Total execution time (seconds) */
  totalExecutionTime: number;
}

/**
 * Agent health status
 */
export interface AgentHealth {
  /** Overall health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Last health check */
  lastCheck: Date;
  /** Health score (0-100) */
  score: number;
  /** Active issues */
  issues: HealthIssue[];
  /** Uptime percentage */
  uptimePercentage: number;
}

/**
 * Health issue
 */
export interface HealthIssue {
  /** Issue type */
  type: "memory" | "cpu" | "network" | "error_rate" | "timeout" | "custom";
  /** Severity */
  severity: "warning" | "critical";
  /** Description */
  description: string;
  /** First occurrence */
  firstSeen: Date;
  /** Last occurrence */
  lastSeen: Date;
  /** Occurrence count */
  count: number;
}

// ============================================================================
// Node Types
// ============================================================================

/**
 * Node status in the distributed cluster
 */
export type NodeStatus =
  | "joining" // Node is joining the cluster
  | "active" // Node is active and accepting work
  | "draining" // Node is draining tasks
  | "leaving" // Node is leaving the cluster
  | "offline" // Node is offline
  | "error"; // Node is in error state

/**
 * Distributed node instance
 */
export interface DistributedNode {
  /** Unique node identifier */
  id: string;
  /** Node name */
  name: string;
  /** Node status */
  status: NodeStatus;
  /** Node address (host:port) */
  address: string;
  /** Node capabilities */
  capabilities: NodeCapabilities;
  /** Agents running on this node */
  agentIds: string[];
  /** Resource capacity */
  capacity: NodeCapacity;
  /** Current resource usage */
  usage: NodeUsage;
  /** Node metadata */
  metadata: NodeMetadata;
  /** Creation timestamp */
  createdAt: Date;
  /** Last heartbeat */
  lastHeartbeat: Date;
}

/**
 * Node capabilities
 */
export interface NodeCapabilities {
  /** Supported agent types */
  agentTypes: AgentRole[];
  /** Supported capabilities */
  capabilities: AgentCapability[];
  /** Maximum agents this node can host */
  maxAgents: number;
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
  /** Whether node can accept new agents */
  canAcceptAgents: boolean;
  /** Supported regions/zones */
  regions: string[];
}

/**
 * Node resource capacity
 */
export interface NodeCapacity {
  /** Total CPU cores */
  cpuCores: number;
  /** Total memory (MB) */
  memory: number;
  /** Total disk space (MB) */
  diskSpace: number;
  /** Network bandwidth (Mbps) */
  networkBandwidth: number;
  /** Maximum processes */
  maxProcesses: number;
}

/**
 * Node resource usage
 */
export interface NodeUsage {
  /** CPU usage (percentage) */
  cpuPercent: number;
  /** Memory usage (MB) */
  memoryUsed: number;
  /** Disk usage (MB) */
  diskUsed: number;
  /** Network usage (Mbps) */
  networkUsed: number;
  /** Running processes */
  runningProcesses: number;
  /** Active agents */
  activeAgents: number;
}

/**
 * Node metadata
 */
export interface NodeMetadata {
  /** Operating system */
  os: string;
  /** Architecture */
  arch: string;
  /** Runtime version */
  runtimeVersion: string;
  /** Geographic region */
  region?: string;
  /** Availability zone */
  availabilityZone?: string;
  /** Custom labels */
  labels: Record<string, string>;
  /** Node version */
  version: string;
}

// ============================================================================
// Communication Types
// ============================================================================

/**
 * Message types for inter-agent communication
 */
export type MessageType =
  | "task_assignment" // Assign task to agent
  | "task_result" // Task result from agent
  | "task_cancel" // Cancel task
  | "heartbeat" // Heartbeat ping
  | "heartbeat_ack" // Heartbeat acknowledgment
  | "status_update" // Status update
  | "error_report" // Error report
  | "coordination" // Coordination message
  | "knowledge_share" // Knowledge sharing
  | "checkpoint" // Checkpoint data
  | "recovery" // Recovery message
  | "migration" // Migration message
  | "broadcast"; // Broadcast message

/**
 * Distributed message
 */
export interface DistributedMessage {
  /** Message ID */
  id: string;
  /** Message type */
  type: MessageType;
  /** Source agent/node ID */
  sourceId: string;
  /** Target agent/node ID (or '*' for broadcast) */
  targetId: string;
  /** Correlation ID for request/response */
  correlationId?: string;
  /** Message payload */
  payload: unknown;
  /** Priority (higher = more urgent) */
  priority: number;
  /** Timestamp */
  timestamp: Date;
  /** Time-to-live (ms) */
  ttl?: number;
  /** Requires acknowledgment */
  requiresAck: boolean;
  /** Acknowledgment status */
  ackStatus?: "pending" | "acknowledged" | "failed";
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Communication channel
 */
export interface CommunicationChannel {
  /** Channel ID */
  id: string;
  /** Channel name */
  name: string;
  /** Channel type */
  type: "direct" | "broadcast" | "topic" | "queue";
  /** Subscribed agents */
  subscribers: string[];
  /** Message buffer size */
  bufferSize: number;
  /** Whether channel is persistent */
  persistent: boolean;
  /** Created at */
  createdAt: Date;
}

// ============================================================================
// Coordination Types
// ============================================================================

/**
 * Coordination type
 */
export type CoordinationType =
  | "leader_election" // Elect a leader
  | "consensus" // Reach consensus
  | "barrier" // Synchronization barrier
  | "lock" // Distributed lock
  | "semaphore" // Distributed semaphore
  | "task_distribution"; // Distribute tasks

/**
 * Coordination request
 */
export interface CoordinationRequest {
  /** Request ID */
  id: string;
  /** Coordination type */
  type: CoordinationType;
  /** Initiating agent ID */
  initiatorId: string;
  /** Participating agent IDs */
  participants: string[];
  /** Request payload */
  payload: unknown;
  /** Timeout (ms) */
  timeout: number;
  /** Created at */
  createdAt: Date;
}

/**
 * Coordination response
 */
export interface CoordinationResponse {
  /** Request ID */
  requestId: string;
  /** Responding agent ID */
  responderId: string;
  /** Response value */
  value: unknown;
  /** Whether agent agrees/accepts */
  accepted: boolean;
  /** Response timestamp */
  timestamp: Date;
}

/**
 * Distributed lock
 */
export interface DistributedLock {
  /** Lock ID */
  id: string;
  /** Lock name */
  name: string;
  /** Lock holder agent ID */
  holderId?: string;
  /** Lock status */
  status: "free" | "acquired" | "waiting";
  /** Waiting agents */
  waitingAgents: string[];
  /** Lock timeout (ms) */
  timeout: number;
  /** Acquired at */
  acquiredAt?: Date;
  /** Expires at */
  expiresAt?: Date;
}

// ============================================================================
// Fault Tolerance Types
// ============================================================================

/**
 * Failure type
 */
export type FailureType =
  | "agent_crash" // Agent crashed
  | "node_failure" // Node failure
  | "network_partition" // Network partition
  | "timeout" // Timeout
  | "resource_exhausted" // Resources exhausted
  | "error_threshold"; // Error threshold exceeded

/**
 * Failure event
 */
export interface FailureEvent {
  /** Event ID */
  id: string;
  /** Failure type */
  type: FailureType;
  /** Affected entity ID */
  entityId: string;
  /** Entity type */
  entityType: "agent" | "node" | "task";
  /** Error description */
  error: string;
  /** Timestamp */
  timestamp: Date;
  /** Recovery action taken */
  recoveryAction?: RecoveryAction;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Recovery action
 */
export interface RecoveryAction {
  /** Action type */
  type: "restart" | "migrate" | "failover" | "checkpoint_restore" | "none";
  /** Target entity ID */
  targetId: string;
  /** Action status */
  status: "pending" | "in_progress" | "completed" | "failed";
  /** Action result */
  result?: string;
  /** Started at */
  startedAt?: Date;
  /** Completed at */
  completedAt?: Date;
}

/**
 * Checkpoint data
 */
export interface Checkpoint {
  /** Checkpoint ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Task ID being executed */
  taskId: string;
  /** Checkpoint data */
  data: unknown;
  /** Checkpoint sequence number */
  sequence: number;
  /** Created at */
  createdAt: Date;
  /** Checkpoint size (bytes) */
  size: number;
}

// ============================================================================
// Task Distribution Types
// ============================================================================

/**
 * Task distribution strategy
 */
export type DistributionStrategy =
  | "round_robin" // Round-robin distribution
  | "least_loaded" // Distribute to least loaded agent
  | "capability_match" // Match by capability
  | "affinity" // Use affinity rules
  | "random" // Random distribution
  | "custom"; // Custom distribution

/**
 * Task distribution result
 */
export interface DistributionResult {
  /** Task ID */
  taskId: string;
  /** Assigned agent ID */
  agentId: string;
  /** Node ID */
  nodeId: string;
  /** Distribution strategy used */
  strategy: DistributionStrategy;
  /** Distribution timestamp */
  timestamp: Date;
  /** Distribution score (higher = better match) */
  score: number;
}

/**
 * Affinity rule for task distribution
 */
export interface AffinityRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule type */
  type: "prefer" | "avoid" | "require";
  /** Target type */
  targetType: "agent" | "node" | "capability" | "tag";
  /** Target value */
  targetValue: string;
  /** Rule weight */
  weight: number;
}

// ============================================================================
// Runtime Statistics Types
// ============================================================================

/**
 * Runtime statistics
 */
export interface RuntimeStats {
  /** Total agents */
  totalAgents: number;
  /** Active agents */
  activeAgents: number;
  /** Total nodes */
  totalNodes: number;
  /** Active nodes */
  activeNodes: number;
  /** Tasks in progress */
  tasksInProgress: number;
  /** Tasks completed (last hour) */
  tasksCompletedLastHour: number;
  /** Tasks failed (last hour) */
  tasksFailedLastHour: number;
  /** Average task duration (ms) */
  averageTaskDuration: number;
  /** Throughput (tasks/minute) */
  throughput: number;
  /** Error rate */
  errorRate: number;
  /** Resource utilization */
  resourceUtilization: number;
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Distributed runtime callbacks
 */
export interface DistributedCallbacks {
  /** Called when agent is created */
  onAgentCreated?: (agent: DistributedAgent) => void;
  /** Called when agent status changes */
  onAgentStatusChanged?: (agent: DistributedAgent, status: AgentStatus) => void;
  /** Called when agent terminates */
  onAgentTerminated?: (agent: DistributedAgent) => void;
  /** Called when node joins */
  onNodeJoined?: (node: DistributedNode) => void;
  /** Called when node leaves */
  onNodeLeft?: (node: DistributedNode) => void;
  /** Called on message received */
  onMessageReceived?: (message: DistributedMessage) => void;
  /** Called on failure event */
  onFailure?: (event: FailureEvent) => void;
  /** Called on recovery */
  onRecovery?: (action: RecoveryAction) => void;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  // Agent types
  AgentStatus,
  AgentCapability,
  AgentRole,
  DistributedAgent,
  AgentConfig,
  ResourceLimits,
  ResourceUsage,
  AgentHealth,
  HealthIssue,

  // Node types
  NodeStatus,
  DistributedNode,
  NodeCapabilities,
  NodeCapacity,
  NodeUsage,
  NodeMetadata,

  // Communication types
  MessageType,
  DistributedMessage,
  CommunicationChannel,

  // Coordination types
  CoordinationType,
  CoordinationRequest,
  CoordinationResponse,
  DistributedLock,

  // Fault tolerance types
  FailureType,
  FailureEvent,
  RecoveryAction,
  Checkpoint,

  // Distribution types
  DistributionStrategy,
  DistributionResult,
  AffinityRule,

  // Statistics types
  RuntimeStats,

  // Callback types
  DistributedCallbacks,
};
