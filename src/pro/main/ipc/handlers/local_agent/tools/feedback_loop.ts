/**
 * Feedback Loop Tool
 * Capabilities 221-240: User feedback collection and processing
 * - User feedback collection and processing
 * - Implicit feedback inference from outcomes
 * - Explicit rating system integration
 * - Feedback-to-improvement pipeline
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

const FeedbackLoopArgs = z.object({
  /** Action to perform */
  action: z
    .enum([
      "collect_explicit",
      "collect_implicit",
      "get_feedback",
      "analyze_trends",
      "get_improvements",
      "clear",
    ])
    .describe("Action: collect explicit/implicit feedback, get feedback, analyze trends, or get improvements"),
  /** Task identifier for the feedback */
  taskId: z.string().optional().describe("Task identifier"),
  /** User rating (1-5) */
  rating: z.number().min(1).max(5).optional().describe("User rating (1-5 scale)"),
  /** Optional feedback text */
  feedback: z.string().optional().describe("User feedback text"),
  /** Feedback category */
  category: z
    .enum([
      "quality",
      "speed",
      "accuracy",
      "helpfulness",
      "correctness",
      "other",
    ])
    .optional()
    .describe("Feedback category"),
  /** Execution outcome for implicit feedback */
  outcome: z
    .enum(["success", "partial", "failed"])
    .optional()
    .describe("Execution outcome for implicit feedback"),
  /** Number of recent feedbacks to analyze */
  limit: z.number().optional().describe("Number of recent feedbacks to return"),
  /** Time range for analysis */
  timeRange: z.string().optional().describe("Time range for analysis (24h, 7d, 30d, all)"),
});

type FeedbackLoopArgs = z.infer<typeof FeedbackLoopArgs>;

// ============================================================================
// Types
// ============================================================================

interface FeedbackRecord {
  id: string;
  taskId: string;
  type: "explicit" | "implicit";
  rating?: number;
  feedback?: string;
  category?: string;
  outcome?: "success" | "partial" | "failed";
  timestamp: string;
  context?: Record<string, unknown>;
}

interface FeedbackTrends {
  averageRating: number;
  totalFeedback: number;
  explicitCount: number;
  implicitCount: number;
  byCategory: Record<string, { count: number; avgRating?: number }>;
  recentTrend: { date: string; avgRating: number; count: number }[];
}

interface ImprovementSuggestion {
  category: string;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

// ============================================================================
// Storage Functions
// ============================================================================

function getFeedbackFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "feedback.json");
}

function loadFeedback(ctx: AgentContext): FeedbackRecord[] {
  const filePath = getFeedbackFilePath(ctx);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveFeedback(ctx: AgentContext, feedback: FeedbackRecord[]): void {
  const filePath = getFeedbackFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(feedback, null, 2), "utf-8");
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeTrends(feedback: FeedbackRecord[], timeRange?: string): FeedbackTrends {
  const now = new Date();
  let cutoffTime: Date;

  switch (timeRange) {
    case "24h":
      cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      cutoffTime = new Date(0);
  }

  const filtered = feedback.filter((f) => new Date(f.timestamp) >= cutoffTime);

  const withRatings = filtered.filter((f) => f.rating !== undefined);
  const averageRating =
    withRatings.length > 0
      ? withRatings.reduce((sum, f) => sum + (f.rating || 0), 0) / withRatings.length
      : 0;

  const explicitCount = filtered.filter((f) => f.type === "explicit").length;
  const implicitCount = filtered.filter((f) => f.type === "implicit").length;

  // By category
  const byCategory: Record<string, { count: number; totalRating: number }> = {};
  for (const f of filtered) {
    const cat = f.category || "other";
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, totalRating: 0 };
    }
    byCategory[cat].count++;
    if (f.rating) {
      byCategory[cat].totalRating += f.rating;
    }
  }

  const categoryResults: Record<string, { count: number; avgRating?: number }> = {};
  for (const [cat, data] of Object.entries(byCategory)) {
    categoryResults[cat] = {
      count: data.count,
      avgRating: data.count > 0 ? Math.round((data.totalRating / data.count) * 10) / 10 : undefined,
    };
  }

  // Recent trend (by day)
  const dayData: Record<string, { total: number; count: number }> = {};
  for (const f of withRatings) {
    const day = f.timestamp.split("T")[0];
    if (!dayData[day]) {
      dayData[day] = { total: 0, count: 0 };
    }
    dayData[day].total += f.rating || 0;
    dayData[day].count++;
  }

  const recentTrend = Object.entries(dayData)
    .map(([date, data]) => ({
      date,
      avgRating: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalFeedback: filtered.length,
    explicitCount,
    implicitCount,
    byCategory: categoryResults,
    recentTrend,
  };
}

function generateImprovements(feedback: FeedbackRecord[]): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  // Analyze ratings
  const withRatings = feedback.filter((f) => f.rating !== undefined);
  if (withRatings.length > 0) {
    const lowRated = withRatings.filter((f) => (f.rating || 0) <= 2);
    if (lowRated.length >= 3) {
      const categories = lowRated.map((f) => f.category).filter(Boolean);
      if (categories.length > 0) {
        suggestions.push({
          category: "quality",
          issue: `${lowRated.length} low-rated feedbacks detected`,
          suggestion: "Review and improve the quality of responses in affected categories",
          priority: "high",
        });
      }
    }
  }

  // Analyze failed outcomes
  const failedImplicit = feedback.filter(
    (f) => f.type === "implicit" && f.outcome === "failed",
  );
  if (failedImplicit.length >= 3) {
    suggestions.push({
      category: "correctness",
      issue: `${failedImplicit.length} failed executions detected`,
      suggestion: "Analyze failure patterns and implement error handling improvements",
      priority: "high",
    });
  }

  // Check for partial success
  const partialImplicit = feedback.filter(
    (f) => f.type === "implicit" && f.outcome === "partial",
  );
  if (partialImplicit.length >= 2) {
    suggestions.push({
      category: "accuracy",
      issue: `${partialImplicit.length} partially successful executions`,
      suggestion: "Review partial success cases to identify incomplete implementations",
      priority: "medium",
    });
  }

  // Speed feedback
  const speedFeedback = feedback.filter((f) => f.category === "speed" && (f.rating || 0) <= 2);
  if (speedFeedback.length > 0) {
    suggestions.push({
      category: "speed",
      issue: "Speed-related complaints detected",
      suggestion: "Optimize execution paths and caching strategies",
      priority: "medium",
    });
  }

  // Helpfulness
  const helpfulFeedback = feedback.filter(
    (f) => f.category === "helpfulness" && (f.rating || 0) <= 2,
  );
  if (helpfulFeedback.length > 0) {
    suggestions.push({
      category: "helpfulness",
      issue: "Helpfulness concerns detected",
      suggestion: "Improve clarity and comprehensiveness of responses",
      priority: "medium",
    });
  }

  return suggestions;
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeFeedbackAction(
  args: FeedbackLoopArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, taskId, rating, feedback, category, outcome, limit, timeRange } = args;

  switch (action) {
    case "collect_explicit": {
      if (!taskId) {
        throw new Error("taskId is required for explicit feedback");
      }

      const feedbackList = loadFeedback(ctx);
      const record: FeedbackRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId,
        type: "explicit",
        rating,
        feedback,
        category,
        timestamp: new Date().toISOString(),
      };

      feedbackList.push(record);

      // Keep only last 500 records
      if (feedbackList.length > 500) {
        feedbackList.splice(0, feedbackList.length - 500);
      }

      saveFeedback(ctx, feedbackList);

      ctx.onXmlStream(
        `<dyad-status title="Feedback">Collected explicit feedback for: ${escapeXmlAttr(taskId)}</dyad-status>`,
      );

      const msg = `Feedback recorded: ${taskId} - Rating: ${rating || "N/A"}/5`;
      ctx.onXmlComplete(
        `<dyad-status title="Feedback Collected">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "collect_implicit": {
      if (!taskId || !outcome) {
        throw new Error("taskId and outcome are required for implicit feedback");
      }

      const feedbackList = loadFeedback(ctx);
      const record: FeedbackRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId,
        type: "implicit",
        outcome,
        timestamp: new Date().toISOString(),
      };

      // Infer rating from outcome
      if (outcome === "success") {
        record.rating = 5;
      } else if (outcome === "partial") {
        record.rating = 3;
      } else {
        record.rating = 1;
      }

      feedbackList.push(record);

      // Keep only last 500 records
      if (feedbackList.length > 500) {
        feedbackList.splice(0, feedbackList.length - 500);
      }

      saveFeedback(ctx, feedbackList);

      ctx.onXmlStream(
        `<dyad-status title="Implicit Feedback">Recorded: ${escapeXmlAttr(taskId)} - ${outcome}</dyad-status>`,
      );

      const msg = `Implicit feedback recorded: ${taskId} - Outcome: ${outcome} (inferred rating: ${record.rating}/5)`;
      ctx.onXmlComplete(
        `<dyad-status title="Implicit Feedback">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "get_feedback": {
      const feedbackList = loadFeedback(ctx);
      let results = feedbackList;

      // Filter by task ID if provided
      if (taskId) {
        results = results.filter((f) => f.taskId.includes(taskId));
      }

      // Sort by timestamp descending
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      if (limit) {
        results = results.slice(0, limit);
      }

      ctx.onXmlStream(
        `<dyad-status title="Feedback">Found ${results.length} feedback records</dyad-status>`,
      );

      if (results.length === 0) {
        const msg = "No feedback found";
        ctx.onXmlComplete(
          `<dyad-status title="Feedback">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const formatted = results
        .map(
          (f) =>
            `- ${f.type === "explicit" ? "⭐".repeat(f.rating || 0) : f.outcome} ${f.taskId} - ${f.category || "general"} - ${f.timestamp}`,
        )
        .join("\n");

      const resultMsg = `Feedback (${results.length}):\n${formatted}`;
      ctx.onXmlComplete(
        `<dyad-status title="Feedback">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "analyze_trends": {
      const feedbackList = loadFeedback(ctx);
      const trends = analyzeTrends(feedbackList, timeRange);

      ctx.onXmlStream(
        `<dyad-status title="Feedback Analysis">Analyzing feedback trends...</dyad-status>`,
      );

      const lines = [
        "# Feedback Trends",
        "",
        `**Average Rating:** ${trends.averageRating}/5`,
        `**Total Feedback:** ${trends.totalFeedback}`,
        `- Explicit: ${trends.explicitCount}`,
        `- Implicit: ${trends.implicitCount}`,
        "",
      ];

      if (Object.keys(trends.byCategory).length > 0) {
        lines.push("## By Category");
        for (const [cat, data] of Object.entries(trends.byCategory)) {
          const ratingStr = data.avgRating ? ` (avg: ${data.avgRating}/5)` : "";
          lines.push(`- ${cat}: ${data.count} feedback${ratingStr}`);
        }
        lines.push("");
      }

      if (trends.recentTrend.length > 0) {
        lines.push("## Recent Trend");
        for (const { date, avgRating, count } of trends.recentTrend) {
          lines.push(`- ${date}: ${avgRating}/5 (${count} feedbacks)`);
        }
      }

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Feedback Analysis">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_improvements": {
      const feedbackList = loadFeedback(ctx);
      const improvements = generateImprovements(feedbackList);

      ctx.onXmlStream(
        `<dyad-status title="Improvements">Generating improvement suggestions...</dyad-status>`,
      );

      if (improvements.length === 0) {
        const msg = "No improvement suggestions at this time";
        ctx.onXmlComplete(
          `<dyad-status title="Improvements">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const lines = ["# Improvement Suggestions", ""];
      for (const imp of improvements) {
        const priorityIcon = imp.priority === "high" ? "🔴" : imp.priority === "medium" ? "🟡" : "🟢";
        lines.push(`## ${priorityIcon} ${imp.category}`);
        lines.push(`- **Issue:** ${imp.issue}`);
        lines.push(`- **Suggestion:** ${imp.suggestion}`);
        lines.push("");
      }

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Improvements">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "clear": {
      saveFeedback(ctx, []);
      const msg = "Feedback data cleared";
      ctx.onXmlComplete(
        `<dyad-status title="Feedback">${escapeXmlContent(msg)}</dyad-status>`,
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

export const feedbackLoopTool: ToolDefinition<FeedbackLoopArgs> = {
  name: "feedback_loop",
  description:
    "Collect and process user feedback for continuous improvement. Supports both explicit ratings and implicit feedback inferred from execution outcomes. Analyze feedback trends and get actionable improvement suggestions.",
  inputSchema: FeedbackLoopArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    switch (args.action) {
      case "collect_explicit":
        return `Collect explicit feedback: ${args.taskId} (rating: ${args.rating})`;
      case "collect_implicit":
        return `Collect implicit feedback: ${args.taskId} (outcome: ${args.outcome})`;
      case "get_feedback":
        return `Get feedback for: ${args.taskId || "all tasks"}`;
      case "analyze_trends":
        return `Analyze feedback trends`;
      case "get_improvements":
        return `Get improvement suggestions`;
      case "clear":
        return `Clear feedback data`;
      default:
        return `Feedback action: ${args.action}`;
    }
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-feedback action="${escapeXmlAttr(args.action)}">`;
    if (args.taskId) {
      xml += escapeXmlContent(args.taskId);
    }
    if (isComplete) {
      xml += "</dyad-feedback>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Feedback Loop">Processing ${args.action}...</dyad-status>`,
    );

    const result = await executeFeedbackAction(args, ctx);
    return result;
  },
};
