/**
 * Embedding Service
 *
 * Generates embeddings for code snippets and text using various models.
 * Supports OpenAI embeddings and local embedding models.
 */

import { createHash } from "node:crypto";
import type {
  EmbeddingModel,
  EmbeddingConfig,
  EmbeddingVector,
  EmbeddingResult,
  TextChunk,
  ChunkingOptions,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  batchSize: 100,
  normalize: true,
  maxTokensPerChunk: 8000,
  chunkOverlap: 200,
};

// ============================================================================
// Embedding Service Class
// ============================================================================

/**
 * EmbeddingService provides embedding generation capabilities
 */
export class EmbeddingService {
  private config: EmbeddingConfig;
  private apiKey?: string;
  private apiBaseUrl?: string;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set API configuration for OpenAI or compatible services
   */
  setApiConfig(apiKey: string, apiBaseUrl?: string): void {
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const textHash = this.hashText(text);

    // Try to use OpenAI API
    if (this.apiKey && this.isModelAvailable(this.config.model)) {
      const embedding = await this.embedWithOpenAI(text);
      return {
        embedding,
        text,
        textHash,
        model: this.config.model,
        dimensions: this.config.dimensions,
        processingTime: Date.now() - startTime,
      };
    }

    // Fallback to local/simple embedding
    const embedding = await this.embedLocally(text);
    return {
      embedding,
      text,
      textHash,
      model: this.config.model,
      dimensions: this.config.dimensions,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchResults = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Check if a model is available
   */
  private isModelAvailable(model: EmbeddingModel): boolean {
    const openaiModels: EmbeddingModel[] = [
      "text-embedding-3-small",
      "text-embedding-3-large",
      "text-embedding-ada-002",
    ];
    return openaiModels.includes(model);
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async embedWithOpenAI(text: string): Promise<EmbeddingVector> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const baseUrl = this.apiBaseUrl || "https://api.openai.com/v1";

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding as EmbeddingVector;

    // Normalize if configured
    if (this.config.normalize) {
      return this.normalizeVector(embedding);
    }

    return embedding;
  }

  /**
   * Generate a simple local embedding
   * Uses a hash-based approach for offline capability
   */
  private async embedLocally(text: string): Promise<EmbeddingVector> {
    // Simple embedding: use word frequency and positional encoding
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const dimensions = this.config.dimensions;
    const embedding = new Array(dimensions).fill(0);

    // Create a simple bag-of-words style embedding
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.hashWord(word);
      const position = i / words.length; // Normalized position

      // Add contribution to embedding dimensions
      for (let d = 0; d < dimensions; d++) {
        const contribution =
          Math.sin(hash * (d + 1) * 0.001) * (1 - position * 0.5);
        embedding[d] += contribution;
      }
    }

    // Normalize by word count
    if (words.length > 0) {
      for (let d = 0; d < dimensions; d++) {
        embedding[d] /= Math.sqrt(words.length);
      }
    }

    // L2 normalize
    return this.normalizeVector(embedding);
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(vector: EmbeddingVector): EmbeddingVector {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  /**
   * Hash text for deduplication
   */
  private hashText(text: string): string {
    return createHash("md5").update(text).digest("hex");
  }

  /**
   * Hash a word for embedding generation
   */
  private hashWord(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Chunk text for embedding with overlap
   */
  chunkText(text: string, options?: Partial<ChunkingOptions>): TextChunk[] {
    const opts = {
      maxChunkSize: options?.maxChunkSize ?? 1000,
      overlap: options?.overlap ?? 200,
      respectCodeBoundaries: options?.respectCodeBoundaries ?? true,
      minChunkSize: options?.minChunkSize ?? 100,
    };

    const chunks: TextChunk[] = [];
    const lines = text.split("\n");

    let currentChunk: string[] = [];
    let currentStartLine = 0;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);

      const currentLength = currentChunk.join("\n").length;

      // Check if we should split
      if (currentLength >= opts.maxChunkSize) {
        // Try to find a good boundary
        let splitIndex = currentChunk.length - 1;

        if (opts.respectCodeBoundaries) {
          // Look for code boundary markers
          for (let j = currentChunk.length - 1; j >= 0; j--) {
            const chunkLine = currentChunk[j];
            if (
              chunkLine.trim().startsWith("function ") ||
              chunkLine.trim().startsWith("class ") ||
              chunkLine.trim().startsWith("export ") ||
              chunkLine.trim().startsWith("//") ||
              chunkLine.trim() === ""
            ) {
              splitIndex = j;
              break;
            }
          }
        }

        const chunkLines = currentChunk.slice(0, splitIndex);
        const chunkText = chunkLines.join("\n");

        if (chunkText.length >= opts.minChunkSize) {
          chunks.push({
            id: `chunk-${chunkIndex}`,
            text: chunkText,
            textHash: this.hashText(chunkText),
            sourcePath: "", // Set by caller
            lineStart: currentStartLine + 1,
            lineEnd: currentStartLine + chunkLines.length,
            chunkIndex,
            totalChunks: 0, // Updated later
            overlapWithPrevious: chunkIndex > 0 ? opts.overlap : 0,
          });

          chunkIndex++;
          currentStartLine += splitIndex;

          // Keep overlap lines for context
          const overlapLineCount = Math.min(opts.overlap, splitIndex);
          currentChunk = currentChunk.slice(splitIndex - overlapLineCount);
        } else {
          // Keep building the chunk
          currentChunk = [line];
        }
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join("\n");
      chunks.push({
        id: `chunk-${chunkIndex}`,
        text: chunkText,
        textHash: this.hashText(chunkText),
        sourcePath: "",
        lineStart: currentStartLine + 1,
        lineEnd: lines.length,
        chunkIndex,
        totalChunks: 0,
        overlapWithPrevious: chunkIndex > 0 ? opts.overlap : 0,
      });
    }

    // Update total chunks count
    for (const chunk of chunks) {
      chunk.totalChunks = chunks.length;
    }

    return chunks;
  }

  /**
   * Compute similarity between two embeddings
   */
  computeSimilarity(
    a: EmbeddingVector,
    b: EmbeddingVector,
    metric: "cosine" | "euclidean" | "dot_product" = "cosine",
  ): number {
    if (a.length !== b.length) {
      throw new Error("Embeddings must have same dimensions");
    }

    switch (metric) {
      case "cosine":
        return this.cosineSimilarity(a, b);
      case "euclidean":
        return this.euclideanSimilarity(a, b);
      case "dot_product":
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  /**
   * Cosine similarity
   */
  private cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Euclidean similarity (converted to similarity)
   */
  private euclideanSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    let sumSquares = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sumSquares += diff * diff;
    }
    const distance = Math.sqrt(sumSquares);
    // Convert distance to similarity (0-1 range)
    return 1 / (1 + distance);
  }

  /**
   * Dot product similarity
   */
  private dotProduct(a: EmbeddingVector, b: EmbeddingVector): number {
    let product = 0;
    for (let i = 0; i < a.length; i++) {
      product += a[i] * b[i];
    }
    return product;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const embeddingService = new EmbeddingService();
