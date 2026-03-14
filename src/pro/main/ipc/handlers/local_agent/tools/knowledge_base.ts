/**
 * Knowledge Base Tool
 * Capabilities 261-280: Persistent knowledge storage
 * - Persistent knowledge storage
 * - Learned patterns and solutions
 * - Cross-session knowledge retention
 * - Knowledge retrieval and indexing
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

const KnowledgeBaseArgs = z.object({
  /** Action to perform */
  action: z
    .enum([
      "add",
      "search",
      "get",
      "update",
      "delete",
      "list",
      "list_tags",
      "get_stats",
      "clear",
    ])
    .describe("Action: add, search, get, update, delete, list, list_tags, get_stats, or clear"),
  /** Knowledge entry key/identifier */
  key: z.string().optional().describe("Unique key/identifier for the knowledge entry"),
  /** Knowledge content/value */
  value: z.string().optional().describe("Knowledge content to store"),
  /** Tags for categorization */
  tags: z.array(z.string()).optional().describe("Tags for the knowledge entry"),
  /** Category for the entry */
  category: z
    .enum([
      "pattern",
      "solution",
      "best_practice",
      "learned_error",
      "configuration",
      "workflow",
      "other",
    ])
    .optional()
    .describe("Category of knowledge"),
  /** Search query */
  query: z.string().optional().describe("Search query for finding knowledge"),
  /** Tags to filter by */
  filterTags: z.array(z.string()).optional().describe("Filter by tags"),
  /** Category to filter by */
  filterCategory: z.string().optional().describe("Filter by category"),
  /** Number of results to return */
  limit: z.number().optional().describe("Number of results to return"),
});

type KnowledgeBaseArgs = z.infer<typeof KnowledgeBaseArgs>;

// ============================================================================
// Types
// ============================================================================

interface KnowledgeEntry {
  key: string;
  value: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessed: string;
  relatedKeys: string[];
}

interface KnowledgeStats {
  totalEntries: number;
  byCategory: Record<string, number>;
  byTag: Record<string, number>;
  mostAccessed: { key: string; accessCount: number }[];
}

// ============================================================================
// Storage Functions
// ============================================================================

function getKnowledgeFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "knowledge_base.json");
}

function loadKnowledge(ctx: AgentContext): KnowledgeEntry[] {
  const filePath = getKnowledgeFilePath(ctx);
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

function saveKnowledge(ctx: AgentContext, knowledge: KnowledgeEntry[]): void {
  const filePath = getKnowledgeFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(knowledge, null, 2), "utf-8");
}

// ============================================================================
// Search and Indexing
// ============================================================================

function searchKnowledge(
  knowledge: KnowledgeEntry[],
  query: string,
  filterTags?: string[],
  filterCategory?: string,
  limit?: number,
): KnowledgeEntry[] {
  let results = knowledge;

  // Filter by tags
  if (filterTags && filterTags.length > 0) {
    results = results.filter((entry) =>
      filterTags.some((tag) => entry.tags.includes(tag)),
    );
  }

  // Filter by category
  if (filterCategory) {
    results = results.filter((entry) => entry.category === filterCategory);
  }

  // Search in key, value, and tags
  if (query) {
    const queryLower = query.toLowerCase();
    results = results.filter(
      (entry) =>
        entry.key.toLowerCase().includes(queryLower) ||
        entry.value.toLowerCase().includes(queryLower) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(queryLower)),
    );
  }

  // Sort by relevance (access count as proxy)
  results.sort((a, b) => b.accessCount - a.accessCount);

  // Apply limit
  if (limit) {
    results = results.slice(0, limit);
  }

  return results;
}

function getStats(knowledge: KnowledgeEntry[]): KnowledgeStats {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const entry of knowledge) {
    // Count by category
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;

    // Count by tags
    for (const tag of entry.tags) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  // Most accessed
  const mostAccessed = [...knowledge]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 10)
    .map((e) => ({ key: e.key, accessCount: e.accessCount }));

  return {
    totalEntries: knowledge.length,
    byCategory,
    byTag,
    mostAccessed,
  };
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeKnowledgeAction(
  args: KnowledgeBaseArgs,
  ctx: AgentContext,
): Promise<string> {
  const { action, key, value, tags, category, query, filterTags, filterCategory, limit } = args;

  const knowledge = loadKnowledge(ctx);

  switch (action) {
    case "add": {
      if (!key || !value) {
        throw new Error("key and value are required for add action");
      }

      const existingIndex = knowledge.findIndex((k) => k.key === key);
      const now = new Date().toISOString();

      const entry: KnowledgeEntry = {
        key,
        value,
        tags: tags || [],
        category: category || "other",
        createdAt: existingIndex >= 0 ? knowledge[existingIndex].createdAt : now,
        updatedAt: now,
        accessCount: existingIndex >= 0 ? knowledge[existingIndex].accessCount : 0,
        lastAccessed: now,
        relatedKeys: existingIndex >= 0 ? knowledge[existingIndex].relatedKeys : [],
      };

      if (existingIndex >= 0) {
        knowledge[existingIndex] = entry;
        ctx.onXmlStream(
          `<dyad-status title="Knowledge Base">Updated knowledge: ${escapeXmlAttr(key)}</dyad-status>`,
        );
      } else {
        knowledge.push(entry);
        ctx.onXmlStream(
          `<dyad-status title="Knowledge Base">Added knowledge: ${escapeXmlAttr(key)}</dyad-status>`,
        );
      }

      saveKnowledge(ctx, knowledge);

      const msg = `Knowledge ${existingIndex >= 0 ? "updated" : "added"}: ${key} [${entry.category}]`;
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge ${existingIndex >= 0 ? "Updated" : "Added"}">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "search": {
      if (!query && !filterTags && !filterCategory) {
        throw new Error("query, filterTags, or filterCategory is required for search");
      }

      const results = searchKnowledge(
        knowledge,
        query || "",
        filterTags,
        filterCategory,
        limit || 20,
      );

      ctx.onXmlStream(
        `<dyad-status title="Knowledge Search">Found ${results.length} results</dyad-status>`,
      );

      if (results.length === 0) {
        const msg = "No knowledge entries found matching criteria";
        ctx.onXmlComplete(
          `<dyad-status title="Knowledge Search">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      // Update access counts
      for (const result of results) {
        const entry = knowledge.find((k) => k.key === result.key);
        if (entry) {
          entry.accessCount++;
          entry.lastAccessed = new Date().toISOString();
        }
      }
      saveKnowledge(ctx, knowledge);

      const lines = ["# Knowledge Search Results", ""];
      for (const entry of results) {
        lines.push(`## ${entry.key}`);
        lines.push(`**Category:** ${entry.category}`);
        lines.push(`**Tags:** ${entry.tags.join(", ") || "none"}`);
        lines.push(`**Access Count:** ${entry.accessCount}`);
        lines.push("");
        lines.push(entry.value.substring(0, 200) + (entry.value.length > 200 ? "..." : ""));
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const resultMsg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Found">${results.length} entries found</dyad-status>`,
      );
      return resultMsg;
    }

    case "get": {
      if (!key) {
        throw new Error("key is required for get action");
      }

      const entry = knowledge.find((k) => k.key === key);

      if (!entry) {
        const msg = `Knowledge entry not found: ${key}`;
        ctx.onXmlComplete(
          `<dyad-status title="Knowledge Not Found">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      // Update access count
      entry.accessCount++;
      entry.lastAccessed = new Date().toISOString();
      saveKnowledge(ctx, knowledge);

      ctx.onXmlStream(
        `<dyad-status title="Knowledge Base">Retrieved: ${escapeXmlAttr(key)}</dyad-status>`,
      );

      const lines = [
        `# ${entry.key}`,
        "",
        `**Category:** ${entry.category}`,
        `**Tags:** ${entry.tags.join(", ") || "none"}`,
        `**Created:** ${entry.createdAt}`,
        `**Updated:** ${entry.updatedAt}`,
        `**Access Count:** ${entry.accessCount}`,
        "",
        "## Content",
        "",
        entry.value,
      ];

      if (entry.relatedKeys.length > 0) {
        lines.push("");
        lines.push("## Related");
        lines.push(entry.relatedKeys.join(", "));
      }

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Retrieved">${escapeXmlContent(key)}</dyad-status>`,
      );
      return msg;
    }

    case "update": {
      if (!key) {
        throw new Error("key is required for update action");
      }

      const entry = knowledge.find((k) => k.key === key);

      if (!entry) {
        const msg = `Knowledge entry not found: ${key}`;
        ctx.onXmlComplete(
          `<dyad-status title="Knowledge Update Failed">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      // Update fields
      if (value !== undefined) {
        entry.value = value;
      }
      if (tags) {
        entry.tags = tags;
      }
      if (category) {
        entry.category = category;
      }
      entry.updatedAt = new Date().toISOString();

      saveKnowledge(ctx, knowledge);

      const msg = `Knowledge updated: ${key}`;
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Updated">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "delete": {
      if (!key) {
        throw new Error("key is required for delete action");
      }

      const initialLength = knowledge.length;
      const filtered = knowledge.filter((k) => k.key !== key);

      if (filtered.length === initialLength) {
        const msg = `Knowledge entry not found: ${key}`;
        ctx.onXmlComplete(
          `<dyad-status title="Knowledge Delete Failed">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      saveKnowledge(ctx, filtered);

      const msg = `Knowledge deleted: ${key}`;
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Deleted">${escapeXmlContent(msg)}</dyad-status>`,
      );
      return msg;
    }

    case "list": {
      let results = [...knowledge];

      // Apply filters
      if (filterTags && filterTags.length > 0) {
        results = results.filter((entry) =>
          filterTags.some((tag) => entry.tags.includes(tag)),
        );
      }

      if (filterCategory) {
        results = results.filter((entry) => entry.category === filterCategory);
      }

      // Sort by last updated
      results.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      // Apply limit
      if (limit) {
        results = results.slice(0, limit);
      }

      ctx.onXmlStream(
        `<dyad-status title="Knowledge List">${results.length} entries</dyad-status>`,
      );

      if (results.length === 0) {
        const msg = "No knowledge entries found";
        ctx.onXmlComplete(
          `<dyad-status title="Knowledge List">${escapeXmlContent(msg)}</dyad-status>`,
        );
        return msg;
      }

      const lines = ["# Knowledge Base", "", `Total: ${knowledge.length} entries`, ""];
      for (const entry of results) {
        lines.push(
          `- **${entry.key}** [${entry.category}] (${entry.tags.join(", ") || "no tags"}) - ${entry.updatedAt}`,
        );
      }

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge List">${results.length} entries</dyad-status>`,
      );
      return msg;
    }

    case "list_tags": {
      const tagCounts: Record<string, number> = {};

      for (const entry of knowledge) {
        for (const tag of entry.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }

      const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => `${tag} (${count})`);

      const msg = `Tags (${sortedTags.length}):\n${sortedTags.join("\n")}`;
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Tags">${sortedTags.length} tags</dyad-status>`,
      );
      return msg;
    }

    case "get_stats": {
      const stats = getStats(knowledge);

      const lines = [
        "# Knowledge Base Statistics",
        "",
        `**Total Entries:** ${stats.totalEntries}`,
        "",
        "## By Category",
        "",
      ];

      for (const [cat, count] of Object.entries(stats.byCategory)) {
        lines.push(`- ${cat}: ${count}`);
      }

      lines.push("");
      lines.push("## Top Tags");

      const topTags = Object.entries(stats.byTag)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      for (const [tag, count] of topTags) {
        lines.push(`- ${tag}: ${count}`);
      }

      if (stats.mostAccessed.length > 0) {
        lines.push("");
        lines.push("## Most Accessed");
        for (const { key, accessCount } of stats.mostAccessed.slice(0, 5)) {
          lines.push(`- ${key}: ${accessCount} accesses`);
        }
      }

      const msg = lines.join("\n");
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Stats">${stats.totalEntries} entries</dyad-status>`,
      );
      return msg;
    }

    case "clear": {
      saveKnowledge(ctx, []);
      const msg = "Knowledge base cleared";
      ctx.onXmlComplete(
        `<dyad-status title="Knowledge Base">${escapeXmlContent(msg)}</dyad-status>`,
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

export const knowledgeBaseTool: ToolDefinition<KnowledgeBaseArgs> = {
  name: "knowledge_base",
  description:
    "Persistent knowledge storage for learned patterns, solutions, best practices, and configuration. Store, search, and retrieve knowledge across sessions. Essential for building institutional memory and avoiding repeated mistakes.",
  inputSchema: KnowledgeBaseArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    switch (args.action) {
      case "add":
        return `Add knowledge: ${args.key}`;
      case "search":
        return `Search knowledge: ${args.query}`;
      case "get":
        return `Get knowledge: ${args.key}`;
      case "update":
        return `Update knowledge: ${args.key}`;
      case "delete":
        return `Delete knowledge: ${args.key}`;
      case "list":
        return `List knowledge entries`;
      case "list_tags":
        return `List all tags`;
      case "get_stats":
        return `Get knowledge stats`;
      case "clear":
        return `Clear knowledge base`;
      default:
        return `Knowledge base: ${args.action}`;
    }
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-knowledge action="${escapeXmlAttr(args.action)}">`;
    if (args.key) {
      xml += escapeXmlContent(args.key);
    }
    if (isComplete) {
      xml += "</dyad-knowledge>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Knowledge Base">Processing ${args.action}...</dyad-status>`,
    );

    const result = await executeKnowledgeAction(args, ctx);
    return result;
  },
};
