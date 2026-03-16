/**
 * Agent Scheduler - IPC Handlers
 *
 * Provides IPC interface for renderer process to interact with the scheduler.
 */

import { ipcMain } from "electron";
import { AgentScheduler, DEFAULT_SCHEDULER_CONFIG } from "./scheduler_engine";
import type {
  ScheduleEntry,
  SchedulePriority,
  ScheduleResult,
  SchedulerEvent,
  ResourcePool,
  RetryConfig,
  ResourceRequirement,
} from "./types";

// ============================================================================
// IPC Channel Names
// ============================================================================

export const SCHEDULER_IPC_CHANNELS = {
  // Scheduling operations
  SCHEDULE_TASK: "scheduler:schedule-task",
  CANCEL_TASK: "scheduler:cancel-task",
  UPDATE_PRIORITY: "scheduler:update-priority",

  // Entry operations
  GET_ENTRY: "scheduler:get-entry",
  GET_ENTRIES_FOR_APP: "scheduler:get-entries-for-app",

  // Queue operations
  GET_QUEUE: "scheduler:get-queue",
  PAUSE_QUEUE: "scheduler:pause-queue",
  RESUME_QUEUE: "scheduler:resume-queue",

  // Resource operations
  GET_RESOURCE_POOL: "scheduler:get-resource-pool",
  UPDATE_RESOURCE_LIMITS: "scheduler:update-resource-limits",

  // Lifecycle
  START_SCHEDULER: "scheduler:start",
  STOP_SCHEDULER: "scheduler:stop",

  // Events
  ON_SCHEDULER_EVENT: "scheduler:on-event",
} as const;

// ============================================================================
// IPC Request/Response Types
// ============================================================================

export interface ScheduleTaskRequest {
  taskId: string;
  planId: string;
  appId: number;
  priority?: SchedulePriority;
  dependsOn?: string[];
  requiredResources?: ResourceRequirement[];
  timeout?: number;
  retryConfig?: RetryConfig;
  scheduledAt?: Date;
}

export interface ScheduleTaskResponse {
  success: boolean;
  entry?: ScheduleEntry;
  error?: string;
}

export interface UpdatePriorityRequest {
  entryId: string;
  priority: SchedulePriority;
}

export interface UpdateResourceLimitsRequest {
  limits: Partial<ResourcePool>;
}

// ============================================================================
// Scheduler IPC Handler Class
// ============================================================================

/**
 * Manages IPC handlers for the scheduler
 */
export class SchedulerIpcHandlers {
  private scheduler: AgentScheduler;
  private eventListeners: Set<(event: SchedulerEvent) => void> = new Set();

  constructor() {
    this.scheduler = new AgentScheduler(DEFAULT_SCHEDULER_CONFIG, {
      onEntryScheduled: (entry) =>
        this.handleEntryEvent("entry_scheduled", entry),
      onEntryStarted: (entry) => this.handleEntryEvent("entry_started", entry),
      onEntryCompleted: (entry, result) =>
        this.handleEntryComplete("entry_completed", entry, result),
      onEntryFailed: (entry, error) =>
        this.handleEntryFailure("entry_failed", entry, error),
      onEntryCancelled: (entry) =>
        this.handleEntryEvent("entry_cancelled", entry),
      onEntryRetrying: (entry, attempt) =>
        this.handleRetryEvent("entry_retrying", entry, attempt),
      onQueueStateChanged: (queue) => this.handleQueueEvent(queue),
      onResourceEvent: (event, resource) =>
        this.handleResourceEvent(event, resource),
      onEvent: (event) => this.broadcastEvent(event),
    });

    this.registerHandlers();
  }

  /**
   * Register all IPC handlers
   */
  private registerHandlers(): void {
    // Scheduling operations
    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.SCHEDULE_TASK,
      async (_, req: ScheduleTaskRequest): Promise<ScheduleTaskResponse> => {
        try {
          const entry = this.scheduler.scheduleTask({
            taskId: req.taskId,
            planId: req.planId,
            appId: req.appId,
            priority: req.priority,
            dependsOn: req.dependsOn,
            requiredResources: req.requiredResources,
            timeout: req.timeout,
            retryConfig: req.retryConfig,
            scheduledAt: req.scheduledAt
              ? new Date(req.scheduledAt)
              : undefined,
          });

          return { success: true, entry };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.CANCEL_TASK,
      async (
        _,
        entryId: string,
      ): Promise<{ success: boolean; error?: string }> => {
        try {
          const success = this.scheduler.cancelEntry(entryId);
          return { success };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.UPDATE_PRIORITY,
      async (_, req: UpdatePriorityRequest): Promise<{ success: boolean }> => {
        try {
          const success = this.scheduler.updatePriority(
            req.entryId,
            req.priority,
          );
          return { success };
        } catch {
          return { success: false };
        }
      },
    );

    // Entry operations
    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.GET_ENTRY,
      async (
        _,
        entryId: string,
      ): Promise<{ success: boolean; entry?: ScheduleEntry }> => {
        const entry = this.scheduler.getEntry(entryId);
        return { success: !!entry, entry };
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.GET_ENTRIES_FOR_APP,
      async (
        _,
        appId: number,
      ): Promise<{ success: boolean; entries: ScheduleEntry[] }> => {
        const entries = this.scheduler.getEntriesForApp(appId);
        return { success: true, entries };
      },
    );

    // Queue operations
    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.GET_QUEUE,
      async (
        _,
        queueId: string,
      ): Promise<{ success: boolean; queue?: unknown }> => {
        const queue = this.scheduler.getQueue(queueId);
        return { success: !!queue, queue };
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.PAUSE_QUEUE,
      async (_, queueId: string): Promise<{ success: boolean }> => {
        const success = this.scheduler.pauseQueue(queueId);
        return { success };
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.RESUME_QUEUE,
      async (_, queueId: string): Promise<{ success: boolean }> => {
        const success = this.scheduler.resumeQueue(queueId);
        return { success };
      },
    );

    // Resource operations
    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.GET_RESOURCE_POOL,
      async (): Promise<{
        success: boolean;
        pool?: ResourcePool;
      }> => {
        const pool = this.scheduler.getResourcePool();
        return { success: true, pool };
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.UPDATE_RESOURCE_LIMITS,
      async (
        _,
        req: UpdateResourceLimitsRequest,
      ): Promise<{ success: boolean }> => {
        try {
          this.scheduler.updateResourceLimits(req.limits);
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    // Lifecycle
    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.START_SCHEDULER,
      async (): Promise<{ success: boolean }> => {
        try {
          this.scheduler.start();
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );

    ipcMain.handle(
      SCHEDULER_IPC_CHANNELS.STOP_SCHEDULER,
      async (): Promise<{ success: boolean }> => {
        try {
          await this.scheduler.stop();
          return { success: true };
        } catch {
          return { success: false };
        }
      },
    );
  }

  /**
   * Handle entry event
   */
  private handleEntryEvent(
    type: SchedulerEvent["type"],
    entry: ScheduleEntry,
  ): void {
    this.broadcastEvent({
      type,
      entryId: entry.id,
      timestamp: new Date(),
      message: `Entry ${type}: ${entry.taskId}`,
      data: { entry },
    });
  }

  /**
   * Handle entry completion
   */
  private handleEntryComplete(
    type: SchedulerEvent["type"],
    entry: ScheduleEntry,
    result: ScheduleResult,
  ): void {
    this.broadcastEvent({
      type,
      entryId: entry.id,
      timestamp: new Date(),
      message: `Entry completed: ${entry.taskId}`,
      data: { entry, result },
    });
  }

  /**
   * Handle entry failure
   */
  private handleEntryFailure(
    type: SchedulerEvent["type"],
    entry: ScheduleEntry,
    error: string,
  ): void {
    this.broadcastEvent({
      type,
      entryId: entry.id,
      timestamp: new Date(),
      message: `Entry failed: ${entry.taskId}`,
      data: { entry, error },
    });
  }

  /**
   * Handle retry event
   */
  private handleRetryEvent(
    type: SchedulerEvent["type"],
    entry: ScheduleEntry,
    attempt: number,
  ): void {
    this.broadcastEvent({
      type,
      entryId: entry.id,
      timestamp: new Date(),
      message: `Entry retrying (${attempt}): ${entry.taskId}`,
      data: { entry, attempt },
    });
  }

  /**
   * Handle queue event
   */
  private handleQueueEvent(queue: unknown): void {
    this.broadcastEvent({
      type: "queue_resumed",
      timestamp: new Date(),
      message: "Queue state changed",
      data: { queue },
    });
  }

  /**
   * Handle resource event
   */
  private handleResourceEvent(
    event: "exhausted" | "available",
    resource: string,
  ): void {
    this.broadcastEvent({
      type: event === "exhausted" ? "resource_exhausted" : "resource_available",
      timestamp: new Date(),
      message: `Resource ${event}: ${resource}`,
      data: { resource },
    });
  }

  /**
   * Broadcast event to all listeners
   */
  private broadcastEvent(event: SchedulerEvent): void {
    this.eventListeners.forEach((fn) => fn(event));
    // In a real implementation, this would send to BrowserWindow
  }

  /**
   * Subscribe to scheduler events
   */
  subscribe(callback: (event: SchedulerEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Get the scheduler instance
   */
  getScheduler(): AgentScheduler {
    return this.scheduler;
  }

  /**
   * Unregister all handlers
   */
  unregister(): void {
    Object.values(SCHEDULER_IPC_CHANNELS).forEach((channel) => {
      ipcMain.removeHandler(channel);
    });
    this.eventListeners.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let schedulerIpcHandlers: SchedulerIpcHandlers | null = null;

export function initSchedulerIpcHandlers(): SchedulerIpcHandlers {
  if (!schedulerIpcHandlers) {
    schedulerIpcHandlers = new SchedulerIpcHandlers();
  }
  return schedulerIpcHandlers;
}

export function getSchedulerIpcHandlers(): SchedulerIpcHandlers | null {
  return schedulerIpcHandlers;
}
