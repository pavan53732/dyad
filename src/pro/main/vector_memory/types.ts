/**
 * Vector Semantic Memory - Type Definitions
 * 
 * Defines types for code embeddings, semantic memory storage,
 * and similarity retrieval operations.
 */

// ============================================================================
// Embedding Types
// ============================================================================

/**
 * Supported embedding models
 */
export type EmbeddingModel = 
  | "text-embedding-3-small"
  | "text-embedding-3-large"
  | "text-embedding-ada-002"
  | "local-all-minilm"
  | "local-bge-small"
  | "custom";

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  /** Model to use for embeddings */
  model: EmbeddingModel;
  /** Dimensionality of embeddings */
  dimensions: number;
  /** Batch size for batch embedding */
  batchSize: number;
  /** Whether to normalize embeddings */
  normalize: boolean;
  /** Maximum tokens per chunk */
  maxTokensPerChunk: number;
  /** Overlap between chunks */
  chunkOverlap: number;
}

/**
 * Default embedding configurations per model
 */
export const DEFAULT_EMBEDDING_CONFIGS: Record<EmbeddingModel, EmbeddingConfig> = {
  "text-embedding-3-small": {
    model: "text-embedding-3-small",
    dimensions: 1536,
    batchSize: 100,
    normalize: true,
    maxTokensPerChunk: 8000,
    chunkOverlap: 200,
  },
  "text-embedding-3-large": {
    model: "text-embedding-3-large",
    dimensions: 3072,
    batchSize: 100,
    normalize: true,
    maxTokensPerChunk: 8000,
    chunkOverlap: 200,
  },
  "text-embedding-ada-002": {
    model: "text-embedding-ada-002",
    dimensions: 1536,
    batchSize: 100,
    normalize: true,
    maxTokensPerChunk: 8000,
    chunkOverlap: 200,
  },
  "local-all-minilm": {
    model: "local-all-minilm",
    dimensions: 384,
    batchSize: 50,
    normalize: true,
    maxTokensPerChunk: 4000,
    chunkOverlap: 100,
  },
  "local-bge-small": {
    model: "local-bge-small",
    dimensions: 384,
    batchSize: 50,
    normalize: true,
    maxTokensPerChunk: 4000,
    chunkOverlap: 100,
  },
  custom: {
    model: "custom",
    dimensions: 1536,
    batchSize: 100,
    normalize: true,
    maxTokensPerChunk: 8000,
    chunkOverlap: 200,
  },
};

/**
 * A single embedding vector
 */
export type EmbeddingVector = number[];

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: EmbeddingVector;
  /** Text that was embedded */
  text: string;
  /** Hash of the text for deduplication */
  textHash: string;
  /** Model used */
  model: EmbeddingModel;
  /** Dimensions */
  dimensions: number;
  /** Processing time in ms */
  processingTime: number;
}

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Types of content that can be stored in semantic memory
 */
export type MemoryContentType = 
  | "code_snippet"
  | "function"
  | "class"
  | "file"
  | "documentation"
  | "error"
  | "solution"
  | "pattern"
  | "conversation"
  | "decision";

/**
 * A memory entry in the semantic memory store
 */
export interface MemoryEntry {
  /** Unique ID */
  id: string;
  /** Application ID */
  appId: number;
  /** Content type */
  contentType: MemoryContentType;
  /** Text content */
  content: string;
  /** Hash of content */
  contentHash: string;
  /** Embedding vector */
  embedding: EmbeddingVector;
  /** Embedding model used */
  embeddingModel: EmbeddingModel;
  /** Dimensionality */
  dimensions: number;
  /** Associated file path */
  filePath?: string;
  /** Line numbers */
  lineStart?: number;
  lineEnd?: number;
  /** Related knowledge graph node ID */
  knowledgeGraphNodeId?: string;
  /** Importance score (0-1) */
  importance: number;
  /** Access count */
  accessCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: Date;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Expiration timestamp (for temporary memories) */
  expiresAt?: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Memory entry for insertion
 */
export interface MemoryEntryInsert {
  appId: number;
  contentType: MemoryContentType;
  content: string;
  contentHash: string;
  embedding: EmbeddingVector;
  embeddingModel: EmbeddingModel;
  dimensions: number;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  knowledgeGraphNodeId?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Similarity metric for vector comparison
 */
export type SimilarityMetric = "cosine" | "euclidean" | "dot_product" | "manhattan";

/**
 * Search query options
 */
export interface SemanticSearchQuery {
  /** Application ID to search in */
  appId: number;
  /** Query text (will be embedded) or pre-computed embedding */
  query: string | EmbeddingVector;
  /** Content types to include */
  contentTypes?: MemoryContentType[];
  /** File path filter (supports glob) */
  filePathPattern?: string;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Maximum results */
  limit?: number;
  /** Similarity metric */
  metric?: SimilarityMetric;
  /** Include metadata in results */
  includeMetadata?: boolean;
  /** Time-based filtering */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Importance filter */
  minImportance?: number;
}

/**
 * Search result item
 */
export interface SemanticSearchResult {
  /** The memory entry */
  entry: MemoryEntry;
  /** Similarity score (0-1) */
  similarity: number;
  /** Rank in results */
  rank: number;
}

/**
 * Search response
 */
export interface SemanticSearchResponse {
  /** Results */
  results: SemanticSearchResult[];
  /** Query processing time in ms */
  processingTime: number;
  /** Total matching entries (before limit) */
  totalMatching: number;
  /** Whether results were from cache */
  fromCache: boolean;
}

// ============================================================================
// Memory Statistics
// ============================================================================

/**
 * Statistics about the semantic memory store
 */
export interface MemoryStats {
  /** Total entries */
  totalEntries: number;
  /** Entries by content type */
  entriesByType: Record<MemoryContentType, number>;
  /** Entries by app */
  entriesByApp: Record<number, number>;
  /** Average embedding dimensions */
  averageDimensions: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// Indexing Types
// ============================================================================

/**
 * Index status
 */
export type IndexStatus = 
  | "not_indexed"
  | "indexing"
  | "indexed"
  | "error";

/**
 * File indexing status
 */
export interface FileIndexStatus {
  /** File path */
  filePath: string;
  /** Status */
  status: IndexStatus;
  /** Number of chunks indexed */
  chunkCount: number;
  /** Last indexed timestamp */
  lastIndexedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Content hash at time of indexing */
  contentHash?: string;
}

/**
 * App indexing status
 */
export interface AppIndexStatus {
  /** App ID */
  appId: number;
  /** Overall status */
  status: IndexStatus;
  /** Files indexed */
  filesIndexed: number;
  /** Total files */
  totalFiles: number;
  /** Chunks indexed */
  chunksIndexed: number;
  /** Started at */
  startedAt?: Date;
  /** Completed at */
  completedAt?: Date;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// Chunking Types
// ============================================================================

/**
 * Text chunk for embedding
 */
export interface TextChunk {
  /** Chunk ID */
  id: string;
  /** Chunk text */
  text: string;
  /** Hash of text */
  textHash: string;
  /** Source file */
  sourcePath: string;
  /** Start line */
  lineStart: number;
  /** End line */
  lineEnd: number;
  /** Chunk index in file */
  chunkIndex: number;
  /** Total chunks in file */
  totalChunks: number;
  /** Overlap with previous chunk */
  overlapWithPrevious: number;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  /** Maximum chunk size in characters */
  maxChunkSize: number;
  /** Overlap between chunks */
  overlap: number;
  /** Respect code boundaries (functions, classes) */
  respectCodeBoundaries: boolean;
  /** Minimum chunk size */
  minChunkSize: number;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  EmbeddingModel,
  EmbeddingConfig,
  EmbeddingVector,
  EmbeddingResult,
  MemoryContentType,
  MemoryEntry,
  MemoryEntryInsert,
  SimilarityMetric,
  SemanticSearchQuery,
  SemanticSearchResult,
  SemanticSearchResponse,
  MemoryStats,
  IndexStatus,
  FileIndexStatus,
  AppIndexStatus,
  TextChunk,
  ChunkingOptions,
};

export { DEFAULT_EMBEDDING_CONFIGS };
