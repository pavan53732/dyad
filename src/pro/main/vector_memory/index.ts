/**
 * Vector Semantic Memory - Module Index
 *
 * This module provides semantic memory capabilities for code understanding,
 * including code embeddings, similarity search, and long-term memory storage.
 *
 * Main components:
 * - EmbeddingService: Generates code embeddings using various models
 * - VectorStorage: Persistent storage for embeddings with similarity search
 *
 * Usage:
 * ```typescript
 * import { embeddingService, vectorStorage } from "@/pro/main/vector_memory";
 *
 * // Generate embedding
 * const result = await embeddingService.embed("function foo() { return 42; }");
 *
 * // Store in memory
 * const entry = await vectorStorage.store({
 *   appId: 1,
 *   contentType: "function",
 *   content: "function foo() { return 42; }",
 *   contentHash: result.textHash,
 *   embedding: result.embedding,
 *   embeddingModel: result.model,
 *   dimensions: result.dimensions,
 * });
 *
 * // Search similar code
 * const results = await vectorStorage.search({
 *   appId: 1,
 *   query: "get value from function",
 *   limit: 5,
 * });
 * ```
 */

// Core types
export * from "./types";

// Embedding service
export { EmbeddingService, embeddingService } from "./embedding_service";

// Vector storage
export { VectorStorage, vectorStorage } from "./vector_storage";
