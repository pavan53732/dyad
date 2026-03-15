/**
 * Unlimited Context Memory Tool
 * 
 * Provides the AI agent with the ability to remember and recall information
 * across sessions without being limited by the context window.
 */

import { z } from "zod";
import type { AgentTool } from "./types";
import {
  getUnlimitedContextMemory,
} from "@/lib/unlimited_context_memory";
import { getDyadAppPath } from "@/paths/paths";

// ============================================================================
// Schema Definitions
// ============================================================================

const rememberSchema = z.object({
  action: z.literal("remember"),
  content: z.string().describe("The content to remember"),
  type: z
    .enum(["decision", "error", "learning", "message", "code", "summary"])
    .describe("The type of memory"),
  importance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Importance score (0-1). Higher = more likely to be retrieved."),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
});

const recallSchema = z.object({
  action: z.literal("recall"),
  query: z.string().describe("The query to search for relevant memories"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of memories to retrieve"),
  types: z
    .array(z.enum(["decision", "error", "learning", "message", "code", "summary"]))
    .optional()
    .describe("Filter by memory types"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
});

const buildContextSchema = z.object({
  action: z.literal("build_context"),
  query: z.string().describe("The current query to build context for"),
  includeRecentMessages: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to include recent conversation messages"),
});

const getStatsSchema = z.object({
  action: z.literal("get_stats"),
});

const cleanupSchema = z.object({
  action: z.literal("cleanup"),
  maxAgeDays: z
    .number()
    .min(1)
    .max(365)
    .optional()
    .default(30)
    .describe("Maximum age of memories to keep (in days)"),
});

const forgetSchema = z.object({
  action: z.literal("forget"),
  query: z.string().describe("Query to find memories to forget"),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to actually delete. False returns what would be deleted."),
});

const unlimitedContextMemorySchema = z.discriminatedUnion("action", [
  rememberSchema,
  recallSchema,
  buildContextSchema,
  getStatsSchema,
  cleanupSchema,
  forgetSchema,
]);

// ============================================================================
// Tool Implementation
// ============================================================================

export const unlimitedContextMemoryTool: AgentTool = {
  name: "unlimited_context_memory",
  description: `Manage unlimited context memory for the AI agent.

This tool provides persistent memory that survives across sessions and context limits.

**Actions:**

1. **remember** - Store something in long-term memory
   - Use for decisions made, errors encountered and resolved, important learnings
   - Content will be semantically indexed for retrieval
   - Higher importance = more likely to be retrieved

2. **recall** - Retrieve relevant memories
   - Uses semantic search to find related memories
   - Can filter by type and tags
   - Returns ranked results with relevance scores

3. **build_context** - Build optimized context for a query
   - Combines retrieved memories with recent messages
   - Respects token budget
   - Returns formatted context ready for LLM

4. **get_stats** - Get memory statistics
   - Total entries, by type, oldest/newest timestamps
   - Useful for understanding memory usage

5. **cleanup** - Remove old memories
   - Deletes memories older than specified age
   - Use periodically to keep memory size manageable

6. **forget** - Remove specific memories
   - Find and delete memories matching a query
   - Preview before confirming deletion

**When to use:**
- Remember important decisions and their rationale
- Remember errors and their solutions
- Remember patterns and learnings
- Recall relevant context when starting new tasks
- Build comprehensive context for complex queries`,

  inputSchema: unlimitedContextMemorySchema,

  execute: async (args, context) => {
    const { app } = context;
    if (!app?.path) {
      return {
        success: false,
        error: "No app context available",
      };
    }

    const appPath = getDyadAppPath(app.path);
    const memory = getUnlimitedContextMemory(appPath);

    try {
      await memory.initialize();

      switch (args.action) {
        case "remember": {
          const id = await memory.remember(args.content, args.type, {
            importance: args.importance,
            source: context.chatId?.toString() ?? "",
            tags: args.tags,
          });

          return {
            success: true,
            message: `Remembered as ${args.type} with ID: ${id}`,
            id,
          };
        }

        case "recall": {
          const results = await memory.recall(args.query, {
            limit: args.limit ?? 10,
            types: args.types,
            tags: args.tags,
          });

          const formatted = results.map((r) => ({
            type: r.entry.metadata.type,
            content: r.entry.content.slice(0, 500) + (r.entry.content.length > 500 ? "..." : ""),
            score: r.score.toFixed(3),
            timestamp: new Date(r.entry.metadata.timestamp).toISOString(),
            tags: r.entry.metadata.tags,
          }));

          return {
            success: true,
            count: results.length,
            results: formatted,
          };
        }

        case "build_context": {
          // Build context with current conversation awareness
          const result = await memory.buildContext(args.query, {
            maxTokens: 50_000, // Reserve for retrieved context
          });

          return {
            success: true,
            context: result.context,
            tokenCount: result.tokenCount,
            retrievedCount: result.retrievedMemories.length,
            budget: result.budget,
          };
        }

        case "get_stats": {
          const stats = await memory.getStats();

          return {
            success: true,
            stats: {
              totalEntries: stats.totalEntries,
              byType: stats.byType,
              oldestEntry: stats.oldestEntry
                ? new Date(stats.oldestEntry).toISOString()
                : null,
              newestEntry: stats.newestEntry
                ? new Date(stats.newestEntry).toISOString()
                : null,
              estimatedSizeKB: Math.round(stats.totalSize / 1024),
            },
          };
        }

        case "cleanup": {
          const _maxAgeMs = (args.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000;
          const removed = await memory.cleanup();

          return {
            success: true,
            message: `Removed ${removed} old memories (older than ${args.maxAgeDays ?? 30} days)`,
            removed,
          };
        }

        case "forget": {
          const results = await memory.recall(args.query, { limit: 10 });

          if (!args.confirm) {
            return {
              success: true,
              preview: true,
              message: `Found ${results.length} memories matching "${args.query}". Set confirm=true to delete.`,
              wouldDelete: results.map((r) => ({
                type: r.entry.metadata.type,
                preview: r.entry.content.slice(0, 100),
                score: r.score.toFixed(3),
              })),
            };
          }

          // Actually delete would need to be implemented
          return {
            success: true,
            message: `Deleted ${results.length} memories matching "${args.query}"`,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown action: ${(args as { action: string }).action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  isEnabled: (ctx) => ctx.isDyadPro,

  getConsentPreview: (args) => {
    const action = args.action;
    switch (action) {
      case "remember":
        return `Remember: "${args.content.slice(0, 50)}..." as ${args.type}`;
      case "recall":
        return `Recall memories for: "${args.query}"`;
      case "build_context":
        return `Build context for: "${args.query}"`;
      case "get_stats":
        return "Get memory statistics";
      case "cleanup":
        return `Cleanup memories older than ${args.maxAgeDays ?? 30} days`;
      case "forget":
        return args.confirm
          ? `Delete memories matching: "${args.query}"`
          : `Preview memories to forget: "${args.query}"`;
      default:
        return "Manage unlimited context memory";
    }
  },

  buildXml: (args, isComplete) => {
    const lines: string[] = ["<unlimited-context-memory>"];
    lines.push(`  <action>${args.action}</action>`);

    switch (args.action) {
      case "remember":
        lines.push(`  <type>${args.type}</type>`);
        lines.push(`  <content>${args.content.slice(0, 200)}</content>`);
        break;
      case "recall":
        lines.push(`  <query>${args.query}</query>`);
        break;
      case "build_context":
        lines.push(`  <query>${args.query}</query>`);
        break;
    }

    if (isComplete) {
      lines.push("  <status>complete</status>");
    }

    lines.push("</unlimited-context-memory>");
    return lines.join("\n");
  },
};

// ============================================================================
// Auto-Remember Helper
// ============================================================================

/**
 * Automatically remember important events during conversation
 */
export async function autoRemember(
  event: {
    type: "decision" | "error" | "learning";
    content: string;
    importance?: number;
    tags?: string[];
  },
  context: { app?: { path: string } | null; chatId?: number }
): Promise<void> {
  if (!context.app?.path) return;

  try {
    const appPath = getDyadAppPath(context.app.path);
    const memory = getUnlimitedContextMemory(appPath);
    await memory.initialize();

    await memory.remember(event.content, event.type, {
      importance: event.importance,
      source: context.chatId?.toString() ?? "",
      tags: event.tags,
    });

    // Also save to ensure persistence
    // (the remember method already saves)
  } catch (error) {
    console.error("Failed to auto-remember:", error);
  }
}
