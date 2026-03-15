/**
 * Autonomous Planning Engine - IPC Handlers
 * 
 * Provides IPC interface for renderer process to interact with the planning engine.
 */

import { ipcMain } from "electron";
import { PlanningEngine, DEFAULT_PLANNING_CONFIG } from "./planning_engine";
import { planPersistence } from "./plan_persistence";
import type {
  Plan,
  Goal,
  Task,
  PlanningContext,
  PlanGenerationResult,
  ExecutionStatus,
  PlanningEvent,
} from "./types";

// ============================================================================
// IPC Channel Names
// ============================================================================

export const PLANNER_IPC_CHANNELS = {
  // Plan operations
  GENERATE_PLAN: "planner:generate-plan",
  GET_PLAN: "planner:get-plan",
  GET_PLANS_FOR_APP: "planner:get-plans-for-app",
  GET_ACTIVE_PLANS: "planner:get-active-plans",
  UPDATE_PLAN_STATUS: "planner:update-plan-status",
  DELETE_PLAN: "planner:delete-plan",

  // Goal operations
  GET_GOAL: "planner:get-goal",
  GET_GOALS_FOR_PLAN: "planner:get-goals-for-plan",
  UPDATE_GOAL_STATUS: "planner:update-goal-status",

  // Task operations
  GET_TASK: "planner:get-task",
  GET_TASKS_FOR_GOAL: "planner:get-tasks-for-goal",
  GET_TASKS_FOR_PLAN: "planner:get-tasks-for-plan",
  GET_READY_TASKS: "planner:get-ready-tasks",
  UPDATE_TASK_STATUS: "planner:update-task-status",
  UPDATE_TASK_OUTPUT: "planner:update-task-output",

  // Execution operations
  START_PLAN: "planner:start-plan",
  PAUSE_PLAN: "planner:pause-plan",
  RESUME_PLAN: "planner:resume-plan",
  CANCEL_PLAN: "planner:cancel-plan",

  // Events
  ON_PLAN_EVENT: "planner:on-plan-event",
  ON_TASK_PROGRESS: "planner:on-task-progress",
} as const;

// ============================================================================
// IPC Request/Response Types
// ============================================================================

export interface GeneratePlanRequest {
  request: string;
  context: PlanningContext;
  options?: {
    planType?: Plan["type"];
    priority?: Goal["priority"];
    constraints?: Goal["constraints"];
  };
}

export interface GeneratePlanResponse {
  success: boolean;
  result?: PlanGenerationResult;
  error?: string;
}

export interface UpdateStatusRequest {
  id: string;
  status: ExecutionStatus;
}

export interface TaskOutputRequest {
  taskId: string;
  output: Task["output"];
}

// ============================================================================
// Planner IPC Handler Class
// ============================================================================

/**
 * Manages IPC handlers for the planning engine
 */
export class PlannerIpcHandlers {
  private engines: Map<number, PlanningEngine> = new Map();
  private eventListeners: Map<string, Set<(event: PlanningEvent) => void>> = new Map();

  constructor() {
    this.registerHandlers();
  }

  /**
   * Get or create planning engine for an app
   */
  private getEngine(appId: number): PlanningEngine {
    if (!this.engines.has(appId)) {
      const engine = new PlanningEngine(DEFAULT_PLANNING_CONFIG, {
        onPlanCreated: (plan) => this.handlePlanEvent(plan.id, "plan_created", plan),
        onPlanStatusChanged: (plan, status) =>
          this.handlePlanEvent(plan.id, `plan_${status}` as PlanningEvent["type"], plan),
        onGoalCreated: (goal) => this.handleGoalEvent(goal.id, "goal_created", goal),
        onGoalStatusChanged: (goal, status) =>
          this.handleGoalEvent(goal.id, `goal_${status}` as PlanningEvent["type"], goal),
        onTaskCreated: (task) => this.handleTaskEvent(task.id, "task_created", task),
        onTaskStatusChanged: (task, status) =>
          this.handleTaskEvent(task.id, `task_${status}` as PlanningEvent["type"], task),
      });
      this.engines.set(appId, engine);
    }
    return this.engines.get(appId)!;
  }

  /**
   * Register all IPC handlers
   */
  private registerHandlers(): void {
    // Plan operations
    ipcMain.handle(PLANNER_IPC_CHANNELS.GENERATE_PLAN, async (_, req: GeneratePlanRequest) => {
      try {
        const engine = this.getEngine(req.context.appId);
        const result = await engine.generatePlan(req.request, req.context, req.options);

        // Persist the plan
        await planPersistence.saveCompletePlan(result.plan, result.goals, result.tasks);

        return { success: true, result } as GeneratePlanResponse;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } as GeneratePlanResponse;
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_PLAN, async (_, planId: string) => {
      try {
        const plan = await planPersistence.getPlan(planId);
        return { success: true, plan };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_PLANS_FOR_APP, async (_, appId: number) => {
      try {
        const plans = await planPersistence.getPlansForApp(appId);
        return { success: true, plans };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_ACTIVE_PLANS, async (_, appId: number) => {
      try {
        const plans = await planPersistence.getActivePlansForApp(appId);
        return { success: true, plans };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.UPDATE_PLAN_STATUS, async (_, req: UpdateStatusRequest) => {
      try {
        await planPersistence.updatePlanStatus(req.id, req.status);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.DELETE_PLAN, async (_, planId: string) => {
      try {
        await planPersistence.deletePlan(planId);
        this.engines.delete(parseInt(planId, 10)); // Clean up engine if needed
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Goal operations
    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_GOAL, async (_, goalId: string) => {
      try {
        const goal = await planPersistence.getGoal(goalId);
        return { success: true, goal };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_GOALS_FOR_PLAN, async (_, planId: string) => {
      try {
        const goals = await planPersistence.getGoalsForPlan(planId);
        return { success: true, goals };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.UPDATE_GOAL_STATUS, async (_, req: UpdateStatusRequest) => {
      try {
        await planPersistence.updateGoalStatus(req.id, req.status);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Task operations
    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_TASK, async (_, taskId: string) => {
      try {
        const task = await planPersistence.getTask(taskId);
        return { success: true, task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_TASKS_FOR_GOAL, async (_, goalId: string) => {
      try {
        const tasks = await planPersistence.getTasksForGoal(goalId);
        return { success: true, tasks };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_TASKS_FOR_PLAN, async (_, planId: string) => {
      try {
        const tasks = await planPersistence.getTasksForPlan(planId);
        return { success: true, tasks };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.GET_READY_TASKS, async (_, planId: string) => {
      try {
        const loaded = await planPersistence.loadCompletePlan(planId);
        if (!loaded) {
          return { success: false, error: "Plan not found" };
        }

        const engine = this.getEngine(loaded.plan.appId);
        engine.loadPlan(loaded.plan, loaded.goals, loaded.tasks);
        const readyTasks = engine.getReadyTasks(planId);

        return { success: true, tasks: readyTasks };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.UPDATE_TASK_STATUS, async (_, req: UpdateStatusRequest) => {
      try {
        await planPersistence.updateTaskStatus(req.id, req.status);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    ipcMain.handle(PLANNER_IPC_CHANNELS.UPDATE_TASK_OUTPUT, async (_, req: TaskOutputRequest) => {
      try {
        if (req.output) {
          await planPersistence.updateTaskOutput(req.taskId, req.output);
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });
  }

  /**
   * Handle plan event
   */
  private handlePlanEvent(planId: string, type: PlanningEvent["type"], data: unknown): void {
    const event: PlanningEvent = {
      type,
      planId,
      timestamp: new Date(),
      message: `Plan event: ${type}`,
      data: { plan: data },
    };
    this.emitEvent(event);
  }

  /**
   * Handle goal event
   */
  private handleGoalEvent(goalId: string, type: PlanningEvent["type"], data: unknown): void {
    const event: PlanningEvent = {
      type,
      goalId,
      timestamp: new Date(),
      message: `Goal event: ${type}`,
      data: { goal: data },
    };
    this.emitEvent(event);
  }

  /**
   * Handle task event
   */
  private handleTaskEvent(taskId: string, type: PlanningEvent["type"], data: unknown): void {
    const event: PlanningEvent = {
      type,
      taskId,
      timestamp: new Date(),
      message: `Task event: ${type}`,
      data: { task: data },
    };
    this.emitEvent(event);
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: PlanningEvent): void {
    // Broadcast to all windows via IPC
    // In Electron, we'd get the BrowserWindow and send
    // For now, we store for local listeners
    const listeners = this.eventListeners.get(event.planId || "global");
    if (listeners) {
      listeners.forEach((fn) => fn(event));
    }
  }

  /**
   * Subscribe to plan events
   */
  subscribe(planId: string, callback: (event: PlanningEvent) => void): () => void {
    if (!this.eventListeners.has(planId)) {
      this.eventListeners.set(planId, new Set());
    }
    this.eventListeners.get(planId)!.add(callback);

    return () => {
      this.eventListeners.get(planId)?.delete(callback);
    };
  }

  /**
   * Unregister all handlers
   */
  unregister(): void {
    Object.values(PLANNER_IPC_CHANNELS).forEach((channel) => {
      ipcMain.removeHandler(channel);
    });
    this.engines.clear();
    this.eventListeners.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let plannerIpcHandlers: PlannerIpcHandlers | null = null;

export function initPlannerIpcHandlers(): PlannerIpcHandlers {
  if (!plannerIpcHandlers) {
    plannerIpcHandlers = new PlannerIpcHandlers();
  }
  return plannerIpcHandlers;
}

export function getPlannerIpcHandlers(): PlannerIpcHandlers | null {
  return plannerIpcHandlers;
}
