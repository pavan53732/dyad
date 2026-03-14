import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { engineFetch } from "./engine_fetch";

const logger = log.scope("code_representation");

// ============================================================================
// Code Embedding Generator (231)
// ============================================================================

const codeEmbeddingGeneratorSchema = z.object({
  code: z.string().describe("Code snippet to generate embedding for"),
  language: z
    .string()
    .optional()
    .describe("Programming language of the code snippet"),
});

const codeEmbeddingGeneratorResponseSchema = z.object({
  embedding: z
    .array(z.number())
    .describe("Vector embedding of the code snippet"),
  metadata: z.object({
    tokenCount: z.number(),
    language: z.string().optional(),
  }),
});

export const codeEmbeddingGeneratorTool: ToolDefinition<
  z.infer<typeof codeEmbeddingGeneratorSchema>
> = {
  name: "code_embedding_generator",
  description:
    "Generate vector embeddings for code snippets to represent their semantic meaning. Embeddings can be used for similarity search, clustering, and other machine learning tasks.",
  inputSchema: codeEmbeddingGeneratorSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Generate embedding for code snippet`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-embedding>Generating embedding for code snippet...</dyad-code-embedding>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log("Generating code embedding");

    const response = await engineFetch(ctx, "/tools/code-embedding-generator", {
      method: "POST",
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Code embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeEmbeddingGeneratorResponseSchema.parse(
      await response.json(),
    );

    ctx.onXmlComplete(
      `<dyad-code-embedding>Generated embedding with ${data.metadata.tokenCount} tokens</dyad-code-embedding>`,
    );

    return `Generated code embedding successfully. Token count: ${data.metadata.tokenCount}`;
  },
};

// ============================================================================
// Function Embedding System (232)
// ============================================================================

const functionEmbeddingSystemSchema = z.object({
  functionName: z
    .string()
    .describe("Name of the function to generate embedding for"),
  functionCode: z.string().describe("Source code of the function"),
  language: z
    .string()
    .optional()
    .describe("Programming language of the function"),
});

const functionEmbeddingSystemResponseSchema = z.object({
  embedding: z.array(z.number()).describe("Vector embedding of the function"),
  metadata: z.object({
    tokenCount: z.number(),
    language: z.string().optional(),
    parameters: z.array(z.string()),
    returnType: z.string().optional(),
  }),
});

export const functionEmbeddingSystemTool: ToolDefinition<
  z.infer<typeof functionEmbeddingSystemSchema>
> = {
  name: "function_embedding_system",
  description:
    "Generate vector embeddings specifically for functions, capturing their purpose, parameters, and implementation details. This tool understands function signatures and semantic meaning.",
  inputSchema: functionEmbeddingSystemSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) =>
    `Generate embedding for function: ${args.functionName}`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-function-embedding function="${escapeXmlAttr(args.functionName)}">Generating function embedding...</dyad-function-embedding>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Generating function embedding for: ${args.functionName}`);

    const response = await engineFetch(
      ctx,
      "/tools/function-embedding-system",
      {
        method: "POST",
        body: JSON.stringify(args),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Function embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = functionEmbeddingSystemResponseSchema.parse(
      await response.json(),
    );

    ctx.onXmlComplete(
      `<dyad-function-embedding function="${escapeXmlAttr(args.functionName)}">Generated embedding with ${data.metadata.tokenCount} tokens</dyad-function-embedding>`,
    );

    return `Generated function embedding for ${args.functionName} successfully. Token count: ${data.metadata.tokenCount}`;
  },
};

// ============================================================================
// Class Embedding System (233)
// ============================================================================

const classEmbeddingSystemSchema = z.object({
  className: z.string().describe("Name of the class to generate embedding for"),
  classCode: z.string().describe("Source code of the class"),
  language: z.string().optional().describe("Programming language of the class"),
});

const classEmbeddingSystemResponseSchema = z.object({
  embedding: z.array(z.number()).describe("Vector embedding of the class"),
  metadata: z.object({
    tokenCount: z.number(),
    language: z.string().optional(),
    methods: z.array(z.string()),
    properties: z.array(z.string()),
  }),
});

export const classEmbeddingSystemTool: ToolDefinition<
  z.infer<typeof classEmbeddingSystemSchema>
> = {
  name: "class_embedding_system",
  description:
    "Generate vector embeddings for classes, capturing their structure, properties, methods, and relationships. This tool understands object-oriented concepts and class hierarchies.",
  inputSchema: classEmbeddingSystemSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) =>
    `Generate embedding for class: ${args.className}`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-class-embedding class="${escapeXmlAttr(args.className)}">Generating class embedding...</dyad-class-embedding>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Generating class embedding for: ${args.className}`);

    const response = await engineFetch(ctx, "/tools/class-embedding-system", {
      method: "POST",
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Class embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = classEmbeddingSystemResponseSchema.parse(
      await response.json(),
    );

    ctx.onXmlComplete(
      `<dyad-class-embedding class="${escapeXmlAttr(args.className)}">Generated embedding with ${data.metadata.tokenCount} tokens</dyad-class-embedding>`,
    );

    return `Generated class embedding for ${args.className} successfully. Token count: ${data.metadata.tokenCount}`;
  },
};

// ============================================================================
// File Embedding System (234)
// ============================================================================

const fileEmbeddingSystemSchema = z.object({
  filePath: z.string().describe("Path to the file to generate embedding for"),
});

const fileEmbeddingSystemResponseSchema = z.object({
  embedding: z.array(z.number()).describe("Vector embedding of the file"),
  metadata: z.object({
    tokenCount: z.number(),
    language: z.string(),
    linesOfCode: z.number(),
  }),
});

export const fileEmbeddingSystemTool: ToolDefinition<
  z.infer<typeof fileEmbeddingSystemSchema>
> = {
  name: "file_embedding_system",
  description:
    "Generate vector embeddings for entire files, representing their overall content, purpose, and structure. This tool processes the complete file content to create a semantic representation.",
  inputSchema: fileEmbeddingSystemSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Generate embedding for file: ${args.filePath}`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-file-embedding file="${escapeXmlAttr(args.filePath)}">Generating file embedding...</dyad-file-embedding>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Generating file embedding for: ${args.filePath}`);

    const response = await engineFetch(ctx, "/tools/file-embedding-system", {
      method: "POST",
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `File embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = fileEmbeddingSystemResponseSchema.parse(await response.json());

    ctx.onXmlComplete(
      `<dyad-file-embedding file="${escapeXmlAttr(args.filePath)}">Generated embedding with ${data.metadata.tokenCount} tokens</dyad-file-embedding>`,
    );

    return `Generated file embedding for ${args.filePath} successfully. Token count: ${data.metadata.tokenCount}`;
  },
};

// ============================================================================
// Repository Embedding System (235)
// ============================================================================

const repositoryEmbeddingSystemSchema = z.object({
  repositoryPath: z
    .string()
    .optional()
    .describe("Path to the repository (defaults to current app path)"),
});

const repositoryEmbeddingSystemResponseSchema = z.object({
  embedding: z.array(z.number()).describe("Vector embedding of the repository"),
  metadata: z.object({
    tokenCount: z.number(),
    fileCount: z.number(),
    languages: z.array(z.string()),
  }),
});

export const repositoryEmbeddingSystemTool: ToolDefinition<
  z.infer<typeof repositoryEmbeddingSystemSchema>
> = {
  name: "repository_embedding_system",
  description:
    "Generate vector embeddings for entire code repositories, capturing the overall architecture, purpose, and technology stack. This tool analyzes the complete repository structure to create a holistic representation.",
  inputSchema: repositoryEmbeddingSystemSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Generate repository embedding`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-repository-embedding>Generating repository embedding...</dyad-repository-embedding>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log("Generating repository embedding");

    const response = await engineFetch(
      ctx,
      "/tools/repository-embedding-system",
      {
        method: "POST",
        body: JSON.stringify({
          repositoryPath: args.repositoryPath || ctx.appPath,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Repository embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = repositoryEmbeddingSystemResponseSchema.parse(
      await response.json(),
    );

    ctx.onXmlComplete(
      `<dyad-repository-embedding>Generated embedding for repository with ${data.metadata.fileCount} files</dyad-repository-embedding>`,
    );

    return `Generated repository embedding successfully. File count: ${data.metadata.fileCount}`;
  },
};

// ============================================================================
// Code Similarity Search (236)
// ============================================================================

const codeSimilaritySearchSchema = z.object({
  query: z.string().describe("Code snippet or query to find similar code"),
  searchScope: z
    .enum(["function", "class", "file", "repository"])
    .optional()
    .describe("Scope of the search"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results to return"),
});

const codeSimilaritySearchResponseSchema = z.object({
  results: z.array(
    z.object({
      path: z.string(),
      similarityScore: z.number(),
      codeSnippet: z.string(),
    }),
  ),
});

export const codeSimilaritySearchTool: ToolDefinition<
  z.infer<typeof codeSimilaritySearchSchema>
> = {
  name: "code_similarity_search",
  description:
    "Search for code similar to a given snippet or query using semantic similarity. This tool uses embeddings to find code that has similar functionality or purpose, not just identical text.",
  inputSchema: codeSimilaritySearchSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Search for similar code`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-similarity>Searching for similar code...</dyad-code-similarity>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log("Searching for similar code");

    const response = await engineFetch(ctx, "/tools/code-similarity-search", {
      method: "POST",
      body: JSON.stringify({
        ...args,
        repositoryPath: ctx.appPath,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Code similarity search failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeSimilaritySearchResponseSchema.parse(
      await response.json(),
    );

    const resultText =
      data.results.length === 0
        ? "No similar code found."
        : data.results
            .map(
              (r, i) =>
                `${i + 1}. ${r.path} (Similarity: ${(r.similarityScore * 100).toFixed(1)}%)`,
            )
            .join("\n");

    ctx.onXmlComplete(
      `<dyad-code-similarity>${escapeXmlContent(resultText)}</dyad-code-similarity>`,
    );

    return resultText;
  },
};

// ============================================================================
// Code Clustering Engine (237)
// ============================================================================

const codeClusteringEngineSchema = z.object({
  clusterType: z
    .enum(["functions", "classes", "files"])
    .describe("Type of code elements to cluster"),
  algorithm: z
    .enum(["kmeans", "hierarchical", "dbscan"])
    .optional()
    .default("kmeans")
    .describe("Clustering algorithm to use"),
  numClusters: z
    .number()
    .optional()
    .default(5)
    .describe("Number of clusters to create (for kmeans)"),
});

const codeClusteringEngineResponseSchema = z.object({
  clusters: z.array(
    z.object({
      clusterId: z.number(),
      size: z.number(),
      representative: z.string(),
      members: z.array(z.string()),
    }),
  ),
});

export const codeClusteringEngineTool: ToolDefinition<
  z.infer<typeof codeClusteringEngineSchema>
> = {
  name: "code_clustering_engine",
  description:
    "Cluster code elements (functions, classes, files) based on semantic similarity. This tool groups similar code together to help understand codebase structure and identify patterns.",
  inputSchema: codeClusteringEngineSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Cluster ${args.clusterType}`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-clustering type="${args.clusterType}">Clustering ${args.clusterType}...</dyad-code-clustering>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Clustering ${args.clusterType} using ${args.algorithm}`);

    const response = await engineFetch(ctx, "/tools/code-clustering-engine", {
      method: "POST",
      body: JSON.stringify({
        ...args,
        repositoryPath: ctx.appPath,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Code clustering failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeClusteringEngineResponseSchema.parse(
      await response.json(),
    );

    const resultText = data.clusters
      .map(
        (cluster) =>
          `Cluster ${cluster.clusterId} (${cluster.size} items): ${cluster.representative}`,
      )
      .join("\n");

    ctx.onXmlComplete(
      `<dyad-code-clustering type="${args.clusterType}">${escapeXmlContent(resultText)}</dyad-code-clustering>`,
    );

    return `Generated ${data.clusters.length} clusters of ${args.clusterType}`;
  },
};

// ============================================================================
// Code Indexing System (238)
// ============================================================================

const codeIndexingSystemSchema = z.object({
  indexingScope: z
    .enum(["function", "class", "file", "all"])
    .optional()
    .default("all")
    .describe("Scope of the indexing operation"),
  rebuild: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to rebuild the index from scratch"),
});

const codeIndexingSystemResponseSchema = z.object({
  indexId: z.string(),
  statistics: z.object({
    functionCount: z.number(),
    classCount: z.number(),
    fileCount: z.number(),
    tokenCount: z.number(),
  }),
});

export const codeIndexingSystemTool: ToolDefinition<
  z.infer<typeof codeIndexingSystemSchema>
> = {
  name: "code_indexing_system",
  description:
    "Index codebase elements for efficient search and retrieval. This tool creates a semantic index of functions, classes, and files that can be used for similarity search and other operations.",
  inputSchema: codeIndexingSystemSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Index codebase (${args.indexingScope})`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-indexing scope="${args.indexingScope}">Indexing codebase...</dyad-code-indexing>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Indexing codebase with scope: ${args.indexingScope}`);

    const response = await engineFetch(ctx, "/tools/code-indexing-system", {
      method: "POST",
      body: JSON.stringify({
        ...args,
        repositoryPath: ctx.appPath,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Code indexing failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeIndexingSystemResponseSchema.parse(await response.json());

    ctx.onXmlComplete(
      `<dyad-code-indexing scope="${args.indexingScope}">Indexed ${data.statistics.fileCount} files, ${data.statistics.classCount} classes, ${data.statistics.functionCount} functions</dyad-code-indexing>`,
    );

    return `Code indexing completed. Index ID: ${data.indexId}`;
  },
};

// ============================================================================
// Code Metadata Extractor (239)
// ============================================================================

const codeMetadataExtractorSchema = z.object({
  filePath: z.string().describe("Path to the file to extract metadata from"),
});

const codeMetadataExtractorResponseSchema = z.object({
  metadata: z.object({
    functions: z.array(
      z.object({
        name: z.string(),
        parameters: z.array(z.string()),
        returnType: z.string().optional(),
        lines: z.object({ start: z.number(), end: z.number() }),
      }),
    ),
    classes: z.array(
      z.object({
        name: z.string(),
        methods: z.array(z.string()),
        properties: z.array(z.string()),
        lines: z.object({ start: z.number(), end: z.number() }),
      }),
    ),
    imports: z.array(z.string()),
    exports: z.array(z.string()),
    language: z.string(),
    linesOfCode: z.number(),
    commentCount: z.number(),
  }),
});

export const codeMetadataExtractorTool: ToolDefinition<
  z.infer<typeof codeMetadataExtractorSchema>
> = {
  name: "code_metadata_extractor",
  description:
    "Extract structured metadata from code files. This tool identifies functions, classes, imports, exports, and other code elements with their properties and locations.",
  inputSchema: codeMetadataExtractorSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Extract metadata from: ${args.filePath}`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-metadata file="${escapeXmlAttr(args.filePath)}">Extracting metadata...</dyad-code-metadata>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log(`Extracting metadata from: ${args.filePath}`);

    const response = await engineFetch(ctx, "/tools/code-metadata-extractor", {
      method: "POST",
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Metadata extraction failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeMetadataExtractorResponseSchema.parse(
      await response.json(),
    );

    const resultText = `Functions: ${data.metadata.functions.length}, Classes: ${data.metadata.classes.length}, Lines: ${data.metadata.linesOfCode}`;
    ctx.onXmlComplete(
      `<dyad-code-metadata file="${escapeXmlAttr(args.filePath)}">${escapeXmlContent(resultText)}</dyad-code-metadata>`,
    );

    return resultText;
  },
};

// ============================================================================
// Code Fingerprint Generator (240)
// ============================================================================

const codeFingerprintGeneratorSchema = z.object({
  code: z.string().describe("Code snippet to generate fingerprint for"),
  sensitivity: z
    .enum(["low", "medium", "high"])
    .optional()
    .default("medium")
    .describe("Sensitivity of the fingerprint algorithm"),
});

const codeFingerprintGeneratorResponseSchema = z.object({
  fingerprint: z.string().describe("Unique fingerprint of the code"),
  metadata: z.object({
    sensitivity: z.string(),
    features: z.array(z.string()),
  }),
});

export const codeFingerprintGeneratorTool: ToolDefinition<
  z.infer<typeof codeFingerprintGeneratorSchema>
> = {
  name: "code_fingerprint_generator",
  description:
    "Generate unique fingerprints for code snippets to detect plagiarism, code duplication, and similar implementations. Fingerprints are robust to minor changes and formatting variations.",
  inputSchema: codeFingerprintGeneratorSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => ctx.isDyadPro,
  getConsentPreview: (args) => `Generate code fingerprint`,
  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<dyad-code-fingerprint>Generating code fingerprint...</dyad-code-fingerprint>`;
  },
  execute: async (args, ctx: AgentContext) => {
    logger.log("Generating code fingerprint");

    const response = await engineFetch(
      ctx,
      "/tools/code-fingerprint-generator",
      {
        method: "POST",
        body: JSON.stringify(args),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Code fingerprint generation failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = codeFingerprintGeneratorResponseSchema.parse(
      await response.json(),
    );

    ctx.onXmlComplete(
      `<dyad-code-fingerprint>Fingerprint generated successfully</dyad-code-fingerprint>`,
    );

    return `Generated code fingerprint successfully. Sensitivity: ${data.metadata.sensitivity}`;
  },
};
