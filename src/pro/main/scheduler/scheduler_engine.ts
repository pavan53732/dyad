/**
 * Agent Scheduler - Core Scheduling Engine
 * 
 * Manages task scheduling, execution queues, resource allocation,
 * and retry logic for autonomous task execution.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ScheduleEntry,
  ScheduleStatus,
  SchedulePriority,
  ScheduleQueue,
  ScheduleResult,
  ScheduleQueue as Queue,
  ResourcePool,
  ResourceRequirement,
  SchedulerCallbacks,
  SchedulerEvent,
  RetryConfig,
  DEFAULT_RETRY_CONFIGS,
  ExecutionContext,
  ExecutionHandler,
} from "./types";

// ============================================================================
// Scheduler Configuration
// ============================================================================

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Maximum concurrent tasks globally */
  maxGlobalConcurrency: number;
  /** Default task timeout (seconds) */
  defaultTimeout: number;
  /** Queue check interval (ms) */
  queueCheckInterval: number;
  /** Resource check interval (ms) */
  resourceCheckInterval: number;
  /** Maximum entries per queue */
  maxEntriesPerQueue: number;
  /** Enable priority preemption */
  enablePreemption: boolean;
  /** Enable resource-aware scheduling */
  enableResourceAwareScheduling: boolean;
  /** Default retry config */
  defaultRetryConfig: RetryConfig;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxGlobalConcurrency: 10,
  defaultTimeout: 300, // 5 minutes
  queueCheckInterval: 100,
  resourceCheckInterval: 1000,
  maxEntriesPerQueue: 100,
  enablePreemption: true,
  enableResourceAwareScheduling: true,
  defaultRetryConfig: {
    strategy: "exponential",
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryOnTimeout: true,
  },
};

// ============================================================================
// Agent Scheduler Class
// ============================================================================

/**
 * Agent Scheduler
 * 
 * Manages scheduling and execution of autonomous tasks with:
 * - Priority-based queuing
 * - Resource-aware scheduling
 * - Retry with exponential backoff
 * - Parallel execution management
 */
export class AgentScheduler {
  private config: SchedulerConfig;
  private callbacks: SchedulerCallbacks;
  
  // Storage
  private entries: Map<string, ScheduleEntry> = new Map();
  private queues: Map<string, ScheduleQueue> = new Map();
  
  // Execution state
  private runningEntries: Set<string> = new Set();
  private resourcePool: ResourcePool;
  
  // Timers
  private queueTimer?: ReturnType<typeof setInterval>;
  private resourceTimer?: ReturnType<typeof setInterval>;
  
  // Execution handler
  private executionHandler?: ExecutionHandler;
  
  // Shutdown flag
  private isShuttingDown = false;

  constructor(
    config: Partial<SchedulerConfig> = {},
    callbacks: SchedulerCallbacks = {},
  ) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.callbacks = callbacks;
    
    // Initialize resource pool
    this.resourcePool = {
      totalCpuCores: 8,
      totalMemory: 16384, // 16GB
      maxProcesses: 100,
      maxAgents: 10,
      usedCpuCores: 0,
      usedMemory: 0,
      runningProcesses: 0,
      activeAgents: 0,
      tokenBudgetRemaining: 1000000,
      apiQuotaRemaining: {},
    };
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start the scheduler
   */
  start(): void {
    this.isShuttingDown = false;
    
    // Start queue processor
    this.queueTimer = setInterval(() => {
      this.processQueues();
    }, this.config.queueCheckInterval);
    
    // Start resource monitor
    this.resourceTimer = setInterval(() => {
      this.checkResources();
    }, this.config.resourceCheckInterval);
    
    this.emitEvent({
      type: "queue_resumed",
      timestamp: new Date(),
      message: "Scheduler started",
    });
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    
    // Stop timers
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = undefined;
    }
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer);
      this.resourceTimer = undefined;
    }
    
    // Wait for running tasks to complete or timeout
    const runningIds = [...this.runningEntries];
    if (runningIds.length > 0) {
      await Promise.race([
        Promise.all(runningIds.map((id) => this.waitForCompletion(id))),
        new Promise((resolve) => setTimeout(resolve, 30000)), // 30s grace period
      ]);
    }
    
    this.emitEvent({
      type: "queue_paused",
      timestamp: new Date(),
      message: "Scheduler stopped",
    });
  }

  /**
   * Set execution handler
   */
  setExecutionHandler(handler: ExecutionHandler): void {
    this.executionHandler = handler;
  }

  // ==========================================================================
  // Scheduling Operations
  // ==========================================================================

  /**
   * Schedule a task for execution
   */
  scheduleTask(request: {
    taskId: string;
    planId: string;
    appId: number;
    priority?: SchedulePriority;
    dependsOn?: string[];
    requiredResources?: ResourceRequirement[];
    timeout?: number;
    retryConfig?: RetryConfig;
    scheduledAt?: Date;
  }): ScheduleEntry {
    const priority = request.priority || "normal";
    
    // Create schedule entry
    const entry: ScheduleEntry = {
      id: uuidv4(),
      taskId: request.taskId,
      planId: request.planId,
      appId: request.appId,
      status: request.scheduledAt ? "scheduled" : "queued",
      priority,
      triggerType: request.scheduledAt ? "scheduled" : "immediate",
      scheduledAt: request.scheduledAt,
      dependsOn: request.dependsOn || [],
      requiredResources: request.requiredResources || [],
      timeout: request.timeout || this.config.defaultTimeout,
      retryConfig: request.retryConfig || this.config.defaultRetryConfig,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Store entry
    this.entries.set(entry.id, entry);
    
    // Add to appropriate queue
    this.addToQueue(entry);
    
    // Emit event
    this.callbacks.onEntryScheduled?.(entry);
    this.emitEvent({
      type: "entry_scheduled",
      entryId: entry.id,
      timestamp: new Date(),
      message: `Task scheduled: ${entry.taskId}`,
      data: { priority, appId: entry.appId },
    });
    
    return entry;
  }

  /**
   * Cancel a scheduled task
   */
  cancelEntry(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) return false;
    
    // Can't cancel running tasks this way
    if (entry.status === "running") {
      return false;
    }
    
    // Update status
    entry.status = "cancelled";
    entry.updatedAt = new Date();
    
    // Remove from queue
    this.removeFromQueue(entry);
    
    // Emit event
    this.callbacks.onEntryCancelled?.(entry);
    this.emitEvent({
      type: "entry_cancelled",
      entryId: entry.id,
      timestamp: new Date(),
      message: `Task cancelled: ${entry.taskId}`,
    });
    
    return true;
  }

  /**
   * Update entry priority
   */
  updatePriority(entryId: string, priority: SchedulePriority): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) return false;
    
    // Can't update running tasks
    if (entry.status === "running") return false;
    
    const oldPriority = entry.priority;
    entry.priority = priority;
    entry.updatedAt = new Date();
    
    // Re-sort queue if needed
    if (oldPriority !== priority) {
      this.reorderQueue(entry);
    }
    
    return true;
  }

  /**
   * Pause a queue
   */
  pauseQueue(queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;
    
    queue.isPaused = true;
    queue.lastActivityAt = new Date();
    
    this.callbacks.onQueueStateChanged?.(queue);
    this.emitEvent({
      type: "queue_paused",
      queueId: queue.id,
      timestamp: new Date(),
      message: `Queue paused: ${queue.name}`,
    });
    
    return true;
  }

  /**
   * Resume a queue
   */
  resumeQueue(queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;
    
    queue.isPaused = false;
    queue.lastActivityAt = new Date();
    
    this.callbacks.onQueueStateChanged?.(queue);
    this.emitEvent({
      type: "queue_resumed",
      queueId: queue.id,
      timestamp: new Date(),
      message: `Queue resumed: ${queue.name}`,
    });
    
    return true;
  }

  // ==========================================================================
  // Queue Processing
  // ==========================================================================

  /**
   * Process all queues
   */
  private processQueues(): void {
    if (this.isShuttingDown) return;
    
    // Check global concurrency limit
    if (this.runningEntries.size >= this.config.maxGlobalConcurrency) {
      return;
    }
    
    // Get all non-paused queues sorted by priority
    const activeQueues = [...this.queues.values()]
      .filter((q) => !q.isPaused && q.pendingEntries.length > 0)
      .sort((a, b) => this.compareQueuePriority(a, b));
    
    for (const queue of activeQueues) {
      // Check queue concurrency
      if (queue.runningCount >= queue.maxConcurrency) continue;
      
      // Get next ready entry
      const nextEntry = this.getNextReadyEntry(queue);
      if (!nextEntry) continue;
      
      // Check resources
      if (!this.canAllocateResources(nextEntry)) continue;
      
      // Execute entry
      this.executeEntry(nextEntry, queue);
      
      // Check global limit again
      if (this.runningEntries.size >= this.config.maxGlobalConcurrency) {
        break;
      }
    }
  }

  /**
   * Compare queue priority
   */
  private compareQueuePriority(a: ScheduleQueue, b: ScheduleQueue): number {
    const priorityOrder: SchedulePriority[] = ["critical", "high", "normal", "low", "background"];
    
    // Get highest priority entry in each queue
    const aPriority = a.priorityOrder[0] || "normal";
    const bPriority = b.priorityOrder[0] || "normal";
    
    return priorityOrder.indexOf(aPriority) - priorityOrder.indexOf(bPriority);
  }

  /**
   * Get next ready entry from queue
   */
  private getNextReadyEntry(queue: ScheduleQueue): ScheduleEntry | null {
    // Sort entries by priority
    const sortedEntries = queue.pendingEntries
      .map((id) => this.entries.get(id))
      .filter((e): e is ScheduleEntry => e != null && e.status === "queued")
      .sort((a, b) => this.compareEntryPriority(a, b));
    
    // Find first entry with met dependencies
    for (const entry of sortedEntries) {
      if (this.areDependenciesMet(entry)) {
        return entry;
      }
    }
    
    return null;
  }

  /**
   * Compare entry priority
   */
  private compareEntryPriority(a: ScheduleEntry, b: ScheduleEntry): number {
    const priorityOrder: SchedulePriority[] = ["critical", "high", "normal", "low", "background"];
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  }

  /**
   * Check if entry dependencies are met
   */
  private areDependenciesMet(entry: ScheduleEntry): boolean {
    return entry.dependsOn.every((depId) => {
      const dep = this.entries.get(depId);
      return dep && dep.status === "completed";
    });
  }

  /**
   * Execute a scheduled entry
   */
  private async executeEntry(entry: ScheduleEntry, queue: ScheduleQueue): Promise<void> {
    // Allocate resources
    this.allocateResources(entry);
    
    // Update status
    entry.status = "running";
    entry.startedAt = new Date();
    entry.updatedAt = new Date();
    
    // Update queue
    queue.runningCount++;
    queue.pendingEntries = queue.pendingEntries.filter((id) => id !== entry.id);
    
    // Track running
    this.runningEntries.add(entry.id);
    
    // Emit event
    this.callbacks.onEntryStarted?.(entry);
    this.emitEvent({
      type: "entry_started",
      entryId: entry.id,
      queueId: queue.id,
      timestamp: new Date(),
      message: `Task started: ${entry.taskId}`,
    });
    
    // Execute
    try {
      const result = await this.executeWithTimeout(entry);
      
      // Handle result
      if (result.success) {
        entry.status = "completed";
        entry.result = result;
        queue.totalSuccess++;
        
        this.callbacks.onEntryCompleted?.(entry, result);
        this.emitEvent({
          type: "entry_completed",
          entryId: entry.id,
          timestamp: new Date(),
          message: `Task completed: ${entry.taskId}`,
          data: { executionTime: result.executionTime },
        });
      } else {
        // Handle failure with retry
        await this.handleFailure(entry, result.error || "Unknown error", queue);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.handleFailure(entry, errorMessage, queue);
    } finally {
      // Release resources
      this.releaseResources(entry);
      
      // Update queue
      queue.runningCount--;
      queue.totalProcessed++;
      queue.lastActivityAt = new Date();
      
      // Remove from running
      this.runningEntries.delete(entry.id);
      
      // Update entry
      entry.completedAt = new Date();
      entry.actualDuration = Math.round(
        (entry.completedAt.getTime() - (entry.startedAt?.getTime() || Date.now())) / 1000,
      );
      entry.updatedAt = new Date();
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(entry: ScheduleEntry): Promise<ScheduleResult> {
    if (!this.executionHandler) {
      return {
        success: false,
        error: "No execution handler configured",
        executionTime: 0,
        resourcesUsed: {
          cpuTime: 0,
          peakMemory: 0,
          diskIO: 0,
          networkIO: 0,
          llmTokens: 0,
          apiCalls: 0,
        },
      };
    }
    
    const context: ExecutionContext = {
      entryId: entry.id,
      taskId: entry.taskId,
      planId: entry.planId,
      appId: entry.appId,
      allocatedResources: entry.requiredResources,
      timeout: entry.timeout,
      startedAt: entry.startedAt || new Date(),
      deadline: new Date((entry.startedAt?.getTime() || Date.now()) + entry.timeout * 1000),
      cancellationToken: { cancelled: false },
    };
    
    return new Promise((resolve) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        context.cancellationToken!.cancelled = true;
        resolve({
          success: false,
          error: "Execution timeout",
          executionTime: entry.timeout * 1000,
          resourcesUsed: {
            cpuTime: 0,
            peakMemory: 0,
            diskIO: 0,
            networkIO: 0,
            llmTokens: 0,
            apiCalls: 0,
          },
        });
      }, entry.timeout * 1000);
      
      // Execute
      this.executionHandler!(context, entry)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            executionTime: 0,
            resourcesUsed: {
              cpuTime: 0,
              peakMemory: 0,
              diskIO: 0,
              networkIO: 0,
              llmTokens: 0,
              apiCalls: 0,
            },
          });
        });
    });
  }

  /**
   * Handle execution failure
   */
  private async handleFailure(entry: ScheduleEntry, error: string, queue: ScheduleQueue): Promise<void> {
    entry.error = error;
    entry.retryCount++;
    
    const canRetry = entry.retryCount < entry.retryConfig.maxRetries &&
      this.shouldRetry(entry, error);
    
    if (canRetry) {
      entry.status = "retrying";
      entry.updatedAt = new Date();
      
      // Calculate delay
      const delay = this.calculateRetryDelay(entry);
      
      // Re-schedule after delay
      setTimeout(() => {
        if (entry.status === "retrying") {
          entry.status = "queued";
          entry.updatedAt = new Date();
          queue.pendingEntries.push(entry.id);
        }
      }, delay);
      
      this.callbacks.onEntryRetrying?.(entry, entry.retryCount);
      this.emitEvent({
        type: "entry_retrying",
        entryId: entry.id,
        timestamp: new Date(),
        message: `Task retrying (${entry.retryCount}/${entry.retryConfig.maxRetries}): ${entry.taskId}`,
        data: { delay, error },
      });
    } else {
      entry.status = "failed";
      queue.totalFailed++;
      
      this.callbacks.onEntryFailed?.(entry, error);
      this.emitEvent({
        type: "entry_failed",
        entryId: entry.id,
        timestamp: new Date(),
        message: `Task failed: ${entry.taskId}`,
        data: { error, retries: entry.retryCount },
      });
    }
  }

  /**
   * Check if should retry
   */
  private shouldRetry(entry: ScheduleEntry, error: string): boolean {
    const config = entry.retryConfig;
    
    // Check for timeout
    if (error.includes("timeout") && !config.retryOnTimeout) {
      return false;
    }
    
    // Check for retryable errors
    if (config.retryableErrors && config.retryableErrors.length > 0) {
      return config.retryableErrors.some((e) => error.includes(e));
    }
    
    return true;
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(entry: ScheduleEntry): number {
    const config = entry.retryConfig;
    const attempt = entry.retryCount;
    
    switch (config.strategy) {
      case "immediate":
        return 0;
      case "linear":
        return Math.min(config.baseDelay * attempt, config.maxDelay);
      case "exponential":
        const multiplier = config.multiplier || 2;
        return Math.min(config.baseDelay * Math.pow(multiplier, attempt - 1), config.maxDelay);
      case "none":
      default:
        return 0;
    }
  }

  // ==========================================================================
  // Resource Management
  // ==========================================================================

  /**
   * Check if resources can be allocated
   */
  private canAllocateResources(entry: ScheduleEntry): boolean {
    if (!this.config.enableResourceAwareScheduling) return true;
    
    for (const req of entry.requiredResources) {
      if (!req.hardRequirement) continue;
      
      switch (req.type) {
        case "cpu":
          if (this.resourcePool.usedCpuCores + req.amount > this.resourcePool.totalCpuCores) {
            return false;
          }
          break;
        case "memory":
          if (this.resourcePool.usedMemory + req.amount > this.resourcePool.totalMemory) {
            return false;
          }
          break;
        case "agent":
          if (this.resourcePool.activeAgents + req.amount > this.resourcePool.maxAgents) {
            return false;
          }
          break;
      }
    }
    
    return true;
  }

  /**
   * Allocate resources for entry
   */
  private allocateResources(entry: ScheduleEntry): void {
    if (!this.config.enableResourceAwareScheduling) return;
    
    for (const req of entry.requiredResources) {
      switch (req.type) {
        case "cpu":
          this.resourcePool.usedCpuCores += req.amount;
          break;
        case "memory":
          this.resourcePool.usedMemory += req.amount;
          break;
        case "agent":
          this.resourcePool.activeAgents += req.amount;
          break;
        case "process":
          this.resourcePool.runningProcesses += req.amount;
          break;
      }
    }
  }

  /**
   * Release resources for entry
   */
  private releaseResources(entry: ScheduleEntry): void {
    if (!this.config.enableResourceAwareScheduling) return;
    
    for (const req of entry.requiredResources) {
      switch (req.type) {
        case "cpu":
          this.resourcePool.usedCpuCores = Math.max(0, this.resourcePool.usedCpuCores - req.amount);
          break;
        case "memory":
          this.resourcePool.usedMemory = Math.max(0, this.resourcePool.usedMemory - req.amount);
          break;
        case "agent":
          this.resourcePool.activeAgents = Math.max(0, this.resourcePool.activeAgents - req.amount);
          break;
        case "process":
          this.resourcePool.runningProcesses = Math.max(0, this.resourcePool.runningProcesses - req.amount);
          break;
      }
    }
  }

  /**
   * Check resources and emit events
   */
  private checkResources(): void {
    const memoryUsagePercent = this.resourcePool.usedMemory / this.resourcePool.totalMemory;
    const cpuUsagePercent = this.resourcePool.usedCpuCores / this.resourcePool.totalCpuCores;
    
    if (memoryUsagePercent > 0.9 || cpuUsagePercent > 0.9) {
      this.callbacks.onResourceEvent?.("exhausted", memoryUsagePercent > 0.9 ? "memory" : "cpu");
      this.emitEvent({
        type: "resource_exhausted",
        timestamp: new Date(),
        message: "Resource exhaustion detected",
        data: { memoryUsagePercent, cpuUsagePercent },
      });
    }
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Add entry to queue
   */
  private addToQueue(entry: ScheduleEntry): void {
    // Get or create queue for app
    let queue = this.getAppQueue(entry.appId);
    if (!queue) {
      queue = this.createQueue(entry.appId);
    }
    
    // Check queue limit
    if (queue.pendingEntries.length >= this.config.maxEntriesPerQueue) {
      throw new Error(`Queue ${queue.id} is at capacity`);
    }
    
    // Add entry
    queue.pendingEntries.push(entry.id);
    queue.lastActivityAt = new Date();
    
    // Update priority order
    if (!queue.priorityOrder.includes(entry.priority)) {
      queue.priorityOrder.push(entry.priority);
      queue.priorityOrder.sort((a, b) => {
        const order: SchedulePriority[] = ["critical", "high", "normal", "low", "background"];
        return order.indexOf(a) - order.indexOf(b);
      });
    }
  }

  /**
   * Remove entry from queue
   */
  private removeFromQueue(entry: ScheduleEntry): void {
    const queue = this.getAppQueue(entry.appId);
    if (!queue) return;
    
    queue.pendingEntries = queue.pendingEntries.filter((id) => id !== entry.id);
    queue.lastActivityAt = new Date();
  }

  /**
   * Reorder queue after priority change
   */
  private reorderQueue(entry: ScheduleEntry): void {
    const queue = this.getAppQueue(entry.appId);
    if (!queue) return;
    
    // Re-sort pending entries
    queue.pendingEntries.sort((aId, bId) => {
      const a = this.entries.get(aId);
      const b = this.entries.get(bId);
      if (!a || !b) return 0;
      return this.compareEntryPriority(a, b);
    });
    
    queue.lastActivityAt = new Date();
  }

  /**
   * Get queue for app
   */
  private getAppQueue(appId: number): ScheduleQueue | undefined {
    return [...this.queues.values()].find((q) => q.appId === appId);
  }

  /**
   * Create queue for app
   */
  private createQueue(appId: number): ScheduleQueue {
    const queue: ScheduleQueue = {
      id: uuidv4(),
      appId,
      name: `app-${appId}`,
      maxConcurrency: 4,
      runningCount: 0,
      pendingEntries: [],
      priorityOrder: ["critical", "high", "normal", "low", "background"],
      isPaused: false,
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    
    this.queues.set(queue.id, queue);
    return queue;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Wait for entry completion
   */
  private waitForCompletion(entryId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const entry = this.entries.get(entryId);
        if (!entry || !this.runningEntries.has(entryId)) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Emit event
   */
  private emitEvent(event: SchedulerEvent): void {
    this.callbacks.onEvent?.(event);
  }

  /**
   * Get entry by ID
   */
  getEntry(entryId: string): ScheduleEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * Get queue by ID
   */
  getQueue(queueId: string): ScheduleQueue | undefined {
    return this.queues.get(queueId);
  }

  /**
   * Get all entries for an app
   */
  getEntriesForApp(appId: number): ScheduleEntry[] {
    return [...this.entries.values()].filter((e) => e.appId === appId);
  }

  /**
   * Get resource pool state
   */
  getResourcePool(): ResourcePool {
    return { ...this.resourcePool };
  }

  /**
   * Update resource pool limits
   */
  updateResourceLimits(limits: Partial<ResourcePool>): void {
    Object.assign(this.resourcePool, limits);
  }
}

// ============================================================================
// Exports
// ============================================================================

// Note: AgentScheduler and DEFAULT_SCHEDULER_CONFIG are already exported inline at definition
export type { SchedulerConfig };
