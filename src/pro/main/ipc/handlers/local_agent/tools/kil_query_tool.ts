/**
 * Knowledge Integration Layer Query Tool
 *
 * This tool provides unified access to the Knowledge Integration Layer (KIL),
 * allowing the agent to query across multiple knowledge sources:
 * - Code Graph (entities, relationships)
 * - Vector Memory (semantic search)
 * - Dependency Graph (package analysis)
 * - Architecture (decisions, patterns)
 * - Reasoning (traces, insights)
 *
 * Runtime Integration Phase - Task 3
 */

import { z } from "zod";
import type { ToolDefinition } from "./types";
import { escapeXmlAttr, escapeXmlContent } from "./types";
import {
  QueryOrchestrator,
  LearningRepository,
  type KnowledgeSource,
  type KnowledgeQuery,
} from "@/pro/main/knowledge_integration";

// ============================================================================
// Tool Input Schemas
// ============================================================================

const KilQueryInputSchema = z.object({
  query: z.string().describe("The search query to find relevant knowledge"),
  sources: z
    .array(
      z.enum([
        "code_graph",
        "vector_memory",
        "dependency_graph",
        "architecture",
        "reasoning",
      ]),
    )
    .optional()
    .default(["code_graph", "vector_memory"])
    .describe("Knowledge sources to query"),
  entity_types: z
    .array(
      z.enum([
        "function",
        "class",
        "module",
        "file",
        "variable",
        "pattern",
        "decision",
      ]),
    )
    .optional()
    .describe("Types of entities to filter"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum results to return"),
});

const KilQuerySimilarInputSchema = z.object({
  entity_id: z
    .string()
    .describe("The ID of the entity to find similar items for"),
  sources: z
    .array(
      z.enum([
        "code_graph",
        "vector_memory",
        "dependency_graph",
        "architecture",
        "reasoning",
      ]),
    )
    .optional()
    .default(["code_graph", "vector_memory"]),
  limit: z.number().min(1).max(20).optional().default(5),
  min_similarity: z.number().min(0).max(1).optional().default(0.7),
});

const KilGetRecommendationsInputSchema = z.object({
  context: z
    .object({
      problem: z.string().describe("The problem being solved"),
      constraints: z
        .array(z.string())
        .optional()
        .describe("Any constraints to consider"),
      goals: z.array(z.string()).optional().describe("Goals to achieve"),
    })
    .describe("Context for recommendation generation"),
  limit: z.number().min(1).max(10).optional().default(5),
});

const KilRecordDecisionInputSchema = z.object({
  title: z.string().describe("Title of the architecture decision"),
  type: z
    .enum([
      "technology_choice",
      "pattern_selection",
      "structure_change",
      "api_design",
      "data_model",
      "security_decision",
      "performance_optimization",
      "custom",
    ])
    .describe("Type of decision"),
  context: z
    .object({
      problem: z.string(),
      constraints: z.array(z.string()).optional(),
      goals: z.array(z.string()).optional(),
      relevant_paths: z.array(z.string()).optional(),
    })
    .describe("Context in which the decision was made"),
  alternatives: z
    .array(
      z.object({
        name: z.string(),
        pros: z.array(z.string()).optional(),
        cons: z.array(z.string()).optional(),
      }),
    )
    .describe("Alternatives considered"),
  selected_option: z.string().describe("The option that was selected"),
  rationale: z.string().describe("Why this option was chosen"),
  confidence: z.number().min(0).max(1).optional().default(0.8),
});

const KilBuildContextInputSchema = z.object({
  task: z.string().describe("The task to build context for"),
  include_decisions: z.boolean().optional().default(true),
  include_patterns: z.boolean().optional().default(true),
  include_recommendations: z.boolean().optional().default(true),
  max_entities: z.number().min(5).max(50).optional().default(20),
});

// ============================================================================
// KIL Query Tool
// ============================================================================

export const kilQueryTool: ToolDefinition<z.infer<typeof KilQueryInputSchema>> =
  {
    name: "kil_query",
    description: `Query the Knowledge Integration Layer for unified knowledge across code graph, vector memory, architecture decisions, and learned patterns.

This tool searches multiple knowledge sources simultaneously and returns aggregated, relevant results.

Use this tool when you need to:
- Find code entities (functions, classes, modules) by name or semantic similarity
- Search for architecture decisions related to a topic
- Find learned patterns from past successful implementations
- Query across multiple knowledge sources in one call`,
    inputSchema: KilQueryInputSchema,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      try {
        const orchestrator = new QueryOrchestrator();

        const query: KnowledgeQuery = {
          id: `query_${ctx.chatId}_${Date.now()}`,
          appId: ctx.appId,
          query: args.query,
          sources: args.sources as KnowledgeSource[],
          entityTypes: args.entity_types,
          limit: args.limit,
        };

        const result = await orchestrator.query(query);

        if (!result.success) {
          return `<kil-query-error error="${escapeXmlAttr(result.error || "Unknown error")}" />`;
        }

        if (result.entities.length === 0) {
          return `<kil-query-empty query="${escapeXmlAttr(args.query)}" sources="${args.sources.join(", ")}" />`;
        }

        // Format results as XML
        let xml = `<kil-query-results query="${escapeXmlAttr(args.query)}" count="${result.entities.length}">\n`;

        for (const entity of result.entities) {
          xml += `  <entity id="${escapeXmlAttr(entity.id)}" type="${entity.type}" source="${entity.source}" relevance="${entity.metadata.confidence.toFixed(2)}">\n`;
          xml += `    <name>${escapeXmlContent(entity.name)}</name>\n`;
          if (entity.filePath) {
            xml += `    <file>${escapeXmlContent(entity.filePath)}</file>\n`;
          }
          if (entity.description) {
            xml += `    <description>${escapeXmlContent(entity.description)}</description>\n`;
          }
          xml += `  </entity>\n`;
        }

        xml += `</kil-query-results>`;
        return xml;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `<kil-query-error error="${escapeXmlAttr(errorMessage)}" />`;
      }
    },

    buildXml: (args, isComplete) => {
      if (!args.query) return undefined;

      let xml = `<kil-query query="${escapeXmlAttr(args.query)}"`;
      if (args.sources?.length) {
        xml += ` sources="${args.sources.join(",")}"`;
      }
      if (args.limit) {
        xml += ` limit="${args.limit}"`;
      }
      if (isComplete) {
        xml += ` />`;
      }
      return xml;
    },
  };

// ============================================================================
// KIL Query Similar Tool
// ============================================================================

export const kilQuerySimilarTool: ToolDefinition<
  z.infer<typeof KilQuerySimilarInputSchema>
> = {
  name: "kil_query_similar",
  description: `Find entities similar to a given entity across knowledge sources.

Use this tool when you need to:
- Find similar code patterns
- Discover related functions or classes
- Find past decisions similar to current context`,
  inputSchema: KilQuerySimilarInputSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    try {
      const orchestrator = new QueryOrchestrator();

      const similar = await orchestrator.findSimilar(args.entity_id, {
        sources: args.sources as KnowledgeSource[],
        limit: args.limit,
        minSimilarity: args.min_similarity,
      });

      if (!similar || similar.length === 0) {
        return `<kil-similar-empty entity="${escapeXmlAttr(args.entity_id)}" />`;
      }

      let xml = `<kil-similar-results entity="${escapeXmlAttr(args.entity_id)}" count="${similar.length}">\n`;

      for (const entity of similar) {
        xml += `  <similar-entity id="${escapeXmlAttr(entity.id)}" name="${escapeXmlAttr(entity.name)}" similarity="${entity.metadata.confidence.toFixed(2)}" />\n`;
      }

      xml += `</kil-similar-results>`;
      return xml;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `<kil-similar-error error="${escapeXmlAttr(errorMessage)}" />`;
    }
  },
};

// ============================================================================
// KIL Get Recommendations Tool
// ============================================================================

export const kilGetRecommendationsTool: ToolDefinition<
  z.infer<typeof KilGetRecommendationsInputSchema>
> = {
  name: "kil_get_recommendations",
  description: `Get learning-based recommendations for the current context.

This tool queries the Learning Repository for patterns and decisions that are similar
to the current context, providing actionable recommendations based on past successes.

Use this tool when you need to:
- Get recommendations before making architecture decisions
- Learn from past successful patterns
- Avoid repeating past mistakes`,
  inputSchema: KilGetRecommendationsInputSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    try {
      const learning = new LearningRepository();

      const recommendations = await learning.getRecommendations(ctx.appId, {
        problem: args.context.problem,
        constraints: args.context.constraints || [],
        goals: args.context.goals || [],
        relevantPaths: [],
      });

      if (!recommendations || recommendations.length === 0) {
        return `<kil-recommendations-empty problem="${escapeXmlAttr(args.context.problem)}" />`;
      }

      let xml = `<kil-recommendations problem="${escapeXmlAttr(args.context.problem)}" count="${Math.min(recommendations.length, args.limit)}">\n`;

      for (let i = 0; i < Math.min(recommendations.length, args.limit); i++) {
        const rec = recommendations[i];
        xml += `  <recommendation confidence="${(rec as any).confidence?.toFixed(2) || "0.80"}">\n`;
        xml += `    <suggestion>${escapeXmlContent(typeof rec === "string" ? rec : JSON.stringify(rec))}</suggestion>\n`;
        xml += `  </recommendation>\n`;
      }

      xml += `</kil-recommendations>`;
      return xml;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `<kil-recommendations-error error="${escapeXmlAttr(errorMessage)}" />`;
    }
  },
};

// ============================================================================
// KIL Record Decision Tool
// ============================================================================

export const kilRecordDecisionTool: ToolDefinition<
  z.infer<typeof KilRecordDecisionInputSchema>
> = {
  name: "kil_record_decision",
  description: `Record an architecture decision for future learning.

This tool stores decisions in the Learning Repository, enabling the system to learn
from past decisions and provide better recommendations over time.

Use this tool when:
- Making significant architecture decisions
- Choosing between technology options
- Implementing design patterns
- Creating database schemas`,
  inputSchema: KilRecordDecisionInputSchema,
  defaultConsent: "ask",
  modifiesState: true,

  execute: async (args, ctx) => {
    try {
      const learning = new LearningRepository();

      const decision = await learning.recordDecision({
        appId: ctx.appId,
        title: args.title,
        type: args.type,
        context: {
          problem: args.context.problem,
          constraints: args.context.constraints || [],
          goals: args.context.goals || [],
          relevantPaths: args.context.relevant_paths || [],
        },
        alternatives: args.alternatives.map((a) => ({
          name: a.name,
          pros: a.pros || [],
          cons: a.cons || [],
          description: "",
        })),
        selectedOption: args.selected_option,
        rationale: args.rationale,
        outcome: { status: "pending" },
        confidence: args.confidence,
      });

      return `<kil-decision-recorded id="${decision.id}" title="${escapeXmlAttr(args.title)}" type="${args.type}" />`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `<kil-decision-error error="${escapeXmlAttr(errorMessage)}" />`;
    }
  },

  getConsentPreview: (args) => {
    return `Record architecture decision: "${args.title}" (${args.type})`;
  },
};

// ============================================================================
// KIL Build Context Tool
// ============================================================================

export const kilBuildContextTool: ToolDefinition<
  z.infer<typeof KilBuildContextInputSchema>
> = {
  name: "kil_build_context",
  description: `Build an aggregated knowledge context for a task.

This tool gathers relevant entities, decisions, and patterns from all knowledge sources
to provide comprehensive context for a task.

Use this tool when:
- Starting a new complex task
- Need comprehensive context before implementation
- Gathering all relevant knowledge for analysis`,
  inputSchema: KilBuildContextInputSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    try {
      const orchestrator = new QueryOrchestrator();

      // Build context by querying multiple sources
      const context = await orchestrator.query({
        id: `context_${ctx.chatId}_${Date.now()}`,
        appId: ctx.appId,
        query: args.task,
        sources: ["code_graph", "vector_memory", "architecture", "reasoning"],
        limit: args.max_entities,
      });

      let xml = `<kil-context task="${escapeXmlAttr(args.task)}" entities="${context.entities.length}">\n`;

      // Add relevant entities
      for (const entity of context.entities.slice(0, args.max_entities)) {
        xml += `  <context-entity type="${entity.type}" source="${entity.source}">\n`;
        xml += `    <name>${escapeXmlContent(entity.name)}</name>\n`;
        if (entity.filePath) {
          xml += `    <path>${escapeXmlContent(entity.filePath)}</path>\n`;
        }
        if (entity.description) {
          xml += `    <summary>${escapeXmlContent(entity.description.substring(0, 200))}</summary>\n`;
        }
        xml += `  </context-entity>\n`;
      }

      // Add recommendations if requested
      if (args.include_recommendations) {
        const learning = new LearningRepository();
        const recommendations = await learning.getRecommendations(ctx.appId, {
          problem: args.task,
          constraints: [],
          goals: [],
          relevantPaths: [],
        });

        if (recommendations && recommendations.length > 0) {
          xml += `  <recommendations count="${recommendations.length}">\n`;
          for (const rec of recommendations.slice(0, 5)) {
            xml += `    <rec>${escapeXmlContent(typeof rec === "string" ? rec : JSON.stringify(rec))}</rec>\n`;
          }
          xml += `  </recommendations>\n`;
        }
      }

      xml += `</kil-context>`;
      return xml;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `<kil-context-error error="${escapeXmlAttr(errorMessage)}" />`;
    }
  },
};
