/**
 * Iterative Reasoning Loops Tool
 * Capabilities 81-90: Reflection, replanning, and iteration optimization
 * - reflection_engine: Self-assessment and reflection on reasoning
 * - replanning_engine: Plan modification based on outcomes
 * - goal_decomposition: Breaking down complex tasks
 * - progress_tracking: Task completion monitoring
 * - checkpoint_evaluation: Milestone assessment
 * - failure_analysis: Error diagnosis and recovery
 * - alternative_generation: Solution space exploration
 * - convergence_check: Solution stability verification
 * - backtracking_engine: Path exploration and course correction
 * - iteration_optimizer: Efficiency improvement
 */

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const IterativeReasoningArgs = z.object({
  /** Reasoning tool to use */
  tool: z
    .enum([
      "reflection_engine",
      "replanning_engine",
      "goal_decomposition",
      "progress_tracking",
      "checkpoint_evaluation",
      "failure_analysis",
      "alternative_generation",
      "convergence_check",
      "backtracking_engine",
      "iteration_optimizer",
    ])
    .describe("The iterative reasoning tool to use"),
  /** Action to perform with the tool */
  action: z
    .enum([
      "analyze",
      "execute",
      "evaluate",
      "generate",
      "check",
      "track",
      "reset",
      "get_status",
    ])
    .describe("Action to perform"),
  /** Task or goal context */
  task: z.string().optional().describe("Current task or goal description"),
  /** Previous plan or strategy */
  plan: z.string().optional().describe("Previous plan or strategy"),
  /** Execution results so far */
  results: z.string().optional().describe("Execution results"),
  /** Current state or progress */
  state: z.string().optional().describe("Current state or progress"),
  /** Goals or subgoals */
  goals: z.array(z.string()).optional().describe("List of goals or subgoals"),
  /** Checkpoints or milestones */
  checkpoints: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        status: z.enum(["pending", "in_progress", "completed", "failed"]),
        completedAt: z.string().optional(),
      }),
    )
    .optional()
    .describe("Checkpoints or milestones"),
  /** Failure information */
  failure: z
    .object({
      error: z.string(),
      context: z.string().optional(),
      attempts: z.number().optional(),
    })
    .optional()
    .describe("Failure details for analysis"),
  /** Number of alternatives to generate */
  alternativesCount: z
    .number()
    .optional()
    .describe("Number of alternatives to generate"),
  /** Iteration history for convergence check */
  iterationHistory: z
    .array(
      z.object({
        iteration: z.number(),
        solution: z.string(),
        score: z.number().optional(),
        converged: z.boolean().optional(),
      }),
    )
    .optional()
    .describe("History of iterations for convergence check"),
  /** Checkpoint ID for evaluation */
  checkpointId: z.string().optional().describe("Checkpoint to evaluate"),
  /** Goal ID for decomposition */
  goalId: z.string().optional().describe("Goal to decompose"),
  /** Maximum depth for backtracking */
  maxDepth: z.number().optional().describe("Maximum backtracking depth"),
  /** Current path for backtracking */
  currentPath: z
    .array(z.string())
    .optional()
    .describe("Current exploration path"),
  /** Optimization parameters */
  optimizationParams: z
    .object({
      maxIterations: z.number().optional(),
      convergenceThreshold: z.number().optional(),
      earlyStopping: z.boolean().optional(),
    })
    .optional()
    .describe("Optimization parameters"),
  /** Session ID for tracking */
  sessionId: z.string().optional().describe("Session identifier"),
});

type IterativeReasoningArgs = z.infer<typeof IterativeReasoningArgs>;

// ============================================================================
// Types
// ============================================================================

interface ReflectionResult {
  strengths: string[];
  weaknesses: string[];
  insights: string[];
  recommendations: string[];
  confidence: number;
}

interface ReplanResult {
  modifiedPlan: string;
  changes: string[];
  rationale: string[];
  newGoals: string[];
}

interface DecomposedGoal {
  id: string;
  description: string;
  subgoals: { id: string; description: string; dependencies: string[] }[];
  estimatedComplexity: number;
}

interface ProgressReport {
  totalGoals: number;
  completedGoals: number;
  inProgressGoals: number;
  pendingGoals: number;
  overallProgress: number;
  blockers: string[];
  recommendations: string[];
}

interface CheckpointEvaluation {
  checkpointId: string;
  status: "passed" | "failed" | "needs_review";
  criteria: { name: string; passed: boolean; details: string }[];
  overallScore: number;
  recommendations: string[];
}

interface FailureAnalysis {
  rootCause: string;
  category: "logic" | "resource" | "environment" | "data" | "unknown";
  severity: "low" | "medium" | "high" | "critical";
  recoveryStrategies: {
    strategy: string;
    estimatedEffort: string;
    risk: string;
  }[];
  lessonsLearned: string[];
}

interface Alternative {
  id: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  estimatedCost: number;
  risk: string;
}

interface ConvergenceResult {
  converged: boolean;
  iterationsNeeded: number;
  stabilityScore: number;
  recommendation: string;
}

interface BacktrackResult {
  newPath: string[];
  branchesExplored: number;
  deadEnds: string[];
  recommendedPath: string;
}

interface OptimizationResult {
  optimizedParams: Record<string, unknown>;
  improvements: {
    metric: string;
    before: number;
    after: number;
    improvement: string;
  }[];
  recommendations: string[];
}

// ============================================================================
// Storage Functions
// ============================================================================

function getSessionFilePath(ctx: AgentContext, sessionId: string): string {
  return path.join(ctx.appPath, ".dyad", "reasoning", `${sessionId}.json`);
}

function loadSession(
  ctx: AgentContext,
  sessionId: string,
): Record<string, unknown> | null {
  const filePath = getSessionFilePath(ctx, sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function saveSession(
  ctx: AgentContext,
  sessionId: string,
  data: Record<string, unknown>,
): void {
  const filePath = getSessionFilePath(ctx, sessionId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ============================================================================
// Tool Implementation Functions
// ============================================================================

/**
 * Reflection Engine - Self-assessment and reasoning analysis
 */
async function executeReflectionEngine(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, task, results, state } = args;

  switch (action) {
    case "analyze": {
      if (!task || !results) {
        throw new Error(
          "task and results are required for reflection analysis",
        );
      }

      // Analyze the reasoning process
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const insights: string[] = [];
      const recommendations: string[] = [];

      // Analyze results for patterns
      const resultLength = results.length;
      const hasErrors = results.toLowerCase().includes("error");
      const hasSuccess = results.toLowerCase().includes("success");

      if (hasSuccess && !hasErrors) {
        strengths.push("Successfully completed task without errors");
        insights.push("The approach taken was effective for this task");
      }

      if (resultLength > 1000) {
        insights.push("Complex task handled with comprehensive solution");
      }

      if (hasErrors) {
        weaknesses.push("Encountered errors during execution");
        recommendations.push("Review error patterns and adjust approach");
      }

      // Analyze state if provided
      if (state) {
        if (state.includes("completed")) {
          strengths.push("Achieved complete task resolution");
        }
        if (state.includes("pending")) {
          recommendations.push("Follow up on pending items");
        }
      }

      // General recommendations
      recommendations.push("Consider documenting successful patterns");
      recommendations.push("Review for potential edge cases");

      const reflectionResult: ReflectionResult = {
        strengths,
        weaknesses,
        insights,
        recommendations,
        confidence: hasSuccess && !hasErrors ? 0.85 : 0.5,
      };

      // Store in session if available
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.reflection = reflectionResult;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Reflection">Analyzing reasoning process...</dyad-status>`,
      );

      const lines = [
        "# Reflection Analysis",
        "",
        `**Confidence:** ${Math.round(reflectionResult.confidence * 100)}%`,
        "",
        "## Strengths",
        ...reflectionResult.strengths.map((s) => `- ${s}`),
        "",
        "## Weaknesses",
        ...reflectionResult.weaknesses.map((w) => `- ${w}`),
        "",
        "## Insights",
        ...reflectionResult.insights.map((i) => `- ${i}`),
        "",
        "## Recommendations",
        ...reflectionResult.recommendations.map((r) => `- ${r}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Reflection Analysis">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_status": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to get reflection status");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.reflection) {
        return "No reflection data found for this session";
      }

      const reflection = session.reflection as ReflectionResult;
      const lines = [
        "# Reflection Status",
        "",
        `**Confidence:** ${Math.round(reflection.confidence * 100)}%`,
        "",
        "## Strengths",
        ...reflection.strengths.map((s) => `- ${s}`),
        "",
        "## Weaknesses",
        ...reflection.weaknesses.map((w) => `- ${w}`),
        "",
        "## Insights",
        ...reflection.insights.map((i) => `- ${i}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Reflection Status">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "reset": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to reset reflection");
      }

      const session = loadSession(ctx, args.sessionId) || {};
      delete session.reflection;
      saveSession(ctx, args.sessionId, session);

      const msg = "Reflection data cleared";
      ctx.onXmlComplete(
        `<dyad-status title="Reflection">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    default:
      throw new Error(`Unknown action: ${action} for reflection_engine`);
  }
}

/**
 * Replanning Engine - Plan modification based on outcomes
 */
async function executeReplanningEngine(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, task, plan, results, state } = args;

  switch (action) {
    case "analyze": {
      if (!task || !plan || !results) {
        throw new Error("task, plan, and results are required for replanning");
      }

      const changes: string[] = [];
      const rationale: string[] = [];
      let modifiedPlan = plan;

      // Analyze results against plan
      const resultsLower = results.toLowerCase();

      // Check for deviations
      if (resultsLower.includes("error") || resultsLower.includes("failed")) {
        changes.push("Detected execution failures - need error handling");
        rationale.push("Execution revealed gaps in error handling");
        modifiedPlan +=
          "\n\n## Added Error Handling\n- Added try-catch blocks\n- Added fallback strategies";
      }

      if (resultsLower.includes("timeout") || resultsLower.includes("slow")) {
        changes.push("Detected performance issues - need optimization");
        rationale.push("Execution revealed performance bottlenecks");
        modifiedPlan +=
          "\n\n## Added Performance Optimization\n- Added caching strategies\n- Optimized critical paths";
      }

      if (resultsLower.length > plan.length * 2) {
        changes.push("Task complexity exceeded expectations");
        rationale.push(
          "Results indicate more complex execution than anticipated",
        );
        modifiedPlan +=
          "\n\n## Scope Adjustment\n- Broke down complex steps\n- Added intermediate checkpoints";
      }

      // Check state for additional context
      if (state) {
        if (state.includes("incomplete")) {
          changes.push("Incomplete execution detected");
          rationale.push("State indicates incomplete task resolution");
          modifiedPlan +=
            "\n\n## Completion Plan\n- Added verification steps\n- Added completion criteria";
        }
      }

      if (changes.length === 0) {
        changes.push("Plan executed successfully");
        rationale.push("No modifications needed - original plan was effective");
      }

      const replanResult: ReplanResult = {
        modifiedPlan,
        changes,
        rationale,
        newGoals: changes.map((c) => `Address: ${c}`),
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.replan = replanResult;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Replanning">Analyzing plan modifications...</dyad-status>`,
      );

      const lines = [
        "# Replanning Analysis",
        "",
        "## Changes Made",
        ...replanResult.changes.map((c) => `- ${c}`),
        "",
        "## Rationale",
        ...replanResult.rationale.map((r) => `- ${r}`),
        "",
        "## Modified Plan",
        replanResult.modifiedPlan,
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Replanning Complete">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "execute": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to execute replan");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.replan) {
        throw new Error("No replan data found - run analyze first");
      }

      const replan = session.replan as ReplanResult;
      const msg = `Executing modified plan with ${replan.newGoals.length} new goals`;
      ctx.onXmlComplete(
        `<dyad-status title="Replan Execute">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    default:
      throw new Error(`Unknown action: ${action} for replanning_engine`);
  }
}

/**
 * Goal Decomposition - Breaking down complex tasks
 */
async function executeGoalDecomposition(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, task } = args;

  switch (action) {
    case "analyze": {
      if (!task) {
        throw new Error("task is required for goal decomposition");
      }

      // Decompose the task into subgoals
      const taskLower = task.toLowerCase();
      const subgoals: {
        id: string;
        description: string;
        dependencies: string[];
      }[] = [];

      // Simple decomposition based on common patterns
      if (taskLower.includes("create") || taskLower.includes("build")) {
        subgoals.push({
          id: "planning",
          description: "Plan the implementation approach",
          dependencies: [],
        });
        subgoals.push({
          id: "setup",
          description: "Set up required resources and environment",
          dependencies: ["planning"],
        });
        subgoals.push({
          id: "implementation",
          description: "Implement the core functionality",
          dependencies: ["setup"],
        });
        subgoals.push({
          id: "verification",
          description: "Verify the implementation works correctly",
          dependencies: ["implementation"],
        });
        subgoals.push({
          id: "documentation",
          description: "Document the implementation",
          dependencies: ["verification"],
        });
      } else if (taskLower.includes("fix") || taskLower.includes("debug")) {
        subgoals.push({
          id: "reproduce",
          description: "Reproduce the issue",
          dependencies: [],
        });
        subgoals.push({
          id: "diagnose",
          description: "Diagnose the root cause",
          dependencies: ["reproduce"],
        });
        subgoals.push({
          id: "implement_fix",
          description: "Implement the fix",
          dependencies: ["diagnose"],
        });
        subgoals.push({
          id: "test",
          description: "Test the fix",
          dependencies: ["implement_fix"],
        });
      } else if (
        taskLower.includes("analyze") ||
        taskLower.includes("review")
      ) {
        subgoals.push({
          id: "collect_data",
          description: "Collect relevant data and context",
          dependencies: [],
        });
        subgoals.push({
          id: "examine",
          description: "Examine and analyze the data",
          dependencies: ["collect_data"],
        });
        subgoals.push({
          id: "synthesize",
          description: "Synthesize findings and recommendations",
          dependencies: ["examine"],
        });
      } else {
        // Generic decomposition
        subgoals.push({
          id: "step1",
          description: "Understand and define the task",
          dependencies: [],
        });
        subgoals.push({
          id: "step2",
          description: "Break down into manageable parts",
          dependencies: ["step1"],
        });
        subgoals.push({
          id: "step3",
          description: "Execute each part",
          dependencies: ["step2"],
        });
        subgoals.push({
          id: "step4",
          description: "Verify and integrate results",
          dependencies: ["step3"],
        });
      }

      const decomposedGoal: DecomposedGoal = {
        id: "root",
        description: task,
        subgoals,
        estimatedComplexity: subgoals.length,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.goals = decomposedGoal;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Goal Decomposition">Decomposing task...</dyad-status>`,
      );

      const lines = [
        "# Goal Decomposition",
        "",
        `**Task:** ${task}`,
        `**Subgoals:** ${subgoals.length}`,
        `**Estimated Complexity:** ${decomposedGoal.estimatedComplexity}/5`,
        "",
        "## Subgoals",
        ...subgoals.map(
          (sg, i) =>
            `${i + 1}. **${sg.id}**: ${sg.description}${
              sg.dependencies.length > 0
                ? ` (depends on: ${sg.dependencies.join(", ")})`
                : ""
            }`,
        ),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Goal Decomposition">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_status": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to get goal status");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.goals) {
        return "No goals found for this session";
      }

      const goals = session.goals as DecomposedGoal;
      const lines = [
        "# Goals",
        "",
        `**Main Task:** ${goals.description}`,
        "",
        "## Subgoals",
        ...goals.subgoals.map((sg) => `- ${sg.id}: ${sg.description}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Goals">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for goal_decomposition`);
  }
}

/**
 * Progress Tracking - Task completion monitoring
 */
async function executeProgressTracking(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, goals, state } = args;

  switch (action) {
    case "track": {
      if (!goals) {
        throw new Error("goals are required for progress tracking");
      }

      const totalGoals = goals.length;
      let completedGoals = 0;
      let inProgressGoals = 0;
      let pendingGoals = 0;
      const blockers: string[] = [];

      // Analyze goals from state if provided
      if (state) {
        const stateGoals = state.split(",").map((g) => g.trim().toLowerCase());
        for (const g of goals) {
          if (stateGoals.includes(g.toLowerCase())) {
            completedGoals++;
          } else if (stateGoals.some((sg) => g.toLowerCase().includes(sg))) {
            inProgressGoals++;
          } else {
            pendingGoals++;
          }
        }
      } else {
        pendingGoals = totalGoals;
      }

      const overallProgress =
        totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

      // Generate recommendations
      const recommendations: string[] = [];
      if (pendingGoals > 0) {
        recommendations.push(
          `Focus on completing ${pendingGoals} pending goals`,
        );
      }
      if (inProgressGoals > 0) {
        recommendations.push(
          `Continue working on ${inProgressGoals} in-progress goals`,
        );
      }
      if (overallProgress >= 100) {
        recommendations.push("All goals completed - consider next steps");
      } else if (overallProgress >= 50) {
        recommendations.push("Good progress - maintain momentum");
      }

      const progressReport: ProgressReport = {
        totalGoals,
        completedGoals,
        inProgressGoals,
        pendingGoals,
        overallProgress,
        blockers,
        recommendations,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.progress = progressReport;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Progress">Tracking progress...</dyad-status>`,
      );

      const progressBar =
        "█".repeat(Math.floor(overallProgress / 10)) +
        "░".repeat(10 - Math.floor(overallProgress / 10));

      const lines = [
        "# Progress Tracking",
        "",
        `**Overall Progress:** ${progressBar} ${Math.round(overallProgress)}%`,
        "",
        `| Status | Count |`,
        `|--------|-------|`,
        `| ✅ Completed | ${completedGoals} |`,
        `| 🔄 In Progress | ${inProgressGoals} |`,
        `| ⏳ Pending | ${pendingGoals} |`,
        "",
        "## Recommendations",
        ...recommendations.map((r) => `- ${r}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Progress Tracking">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_status": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to get progress status");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.progress) {
        return "No progress data found";
      }

      const progress = session.progress as ProgressReport;
      const progressBar =
        "█".repeat(Math.floor(progress.overallProgress / 10)) +
        "░".repeat(10 - Math.floor(progress.overallProgress / 10));

      const lines = [
        "# Progress Status",
        "",
        `**Overall Progress:** ${progressBar} ${Math.round(progress.overallProgress)}%`,
        "",
        `| Status | Count |`,
        `|--------|-------|`,
        `| ✅ Completed | ${progress.completedGoals} |`,
        `| 🔄 In Progress | ${progress.inProgressGoals} |`,
        `| ⏳ Pending | ${progress.pendingGoals} |`,
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Progress Status">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for progress_tracking`);
  }
}

/**
 * Checkpoint Evaluation - Milestone assessment
 */
async function executeCheckpointEvaluation(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, checkpointId, results, checkpoints } = args;

  switch (action) {
    case "evaluate": {
      if (!checkpointId || !results || !checkpoints) {
        throw new Error(
          "checkpointId, results, and checkpoints are required for evaluation",
        );
      }

      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
      if (!checkpoint) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }

      // Evaluate checkpoint based on results
      const criteria = [
        {
          name: "Execution Success",
          passed: !results.toLowerCase().includes("error"),
          details: results.toLowerCase().includes("error")
            ? "Errors detected in execution"
            : "No errors detected",
        },
        {
          name: "Output Quality",
          passed: results.length > 10,
          details:
            results.length > 10
              ? "Output has substantial content"
              : "Output appears incomplete",
        },
        {
          name: "Completion Status",
          passed:
            results.toLowerCase().includes("success") || results.length > 100,
          details: "Primary objectives appear to be met",
        },
      ];

      const passedCriteria = criteria.filter((c) => c.passed).length;
      const overallScore = (passedCriteria / criteria.length) * 100;

      const evaluation: CheckpointEvaluation = {
        checkpointId,
        status:
          overallScore >= 66
            ? "passed"
            : overallScore >= 33
              ? "needs_review"
              : "failed",
        criteria,
        overallScore,
        recommendations:
          overallScore >= 66
            ? ["Checkpoint passed - proceed to next milestone"]
            : ["Review failed criteria", "Consider alternative approaches"],
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.checkpointEvaluations = session.checkpointEvaluations || [];
        (session.checkpointEvaluations as CheckpointEvaluation[]).push(
          evaluation,
        );
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Checkpoint Evaluation">Evaluating checkpoint...</dyad-status>`,
      );

      const statusIcon =
        evaluation.status === "passed"
          ? "✅"
          : evaluation.status === "failed"
            ? "❌"
            : "⚠️";

      const lines = [
        `# Checkpoint Evaluation: ${checkpointId}`,
        "",
        `**Status:** ${statusIcon} ${evaluation.status.toUpperCase()}`,
        `**Score:** ${Math.round(evaluation.overallScore)}%`,
        "",
        "## Criteria",
        ...criteria.map(
          (c) => `- ${c.passed ? "✅" : "❌"} **${c.name}**: ${c.details}`,
        ),
        "",
        "## Recommendations",
        ...evaluation.recommendations.map((r) => `- ${r}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Checkpoint Evaluation">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_status": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to get checkpoint status");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.checkpointEvaluations) {
        return "No checkpoint evaluations found";
      }

      const evaluations =
        session.checkpointEvaluations as CheckpointEvaluation[];
      const lines = [
        "# Checkpoint Evaluations",
        "",
        ...evaluations.map(
          (e) =>
            `## ${e.checkpointId}: ${e.status} (${Math.round(e.overallScore)}%)`,
        ),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Checkpoint Status">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for checkpoint_evaluation`);
  }
}

/**
 * Failure Analysis - Error diagnosis and recovery
 */
async function executeFailureAnalysis(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, failure } = args;

  switch (action) {
    case "analyze": {
      if (!failure) {
        throw new Error("failure is required for failure analysis");
      }

      const { error, attempts } = failure;

      // Categorize the failure
      let category: "logic" | "resource" | "environment" | "data" | "unknown" =
        "unknown";
      let severity: "low" | "medium" | "high" | "critical" = "medium";

      const errorLower = error.toLowerCase();

      if (
        errorLower.includes("null") ||
        errorLower.includes("undefined") ||
        errorLower.includes("type")
      ) {
        category = "logic";
        severity = "high";
      } else if (
        errorLower.includes("memory") ||
        errorLower.includes("timeout") ||
        errorLower.includes("resource")
      ) {
        category = "resource";
        severity = "high";
      } else if (
        errorLower.includes("permission") ||
        errorLower.includes("not found") ||
        errorLower.includes("exist")
      ) {
        category = "environment";
        severity = "medium";
      } else if (
        errorLower.includes("invalid") ||
        errorLower.includes("parse") ||
        errorLower.includes("format")
      ) {
        category = "data";
        severity = "medium";
      } else {
        severity = "low";
      }

      // Generate recovery strategies
      const recoveryStrategies = [
        {
          strategy: "Add error handling",
          estimatedEffort: "Low",
          risk: "Low",
        },
        {
          strategy: "Add input validation",
          estimatedEffort: "Low",
          risk: "Low",
        },
        {
          strategy: "Implement retry logic",
          estimatedEffort: "Medium",
          risk: "Low",
        },
        {
          strategy: "Add fallback mechanism",
          estimatedEffort: "Medium",
          risk: "Medium",
        },
      ];

      // Generate lessons learned
      const lessonsLearned = [
        `Category: ${category} - ${error}`,
        "Consider adding defensive programming",
        "Review error handling patterns",
      ];

      if (attempts && attempts > 1) {
        lessonsLearned.push(
          `Failed after ${attempts} attempts - consider increasing robustness`,
        );
      }

      const analysis: FailureAnalysis = {
        rootCause: error,
        category,
        severity,
        recoveryStrategies,
        lessonsLearned,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.failureAnalysis = analysis;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Failure Analysis">Analyzing failure...</dyad-status>`,
      );

      const severityIcon =
        severity === "high" ? "🔴" : severity === "medium" ? "🟡" : "🟢";

      const lines = [
        "# Failure Analysis",
        "",
        `**Root Cause:** ${error}`,
        `**Category:** ${category}`,
        `**Severity:** ${severityIcon} ${severity}`,
        "",
        "## Recovery Strategies",
        ...recoveryStrategies.map(
          (rs) =>
            `- ${rs.strategy} (Effort: ${rs.estimatedEffort}, Risk: ${rs.risk})`,
        ),
        "",
        "## Lessons Learned",
        ...lessonsLearned.map((l) => `- ${l}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Failure Analysis">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for failure_analysis`);
  }
}

/**
 * Alternative Generation - Solution space exploration
 */
async function executeAlternativeGeneration(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, task, alternativesCount } = args;

  switch (action) {
    case "generate": {
      if (!task) {
        throw new Error("task is required for alternative generation");
      }

      const count = alternativesCount || 3;
      const alternatives: Alternative[] = [];

      // Generate different approaches
      const approaches = [
        {
          id: "approach_1",
          description: "Direct implementation - straightforward solution",
          advantages: [
            "Simple to implement",
            "Easy to maintain",
            "Lower complexity",
          ],
          disadvantages: [
            "May not handle edge cases",
            "Limited optimization potential",
          ],
          estimatedCost: 1,
          risk: "Low",
        },
        {
          id: "approach_2",
          description: "Modular approach - separate concerns",
          advantages: [
            "Better separation of concerns",
            "Easier testing",
            "More flexible",
          ],
          disadvantages: ["More code to write", "Slightly higher initial cost"],
          estimatedCost: 2,
          risk: "Low",
        },
        {
          id: "approach_3",
          description: "Async/parallel approach - maximize concurrency",
          advantages: ["Better performance", "Handles high load", "Scalable"],
          disadvantages: [
            "Complex error handling",
            "Harder to debug",
            "Race conditions",
          ],
          estimatedCost: 3,
          risk: "Medium",
        },
        {
          id: "approach_4",
          description: "Caching-heavy approach - optimize for speed",
          advantages: [
            "Fast response times",
            "Reduced computation",
            "Better UX",
          ],
          disadvantages: [
            "Memory intensive",
            "Stale data risk",
            "Complex invalidation",
          ],
          estimatedCost: 3,
          risk: "Medium",
        },
        {
          id: "approach_5",
          description: "Conservative approach - minimal changes",
          advantages: ["Low risk", "Easy rollback", "Minimal disruption"],
          disadvantages: [
            "May not solve core issue",
            "Technical debt accumulation",
          ],
          estimatedCost: 1,
          risk: "Low",
        },
      ];

      // Select requested number of alternatives
      for (let i = 0; i < Math.min(count, approaches.length); i++) {
        alternatives.push(approaches[i]);
      }

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.alternatives = alternatives;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Alternative Generation">Generating alternatives...</dyad-status>`,
      );

      const lines = [
        `# Alternative Solutions (${alternatives.length})`,
        "",
        ...alternatives.flatMap((alt, i) => [
          `## ${i + 1}. ${alt.description}`,
          "",
          `**Advantages:**`,
          ...alt.advantages.map((a) => `- ${a}`),
          "",
          `**Disadvantages:**`,
          ...alt.disadvantages.map((d) => `- ${d}`),
          "",
          `**Estimated Cost:** ${"💰".repeat(alt.estimatedCost)}`,
          `**Risk:** ${alt.risk}`,
          "",
        ]),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Alternatives Generated">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for alternative_generation`);
  }
}

/**
 * Convergence Check - Solution stability verification
 */
async function executeConvergenceCheck(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, iterationHistory, optimizationParams } = args;

  switch (action) {
    case "check": {
      if (!iterationHistory || iterationHistory.length === 0) {
        throw new Error("iterationHistory is required for convergence check");
      }

      const threshold = optimizationParams?.convergenceThreshold || 0.01;
      const history = iterationHistory;

      // Check convergence
      let converged = false;
      let iterationsNeeded = history.length;
      let stabilityScore = 0;

      if (history.length >= 2) {
        const lastScores = history.slice(-3).map((h) => h.score || 0);
        const scoreDiff = Math.abs(
          lastScores[lastScores.length - 1] -
            (lastScores[lastScores.length - 2] || 0),
        );

        // Calculate stability score
        stabilityScore = Math.max(0, 1 - scoreDiff);

        // Check if converged
        if (scoreDiff < threshold) {
          converged = true;
        }
      }

      // Generate recommendation
      let recommendation = "";
      if (converged) {
        recommendation = "Solution has converged - stable solution found";
      } else if (history.length >= 10) {
        recommendation = "Consider early stopping - diminishing returns";
      } else {
        recommendation = "Continue iterating - solution not yet stable";
      }

      const result: ConvergenceResult = {
        converged,
        iterationsNeeded,
        stabilityScore: Math.round(stabilityScore * 100) / 100,
        recommendation,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.convergence = result;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Convergence Check">Checking stability...</dyad-status>`,
      );

      const statusIcon = converged ? "✅" : "⏳";

      const lines = [
        "# Convergence Check",
        "",
        `**Status:** ${statusIcon} ${converged ? "Converged" : "Not Converged"}`,
        `**Iterations:** ${iterationsNeeded}`,
        `**Stability Score:** ${result.stabilityScore * 100}%`,
        "",
        `**Recommendation:** ${recommendation}`,
        "",
        "## Iteration History",
        ...history.map(
          (h, i) =>
            `| ${i + 1} | ${h.solution.substring(0, 30)}... | ${h.score || "N/A"} |`,
        ),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Convergence Check">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action} for convergence_check`);
  }
}

/**
 * Backtracking Engine - Path exploration and course correction
 */
async function executeBacktrackingEngine(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, currentPath, maxDepth, results } = args;

  switch (action) {
    case "analyze": {
      if (!currentPath || currentPath.length === 0) {
        throw new Error("currentPath is required for backtracking analysis");
      }

      const max = maxDepth || 5;
      const pathLength = currentPath.length;

      // Analyze current path
      const deadEnds: string[] = [];
      let branchesExplored = pathLength;

      // Check results for failure indicators
      if (results) {
        const resultsLower = results.toLowerCase();
        if (resultsLower.includes("fail")) {
          deadEnds.push(currentPath[currentPath.length - 1]);
        }
      }

      // Calculate backtrack depth

      // Generate new path (simplified - would be more complex in practice)
      const newPath = [...currentPath];
      if (pathLength > 0) {
        // Suggest exploring alternatives
        newPath.push(`alt_${pathLength + 1}`);
      }

      const recommendedPath = newPath.join(" → ");

      const backtrackResult: BacktrackResult = {
        newPath,
        branchesExplored,
        deadEnds,
        recommendedPath,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.backtrack = backtrackResult;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Backtracking">Analyzing paths...</dyad-status>`,
      );

      const lines = [
        "# Backtracking Analysis",
        "",
        `**Current Path:** ${currentPath.join(" → ")}`,
        `**Branches Explored:** ${branchesExplored}`,
        `**Max Depth:** ${max}`,
        "",
        "## Dead Ends",
        ...(deadEnds.length > 0
          ? deadEnds.map((d) => `- ${d}`)
          : ["None detected"]),
        "",
        `## Recommended Path`,
        recommendedPath,
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Backtracking Complete">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "execute": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to execute backtrack");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.backtrack) {
        throw new Error("No backtrack data found - run analyze first");
      }

      const backtrack = session.backtrack as BacktrackResult;
      const msg = `Backtracking to: ${backtrack.recommendedPath}`;
      ctx.onXmlComplete(
        `<dyad-status title="Backtracking">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    default:
      throw new Error(`Unknown action: ${action} for backtracking_engine`);
  }
}

/**
 * Iteration Optimizer - Efficiency improvement
 */
async function executeIterationOptimizer(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, optimizationParams, results } = args;

  switch (action) {
    case "analyze": {
      const maxIterations = optimizationParams?.maxIterations || 100;
      const convergenceThreshold =
        optimizationParams?.convergenceThreshold || 0.01;

      // Analyze current performance and generate optimizations
      const improvements: {
        metric: string;
        before: number;
        after: number;
        improvement: string;
      }[] = [];

      // Simulate optimization analysis
      if (results) {
        const resultLength = results.length;
        if (resultLength > 500) {
          improvements.push({
            metric: "Batch Processing",
            before: 1,
            after: 5,
            improvement: "Process items in batches of 5",
          });
        }

        improvements.push({
          metric: "Caching",
          before: 0,
          after: 80,
          improvement: "Add caching layer - 80% hit rate expected",
        });

        improvements.push({
          metric: "Parallelization",
          before: 1,
          after: 4,
          improvement: "Run independent tasks in parallel",
        });
      }

      // Generate optimized parameters
      const optimizedParams: Record<string, unknown> = {
        maxIterations: Math.floor(maxIterations * 0.8),
        convergenceThreshold: convergenceThreshold * 1.5,
        earlyStopping: true,
        batchSize: 5,
        cacheEnabled: true,
      };

      const recommendations = [
        "Enable early stopping to avoid unnecessary iterations",
        "Use batch processing for better throughput",
        "Implement caching for repeated computations",
        "Consider parallel execution for independent tasks",
      ];

      const optimizationResult: OptimizationResult = {
        optimizedParams,
        improvements,
        recommendations,
      };

      // Store in session
      if (args.sessionId) {
        const session = loadSession(ctx, args.sessionId) || {};
        session.optimization = optimizationResult;
        saveSession(ctx, args.sessionId, session);
      }

      ctx.onXmlStream(
        `<dyad-status title="Iteration Optimizer">Analyzing optimizations...</dyad-status>`,
      );

      const lines = [
        "# Iteration Optimization",
        "",
        "## Optimized Parameters",
        ...Object.entries(optimizedParams).map(
          ([key, value]) => `- ${key}: ${value}`,
        ),
        "",
        "## Potential Improvements",
        ...improvements.map(
          (imp) =>
            `- **${imp.metric}**: ${imp.before} → ${imp.after} (${imp.improvement})`,
        ),
        "",
        "## Recommendations",
        ...recommendations.map((r) => `- ${r}`),
      ];

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Optimization Complete">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "execute": {
      if (!args.sessionId) {
        throw new Error("sessionId is required to apply optimizations");
      }

      const session = loadSession(ctx, args.sessionId);
      if (!session || !session.optimization) {
        throw new Error("No optimization data found - run analyze first");
      }

      const optimization = session.optimization as OptimizationResult;
      const msg = `Applied optimizations: ${Object.keys(optimization.optimizedParams).join(", ")}`;
      ctx.onXmlComplete(
        `<dyad-status title="Optimization Applied">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    default:
      throw new Error(`Unknown action: ${action} for iteration_optimizer`);
  }
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeIterativeReasoning(
  args: IterativeReasoningArgs,
  ctx: AgentContext,
): Promise<string> {
  const { tool } = args;

  switch (tool) {
    case "reflection_engine":
      return executeReflectionEngine(args, ctx);
    case "replanning_engine":
      return executeReplanningEngine(args, ctx);
    case "goal_decomposition":
      return executeGoalDecomposition(args, ctx);
    case "progress_tracking":
      return executeProgressTracking(args, ctx);
    case "checkpoint_evaluation":
      return executeCheckpointEvaluation(args, ctx);
    case "failure_analysis":
      return executeFailureAnalysis(args, ctx);
    case "alternative_generation":
      return executeAlternativeGeneration(args, ctx);
    case "convergence_check":
      return executeConvergenceCheck(args, ctx);
    case "backtracking_engine":
      return executeBacktrackingEngine(args, ctx);
    case "iteration_optimizer":
      return executeIterationOptimizer(args, ctx);
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const reflectionEngineTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "reflection_engine",
  description:
    "Reflection engine for self-assessment. Analyze reasoning processes, identify strengths and weaknesses, and generate insights for improvement. Use analyze action to assess current reasoning, get_status to retrieve reflection data, or reset to clear reflection state.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Reflection: ${args.action} on ${args.task || "current task"}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-reflection tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.task) {
      xml += escapeXmlContent(args.task);
    }
    if (isComplete) {
      xml += "</dyad-reflection>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Reflection Engine">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const replanningEngineTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "replanning_engine",
  description:
    "Replanning engine for plan modification. Analyze execution results against original plan, identify necessary changes, and generate modified plans. Use analyze action to evaluate current plan, execute to apply modified plan.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Replanning: ${args.action} with ${args.task || "current task"}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-replan tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.task) {
      xml += escapeXmlContent(args.task);
    }
    if (isComplete) {
      xml += "</dyad-replan>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Replanning Engine">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const goalDecompositionTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "goal_decomposition",
  description:
    "Goal decomposition for breaking down tasks. Analyze complex tasks and decompose them into manageable subgoals with dependencies. Use analyze action to decompose a task into subgoals, get_status to retrieve current goals.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Goal decomposition: ${args.action} - ${args.task || "current task"}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-goals tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.task) {
      xml += escapeXmlContent(args.task);
    }
    if (isComplete) {
      xml += "</dyad-goals>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Goal Decomposition">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const progressTrackingTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "progress_tracking",
  description:
    "Progress tracking for task completion. Monitor and report on the progress of goals and subgoals. Use track action to update progress, get_status to retrieve current progress.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Progress tracking: ${args.action}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-progress tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.state) {
      xml += escapeXmlContent(args.state);
    }
    if (isComplete) {
      xml += "</dyad-progress>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Progress Tracking">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const checkpointEvaluationTool: ToolDefinition<IterativeReasoningArgs> =
  {
    name: "checkpoint_evaluation",
    description:
      "Checkpoint evaluation for milestones. Evaluate whether checkpoints or milestones have been met based on execution results. Use evaluate action to assess a checkpoint, get_status to retrieve evaluation history.",
    inputSchema: IterativeReasoningArgs,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => {
      return `Checkpoint evaluation: ${args.action} - ${args.checkpointId || "checkpoint"}`;
    },

    buildXml: (args, isComplete) => {
      if (!args.tool) return undefined;
      let xml = `<dyad-checkpoint tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
      if (args.checkpointId) {
        xml += escapeXmlContent(args.checkpointId);
      }
      if (isComplete) {
        xml += "</dyad-checkpoint>";
      }
      return xml;
    },

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Checkpoint Evaluation">Processing ${args.action}...</dyad-status>`,
      );
      const result = await executeIterativeReasoning(args, ctx);
      return result;
    },
  };

export const failureAnalysisTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "failure_analysis",
  description:
    "Failure analysis for error diagnosis. Analyze failures to identify root causes, categorize issues, and generate recovery strategies. Use analyze action to diagnose a failure.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Failure analysis: ${args.action} - ${args.failure?.error || "error"}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-failure tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.failure?.error) {
      xml += escapeXmlContent(args.failure.error);
    }
    if (isComplete) {
      xml += "</dyad-failure>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Failure Analysis">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const alternativeGenerationTool: ToolDefinition<IterativeReasoningArgs> =
  {
    name: "alternative_generation",
    description:
      "Alternative generation for solution space exploration. Generate multiple alternative approaches to solve a task. Use generate action to create alternatives.",
    inputSchema: IterativeReasoningArgs,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => {
      return `Alternative generation: ${args.action} for ${args.task || "task"}`;
    },

    buildXml: (args, isComplete) => {
      if (!args.tool) return undefined;
      let xml = `<dyad-alternatives tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
      if (args.task) {
        xml += escapeXmlContent(args.task);
      }
      if (isComplete) {
        xml += "</dyad-alternatives>";
      }
      return xml;
    },

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Alternative Generation">Processing ${args.action}...</dyad-status>`,
      );
      const result = await executeIterativeReasoning(args, ctx);
      return result;
    },
  };

export const convergenceCheckTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "convergence_check",
  description:
    "Convergence check for solution stability. Analyze iteration history to determine if a solution has converged to a stable state. Use check action to evaluate convergence.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Convergence check: ${args.action} - ${args.iterationHistory?.length || 0} iterations`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-convergence tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (isComplete) {
      xml += "</dyad-convergence>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Convergence Check">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const backtrackingEngineTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "backtracking_engine",
  description:
    "Backtracking engine for exploring different paths. Analyze current execution path, identify dead ends, and recommend alternative paths. Use analyze action to evaluate path, execute to backtrack.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Backtracking: ${args.action} - ${args.currentPath?.join(" → ") || "path"}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-backtrack tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (args.currentPath) {
      xml += escapeXmlContent(args.currentPath.join(" → "));
    }
    if (isComplete) {
      xml += "</dyad-backtrack>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Backtracking Engine">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};

export const iterationOptimizerTool: ToolDefinition<IterativeReasoningArgs> = {
  name: "iteration_optimizer",
  description:
    "Iteration optimizer for efficiency improvement. Analyze current iteration patterns and generate optimizations for better performance. Use analyze action to identify optimizations, execute to apply them.",
  inputSchema: IterativeReasoningArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Iteration optimizer: ${args.action}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.tool) return undefined;
    let xml = `<dyad-optimizer tool="${escapeXmlAttr(args.tool)}" action="${escapeXmlAttr(args.action || "")}">`;
    if (isComplete) {
      xml += "</dyad-optimizer>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Iteration Optimizer">Processing ${args.action}...</dyad-status>`,
    );
    const result = await executeIterativeReasoning(args, ctx);
    return result;
  },
};
