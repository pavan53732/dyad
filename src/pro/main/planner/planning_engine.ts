/**
 * Autonomous Planning Engine - Core Planning Logic
 * 
 * Implements autonomous planning capabilities including goal decomposition,
 * task generation, dependency resolution, and adaptive planning.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  Goal,
  Task,
  Plan,
  PlanningContext,
  PlanGenerationResult,
  PlanExecutionResult,
  ExecutionStatus,
  PlanningCallbacks,
  PlanningEvent,
  TaskType,
  GoalType,
  Priority,
  SuccessCriteria,
  ExecutionConstraint,
  PlanType,
  ExecutionStrategy,
} from "./types";

// ============================================================================
// Planning Engine Configuration
// ============================================================================

/**
 * Configuration for the planning engine
 */
export interface PlanningEngineConfig {
  /** Maximum goals per plan */
  maxGoalsPerPlan: number;
  /** Maximum tasks per goal */
  maxTasksPerGoal: number;
  /** Maximum task depth (subtasks) */
  maxTaskDepth: number;
  /** Default task timeout (minutes) */
  defaultTaskTimeout: number;
  /** Default plan timeout (minutes) */
  defaultPlanTimeout: number;
  /** Enable adaptive planning */
  enableAdaptivePlanning: boolean;
  /** Enable auto-replanning on failure */
  enableAutoReplanning: boolean;
  /** Maximum replanning attempts */
  maxReplanningAttempts: number;
  /** Enable parallel execution */
  enableParallelExecution: boolean;
  /** Default maximum parallel tasks */
  defaultMaxParallelTasks: number;
}

/**
 * Default planning engine configuration
 */
export const DEFAULT_PLANNING_CONFIG: PlanningEngineConfig = {
  maxGoalsPerPlan: 20,
  maxTasksPerGoal: 15,
  maxTaskDepth: 3,
  defaultTaskTimeout: 30,
  defaultPlanTimeout: 480, // 8 hours
  enableAdaptivePlanning: true,
  enableAutoReplanning: true,
  maxReplanningAttempts: 3,
  enableParallelExecution: true,
  defaultMaxParallelTasks: 4,
};

// ============================================================================
// Planning Engine Class
// ============================================================================

/**
 * Autonomous Planning Engine
 * 
 * Responsible for:
 * - Goal decomposition into tasks
 * - Dependency graph construction
 * - Plan optimization
 * - Execution strategy selection
 * - Adaptive replanning
 */
export class PlanningEngine {
  private config: PlanningEngineConfig;
  private callbacks: PlanningCallbacks;
  private planRegistry: Map<string, Plan> = new Map();
  private goalRegistry: Map<string, Goal> = new Map();
  private taskRegistry: Map<string, Task> = new Map();
  private executionQueue: Task[] = [];

  constructor(
    config: Partial<PlanningEngineConfig> = {},
    callbacks: PlanningCallbacks = {},
  ) {
    this.config = { ...DEFAULT_PLANNING_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  // ==========================================================================
  // Plan Generation
  // ==========================================================================

  /**
   * Generate a plan from a user request
   */
  async generatePlan(
    request: string,
    context: PlanningContext,
    options: {
      planType?: PlanType;
      priority?: Priority;
      constraints?: ExecutionConstraint[];
    } = {},
  ): Promise<PlanGenerationResult> {
    // Step 1: Analyze the request and identify goals
    const goals = await this.analyzeRequest(request, context);

    // Step 2: Decompose goals into tasks
    const tasks: Task[] = [];
    for (const goal of goals) {
      const goalTasks = await this.decomposeGoal(goal, context);
      tasks.push(...goalTasks);
      goal.taskIds = goalTasks.map((t) => t.id);
    }

    // Step 3: Resolve dependencies between tasks
    this.resolveDependencies(tasks, context);

    // Step 4: Create the plan
    const plan: Plan = {
      id: uuidv4(),
      appId: context.appId,
      title: this.generatePlanTitle(request, goals),
      description: request,
      type: options.planType || this.inferPlanType(goals),
      status: "pending",
      goalIds: goals.map((g) => g.id),
      strategy: this.createExecutionStrategy(options, context),
      constraints: options.constraints || [],
      progress: {
        totalGoals: goals.length,
        completedGoals: 0,
        failedGoals: 0,
        totalTasks: tasks.length,
        completedTasks: 0,
        failedTasks: 0,
        runningTasks: 0,
        percentage: 0,
        lastUpdated: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: this.extractTags(request),
    };

    // Step 5: Register and emit event
    this.planRegistry.set(plan.id, plan);
    goals.forEach((g) => this.goalRegistry.set(g.id, g));
    tasks.forEach((t) => this.taskRegistry.set(t.id, t));

    this.emitEvent({
      type: "plan_created",
      planId: plan.id,
      message: `Created plan: ${plan.title}`,
      data: { goalCount: goals.length, taskCount: tasks.length },
      timestamp: new Date(),
    });

    this.callbacks.onPlanCreated?.(plan);

    return {
      plan,
      goals,
      tasks,
      confidence: this.calculatePlanConfidence(plan, goals, tasks, context),
      warnings: this.generateWarnings(plan, goals, tasks),
    };
  }

  /**
   * Analyze user request to identify goals
   */
  private async analyzeRequest(
    request: string,
    context: PlanningContext,
  ): Promise<Goal[]> {
    const goals: Goal[] = [];

    // Parse request for intent
    const intents = this.parseIntents(request);

    for (const intent of intents) {
      const goal: Goal = {
        id: uuidv4(),
        appId: context.appId,
        title: intent.title,
        description: intent.description,
        type: intent.type,
        priority: intent.priority,
        status: "pending",
        successCriteria: intent.successCriteria,
        constraints: intent.constraints,
        taskIds: [],
        dependsOn: [],
        estimatedComplexity: intent.estimatedComplexity,
        estimatedDuration: intent.estimatedDuration,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
      };

      goals.push(goal);
      this.callbacks.onGoalCreated?.(goal);
    }

    // Resolve goal dependencies
    this.resolveGoalDependencies(goals);

    return goals;
  }

  /**
   * Parse user request for intents
   */
  private parseIntents(request: string): Array<{
    title: string;
    description: string;
    type: GoalType;
    priority: Priority;
    successCriteria: SuccessCriteria[];
    constraints: ExecutionConstraint[];
    estimatedComplexity: number;
    estimatedDuration?: number;
  }> {
    // Simple keyword-based intent parsing
    // In a real implementation, this would use NLP/LLM
    const intents: Array<{
      title: string;
      description: string;
      type: GoalType;
      priority: Priority;
      successCriteria: SuccessCriteria[];
      constraints: ExecutionConstraint[];
      estimatedComplexity: number;
      estimatedDuration?: number;
    }> = [];

    const lowerRequest = request.toLowerCase();

    // Feature implementation intent
    if (lowerRequest.includes("implement") || lowerRequest.includes("add") || lowerRequest.includes("create")) {
      intents.push({
        title: "Implement Feature",
        description: request,
        type: "feature",
        priority: "high",
        successCriteria: [
          {
            id: uuidv4(),
            description: "Feature is implemented and working",
            verificationType: "automated",
            isMet: false,
          },
        ],
        constraints: [],
        estimatedComplexity: 7,
        estimatedDuration: 120,
      });
    }

    // Bug fix intent
    if (lowerRequest.includes("fix") || lowerRequest.includes("bug") || lowerRequest.includes("error")) {
      intents.push({
        title: "Fix Issue",
        description: request,
        type: "bugfix",
        priority: "critical",
        successCriteria: [
          {
            id: uuidv4(),
            description: "Bug is fixed and tests pass",
            verificationType: "automated",
            isMet: false,
          },
        ],
        constraints: [],
        estimatedComplexity: 5,
        estimatedDuration: 60,
      });
    }

    // Refactoring intent
    if (lowerRequest.includes("refactor") || lowerRequest.includes("restructure") || lowerRequest.includes("clean up")) {
      intents.push({
        title: "Refactor Code",
        description: request,
        type: "refactor",
        priority: "medium",
        successCriteria: [
          {
            id: uuidv4(),
            description: "Code is refactored and tests still pass",
            verificationType: "automated",
            isMet: false,
          },
        ],
        constraints: [],
        estimatedComplexity: 6,
        estimatedDuration: 90,
      });
    }

    // Testing intent
    if (lowerRequest.includes("test") || lowerRequest.includes("testing")) {
      intents.push({
        title: "Write Tests",
        description: request,
        type: "test",
        priority: "medium",
        successCriteria: [
          {
            id: uuidv4(),
            description: "Tests are written and passing",
            verificationType: "automated",
            isMet: false,
          },
        ],
        constraints: [],
        estimatedComplexity: 4,
        estimatedDuration: 45,
      });
    }

    // Default intent if no specific type detected
    if (intents.length === 0) {
      intents.push({
        title: "Complete Task",
        description: request,
        type: "custom",
        priority: "medium",
        successCriteria: [
          {
            id: uuidv4(),
            description: "Task is completed successfully",
            verificationType: "hybrid",
            isMet: false,
          },
        ],
        constraints: [],
        estimatedComplexity: 5,
        estimatedDuration: 60,
      });
    }

    return intents;
  }

  /**
   * Resolve dependencies between goals
   */
  private resolveGoalDependencies(goals: Goal[]): void {
    // Simple dependency resolution based on goal types
    // Feature goals depend on bugfix goals
    // Test goals depend on feature goals
    const typeOrder: GoalType[] = ["bugfix", "feature", "refactor", "test", "documentation"];

    for (let i = 0; i < goals.length; i++) {
      const currentTypeIndex = typeOrder.indexOf(goals[i].type);
      for (let j = 0; j < i; j++) {
        const prevTypeIndex = typeOrder.indexOf(goals[j].type);
        if (prevTypeIndex < currentTypeIndex) {
          goals[i].dependsOn.push(goals[j].id);
        }
      }
    }
  }

  /**
   * Decompose a goal into tasks
   */
  private async decomposeGoal(goal: Goal, context: PlanningContext): Promise<Task[]> {
    const tasks: Task[] = [];
    let taskOrder = 0;

    // Generate tasks based on goal type
    const taskTemplates = this.getTaskTemplatesForGoalType(goal.type);

    for (const template of taskTemplates) {
      // Skip tasks that require tools not available
      if (template.requiredTools.some((t) => !context.availableTools.includes(t))) {
        continue;
      }

      const task: Task = {
        id: uuidv4(),
        goalId: goal.id,
        appId: context.appId,
        title: template.title,
        description: template.description.replace("{goal}", goal.title),
        type: template.type,
        priority: goal.priority,
        status: "pending",
        order: taskOrder++,
        dependsOn: template.dependsOnOrder?.map((i) => tasks[i]?.id).filter(Boolean) || [],
        requiredTools: template.requiredTools,
        input: template.input,
        expectedOutput: template.expectedOutput,
        estimatedDuration: template.estimatedDuration,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        attempts: [],
      };

      tasks.push(task);
      this.callbacks.onTaskCreated?.(task);
    }

    // Limit tasks per goal
    if (tasks.length > this.config.maxTasksPerGoal) {
      tasks.length = this.config.maxTasksPerGoal;
    }

    return tasks;
  }

  /**
   * Get task templates for a goal type
   */
  private getTaskTemplatesForGoalType(goalType: GoalType): Array<{
    title: string;
    description: string;
    type: TaskType;
    requiredTools: string[];
    dependsOnOrder?: number[];
    input: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
    estimatedDuration: number;
  }> {
    const templates: Record<GoalType, Array<{
      title: string;
      description: string;
      type: TaskType;
      requiredTools: string[];
      dependsOnOrder?: number[];
      input: Record<string, unknown>;
      expectedOutput?: Record<string, unknown>;
      estimatedDuration: number;
    }>> = {
      feature: [
        {
          title: "Analyze Requirements",
          description: "Analyze requirements for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file", "code_search"],
          input: { type: "text" },
          estimatedDuration: 10,
        },
        {
          title: "Design Implementation",
          description: "Design implementation approach for {goal}",
          type: "planning",
          requiredTools: ["read_file", "code_search"],
          dependsOnOrder: [0],
          input: { type: "text" },
          estimatedDuration: 15,
        },
        {
          title: "Implement Feature",
          description: "Implement the feature for {goal}",
          type: "code_generation",
          requiredTools: ["write_file", "edit_file"],
          dependsOnOrder: [1],
          input: { type: "code" },
          estimatedDuration: 45,
        },
        {
          title: "Run Tests",
          description: "Run tests for {goal}",
          type: "testing",
          requiredTools: ["execute_command"],
          dependsOnOrder: [2],
          input: { type: "none" },
          estimatedDuration: 10,
        },
        {
          title: "Verify Implementation",
          description: "Verify the implementation of {goal}",
          type: "verification",
          requiredTools: ["read_file", "execute_command"],
          dependsOnOrder: [3],
          input: { type: "none" },
          estimatedDuration: 5,
        },
      ],
      bugfix: [
        {
          title: "Identify Bug",
          description: "Identify and analyze the bug for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file", "code_search", "grep"],
          input: { type: "text" },
          estimatedDuration: 15,
        },
        {
          title: "Implement Fix",
          description: "Implement the fix for {goal}",
          type: "code_modification",
          requiredTools: ["edit_file"],
          dependsOnOrder: [0],
          input: { type: "code" },
          estimatedDuration: 20,
        },
        {
          title: "Verify Fix",
          description: "Verify the fix for {goal}",
          type: "testing",
          requiredTools: ["execute_command"],
          dependsOnOrder: [1],
          input: { type: "none" },
          estimatedDuration: 10,
        },
      ],
      refactor: [
        {
          title: "Analyze Code Structure",
          description: "Analyze code structure for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file", "code_search"],
          input: { type: "none" },
          estimatedDuration: 10,
        },
        {
          title: "Apply Refactoring",
          description: "Apply refactoring for {goal}",
          type: "code_modification",
          requiredTools: ["edit_file"],
          dependsOnOrder: [0],
          input: { type: "code" },
          estimatedDuration: 30,
        },
        {
          title: "Verify Refactoring",
          description: "Verify refactoring didn't break anything for {goal}",
          type: "testing",
          requiredTools: ["execute_command"],
          dependsOnOrder: [1],
          input: { type: "none" },
          estimatedDuration: 10,
        },
      ],
      test: [
        {
          title: "Identify Test Targets",
          description: "Identify code to test for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file", "code_search"],
          input: { type: "none" },
          estimatedDuration: 5,
        },
        {
          title: "Write Tests",
          description: "Write tests for {goal}",
          type: "code_generation",
          requiredTools: ["write_file"],
          dependsOnOrder: [0],
          input: { type: "code" },
          estimatedDuration: 20,
        },
        {
          title: "Run Tests",
          description: "Run tests for {goal}",
          type: "testing",
          requiredTools: ["execute_command"],
          dependsOnOrder: [1],
          input: { type: "none" },
          estimatedDuration: 5,
        },
      ],
      documentation: [
        {
          title: "Analyze Code",
          description: "Analyze code for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file"],
          input: { type: "none" },
          estimatedDuration: 5,
        },
        {
          title: "Write Documentation",
          description: "Write documentation for {goal}",
          type: "code_generation",
          requiredTools: ["write_file"],
          dependsOnOrder: [0],
          input: { type: "text" },
          estimatedDuration: 15,
        },
      ],
      deployment: [
        {
          title: "Pre-deployment Checks",
          description: "Run pre-deployment checks for {goal}",
          type: "verification",
          requiredTools: ["execute_command"],
          input: { type: "none" },
          estimatedDuration: 10,
        },
        {
          title: "Deploy",
          description: "Deploy for {goal}",
          type: "command_execution",
          requiredTools: ["execute_command"],
          dependsOnOrder: [0],
          input: { type: "none" },
          estimatedDuration: 15,
        },
        {
          title: "Verify Deployment",
          description: "Verify deployment for {goal}",
          type: "verification",
          requiredTools: ["execute_command"],
          dependsOnOrder: [1],
          input: { type: "none" },
          estimatedDuration: 5,
        },
      ],
      maintenance: [
        {
          title: "Check System Status",
          description: "Check system status for {goal}",
          type: "code_analysis",
          requiredTools: ["execute_command", "read_file"],
          input: { type: "none" },
          estimatedDuration: 10,
        },
        {
          title: "Perform Maintenance",
          description: "Perform maintenance for {goal}",
          type: "command_execution",
          requiredTools: ["execute_command"],
          dependsOnOrder: [0],
          input: { type: "none" },
          estimatedDuration: 20,
        },
      ],
      exploration: [
        {
          title: "Explore Codebase",
          description: "Explore codebase for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file", "code_search", "grep"],
          input: { type: "none" },
          estimatedDuration: 15,
        },
      ],
      custom: [
        {
          title: "Analyze Request",
          description: "Analyze request for {goal}",
          type: "code_analysis",
          requiredTools: ["read_file"],
          input: { type: "text" },
          estimatedDuration: 10,
        },
        {
          title: "Execute Task",
          description: "Execute task for {goal}",
          type: "code_modification",
          requiredTools: ["edit_file", "write_file"],
          dependsOnOrder: [0],
          input: { type: "code" },
          estimatedDuration: 30,
        },
      ],
    };

    return templates[goalType] || templates.custom;
  }

  /**
   * Resolve dependencies between tasks
   */
  private resolveDependencies(tasks: Task[], context: PlanningContext): void {
    // Build dependency graph based on:
    // 1. File dependencies (if task modifies file A, tasks that read A should run first)
    // 2. Tool dependencies (some tools should run before others)
    // 3. Knowledge graph context

    for (const task of tasks) {
      // Add implicit dependencies based on file operations
      if (task.input.filePaths) {
        for (const filePath of task.input.filePaths) {
          const dependOnTask = tasks.find(
            (t) =>
              t.id !== task.id &&
              t.expectedOutput?.filePatterns?.some((p) => filePath.match(p)),
          );
          if (dependOnTask && !task.dependsOn.includes(dependOnTask.id)) {
            task.dependsOn.push(dependOnTask.id);
          }
        }
      }
    }
  }

  /**
   * Create execution strategy
   */
  private createExecutionStrategy(
    options: { constraints?: ExecutionConstraint[] },
    context: PlanningContext,
  ): ExecutionStrategy {
    return {
      mode: context.userPreferences.preferredMode,
      maxParallelTasks: context.userPreferences.maxParallelTasks,
      autoRetry: this.config.enableAutoReplanning,
      autoRollback: context.userPreferences.autoRollback,
      globalTimeout: this.config.defaultPlanTimeout,
      taskTimeout: this.config.defaultTaskTimeout,
      notifications: context.userPreferences.notifications,
      checkpointFrequency: "per_goal",
    };
  }

  /**
   * Generate plan title
   */
  private generatePlanTitle(request: string, goals: Goal[]): string {
    if (goals.length === 1) {
      return goals[0].title;
    }
    return `Multi-goal Plan: ${goals.map((g) => g.title).join(", ")}`;
  }

  /**
   * Infer plan type from goals
   */
  private inferPlanType(goals: Goal[]): PlanType {
    const types = goals.map((g) => g.type);

    if (types.every((t) => t === "feature")) return "development";
    if (types.every((t) => t === "bugfix")) return "bugfix";
    if (types.every((t) => t === "refactor")) return "refactoring";
    if (types.every((t) => t === "test")) return "testing";
    if (types.every((t) => t === "deployment")) return "deployment";

    return "custom";
  }

  /**
   * Extract tags from request
   */
  private extractTags(request: string): string[] {
    const tags: string[] = [];
    const words = request.toLowerCase().split(/\s+/);

    const tagKeywords: Record<string, string> = {
      urgent: "urgent",
      important: "important",
      quick: "quick",
      refactor: "refactoring",
      test: "testing",
      fix: "bugfix",
      implement: "feature",
      deploy: "deployment",
      migrate: "migration",
    };

    for (const word of words) {
      if (tagKeywords[word]) {
        tags.push(tagKeywords[word]);
      }
    }

    return [...new Set(tags)];
  }

  /**
   * Calculate plan confidence
   */
  private calculatePlanConfidence(
    plan: Plan,
    goals: Goal[],
    tasks: Task[],
    context: PlanningContext,
  ): number {
    let confidence = 1.0;

    // Reduce confidence for complex plans
    if (goals.length > 5) confidence *= 0.9;
    if (tasks.length > 20) confidence *= 0.9;

    // Reduce confidence if tools are missing
    const requiredTools = new Set(tasks.flatMap((t) => t.requiredTools));
    const availableTools = new Set(context.availableTools);
    const missingTools = [...requiredTools].filter((t) => !availableTools.has(t));
    if (missingTools.length > 0) {
      confidence *= Math.pow(0.8, missingTools.length);
    }

    // Reduce confidence for complex dependencies
    const maxDependencyDepth = this.calculateMaxDependencyDepth(tasks);
    if (maxDependencyDepth > 5) confidence *= 0.9;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate maximum dependency depth
   */
  private calculateMaxDependencyDepth(tasks: Task[]): number {
    const depths = new Map<string, number>();

    const getDepth = (taskId: string, visited: Set<string>): number => {
      if (depths.has(taskId)) return depths.get(taskId)!;
      if (visited.has(taskId)) return 0; // Circular dependency

      visited.add(taskId);
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.dependsOn.length === 0) {
        depths.set(taskId, 0);
        return 0;
      }

      const maxDepDepth = Math.max(
        ...task.dependsOn.map((id) => getDepth(id, visited)),
      );
      const depth = maxDepDepth + 1;
      depths.set(taskId, depth);
      return depth;
    };

    return Math.max(...tasks.map((t) => getDepth(t.id, new Set())));
  }

  /**
   * Generate warnings for plan
   */
  private generateWarnings(plan: Plan, goals: Goal[], tasks: Task[]): string[] {
    const warnings: string[] = [];

    if (goals.length > this.config.maxGoalsPerPlan * 0.8) {
      warnings.push("Plan has many goals, consider splitting into multiple plans");
    }

    if (tasks.length > 30) {
      warnings.push("Plan has many tasks, execution may take a long time");
    }

    const maxDepth = this.calculateMaxDependencyDepth(tasks);
    if (maxDepth > 5) {
      warnings.push("Plan has deep task dependencies, consider simplifying");
    }

    const circularDeps = this.findCircularDependencies(tasks);
    if (circularDeps.length > 0) {
      warnings.push(`Circular dependencies detected: ${circularDeps.join(", ")}`);
    }

    return warnings;
  }

  /**
   * Find circular dependencies
   */
  private findCircularDependencies(tasks: Task[]): string[] {
    const circular: string[] = [];

    const findCycle = (taskId: string, path: string[], visited: Set<string>): void => {
      if (visited.has(taskId)) {
        const cycleStart = path.indexOf(taskId);
        if (cycleStart !== -1) {
          circular.push(path.slice(cycleStart).join(" -> "));
        }
        return;
      }

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      visited.add(taskId);
      path.push(taskId);

      for (const depId of task.dependsOn) {
        findCycle(depId, [...path], new Set(visited));
      }
    };

    for (const task of tasks) {
      findCycle(task.id, [], new Set());
    }

    return [...new Set(circular)];
  }

  // ==========================================================================
  // Plan Execution
  // ==========================================================================

  /**
   * Get tasks ready for execution
   */
  getReadyTasks(planId: string): Task[] {
    const plan = this.planRegistry.get(planId);
    if (!plan) return [];

    const tasks = plan.goalIds
      .flatMap((goalId) => this.getGoalTasks(goalId))
      .filter((task) => task.status === "pending");

    return tasks.filter((task) => this.areDependenciesMet(task));
  }

  /**
   * Check if task dependencies are met
   */
  private areDependenciesMet(task: Task): boolean {
    return task.dependsOn.every((depId) => {
      const depTask = this.taskRegistry.get(depId);
      return depTask && depTask.status === "completed";
    });
  }

  /**
   * Get tasks for a goal
   */
  private getGoalTasks(goalId: string): Task[] {
    return [...this.taskRegistry.values()].filter((t) => t.goalId === goalId);
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: ExecutionStatus): Task | undefined {
    const task = this.taskRegistry.get(taskId);
    if (!task) return undefined;

    task.status = status;
    task.updatedAt = new Date();

    if (status === "running") {
      task.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      task.completedAt = new Date();
    }

    this.callbacks.onTaskStatusChanged?.(task, status);
    this.emitEvent({
      type: status === "completed" ? "task_completed" : status === "failed" ? "task_failed" : "task_started",
      taskId: task.id,
      goalId: task.goalId,
      message: `Task ${task.title} status changed to ${status}`,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Update plan progress
   */
  updatePlanProgress(planId: string): void {
    const plan = this.planRegistry.get(planId);
    if (!plan) return;

    const tasks = plan.goalIds.flatMap((goalId) => this.getGoalTasks(goalId));
    const goals = plan.goalIds.map((id) => this.goalRegistry.get(id)!).filter(Boolean);

    plan.progress = {
      totalGoals: goals.length,
      completedGoals: goals.filter((g) => g.status === "completed").length,
      failedGoals: goals.filter((g) => g.status === "failed").length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === "completed").length,
      failedTasks: tasks.filter((t) => t.status === "failed").length,
      runningTasks: tasks.filter((t) => t.status === "running").length,
      percentage: Math.round(
        (tasks.filter((t) => t.status === "completed").length / tasks.length) * 100,
      ),
      lastUpdated: new Date(),
    };

    plan.updatedAt = new Date();
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  /**
   * Emit a planning event
   */
  private emitEvent(event: PlanningEvent): void {
    this.callbacks.onEvent?.(event);
  }

  // ==========================================================================
  // Persistence Accessors
  // ==========================================================================

  /**
   * Get plan by ID
   */
  getPlan(planId: string): Plan | undefined {
    return this.planRegistry.get(planId);
  }

  /**
   * Get goal by ID
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goalRegistry.get(goalId);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.taskRegistry.get(taskId);
  }

  /**
   * Get all plans for an app
   */
  getPlansForApp(appId: number): Plan[] {
    return [...this.planRegistry.values()].filter((p) => p.appId === appId);
  }

  /**
   * Load plan from persistence
   */
  loadPlan(plan: Plan, goals: Goal[], tasks: Task[]): void {
    this.planRegistry.set(plan.id, plan);
    goals.forEach((g) => this.goalRegistry.set(g.id, g));
    tasks.forEach((t) => this.taskRegistry.set(t.id, t));
  }
}

// ============================================================================
// Exports
// ============================================================================

export { PlanningEngine, DEFAULT_PLANNING_CONFIG };
export type { PlanningEngineConfig };
