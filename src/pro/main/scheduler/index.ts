/**
 * Agent Scheduler - Module Entry Point
 *
 * Provides scheduling and execution management for autonomous tasks.
 *
 * ## Features
 *
 * - Priority-based task scheduling
 * - Resource-aware execution
 * - Retry with exponential backoff
 * - Parallel execution management
 * - Queue management per application
 *
 * ## Usage
 *
 * ```typescript
 * import { AgentScheduler, DEFAULT_SCHEDULER_CONFIG } from '@/pro/main/scheduler';
 *
 * // Create scheduler
 * const scheduler = new AgentScheduler({
 *   maxGlobalConcurrency: 10,
 *   enableResourceAwareScheduling: true,
 * });
 *
 * // Schedule a task
 * const entry = scheduler.scheduleTask({
 *   taskId: 'task-123',
 *   planId: 'plan-456',
 *   appId: 1,
 *   priority: 'high',
 * });
 *
 * // Start the scheduler
 * scheduler.start();
 * ```
 */

// Core engine
export { AgentScheduler, DEFAULT_SCHEDULER_CONFIG } from "./scheduler_engine";
export type { SchedulerConfig } from "./scheduler_engine";

// IPC handlers
export {
  SchedulerIpcHandlers,
  initSchedulerIpcHandlers,
  getSchedulerIpcHandlers,
  SCHEDULER_IPC_CHANNELS,
} from "./ipc_handlers";
export type {
  ScheduleTaskRequest,
  ScheduleTaskResponse,
  UpdatePriorityRequest,
  UpdateResourceLimitsRequest,
} from "./ipc_handlers";

// Types
export type {
  // Status types
  ScheduleStatus,
  SchedulePriority,
  RecurrenceType,
  TriggerType,

  // Entry types
  ScheduleEntry,
  ScheduleResult,

  // Retry types
  RetryStrategy,
  RetryConfig,

  // Resource types
  ResourceType,
  ResourceRequirement,
  ResourceUsage,
  ResourcePool,

  // Queue types
  ScheduleQueue,
  QueueStats,

  // Trigger configuration types
  EventTrigger,
  ConditionTrigger,
  CronTrigger,
  IntervalTrigger,
  RecurrenceConfig,

  // Event types
  SchedulerEventType,
  SchedulerEvent,
  SchedulerCallbacks,

  // Execution types
  ExecutionContext,
  ExecutionHandler,
} from "./types";

export { DEFAULT_RETRY_CONFIGS } from "./types";
