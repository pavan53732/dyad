/**
 * Autonomous Execution Pipeline Orchestrator
 * 
 * Transforms the tool-based execution model into an autonomous reasoning pipeline:
 * 
 * User Request → Planner → Task Graph → Scheduler → Agent Runtime → Tools → Knowledge Layer
 * 
 * This orchestrator coordinates:
 * - Proactive Knowledge Context (KIL injection before reasoning)
 * - Planning Engine (task decomposition)
 * - Agent Scheduler (execution management)
 * - Learning Feedback Loop (outcome recording)
 * 
 * Evolution Phase: Autonomous Execution Pipeline
 */

import log from "electron-log";
import {
  PlanningEngine,
  DEFAULT_PLANNING_CONFIG,
  planPersistence,
  type PlanningContext,
  type PlanGenerationResult,
} from "../planner";
import {
  AgentScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  type ScheduleEntry,
  type ScheduleResult,
  type ExecutionContext,
} from "../scheduler";
import {
  QueryOrchestrator,
  LearningRepository,
  type UnifiedKnowledgeEntity,
} from "../knowledge_integration";

const logger = log.scope("autonomous_pipeline");

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface PipelineConfig {
  /** Enable proactive knowledge context injection */
  enableProactiveKnowledge: boolean;
  /** Enable automatic planning for complex requests */
  enableAutoPlanning: boolean;
  /** Enable scheduler-managed execution */
  enableScheduledExecution: boolean;
  /** Enable learning feedback loop */
  enableLearningFeedback: boolean;
  /** Minimum complexity threshold to trigger planning */
  planningComplexityThreshold: number;
  /** Maximum knowledge context entities to inject */
  maxKnowledgeContextEntities: number;
  /** Maximum parallel tasks */
  maxParallelTasks: number;
  /** Knowledge sources to query proactively */
  proactiveKnowledgeSources: ("code_graph" | "vector_memory" | "dependency_graph" | "architecture" | "reasoning")[];
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enableProactiveKnowledge: true,
  enableAutoPlanning: true,
  enableScheduledExecution: true,
  enableLearningFeedback: true,
  planningComplexityThreshold: 5,
  maxKnowledgeContextEntities: 20,
  maxParallelTasks: 4,
  proactiveKnowledgeSources: ["code_graph", "vector_memory", "architecture"],
};

// ============================================================================
// Pipeline State Types
// ============================================================================

export interface PipelineState {
  /** Current pipeline phase */
  phase: "idle" | "knowledge_gathering" | "planning" | "scheduling" | "executing" | "learning" | "completed" | "failed";
  /** Active plan ID if any */
  activePlanId?: string;
  /** Knowledge context gathered */
  knowledgeContext?: ProactiveKnowledgeContext;
  /** Generated plan */
  plan?: PlanGenerationResult;
  /** Execution results */
  executionResults: Map<string, TaskExecutionResult>;
  /** Learning outcomes recorded */
  learningOutcomes: LearningOutcome[];
  /** Pipeline start time */
  startedAt?: Date;
  /** Pipeline end time */
  completedAt?: Date;
  /** Errors encountered */
  errors: PipelineError[];
}

export interface ProactiveKnowledgeContext {
  /** Task intent extracted from request */
  taskIntent: TaskIntent;
  /** Relevant entities from knowledge sources */
  relevantEntities: UnifiedKnowledgeEntity[];
  /** Architecture decisions related to task */
  relatedDecisions: ArchitectureDecisionSummary[];
  /** Similar patterns from past executions */
  similarPatterns: PatternSummary[];
  /** Dependency insights */
  dependencies: DependencyInsight[];
  /** Recommendations from learning repository */
  recommendations: RecommendationSummary[];
  /** Context build time in ms */
  buildTimeMs: number;
}

export interface TaskIntent {
  /** Primary intent type */
  type: "feature" | "bugfix" | "refactor" | "test" | "deployment" | "exploration" | "custom";
  /** Confidence in intent classification */
  confidence: number;
  /** Key entities mentioned */
  entities: string[];
  /** Files likely involved */
  files: string[];
  /** Technologies likely involved */
  technologies: string[];
  /** Complexity estimate (1-10) */
  complexity: number;
}

export interface ArchitectureDecisionSummary {
  id: string;
  title: string;
  type: string;
  selectedOption: string;
  relevanceScore: number;
}

export interface PatternSummary {
  id: string;
  description: string;
  condition: string;
  solution: string;
  applicability: number;
}

export interface DependencyInsight {
  fromEntity: string;
  toEntity: string;
  type: string;
  impact: "low" | "medium" | "high";
}

export interface RecommendationSummary {
  suggestion: string;
  confidence: number;
  basedOn: string;
}

export interface TaskExecutionResult {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface LearningOutcome {
  decisionId: string;
  outcome: "success" | "partial" | "failure";
  lessons: string[];
  recordedAt: Date;
}

export interface PipelineError {
  phase: PipelineState["phase"];
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

// ============================================================================
// Pipeline Events
// ============================================================================

export type PipelineEventType =
  | "pipeline_started"
  | "knowledge_context_built"
  | "plan_generated"
  | "task_scheduled"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "learning_recorded"
  | "pipeline_completed"
  | "pipeline_failed";

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: Date;
  planId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
  message: string;
}

export type PipelineEventCallback = (event: PipelineEvent) => void;

// ============================================================================
// Pipeline Orchestrator
// ============================================================================

/**
 * Autonomous Execution Pipeline Orchestrator
 * 
 * Coordinates the full execution pipeline from request to completion with:
 * - Proactive knowledge gathering
 * - Automatic task planning
 * - Scheduled execution
 * - Learning feedback
 */
export class PipelineOrchestrator {
  private config: PipelineConfig;
  private planningEngine: PlanningEngine;
  private scheduler: AgentScheduler;
  private queryOrchestrator: QueryOrchestrator;
  private learningRepository: LearningRepository;
  private state: PipelineState;
  private eventCallbacks: Set<PipelineEventCallback> = new Set();

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    
    // Initialize subsystems
    this.planningEngine = new PlanningEngine(DEFAULT_PLANNING_CONFIG, {
      onPlanCreated: (plan) => this.emitEvent({
        type: "plan_generated",
        planId: plan.id,
        message: `Plan created: ${plan.title}`,
        data: { goalCount: plan.goalIds.length },
        timestamp: new Date(),
      }),
      onTaskCreated: (task) => this.emitEvent({
        type: "task_scheduled",
        taskId: task.id,
        message: `Task created: ${task.title}`,
        timestamp: new Date(),
      }),
    });

    this.scheduler = new AgentScheduler(
      {
        ...DEFAULT_SCHEDULER_CONFIG,
        maxGlobalConcurrency: this.config.maxParallelTasks,
      },
      {
        onEntryStarted: (entry) => this.handleTaskStarted(entry),
        onEntryCompleted: (entry, result) => this.handleTaskCompleted(entry, result),
        onEntryFailed: (entry, error) => this.handleTaskFailed(entry, error),
      }
    );

    this.queryOrchestrator = new QueryOrchestrator();
    this.learningRepository = new LearningRepository();

    // Initialize state
    this.state = {
      phase: "idle",
      executionResults: new Map(),
      learningOutcomes: [],
      errors: [],
    };

    logger.info("Autonomous Execution Pipeline initialized");
  }

  // ==========================================================================
  // Pipeline Execution
  // ==========================================================================

  /**
   * Execute the full autonomous pipeline for a request
   */
  async execute(
    request: string,
    context: PlanningContext,
    executionHandler?: (context: ExecutionContext, entry: ScheduleEntry) => Promise<ScheduleResult>
  ): Promise<PipelineState> {
    logger.info(`Starting autonomous pipeline for request: ${request.substring(0, 100)}...`);

    // Initialize state
    this.state = {
      phase: "knowledge_gathering",
      executionResults: new Map(),
      learningOutcomes: [],
      errors: [],
      startedAt: new Date(),
    };

    this.emitEvent({
      type: "pipeline_started",
      message: `Pipeline started for: ${request.substring(0, 50)}...`,
      timestamp: new Date(),
    });

    try {
      // PHASE 1: Proactive Knowledge Gathering
      if (this.config.enableProactiveKnowledge) {
        this.state.phase = "knowledge_gathering";
        this.state.knowledgeContext = await this.buildProactiveKnowledgeContext(request, context.appId);
        
        this.emitEvent({
          type: "knowledge_context_built",
          message: `Knowledge context built with ${this.state.knowledgeContext.relevantEntities.length} entities`,
          data: {
            entityCount: this.state.knowledgeContext.relevantEntities.length,
            buildTimeMs: this.state.knowledgeContext.buildTimeMs,
          },
          timestamp: new Date(),
        });
      }

      // PHASE 2: Planning
      if (this.config.enableAutoPlanning && this.shouldGeneratePlan(request, this.state.knowledgeContext)) {
        this.state.phase = "planning";
        
        // Enhance context with knowledge
        const enhancedContext = this.enhanceContextWithKnowledge(context, this.state.knowledgeContext);
        
        // Generate plan
        this.state.plan = await this.planningEngine.generatePlan(request, enhancedContext);
        this.state.activePlanId = this.state.plan.plan.id;

        // Persist plan
        await planPersistence.saveCompletePlan(
          this.state.plan.plan,
          this.state.plan.goals,
          this.state.plan.tasks
        );

        // Initialize execution results for all tasks
        for (const task of this.state.plan.tasks) {
          this.state.executionResults.set(task.id, {
            taskId: task.id,
            status: "pending",
          });
        }
      }

      // PHASE 3: Scheduling
      if (this.config.enableScheduledExecution && this.state.plan) {
        this.state.phase = "scheduling";
        await this.schedulePlan(this.state.plan, executionHandler);
        
        // Start scheduler
        this.scheduler.start();
      }

      // PHASE 4: Execution
      if (this.state.plan) {
        this.state.phase = "executing";
        await this.waitForCompletion();
      }

      // PHASE 5: Learning
      if (this.config.enableLearningFeedback) {
        this.state.phase = "learning";
        await this.recordLearningOutcomes(context.appId);
      }

      // Complete
      this.state.phase = "completed";
      this.state.completedAt = new Date();

      this.emitEvent({
        type: "pipeline_completed",
        message: "Pipeline execution completed",
        data: {
          duration: this.state.completedAt.getTime() - (this.state.startedAt?.getTime() || 0),
          taskCount: this.state.executionResults.size,
          successCount: Array.from(this.state.executionResults.values()).filter(r => r.status === "completed").length,
        },
        timestamp: new Date(),
      });

      return this.state;

    } catch (error) {
      this.state.phase = "failed";
      this.state.errors.push({
        phase: this.state.phase,
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
        recoverable: false,
      });

      this.emitEvent({
        type: "pipeline_failed",
        message: `Pipeline failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      });

      return this.state;
    } finally {
      // Stop scheduler
      await this.scheduler.stop();
    }
  }

  // ==========================================================================
  // Phase 1: Proactive Knowledge Gathering
  // ==========================================================================

  /**
   * Build proactive knowledge context before execution
   */
  private async buildProactiveKnowledgeContext(
    request: string,
    appId: number
  ): Promise<ProactiveKnowledgeContext> {
    const startTime = Date.now();

    // Extract task intent
    const taskIntent = this.extractTaskIntent(request);

    // Query knowledge sources in parallel
    const [entities, decisions, patterns, recommendations] = await Promise.all([
      this.queryRelevantEntities(appId, request),
      this.queryRelatedDecisions(appId, request),
      this.querySimilarPatterns(appId, request),
      this.getRecommendations(appId, request),
    ]);

    // Build dependency insights
    const dependencies = this.analyzeDependencies(entities);

    return {
      taskIntent,
      relevantEntities: entities.slice(0, this.config.maxKnowledgeContextEntities),
      relatedDecisions: decisions,
      similarPatterns: patterns,
      dependencies,
      recommendations,
      buildTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Extract task intent from request
   */
  private extractTaskIntent(request: string): TaskIntent {
    const lower = request.toLowerCase();
    
    // Classify intent type
    let type: TaskIntent["type"] = "custom";
    let confidence = 0.5;

    if (lower.includes("implement") || lower.includes("add") || lower.includes("create") || lower.includes("build")) {
      type = "feature";
      confidence = 0.8;
    } else if (lower.includes("fix") || lower.includes("bug") || lower.includes("error") || lower.includes("issue")) {
      type = "bugfix";
      confidence = 0.85;
    } else if (lower.includes("refactor") || lower.includes("restructure") || lower.includes("clean")) {
      type = "refactor";
      confidence = 0.75;
    } else if (lower.includes("test") || lower.includes("spec")) {
      type = "test";
      confidence = 0.8;
    } else if (lower.includes("deploy") || lower.includes("release")) {
      type = "deployment";
      confidence = 0.75;
    } else if (lower.includes("explore") || lower.includes("understand") || lower.includes("analyze")) {
      type = "exploration";
      confidence = 0.7;
    }

    // Extract entities (file paths, function names, class names)
    const entities: string[] = [];
    const filePattern = /[\w/-]+\.(ts|tsx|js|jsx|py|go|rs|java)/g;
    const matches = request.match(filePattern);
    if (matches) {
      entities.push(...matches);
    }

    // Estimate complexity
    let complexity = 5;
    if (lower.includes("simple") || lower.includes("quick")) complexity = 3;
    if (lower.includes("complex") || lower.includes("comprehensive")) complexity = 7;
    if (lower.includes("architecture") || lower.includes("redesign")) complexity = 8;
    if (lower.split(" ").length > 50) complexity += 1;
    complexity = Math.min(10, Math.max(1, complexity));

    return {
      type,
      confidence,
      entities,
      files: entities.filter(e => e.includes(".")),
      technologies: this.detectTechnologies(request),
      complexity,
    };
  }

  /**
   * Detect technologies mentioned in request
   */
  private detectTechnologies(request: string): string[] {
    const technologies: string[] = [];
    const techPatterns: Record<string, RegExp> = {
      react: /\breact\b/i,
      typescript: /\btypescript\b|\bts\b/i,
      javascript: /\bjavascript\b|\bjs\b/i,
      node: /\bnode\.?js\b/i,
      python: /\bpython\b|\bpy\b/i,
      postgresql: /\bpostgres|postgresql\b/i,
      mongodb: /\bmongodb|mongo\b/i,
      redis: /\bredis\b/i,
      graphql: /\bgraphql\b/i,
      rest: /\brest\b|\bapi\b/i,
      docker: /\bdocker\b/i,
      kubernetes: /\bkubernetes|k8s\b/i,
    };

    for (const [tech, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(request)) {
        technologies.push(tech);
      }
    }

    return technologies;
  }

  /**
   * Query relevant entities from knowledge sources
   */
  private async queryRelevantEntities(
    appId: number,
    request: string
  ): Promise<UnifiedKnowledgeEntity[]> {
    try {
      const result = await this.queryOrchestrator.query({
        id: `proactive_${Date.now()}`,
        appId,
        query: request,
        sources: this.config.proactiveKnowledgeSources,
        limit: this.config.maxKnowledgeContextEntities,
      });

      return result.entities;
    } catch (error) {
      logger.warn("Failed to query relevant entities:", error);
      return [];
    }
  }

  /**
   * Query related architecture decisions
   */
  private async queryRelatedDecisions(
    appId: number,
    request: string
  ): Promise<ArchitectureDecisionSummary[]> {
    try {
      const decisions = await this.learningRepository.findSimilarDecisions(
        {
          problem: request,
          constraints: [],
          goals: [],
          relevantPaths: [],
        },
        { limit: 5 }
      );

      return decisions.map(({ decision, similarity }) => ({
        id: decision.id,
        title: decision.title,
        type: decision.type,
        selectedOption: decision.selectedOption,
        relevanceScore: similarity,
      }));
    } catch (error) {
      logger.warn("Failed to query related decisions:", error);
      return [];
    }
  }

  /**
   * Query similar patterns from learning repository
   */
  private async querySimilarPatterns(
    appId: number,
    request: string
  ): Promise<PatternSummary[]> {
    try {
      const patterns = await this.learningRepository.getLearnedPatterns(appId, {
        problem: request,
        constraints: [],
        goals: [],
        relevantPaths: [],
      });

      return patterns.slice(0, 5).map((pattern) => ({
        id: pattern.id,
        description: pattern.description,
        condition: pattern.condition,
        solution: pattern.solution,
        applicability: pattern.applicability,
      }));
    } catch (error) {
      logger.warn("Failed to query similar patterns:", error);
      return [];
    }
  }

  /**
   * Get recommendations from learning repository
   */
  private async getRecommendations(
    appId: number,
    request: string
  ): Promise<RecommendationSummary[]> {
    try {
      const recommendations = await this.learningRepository.getRecommendations(appId, {
        problem: request,
        constraints: [],
        goals: [],
        relevantPaths: [],
      });

      return recommendations.slice(0, 5).map((rec) => ({
        suggestion: typeof rec === "string" ? rec : rec.text || JSON.stringify(rec),
        confidence: rec.confidence || 0.7,
        basedOn: rec.basedOn?.title || "past decisions",
      }));
    } catch (error) {
      logger.warn("Failed to get recommendations:", error);
      return [];
    }
  }

  /**
   * Analyze dependencies from entities
   */
  private analyzeDependencies(entities: UnifiedKnowledgeEntity[]): DependencyInsight[] {
    const insights: DependencyInsight[] = [];

    for (const entity of entities) {
      if (entity.relationships) {
        for (const rel of entity.relationships) {
          insights.push({
            fromEntity: entity.name,
            toEntity: rel.targetId,
            type: rel.type,
            impact: rel.type === "imports" || rel.type === "calls" ? "medium" : "low",
          });
        }
      }
    }

    return insights.slice(0, 20);
  }

  // ==========================================================================
  // Phase 2: Planning
  // ==========================================================================

  /**
   * Determine if planning should be triggered
   */
  private shouldGeneratePlan(
    request: string,
    knowledgeContext?: ProactiveKnowledgeContext
  ): boolean {
    // Check complexity threshold
    if (knowledgeContext?.taskIntent.complexity && 
        knowledgeContext.taskIntent.complexity >= this.config.planningComplexityThreshold) {
      return true;
    }

    // Check for multi-step keywords
    const multiStepKeywords = ["and then", "after that", "also", "finally", "multiple", "several"];
    const lower = request.toLowerCase();
    if (multiStepKeywords.some(kw => lower.includes(kw))) {
      return true;
    }

    // Check for planning request keywords
    const planningKeywords = ["implement", "build", "create", "develop", "refactor", "migrate"];
    if (planningKeywords.some(kw => lower.includes(kw))) {
      return true;
    }

    return false;
  }

  /**
   * Enhance planning context with knowledge
   */
  private enhanceContextWithKnowledge(
    context: PlanningContext,
    knowledgeContext?: ProactiveKnowledgeContext
  ): PlanningContext {
    if (!knowledgeContext) return context;

    return {
      ...context,
      knowledgeGraphContext: {
        ...context.knowledgeGraphContext,
        relevantNodes: knowledgeContext.relevantEntities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          source: e.source,
          filePath: e.filePath,
          description: e.description,
        })),
        relatedDecisions: knowledgeContext.relatedDecisions,
        recommendations: knowledgeContext.recommendations,
      },
    };
  }

  // ==========================================================================
  // Phase 3: Scheduling
  // ==========================================================================

  /**
   * Schedule all tasks from the plan
   */
  private async schedulePlan(
    plan: PlanGenerationResult,
    executionHandler?: (context: ExecutionContext, entry: ScheduleEntry) => Promise<ScheduleResult>
  ): Promise<void> {
    // Set execution handler if provided
    if (executionHandler) {
      this.scheduler.setExecutionHandler(executionHandler);
    }

    // Schedule all tasks
    for (const task of plan.tasks) {
      // Find dependencies
      const dependsOnEntries = task.dependsOn
        .map(depId => {
          const depTask = plan.tasks.find(t => t.id === depId);
          if (!depTask) return undefined;
          // Find schedule entry for this task
          const entries = this.scheduler.getEntriesForApp(plan.plan.appId);
          return entries.find(e => e.taskId === depId)?.id;
        })
        .filter((id): id is string => id !== undefined);

      this.scheduler.scheduleTask({
        taskId: task.id,
        planId: plan.plan.id,
        appId: plan.plan.appId,
        priority: this.mapPriority(task.priority),
        dependsOn: dependsOnEntries,
        timeout: task.estimatedDuration ? task.estimatedDuration * 60 : 300,
      });
    }

    logger.info(`Scheduled ${plan.tasks.length} tasks for plan ${plan.plan.id}`);
  }

  /**
   * Map task priority to schedule priority
   */
  private mapPriority(priority: string): "critical" | "high" | "normal" | "low" | "background" {
    switch (priority) {
      case "critical": return "critical";
      case "high": return "high";
      case "medium": return "normal";
      case "low": return "low";
      default: return "normal";
    }
  }

  // ==========================================================================
  // Phase 4: Execution
  // ==========================================================================

  /**
   * Wait for all tasks to complete
   */
  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const pending = Array.from(this.state.executionResults.values())
          .filter(r => r.status === "pending" || r.status === "running");
        
        if (pending.length === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Handle task started event
   */
  private handleTaskStarted(entry: ScheduleEntry): void {
    const result = this.state.executionResults.get(entry.taskId);
    if (result) {
      result.status = "running";
      result.startedAt = new Date();
    }

    this.emitEvent({
      type: "task_started",
      taskId: entry.taskId,
      planId: entry.planId,
      message: `Task started: ${entry.taskId}`,
      timestamp: new Date(),
    });
  }

  /**
   * Handle task completed event
   */
  private handleTaskCompleted(entry: ScheduleEntry, scheduleResult: ScheduleResult): void {
    const result = this.state.executionResults.get(entry.taskId);
    if (result) {
      result.status = "completed";
      result.output = scheduleResult;
      result.completedAt = new Date();
      result.duration = scheduleResult.executionTime;
    }

    this.emitEvent({
      type: "task_completed",
      taskId: entry.taskId,
      planId: entry.planId,
      message: `Task completed: ${entry.taskId}`,
      data: { executionTime: scheduleResult.executionTime },
      timestamp: new Date(),
    });
  }

  /**
   * Handle task failed event
   */
  private handleTaskFailed(entry: ScheduleEntry, error: string): void {
    const result = this.state.executionResults.get(entry.taskId);
    if (result) {
      result.status = "failed";
      result.error = error;
      result.completedAt = new Date();
    }

    this.state.errors.push({
      phase: "executing",
      message: `Task ${entry.taskId} failed: ${error}`,
      timestamp: new Date(),
      recoverable: entry.retryCount < entry.retryConfig.maxRetries,
    });

    this.emitEvent({
      type: "task_failed",
      taskId: entry.taskId,
      planId: entry.planId,
      message: `Task failed: ${entry.taskId} - ${error}`,
      data: { error },
      timestamp: new Date(),
    });
  }

  // ==========================================================================
  // Phase 5: Learning
  // ==========================================================================

  /**
   * Record learning outcomes from execution
   */
  private async recordLearningOutcomes(appId: number): Promise<void> {
    if (!this.state.plan) return;

    const outcomes: LearningOutcome[] = [];

    // Analyze execution results
    const completedTasks = Array.from(this.state.executionResults.values())
      .filter(r => r.status === "completed");
    const failedTasks = Array.from(this.state.executionResults.values())
      .filter(r => r.status === "failed");

    // Record plan outcome
    const planOutcome = failedTasks.length === 0 ? "success" :
                        completedTasks.length > failedTasks.length ? "partial" : "failure";

    // Create learning decision for the plan
    try {
      const decision = await this.learningRepository.recordDecision({
        appId,
        title: `Plan: ${this.state.plan.plan.title}`,
        type: "pattern_selection",
        context: {
          problem: this.state.plan.plan.description,
          constraints: [],
          goals: this.state.plan.goals.map(g => g.title),
          relevantPaths: [],
        },
        alternatives: this.state.plan.goals.map(g => ({
          name: g.title,
          pros: [],
          cons: [],
          description: g.description,
        })),
        selectedOption: "executed_plan",
        rationale: `Generated plan with ${this.state.plan.tasks.length} tasks`,
        outcome: {
          status: planOutcome,
          lessonsLearned: this.extractLessons(),
          determinedAt: new Date(),
        },
        confidence: this.state.plan.confidence,
      });

      outcomes.push({
        decisionId: decision.id,
        outcome: planOutcome,
        lessons: this.extractLessons(),
        recordedAt: new Date(),
      });

      this.emitEvent({
        type: "learning_recorded",
        message: `Learning outcome recorded: ${planOutcome}`,
        data: { decisionId: decision.id, outcome: planOutcome },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.warn("Failed to record learning outcome:", error);
    }

    this.state.learningOutcomes = outcomes;
  }

  /**
   * Extract lessons from execution
   */
  private extractLessons(): string[] {
    const lessons: string[] = [];

    // Analyze errors
    for (const error of this.state.errors) {
      if (!error.recoverable) {
        lessons.push(`Unrecoverable error in ${error.phase}: ${error.message}`);
      }
    }

    // Analyze success patterns
    const avgDuration = Array.from(this.state.executionResults.values())
      .filter(r => r.duration !== undefined)
      .reduce((sum, r) => sum + (r.duration || 0), 0) / this.state.executionResults.size;

    if (avgDuration > 0) {
      lessons.push(`Average task duration: ${Math.round(avgDuration)}ms`);
    }

    return lessons;
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to pipeline events
   */
  subscribe(callback: PipelineEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit pipeline event
   */
  private emitEvent(event: PipelineEvent): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.warn("Event callback error:", error);
      }
    });
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Get knowledge context
   */
  getKnowledgeContext(): ProactiveKnowledgeContext | undefined {
    return this.state.knowledgeContext;
  }

  /**
   * Get plan
   */
  getPlan(): PlanGenerationResult | undefined {
    return this.state.plan;
  }

  /**
   * Get execution results
   */
  getExecutionResults(): Map<string, TaskExecutionResult> {
    return new Map(this.state.executionResults);
  }

  /**
   * Get proactive knowledge context as system prompt injection
   */
  getKnowledgeContextInjection(): string {
    const ctx = this.state.knowledgeContext;
    if (!ctx) return "";

    const parts: string[] = [];

    // Task intent
    parts.push(`[KNOWLEDGE CONTEXT - Task Intent: ${ctx.taskIntent.type} (confidence: ${ctx.taskIntent.confidence.toFixed(2)})]`);

    // Relevant entities
    if (ctx.relevantEntities.length > 0) {
      parts.push("\n[RELEVANT ENTITIES]");
      for (const entity of ctx.relevantEntities.slice(0, 10)) {
        parts.push(`- ${entity.name} (${entity.type}) in ${entity.filePath || "unknown"}`);
        if (entity.description) {
          parts.push(`  ${entity.description.substring(0, 100)}...`);
        }
      }
    }

    // Related decisions
    if (ctx.relatedDecisions.length > 0) {
      parts.push("\n[RELATED ARCHITECTURE DECISIONS]");
      for (const decision of ctx.relatedDecisions.slice(0, 5)) {
        parts.push(`- ${decision.title}: chose "${decision.selectedOption}" (${decision.type})`);
      }
    }

    // Recommendations
    if (ctx.recommendations.length > 0) {
      parts.push("\n[RECOMMENDATIONS]");
      for (const rec of ctx.recommendations) {
        parts.push(`- ${rec.suggestion} (confidence: ${rec.confidence.toFixed(2)})`);
      }
    }

    // Similar patterns
    if (ctx.similarPatterns.length > 0) {
      parts.push("\n[SIMILAR PATTERNS]");
      for (const pattern of ctx.similarPatterns.slice(0, 3)) {
        parts.push(`- When ${pattern.condition}: ${pattern.solution}`);
      }
    }

    parts.push(`\n[Context built in ${ctx.buildTimeMs}ms]`);

    return parts.join("\n");
  }
}

// ============================================================================
// Exports
// ============================================================================

// Note: PipelineOrchestrator and DEFAULT_PIPELINE_CONFIG are already exported inline at definition
export type {
  PipelineConfig,
  PipelineState,
  ProactiveKnowledgeContext,
  TaskIntent,
  TaskExecutionResult,
  LearningOutcome,
  PipelineError,
  PipelineEvent,
  PipelineEventCallback,
};
