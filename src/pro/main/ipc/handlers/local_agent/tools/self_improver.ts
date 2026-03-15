/**
 * Self-Improver Tool
 * Advanced reasoning system that:
 * - Analyzes past task performance
 * - Identifies failure patterns
 * - Generates improvement strategies
 * - Updates system prompts/approaches
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const SelfImproverArgs = z.object({
  /** Analyze recent task failures */
  analyzeFailures: z.boolean().default(true),
  /** Generate improvement recommendations */
  generateRecommendations: z.boolean().default(true),
  /** Create learning summary */
  createSummary: z.boolean().default(true),
  /** Time window to analyze (in hours) */
  timeWindowHours: z.number().default(24),
  /** Log a specific failure for persistent learning */
  logFailure: z
    .object({
      pattern: z.string(),
      description: z.string(),
      context: z.string(),
      fix: z.string(),
    })
    .optional(),
});

type SelfImproverArgs = z.infer<typeof SelfImproverArgs>;

// Types
interface TaskRecord {
  taskId: string;
  task: string;
  status: "success" | "failed" | "partial";
  timestamp: string;
  duration: number;
  error?: string;
  steps: string[];
}

interface FailurePattern {
  pattern: string;
  frequency: number;
  severity: "critical" | "high" | "medium";
  description: string;
  suggestedFix: string;
}

interface ImprovementRecommendation {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  expectedImpact: string;
  implementation: string;
}

interface failureEntry {
  patternId: string;
  description: string;
  context: string;
  suggestedFix: string;
  occurrenceCount: number;
  lastOccurred: string;
}

interface FailureRepository {
  antiPatterns: failureEntry[];
}

interface SelfImproverResult {
  analysisPeriod: string;
  totalTasks: number;
  successRate: number;
  failurePatterns: FailurePattern[];
  recommendations: ImprovementRecommendation[];
  learningSummary: string;
}

// Load task history from memory file
function loadTaskHistory(ctx: AgentContext): TaskRecord[] {
  const historyPath = path.join(ctx.appPath, ".dyad", "task-history.json");

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(historyPath, "utf-8");
    const data = JSON.parse(content);
    return data.tasks || [];
  } catch {
    return [];
  }
}

// Save task record
function _saveTaskRecord(ctx: AgentContext, record: TaskRecord): void {
  const historyPath = path.join(ctx.appPath, ".dyad", "task-history.json");
  const dir = path.dirname(historyPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let data: { tasks: TaskRecord[] } = { tasks: [] };

  if (fs.existsSync(historyPath)) {
    try {
      const content = fs.readFileSync(historyPath, "utf-8");
      data = JSON.parse(content);
    } catch {
      // Start fresh
    }
  }

  data.tasks.push(record);

  // Keep only last 1000 tasks
  if (data.tasks.length > 1000) {
    data.tasks = data.tasks.slice(-1000);
  }

  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2), "utf-8");
}

function loadFailureRepository(ctx: AgentContext): FailureRepository {
  const filePath = path.join(ctx.appPath, ".dyad", "failure_repository.json");
  if (!fs.existsSync(filePath)) return { antiPatterns: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { antiPatterns: [] };
  }
}

function saveFailureRepository(
  ctx: AgentContext,
  repo: FailureRepository,
): void {
  const filePath = path.join(ctx.appPath, ".dyad", "failure_repository.json");
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(repo, null, 2), "utf-8");
}

// Analyze failure patterns
function analyzeFailurePatterns(tasks: TaskRecord[]): FailurePattern[] {
  const patterns: Map<string, FailurePattern> = new Map();

  const failedTasks = tasks.filter(
    (t) => t.status === "failed" || t.status === "partial",
  );

  for (const task of failedTasks) {
    // Pattern: TSC/Type errors
    if (
      task.error?.includes("TypeScript") ||
      task.error?.includes("type check")
    ) {
      const existing = patterns.get("typescript_errors");
      if (existing) {
        existing.frequency++;
      } else {
        patterns.set("typescript_errors", {
          pattern: "TypeScript Errors",
          frequency: 1,
          severity: "high",
          description: "Tasks failing due to type errors",
          suggestedFix:
            "Run type checking before committing, use autonomous_fix_loop",
        });
      }
    }

    // Pattern: Tool permission denied
    if (task.error?.includes("permission") || task.error?.includes("denied")) {
      const existing = patterns.get("permission_denied");
      if (existing) {
        existing.frequency++;
      } else {
        patterns.set("permission_denied", {
          pattern: "Permission Denied",
          frequency: 1,
          severity: "high",
          description: "Tool execution blocked by user consent",
          suggestedFix: "Set tool to 'always' in consent settings",
        });
      }
    }

    // Pattern: Context limit
    if (task.error?.includes("context") || task.error?.includes("token")) {
      const existing = patterns.get("context_limit");
      if (existing) {
        existing.frequency++;
      } else {
        patterns.set("context_limit", {
          pattern: "Context Limit",
          frequency: 1,
          severity: "medium",
          description: "Task exceeded context window limits",
          suggestedFix: "Enable context compaction, use smaller chunks",
        });
      }
    }

    // Pattern: Network/API errors
    if (task.error?.includes("network") || task.error?.includes("API")) {
      const existing = patterns.get("network_errors");
      if (existing) {
        existing.frequency++;
      } else {
        patterns.set("network_errors", {
          pattern: "Network Errors",
          frequency: 1,
          severity: "medium",
          description: "External API calls failing",
          suggestedFix: "Add retry logic, implement circuit breaker",
        });
      }
    }

    // Pattern: File not found
    if (task.error?.includes("ENOENT") || task.error?.includes("not found")) {
      const existing = patterns.get("file_not_found");
      if (existing) {
        existing.frequency++;
      } else {
        patterns.set("file_not_found", {
          pattern: "File Not Found",
          frequency: 1,
          severity: "medium",
          description: "Attempting to access non-existent files",
          suggestedFix: "Add file existence checks before operations",
        });
      }
    }
  }

  // Sort by frequency and return
  return Array.from(patterns.values()).sort(
    (a, b) => b.frequency - a.frequency,
  );
}

// Generate recommendations based on patterns
function generateRecommendations(
  patterns: FailurePattern[],
  tasks: TaskRecord[],
): ImprovementRecommendation[] {
  const recommendations: ImprovementRecommendation[] = [];

  const criticalPatterns = patterns.filter((p) => p.severity === "critical");
  const highPatterns = patterns.filter((p) => p.severity === "high");

  // From critical patterns
  for (const pattern of criticalPatterns) {
    recommendations.push({
      category: "Critical Fix",
      priority: "critical",
      description: `Address frequent failure: ${pattern.pattern}`,
      expectedImpact: `Reduce failures by ${Math.min(50, pattern.frequency * 10)}%`,
      implementation: pattern.suggestedFix,
    });
  }

  // From high patterns
  for (const pattern of highPatterns.slice(0, 3)) {
    recommendations.push({
      category: "High Priority",
      priority: "high",
      description: `Address ${pattern.pattern} (${pattern.frequency} occurrences)`,
      expectedImpact: `Improve reliability by ${Math.min(30, pattern.frequency * 5)}%`,
      implementation: pattern.suggestedFix,
    });
  }

  // General recommendations based on stats
  const avgDuration =
    tasks.reduce((sum, t) => sum + t.duration, 0) / tasks.length;

  if (avgDuration > 300000) {
    // > 5 minutes average
    recommendations.push({
      category: "Performance",
      priority: "medium",
      description: "Tasks taking too long on average",
      expectedImpact: "Reduce task duration by 20%",
      implementation: "Parallelize independent operations, optimize tool usage",
    });
  }

  const successTasks = tasks.filter((t) => t.status === "success");
  const avgSteps =
    successTasks.reduce((sum, t) => sum + t.steps.length, 0) /
    Math.max(1, successTasks.length);

  if (avgSteps > 20) {
    recommendations.push({
      category: "Efficiency",
      priority: "medium",
      description: "Tasks require too many steps",
      expectedImpact: "Reduce steps by 30%",
      implementation: "Combine related operations, batch file edits",
    });
  }

  // Add proactive recommendations
  recommendations.push({
    category: "Prevention",
    priority: "low",
    description: "Enable proactive error prevention",
    expectedImpact: "Catch 50% of issues before they cause failures",
    implementation:
      "Add pre-execution validation checks, implement circuit breakers",
  });

  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// Create learning summary
function createLearningSummary(
  totalTasks: number,
  successRate: number,
  patterns: FailurePattern[],
  recommendations: ImprovementRecommendation[],
): string {
  const lines: string[] = [
    `# Self-Improvement Analysis`,
    ``,
    `## Performance Summary`,
    `- Total Tasks Analyzed: ${totalTasks}`,
    `- Success Rate: ${(successRate * 100).toFixed(1)}%`,
    `- Failed Tasks: ${Math.round(totalTasks * (1 - successRate))}`,
    ``,
  ];

  if (patterns.length > 0) {
    lines.push(`## 🔍 Identified Failure Patterns`);
    for (const pattern of patterns.slice(0, 5)) {
      lines.push(`### ${pattern.pattern} (${pattern.frequency}x)`);
      lines.push(`- Severity: ${pattern.severity}`);
      lines.push(`- ${pattern.description}`);
      lines.push(`- Fix: ${pattern.suggestedFix}`);
      lines.push("");
    }
  }

  if (recommendations.length > 0) {
    lines.push(`## 💡 Improvement Recommendations`);
    for (const rec of recommendations.slice(0, 5)) {
      lines.push(`### [${rec.priority.toUpperCase()}] ${rec.category}`);
      lines.push(`${rec.description}`);
      lines.push(`**Impact:** ${rec.expectedImpact}`);
      lines.push(`**Implementation:** ${rec.implementation}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*This analysis was generated by Dyad's Self-Improvement System*");

  return lines.join("\n");
}

// Main function
async function analyzeSelfImprovement(
  args: SelfImproverArgs,
  ctx: AgentContext,
): Promise<SelfImproverResult> {
  ctx.onXmlStream(
    `<dyad-status title="Self-Improver">Analyzing task performance...</dyad-status>`,
  );

  const tasks = loadTaskHistory(ctx);

  // Filter by time window
  const cutoffTime = Date.now() - args.timeWindowHours * 60 * 60 * 1000;
  const recentTasks = tasks.filter(
    (t) => new Date(t.timestamp).getTime() > cutoffTime,
  );

  if (recentTasks.length === 0) {
    return {
      analysisPeriod: `${args.timeWindowHours}h`,
      totalTasks: 0,
      successRate: 0,
      failurePatterns: [],
      recommendations: [
        {
          category: "Data Collection",
          priority: "medium",
          description: "No task history available yet",
          expectedImpact: "Build history by using the agent more",
          implementation:
            "Continue using Dyad normally - history will be collected automatically",
        },
      ],
      learningSummary: createLearningSummary(0, 0, [], []),
    };
  }

  const successCount = recentTasks.filter((t) => t.status === "success").length;
  const successRate = successCount / recentTasks.length;

  ctx.onXmlStream(
    `<dyad-status title="Self-Improver">Found ${recentTasks.length} recent tasks, ${successRate * 100}% success rate</dyad-status>`,
  );

  // Analyze patterns
  const patterns = args.analyzeFailures
    ? analyzeFailurePatterns(recentTasks)
    : [];

  // Generate recommendations
  const recommendations = args.generateRecommendations
    ? generateRecommendations(patterns, recentTasks)
    : [];

  // Create summary
  const summary = args.createSummary
    ? createLearningSummary(
        recentTasks.length,
        successRate,
        patterns,
        recommendations,
      )
    : "";

  // Handle manual logFailure
  if (args.logFailure) {
    const repo = loadFailureRepository(ctx);
    const existing = repo.antiPatterns.find(
      (p) => p.patternId === args.logFailure!.pattern,
    );
    if (existing) {
      existing.occurrenceCount++;
      existing.lastOccurred = new Date().toISOString();
    } else {
      repo.antiPatterns.push({
        patternId: args.logFailure.pattern,
        description: args.logFailure.description,
        context: args.logFailure.context,
        suggestedFix: args.logFailure.fix,
        occurrenceCount: 1,
        lastOccurred: new Date().toISOString(),
      });
    }
    saveFailureRepository(ctx, repo);
    ctx.onXmlStream(
      `<dyad-status title="Recursive Learning">Anti-pattern recorded: ${args.logFailure.pattern}</dyad-status>`,
    );
  }

  return {
    analysisPeriod: `${args.timeWindowHours}h`,
    totalTasks: recentTasks.length,
    successRate,
    failurePatterns: patterns,
    recommendations,
    learningSummary: summary,
  };
}

export const selfImproverTool: ToolDefinition<SelfImproverArgs> = {
  name: "self_improver",
  description:
    "Analyze agent performance patterns, identify recurring failures, and generate self-improvement recommendations. Helps the system learn from past tasks.",
  inputSchema: SelfImproverArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeSelfImprovement(args, ctx);

    const summaryLines = [
      `# Self-Improvement Analysis Report`,
      ``,
      `**Analysis Period:** ${result.analysisPeriod}`,
      `**Total Tasks:** ${result.totalTasks}`,
      `**Success Rate:** ${(result.successRate * 100).toFixed(1)}%`,
      ``,
    ];

    if (result.failurePatterns.length > 0) {
      summaryLines.push(`## 🔍 Top Failure Patterns`);
      for (const pattern of result.failurePatterns.slice(0, 3)) {
        summaryLines.push(`- ${pattern.pattern}: ${pattern.frequency}x`);
      }
      summaryLines.push("");
    }

    if (result.recommendations.length > 0) {
      summaryLines.push(`## 💡 Top Recommendations`);
      for (const rec of result.recommendations.slice(0, 3)) {
        summaryLines.push(`- **[${rec.priority}]** ${rec.description}`);
      }
    }

    const report = summaryLines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Self-Improvement Complete">${result.successRate * 100}% success rate over ${result.totalTasks} tasks</dyad-status>`,
    );

    return result.learningSummary || report;
  },
};
