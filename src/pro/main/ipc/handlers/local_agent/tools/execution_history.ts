/**
 * Execution History Tool
 * Capabilities 201-220: Track and store execution history
 * - Success/failure rate analysis
 * - Pattern recognition in past tasks
 * - Tool effectiveness scoring
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

const ExecutionHistoryArgs = z.object({
  /** Action to perform */
  action: z
    .enum([
      "record",
      "query",
      "analyze",
      "get_stats",
      "get_tool_effectiveness",
      "clear",
    ])
    .describe("Action: record execution, query history, analyze patterns, get stats, or get tool effectiveness"),
  /** Task/goal identifier */
  taskId: z.string().optional().describe("Unique task identifier"),
  /** Task description */
  taskDescription: z.string().optional().describe("Description of the task"),
  /** Whether the execution was successful */
  success: z.boolean().optional().describe("Whether the execution was successful"),
  /** Error message if failed */
  errorMessage: z.string().optional().describe("Error message if execution failed"),
  /** Tools used during execution */
  toolsUsed: z.array(z.string()).optional().describe("List of tools used"),
  /** Duration in milliseconds */
  duration: z.number().optional().describe("Execution duration in ms"),
  /** Time range for queries (e.g., "24h", "7d", "30d") */
  timeRange: z.string().optional().describe("Time range for queries (24h, 7d, 30d, all)"),
  /** Number of results to return */
  limit: z.number().optional().describe("Number of results to return"),
  /** Tool name for effectiveness queries */
  toolName: z.string().optional().describe("Tool name for effectiveness queries"),
});

type ExecutionHistoryArgs = z.infer<typeof ExecutionHistoryArgs>;

// ============================================================================
// Types
// ============================================================================

interface ExecutionRecord {
  id: string;
  taskId: string;
  taskDescription: string;
  success: boolean;
  errorMessage?: string;
  toolsUsed: string[];
  duration: number;
  timestamp: string;
  patterns?: string[];
}

interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageDuration: number;
  mostUsedTools: { tool: string; count: number }[];
  recentTrends: { date: string; successRate: number; count: number }[];
}

interface ToolEffectiveness {
  tool: string;
  totalUses: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDuration: number;
  patterns: string[];
}

// ============================================================================
// Storage Functions
// ============================================================================

function getHistoryFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "execution_history.json");
}

function loadHistory(ctx: AgentContext): ExecutionRecord[] {
  const filePath = getHistoryFilePath(ctx);
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

function saveHistory(ctx: AgentContext, history: ExecutionRecord[]): void {
  const filePath = getHistoryFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
}

// ============================================================================
// Pattern Recognition
// ============================================================================

function detectPatterns(toolsUsed: string[], success: boolean): string[] {
  const patterns: string[] = [];

  // Pattern: Sequential tool usage
  if (toolsUsed.length > 3) {
    patterns.push("multi_tool_execution");
  }

  // Pattern: File operations
  const fileOps = ["write_file", "edit_file", "delete_file", "read_file"];
  const hasFileOps = toolsUsed.some((t) => fileOps.includes(t));
  if (hasFileOps) {
    patterns.push("file_operations");
  }

  // Pattern: Command execution
  const hasCmd = toolsUsed.includes("execute_command");
  if (hasCmd) {
    patterns.push("command_execution");
  }

  // Pattern: Web operations
  const webOps = ["web_search", "web_fetch", "web_crawl"];
  const hasWebOps = toolsUsed.some((t) => webOps.includes(t));
  if (hasWebOps) {
    patterns.push("web_operations");
  }

  // Pattern: Complex task (many tools or high failure)
  if (!success && toolsUsed.length > 5) {
    patterns.push("complex_task_failure");
  }

  // Pattern: Quick success (fast execution)
  patterns.push(success ? "quick_resolution" : "requires_iteration");

  return patterns;
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeExecutions(history: ExecutionRecord[], timeRange?: string): ExecutionStats {
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
      cutoffTime = new Date(0); // All time
  }

  const filtered = history.filter((r) => new Date(r.timestamp) >= cutoffTime);

  const totalExecutions = filtered.length;
  const successfulExecutions = filtered.filter((r) => r.success).length;
  const failedExecutions = totalExecutions - successfulExecutions;
  const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
  const averageDuration =
    totalExecutions > 0
      ? filtered.reduce((sum, r) => sum + r.duration, 0) / totalExecutions
      : 0;

  // Most used tools
  const toolCounts: Record<string, number> = {};
  for (const record of filtered) {
    for (const tool of record.toolsUsed) {
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
  }
  const mostUsedTools = Object.entries(toolCounts)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent trends (by day)
  const dayCounts: Record<string, { success: number; total: number }> = {};
  for (const record of filtered) {
    const day = record.timestamp.split("T")[0];
    if (!dayCounts[day]) {
      dayCounts[day] = { success: 0, total: 0 };
    }
    dayCounts[day].total++;
    if (record.success) {
      dayCounts[day].success++;
    }
  }
  const recentTrends = Object.entries(dayCounts)
    .map(([date, data]) => ({
      date,
      successRate: data.total > 0 ? data.success / data.total : 0,
      count: data.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  return {
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    successRate: Math.round(successRate * 100) / 100,
    averageDuration: Math.round(averageDuration),
    mostUsedTools,
    recentTrends,
  };
}

function getToolEffectiveness(history: ExecutionRecord[], toolName?: string): ToolEffectiveness[] {
  const toolData: Record<string, { uses: number; success: number; durations: number[]; patterns: Set<string> }> = {};

  for (const record of history) {
    for (const tool of record.toolsUsed) {
      if (!toolData[tool]) {
        toolData[tool] = { uses: 0, success: 0, durations: [], patterns: new Set() };
      }
      toolData[tool].uses++;
      if (record.success) {
        toolData[tool].success++;
      }
      toolData[tool].durations.push(record.duration);
      if (record.patterns) {
        for (const pattern of record.patterns) {
          toolData[tool].patterns.add(pattern);
        }
      }
    }
  }

  const results = Object.entries(toolData)
    .filter(([tool]) => !toolName || tool === toolName)
    .map(([tool, data]) => ({
      tool,
      totalUses: data.uses,
      successCount: data.success,
      failureCount: data.uses - data.success,
      successRate: Math.round((data.success / data.uses) * 100) / 100,
      averageDuration: Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length),
      patterns: Array.from(data.patterns),
    }))
    .sort((a, b) => b.totalUses - a.totalUses);

  return results;
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeHistoryAction(
  args: ExecutionHistoryArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, taskId, taskDescription, success, errorMessage, toolsUsed, duration, timeRange, limit, toolName } = args;

  switch (action) {
    case "record": {
      if (!taskId || taskDescription === undefined) {
        throw new Error("taskId and taskDescription are required for record action");
      }

      const history = loadHistory(ctx);
      const record: ExecutionRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId,
        taskDescription,
        success: success ?? false,
        errorMessage,
        toolsUsed: toolsUsed ?? [],
        duration: duration ?? 0,
        timestamp: new Date().toISOString(),
        patterns: detectPatterns(toolsUsed ?? [], success ?? false),
      };

      history.push(record);

      // Keep only last 1000 records
      if (history.length > 1000) {
        history.splice(0, history.length - 1000);
      }

      saveHistory(ctx, history);

      ctx.onXmlStream(
        `<dyad-status title="Execution History">Recorded: ${escapeXmlAttr(taskId)} - ${success ? "SUCCESS" : "FAILED"}</dyad-status>`,
      );

      const resultMsg = `Execution recorded: ${taskId} - ${success ? "Success" : "Failed"} (${record.patterns?.join(", ") || "no patterns"})`;
      ctx.onXmlComplete(
        `<dyad-status title="Execution Recorded">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "query": {
      const history = loadHistory(ctx);
      let results = history;

      // Filter by task ID if provided
      if (taskId) {
        results = results.filter((r) => r.taskId.includes(taskId));
      }

      // Sort by timestamp descending
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      if (limit) {
        results = results.slice(0, limit);
      }

      ctx.onXmlStream(
        `<dyad-status title="Execution History">Found ${results.length} records</dyad-status>`,
      );

      if (results.length === 0) {
        const msg = "No execution records found";
        ctx.onXmlComplete(
          `<dyad-status title="Execution History">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const formatted = results
        .map(
          (r) =>
            `- ${r.taskId} [${r.success ? "✅" : "❌"}] (${r.toolsUsed.length} tools, ${r.duration}ms) - ${r.timestamp}`,
        )
        .join("\n");

      const resultMsg = `Execution records (${results.length}):\n${formatted}`;
      ctx.onXmlComplete(
        `<dyad-status title="Execution History">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "analyze": {
      const history = loadHistory(ctx);
      const stats = analyzeExecutions(history, timeRange);

      ctx.onXmlStream(
        `<dyad-status title="Execution Analysis">Analyzing ${stats.totalExecutions} executions...</dyad-status>`,
      );

      const lines = [
        "# Execution Analysis",
        "",
        `**Total Executions:** ${stats.totalExecutions}`,
        `**Success Rate:** ${(stats.successRate * 100).toFixed(1)}%`,
        `**Average Duration:** ${stats.averageDuration}ms`,
        "",
        "## Results",
        `- ✅ Successful: ${stats.successfulExecutions}`,
        `- ❌ Failed: ${stats.failedExecutions}`,
        "",
      ];

      if (stats.mostUsedTools.length > 0) {
        lines.push("## Most Used Tools");
        for (const { tool, count } of stats.mostUsedTools.slice(0, 5)) {
          lines.push(`- ${tool}: ${count} uses`);
        }
        lines.push("");
      }

      if (stats.recentTrends.length > 0) {
        lines.push("## Recent Trends");
        for (const { date, successRate, count } of stats.recentTrends) {
          lines.push(`- ${date}: ${(successRate * 100).toFixed(0)}% success (${count} executions)`);
        }
      }

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Analysis Complete">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_stats": {
      const history = loadHistory(ctx);
      const stats = analyzeExecutions(history, timeRange);

      const resultMsg = `Stats: ${stats.totalExecutions} total, ${(stats.successRate * 100).toFixed(1)}% success rate, ${stats.averageDuration}ms avg duration`;
      ctx.onXmlComplete(
        `<dyad-status title="Execution Stats">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "get_tool_effectiveness": {
      const history = loadHistory(ctx);
      const effectiveness = getToolEffectiveness(history, toolName);

      ctx.onXmlStream(
        `<dyad-status title="Tool Effectiveness">Analyzing ${effectiveness.length} tools...</dyad-status>`,
      );

      if (effectiveness.length === 0) {
        const msg = "No tool usage data found";
        ctx.onXmlComplete(
          `<dyad-status title="Tool Effectiveness">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const lines = ["# Tool Effectiveness", ""];
      for (const tool of effectiveness) {
        lines.push(
          `## ${tool.tool}`,
          `- **Uses:** ${tool.totalUses}`,
          `- **Success Rate:** ${(tool.successRate * 100).toFixed(1)}%`,
          `- **Avg Duration:** ${tool.averageDuration}ms`,
          `- **Patterns:** ${tool.patterns.join(", ") || "none"}`,
          "",
        );
      }

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Tool Effectiveness">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "clear": {
      saveHistory(ctx, []);
      const msg = "Execution history cleared";
      ctx.onXmlComplete(
        `<dyad-status title="Execution History">${escapeXmlContent(msg)}</dyad-status>`,
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

export const executionHistoryTool: ToolDefinition<ExecutionHistoryArgs> = {
  name: "execution_history",
  description:
    "Track and analyze execution history. Record task executions, query past tasks, analyze success/failure patterns, and get tool effectiveness scores. Essential for understanding what works and what doesn't.",
  inputSchema: ExecutionHistoryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    switch (args.action) {
      case "record":
        return `Record execution: ${args.taskId}`;
      case "query":
        return `Query execution history`;
      case "analyze":
        return `Analyze execution patterns`;
      case "get_stats":
        return `Get execution statistics`;
      case "get_tool_effectiveness":
        return `Get tool effectiveness for: ${args.toolName || "all tools"}`;
      case "clear":
        return `Clear execution history`;
      default:
        return `Execution history: ${args.action}`;
    }
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-execution-history action="${escapeXmlAttr(args.action)}">`;
    if (args.taskId) {
      xml += escapeXmlContent(args.taskId);
    }
    if (isComplete) {
      xml += "</dyad-execution-history>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Execution History">Processing ${args.action}...</dyad-status>`,
    );

    const result = await executeHistoryAction(args, ctx);
    return result;
  },
};
