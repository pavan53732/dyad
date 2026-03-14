import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { extractCodebase } from "../../../../../../utils/codebase";
import { engineFetch } from "./engine_fetch";

const logger = log.scope("retrieval_intelligence");

// ============================================================================
// 1. Code Retrieval Engine (Capability 41)
// ============================================================================

const codeRetrievalSchema = z.object({
  query: z.string().describe("Search query to find relevant code"),
  language: z.string().optional().describe("Optional language filter"),
});

const codeRetrievalResponseSchema = z.object({
  results: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        score: z.number(),
      }),
    )
    .describe("Retrieved code results with scores"),
});

async function callCodeRetrieval(
  params: {
    query: string;
    language?: string;
    filesContext: Array<{ path: string; content: string }>;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof codeRetrievalResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/code-retrieval", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Code retrieval failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return codeRetrievalResponseSchema.parse(await response.json());
}

export const codeRetrievalTool: ToolDefinition<
  z.infer<typeof codeRetrievalSchema>
> = {
  name: "code_retrieval",
  description: `Advanced code retrieval engine that uses semantic search to find relevant code snippets and files based on a query. Supports optional language filtering.
  Use this tool when you need to find specific code implementations or patterns in the codebase.`,
  inputSchema: codeRetrievalSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Retrieve code for "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-code-retrieval query="${escapeXmlAttr(args.query)}">Searching for code...</dyad-code-retrieval>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing code retrieval: ${args.query}`);

    const { files } = await extractCodebase({
      appPath: ctx.appPath,
      chatContext: {
        contextPaths: [],
        smartContextAutoIncludes: [],
        excludePaths: [],
      },
    });

    const filesContext = files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    logger.log(
      `Searching ${filesContext.length} files for code matching query: "${args.query}"`,
    );

    const result = await callCodeRetrieval(
      {
        query: args.query,
        language: args.language,
        filesContext,
      },
      ctx,
    );

    const resultText =
      result.results.length === 0
        ? "No relevant code found."
        : result.results
            .map((r) => ` - ${r.path} (score: ${r.score.toFixed(2)})`)
            .join("\n");

    ctx.onXmlComplete(
      `<dyad-code-retrieval query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-code-retrieval>`,
    );

    logger.log(`Code retrieval completed for query: ${args.query}`);

    if (result.results.length === 0) {
      return "No relevant code found for the given query.";
    }

    return `Found ${result.results.length} relevant code snippet(s):\n${resultText}`;
  },
};

// ============================================================================
// 2. Documentation Retrieval Engine (Capability 42)
// ============================================================================

const documentationRetrievalSchema = z.object({
  query: z.string().describe("Search query to find relevant documentation"),
  format: z
    .string()
    .optional()
    .describe("Optional format filter (e.g., markdown, html)"),
});

const documentationRetrievalResponseSchema = z.object({
  results: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        score: z.number(),
      }),
    )
    .describe("Retrieved documentation results with scores"),
});

async function callDocumentationRetrieval(
  params: {
    query: string;
    format?: string;
    filesContext: Array<{ path: string; content: string }>;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof documentationRetrievalResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/documentation-retrieval", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Documentation retrieval failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return documentationRetrievalResponseSchema.parse(await response.json());
}

export const documentationRetrievalTool: ToolDefinition<
  z.infer<typeof documentationRetrievalSchema>
> = {
  name: "documentation_retrieval",
  description: `Advanced documentation retrieval engine that uses semantic search to find relevant documentation files and sections. Supports optional format filtering.
  Use this tool when you need to find documentation, READMEs, or other explanatory content in the codebase.`,
  inputSchema: documentationRetrievalSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Retrieve documentation for "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-documentation-retrieval query="${escapeXmlAttr(args.query)}">Searching for documentation...</dyad-documentation-retrieval>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing documentation retrieval: ${args.query}`);

    const { files } = await extractCodebase({
      appPath: ctx.appPath,
      chatContext: {
        contextPaths: [],
        smartContextAutoIncludes: [],
        excludePaths: [],
      },
    });

    const filesContext = files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    logger.log(
      `Searching ${filesContext.length} files for documentation matching query: "${args.query}"`,
    );

    const result = await callDocumentationRetrieval(
      {
        query: args.query,
        format: args.format,
        filesContext,
      },
      ctx,
    );

    const resultText =
      result.results.length === 0
        ? "No relevant documentation found."
        : result.results
            .map((r) => ` - ${r.path} (score: ${r.score.toFixed(2)})`)
            .join("\n");

    ctx.onXmlComplete(
      `<dyad-documentation-retrieval query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-documentation-retrieval>`,
    );

    logger.log(`Documentation retrieval completed for query: ${args.query}`);

    if (result.results.length === 0) {
      return "No relevant documentation found for the given query.";
    }

    return `Found ${result.results.length} relevant documentation file(s):\n${resultText}`;
  },
};

// ============================================================================
// 3. Pattern Retrieval Engine (Capability 43)
// ============================================================================

const patternRetrievalSchema = z.object({
  query: z.string().describe("Search query to find relevant patterns"),
  category: z.string().optional().describe("Optional pattern category filter"),
});

const patternRetrievalResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        examples: z.array(z.string()),
        score: z.number(),
      }),
    )
    .describe("Retrieved patterns with scores"),
});

async function callPatternRetrieval(
  params: {
    query: string;
    category?: string;
    filesContext: Array<{ path: string; content: string }>;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof patternRetrievalResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/pattern-retrieval", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Pattern retrieval failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return patternRetrievalResponseSchema.parse(await response.json());
}

export const patternRetrievalTool: ToolDefinition<
  z.infer<typeof patternRetrievalSchema>
> = {
  name: "pattern_retrieval",
  description: `Advanced pattern retrieval engine that finds design patterns, architectural patterns, and code patterns in the codebase. Supports optional category filtering.
  Use this tool when you need to identify patterns that solve specific design or architectural problems.`,
  inputSchema: patternRetrievalSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Retrieve patterns for "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-pattern-retrieval query="${escapeXmlAttr(args.query)}">Searching for patterns...</dyad-pattern-retrieval>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing pattern retrieval: ${args.query}`);

    const { files } = await extractCodebase({
      appPath: ctx.appPath,
      chatContext: {
        contextPaths: [],
        smartContextAutoIncludes: [],
        excludePaths: [],
      },
    });

    const filesContext = files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    logger.log(
      `Searching ${filesContext.length} files for patterns matching query: "${args.query}"`,
    );

    const result = await callPatternRetrieval(
      {
        query: args.query,
        category: args.category,
        filesContext,
      },
      ctx,
    );

    const resultText =
      result.results.length === 0
        ? "No relevant patterns found."
        : result.results
            .map(
              (r) =>
                ` - ${r.name} (score: ${r.score.toFixed(2)})\n  ${r.description}`,
            )
            .join("\n");

    ctx.onXmlComplete(
      `<dyad-pattern-retrieval query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-pattern-retrieval>`,
    );

    logger.log(`Pattern retrieval completed for query: ${args.query}`);

    if (result.results.length === 0) {
      return "No relevant patterns found for the given query.";
    }

    return `Found ${result.results.length} relevant pattern(s):\n${resultText}`;
  },
};

// ============================================================================
// 4. Architecture Retrieval Engine (Capability 44)
// ============================================================================

const architectureRetrievalSchema = z.object({
  query: z.string().describe("Search query to find architecture information"),
  type: z.string().optional().describe("Optional architecture type filter"),
});

const architectureRetrievalResponseSchema = z.object({
  results: z
    .array(
      z.object({
        component: z.string(),
        description: z.string(),
        dependencies: z.array(z.string()),
        score: z.number(),
      }),
    )
    .describe("Retrieved architecture components with scores"),
});

async function callArchitectureRetrieval(
  params: {
    query: string;
    type?: string;
    filesContext: Array<{ path: string; content: string }>;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof architectureRetrievalResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/architecture-retrieval", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Architecture retrieval failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return architectureRetrievalResponseSchema.parse(await response.json());
}

export const architectureRetrievalTool: ToolDefinition<
  z.infer<typeof architectureRetrievalSchema>
> = {
  name: "architecture_retrieval",
  description: `Advanced architecture retrieval engine that analyzes and retrieves architecture-related information from the codebase. Supports optional type filtering.
  Use this tool when you need to understand the architecture components, modules, and their interactions.`,
  inputSchema: architectureRetrievalSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Retrieve architecture for "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-architecture-retrieval query="${escapeXmlAttr(args.query)}">Searching for architecture...</dyad-architecture-retrieval>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing architecture retrieval: ${args.query}`);

    const { files } = await extractCodebase({
      appPath: ctx.appPath,
      chatContext: {
        contextPaths: [],
        smartContextAutoIncludes: [],
        excludePaths: [],
      },
    });

    const filesContext = files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    logger.log(
      `Searching ${filesContext.length} files for architecture information matching query: "${args.query}"`,
    );

    const result = await callArchitectureRetrieval(
      {
        query: args.query,
        type: args.type,
        filesContext,
      },
      ctx,
    );

    const resultText =
      result.results.length === 0
        ? "No relevant architecture information found."
        : result.results
            .map(
              (r) =>
                ` - ${r.component} (score: ${r.score.toFixed(2)})\n  ${r.description}\n  Dependencies: ${r.dependencies.join(", ")}`,
            )
            .join("\n\n");

    ctx.onXmlComplete(
      `<dyad-architecture-retrieval query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-architecture-retrieval>`,
    );

    logger.log(`Architecture retrieval completed for query: ${args.query}`);

    if (result.results.length === 0) {
      return "No relevant architecture information found for the given query.";
    }

    return `Found ${result.results.length} relevant architecture component(s):\n${resultText}`;
  },
};

// ============================================================================
// 5. API Reference Retrieval Engine (Capability 45)
// ============================================================================

const apiReferenceRetrievalSchema = z.object({
  query: z.string().describe("Search query to find API references"),
  version: z.string().optional().describe("Optional API version filter"),
});

const apiReferenceRetrievalResponseSchema = z.object({
  results: z
    .array(
      z.object({
        endpoint: z.string(),
        description: z.string(),
        parameters: z.array(z.string()),
        score: z.number(),
      }),
    )
    .describe("Retrieved API references with scores"),
});

async function callApiReferenceRetrieval(
  params: {
    query: string;
    version?: string;
    filesContext: Array<{ path: string; content: string }>;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof apiReferenceRetrievalResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/api-reference-retrieval", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API reference retrieval failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return apiReferenceRetrievalResponseSchema.parse(await response.json());
}

export const apiReferenceRetrievalTool: ToolDefinition<
  z.infer<typeof apiReferenceRetrievalSchema>
> = {
  name: "api_reference_retrieval",
  description: `Advanced API reference retrieval engine that finds API endpoints, methods, and documentation. Supports optional version filtering.
  Use this tool when you need to find information about API endpoints, methods, parameters, and usage.`,
  inputSchema: apiReferenceRetrievalSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Retrieve API references for "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-api-reference-retrieval query="${escapeXmlAttr(args.query)}">Searching for API references...</dyad-api-reference-retrieval>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing API reference retrieval: ${args.query}`);

    const { files } = await extractCodebase({
      appPath: ctx.appPath,
      chatContext: {
        contextPaths: [],
        smartContextAutoIncludes: [],
        excludePaths: [],
      },
    });

    const filesContext = files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    logger.log(
      `Searching ${filesContext.length} files for API references matching query: "${args.query}"`,
    );

    const result = await callApiReferenceRetrieval(
      {
        query: args.query,
        version: args.version,
        filesContext,
      },
      ctx,
    );

    const resultText =
      result.results.length === 0
        ? "No relevant API references found."
        : result.results
            .map(
              (r) =>
                ` - ${r.endpoint} (score: ${r.score.toFixed(2)})\n  ${r.description}\n  Parameters: ${r.parameters.join(", ")}`,
            )
            .join("\n\n");

    ctx.onXmlComplete(
      `<dyad-api-reference-retrieval query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-api-reference-retrieval>`,
    );

    logger.log(`API reference retrieval completed for query: ${args.query}`);

    if (result.results.length === 0) {
      return "No relevant API references found for the given query.";
    }

    return `Found ${result.results.length} relevant API reference(s):\n${resultText}`;
  },
};

// ============================================================================
// 6. Semantic Similarity Ranking (Capability 46)
// ============================================================================

const semanticSimilarityRankingSchema = z.object({
  query: z.string().describe("Query to rank against"),
  candidates: z
    .array(z.string())
    .min(1)
    .describe("List of text candidates to rank"),
});

const semanticSimilarityRankingResponseSchema = z.object({
  rankedCandidates: z
    .array(
      z.object({
        candidate: z.string(),
        score: z.number(),
      }),
    )
    .describe("Ranked candidates with similarity scores"),
});

async function callSemanticSimilarityRanking(
  params: {
    query: string;
    candidates: string[];
  },
  ctx: AgentContext,
): Promise<z.infer<typeof semanticSimilarityRankingResponseSchema>> {
  const response = await engineFetch(
    ctx,
    "/tools/semantic-similarity-ranking",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Semantic similarity ranking failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return semanticSimilarityRankingResponseSchema.parse(await response.json());
}

export const semanticSimilarityRankingTool: ToolDefinition<
  z.infer<typeof semanticSimilarityRankingSchema>
> = {
  name: "semantic_similarity_ranking",
  description: `Semantic similarity ranking engine that ranks text candidates based on their semantic similarity to a query.
  Use this tool when you need to find the most semantically relevant text from a list of candidates.`,
  inputSchema: semanticSimilarityRankingSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) =>
    `Rank ${args.candidates.length} candidates for query "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query || !args.candidates) return undefined;
    if (isComplete) return undefined;
    return `<dyad-semantic-similarity-ranking query="${escapeXmlAttr(args.query)}">Ranking ${args.candidates.length} candidates...</dyad-semantic-similarity-ranking>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(
      `Executing semantic similarity ranking for query: ${args.query}`,
    );

    const result = await callSemanticSimilarityRanking(
      {
        query: args.query,
        candidates: args.candidates,
      },
      ctx,
    );

    const resultText = result.rankedCandidates
      .map(
        (r) =>
          ` - Score: ${r.score.toFixed(3)}\n   ${r.candidate.substring(0, 200)}${r.candidate.length > 200 ? "..." : ""}`,
      )
      .join("\n");

    ctx.onXmlComplete(
      `<dyad-semantic-similarity-ranking query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-semantic-similarity-ranking>`,
    );

    logger.log(
      `Semantic similarity ranking completed for query: ${args.query}`,
    );

    return `Ranked ${result.rankedCandidates.length} candidates by semantic similarity:\n${resultText}`;
  },
};

// ============================================================================
// 7. Retrieval Re-ranking System (Capability 47)
// ============================================================================

const retrievalReRankingSchema = z.object({
  query: z.string().describe("Query to re-rank against"),
  initialResults: z
    .array(z.string())
    .min(1)
    .describe("List of initial results to re-rank"),
  strategy: z.string().optional().describe("Optional re-ranking strategy"),
});

const retrievalReRankingResponseSchema = z.object({
  reRankedResults: z
    .array(
      z.object({
        result: z.string(),
        score: z.number(),
      }),
    )
    .describe("Re-ranked results with scores"),
});

async function callRetrievalReRanking(
  params: {
    query: string;
    initialResults: string[];
    strategy?: string;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof retrievalReRankingResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/retrieval-re-ranking", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Retrieval re-ranking failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return retrievalReRankingResponseSchema.parse(await response.json());
}

export const retrievalReRankingTool: ToolDefinition<
  z.infer<typeof retrievalReRankingSchema>
> = {
  name: "retrieval_re_ranking",
  description: `Retrieval re-ranking system that re-ranks initial search results based on semantic similarity. Supports optional re-ranking strategies.
  Use this tool when you have initial search results and want to improve their relevance by re-ranking them.`,
  inputSchema: retrievalReRankingSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) =>
    `Re-rank ${args.initialResults.length} results for query "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query || !args.initialResults) return undefined;
    if (isComplete) return undefined;
    return `<dyad-retrieval-re-ranking query="${escapeXmlAttr(args.query)}">Re-ranking ${args.initialResults.length} results...</dyad-retrieval-re-ranking>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing retrieval re-ranking for query: ${args.query}`);

    const result = await callRetrievalReRanking(
      {
        query: args.query,
        initialResults: args.initialResults,
        strategy: args.strategy,
      },
      ctx,
    );

    const resultText = result.reRankedResults
      .map(
        (r) =>
          ` - Score: ${r.score.toFixed(3)}\n   ${r.result.substring(0, 200)}${r.result.length > 200 ? "..." : ""}`,
      )
      .join("\n");

    ctx.onXmlComplete(
      `<dyad-retrieval-re-ranking query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-retrieval-re-ranking>`,
    );

    logger.log(`Retrieval re-ranking completed for query: ${args.query}`);

    return `Re-ranked ${result.reRankedResults.length} results by semantic similarity:\n${resultText}`;
  },
};

// ============================================================================
// 8. Query Rewriting Engine (Capability 48)
// ============================================================================

const queryRewritingSchema = z.object({
  originalQuery: z.string().describe("Original query to rewrite"),
  intent: z.string().optional().describe("Optional intent of the query"),
});

const queryRewritingResponseSchema = z.object({
  rewrittenQueries: z
    .array(
      z.object({
        query: z.string(),
        score: z.number(),
        reason: z.string(),
      }),
    )
    .describe("Rewritten queries with scores and reasons"),
});

async function callQueryRewriting(
  params: {
    originalQuery: string;
    intent?: string;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof queryRewritingResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/query-rewriting", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Query rewriting failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return queryRewritingResponseSchema.parse(await response.json());
}

export const queryRewritingTool: ToolDefinition<
  z.infer<typeof queryRewritingSchema>
> = {
  name: "query_rewriting",
  description: `Query rewriting engine that generates improved versions of a query for better search results. Supports optional intent specification.
  Use this tool when you need to optimize a query to get better search results.`,
  inputSchema: queryRewritingSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Rewrite query "${args.originalQuery}"`,
  buildXml: (args, isComplete) => {
    if (!args.originalQuery) return undefined;
    if (isComplete) return undefined;
    return `<dyad-query-rewriting original="${escapeXmlAttr(args.originalQuery)}">Rewriting query...</dyad-query-rewriting>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing query rewriting for: ${args.originalQuery}`);

    const result = await callQueryRewriting(
      {
        originalQuery: args.originalQuery,
        intent: args.intent,
      },
      ctx,
    );

    const resultText = result.rewrittenQueries
      .map(
        (r) =>
          ` - ${r.query} (score: ${r.score.toFixed(3)})\n   Reason: ${r.reason}`,
      )
      .join("\n\n");

    ctx.onXmlComplete(
      `<dyad-query-rewriting original="${escapeXmlAttr(args.originalQuery)}">${escapeXmlContent(resultText)}</dyad-query-rewriting>`,
    );

    logger.log(`Query rewriting completed for: ${args.originalQuery}`);

    return `Generated ${result.rewrittenQueries.length} rewritten query(ies):\n${resultText}`;
  },
};

// ============================================================================
// 9. Retrieval Fallback Strategy (Capability 49)
// ============================================================================

const retrievalFallbackStrategySchema = z.object({
  query: z.string().describe("Query for retrieval"),
  primaryResults: z.array(z.string()).describe("Primary search results"),
  fallbackProviders: z
    .array(z.string())
    .optional()
    .describe("Optional fallback providers"),
});

const retrievalFallbackStrategyResponseSchema = z.object({
  combinedResults: z
    .array(
      z.object({
        result: z.string(),
        source: z.string(),
        score: z.number(),
      }),
    )
    .describe("Combined results from all sources"),
});

async function callRetrievalFallbackStrategy(
  params: {
    query: string;
    primaryResults: string[];
    fallbackProviders?: string[];
  },
  ctx: AgentContext,
): Promise<z.infer<typeof retrievalFallbackStrategyResponseSchema>> {
  const response = await engineFetch(
    ctx,
    "/tools/retrieval-fallback-strategy",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Retrieval fallback strategy failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return retrievalFallbackStrategyResponseSchema.parse(await response.json());
}

export const retrievalFallbackStrategyTool: ToolDefinition<
  z.infer<typeof retrievalFallbackStrategySchema>
> = {
  name: "retrieval_fallback_strategy",
  description: `Retrieval fallback strategy that combines results from primary and fallback sources. Supports optional fallback provider specification.
  Use this tool when primary search results are insufficient and you need to include fallback sources.`,
  inputSchema: retrievalFallbackStrategySchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) =>
    `Apply fallback strategy for query "${args.query}"`,
  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-retrieval-fallback query="${escapeXmlAttr(args.query)}">Applying fallback strategy...</dyad-retrieval-fallback>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(
      `Executing retrieval fallback strategy for query: ${args.query}`,
    );

    const result = await callRetrievalFallbackStrategy(
      {
        query: args.query,
        primaryResults: args.primaryResults,
        fallbackProviders: args.fallbackProviders,
      },
      ctx,
    );

    const resultText = result.combinedResults
      .map(
        (r) =>
          ` - Source: ${r.source} (score: ${r.score.toFixed(3)})\n   ${r.result.substring(0, 200)}${r.result.length > 200 ? "..." : ""}`,
      )
      .join("\n");

    ctx.onXmlComplete(
      `<dyad-retrieval-fallback query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-retrieval-fallback>`,
    );

    logger.log(
      `Retrieval fallback strategy completed for query: ${args.query}`,
    );

    return `Combined ${result.combinedResults.length} results from all sources:\n${resultText}`;
  },
};

// ============================================================================
// 10. Knowledge Source Validator (Capability 50)
// ============================================================================

const knowledgeSourceValidatorSchema = z.object({
  source: z.string().describe("Knowledge source to validate"),
  context: z.string().optional().describe("Optional context for validation"),
});

const knowledgeSourceValidatorResponseSchema = z.object({
  valid: z.boolean(),
  confidence: z.number(),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

async function callKnowledgeSourceValidator(
  params: {
    source: string;
    context?: string;
  },
  ctx: AgentContext,
): Promise<z.infer<typeof knowledgeSourceValidatorResponseSchema>> {
  const response = await engineFetch(ctx, "/tools/knowledge-source-validator", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Knowledge source validation failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return knowledgeSourceValidatorResponseSchema.parse(await response.json());
}

export const knowledgeSourceValidatorTool: ToolDefinition<
  z.infer<typeof knowledgeSourceValidatorSchema>
> = {
  name: "knowledge_source_validator",
  description: `Knowledge source validator that assesses the validity and quality of a knowledge source. Supports optional context for validation.
  Use this tool when you need to verify the accuracy and reliability of a knowledge source.`,
  inputSchema: knowledgeSourceValidatorSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: () => `Validate knowledge source`,
  buildXml: (args, isComplete) => {
    if (!args.source) return undefined;
    if (isComplete) return undefined;
    return `<dyad-knowledge-source-validator>Validating knowledge source...</dyad-knowledge-source-validator>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing knowledge source validation`);

    const result = await callKnowledgeSourceValidator(
      {
        source: args.source,
        context: args.context,
      },
      ctx,
    );

    let resultText = `Valid: ${result.valid ? "Yes" : "No"}\nConfidence: ${(result.confidence * 100).toFixed(0)}%\n`;

    if (result.issues.length > 0) {
      resultText += `\nIssues:\n${result.issues.map((issue) => ` - ${issue}`).join("\n")}\n`;
    }

    if (result.suggestions.length > 0) {
      resultText += `\nSuggestions:\n${result.suggestions.map((suggestion) => ` - ${suggestion}`).join("\n")}\n`;
    }

    ctx.onXmlComplete(
      `<dyad-knowledge-source-validator>${escapeXmlContent(resultText)}</dyad-knowledge-source-validator>`,
    );

    logger.log(`Knowledge source validation completed`);

    return resultText;
  },
};
