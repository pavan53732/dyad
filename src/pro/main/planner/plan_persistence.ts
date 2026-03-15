/**
 * Autonomous Planning Engine - Plan Persistence
 * 
 * Handles persistent storage and retrieval of plans, goals, and tasks.
 */

import { db } from "@/db";
import { desc, eq, and, inArray } from "drizzle-orm";
import type {
  Goal,
  Task,
  Plan,
  ExecutionStatus,
  SuccessCriteria,
  ExecutionConstraint,
  TaskInput,
  TaskOutput,
  OutputSchema,
  RollbackAction,
  ExecutionAttempt,
  ExecutionStrategy,
  PlanProgress,
} from "./types";

// ============================================================================
// Database Types
// ============================================================================

// These would be defined in src/db/schema.ts
// For now, we define inline interfaces that match the expected schema

interface PlanRow {
  id: string;
  appId: number;
  title: string;
  description: string;
  type: string;
  status: string;
  goalIds: string;
  strategy: string;
  constraints: string;
  progress: string;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  createdBy: string | null;
  tags: string;
  metadata: string | null;
}

interface GoalRow {
  id: string;
  appId: number;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  successCriteria: string;
  constraints: string;
  parentGoalId: string | null;
  taskIds: string;
  dependsOn: string;
  estimatedComplexity: number | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdBy: string | null;
  metadata: string | null;
}

interface TaskRow {
  id: string;
  goalId: string;
  appId: number;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  order: number;
  dependsOn: string;
  requiredTools: string;
  input: string;
  expectedOutput: string | null;
  output: string | null;
  rollbackAction: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  assignedAgentId: string | null;
  attempts: string;
  metadata: string | null;
}

// ============================================================================
// Persistence Manager
// ============================================================================

/**
 * Manages persistent storage of planning data
 */
export class PlanPersistence {
  // Note: In a real implementation, these would use actual Drizzle schema
  // For now, we use in-memory storage with interface definitions

  private planStorage: Map<string, PlanRow> = new Map();
  private goalStorage: Map<string, GoalRow> = new Map();
  private taskStorage: Map<string, TaskRow> = new Map();

  // ==========================================================================
  // Plan Operations
  // ==========================================================================

  /**
   * Save a plan
   */
  async savePlan(plan: Plan): Promise<void> {
    const row: PlanRow = {
      id: plan.id,
      appId: plan.appId,
      title: plan.title,
      description: plan.description,
      type: plan.type,
      status: plan.status,
      goalIds: JSON.stringify(plan.goalIds),
      strategy: JSON.stringify(plan.strategy),
      constraints: JSON.stringify(plan.constraints),
      progress: JSON.stringify(plan.progress),
      createdAt: Math.floor(plan.createdAt.getTime() / 1000),
      updatedAt: Math.floor(plan.updatedAt.getTime() / 1000),
      startedAt: plan.startedAt ? Math.floor(plan.startedAt.getTime() / 1000) : null,
      completedAt: plan.completedAt ? Math.floor(plan.completedAt.getTime() / 1000) : null,
      createdBy: plan.createdBy || null,
      tags: JSON.stringify(plan.tags),
      metadata: plan.metadata ? JSON.stringify(plan.metadata) : null,
    };

    this.planStorage.set(plan.id, row);
  }

  /**
   * Get a plan by ID
   */
  async getPlan(planId: string): Promise<Plan | null> {
    const row = this.planStorage.get(planId);
    if (!row) return null;

    return this.rowToPlan(row);
  }

  /**
   * Get all plans for an app
   */
  async getPlansForApp(appId: number): Promise<Plan[]> {
    const rows = [...this.planStorage.values()].filter((r) => r.appId === appId);
    return rows.map((r) => this.rowToPlan(r));
  }

  /**
   * Get active plans for an app
   */
  async getActivePlansForApp(appId: number): Promise<Plan[]> {
    const activeStatuses: ExecutionStatus[] = ["pending", "queued", "running", "paused"];
    const rows = [...this.planStorage.values()].filter(
      (r) => r.appId === appId && activeStatuses.includes(r.status as ExecutionStatus),
    );
    return rows.map((r) => this.rowToPlan(r));
  }

  /**
   * Update plan status
   */
  async updatePlanStatus(planId: string, status: ExecutionStatus): Promise<void> {
    const row = this.planStorage.get(planId);
    if (!row) return;

    row.status = status;
    row.updatedAt = Math.floor(Date.now() / 1000);

    if (status === "running") {
      row.startedAt = Math.floor(Date.now() / 1000);
    } else if (status === "completed" || status === "failed" || status === "cancelled") {
      row.completedAt = Math.floor(Date.now() / 1000);
    }
  }

  /**
   * Update plan progress
   */
  async updatePlanProgress(planId: string, progress: PlanProgress): Promise<void> {
    const row = this.planStorage.get(planId);
    if (!row) return;

    row.progress = JSON.stringify(progress);
    row.updatedAt = Math.floor(Date.now() / 1000);
  }

  /**
   * Delete a plan and all its goals and tasks
   */
  async deletePlan(planId: string): Promise<void> {
    const plan = await this.getPlan(planId);
    if (!plan) return;

    // Delete associated tasks
    for (const goalId of plan.goalIds) {
      const tasks = await this.getTasksForGoal(goalId);
      for (const task of tasks) {
        this.taskStorage.delete(task.id);
      }
      this.goalStorage.delete(goalId);
    }

    this.planStorage.delete(planId);
  }

  // ==========================================================================
  // Goal Operations
  // ==========================================================================

  /**
   * Save a goal
   */
  async saveGoal(goal: Goal): Promise<void> {
    const row: GoalRow = {
      id: goal.id,
      appId: goal.appId,
      title: goal.title,
      description: goal.description,
      type: goal.type,
      priority: goal.priority,
      status: goal.status,
      successCriteria: JSON.stringify(goal.successCriteria),
      constraints: JSON.stringify(goal.constraints),
      parentGoalId: goal.parentGoalId || null,
      taskIds: JSON.stringify(goal.taskIds),
      dependsOn: JSON.stringify(goal.dependsOn),
      estimatedComplexity: goal.estimatedComplexity || null,
      estimatedDuration: goal.estimatedDuration || null,
      actualDuration: goal.actualDuration || null,
      createdAt: Math.floor(goal.createdAt.getTime() / 1000),
      updatedAt: Math.floor(goal.updatedAt.getTime() / 1000),
      startedAt: goal.startedAt ? Math.floor(goal.startedAt.getTime() / 1000) : null,
      completedAt: goal.completedAt ? Math.floor(goal.completedAt.getTime() / 1000) : null,
      error: goal.error || null,
      retryCount: goal.retryCount,
      maxRetries: goal.maxRetries,
      createdBy: goal.createdBy || null,
      metadata: goal.metadata ? JSON.stringify(goal.metadata) : null,
    };

    this.goalStorage.set(goal.id, row);
  }

  /**
   * Get a goal by ID
   */
  async getGoal(goalId: string): Promise<Goal | null> {
    const row = this.goalStorage.get(goalId);
    if (!row) return null;

    return this.rowToGoal(row);
  }

  /**
   * Get goals for a plan
   */
  async getGoalsForPlan(planId: string): Promise<Goal[]> {
    const plan = await this.getPlan(planId);
    if (!plan) return [];

    const goals: Goal[] = [];
    for (const goalId of plan.goalIds) {
      const goal = await this.getGoal(goalId);
      if (goal) goals.push(goal);
    }
    return goals;
  }

  /**
   * Update goal status
   */
  async updateGoalStatus(goalId: string, status: ExecutionStatus): Promise<void> {
    const row = this.goalStorage.get(goalId);
    if (!row) return;

    row.status = status;
    row.updatedAt = Math.floor(Date.now() / 1000);

    if (status === "running") {
      row.startedAt = Math.floor(Date.now() / 1000);
    } else if (status === "completed" || status === "failed") {
      row.completedAt = Math.floor(Date.now() / 1000);
    }
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  /**
   * Save a task
   */
  async saveTask(task: Task): Promise<void> {
    const row: TaskRow = {
      id: task.id,
      goalId: task.goalId,
      appId: task.appId,
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      status: task.status,
      order: task.order,
      dependsOn: JSON.stringify(task.dependsOn),
      requiredTools: JSON.stringify(task.requiredTools),
      input: JSON.stringify(task.input),
      expectedOutput: task.expectedOutput ? JSON.stringify(task.expectedOutput) : null,
      output: task.output ? JSON.stringify(task.output) : null,
      rollbackAction: task.rollbackAction ? JSON.stringify(task.rollbackAction) : null,
      estimatedDuration: task.estimatedDuration || null,
      actualDuration: task.actualDuration || null,
      createdAt: Math.floor(task.createdAt.getTime() / 1000),
      updatedAt: Math.floor(task.updatedAt.getTime() / 1000),
      startedAt: task.startedAt ? Math.floor(task.startedAt.getTime() / 1000) : null,
      completedAt: task.completedAt ? Math.floor(task.completedAt.getTime() / 1000) : null,
      error: task.error || null,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
      assignedAgentId: task.assignedAgentId || null,
      attempts: JSON.stringify(task.attempts),
      metadata: task.metadata ? JSON.stringify(task.metadata) : null,
    };

    this.taskStorage.set(task.id, row);
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const row = this.taskStorage.get(taskId);
    if (!row) return null;

    return this.rowToTask(row);
  }

  /**
   * Get tasks for a goal
   */
  async getTasksForGoal(goalId: string): Promise<Task[]> {
    const rows = [...this.taskStorage.values()].filter((r) => r.goalId === goalId);
    return rows.map((r) => this.rowToTask(r)).sort((a, b) => a.order - b.order);
  }

  /**
   * Get tasks for a plan
   */
  async getTasksForPlan(planId: string): Promise<Task[]> {
    const goals = await this.getGoalsForPlan(planId);
    const tasks: Task[] = [];
    for (const goal of goals) {
      const goalTasks = await this.getTasksForGoal(goal.id);
      tasks.push(...goalTasks);
    }
    return tasks;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: ExecutionStatus): Promise<void> {
    const row = this.taskStorage.get(taskId);
    if (!row) return;

    row.status = status;
    row.updatedAt = Math.floor(Date.now() / 1000);

    if (status === "running") {
      row.startedAt = Math.floor(Date.now() / 1000);
    } else if (status === "completed" || status === "failed") {
      row.completedAt = Math.floor(Date.now() / 1000);
    }
  }

  /**
   * Update task output
   */
  async updateTaskOutput(taskId: string, output: TaskOutput): Promise<void> {
    const row = this.taskStorage.get(taskId);
    if (!row) return;

    row.output = JSON.stringify(output);
    row.updatedAt = Math.floor(Date.now() / 1000);
  }

  /**
   * Add execution attempt
   */
  async addExecutionAttempt(taskId: string, attempt: ExecutionAttempt): Promise<void> {
    const row = this.taskStorage.get(taskId);
    if (!row) return;

    const attempts: ExecutionAttempt[] = JSON.parse(row.attempts || "[]");
    attempts.push(attempt);
    row.attempts = JSON.stringify(attempts);
    row.retryCount = attempts.length;
    row.updatedAt = Math.floor(Date.now() / 1000);
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Save a complete plan with goals and tasks
   */
  async saveCompletePlan(plan: Plan, goals: Goal[], tasks: Task[]): Promise<void> {
    await this.savePlan(plan);
    for (const goal of goals) {
      await this.saveGoal(goal);
    }
    for (const task of tasks) {
      await this.saveTask(task);
    }
  }

  /**
   * Load a complete plan with goals and tasks
   */
  async loadCompletePlan(planId: string): Promise<{
    plan: Plan;
    goals: Goal[];
    tasks: Task[];
  } | null> {
    const plan = await this.getPlan(planId);
    if (!plan) return null;

    const goals = await this.getGoalsForPlan(planId);
    const tasks = await this.getTasksForPlan(planId);

    return { plan, goals, tasks };
  }

  // ==========================================================================
  // Conversion Helpers
  // ==========================================================================

  private rowToPlan(row: PlanRow): Plan {
    return {
      id: row.id,
      appId: row.appId,
      title: row.title,
      description: row.description,
      type: row.type as Plan["type"],
      status: row.status as ExecutionStatus,
      goalIds: JSON.parse(row.goalIds),
      strategy: JSON.parse(row.strategy) as ExecutionStrategy,
      constraints: JSON.parse(row.constraints) as ExecutionConstraint[],
      progress: JSON.parse(row.progress) as PlanProgress,
      createdAt: new Date(row.createdAt * 1000),
      updatedAt: new Date(row.updatedAt * 1000),
      startedAt: row.startedAt ? new Date(row.startedAt * 1000) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt * 1000) : undefined,
      createdBy: row.createdBy || undefined,
      tags: JSON.parse(row.tags),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToGoal(row: GoalRow): Goal {
    return {
      id: row.id,
      appId: row.appId,
      title: row.title,
      description: row.description,
      type: row.type as Goal["type"],
      priority: row.priority as Goal["priority"],
      status: row.status as ExecutionStatus,
      successCriteria: JSON.parse(row.successCriteria) as SuccessCriteria[],
      constraints: JSON.parse(row.constraints) as ExecutionConstraint[],
      parentGoalId: row.parentGoalId || undefined,
      taskIds: JSON.parse(row.taskIds),
      dependsOn: JSON.parse(row.dependsOn),
      estimatedComplexity: row.estimatedComplexity || undefined,
      estimatedDuration: row.estimatedDuration || undefined,
      actualDuration: row.actualDuration || undefined,
      createdAt: new Date(row.createdAt * 1000),
      updatedAt: new Date(row.updatedAt * 1000),
      startedAt: row.startedAt ? new Date(row.startedAt * 1000) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt * 1000) : undefined,
      error: row.error || undefined,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      createdBy: row.createdBy || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      goalId: row.goalId,
      appId: row.appId,
      title: row.title,
      description: row.description,
      type: row.type as Task["type"],
      priority: row.priority as Task["priority"],
      status: row.status as ExecutionStatus,
      order: row.order,
      dependsOn: JSON.parse(row.dependsOn),
      requiredTools: JSON.parse(row.requiredTools),
      input: JSON.parse(row.input) as TaskInput,
      expectedOutput: row.expectedOutput ? JSON.parse(row.expectedOutput) as OutputSchema : undefined,
      output: row.output ? JSON.parse(row.output) as TaskOutput : undefined,
      rollbackAction: row.rollbackAction ? JSON.parse(row.rollbackAction) as RollbackAction : undefined,
      estimatedDuration: row.estimatedDuration || undefined,
      actualDuration: row.actualDuration || undefined,
      createdAt: new Date(row.createdAt * 1000),
      updatedAt: new Date(row.updatedAt * 1000),
      startedAt: row.startedAt ? new Date(row.startedAt * 1000) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt * 1000) : undefined,
      error: row.error || undefined,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      assignedAgentId: row.assignedAgentId || undefined,
      attempts: JSON.parse(row.attempts) as ExecutionAttempt[],
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const planPersistence = new PlanPersistence();
