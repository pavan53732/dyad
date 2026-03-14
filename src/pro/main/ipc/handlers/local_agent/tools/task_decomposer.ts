/**
 * Task Decomposer Tool
 * Capabilities 11-20: Breaks complex tasks into executable subtasks
 * - Task decomposition into subtasks
 * - Task dependency graph creation
 * - Milestone checkpoint generation
 * - Plan completeness validation
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const TaskDecomposerArgs = z.object({
  /** The main task description to decompose */
  task: z.string().min(1),
  /** Optional context about the project */
  projectContext: z.string().optional(),
  /** Maximum number of subtasks to generate */
  maxSubtasks: z.number().min(1).max(20).default(10),
  /** Whether to generate dependency graph */
  generateDependencies: z.boolean().default(true),
  /** Whether to generate milestones */
  generateMilestones: z.boolean().default(true),
  /** Task complexity level (auto-detected if not specified) */
  complexity: z.enum(["simple", "medium", "complex", "very_complex"]).optional(),
});

type TaskDecomposerArgs = z.infer<typeof TaskDecomposerArgs>;

// ============================================================================
// Types
// ============================================================================

/** Task status */
type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

/** Task priority */
type TaskPriority = "critical" | "high" | "medium" | "low";

/** A single subtask */
interface Subtask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedComplexity: number;
  dependsOn: string[];
  requiredCapabilities: string[];
  estimatedTokens: number;
}

/** A milestone/checkpoint */
interface Milestone {
  id: string;
  title: string;
  description: string;
  subtaskIds: string[];
  completionCriteria: string[];
}

/** Dependency edge for graph visualization */
interface DependencyEdge {
  from: string;
  to: string;
  type: "blocks" | "enables" | "relates_to";
}

/** Task dependency graph */
interface DependencyGraph {
  nodes: { id: string; title: string; status: TaskStatus }[];
  edges: DependencyEdge[];
}

/** Plan validation result */
interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  completenessScore: number;
}

/** Complete decomposition result */
interface DecompositionResult {
  originalTask: string;
  complexity: "simple" | "medium" | "complex" | "very_complex";
  subtasks: Subtask[];
  milestones: Milestone[];
  dependencyGraph: DependencyGraph;
  validation: ValidationResult;
  metadata: {
    totalSubtasks: number;
    criticalPath: string[];
    estimatedTotalTokens: number;
    parallelizableGroups: string[][];
  };
}

// ============================================================================
// Task Decomposition Logic
// ============================================================================

/** Detect task complexity from description */
function detectComplexity(task: string): "simple" | "medium" | "complex" | "very_complex" {
  const lowerTask = task.toLowerCase();

  // Indicators of complexity
  const complexityIndicators = {
    simple: ["add", "create simple", "update", "fix small", "change color"],
    medium: ["add feature", "implement", "refactor", "create component", "add validation"],
    complex: [
      "build system",
      "implement authentication",
      "create api",
      "migrate database",
      "redesign",
      "build from scratch",
    ],
    very_complex: [
      "complete application",
      "full system",
      "end-to-end",
      "multi-page",
      "complex workflow",
      "rebuild entire",
    ],
  };

  let score = 0;

  // Check for complex indicators
  for (const indicator of complexityIndicators.very_complex) {
    if (lowerTask.includes(indicator)) score += 4;
  }
  for (const indicator of complexityIndicators.complex) {
    if (lowerTask.includes(indicator)) score += 3;
  }
  for (const indicator of complexityIndicators.medium) {
    if (lowerTask.includes(indicator)) score += 2;
  }
  for (const indicator of complexityIndicators.simple) {
    if (lowerTask.includes(indicator)) score += 1;
  }

  // Length factor
  if (task.length > 500) score += 2;
  if (task.length > 1000) score += 2;

  // Multiple goals
  const goalPatterns = [/ and /g, / then /g, / also /g, / plus /g];
  for (const pattern of goalPatterns) {
    const matches = task.match(pattern);
    if (matches) score += matches.length;
  }

  if (score >= 6) return "very_complex";
  if (score >= 4) return "complex";
  if (score >= 2) return "medium";
  return "simple";
}

/** Get subtask templates based on complexity and task type */
function getSubtaskTemplates(
  complexity: "simple" | "medium" | "complex" | "very_complex",
  task: string,
): Partial<Subtask>[] {
  const lowerTask = task.toLowerCase();
  const templates: Partial<Subtask>[] = [];

  // Common task type detection
  const isBuild = lowerTask.includes("build") || lowerTask.includes("create") || lowerTask.includes("add");
  const _isDebug = lowerTask.includes("debug") || lowerTask.includes("fix");
  const _isRefactor = lowerTask.includes("refactor") || lowerTask.includes("rewrite");
  const _isTest = lowerTask.includes("test") || lowerTask.includes("verify");
  const isApi = lowerTask.includes("api") || lowerTask.includes("endpoint");
  const isDb = lowerTask.includes("database") || lowerTask.includes("db") || lowerTask.includes("schema");
  const isUi = lowerTask.includes("ui") || lowerTask.includes("interface") || lowerTask.includes("component");
  const isAuth = lowerTask.includes("auth") || lowerTask.includes("login") || lowerTask.includes("permission");

  if (complexity === "simple") {
    templates.push({
      title: "Implement task",
      description: "Execute the requested task",
      priority: "high",
      estimatedComplexity: 1,
      requiredCapabilities: ["code_generation"],
    });
  }

  if (complexity === "medium") {
    templates.push({
      title: "Analyze requirements",
      description: "Understand the task requirements and context",
      priority: "high",
      estimatedComplexity: 1,
      requiredCapabilities: ["code_analysis"],
    });
    templates.push({
      title: "Implement solution",
      description: "Write the code to fulfill the task",
      priority: "critical",
      estimatedComplexity: 2,
      requiredCapabilities: ["code_generation", "file_operations"],
    });
    templates.push({
      title: "Verify implementation",
      description: "Test the implementation works correctly",
      priority: "high",
      estimatedComplexity: 1,
      requiredCapabilities: ["code_analysis", "testing"],
    });
  }

  if (complexity === "complex" || complexity === "very_complex") {
    // Initial analysis
    templates.push({
      title: "Analyze requirements and context",
      description: "Understand task requirements, existing codebase, and constraints",
      priority: "critical",
      estimatedComplexity: 2,
      requiredCapabilities: ["code_analysis", "code_search"],
    });

    // Planning phase
    templates.push({
      title: "Create implementation plan",
      description: "Design the solution architecture and approach",
      priority: "high",
      estimatedComplexity: 2,
      requiredCapabilities: ["architecture_analysis"],
    });

    // Core implementation
    if (isBuild || isUi) {
      templates.push({
        title: "Create UI components",
        description: "Build user interface components",
        priority: "high",
        estimatedComplexity: 3,
        dependsOn: [],
        requiredCapabilities: ["code_generation", "file_operations"],
      });
    }

    if (isApi || isBuild) {
      templates.push({
        title: "Implement API endpoints",
        description: "Create backend API routes and handlers",
        priority: "high",
        estimatedComplexity: 3,
        requiredCapabilities: ["code_generation", "execute_command"],
      });
    }

    if (isDb || isBuild) {
      templates.push({
        title: "Set up database schema",
        description: "Define and implement database models",
        priority: "high",
        estimatedComplexity: 3,
        requiredCapabilities: ["database_management"],
      });
    }

    if (isAuth || isBuild) {
      templates.push({
        title: "Implement authentication",
        description: "Add user authentication and authorization",
        priority: "critical",
        estimatedComplexity: 4,
        requiredCapabilities: ["code_generation", "security_analysis"],
      });
    }

    // Testing phase
    templates.push({
      title: "Write unit tests",
      description: "Create tests for core functionality",
      priority: "high",
      estimatedComplexity: 2,
      requiredCapabilities: ["test_generation"],
    });

    templates.push({
      title: "Run integration tests",
      description: "Verify components work together correctly",
      priority: "high",
      estimatedComplexity: 2,
      requiredCapabilities: ["testing", "execute_command"],
    });
  }

  // Always add verification at the end for complex tasks
  if (complexity === "complex" || complexity === "very_complex") {
    templates.push({
      title: "Verify and validate",
      description: "Final verification of the implementation",
      priority: "critical",
      estimatedComplexity: 1,
      requiredCapabilities: ["code_analysis"],
    });
  }

  // Add documentation for very complex tasks
  if (complexity === "very_complex") {
    templates.push({
      title: "Document implementation",
      description: "Add documentation and comments",
      priority: "medium",
      estimatedComplexity: 1,
      requiredCapabilities: ["documentation"],
    });
  }

  return templates;
}

/** Generate unique subtask ID */
function generateSubtaskId(index: number): string {
  return `task_${index.toString().padStart(3, "0")}`;
}

/** Create subtasks from templates */
function createSubtasks(
  templates: Partial<Subtask>[],
  maxSubtasks: number,
  originalTask: string,
): Subtask[] {
  const subtasks: Subtask[] = [];
  const usedTitles = new Set<string>();

  // Adjust template dependencies for sequential execution
  for (let i = 0; i < Math.min(templates.length, maxSubtasks); i++) {
    const template = templates[i];
    let title = template.title || `Subtask ${i + 1}`;

    // Ensure unique titles
    let counter = 1;
    let baseTitle = title;
    while (usedTitles.has(title)) {
      title = `${baseTitle} (${counter})`;
      counter++;
    }
    usedTitles.add(title);

    // Determine dependencies
    let dependsOn: string[] = [];
    if (i > 0 && templates[i - 1]?.estimatedComplexity && (templates[i - 1]?.estimatedComplexity || 0) >= 3) {
      // If previous task is complex, current depends on it
      dependsOn = [generateSubtaskId(i)];
    }

    subtasks.push({
      id: generateSubtaskId(i + 1),
      title,
      description: template.description || originalTask,
      status: "pending",
      priority: template.priority || "medium",
      estimatedComplexity: template.estimatedComplexity || 1,
      dependsOn,
      requiredCapabilities: template.requiredCapabilities || ["code_generation"],
      estimatedTokens: (template.estimatedComplexity || 1) * 500,
    });
  }

  return subtasks;
}

/** Generate milestones from subtasks */
function generateMilestones(subtasks: Subtask[]): Milestone[] {
  const milestones: Milestone[] = [];

  if (subtasks.length === 0) return milestones;

  // Group subtasks into milestones
  const groups: Subtask[][] = [];
  let currentGroup: Subtask[] = [];

  for (const subtask of subtasks) {
    currentGroup.push(subtask);

    // Create milestone boundary at high complexity tasks or every 3 tasks
    if (
      subtask.estimatedComplexity >= 3 ||
      currentGroup.length >= 3 ||
      subtask.priority === "critical"
    ) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  // Add remaining tasks
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // Create milestone objects
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const isFirst = i === 0;
    const isLast = i === groups.length - 1;

    let title: string;
    let description: string;

    if (isFirst && subtasks[0].title.toLowerCase().includes("analyze")) {
      title = "Phase 1: Analysis Complete";
      description = "Requirements analyzed and implementation plan created";
    } else if (isLast) {
      title = "Final Milestone: Complete";
      description = "All tasks completed and verified";
    } else {
      title = `Milestone ${i + 1}`;
      description = `Completed ${group.map((t) => t.title).join(", ")}`;
    }

    milestones.push({
      id: `milestone_${i + 1}`,
      title,
      description,
      subtaskIds: group.map((t) => t.id),
      completionCriteria: group.map((t) => `✅ ${t.title} completed`),
    });
  }

  return milestones;
}

/** Create dependency graph */
function createDependencyGraph(subtasks: Subtask[]): DependencyGraph {
  const nodes = subtasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
  }));

  const edges: DependencyEdge[] = [];

  for (const subtask of subtasks) {
    for (const depId of subtask.dependsOn) {
      // Find the actual dependency (previous task)
      const depIndex = subtasks.findIndex((t) => t.id === depId);
      if (depIndex > 0) {
        const dep = subtasks[depIndex - 1]; // Previous task
        edges.push({
          from: dep.id,
          to: subtask.id,
          type: "blocks",
        });
      }
    }
  }

  // Add implicit sequential dependencies for complex tasks
  for (let i = 1; i < subtasks.length; i++) {
    const current = subtasks[i];
    const previous = subtasks[i - 1];

    // If current doesn't already have explicit dependency
    if (!current.dependsOn.includes(previous.id)) {
      // Only add edge if previous was complex
      if (previous.estimatedComplexity >= 3) {
        edges.push({
          from: previous.id,
          to: current.id,
          type: "enables",
        });
      }
    }
  }

  return { nodes, edges };
}

/** Find critical path (longest chain of dependent tasks) */
function findCriticalPath(subtasks: Subtask[]): string[] {
  // Calculate earliest start time for each task
  const earliestStart: Record<string, number> = {};
  const completed = new Set<string>();

  // Topological sort with complexity tracking
  for (let iteration = 0; iteration < subtasks.length; iteration++) {
    for (const subtask of subtasks) {
      if (completed.has(subtask.id)) continue;

      // Check if all dependencies are completed
      const depsReady = subtask.dependsOn.every((depId) => {
        const dep = subtasks.find((t) => t.id === depId);
        return !dep || completed.has(dep.id);
      });

      if (depsReady || subtask.dependsOn.length === 0) {
        const maxDepEnd =
          subtask.dependsOn.length > 0
            ? Math.max(
                ...subtask.dependsOn.map(
                  (depId) => earliestStart[depId] || 0 + (subtasks.find((t) => t.id === depId)?.estimatedComplexity || 1),
                ),
              )
            : 0;
        earliestStart[subtask.id] = maxDepEnd;
        completed.add(subtask.id);
      }
    }
  }

  // Find the longest path
  let maxEnd = 0;
  let endTask = "";

  for (const [id, start] of Object.entries(earliestStart)) {
    const task = subtasks.find((t) => t.id === id);
    const end = start + (task?.estimatedComplexity || 1);
    if (end > maxEnd) {
      maxEnd = end;
      endTask = id;
    }
  }

  // Backtrack to find path
  const path: string[] = [];
  let currentId = endTask;

  while (currentId) {
    path.unshift(currentId);
    const task = subtasks.find((t) => t.id === currentId);
    if (!task || task.dependsOn.length === 0) break;

    // Find the dependency that was on the critical path
    let maxPrevEnd = -1;
    let prevId = "";

    for (const depId of task.dependsOn) {
      const dep = subtasks.find((t) => t.id === depId);
      if (dep && earliestStart[depId] > maxPrevEnd) {
        maxPrevEnd = earliestStart[depId];
        prevId = depId;
      }
    }

    currentId = prevId;
  }

  return path;
}

/** Identify parallelizable task groups */
function findParallelizableGroups(subtasks: Subtask[]): string[][] {
  const groups: string[][] = [];
  const assigned = new Set<string>();

  // Simple parallelization: group tasks that don't depend on each other
  let _round = 0;
  while (assigned.size < subtasks.length) {
    const currentRound: string[] = [];

    for (const subtask of subtasks) {
      if (assigned.has(subtask.id)) continue;

      // Check if all dependencies are assigned
      const depsAssigned = subtask.dependsOn.every((depId) => assigned.has(depId));

      if (depsAssigned) {
        currentRound.push(subtask.id);
      }
    }

    if (currentRound.length === 0) break;

    groups.push(currentRound);
    currentRound.forEach((id) => assigned.add(id));
    _round++;
  }

  return groups;
}

/** Validate plan completeness */
function validatePlan(subtasks: Subtask[]): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check for empty task list
  if (subtasks.length === 0) {
    issues.push("No subtasks generated");
    return {
      isValid: false,
      issues,
      warnings,
      completenessScore: 0,
    };
  }

  // Check for circular dependencies
  const hasCircularDeps = detectCircularDependencies(subtasks);
  if (hasCircularDeps) {
    issues.push("Circular dependencies detected in task graph");
  }

  // Check for orphaned tasks (no dependencies and no tasks depend on them)
  const allDeps = new Set<string>();
  for (const task of subtasks) {
    for (const dep of task.dependsOn) {
      allDeps.add(dep);
    }
  }

  for (const task of subtasks) {
    if (task.dependsOn.length === 0 && !allDeps.has(task.id) && subtasks.length > 1) {
      warnings.push(`Task "${task.title}" has no dependencies - may be isolated`);
    }
  }

  // Check for high complexity concentration
  const highComplexityTasks = subtasks.filter((t) => t.estimatedComplexity >= 3);
  if (highComplexityTasks.length > subtasks.length * 0.5 && subtasks.length > 3) {
    warnings.push("Too many high-complexity tasks - consider breaking down further");
  }

  // Check for missing verification
  const hasVerification = subtasks.some(
    (t) =>
      t.title.toLowerCase().includes("verify") ||
      t.title.toLowerCase().includes("test") ||
      t.title.toLowerCase().includes("check"),
  );
  if (!hasVerification && subtasks.length > 2) {
    warnings.push("No verification task found - consider adding testing/validation");
  }

  // Calculate completeness score
  let completenessScore = 1.0;

  if (issues.length > 0) completenessScore -= 0.3;
  if (!hasVerification && subtasks.length > 2) completenessScore -= 0.1;
  if (highComplexityTasks.length > subtasks.length * 0.5) completenessScore -= 0.1;

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    completenessScore: Math.max(0, Math.min(1, completenessScore)),
  };
}

/** Detect circular dependencies */
function detectCircularDependencies(subtasks: Subtask[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(taskId: string): boolean {
    visited.add(taskId);
    recursionStack.add(taskId);

    const task = subtasks.find((t) => t.id === taskId);
    if (task) {
      for (const depId of task.dependsOn) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of subtasks) {
    if (!visited.has(task.id)) {
      if (dfs(task.id)) return true;
    }
  }

  return false;
}

// ============================================================================
// Main Decomposition Function
// ============================================================================

async function decomposeTask(
  args: TaskDecomposerArgs,
  _ctx: AgentContext,
): Promise<DecompositionResult> {
  const {
    task,
    projectContext: _projectContext,
    maxSubtasks,
    generateDependencies,
    generateMilestones: doGenerateMilestones,
    complexity: providedComplexity,
  } = args;

  // Detect or use provided complexity
  const complexity = providedComplexity || detectComplexity(task);

  // Get subtask templates
  const templates = getSubtaskTemplates(complexity, task);

  // Create subtasks
  const subtasks = createSubtasks(templates, maxSubtasks, task);

  // Generate milestones
  const milestones = doGenerateMilestones ? generateMilestones(subtasks) : [];

  // Create dependency graph
  const dependencyGraph = generateDependencies ? createDependencyGraph(subtasks) : { nodes: [], edges: [] };

  // Find critical path
  const criticalPath = findCriticalPath(subtasks);

  // Find parallelizable groups
  const parallelizableGroups = findParallelizableGroups(subtasks);

  // Validate plan
  const validation = validatePlan(subtasks);

  // Calculate total estimated tokens
  const estimatedTotalTokens = subtasks.reduce((sum, t) => sum + t.estimatedTokens, 0);

  return {
    originalTask: task,
    complexity,
    subtasks,
    milestones,
    dependencyGraph,
    validation,
    metadata: {
      totalSubtasks: subtasks.length,
      criticalPath,
      estimatedTotalTokens,
      parallelizableGroups,
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateDecompositionXml(result: DecompositionResult): string {
  const lines: string[] = [
    `# Task Decomposition`,
    ``,
    `**Original Task:** ${result.originalTask.substring(0, 100)}${result.originalTask.length > 100 ? "..." : ""}`,
    `**Complexity:** ${result.complexity}`,
    `**Subtasks:** ${result.subtasks.length}`,
    `**Completeness:** ${(result.validation.completenessScore * 100).toFixed(0)}%`,
    ``,
  ];

  // Validation issues/warnings
  if (result.validation.issues.length > 0) {
    lines.push(`## ⚠️ Issues`);
    for (const issue of result.validation.issues) {
      lines.push(`- ${issue}`);
    }
    lines.push(``);
  }

  if (result.validation.warnings.length > 0) {
    lines.push(`## ⚡ Warnings`);
    for (const warning of result.validation.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push(``);
  }

  // Milestones
  if (result.milestones.length > 0) {
    lines.push(`## Milestones`);
    for (const milestone of result.milestones) {
      lines.push(`### ${milestone.title}`);
      lines.push(milestone.description);
      lines.push(``);
    }
  }

  // Subtasks
  lines.push(`## Subtasks`);
  for (const subtask of result.subtasks) {
    const deps = subtask.dependsOn.length > 0 ? ` (depends on: ${subtask.dependsOn.join(", ")})` : "";
    lines.push(
      `- **[${subtask.id}]** ${subtask.title} [${subtask.priority}]${deps}`,
    );
  }
  lines.push(``);

  // Critical path
  if (result.metadata.criticalPath.length > 0) {
    lines.push(`## Critical Path`);
    lines.push(result.metadata.criticalPath.join(" → "));
    lines.push(``);
  }

  // Parallelizable groups
  if (result.metadata.parallelizableGroups.length > 1) {
    lines.push(`## Parallelizable Tasks`);
    for (let i = 0; i < result.metadata.parallelizableGroups.length; i++) {
      lines.push(`- Round ${i + 1}: ${result.metadata.parallelizableGroups[i].join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const taskDecomposerTool: ToolDefinition<TaskDecomposerArgs> = {
  name: "task_decomposer",
  description:
    "Breaks complex tasks into executable subtasks, creates task dependency graphs, generates milestone checkpoints, and validates plan completeness. Use this to plan complex implementations before executing.",
  inputSchema: TaskDecomposerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Task Decomposer">Analyzing and decomposing task...</dyad-status>`,
    );

    const result = await decomposeTask(args, ctx);

    const report = generateDecompositionXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Task Decomposition Complete">${result.subtasks.length} subtasks, ${result.validation.completenessScore * 100}% complete</dyad-status>`,
    );

    return report;
  },
};
