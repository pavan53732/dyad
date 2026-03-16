/**
 * Vector Storage Service
 *
 * Provides persistent storage for embeddings with efficient
 * similarity search capabilities.
 */

import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { semanticMemory } from "@/db/schema";
import { embeddingService } from "./embedding_service";
import type {
  EmbeddingVector,
  EmbeddingModel,
  MemoryContentType,
  MemoryEntry,
  MemoryEntryInsert,
  MemoryStats,
  SemanticSearchQuery,
  SemanticSearchResult,
  SemanticSearchResponse,
} from "./types";

// ============================================================================
// Vector Storage Class
// ============================================================================

/**
 * VectorStorage provides persistent storage and retrieval for embeddings
 */
export class VectorStorage {
  private cacheEnabled = true;
  private cache = new Map<string, MemoryEntry>();
  private maxCacheSize = 1000;

  // -------------------------------------------------------------------------
  // Entry Operations
  // -------------------------------------------------------------------------

  /**
   * Store a memory entry
   */
  async store(entry: MemoryEntryInsert): Promise<MemoryEntry> {
    const id = uuidv4();
    const now = new Date();
    const contentHash = entry.contentHash || this.hashContent(entry.content);

    const [inserted] = await db
      .insert(semanticMemory)
      .values({
        id,
        appId: entry.appId,
        contentType: entry.contentType,
        content: entry.content,
        contentHash,
        embedding: JSON.stringify(entry.embedding),
        embeddingModel: entry.embeddingModel,
        dimensions: entry.dimensions,
        filePath: entry.filePath,
        lineStart: entry.lineStart,
        lineEnd: entry.lineEnd,
        knowledgeGraphNodeId: entry.knowledgeGraphNodeId,
        importance: entry.importance ?? 0.5,
        accessCount: 0,
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      })
      .returning();

    const memoryEntry = this.rowToEntry(inserted);

    // Update cache
    if (this.cacheEnabled) {
      this.cache.set(id, memoryEntry);
      this.pruneCache();
    }

    return memoryEntry;
  }

  /**
   * Store multiple entries in batch
   */
  async storeBatch(entries: MemoryEntryInsert[]): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const entry of entries) {
      const result = await this.store(entry);
      results.push(result);
    }

    return results;
  }

  /**
   * Get a memory entry by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    // Check cache first
    if (this.cacheEnabled && this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const [row] = await db
      .select()
      .from(semanticMemory)
      .where(eq(semanticMemory.id, id))
      .limit(1);

    if (!row) return null;

    const entry = this.rowToEntry(row);

    // Update cache
    if (this.cacheEnabled) {
      this.cache.set(id, entry);
    }

    return entry;
  }

  /**
   * Get entries by app
   */
  async getByApp(
    appId: number,
    options?: { limit?: number; contentTypes?: MemoryContentType[] },
  ): Promise<MemoryEntry[]> {
    const conditions = [eq(semanticMemory.appId, appId)];

    if (options?.contentTypes && options.contentTypes.length > 0) {
      conditions.push(
        inArray(semanticMemory.contentType, options.contentTypes),
      );
    }

    const limit = options?.limit ?? 100;

    const rows = await db
      .select()
      .from(semanticMemory)
      .where(and(...conditions))
      .orderBy(desc(semanticMemory.createdAt))
      .limit(limit);

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Update a memory entry
   */
  async update(
    id: string,
    updates: Partial<
      Pick<MemoryEntry, "importance" | "metadata" | "accessCount">
    >,
  ): Promise<MemoryEntry | null> {
    const [updated] = await db
      .update(semanticMemory)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(semanticMemory.id, id))
      .returning();

    if (!updated) return null;

    const entry = this.rowToEntry(updated);

    // Update cache
    if (this.cacheEnabled) {
      this.cache.set(id, entry);
    }

    return entry;
  }

  /**
   * Increment access count
   */
  async recordAccess(id: string): Promise<void> {
    await db
      .update(semanticMemory)
      .set({
        accessCount: sql`${semanticMemory.accessCount} + 1`,
        lastAccessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(semanticMemory.id, id));
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(semanticMemory)
      .where(eq(semanticMemory.id, id))
      .returning({ id: semanticMemory.id });

    if (result.length > 0) {
      this.cache.delete(id);
      return true;
    }

    return false;
  }

  /**
   * Delete all entries for an app
   */
  async deleteByApp(appId: number): Promise<number> {
    const result = await db
      .delete(semanticMemory)
      .where(eq(semanticMemory.appId, appId))
      .returning({ id: semanticMemory.id });

    // Clear relevant cache entries
    for (const [key, entry] of this.cache) {
      if (entry.appId === appId) {
        this.cache.delete(key);
      }
    }

    return result.length;
  }

  // -------------------------------------------------------------------------
  // Search Operations
  // -------------------------------------------------------------------------

  /**
   * Perform semantic similarity search
   */
  async search(query: SemanticSearchQuery): Promise<SemanticSearchResponse> {
    const startTime = Date.now();

    // Get query embedding
    let queryEmbedding: EmbeddingVector;
    if (typeof query.query === "string") {
      const result = await embeddingService.embed(query.query);
      queryEmbedding = result.embedding;
    } else {
      queryEmbedding = query.query;
    }

    // Build filter conditions
    const conditions = [eq(semanticMemory.appId, query.appId)];

    if (query.contentTypes && query.contentTypes.length > 0) {
      conditions.push(inArray(semanticMemory.contentType, query.contentTypes));
    }

    // Get candidate entries
    const limit = query.limit ?? 10;
    const candidateLimit = Math.min(limit * 10, 1000);

    const rows = await db
      .select()
      .from(semanticMemory)
      .where(and(...conditions))
      .orderBy(desc(semanticMemory.importance))
      .limit(candidateLimit);

    // Compute similarities
    const results: SemanticSearchResult[] = [];
    const metric = query.metric ?? "cosine";
    const minSimilarity = query.minSimilarity ?? 0.5;

    for (const row of rows) {
      const entry = this.rowToEntry(row);
      const entryEmbedding = entry.embedding;

      // Apply filters
      if (query.filePathPattern && entry.filePath) {
        // Simple glob matching
        const pattern = query.filePathPattern.replace(/\*/g, ".*");
        if (!new RegExp(pattern).test(entry.filePath)) {
          continue;
        }
      }

      if (
        query.minImportance !== undefined &&
        entry.importance < query.minImportance
      ) {
        continue;
      }

      // Compute similarity
      const similarity = embeddingService.computeSimilarity(
        queryEmbedding,
        entryEmbedding,
        metric,
      );

      if (similarity >= minSimilarity) {
        results.push({
          entry,
          similarity,
          rank: 0, // Updated below
        });
      }
    }

    // Sort by similarity
    results.sort((a, b) => b.similarity - a.similarity);

    // Apply limit and set ranks
    const limitedResults = results.slice(0, limit);
    for (let i = 0; i < limitedResults.length; i++) {
      limitedResults[i].rank = i + 1;
    }

    // Record access for returned entries
    for (const result of limitedResults) {
      await this.recordAccess(result.entry.id);
    }

    return {
      results: limitedResults,
      processingTime: Date.now() - startTime,
      totalMatching: results.length,
      fromCache: false,
    };
  }

  /**
   * Find similar entries to a given entry
   */
  async findSimilar(
    entryId: string,
    options?: { limit?: number; minSimilarity?: number },
  ): Promise<SemanticSearchResult[]> {
    const entry = await this.get(entryId);
    if (!entry) return [];

    const response = await this.search({
      appId: entry.appId,
      query: entry.embedding,
      contentTypes: [entry.contentType],
      limit: options?.limit ?? 5,
      minSimilarity: options?.minSimilarity ?? 0.7,
    });

    // Filter out the original entry
    return response.results.filter((r) => r.entry.id !== entryId);
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /**
   * Get memory statistics
   */
  async getStats(appId: number): Promise<MemoryStats> {
    const rows = await db
      .select()
      .from(semanticMemory)
      .where(eq(semanticMemory.appId, appId));

    const entriesByType: Record<MemoryContentType, number> = {} as Record<
      MemoryContentType,
      number
    >;
    let totalDimensions = 0;

    for (const row of rows) {
      const type = row.contentType as MemoryContentType;
      entriesByType[type] = (entriesByType[type] || 0) + 1;
      totalDimensions += row.dimensions;
    }

    // Estimate memory usage (rough calculation)
    const avgDimensions = rows.length > 0 ? totalDimensions / rows.length : 0;
    const bytesPerFloat = 8; // 64-bit float
    const memoryUsage = rows.length * avgDimensions * bytesPerFloat;

    return {
      totalEntries: rows.length,
      entriesByType,
      entriesByApp: { [appId]: rows.length },
      averageDimensions: avgDimensions,
      memoryUsage,
      cacheHitRate: 0, // Would need tracking
      lastUpdated: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Convert database row to MemoryEntry
   */
  private rowToEntry(row: typeof semanticMemory.$inferSelect): MemoryEntry {
    return {
      id: row.id,
      appId: row.appId,
      contentType: row.contentType as MemoryContentType,
      content: row.content,
      contentHash: row.contentHash,
      embedding: JSON.parse(row.embedding) as EmbeddingVector,
      embeddingModel: row.embeddingModel as EmbeddingModel,
      dimensions: row.dimensions,
      filePath: row.filePath ?? undefined,
      lineStart: row.lineStart ?? undefined,
      lineEnd: row.lineEnd ?? undefined,
      knowledgeGraphNodeId: row.knowledgeGraphNodeId ?? undefined,
      importance: row.importance,
      accessCount: row.accessCount,
      lastAccessedAt: row.lastAccessedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    return createHash("md5").update(content).digest("hex");
  }

  /**
   * Prune cache if too large
   */
  private pruneCache(): void {
    if (this.cache.size > this.maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const keys = Array.from(this.cache.keys()).slice(
        0,
        this.cache.size - this.maxCacheSize,
      );
      for (const key of keys) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const vectorStorage = new VectorStorage();
