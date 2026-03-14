/**
 * Adaptive Strategy Tool
 * Capabilities 241-260: Strategy selection based on context
 * - Strategy selection based on context
 * - Performance-based strategy adjustment
 * - Multi-strategy comparison and selection
 * - Strategy effectiveness learning
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

const AdaptiveStrategyArgs = z.object({
  /** Action to perform */
  action: z
    .enum([
      "select",
      "record_performance",
      "compare",
      "get_recommendation",
      "adjust_strategy",
      "list_strategies",
      "clear",
    ])
    .describe("Action: select strategy, record performance, compare, get recommendation, adjust, list, or clear"),
  /** Task type for strategy selection */
  taskType: z
    .enum([
      "code_generation",
      "code_review",
      "bug_fix",
      "refactoring",
      "testing",
      "documentation",
      "architecture",
      "planning",
      "debugging",
      "general",
    ])
    .optional()
    .describe("Type of task for strategy selection"),
  /** Current context/description of the task */
  context: z.string().optional().describe("Task context or description"),
  /** Strategy to use */
  strategy: z
    .enum([
      "conservative",
      "aggressive",
      "iterative",
      "comprehensive",
      "minimal",
      "experimental",
    ])
    .optional()
    .describe("Strategy name"),
  /** Performance metrics */
  performance: z
    .object({
      success: z.boolean(),
      duration: z.number(),
      quality: z.number().min(0).max(10).optional(),
      userSatisfaction: z.number().min(0).max(5).optional(),
    })
    .optional()
    .describe("Performance metrics for the strategy"),
  /** Number of strategies to compare */
  limit: z.number().optional().describe("Number of strategies to return in comparisons"),
});

type AdaptiveStrategyArgs = z.infer<typeof AdaptiveStrategyArgs>;

// ============================================================================
// Types
// ============================================================================

interface StrategyRecord {
  name: string;
  taskType: string;
  useCount: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  avgQuality: number;
  avgUserSatisfaction: number;
  lastUsed: string;
  effectiveness: number;
}

interface StrategyComparison {
  taskType: string;
  strategies: {
    name: string;
    useCount: number;
    successRate: number;
    avgDuration: number;
    effectiveness: number;
  }[];
  recommendation: string;
}

interface StrategyRecommendation {
  recommendedStrategy: string;
  reason: string;
  alternatives: string[];
  confidence: number;
  historicalData: {
    taskType: string;
    bestStrategy: string;
    successRate: number;
  };
}

// ============================================================================
// Storage Functions
// ============================================================================

function getStrategyFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "adaptive_strategies.json");
}

function loadStrategies(ctx: AgentContext): StrategyRecord[] {
  const filePath = getStrategyFilePath(ctx);
  if (!fs.existsSync(filePath)) {
    return getDefaultStrategies();
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return getDefaultStrategies();
  }
}

function saveStrategies(ctx: AgentContext, strategies: StrategyRecord[]): void {
  const filePath = getStrategyFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(strategies, null, 2), "utf-8");
}

function getDefaultStrategies(): StrategyRecord[] {
  const taskTypes = [
    "code_generation",
    "code_review",
    "bug_fix",
    "refactoring",
    "testing",
    "documentation",
    "architecture",
    "planning",
    "debugging",
    "general",
  ];

  const strategies = ["conservative", "aggressive", "iterative", "comprehensive", "minimal", "experimental"];
  const defaults: StrategyRecord[] = [];

  for (const taskType of taskTypes) {
    for (const strategy of strategies) {
      defaults.push({
        name: strategy,
        taskType,
        useCount: 0,
        successCount: 0,
        failureCount: 0,
        totalDuration: 0,
        avgQuality: 5,
        avgUserSatisfaction: 3,
        lastUsed: "",
        effectiveness: 0.5,
      });
    }
  }

  return defaults;
}

// ============================================================================
// Strategy Selection Logic
// ============================================================================

function selectStrategy(
  strategies: StrategyRecord[],
  taskType: string,
  _context?: string,
): StrategyRecommendation {
  // Filter strategies for this task type
  const taskStrategies = strategies.filter((s) => s.taskType === taskType);

  if (taskStrategies.length === 0) {
    return {
      recommendedStrategy: "iterative",
      reason: "No historical data, defaulting to iterative approach",
      alternatives: ["conservative", "comprehensive"],
      confidence: 0.3,
      historicalData: {
        taskType,
        bestStrategy: "iterative",
        successRate: 0.5,
      },
    };
  }

  // Score each strategy based on multiple factors
  const scored = taskStrategies.map((s) => {
    let score = 0;

    // Success rate weight (40%)
    const successRate = s.useCount > 0 ? s.successCount / s.useCount : 0.5;
    score += successRate * 40;

    // Usage count bonus (15%) - prefer proven strategies
    const usageScore = Math.min(s.useCount / 10, 1) * 15;
    score += usageScore;

    // Recency bonus (15%) - prefer recently successful strategies
    const daysSinceLastUse = s.lastUsed
      ? (Date.now() - new Date(s.lastUsed).getTime()) / (1000 * 60 * 60 * 24)
      : 30;
    const recencyScore = Math.max(0, 15 - daysSinceLastUse / 2);
    score += recencyScore;

    // Quality bonus (15%)
    score += (s.avgQuality / 10) * 15;

    // User satisfaction (15%)
    score += (s.avgUserSatisfaction / 5) * 15;

    return { ...s, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored[1];

  // Determine confidence based on data amount
  const totalUses = taskStrategies.reduce((sum, s) => sum + s.useCount, 0);
  const confidence = Math.min(0.5 + (totalUses / 50) * 0.5, 0.95);

  return {
    recommendedStrategy: best.name,
    reason: `Strategy "${best.name}" has ${(best.successCount / Math.max(1, best.useCount) * 100).toFixed(0)}% success rate with ${best.useCount} uses`,
    alternatives: secondBest ? [secondBest.name] : [],
    confidence,
    historicalData: {
      taskType,
      bestStrategy: best.name,
      successRate: best.useCount > 0 ? best.successCount / best.useCount : 0,
    },
  };
}

function compareStrategies(
  strategies: StrategyRecord[],
  taskType: string,
  limit?: number,
): StrategyComparison {
  const taskStrategies = strategies.filter((s) => s.taskType === taskType);

  const comparison = taskStrategies.map((s) => ({
    name: s.name,
    useCount: s.useCount,
    successRate: s.useCount > 0 ? Math.round((s.successCount / s.useCount) * 100) / 100 : 0,
    avgDuration: s.useCount > 0 ? Math.round(s.totalDuration / s.useCount) : 0,
    effectiveness: s.effectiveness,
  }));

  comparison.sort((a, b) => b.effectiveness - a.effectiveness);

  const limited = limit ? comparison.slice(0, limit) : comparison;

  // Generate recommendation
  const best = limited[0];
  const recommendation = best
    ? `Best strategy for ${taskType}: "${best.name}" with ${(best.successRate * 100).toFixed(0)}% success rate`
    : `No data available for ${taskType}`;

  return {
    taskType,
    strategies: limited,
    recommendation,
  };
}

function adjustStrategy(
  strategies: StrategyRecord[],
  strategy: string,
  taskType: string,
  performance: {
    success: boolean;
    duration: number;
    quality?: number;
    userSatisfaction?: number;
  },
): StrategyRecord[] {
  // Find or create the strategy record
  let record = strategies.find((s) => s.name === strategy && s.taskType === taskType);

  if (!record) {
    record = {
      name: strategy,
      taskType,
      useCount: 0,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0,
      avgQuality: 5,
      avgUserSatisfaction: 3,
      lastUsed: "",
      effectiveness: 0.5,
    };
    strategies.push(record);
  }

  // Update counts
  record.useCount++;
  if (performance.success) {
    record.successCount++;
  } else {
    record.failureCount++;
  }

  // Update duration
  record.totalDuration += performance.duration;

  // Update quality (exponential moving average)
  if (performance.quality !== undefined) {
    record.avgQuality = record.avgQuality * 0.7 + performance.quality * 0.3;
  }

  // Update user satisfaction (exponential moving average)
  if (performance.userSatisfaction !== undefined) {
    record.avgUserSatisfaction =
      record.avgUserSatisfaction * 0.7 + performance.userSatisfaction * 0.3;
  }

  // Update last used
  record.lastUsed = new Date().toISOString();

  // Recalculate effectiveness
  const successRate = record.useCount > 0 ? record.successCount / record.useCount : 0;
  const qualityScore = record.avgQuality / 10;
  const satisfactionScore = record.avgUserSatisfaction / 5;
  record.effectiveness = Math.round((successRate * 0.5 + qualityScore * 0.25 + satisfactionScore * 0.25) * 100) / 100;

  return strategies;
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeStrategyAction(
  args: AdaptiveStrategyArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, taskType, context, strategy, performance, limit } = args;

  const strategies = loadStrategies(ctx);

  switch (action) {
    case "select": {
      if (!taskType) {
        throw new Error("taskType is required for select action");
      }

      const rec = selectStrategy(strategies, taskType, context);

      ctx.onXmlStream(
        `<dyad-status title="Strategy Selection">Selected: ${escapeXmlAttr(rec.recommendedStrategy)}</dyad-status>`,
      );

      const lines = [
        `# Strategy Recommendation`,
        "",
        `**Recommended:** ${rec.recommendedStrategy}`,
        `**Confidence:** ${(rec.confidence * 100).toFixed(0)}%`,
        `**Reason:** ${rec.reason}`,
        "",
      ];

      if (rec.alternatives.length > 0) {
        lines.push(`**Alternatives:** ${rec.alternatives.join(", ")}`);
        lines.push("");
      }

      lines.push("## Historical Data");
      lines.push(`- Best for ${rec.historicalData.taskType}: ${rec.historicalData.bestStrategy}`);
      lines.push(`- Success rate: ${(rec.historicalData.successRate * 100).toFixed(0)}%`);

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Strategy Selected">${escapeXmlContent(rec.recommendedStrategy)} (${(rec.confidence * 100).toFixed(0)}% confidence)</dyad-status>`,
      );
      return msg;
    }

    case "record_performance": {
      if (!strategy || !taskType || !performance) {
        throw new Error("strategy, taskType, and performance are required");
      }

      const updated = adjustStrategy(strategies, strategy, taskType, performance);
      saveStrategies(ctx, updated);

      ctx.onXmlStream(
        `<dyad-status title="Performance">Recorded for ${strategy} on ${taskType}</dyad-status>`,
      );

      const rec = selectStrategy(updated, taskType);
      const msg = `Performance recorded: ${strategy} on ${taskType} - ${performance.success ? "Success" : "Failed"}. Recommended: ${rec.recommendedStrategy}`;
      ctx.onXmlComplete(
        `<dyad-status title="Performance Recorded">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "compare": {
      if (!taskType) {
        throw new Error("taskType is required for compare action");
      }

      const comp = compareStrategies(strategies, taskType, limit);

      ctx.onXmlStream(
        `<dyad-status title="Strategy Comparison">Comparing ${comp.strategies.length} strategies</dyad-status>`,
      );

      const lines = [
        `# Strategy Comparison: ${taskType}`,
        "",
        comp.recommendation,
        "",
        "## Details",
        "",
      ];

      for (const s of comp.strategies) {
        lines.push(`### ${s.name}`);
        lines.push(`- Uses: ${s.useCount}`);
        lines.push(`- Success Rate: ${(s.successRate * 100).toFixed(0)}%`);
        lines.push(`- Avg Duration: ${s.avgDuration}ms`);
        lines.push(`- Effectiveness: ${(s.effectiveness * 100).toFixed(0)}%`);
        lines.push("");
      }

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Comparison Complete">${escapeXmlContent(comp.recommendation)}</dyad-status>`,
      );
      return msg;
    }

    case "get_recommendation": {
      if (!taskType) {
        throw new Error("taskType is required for get_recommendation action");
      }

      const rec = selectStrategy(strategies, taskType, context);

      ctx.onXmlStream(
        `<dyad-status title="Recommendation">Getting recommendation for ${taskType}</dyad-status>`,
      );

      const msg = `Strategy: ${rec.recommendedStrategy} (confidence: ${(rec.confidence * 100).toFixed(0)}%)`;
      ctx.onXmlComplete(
        `<dyad-status title="Recommendation">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "adjust_strategy": {
      if (!strategy || !taskType || !performance) {
        throw new Error("strategy, taskType, and performance are required");
      }

      const updated = adjustStrategy(strategies, strategy, taskType, performance);
      saveStrategies(ctx, updated);

      const rec = selectStrategy(updated, taskType);

      ctx.onXmlStream(
        `<dyad-status title="Strategy Adjustment">Adjusted ${strategy}</dyad-status>`,
      );

      const msg = `Strategy adjusted: ${strategy} effectiveness is now ${(updated.find((s) => s.name === strategy && s.taskType === taskType)?.effectiveness || 0) * 100}. Recommended: ${rec.recommendedStrategy}`;
      ctx.onXmlComplete(
        `<dyad-status title="Strategy Adjusted">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "list_strategies": {
      if (!taskType) {
        // List all strategy names grouped by task type
        const taskTypes = [...new Set(strategies.map((s) => s.taskType))];
        const lines = ["# Available Strategies", ""];

        for (const tt of taskTypes) {
          const taskStrats = strategies.filter((s) => s.taskType === tt);
          const names = [...new Set(taskStrats.map((s) => s.name))];
          lines.push(`## ${tt}`);
          lines.push(names.join(", "));
          lines.push("");
        }

        const msg = lines.join("\n");
        ctx.onXmlComplete(
          `<dyad-status title="Strategies">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const taskStrategies = strategies.filter((s) => s.taskType === taskType);
      const uniqueNames = [...new Set(taskStrategies.map((s) => s.name))];

      const lines = [`Strategies for ${taskType}:`, ""];
      for (const name of uniqueNames) {
        lines.push(`- ${name}`);
      }

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Strategies">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "clear": {
      const defaults = getDefaultStrategies();
      saveStrategies(ctx, defaults);
      const msg = "Strategy history cleared, reset to defaults";
      ctx.onXmlComplete(
        `<dyad-status title="Strategies">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const adaptiveStrategyTool: ToolDefinition<AdaptiveStrategyArgs> = {
  name: "adaptive_strategy",
  description:
    "Select and adapt strategies based on task context and historical performance. Choose between conservative, aggressive, iterative, comprehensive, minimal, or experimental approaches. Track performance and get intelligent recommendations.",
  inputSchema: AdaptiveStrategyArgs,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) => {
    switch (args.action) {
      case "select":
        return `Select strategy for: ${args.taskType}`;
      case "record_performance":
        return `Record performance: ${args.strategy} on ${args.taskType}`;
      case "compare":
        return `Compare strategies for: ${args.taskType}`;
      case "get_recommendation":
        return `Get recommendation for: ${args.taskType}`;
      case "adjust_strategy":
        return `Adjust strategy: ${args.strategy}`;
      case "list_strategies":
        return `List strategies for: ${args.taskType || "all"}`;
      case "clear":
        return `Clear strategy history`;
      default:
        return `Strategy action: ${args.action}`;
    }
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-strategy action="${escapeXmlAttr(args.action)}">`;
    if (args.taskType) {
      xml += escapeXmlContent(args.taskType);
    }
    if (isComplete) {
      xml += "</dyad-strategy>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Adaptive Strategy">Processing ${args.action}...</dyad-status>`,
    );

    const result = await executeStrategyAction(args, ctx);
    return result;
  },
};
