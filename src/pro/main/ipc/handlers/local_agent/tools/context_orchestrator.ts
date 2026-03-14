/**
 * Context Orchestrator Tool
 * Capabilities 31-40: Manages token budget, context compression, prioritization
 * - Token budget allocation
 * - Context compression system
 * - Priority-based context ranking
 * - Context deduplication
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const ContextOrchestratorArgs = z.object({
  /** Available context items to manage */
  contextItems: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      type: z.enum([
        "system_prompt",
        "user_message",
        "assistant_message",
        "code_file",
        "tool_result",
        "documentation",
        "error_log",
        "test_result",
      ]),
      importance: z.number().min(0).max(1).default(0.5),
      recency: z.number().min(0).max(1).default(1), // 0 = old, 1 = recent
      tokenCount: z.number().optional(),
    }),
  ),
  /** Maximum total tokens available */
  maxTokens: z.number().min(1000).max(128000).default(32000),
  /** Target token budget after optimization */
  targetTokens: z.number().min(500).optional(),
  /** Whether to compress context */
  enableCompression: z.boolean().default(true),
  /** Whether to deduplicate context */
  enableDeduplication: z.boolean().default(true),
  /** Whether to rank and prioritize */
  enableRanking: z.boolean().default(true),
  /** Minimum importance threshold (0-1) */
  minImportanceThreshold: z.number().min(0).max(1).default(0.1),
});

type ContextOrchestratorArgs = z.infer<typeof ContextOrchestratorArgs>;

// ============================================================================
// Types
// ============================================================================

/** Context item with computed scores */
interface ScoredContextItem {
  id: string;
  content: string;
  type: ContextOrchestratorArgs["contextItems"][number]["type"];
  importance: number;
  recency: number;
  tokenCount: number;
  relevanceScore: number;
  compressionRatio: number;
  isDuplicate: boolean;
  duplicateOf?: string;
}

/** Optimization recommendation */
interface OptimizationRecommendation {
  type: "compress" | "remove" | "keep" | "summarize";
  itemId: string;
  reason: string;
  estimatedTokensSaved: number;
  newContent?: string;
}

/** Token budget allocation */
interface TokenBudget {
  totalAvailable: number;
  usedByCategory: Record<string, number>;
  remaining: number;
  recommendations: OptimizationRecommendation[];
}

/** Deduplication result */
interface DeduplicationResult {
  uniqueItems: ScoredContextItem[];
  duplicates: { id: string; duplicateOf: string; similarity: number }[];
  tokensSaved: number;
}

/** Context ranking result */
interface RankingResult {
  rankedItems: ScoredContextItem[];
  categoryBudgets: Record<string, number>;
  totalTokens: number;
}

/** Complete orchestrator result */
interface OrchestratorResult {
  originalItemCount: number;
  originalTokenCount: number;
  finalItemCount: number;
  finalTokenCount: number;
  tokenReduction: number;
  budget: TokenBudget;
  deduplication: DeduplicationResult;
  ranking: RankingResult;
  compression: {
    enabled: boolean;
    itemsCompressed: number;
    tokensSaved: number;
  };
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Token estimation: roughly 4 characters per token */
const CHARS_PER_TOKEN = 4;

/** Priority weights for different context types */
const TYPE_PRIORITY_WEIGHTS: Record<string, number> = {
  system_prompt: 1.0,
  user_message: 0.95,
  assistant_message: 0.7,
  code_file: 0.85,
  tool_result: 0.6,
  documentation: 0.5,
  error_log: 0.8,
  test_result: 0.65,
};

/** Maximum tokens per type (as percentage of total) */
const TYPE_TOKEN_LIMITS: Record<string, number> = {
  system_prompt: 0.15,
  user_message: 0.25,
  assistant_message: 0.2,
  code_file: 0.3,
  tool_result: 0.1,
  documentation: 0.1,
  error_log: 0.1,
  test_result: 0.1,
};

// ============================================================================
// Utility Functions
// ============================================================================

/** Estimate token count from text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Calculate similarity between two strings (simple Jaccard) */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/** Calculate relevance score based on importance and recency */
function calculateRelevanceScore(
  importance: number,
  recency: number,
  type: string,
): number {
  const typeWeight = TYPE_PRIORITY_WEIGHTS[type] || 0.5;

  // Weighted formula: recency matters more for recent items
  return importance * 0.4 + recency * 0.4 + typeWeight * 0.2;
}

/** Determine if content can be compressed */
function canCompress(type: string): boolean {
  const compressibleTypes = [
    "assistant_message",
    "tool_result",
    "documentation",
    "test_result",
  ];
  return compressibleTypes.includes(type);
}

/** Generate compression summary for content */
function compressContent(
  content: string,
  targetTokens: number,
): { compressed: string; ratio: number } {
  const currentTokens = estimateTokens(content);

  if (currentTokens <= targetTokens) {
    return { compressed: content, ratio: 1 };
  }

  // Simple compression: truncate and add summary
  const ratio = targetTokens / currentTokens;
  const charsToKeep = Math.floor(content.length * ratio * 0.8); // Keep 80% of target

  // Find a good break point (end of sentence or paragraph)
  let breakPoint = charsToKeep;
  const breakPatterns = [". ", "\n\n", "\n", ". ", "! ", "? "];

  for (const pattern of breakPatterns) {
    const lastBreak = content.lastIndexOf(pattern, charsToKeep);
    if (lastBreak > charsToKeep * 0.5) {
      breakPoint = lastBreak + pattern.length;
      break;
    }
  }

  const truncated = content.substring(0, breakPoint);
  const summary = `\n\n[... ${currentTokens - targetTokens} tokens truncated ...]`;

  return {
    compressed: truncated + summary,
    ratio,
  };
}

// ============================================================================
// Main Orchestration Logic
// ============================================================================

async function orchestrateContext(
  args: ContextOrchestratorArgs,
  _ctx: AgentContext,
): Promise<OrchestratorResult> {
  const {
    contextItems,
    maxTokens,
    targetTokens,
    enableCompression,
    enableDeduplication,
    enableRanking,
    minImportanceThreshold,
  } = args;

  const warnings: string[] = [];
  let totalOriginalTokens = 0;
  let totalFinalTokens = 0;

  // Step 1: Add token counts to items
  const scoredItems: ScoredContextItem[] = contextItems.map((item) => {
    const tokenCount = item.tokenCount || estimateTokens(item.content);
    totalOriginalTokens += tokenCount;

    return {
      id: item.id,
      content: item.content,
      type: item.type,
      importance: item.importance,
      recency: item.recency,
      tokenCount,
      relevanceScore: calculateRelevanceScore(
        item.importance,
        item.recency,
        item.type,
      ),
      compressionRatio: 1,
      isDuplicate: false,
    };
  });

  // Step 2: Deduplication
  let deduplicationResult: DeduplicationResult;
  if (enableDeduplication && scoredItems.length > 1) {
    const duplicates: {
      id: string;
      duplicateOf: string;
      similarity: number;
    }[] = [];
    const uniqueItems: ScoredContextItem[] = [];
    let tokensSaved = 0;

    for (const item of scoredItems) {
      let foundDuplicate = false;

      for (const unique of uniqueItems) {
        const similarity = calculateSimilarity(item.content, unique.content);

        // Consider duplicate if > 80% similar
        if (similarity > 0.8) {
          duplicates.push({
            id: item.id,
            duplicateOf: unique.id,
            similarity,
          });
          item.isDuplicate = true;
          item.duplicateOf = unique.id;
          tokensSaved += item.tokenCount;
          foundDuplicate = true;
          break;
        }
      }

      if (!foundDuplicate) {
        uniqueItems.push(item);
      }
    }

    deduplicationResult = {
      uniqueItems,
      duplicates,
      tokensSaved,
    };
  } else {
    deduplicationResult = {
      uniqueItems: scoredItems,
      duplicates: [],
      tokensSaved: 0,
    };
  }

  const itemsAfterDedup = deduplicationResult.uniqueItems;
  totalFinalTokens = itemsAfterDedup.reduce((sum, i) => sum + i.tokenCount, 0);

  // Step 3: Filter by importance threshold
  const filteredItems = itemsAfterDedup.filter(
    (item) =>
      item.importance >= minImportanceThreshold ||
      item.type === "system_prompt",
  );

  if (filteredItems.length < itemsAfterDedup.length) {
    warnings.push(
      `Removed ${itemsAfterDedup.length - filteredItems.length} items below importance threshold`,
    );
  }

  // Step 4: Ranking and token budget allocation
  let rankedItems: ScoredContextItem[];
  let categoryBudgets: Record<string, number>;

  if (enableRanking) {
    // Sort by relevance score
    const sorted = [...filteredItems].sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );

    // Allocate budget by category
    categoryBudgets = {};
    const remainingBudget = maxTokens - deduplicationResult.tokensSaved;

    for (const [type, limit] of Object.entries(TYPE_TOKEN_LIMITS)) {
      categoryBudgets[type] = Math.floor(remainingBudget * limit);
    }

    // Assign tokens respecting category limits
    rankedItems = [];
    let totalAssigned = 0;

    for (const item of sorted) {
      const typeLimit = categoryBudgets[item.type] || 0;
      const availableForType =
        typeLimit -
        rankedItems
          .filter((i) => i.type === item.type)
          .reduce((sum, i) => sum + i.tokenCount, 0);

      if (
        item.tokenCount <= availableForType ||
        item.type === "system_prompt"
      ) {
        rankedItems.push(item);
        totalAssigned += item.tokenCount;
      } else if (item.importance > 0.7) {
        // High importance items that exceed limit - mark for compression
        rankedItems.push(item);
      }
    }

    // Check if still over budget
    if (totalAssigned > maxTokens) {
      // Remove lowest priority items until within budget
      rankedItems = rankedItems
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, Math.ceil((rankedItems.length * maxTokens) / totalAssigned));
    }

    totalFinalTokens = rankedItems.reduce((sum, i) => sum + i.tokenCount, 0);
  } else {
    rankedItems = filteredItems;
    categoryBudgets = {};
    totalFinalTokens = rankedItems.reduce((sum, i) => sum + i.tokenCount, 0);
  }

  // Step 5: Compression (if needed and enabled)
  let tokensSavedByCompression = 0;
  let itemsCompressed = 0;

  if (
    enableCompression &&
    totalFinalTokens > (targetTokens || maxTokens * 0.9)
  ) {
    const target = targetTokens || Math.floor(maxTokens * 0.9);
    let currentTotal = rankedItems.reduce((sum, i) => sum + i.tokenCount, 0);

    // Sort by least compressible first (keep code files, system prompts)
    const compressibleFirst = [...rankedItems].sort((a, b) => {
      const aCanCompress = canCompress(a.type) ? 1 : 0;
      const bCanCompress = canCompress(b.type) ? 1 : 0;
      return aCanCompress - bCanCompress;
    });

    const compressedItems: ScoredContextItem[] = [];

    for (const item of compressibleFirst) {
      if (currentTotal <= target) break;

      if (canCompress(item.type)) {
        const availableSaving = currentTotal - target;
        const targetItemTokens = Math.max(
          item.tokenCount - availableSaving,
          Math.floor(item.tokenCount * 0.3), // Never compress below 30%
        );

        const { compressed, ratio } = compressContent(
          item.content,
          targetItemTokens,
        );

        compressedItems.push({
          ...item,
          content: compressed,
          tokenCount: estimateTokens(compressed),
          compressionRatio: ratio,
        });

        tokensSavedByCompression +=
          item.tokenCount - estimateTokens(compressed);
        itemsCompressed++;
        currentTotal -= item.tokenCount - estimateTokens(compressed);
      } else {
        compressedItems.push(item);
      }
    }

    // Add remaining items
    const compressedIds = new Set(compressedItems.map((i) => i.id));
    for (const item of rankedItems) {
      if (!compressedIds.has(item.id)) {
        compressedItems.push(item);
      }
    }

    rankedItems = compressedItems;
    totalFinalTokens = rankedItems.reduce((sum, i) => sum + i.tokenCount, 0);
  }

  // Step 6: Generate optimization recommendations
  const recommendations: OptimizationRecommendation[] = [];

  // Compression recommendations
  for (const item of rankedItems) {
    if (item.compressionRatio < 1 && canCompress(item.type)) {
      recommendations.push({
        type: "compress",
        itemId: item.id,
        reason: `Can reduce by ${Math.round((1 - item.compressionRatio) * 100)}%`,
        estimatedTokensSaved: Math.round(
          item.tokenCount * (1 - item.compressionRatio),
        ),
        newContent: item.content,
      });
    }
  }

  // Removal recommendations for low-importance items
  for (const item of deduplicationResult.duplicates) {
    recommendations.push({
      type: "remove",
      itemId: item.id,
      reason: `Duplicate of ${item.duplicateOf} (${Math.round(item.similarity * 100)}% similar)`,
      estimatedTokensSaved:
        scoredItems.find((i) => i.id === item.id)?.tokenCount || 0,
    });
  }

  // Build budget
  const usedByCategory: Record<string, number> = {};
  for (const item of rankedItems) {
    usedByCategory[item.type] =
      (usedByCategory[item.type] || 0) + item.tokenCount;
  }

  const budget: TokenBudget = {
    totalAvailable: maxTokens,
    usedByCategory,
    remaining: maxTokens - totalFinalTokens,
    recommendations,
  };

  // Check for warnings
  if (totalFinalTokens > maxTokens) {
    warnings.push(
      `Final token count (${totalFinalTokens}) exceeds budget (${maxTokens}). Consider increasing maxTokens or reducing context.`,
    );
  }

  if (rankedItems.filter((i) => i.type === "system_prompt").length === 0) {
    warnings.push("No system prompt in context - may affect model behavior");
  }

  return {
    originalItemCount: contextItems.length,
    originalTokenCount: totalOriginalTokens,
    finalItemCount: rankedItems.length,
    finalTokenCount: totalFinalTokens,
    tokenReduction: Math.round(
      ((totalOriginalTokens - totalFinalTokens) / totalOriginalTokens) * 100,
    ),
    budget,
    deduplication: {
      ...deduplicationResult,
      uniqueItems: rankedItems, // Return ranked items as unique
    },
    ranking: {
      rankedItems,
      categoryBudgets,
      totalTokens: totalFinalTokens,
    },
    compression: {
      enabled: enableCompression,
      itemsCompressed,
      tokensSaved: tokensSavedByCompression,
    },
    warnings,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateOrchestratorXml(result: OrchestratorResult): string {
  const lines: string[] = [
    `# Context Orchestration Result`,
    ``,
    `**Original:** ${result.originalItemCount} items, ${result.originalTokenCount} tokens`,
    `**Final:** ${result.finalItemCount} items, ${result.finalTokenCount} tokens`,
    `**Reduction:** ${result.tokenReduction}%`,
    ``,
  ];

  // Warnings
  if (result.warnings.length > 0) {
    lines.push(`## ⚠️ Warnings`);
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push(``);
  }

  // Token budget by category
  lines.push(`## Token Budget`);
  lines.push(`- Total Available: ${result.budget.totalAvailable}`);
  lines.push(`- Remaining: ${result.budget.remaining}`);
  lines.push(`- By Category:`);
  for (const [category, tokens] of Object.entries(
    result.budget.usedByCategory,
  )) {
    lines.push(`  - ${category}: ${tokens}`);
  }
  lines.push(``);

  // Deduplication
  if (result.deduplication.duplicates.length > 0) {
    lines.push(`## Deduplication`);
    lines.push(`- Duplicates found: ${result.deduplication.duplicates.length}`);
    lines.push(`- Tokens saved: ${result.deduplication.tokensSaved}`);
    lines.push(``);
  }

  // Compression
  if (result.compression.enabled && result.compression.itemsCompressed > 0) {
    lines.push(`## Compression`);
    lines.push(`- Items compressed: ${result.compression.itemsCompressed}`);
    lines.push(`- Tokens saved: ${result.compression.tokensSaved}`);
    lines.push(``);
  }

  // Top ranked items
  lines.push(`## Ranked Context (Top 10)`);
  for (const item of result.ranking.rankedItems.slice(0, 10)) {
    const indicator = item.isDuplicate
      ? "🔄"
      : item.compressionRatio < 1
        ? "📦"
        : "✅";
    lines.push(
      `${indicator} [${item.type}] ${item.tokenCount}t (relevance: ${(item.relevanceScore * 100).toFixed(0)}%)`,
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const contextOrchestratorTool: ToolDefinition<ContextOrchestratorArgs> =
  {
    name: "context_orchestrator",
    description:
      "Manages token budget allocation, context compression, priority-based ranking, and deduplication for AI context windows. Use this to optimize context before sending to LLMs.",
    inputSchema: ContextOrchestratorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Context Orchestrator">Optimizing context...</dyad-status>`,
      );

      const result = await orchestrateContext(args, ctx);

      const report = generateOrchestratorXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Context Orchestration Complete">${result.tokenReduction}% reduction (${result.originalTokenCount} → ${result.finalTokenCount} tokens)</dyad-status>`,
      );

      return report;
    },
  };
