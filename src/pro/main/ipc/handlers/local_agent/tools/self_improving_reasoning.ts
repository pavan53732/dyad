/**
 * Self-Improving Reasoning Tools (Capabilities 61-70)
 * Feedback learning pipeline for continuous improvement
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Types
// ============================================================================

interface LearningRecord {
  id: string;
  timestamp: string;
  task: string;
  outcome: "success" | "failure" | "partial";
  metrics: Record<string, number>;
  patterns: string[];
  strategy: string;
}

interface PerformanceMetrics {
  accuracy: number;
  efficiency: number;
  reliability: number;
  avgDuration: number;
  successRate: number;
}

interface ErrorPattern {
  pattern: string;
  frequency: number;
  severity: "critical" | "high" | "medium" | "low";
  context: string;
  solution: string;
  lastSeen: string;
}

interface SuccessPattern {
  pattern: string;
  frequency: number;
  context: string;
  successFactors: string[];
  applicability: number;
}

interface ThresholdConfig {
  metric: string;
  current: number;
  target: number;
  adaptationRate: number;
  lastUpdated: string;
}

interface PolicyRule {
  condition: string;
  action: string;
  priority: number;
  confidence: number;
  source: "learned" | "default" | "manual";
}

interface CorrectionAction {
  type: "retry" | "alternate" | "abort" | "refine";
  reason: string;
  parameters: Record<string, unknown>;
}

interface LearningStore {
  records: LearningRecord[];
  errorPatterns: ErrorPattern[];
  successPatterns: SuccessPattern[];
  thresholds: ThresholdConfig[];
  policies: PolicyRule[];
}

// ============================================================================
// Storage Functions
// ============================================================================

function getLearningStorePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "learning-store.json");
}

function loadLearningStore(ctx: AgentContext): LearningStore {
  const storePath = getLearningStorePath(ctx);

  if (!fs.existsSync(storePath)) {
    return {
      records: [],
      errorPatterns: [],
      successPatterns: [],
      thresholds: [],
      policies: [],
    };
  }

  try {
    const content = fs.readFileSync(storePath, "utf-8");
    return JSON.parse(content) as LearningStore;
  } catch {
    return {
      records: [],
      errorPatterns: [],
      successPatterns: [],
      thresholds: [],
      policies: [],
    };
  }
}

function saveLearningStore(ctx: AgentContext, data: LearningStore): void {
  const storePath = getLearningStorePath(ctx);
  const dir = path.dirname(storePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
}

// ============================================================================
// 1. Learning Feedback Loop (61)
// ============================================================================

const LearningFeedbackLoopArgs = z.object({
  task: z.string().describe("The task that was executed"),
  outcome: z.enum(["success", "failure", "partial"]).describe("Task outcome"),
  metrics: z.record(z.number()).describe("Performance metrics from the task"),
  strategy: z.string().describe("Strategy used for the task"),
  patterns: z.array(z.string()).describe("Patterns identified in the task"),
  timeSpent: z.number().describe("Time spent on task in milliseconds"),
});

type LearningFeedbackLoopArgs = z.infer<typeof LearningFeedbackLoopArgs>;

async function executeLearningFeedbackLoop(
  args: LearningFeedbackLoopArgs,
  ctx: AgentContext,
): Promise<{
  feedbackProcessed: boolean;
  patternsIdentified: number;
  improvementSuggestions: string[];
}> {
  const store = loadLearningStore(ctx);

  // Add new learning record
  const randomId = Math.random().toString(36).substring(2, 9);
  const record: LearningRecord = {
    id: `lr_${Date.now()}_${randomId}`,
    timestamp: new Date().toISOString(),
    task: args.task,
    outcome: args.outcome,
    metrics: args.metrics,
    patterns: args.patterns,
    strategy: args.strategy,
  };

  store.records.push(record);

  // Keep only last 1000 records
  if (store.records.length > 1000) {
    const arr = store.records;
    const start = arr.length - 1000;
    store.records = arr.slice(start);
  }

  // Process outcome-based learning
  if (args.outcome === "failure" || args.outcome === "partial") {
    // Add to error patterns
    for (const pattern of args.patterns) {
      const existing = store.errorPatterns.find((p) => p.pattern === pattern);
      if (existing) {
        existing.frequency++;
        existing.lastSeen = record.timestamp;
      } else {
        store.errorPatterns.push({
          pattern,
          frequency: 1,
          severity: args.outcome === "failure" ? "high" : "medium",
          context: args.task,
          solution: "Analyze and adapt strategy",
          lastSeen: record.timestamp,
        });
      }
    }
  } else if (args.outcome === "success") {
    // Add to success patterns
    for (const pattern of args.patterns) {
      const existing = store.successPatterns.find((p) => p.pattern === pattern);
      if (existing) {
        existing.frequency++;
      } else {
        store.successPatterns.push({
          pattern,
          frequency: 1,
          context: args.task,
          successFactors: args.patterns,
          applicability: 0.8,
        });
      }
    }
  }

  // Keep pattern lists manageable
  if (store.errorPatterns.length > 50) {
    store.errorPatterns = store.errorPatterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 50);
  }

  if (store.successPatterns.length > 50) {
    store.successPatterns = store.successPatterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 50);
  }

  saveLearningStore(ctx, store);

  // Generate improvement suggestions
  const suggestions: string[] = [];

  if (store.errorPatterns.length > 0) {
    const sortedErrors = [...store.errorPatterns].sort(
      (a, b) => b.frequency - a.frequency,
    );
    const topError = sortedErrors[0];
    suggestions.push(`Focus on addressing: ${topError.pattern}`);
  }

  if (args.outcome === "failure" && store.successPatterns.length > 0) {
    suggestions.push("Consider alternative approaches from successful tasks");
  }

  return {
    feedbackProcessed: true,
    patternsIdentified: args.patterns.length,
    improvementSuggestions: suggestions,
  };
}

export const learningFeedbackLoopTool: ToolDefinition<LearningFeedbackLoopArgs> =
  {
    name: "learning_feedback_loop",
    description:
      "Process feedback from task execution to enable continuous learning. Records outcomes, patterns, and strategies for future improvement.",
    inputSchema: LearningFeedbackLoopArgs,
    defaultConsent: "always",
    modifiesState: true,

    execute: async (args, ctx) => {
      const result = await executeLearningFeedbackLoop(args, ctx);

      const lines = [
        `# Learning Feedback Loop`,
        ``,
        `**Status:** Feedback Processed`,
        `**Patterns Identified:** ${result.patternsIdentified}`,
        ``,
      ];

      if (result.improvementSuggestions.length > 0) {
        lines.push(`## 💡 Suggestions`);
        for (const suggestion of result.improvementSuggestions) {
          lines.push(`- ${suggestion}`);
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Learning Feedback">Processed ${result.patternsIdentified} patterns</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// 2. Performance Evaluation (62)
// ============================================================================

const PerformanceEvaluationArgs = z.object({
  timeWindowHours: z.number().default(24).describe("Time window to analyze"),
  includeMetrics: z
    .array(z.string())
    .optional()
    .describe("Specific metrics to evaluate"),
  context: z.string().optional().describe("Evaluation context"),
});

type PerformanceEvaluationArgs = z.infer<typeof PerformanceEvaluationArgs>;

async function executePerformanceEvaluation(
  args: PerformanceEvaluationArgs,
  ctx: AgentContext,
): Promise<{
  summary: PerformanceMetrics;
  details: Record<string, number>;
  trends: string[];
  recommendations: string[];
}> {
  const store = loadLearningStore(ctx);

  // Filter records by time window
  const cutoffTime = Date.now() - args.timeWindowHours * 60 * 60 * 1000;
  const recentRecords = store.records.filter(
    (r) => new Date(r.timestamp).getTime() > cutoffTime,
  );

  if (recentRecords.length === 0) {
    return {
      summary: {
        accuracy: 0,
        efficiency: 0,
        reliability: 0,
        avgDuration: 0,
        successRate: 0,
      },
      details: {},
      trends: ["No data available for evaluation period"],
      recommendations: ["Continue using the agent to build evaluation data"],
    };
  }

  // Calculate metrics
  const successCount = recentRecords.filter(
    (r) => r.outcome === "success",
  ).length;
  const partialCount = recentRecords.filter(
    (r) => r.outcome === "partial",
  ).length;
  const successRate = successCount / recentRecords.length;

  const metrics: Map<string, number[]> = new Map();
  for (const record of recentRecords) {
    for (const [key, value] of Object.entries(record.metrics)) {
      if (!metrics.has(key)) {
        metrics.set(key, []);
      }
      metrics.get(key)!.push(value);
    }
  }

  const details: Record<string, number> = {};
  for (const [key, values] of metrics) {
    if (args.includeMetrics && !args.includeMetrics.includes(key)) continue;
    details[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Calculate trends
  const trends: string[] = [];
  if (successRate >= 0.8) {
    trends.push("High success rate - performance is strong");
  } else if (successRate >= 0.6) {
    trends.push("Moderate success rate - room for improvement");
  } else {
    trends.push("Low success rate - significant improvement needed");
  }

  // Compare with previous period
  const previousCutoff = cutoffTime - args.timeWindowHours * 60 * 60 * 1000;
  const previousRecords = store.records.filter((r) => {
    const time = new Date(r.timestamp).getTime();
    return time > previousCutoff && time <= cutoffTime;
  });

  if (previousRecords.length > 0) {
    const previousSuccess = previousRecords.filter(
      (r) => r.outcome === "success",
    ).length;
    const previousRate = previousSuccess / previousRecords.length;
    const change = (successRate - previousRate) * 100;
    if (change > 5) {
      trends.push(`Performance improved by ${change.toFixed(1)}%`);
    } else if (change < -5) {
      trends.push(`Performance declined by ${Math.abs(change).toFixed(1)}%`);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (successRate < 0.7) {
    recommendations.push(
      "Review error patterns and apply corrective strategies",
    );
  }
  if (store.errorPatterns.length > 0) {
    recommendations.push("Address top recurring error patterns");
  }

  return {
    summary: {
      accuracy: successRate,
      efficiency: details["efficiency"] ?? successRate * 0.9,
      reliability: (successCount + partialCount * 0.5) / recentRecords.length,
      avgDuration: details["avgDuration"] ?? 0,
      successRate,
    },
    details,
    trends,
    recommendations,
  };
}

export const performanceEvaluationTool: ToolDefinition<PerformanceEvaluationArgs> =
  {
    name: "performance_evaluation",
    description:
      "Evaluate agent performance metrics over a time window. Provides detailed metrics, trends, and recommendations.",
    inputSchema: PerformanceEvaluationArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await executePerformanceEvaluation(args, ctx);

      const lines = [
        `# Performance Evaluation`,
        ``,
        `## Summary`,
        `- **Success Rate:** ${(result.summary.successRate * 100).toFixed(1)}%`,
        `- **Accuracy:** ${(result.summary.accuracy * 100).toFixed(1)}%`,
        `- **Reliability:** ${(result.summary.reliability * 100).toFixed(1)}%`,
        ``,
      ];

      if (result.trends.length > 0) {
        lines.push(`## Trends`);
        for (const trend of result.trends) {
          lines.push(`- ${trend}`);
        }
        lines.push("");
      }

      if (result.recommendations.length > 0) {
        lines.push(`## Recommendations`);
        for (const rec of result.recommendations) {
          lines.push(`- ${rec}`);
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Performance Evaluation">${(result.summary.successRate * 100).toFixed(1)}% success rate</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// 3. Strategy Refinement (63)
// ============================================================================

const StrategyRefinementArgs = z.object({
  taskType: z.string().describe("Type of task to refine strategy for"),
  targetOutcome: z
    .enum(["success", "efficiency", "reliability"])
    .describe("Desired outcome type"),
  constraints: z
    .record(z.union([z.string(), z.number()]))
    .optional()
    .describe("Strategy constraints"),
});

type StrategyRefinementArgs = z.infer<typeof StrategyRefinementArgs>;

async function executeStrategyRefinement(
  args: StrategyRefinementArgs,
  ctx: AgentContext,
): Promise<{
  refinedStrategy: string;
  modifications: string[];
  expectedImpact: string;
  confidence: number;
}> {
  const store = loadLearningStore(ctx);

  // Find relevant success patterns for the task type
  const relevantSuccesses = store.successPatterns.filter(
    (p) =>
      p.context.toLowerCase().includes(args.taskType.toLowerCase()) ||
      args.taskType.toLowerCase().includes(p.context.toLowerCase()),
  );

  // Find relevant error patterns
  const relevantErrors = store.errorPatterns.filter(
    (p) =>
      p.context.toLowerCase().includes(args.taskType.toLowerCase()) ||
      args.taskType.toLowerCase().includes(p.context.toLowerCase()),
  );

  // Generate strategy modifications
  const modifications: string[] = [];

  // Build from success patterns
  if (relevantSuccesses.length > 0) {
    modifications.push(
      `Incorporate ${relevantSuccesses.length} successful approaches from similar tasks`,
    );
  }

  // Avoid error patterns
  if (relevantErrors.length > 0) {
    modifications.push(
      `Avoid ${relevantErrors.length} known failure patterns for this task type`,
    );
  }

  // Refine based on target outcome
  switch (args.targetOutcome) {
    case "success":
      modifications.push(
        "Prioritize reliability over speed - use proven methods",
        "Add validation steps to ensure correctness",
      );
      break;
    case "efficiency":
      modifications.push(
        "Streamline approach - use parallel operations where possible",
        "Reduce redundant checks",
      );
      break;
    case "reliability":
      modifications.push(
        "Add error handling and fallback strategies",
        "Implement retry logic for known failure points",
      );
      break;
  }

  // Apply constraints
  if (args.constraints) {
    for (const [key, value] of Object.entries(args.constraints)) {
      modifications.push(`Constraint: ${key} = ${String(value)}`);
    }
  }

  // Calculate confidence based on available data
  const dataPoints = relevantSuccesses.length + relevantErrors.length;
  const confidence = Math.min(0.95, 0.3 + (dataPoints / 20) * 0.65);

  // Generate refined strategy
  const refinedStrategy = [
    `Strategy for ${args.taskType}:`,
    ...modifications.map((m) => `  - ${m}`),
  ].join("\n");

  return {
    refinedStrategy,
    modifications,
    expectedImpact: `Expected ${args.targetOutcome} improvement: ${(confidence * 30).toFixed(0)}%`,
    confidence,
  };
}

export const strategyRefinementTool: ToolDefinition<StrategyRefinementArgs> = {
  name: "strategy_refinement",
  description:
    "Refine task execution strategies based on historical performance data and outcomes.",
  inputSchema: StrategyRefinementArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await executeStrategyRefinement(args, ctx);

    const lines = [
      `# Strategy Refinement`,
      ``,
      `**Task Type:** ${args.taskType}`,
      `**Target:** ${args.targetOutcome}`,
      `**Confidence:** ${(result.confidence * 100).toFixed(0)}%`,
      ``,
      `## Refined Strategy`,
      result.refinedStrategy,
      ``,
      `**Expected Impact:** ${result.expectedImpact}`,
    ];

    ctx.onXmlComplete(
      `<dyad-status title="Strategy Refinement">${result.modifications.length} modifications</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// ============================================================================
// 4. Knowledge Updater (64)
// ============================================================================

const KnowledgeUpdaterArgs = z.object({
  knowledgeId: z.string().describe("ID of knowledge entry to update"),
  updates: z.record(z.unknown()).describe("Updates to apply"),
  mergeStrategy: z
    .enum(["replace", "merge", "append"])
    .default("merge")
    .describe("How to merge updates"),
  validate: z.boolean().default(true).describe("Validate before updating"),
});

type KnowledgeUpdaterArgs = z.infer<typeof KnowledgeUpdaterArgs>;

async function executeKnowledgeUpdater(
  args: KnowledgeUpdaterArgs,
  ctx: AgentContext,
): Promise<{
  updated: boolean;
  knowledgeId: string;
  changes: string[];
}> {
  // Load knowledge base
  const kbPath = path.join(ctx.appPath, ".dyad", "knowledge-base.json");
  let knowledgeBase: Record<string, unknown> = {};

  if (fs.existsSync(kbPath)) {
    try {
      const content = fs.readFileSync(kbPath, "utf-8");
      knowledgeBase = JSON.parse(content);
    } catch {
      // Start fresh
    }
  }

  const changes: string[] = [];

  // Apply updates based on strategy
  if (args.mergeStrategy === "replace") {
    knowledgeBase[args.knowledgeId] = args.updates;
    changes.push("Replaced entire entry");
  } else if (args.mergeStrategy === "merge") {
    const existing =
      (knowledgeBase[args.knowledgeId] as Record<string, unknown>) || {};
    knowledgeBase[args.knowledgeId] = { ...existing, ...args.updates };
    changes.push("Merged updates with existing entry");
  } else if (args.mergeStrategy === "append") {
    const existing = (knowledgeBase[args.knowledgeId] as unknown[]) || [];
    if (Array.isArray(existing)) {
      knowledgeBase[args.knowledgeId] = [...existing, args.updates];
    } else {
      knowledgeBase[args.knowledgeId] = [existing, args.updates];
    }
    changes.push("Appended updates to existing entry");
  }

  // Validate if requested
  if (args.validate) {
    // Basic validation - ensure it's serializable
    try {
      JSON.stringify(knowledgeBase[args.knowledgeId]);
      changes.push("Validation passed");
    } catch {
      changes.push("Validation warning: entry may not be serializable");
    }
  }

  // Save knowledge base
  const dir = path.dirname(kbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(kbPath, JSON.stringify(knowledgeBase, null, 2), "utf-8");

  return {
    updated: true,
    knowledgeId: args.knowledgeId,
    changes,
  };
}

export const knowledgeUpdaterTool: ToolDefinition<KnowledgeUpdaterArgs> = {
  name: "knowledge_updater",
  description:
    "Update entries in the agent's knowledge base with new information or corrections.",
  inputSchema: KnowledgeUpdaterArgs,
  defaultConsent: "always",
  modifiesState: true,

  execute: async (args, ctx) => {
    const result = await executeKnowledgeUpdater(args, ctx);

    const lines = [
      `# Knowledge Updater`,
      ``,
      `**Knowledge ID:** ${result.knowledgeId}`,
      `**Updated:** ${result.updated}`,
      ``,
      `## Changes`,
      ...result.changes.map((c) => `- ${c}`),
    ];

    ctx.onXmlComplete(
      `<dyad-status title="Knowledge Updated">${result.knowledgeId}</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// ============================================================================
// 5. Error Pattern Learner (65)
// ============================================================================

const ErrorPatternLearnerArgs = z.object({
  analyzeRecent: z
    .boolean()
    .default(true)
    .describe("Analyze recent error records"),
  timeWindowHours: z.number().default(24).describe("Time window for analysis"),
  minFrequency: z.number().default(2).describe("Minimum frequency to report"),
});

type ErrorPatternLearnerArgs = z.infer<typeof ErrorPatternLearnerArgs>;

async function executeErrorPatternLearner(
  args: ErrorPatternLearnerArgs,
  ctx: AgentContext,
): Promise<{
  patterns: ErrorPattern[];
  analysis: string;
  recommendations: string[];
}> {
  const store = loadLearningStore(ctx);

  let patterns = store.errorPatterns;

  if (args.analyzeRecent) {
    // Also analyze recent records directly
    const cutoffTime = Date.now() - args.timeWindowHours * 60 * 60 * 1000;
    const recentRecords = store.records.filter(
      (r) =>
        r.outcome !== "success" && new Date(r.timestamp).getTime() > cutoffTime,
    );

    // Count patterns in recent failures
    const recentPatterns: Map<string, number> = new Map();
    for (const record of recentRecords) {
      for (const pattern of record.patterns) {
        recentPatterns.set(pattern, (recentPatterns.get(pattern) || 0) + 1);
      }
    }

    // Add new patterns from recent analysis
    for (const [pattern, frequency] of recentPatterns) {
      if (frequency >= args.minFrequency) {
        const existing = patterns.find((p) => p.pattern === pattern);
        if (!existing) {
          patterns.push({
            pattern,
            frequency,
            severity: "medium",
            context: "Recent analysis",
            solution: "To be determined",
            lastSeen: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Filter by minimum frequency
  patterns = patterns.filter((p) => p.frequency >= args.minFrequency);

  // Sort by frequency
  patterns.sort((a, b) => b.frequency - a.frequency);

  // Generate analysis
  const criticalPatterns = patterns.filter((p) => p.severity === "critical");

  let analysis = `Found ${patterns.length} error patterns`;
  if (criticalPatterns.length > 0) {
    analysis += `, including ${criticalPatterns.length} critical`;
  }

  // Generate recommendations
  const recommendations: string[] = [];
  for (const pattern of patterns.slice(0, 3)) {
    recommendations.push(
      `[${pattern.severity.toUpperCase()}] ${pattern.pattern}: ${pattern.solution}`,
    );
  }

  return {
    patterns,
    analysis,
    recommendations,
  };
}

export const errorPatternLearnerTool: ToolDefinition<ErrorPatternLearnerArgs> =
  {
    name: "error_pattern_learner",
    description:
      "Analyze error records to identify recurring patterns and learn solutions.",
    inputSchema: ErrorPatternLearnerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await executeErrorPatternLearner(args, ctx);

      const lines = [
        `# Error Pattern Learner`,
        ``,
        `**Analysis:** ${result.analysis}`,
        ``,
      ];

      if (result.patterns.length > 0) {
        lines.push(`## Top Error Patterns`);
        for (const pattern of result.patterns.slice(0, 5)) {
          lines.push(`### ${pattern.pattern}`);
          lines.push(`- Frequency: ${pattern.frequency}x`);
          lines.push(`- Severity: ${pattern.severity}`);
          lines.push(`- Solution: ${pattern.solution}`);
          lines.push("");
        }
      }

      if (result.recommendations.length > 0) {
        lines.push(`## Recommendations`);
        for (const rec of result.recommendations) {
          lines.push(`- ${rec}`);
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Error Patterns">${result.patterns.length} patterns identified</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// 6. Success Pattern Extractor (66)
// ============================================================================

const SuccessPatternExtractorArgs = z.object({
  taskType: z.string().optional().describe("Filter by task type"),
  minFrequency: z.number().default(2).describe("Minimum frequency to report"),
  includeContext: z.boolean().default(true).describe("Include context details"),
});

type SuccessPatternExtractorArgs = z.infer<typeof SuccessPatternExtractorArgs>;

async function executeSuccessPatternExtractor(
  args: SuccessPatternExtractorArgs,
  ctx: AgentContext,
): Promise<{
  patterns: SuccessPattern[];
  analysis: string;
  applicabilityGuide: string[];
}> {
  const store = loadLearningStore(ctx);

  let patterns = store.successPatterns;

  // Filter by task type if specified
  if (args.taskType) {
    patterns = patterns.filter(
      (p) =>
        p.context.toLowerCase().includes(args.taskType!.toLowerCase()) ||
        args.taskType!.toLowerCase().includes(p.context.toLowerCase()),
    );
  }

  // Filter by minimum frequency
  patterns = patterns.filter((p) => p.frequency >= args.minFrequency);

  // Sort by frequency and applicability
  patterns.sort((a, b) => {
    const scoreA = a.frequency * a.applicability;
    const scoreB = b.frequency * b.applicability;
    return scoreB - scoreA;
  });

  // Generate analysis
  const totalUses = patterns.reduce((sum, p) => sum + p.frequency, 0);
  const analysis = `Found ${patterns.length} success patterns with ${totalUses} total uses`;

  // Generate applicability guide
  const applicabilityGuide: string[] = [];
  for (const pattern of patterns.slice(0, 5)) {
    applicabilityGuide.push(
      `${pattern.pattern}: Apply in ${pattern.context} contexts (${pattern.applicability * 100}% success rate)`,
    );
  }

  return {
    patterns,
    analysis,
    applicabilityGuide,
  };
}

export const successPatternExtractorTool: ToolDefinition<SuccessPatternExtractorArgs> =
  {
    name: "success_pattern_extractor",
    description:
      "Extract and analyze patterns from successful task executions to inform future strategies.",
    inputSchema: SuccessPatternExtractorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await executeSuccessPatternExtractor(args, ctx);

      const lines = [
        `# Success Pattern Extractor`,
        ``,
        `**Analysis:** ${result.analysis}`,
        ``,
      ];

      if (result.patterns.length > 0) {
        lines.push(`## Top Success Patterns`);
        for (const pattern of result.patterns.slice(0, 5)) {
          lines.push(`### ${pattern.pattern}`);
          lines.push(`- Frequency: ${pattern.frequency}x`);
          lines.push(`- Context: ${pattern.context}`);
          lines.push(`- Applicability: ${pattern.applicability * 100}%`);
          lines.push("");
        }
      }

      if (result.applicabilityGuide.length > 0) {
        lines.push(`## Applicability Guide`);
        for (const guide of result.applicabilityGuide) {
          lines.push(`- ${guide}`);
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Success Patterns">${result.patterns.length} patterns extracted</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// 7. Adaptive Threshold Learner (67)
// ============================================================================

const AdaptiveThresholdLearnerArgs = z.object({
  metric: z.string().describe("Metric to adapt threshold for"),
  currentValue: z.number().describe("Current observed value"),
  targetValue: z.number().describe("Target value for the metric"),
  adaptationMode: z
    .enum(["conservative", "balanced", "aggressive"])
    .default("balanced"),
});

type AdaptiveThresholdLearnerArgs = z.infer<
  typeof AdaptiveThresholdLearnerArgs
>;

async function executeAdaptiveThresholdLearner(
  args: AdaptiveThresholdLearnerArgs,
  ctx: AgentContext,
): Promise<{
  threshold: ThresholdConfig;
  adjusted: boolean;
  reason: string;
}> {
  const store = loadLearningStore(ctx);

  // Find or create threshold config
  let threshold = store.thresholds.find((t) => t.metric === args.metric);

  if (!threshold) {
    threshold = {
      metric: args.metric,
      current: args.currentValue,
      target: args.targetValue,
      adaptationRate: 0.1,
      lastUpdated: new Date().toISOString(),
    };
    store.thresholds.push(threshold);
  }

  // Calculate adaptation rate based on mode
  let adaptationRate: number;
  switch (args.adaptationMode) {
    case "conservative":
      adaptationRate = 0.05;
      break;
    case "aggressive":
      adaptationRate = 0.2;
      break;
    default:
      adaptationRate = 0.1;
  }

  // Adjust threshold based on current vs target
  const gap = args.targetValue - args.currentValue;
  const adjusted = Math.abs(gap) > 0.01;

  let reason: string;
  if (adjusted) {
    // Move threshold toward target
    threshold.current += gap * adaptationRate;
    threshold.adaptationRate = adaptationRate;
    threshold.lastUpdated = new Date().toISOString();

    if (gap > 0) {
      reason = `Increased threshold by ${(gap * adaptationRate).toFixed(4)} toward target`;
    } else {
      reason = `Decreased threshold by ${(Math.abs(gap) * adaptationRate).toFixed(4)} toward target`;
    }
  } else {
    reason = "Threshold is within acceptable range of target";
  }

  // Update thresholds in store
  const index = store.thresholds.findIndex((t) => t.metric === args.metric);
  if (index >= 0) {
    store.thresholds[index] = threshold;
  }

  saveLearningStore(ctx, store);

  return {
    threshold,
    adjusted,
    reason,
  };
}

export const adaptiveThresholdLearnerTool: ToolDefinition<AdaptiveThresholdLearnerArgs> =
  {
    name: "adaptive_threshold_learner",
    description:
      "Learn and adapt thresholds for various metrics based on performance data and targets.",
    inputSchema: AdaptiveThresholdLearnerArgs,
    defaultConsent: "always",
    modifiesState: true,

    execute: async (args, ctx) => {
      const result = await executeAdaptiveThresholdLearner(args, ctx);

      const lines = [
        `# Adaptive Threshold Learner`,
        ``,
        `**Metric:** ${args.metric}`,
        `**Current Threshold:** ${result.threshold.current.toFixed(4)}`,
        `**Target:** ${args.targetValue}`,
        `**Adjusted:** ${result.adjusted}`,
        ``,
        `**Reason:** ${result.reason}`,
      ];

      ctx.onXmlComplete(
        `<dyad-status title="Threshold Updated">${args.metric}</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// 8. Reward Calculator (68)
// ============================================================================

const RewardCalculatorArgs = z.object({
  outcome: z.enum(["success", "failure", "partial"]).describe("Task outcome"),
  metrics: z.record(z.number()).describe("Performance metrics"),
  effort: z.number().describe("Effort expended (time or steps)"),
  baselineReward: z.number().default(0).describe("Baseline reward value"),
});

type RewardCalculatorArgs = z.infer<typeof RewardCalculatorArgs>;

async function executeRewardCalculator(
  args: RewardCalculatorArgs,
  ctx: AgentContext,
): Promise<{
  totalReward: number;
  breakdown: Record<string, number>;
  explanation: string;
}> {
  // Calculate reward based on outcome and metrics
  let baseReward: number;
  switch (args.outcome) {
    case "success":
      baseReward = 100;
      break;
    case "partial":
      baseReward = 50;
      break;
    default:
      baseReward = 0;
  }

  // Add metric bonuses
  const breakdown: Record<string, number> = {
    base: baseReward,
  };

  // Efficiency bonus (less effort = higher reward)
  const efficiencyThreshold = 1000; // ms
  if (args.effort < efficiencyThreshold) {
    const efficiencyBonus =
      ((efficiencyThreshold - args.effort) / efficiencyThreshold) * 20;
    breakdown.efficiency = efficiencyBonus;
    baseReward += efficiencyBonus;
  }

  // Metric-specific bonuses
  for (const [metric, value] of Object.entries(args.metrics)) {
    if (metric.includes("accuracy") || metric.includes("score")) {
      const numValue = typeof value === "number" ? value : 0;
      const bonus = numValue * 30;
      breakdown[metric] = bonus;
      baseReward += bonus;
    }
  }

  // Apply baseline
  const totalReward = baseReward + args.baselineReward;

  // Generate explanation
  let explanation = `Reward calculated for ${args.outcome} outcome`;
  if (breakdown.efficiency) {
    explanation += " with efficiency bonus";
  }

  return {
    totalReward,
    breakdown,
    explanation,
  };
}

export const rewardCalculatorTool: ToolDefinition<RewardCalculatorArgs> = {
  name: "reward_calculator",
  description:
    "Calculate rewards for reinforcement learning based on task outcomes and performance metrics.",
  inputSchema: RewardCalculatorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await executeRewardCalculator(args, ctx);

    const lines = [
      `# Reward Calculator`,
      ``,
      `**Outcome:** ${args.outcome}`,
      `**Total Reward:** ${result.totalReward.toFixed(2)}`,
      ``,
      `## Breakdown`,
    ];

    for (const [key, value] of Object.entries(result.breakdown)) {
      lines.push(`- ${key}: ${value.toFixed(2)}`);
    }

    lines.push("");
    lines.push(`**Explanation:** ${result.explanation}`);

    ctx.onXmlComplete(
      `<dyad-status title="Reward Calculated">${result.totalReward.toFixed(2)} points</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// ============================================================================
// 9. Policy Updater (69)
// ============================================================================

const PolicyUpdaterArgs = z.object({
  rules: z
    .array(
      z.object({
        condition: z.string(),
        action: z.string(),
        priority: z.number(),
        confidence: z.number(),
        source: z.enum(["learned", "default", "manual"]),
      }),
    )
    .describe("Policy rules to add or update"),
  mergeStrategy: z.enum(["replace", "add", "update"]).default("add"),
});

type PolicyUpdaterArgs = z.infer<typeof PolicyUpdaterArgs>;

async function executePolicyUpdater(
  args: PolicyUpdaterArgs,
  ctx: AgentContext,
): Promise<{
  updated: boolean;
  rulesCount: number;
  changes: string[];
}> {
  const store = loadLearningStore(ctx);

  const changes: string[] = [];

  for (const rule of args.rules) {
    // Check if rule already exists
    const existingIndex = store.policies.findIndex(
      (p) => p.condition === rule.condition && p.action === rule.action,
    );

    if (args.mergeStrategy === "replace" && existingIndex >= 0) {
      store.policies[existingIndex] = rule;
      changes.push(`Replaced rule: ${rule.condition} -> ${rule.action}`);
    } else if (args.mergeStrategy === "update" && existingIndex >= 0) {
      // Update only if new confidence is higher
      if (rule.confidence > store.policies[existingIndex].confidence) {
        store.policies[existingIndex] = rule;
        changes.push(`Updated rule: ${rule.condition} -> ${rule.action}`);
      } else {
        changes.push("Kept existing rule (higher confidence)");
      }
    } else {
      // Add new rule
      store.policies.push(rule);
      changes.push(`Added new rule: ${rule.condition} -> ${rule.action}`);
    }
  }

  // Sort by priority
  store.policies.sort((a, b) => b.priority - a.priority);

  // Keep only top 100 policies
  if (store.policies.length > 100) {
    store.policies = store.policies.slice(0, 100);
  }

  saveLearningStore(ctx, store);

  return {
    updated: true,
    rulesCount: store.policies.length,
    changes,
  };
}

export const policyUpdaterTool: ToolDefinition<PolicyUpdaterArgs> = {
  name: "policy_updater",
  description:
    "Update decision-making policies based on learned patterns and outcomes.",
  inputSchema: PolicyUpdaterArgs,
  defaultConsent: "always",
  modifiesState: true,

  execute: async (args, ctx) => {
    const result = await executePolicyUpdater(args, ctx);

    const lines = [
      `# Policy Updater`,
      ``,
      `**Updated:** ${result.updated}`,
      `**Total Rules:** ${result.rulesCount}`,
      ``,
      `## Changes`,
    ];

    for (const change of result.changes) {
      lines.push(`- ${change}`);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Policy Updated">${result.rulesCount} rules</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// ============================================================================
// 10. Self-Correction Engine (70)
// ============================================================================

const SelfCorrectionEngineArgs = z.object({
  error: z.string().describe("Error or issue detected"),
  context: z.string().describe("Context where error occurred"),
  attempts: z.number().default(1).describe("Number of previous attempts"),
  maxRetries: z.number().default(3).describe("Maximum retry attempts"),
});

type SelfCorrectionEngineArgs = z.infer<typeof SelfCorrectionEngineArgs>;

async function executeSelfCorrectionEngine(
  args: SelfCorrectionEngineArgs,
  ctx: AgentContext,
): Promise<{
  correction: CorrectionAction;
  reasoning: string;
  appliedPatterns: string[];
}> {
  const store = loadLearningStore(ctx);

  // Determine correction strategy based on error and context
  let correction: CorrectionAction;
  let reasoning: string;

  // Check for known solutions in error patterns
  const knownError = store.errorPatterns.find(
    (p) =>
      args.error.toLowerCase().includes(p.pattern.toLowerCase()) ||
      p.pattern.toLowerCase().includes(args.error.toLowerCase()),
  );

  if (knownError && args.attempts < args.maxRetries) {
    // Retry with learned solution
    correction = {
      type: "retry",
      reason: `Known pattern: ${knownError.pattern}. Applying learned solution: ${knownError.solution}`,
      parameters: {
        pattern: knownError.pattern,
        solution: knownError.solution,
      },
    };
    reasoning = `Found known solution for error pattern: ${knownError.pattern}`;
  } else if (args.attempts >= args.maxRetries) {
    // Too many retries, abort
    correction = {
      type: "abort",
      reason: "Maximum retry attempts reached",
      parameters: {
        attempts: args.attempts,
        maxRetries: args.maxRetries,
      },
    };
    reasoning = "Exceeded maximum retry attempts, switching to abort strategy";
  } else if (store.successPatterns.length > 0) {
    // Try alternate approach from success patterns
    correction = {
      type: "alternate",
      reason: "Attempting alternative approach from successful patterns",
      parameters: {
        fallbackPatterns: store.successPatterns
          .slice(0, 3)
          .map((p) => p.pattern),
      },
    };
    reasoning = "Attempting alternate approach from successful patterns";
  } else {
    // Refine and retry
    correction = {
      type: "refine",
      reason: "Refining approach based on error context",
      parameters: {
        error: args.error,
        context: args.context,
      },
    };
    reasoning = "Applying refinement strategy";
  }

  // Track applied patterns
  const appliedPatterns: string[] = [];
  if (knownError) {
    appliedPatterns.push(knownError.pattern);
  }

  return {
    correction,
    reasoning,
    appliedPatterns,
  };
}

export const selfCorrectionEngineTool: ToolDefinition<SelfCorrectionEngineArgs> =
  {
    name: "self_correction_engine",
    description:
      "Automatically detect and correct errors using learned patterns and adaptive strategies.",
    inputSchema: SelfCorrectionEngineArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await executeSelfCorrectionEngine(args, ctx);

      const lines = [
        `# Self-Correction Engine`,
        ``,
        `**Error:** ${args.error}`,
        `**Context:** ${args.context}`,
        `**Attempt:** ${args.attempts}/${args.maxRetries}`,
        ``,
        `## Correction`,
        `**Type:** ${result.correction.type}`,
        `**Reason:** ${result.correction.reason}`,
        ``,
        `**Reasoning:** ${result.reasoning}`,
      ];

      if (result.appliedPatterns.length > 0) {
        lines.push("");
        lines.push(
          `**Applied Patterns:** ${result.appliedPatterns.join(", ")}`,
        );
      }

      ctx.onXmlComplete(
        `<dyad-status title="Self-Correction">${result.correction.type} strategy applied</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// ============================================================================
// Export all tools
// ============================================================================

export const selfImprovingReasoningTools = {
  learningFeedbackLoopTool,
  performanceEvaluationTool,
  strategyRefinementTool,
  knowledgeUpdaterTool,
  errorPatternLearnerTool,
  successPatternExtractorTool,
  adaptiveThresholdLearnerTool,
  rewardCalculatorTool,
  policyUpdaterTool,
  selfCorrectionEngineTool,
};
