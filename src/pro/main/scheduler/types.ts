/**
 * Agent Scheduler - Type Definitions
 * 
 * Defines types for task scheduling, resource management,
 * and execution prioritization.
 */

// ============================================================================
// Schedule Types
// ============================================================================

/**
 * Schedule entry status
 */
export type ScheduleStatus =
  | "scheduled"     // Scheduled for future execution
  | "queued"        // In the execution queue
  | "running"       // Currently executing
  | "completed"     // Successfully completed
  | "failed"        // Failed execution
  | "cancelled"     // Cancelled before execution
  | "paused"        // Paused during execution
  | "retrying"      // Retrying after failure
  | "timeout"       // Timed out
  | "skipped";      // Skipped due to dependencies

/**
 * Schedule priority (higher = more urgent)
 */
export type SchedulePriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * Recurrence pattern for scheduled tasks
 */
export type RecurrenceType = "none" | "interval" | "cron" | "on_event";

/**
 * Trigger condition for scheduled tasks
 */
export type TriggerType = 
  | "immediate"      // Execute immediately
  | "scheduled"      // Execute at scheduled time
  | "on_event"       // Execute on event
  | "on_condition"   // Execute when condition is met
  | "on_dependency"; // Execute when dependencies complete

// ============================================================================
// Schedule Entry
// ============================================================================

/**
 * A scheduled task entry
 */
export interface ScheduleEntry {
  /** Unique identifier */
  id: string;
  /** Task ID to execute */
  taskId: string;
  /** Plan ID this belongs to */
  planId: string;
  /** Application ID */
  appId: number;
  /** Schedule status */
  status: ScheduleStatus;
  /** Priority level */
  priority: SchedulePriority;
  /** Trigger type */
  triggerType: TriggerType;
  /** Scheduled execution time */
  scheduledAt?: Date;
  /** Actual execution start time */
  startedAt?: Date;
  /** Completion time */
  completedAt?: Date;
  /** Dependencies that must complete first */
  dependsOn: string[];
  /** Assigned agent ID */
  assignedAgentId?: string;
  /** Required resources */
  requiredResources: ResourceRequirement[];
  /** Execution timeout (seconds) */
  timeout: number;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Current retry count */
  retryCount: number;
  /** Estimated duration (seconds) */
  estimatedDuration?: number;
  /** Actual duration (seconds) */
  actualDuration?: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated */
  updatedAt: Date;
  /** Error message if failed */
  error?: string;
  /** Result data */
  result?: ScheduleResult;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Schedule execution result
 */
export interface ScheduleResult {
  /** Success status */
  success: boolean;
  /** Output data */
  output?: unknown;
  /** Error if failed */
  error?: string;
  /** Execution time in ms */
  executionTime: number;
  /** Resources used */
  resourcesUsed: ResourceUsage;
  /** Output files */
  outputFiles?: string[];
  /** Logs generated */
  logs?: string[];
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry strategy
 */
export type RetryStrategy = "none" | "immediate" | "exponential" | "linear" | "custom";

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Retry strategy */
  strategy: RetryStrategy;
  /** Maximum retries */
  maxRetries: number;
  /** Base delay between retries (ms) */
  baseDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Multiplier for exponential backoff */
  multiplier?: number;
  /** Retry on specific errors */
  retryableErrors?: string[];
  /** Whether to retry on timeout */
  retryOnTimeout: boolean;
}

/**
 * Default retry configurations
 */
export const DEFAULT_RETRY_CONFIGS: Record<SchedulePriority, RetryConfig> = {
  critical: {
    strategy: "exponential",
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
    retryOnTimeout: true,
  },
  high: {
    strategy: "exponential",
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    retryOnTimeout: true,
  },
  normal: {
    strategy: "exponential",
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 20000,
    multiplier: 2,
    retryOnTimeout: false,
  },
  low: {
    strategy: "linear",
    maxRetries: 1,
    baseDelay: 5000,
    maxDelay: 10000,
    retryOnTimeout: false,
  },
  background: {
    strategy: "none",
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    retryOnTimeout: false,
  },
};

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Resource types
 */
export type ResourceType = 
  | "cpu"           // CPU cores/percentage
  | "memory"        // Memory in MB
  | "disk"          // Disk I/O
  | "network"       // Network bandwidth
  | "file_handle"   // File handles
  | "process"       // Process slots
  | "agent"         // Agent instances
  | "llm_tokens"    // LLM token budget
  | "api_quota"     // API rate limit quota
  | "custom";       // Custom resource

/**
 * Resource requirement for a scheduled task
 */
export interface ResourceRequirement {
  /** Resource type */
  type: ResourceType;
  /** Amount required */
  amount: number;
  /** Whether this is a hard requirement */
  hardRequirement: boolean;
  /** Resource name for custom types */
  customName?: string;
}

/**
 * Resource usage record
 */
export interface ResourceUsage {
  /** CPU time used (ms) */
  cpuTime: number;
  /** Peak memory used (MB) */
  peakMemory: number;
  /** Disk I/O (bytes) */
  diskIO: number;
  /** Network I/O (bytes) */
  networkIO: number;
  /** LLM tokens used */
  llmTokens: number;
  /** API calls made */
  apiCalls: number;
  /** Custom resource usage */
  custom?: Record<string, number>;
}

/**
 * Resource pool state
 */
export interface ResourcePool {
  /** Total available CPU cores */
  totalCpuCores: number;
  /** Total available memory (MB) */
  totalMemory: number;
  /** Maximum concurrent processes */
  maxProcesses: number;
  /** Maximum concurrent agents */
  maxAgents: number;
  /** Currently used CPU cores */
  usedCpuCores: number;
  /** Currently used memory (MB) */
  usedMemory: number;
  /** Currently running processes */
  runningProcesses: number;
  /** Currently active agents */
  activeAgents: number;
  /** LLM token budget remaining */
  tokenBudgetRemaining: number;
  /** API quota remaining */
  apiQuotaRemaining: Record<string, number>;
}

// ============================================================================
// Schedule Queue Types
// ============================================================================

/**
 * Queue state
 */
export interface ScheduleQueue {
  /** Queue ID */
  id: string;
  /** Application ID */
  appId: number;
  /** Queue name */
  name: string;
  /** Maximum concurrent executions */
  maxConcurrency: number;
  /** Current running count */
  runningCount: number;
  /** Pending entries */
  pendingEntries: string[];
  /** Priority ordering */
  priorityOrder: SchedulePriority[];
  /** Whether queue is paused */
  isPaused: boolean;
  /** Total entries processed */
  totalProcessed: number;
  /** Total successful */
  totalSuccess: number;
  /** Total failed */
  totalFailed: number;
  /** Created at */
  createdAt: Date;
  /** Last activity */
  lastActivityAt: Date;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total entries in all queues */
  totalEntries: number;
  /** Entries by status */
  byStatus: Record<ScheduleStatus, number>;
  /** Entries by priority */
  byPriority: Record<SchedulePriority, number>;
  /** Average wait time (ms) */
  averageWaitTime: number;
  /** Average execution time (ms) */
  averageExecutionTime: number;
  /** Throughput (tasks/minute) */
  throughput: number;
  /** Current resource utilization */
  resourceUtilization: number;
}

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * Event trigger configuration
 */
export interface EventTrigger {
  /** Event type to listen for */
  eventType: string;
  /** Event source */
  source?: string;
  /** Filter conditions */
  filter?: Record<string, unknown>;
  /** Whether to consume event after trigger */
  consumeEvent: boolean;
}

/**
 * Condition trigger configuration
 */
export interface ConditionTrigger {
  /** Condition to evaluate */
  condition: string;
  /** Evaluation interval (ms) */
  evaluationInterval: number;
  /** Maximum evaluations before giving up */
  maxEvaluations?: number;
  /** Timeout for condition (ms) */
  timeout?: number;
}

/**
 * Cron trigger configuration
 */
export interface CronTrigger {
  /** Cron expression */
  expression: string;
  /** Timezone */
  timezone?: string;
  /** Start date */
  startDate?: Date;
  /** End date */
  endDate?: Date;
  /** Maximum executions */
  maxExecutions?: number;
}

/**
 * Interval trigger configuration
 */
export interface IntervalTrigger {
  /** Interval duration (ms) */
  interval: number;
  /** Start date */
  startDate?: Date;
  /** End date */
  endDate?: Date;
  /** Maximum executions */
  maxExecutions?: number;
  /** Run immediately on schedule */
  runImmediately?: boolean;
}

/**
 * Recurrence configuration
 */
export type RecurrenceConfig = 
  | { type: "none" }
  | { type: "interval" } & IntervalTrigger
  | { type: "cron" } & CronTrigger
  | { type: "on_event" } & EventTrigger;

// ============================================================================
// Scheduler Callback Types
// ============================================================================

/**
 * Scheduler event types
 */
export type SchedulerEventType =
  | "entry_scheduled"
  | "entry_started"
  | "entry_completed"
  | "entry_failed"
  | "entry_cancelled"
  | "entry_retrying"
  | "queue_paused"
  | "queue_resumed"
  | "resource_exhausted"
  | "resource_available";

/**
 * Scheduler event
 */
export interface SchedulerEvent {
  /** Event type */
  type: SchedulerEventType;
  /** Entry ID */
  entryId?: string;
  /** Queue ID */
  queueId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Event data */
  data?: Record<string, unknown>;
  /** Message */
  message: string;
}

/**
 * Scheduler callbacks
 */
export interface SchedulerCallbacks {
  /** Called when entry is scheduled */
  onEntryScheduled?: (entry: ScheduleEntry) => void;
  /** Called when entry starts execution */
  onEntryStarted?: (entry: ScheduleEntry) => void;
  /** Called when entry completes */
  onEntryCompleted?: (entry: ScheduleEntry, result: ScheduleResult) => void;
  /** Called when entry fails */
  onEntryFailed?: (entry: ScheduleEntry, error: string) => void;
  /** Called when entry is cancelled */
  onEntryCancelled?: (entry: ScheduleEntry) => void;
  /** Called when entry is retrying */
  onEntryRetrying?: (entry: ScheduleEntry, attempt: number) => void;
  /** Called when queue state changes */
  onQueueStateChanged?: (queue: ScheduleQueue) => void;
  /** Called on resource events */
  onResourceEvent?: (event: "exhausted" | "available", resource: ResourceType) => void;
  /** Called on any scheduler event */
  onEvent?: (event: SchedulerEvent) => void;
}

// ============================================================================
// Schedule Execution Types
// ============================================================================

/**
 * Execution context for a scheduled task
 */
export interface ExecutionContext {
  /** Entry ID */
  entryId: string;
  /** Task ID */
  taskId: string;
  /** Plan ID */
  planId: string;
  /** App ID */
  appId: number;
  /** Agent ID assigned */
  agentId?: string;
  /** Resources allocated */
  allocatedResources: ResourceRequirement[];
  /** Execution timeout */
  timeout: number;
  /** Started at */
  startedAt: Date;
  /** Deadline (startedAt + timeout) */
  deadline: Date;
  /** Cancellation token */
  cancellationToken?: { cancelled: boolean };
}

/**
 * Execution result handler type
 */
export type ExecutionHandler = (
  context: ExecutionContext,
  task: unknown
) => Promise<ScheduleResult>;

// ============================================================================
// Export all types
// ============================================================================

export type {
  ScheduleStatus,
  SchedulePriority,
  RecurrenceType,
  TriggerType,
  ScheduleEntry,
  ScheduleResult,
  RetryStrategy,
  RetryConfig,
  ResourceType,
  ResourceRequirement,
  ResourceUsage,
  ResourcePool,
  ScheduleQueue,
  QueueStats,
  EventTrigger,
  ConditionTrigger,
  CronTrigger,
  IntervalTrigger,
  RecurrenceConfig,
  SchedulerEventType,
  SchedulerEvent,
  SchedulerCallbacks,
  ExecutionContext,
  ExecutionHandler,
};

// Note: DEFAULT_RETRY_CONFIGS is already exported inline at definition
