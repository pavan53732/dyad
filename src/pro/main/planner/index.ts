/**
 * Autonomous Planning Engine - Module Entry Point
 *
 * Provides autonomous planning capabilities for the Dyad agent system.
 *
 * ## Features
 *
 * - Goal decomposition into tasks
 * - Dependency resolution and topological ordering
 * - Execution strategy selection (sequential, parallel, adaptive)
 * - Plan persistence and recovery
 * - Adaptive replanning on failure
 *
 * ## Usage
 *
 * ```typescript
 * import { PlanningEngine, planPersistence } from '@/pro/main/planner';
 *
 * // Generate a plan from user request
 * const engine = new PlanningEngine();
 * const result = await engine.generatePlan(request, context);
 *
 * // Persist the plan
 * await planPersistence.saveCompletePlan(result.plan, result.goals, result.tasks);
 *
 * // Get ready tasks for execution
 * const readyTasks = engine.getReadyTasks(plan.id);
 * ```
 */

// Core engine
export { PlanningEngine, DEFAULT_PLANNING_CONFIG } from "./planning_engine";
export type { PlanningEngineConfig } from "./planning_engine";

// Persistence
export { PlanPersistence, planPersistence } from "./plan_persistence";

// IPC handlers
export {
  PlannerIpcHandlers,
  initPlannerIpcHandlers,
  getPlannerIpcHandlers,
  PLANNER_IPC_CHANNELS,
} from "./ipc_handlers";
export type {
  GeneratePlanRequest,
  GeneratePlanResponse,
  UpdateStatusRequest,
  TaskOutputRequest,
} from "./ipc_handlers";

// Types
export type {
  // Status and priority types
  Priority,
  ExecutionStatus,

  // Goal types
  GoalType,
  Goal,
  SuccessCriteria,
  ExecutionConstraint,

  // Task types
  TaskType,
  Task,
  TaskInput,
  OutputSchema,
  ValidationRule,
  TaskOutput,
  RollbackAction,
  ExecutionAttempt,

  // Plan types
  PlanType,
  Plan,
  ExecutionStrategy,
  NotificationSettings,
  PlanProgress,

  // Context types
  PlanningContext,
  CodebaseState,
  UserPreferences,
  ExecutionHistoryItem,
  KnowledgeGraphContext,
  ResourceConstraints,

  // Event types
  PlanningEventType,
  PlanningEvent,
  PlanningCallbacks,

  // Result types
  PlanGenerationResult,
  PlanExecutionResult,
} from "./types";
