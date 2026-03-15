/**
 * Autonomous Planning Engine - Type Definitions
 * 
 * Defines types for autonomous planning, goal decomposition,
 * task scheduling, and plan execution.
 */

// ============================================================================
// Goal Types
// ============================================================================

/**
 * Priority levels for goals and tasks
 */
export type Priority = "critical" | "high" | "medium" | "low";

/**
 * Status of goals, tasks, and plans
 */
export type ExecutionStatus =
  | "pending"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

/**
 * Goal type categorization
 */
export type GoalType =
  | "feature"          // Implement a new feature
  | "bugfix"           // Fix a bug
  | "refactor"         // Refactor code
  | "optimize"         // Performance optimization
  | "test"             // Write/fix tests
  | "documentation"    // Write documentation
  | "deployment"       // Deploy application
  | "maintenance"      // Maintenance tasks
  | "exploration"      // Explore/research
  | "custom";          // Custom goal

/**
 * A high-level goal to be achieved
 */
export interface Goal {
  /** Unique identifier */
  id: string;
  /** Application ID */
  appId: number;
  /** Goal title */
  title: string;
  /** Detailed description */
  description: string;
  /** Goal type */
  type: GoalType;
  /** Priority level */
  priority: Priority;
  /** Current status */
  status: ExecutionStatus;
  /** Success criteria */
  successCriteria: SuccessCriteria[];
  /** Constraints on execution */
  constraints: ExecutionConstraint[];
  /** Parent goal ID (for subgoals) */
  parentGoalId?: string;
  /** Decomposed tasks */
  taskIds: string[];
  /** Dependencies on other goals */
  dependsOn: string[];
  /** Estimated complexity (1-10) */
  estimatedComplexity?: number;
  /** Estimated duration in minutes */
  estimatedDuration?: number;
  /** Actual duration in minutes */
  actualDuration?: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated */
  updatedAt: Date;
  /** Started execution */
  startedAt?: Date;
  /** Completed execution */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Retry count */
  retryCount: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** User who created this goal */
  createdBy?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Success criteria for a goal
 */
export interface SuccessCriteria {
  /** Criteria ID */
  id: string;
  /** Description of success condition */
  description: string;
  /** Type of verification */
  verificationType: "automated" | "manual" | "hybrid";
  /** Verification command or check */
  verificationCommand?: string;
  /** Expected result */
  expectedResult?: string;
  /** Whether criteria is met */
  isMet: boolean;
  /** Verification timestamp */
  verifiedAt?: Date;
  /** Verification output */
  verificationOutput?: string;
}

/**
 * Execution constraint
 */
export interface ExecutionConstraint {
  /** Constraint type */
  type: "time_limit" | "resource_limit" | "dependency" | "ordering" | "parallelism" | "custom";
  /** Constraint value */
  value: string | number | boolean;
  /** Constraint description */
  description?: string;
  /** Whether constraint is hard (must be met) or soft (preferred) */
  isHard: boolean;
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task type categorization
 */
export type TaskType =
  | "code_generation"    // Generate code
  | "code_modification"  // Modify existing code
  | "code_analysis"      // Analyze code
  | "file_operation"     // File read/write/delete
  | "command_execution"  // Run shell command
  | "testing"            // Run tests
  | "git_operation"      // Git operations
  | "dependency_mgmt"    // Dependency management
  | "api_call"           // External API call
  | "user_interaction"   // Require user input
  | "planning"           // Sub-planning task
  | "verification"       // Verify results
  | "rollback"           // Rollback changes
  | "notification"       // Send notification
  | "custom";            // Custom task

/**
 * A task is an atomic unit of work
 */
export interface Task {
  /** Unique identifier */
  id: string;
  /** Goal this task belongs to */
  goalId: string;
  /** Application ID */
  appId: number;
  /** Task title */
  title: string;
  /** Detailed description */
  description: string;
  /** Task type */
  type: TaskType;
  /** Priority level */
  priority: Priority;
  /** Current status */
  status: ExecutionStatus;
  /** Task order within goal */
  order: number;
  /** Dependencies on other tasks */
  dependsOn: string[];
  /** Required tools/capabilities */
  requiredTools: string[];
  /** Input parameters */
  input: TaskInput;
  /** Expected output schema */
  expectedOutput?: OutputSchema;
  /** Actual output */
  output?: TaskOutput;
  /** Rollback action if task fails */
  rollbackAction?: RollbackAction;
  /** Estimated duration in minutes */
  estimatedDuration?: number;
  /** Actual duration in minutes */
  actualDuration?: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated */
  updatedAt: Date;
  /** Started execution */
  startedAt?: Date;
  /** Completed execution */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Retry count */
  retryCount: number;
  /** Maximum retries */
  maxRetries: number;
  /** Assigned agent ID */
  assignedAgentId?: string;
  /** Execution attempts */
  attempts: ExecutionAttempt[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task input parameters
 */
export interface TaskInput {
  /** Input type */
  type: "text" | "code" | "file" | "structured" | "none";
  /** Text content */
  content?: string;
  /** File paths */
  filePaths?: string[];
  /** Structured data */
  data?: Record<string, unknown>;
  /** Context from previous tasks */
  context?: Record<string, unknown>;
}

/**
 * Output schema definition
 */
export interface OutputSchema {
  /** Output type */
  type: "file" | "text" | "structured" | "none";
  /** Expected file patterns */
  filePatterns?: string[];
  /** JSON schema for structured output */
  jsonSchema?: Record<string, unknown>;
  /** Validation rules */
  validationRules?: ValidationRule[];
}

/**
 * Validation rule for output
 */
export interface ValidationRule {
  /** Rule type */
  type: "exists" | "matches" | "contains" | "custom" | "schema";
  /** Rule value/pattern */
  value: string;
  /** Error message if validation fails */
  errorMessage?: string;
}

/**
 * Task execution output
 */
export interface TaskOutput {
  /** Output type */
  type: "file" | "text" | "structured" | "error" | "none";
  /** Text output */
  content?: string;
  /** Output files */
  files?: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
  }>;
  /** Structured output */
  data?: Record<string, unknown>;
  /** Error if failed */
  error?: string;
  /** Execution time in ms */
  executionTime: number;
  /** Tokens used (if LLM task) */
  tokensUsed?: number;
  /** Whether output is verified */
  isVerified: boolean;
}

/**
 * Rollback action specification
 */
export interface RollbackAction {
  /** Rollback type */
  type: "git_revert" | "file_restore" | "custom" | "none";
  /** Git commit hash to revert to */
  commitHash?: string;
  /** Files to restore */
  filesToRestore?: Array<{
    path: string;
    originalContent?: string;
  }>;
  /** Custom rollback command */
  command?: string;
  /** Whether rollback was executed */
  executed: boolean;
  /** Rollback timestamp */
  executedAt?: Date;
}

/**
 * Execution attempt record
 */
export interface ExecutionAttempt {
  /** Attempt number */
  attemptNumber: number;
  /** Start time */
  startedAt: Date;
  /** End time */
  endedAt?: Date;
  /** Status */
  status: "running" | "success" | "failed" | "timeout";
  /** Error if failed */
  error?: string;
  /** Output from this attempt */
  output?: TaskOutput;
}

// ============================================================================
// Plan Types
// ============================================================================

/**
 * Plan type categorization
 */
export type PlanType =
  | "development"      // Development workflow
  | "bugfix"          // Bug fix workflow
  | "refactoring"     // Refactoring workflow
  | "deployment"      // Deployment workflow
  | "testing"         // Testing workflow
  | "migration"       // Migration workflow
  | "exploration"     // Exploration workflow
  | "custom";         // Custom workflow

/**
 * A plan is a collection of goals with execution strategy
 */
export interface Plan {
  /** Unique identifier */
  id: string;
  /** Application ID */
  appId: number;
  /** Plan title */
  title: string;
  /** Detailed description */
  description: string;
  /** Plan type */
  type: PlanType;
  /** Current status */
  status: ExecutionStatus;
  /** Goals in this plan */
  goalIds: string[];
  /** Execution strategy */
  strategy: ExecutionStrategy;
  /** Global constraints */
  constraints: ExecutionConstraint[];
  /** Progress tracking */
  progress: PlanProgress;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated */
  updatedAt: Date;
  /** Started execution */
  startedAt?: Date;
  /** Completed execution */
  completedAt?: Date;
  /** User who created this plan */
  createdBy?: string;
  /** Tags for categorization */
  tags: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Execution strategy for a plan
 */
export interface ExecutionStrategy {
  /** Execution mode */
  mode: "sequential" | "parallel" | "adaptive" | "manual";
  /** Maximum parallel tasks */
  maxParallelTasks: number;
  /** Whether to auto-retry failed tasks */
  autoRetry: boolean;
  /** Whether to auto-rollback on failure */
  autoRollback: boolean;
  /** Timeout for entire plan (minutes) */
  globalTimeout?: number;
  /** Timeout per task (minutes) */
  taskTimeout?: number;
  /** Notification settings */
  notifications: NotificationSettings;
  /** Checkpoint frequency */
  checkpointFrequency: "none" | "per_task" | "per_goal" | "custom";
  /** Custom checkpoint intervals (tasks) */
  customCheckpointInterval?: number;
}

/**
 * Notification settings
 */
export interface NotificationSettings {
  /** Notify on plan start */
  onStart: boolean;
  /** Notify on task completion */
  onTaskComplete: boolean;
  /** Notify on task failure */
  onTaskFailure: boolean;
  /** Notify on goal completion */
  onGoalComplete: boolean;
  /** Notify on plan completion */
  onComplete: boolean;
  /** Notification channels */
  channels: ("ui" | "email" | "webhook")[];
}

/**
 * Plan progress tracking
 */
export interface PlanProgress {
  /** Total goals */
  totalGoals: number;
  /** Completed goals */
  completedGoals: number;
  /** Failed goals */
  failedGoals: number;
  /** Total tasks */
  totalTasks: number;
  /** Completed tasks */
  completedTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Current executing tasks */
  runningTasks: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Estimated time remaining (minutes) */
  estimatedTimeRemaining?: number;
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// Planning Context Types
// ============================================================================

/**
 * Context for planning operations
 */
export interface PlanningContext {
  /** Application ID */
  appId: number;
  /** Application path */
  appPath: string;
  /** Current codebase state */
  codebaseState: CodebaseState;
  /** Available tools */
  availableTools: string[];
  /** User preferences */
  userPreferences: UserPreferences;
  /** Execution history */
  executionHistory: ExecutionHistoryItem[];
  /** Knowledge graph context */
  knowledgeGraphContext?: KnowledgeGraphContext;
  /** Resource constraints */
  resourceConstraints: ResourceConstraints;
}

/**
 * Codebase state snapshot
 */
export interface CodebaseState {
  /** Current branch */
  currentBranch: string;
  /** Last commit hash */
  lastCommitHash: string;
  /** Uncommitted changes */
  uncommittedChanges: boolean;
  /** File count */
  fileCount: number;
  /** Lines of code */
  linesOfCode: number;
  /** Language breakdown */
  languageBreakdown: Record<string, number>;
  /** Known issues */
  knownIssues: string[];
  /** Test status */
  testStatus?: "passing" | "failing" | "unknown";
}

/**
 * User preferences for planning
 */
export interface UserPreferences {
  /** Preferred execution mode */
  preferredMode: "sequential" | "parallel" | "adaptive";
  /** Auto-approve tasks */
  autoApprove: boolean;
  /** Maximum parallel tasks */
  maxParallelTasks: number;
  /** Timeout preferences */
  defaultTimeout: number;
  /** Notification preferences */
  notifications: NotificationSettings;
  /** Rollback preference */
  autoRollback: boolean;
  /** Language/style preferences */
  codeStyle?: Record<string, unknown>;
}

/**
 * Execution history item
 */
export interface ExecutionHistoryItem {
  /** Task ID */
  taskId: string;
  /** Task type */
  taskType: TaskType;
  /** Execution duration */
  duration: number;
  /** Success status */
  success: boolean;
  /** Error if failed */
  error?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Knowledge graph context for planning
 */
export interface KnowledgeGraphContext {
  /** Relevant nodes */
  relevantNodes: string[];
  /** Relevant edges */
  relevantEdges: string[];
  /** Architecture patterns detected */
  detectedPatterns: string[];
  /** Dependencies to consider */
  dependencies: string[];
}

/**
 * Resource constraints
 */
export interface ResourceConstraints {
  /** Maximum memory (MB) */
  maxMemory?: number;
  /** Maximum CPU cores */
  maxCpuCores?: number;
  /** Maximum concurrent processes */
  maxConcurrentProcesses?: number;
  /** Network access allowed */
  networkAccess: boolean;
  /** File system access level */
  fileSystemAccess: "full" | "limited" | "readonly";
  /** Time window constraints */
  timeWindow?: {
    start?: Date;
    end?: Date;
  };
}

// ============================================================================
// Planning Events
// ============================================================================

/**
 * Planning event types
 */
export type PlanningEventType =
  | "plan_created"
  | "plan_started"
  | "plan_paused"
  | "plan_resumed"
  | "plan_completed"
  | "plan_failed"
  | "plan_cancelled"
  | "goal_created"
  | "goal_started"
  | "goal_completed"
  | "goal_failed"
  | "task_created"
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "task_retrying"
  | "checkpoint_created"
  | "rollback_triggered"
  | "user_input_required";

/**
 * Planning event
 */
export interface PlanningEvent {
  /** Event type */
  type: PlanningEventType;
  /** Plan ID */
  planId?: string;
  /** Goal ID */
  goalId?: string;
  /** Task ID */
  taskId?: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data?: Record<string, unknown>;
  /** Event message */
  message: string;
}

// ============================================================================
// Planning Callback Types
// ============================================================================

/**
 * Callbacks for planning operations
 */
export interface PlanningCallbacks {
  /** Called when plan is created */
  onPlanCreated?: (plan: Plan) => void;
  /** Called when plan status changes */
  onPlanStatusChanged?: (plan: Plan, status: ExecutionStatus) => void;
  /** Called when goal is created */
  onGoalCreated?: (goal: Goal) => void;
  /** Called when goal status changes */
  onGoalStatusChanged?: (goal: Goal, status: ExecutionStatus) => void;
  /** Called when task is created */
  onTaskCreated?: (task: Task) => void;
  /** Called when task status changes */
  onTaskStatusChanged?: (task: Task, status: ExecutionStatus) => void;
  /** Called when task progress updates */
  onTaskProgress?: (task: Task, progress: number, message: string) => void;
  /** Called when planning event occurs */
  onEvent?: (event: PlanningEvent) => void;
  /** Called when user input is required */
  onUserInputRequired?: (taskId: string, prompt: string) => Promise<string>;
}

// ============================================================================
// Planning Result Types
// ============================================================================

/**
 * Result of plan generation
 */
export interface PlanGenerationResult {
  /** Generated plan */
  plan: Plan;
  /** Goals in the plan */
  goals: Goal[];
  /** Tasks in the plan */
  tasks: Task[];
  /** Generation confidence (0-1) */
  confidence: number;
  /** Warnings/notes */
  warnings: string[];
  /** Alternative plans considered */
  alternatives?: Plan[];
}

/**
 * Result of plan execution
 */
export interface PlanExecutionResult {
  /** Plan ID */
  planId: string;
  /** Final status */
  status: ExecutionStatus;
  /** Goals completed */
  goalsCompleted: number;
  /** Goals failed */
  goalsFailed: number;
  /** Tasks completed */
  tasksCompleted: number;
  /** Tasks failed */
  tasksFailed: number;
  /** Total execution time (minutes) */
  totalExecutionTime: number;
  /** Errors encountered */
  errors: Array<{ taskId: string; error: string }>;
  /** Outputs produced */
  outputs: TaskOutput[];
  /** Rollback performed */
  rollbackPerformed: boolean;
  /** Completion timestamp */
  completedAt: Date;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  Priority,
  ExecutionStatus,
  GoalType,
  Goal,
  SuccessCriteria,
  ExecutionConstraint,
  TaskType,
  Task,
  TaskInput,
  OutputSchema,
  ValidationRule,
  TaskOutput,
  RollbackAction,
  ExecutionAttempt,
  PlanType,
  Plan,
  ExecutionStrategy,
  NotificationSettings,
  PlanProgress,
  PlanningContext,
  CodebaseState,
  UserPreferences,
  ExecutionHistoryItem,
  KnowledgeGraphContext,
  ResourceConstraints,
  PlanningEventType,
  PlanningEvent,
  PlanningCallbacks,
  PlanGenerationResult,
  PlanExecutionResult,
};
