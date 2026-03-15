/**
 * Query Orchestrator - Unified Knowledge Query Interface
 * 
 * Provides a single entry point for querying all knowledge sources.
 * Orchestrates queries across Code Graph, Vector Memory, Dependency Graph,
 * Architecture Repository, and Reasoning Infrastructure.
 */

import type {
  KnowledgeQuery,
  KnowledgeQueryResult,
  KnowledgeSource,
  UnifiedKnowledgeEntity,
  KnowledgeInsight,
  SourceQueryResult,
  KnowledgeIntegrationConfig,
  DEFAULT_KIL_CONFIG,
} from "./types";

/**
 * Query Orchestrator
 * 
 * Central hub for knowledge queries. Routes queries to appropriate sources,
 * aggregates results, and applies ranking strategies.
 */
export class QueryOrchestrator {
  private config: KnowledgeIntegrationConfig;
  private cache: Map<string, CachedQueryResult> = new Map();
  private sourceConnectors: Map<KnowledgeSource, SourceConnector> = new Map();
  private queryStats: QueryStats = {
    totalQueries: 0,
    cacheHits: 0,
    averageQueryTime: 0,
    sourceStats: new Map(),
  };

  constructor(config?: Partial<KnowledgeIntegrationConfig>) {
    this.config = { ...DEFAULT_KIL_CONFIG, ...config };
    this.initializeSourceConnectors();
  }

  /**
   * Execute a unified knowledge query
   */
  async query(query: KnowledgeQuery): Promise<KnowledgeQueryResult> {
    const startTime = Date.now();
    this.queryStats.totalQueries++;

    // Check cache if enabled
    if (this.config.enableCaching) {
      const cached = this.getCachedResult(query);
      if (cached) {
        this.queryStats.cacheHits++;
        return cached;
      }
    }

    // Determine sources to query
    const sources = query.sources || this.getDefaultSources();
    
    // Execute parallel queries to all sources
    const sourceResults = await this.executeSourceQueries(query, sources);
    
    // Aggregate results
    const entities = this.aggregateEntities(sourceResults);
    
    // Apply ranking strategy
    const rankedEntities = this.rankEntities(entities, query);
    
    // Generate cross-source insights
    const insights = this.generateInsights(rankedEntities, sourceResults);
    
    // Build result
    const result: KnowledgeQueryResult = {
      queryId: query.id,
      entities: rankedEntities.slice(0, query.limit || this.config.maxQueryResults),
      insights,
      metadata: {
        totalResults: entities.length,
        sourcesQueried: sources,
        queryTimeMs: Date.now() - startTime,
        confidence: this.calculateOverallConfidence(rankedEntities),
      },
      sourceResults: this.toSourceResultMap(sourceResults),
    };

    // Cache result
    if (this.config.enableCaching) {
      this.cacheResult(query, result);
    }

    // Update stats
    this.updateQueryStats(sources, Date.now() - startTime);

    return result;
  }

  /**
   * Query for entities similar to a given entity
   */
  async findSimilar(
    entityId: string,
    options?: {
      sources?: KnowledgeSource[];
      limit?: number;
      minSimilarity?: number;
    }
  ): Promise<UnifiedKnowledgeEntity[]> {
    const sources = options?.sources || ["vector_memory", "code_graph"];
    
    // Get the source entity first
    const sourceEntity = await this.getEntityById(entityId);
    if (!sourceEntity) {
      return [];
    }

    // Query each source for similar entities
    const similarEntities: UnifiedKnowledgeEntity[] = [];
    
    for (const source of sources) {
      const connector = this.sourceConnectors.get(source);
      if (connector?.findSimilar) {
        const results = await connector.findSimilar(sourceEntity, options);
        similarEntities.push(...results);
      }
    }

    // Deduplicate and rank by similarity
    const deduped = this.deduplicateEntities(similarEntities);
    return deduped
      .filter(e => e.id !== entityId)
      .slice(0, options?.limit || 10);
  }

  /**
   * Get entity by ID across all sources
   */
  async getEntityById(entityId: string): Promise<UnifiedKnowledgeEntity | null> {
    // Try each source
    for (const [source, connector] of this.sourceConnectors) {
      if (connector.getById) {
        const entity = await connector.getById(entityId);
        if (entity) {
          return entity;
        }
      }
    }
    return null;
  }

  /**
   * Get entities by file path
   */
  async getEntitiesByPath(
    appId: number,
    filePath: string,
    sources?: KnowledgeSource[]
  ): Promise<UnifiedKnowledgeEntity[]> {
    const querySources = sources || ["code_graph", "vector_memory"];
    const entities: UnifiedKnowledgeEntity[] = [];

    for (const source of querySources) {
      const connector = this.sourceConnectors.get(source);
      if (connector?.getByPath) {
        const results = await connector.getByPath(appId, filePath);
        entities.push(...results);
      }
    }

    return this.deduplicateEntities(entities);
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get query statistics
   */
  getStats(): QueryStats {
    return { ...this.queryStats };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private initializeSourceConnectors(): void {
    // Initialize source connectors
    // These will be connected to actual modules via dependency injection
    this.sourceConnectors.set("code_graph", new CodeGraphConnector());
    this.sourceConnectors.set("vector_memory", new VectorMemoryConnector());
    this.sourceConnectors.set("dependency_graph", new DependencyGraphConnector());
    this.sourceConnectors.set("architecture", new ArchitectureConnector());
    this.sourceConnectors.set("reasoning", new ReasoningConnector());
    this.sourceConnectors.set("memory", new MemoryConnector());
  }

  private getDefaultSources(): KnowledgeSource[] {
    return [
      "code_graph",
      "vector_memory",
      "dependency_graph",
      "architecture",
    ];
  }

  private async executeSourceQueries(
    query: KnowledgeQuery,
    sources: KnowledgeSource[]
  ): Promise<Map<KnowledgeSource, SourceQueryResult>> {
    const results = new Map<KnowledgeSource, SourceQueryResult>();

    // Execute queries in parallel
    const queryPromises = sources.map(async (source) => {
      const startTime = Date.now();
      const connector = this.sourceConnectors.get(source);
      
      try {
        const entities = connector
          ? await connector.query(query)
          : [];
        
        return {
          source,
          result: {
            source,
            entities,
            queryTimeMs: Date.now() - startTime,
          } as SourceQueryResult,
        };
      } catch (error) {
        return {
          source,
          result: {
            source,
            entities: [],
            queryTimeMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : "Unknown error",
          } as SourceQueryResult,
        };
      }
    });

    const queryResults = await Promise.all(queryPromises);
    for (const { source, result } of queryResults) {
      results.set(source, result);
    }

    return results;
  }

  private aggregateEntities(
    sourceResults: Map<KnowledgeSource, SourceQueryResult>
  ): UnifiedKnowledgeEntity[] {
    const allEntities: UnifiedKnowledgeEntity[] = [];
    
    for (const [, result] of sourceResults) {
      allEntities.push(...result.entities);
    }

    return allEntities;
  }

  private rankEntities(
    entities: UnifiedKnowledgeEntity[],
    query: KnowledgeQuery
  ): UnifiedKnowledgeEntity[] {
    const strategy = query.rankingStrategy || "hybrid";

    switch (strategy) {
      case "relevance":
        return this.rankByRelevance(entities, query);
      case "confidence":
        return this.rankByConfidence(entities);
      case "recency":
        return this.rankByRecency(entities);
      case "access":
        return this.rankByAccess(entities);
      case "hybrid":
      default:
        return this.rankByHybrid(entities, query);
    }
  }

  private rankByRelevance(
    entities: UnifiedKnowledgeEntity[],
    query: KnowledgeQuery
  ): UnifiedKnowledgeEntity[] {
    // Score based on query relevance
    return entities.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, query);
      const scoreB = this.calculateRelevanceScore(b, query);
      return scoreB - scoreA;
    });
  }

  private rankByConfidence(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity[] {
    return entities.sort((a, b) => {
      return b.metadata.confidence - a.metadata.confidence;
    });
  }

  private rankByRecency(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity[] {
    return entities.sort((a, b) => {
      const timeA = a.metadata.lastUpdated.getTime();
      const timeB = b.metadata.lastUpdated.getTime();
      return timeB - timeA;
    });
  }

  private rankByAccess(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity[] {
    return entities.sort((a, b) => {
      return b.metadata.accessCount - a.metadata.accessCount;
    });
  }

  private rankByHybrid(
    entities: UnifiedKnowledgeEntity[],
    query: KnowledgeQuery
  ): UnifiedKnowledgeEntity[] {
    return entities.sort((a, b) => {
      // Combine multiple factors
      const scoreA = 
        this.calculateRelevanceScore(a, query) * 0.4 +
        a.metadata.confidence * 0.3 +
        this.calculateRecencyScore(a) * 0.2 +
        this.calculateAccessScore(a) * 0.1;
      
      const scoreB = 
        this.calculateRelevanceScore(b, query) * 0.4 +
        b.metadata.confidence * 0.3 +
        this.calculateRecencyScore(b) * 0.2 +
        this.calculateAccessScore(b) * 0.1;
      
      return scoreB - scoreA;
    });
  }

  private calculateRelevanceScore(
    entity: UnifiedKnowledgeEntity,
    query: KnowledgeQuery
  ): number {
    let score = 0;
    const queryLower = query.query.toLowerCase();
    
    // Name match
    if (entity.name.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }
    
    // Path match
    if (entity.filePath?.toLowerCase().includes(queryLower)) {
      score += 0.3;
    }
    
    // Type match
    if (query.entityTypes?.includes(entity.type)) {
      score += 0.2;
    }
    
    // Source weight
    score *= this.config.sourceWeights[entity.source] || 1.0;
    
    return score;
  }

  private calculateRecencyScore(entity: UnifiedKnowledgeEntity): number {
    const age = Date.now() - entity.metadata.lastUpdated.getTime();
    const dayInMs = 24 * 60 * 60 * 1000;
    return Math.max(0, 1 - (age / (7 * dayInMs))); // Decay over 7 days
  }

  private calculateAccessScore(entity: UnifiedKnowledgeEntity): number {
    // Normalize access count (assuming reasonable max of 100 accesses)
    return Math.min(1, entity.metadata.accessCount / 100);
  }

  private generateInsights(
    entities: UnifiedKnowledgeEntity[],
    sourceResults: Map<KnowledgeSource, SourceQueryResult>
  ): KnowledgeInsight[] {
    const insights: KnowledgeInsight[] = [];

    if (!this.config.enableCrossSourceAnalysis) {
      return insights;
    }

    // Analyze entity relationships for patterns
    const relationshipInsights = this.analyzeRelationships(entities);
    insights.push(...relationshipInsights);

    // Analyze source overlap for confidence
    const overlapInsights = this.analyzeSourceOverlap(entities, sourceResults);
    insights.push(...overlapInsights);

    return insights;
  }

  private analyzeRelationships(entities: UnifiedKnowledgeEntity[]): KnowledgeInsight[] {
    const insights: KnowledgeInsight[] = [];

    // Find highly connected entities
    const connectionCounts = new Map<string, number>();
    for (const entity of entities) {
      for (const rel of entity.relationships || []) {
        connectionCounts.set(rel.targetId, (connectionCounts.get(rel.targetId) || 0) + 1);
      }
    }

    // Identify hub entities
    const hubs = Array.from(connectionCounts.entries())
      .filter(([, count]) => count >= 3)
      .map(([id, count]) => ({ id, count }));

    if (hubs.length > 0) {
      insights.push({
        type: "pattern",
        title: "Highly Connected Entities",
        description: `Found ${hubs.length} entities with 3+ connections, indicating potential architectural significance`,
        entityIds: hubs.map(h => h.id),
        confidence: 0.8,
        derivedFrom: ["code_graph"],
        suggestions: ["Consider if these hub entities represent core domain concepts"],
      });
    }

    return insights;
  }

  private analyzeSourceOverlap(
    entities: UnifiedKnowledgeEntity[],
    sourceResults: Map<KnowledgeSource, SourceQueryResult>
  ): KnowledgeInsight[] {
    const insights: KnowledgeInsight[] = [];

    // Count entities found in multiple sources
    const entitySourceCount = new Map<string, Set<KnowledgeSource>>();
    
    for (const [source, result] of sourceResults) {
      for (const entity of result.entities) {
        if (!entitySourceCount.has(entity.id)) {
          entitySourceCount.set(entity.id, new Set());
        }
        entitySourceCount.get(entity.id)!.add(source);
      }
    }

    const multiSourceEntities = Array.from(entitySourceCount.entries())
      .filter(([, sources]) => sources.size > 1);

    if (multiSourceEntities.length > 0) {
      insights.push({
        type: "recommendation",
        title: "Cross-Validated Entities",
        description: `${multiSourceEntities.length} entities were found in multiple sources, indicating higher confidence`,
        entityIds: multiSourceEntities.map(([id]) => id),
        confidence: 0.9,
        derivedFrom: Array.from(sourceResults.keys()),
      });
    }

    return insights;
  }

  private deduplicateEntities(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity[] {
    const seen = new Set<string>();
    const deduped: UnifiedKnowledgeEntity[] = [];

    for (const entity of entities) {
      if (!seen.has(entity.id)) {
        seen.add(entity.id);
        deduped.push(entity);
      }
    }

    return deduped;
  }

  private calculateOverallConfidence(entities: UnifiedKnowledgeEntity[]): number {
    if (entities.length === 0) return 0;
    const total = entities.reduce((sum, e) => sum + e.metadata.confidence, 0);
    return total / entities.length;
  }

  private getCachedResult(query: KnowledgeQuery): KnowledgeQueryResult | null {
    const cacheKey = this.getCacheKey(query);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl * 1000) {
      return cached.result;
    }
    
    return null;
  }

  private cacheResult(query: KnowledgeQuery, result: KnowledgeQueryResult): void {
    const cacheKey = this.getCacheKey(query);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
  }

  private getCacheKey(query: KnowledgeQuery): string {
    return JSON.stringify({
      appId: query.appId,
      query: query.query,
      sources: query.sources?.sort(),
      entityTypes: query.entityTypes?.sort(),
      limit: query.limit,
    });
  }

  private toSourceResultMap(
    results: Map<KnowledgeSource, SourceQueryResult>
  ): Map<KnowledgeSource, SourceQueryResult> {
    return new Map(results);
  }

  private updateQueryStats(sources: KnowledgeSource[], queryTime: number): void {
    // Update average query time
    const prevTotal = this.queryStats.averageQueryTime * (this.queryStats.totalQueries - 1);
    this.queryStats.averageQueryTime = (prevTotal + queryTime) / this.queryStats.totalQueries;

    // Update source stats
    for (const source of sources) {
      const stats = this.queryStats.sourceStats.get(source) || { queries: 0, totalTime: 0 };
      stats.queries++;
      stats.totalTime += queryTime;
      this.queryStats.sourceStats.set(source, stats);
    }
  }
}

// ============================================================================
// SOURCE CONNECTORS
// ============================================================================

/**
 * Base connector interface for knowledge sources
 */
interface SourceConnector {
  query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]>;
  getById?(id: string): Promise<UnifiedKnowledgeEntity | null>;
  getByPath?(appId: number, path: string): Promise<UnifiedKnowledgeEntity[]>;
  findSimilar?(entity: UnifiedKnowledgeEntity, options?: { minSimilarity?: number; limit?: number }): Promise<UnifiedKnowledgeEntity[]>;
}

/**
 * Code Graph Connector
 * Connects to the Knowledge Graph module
 */
class CodeGraphConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // This would be connected to the actual Knowledge Graph module
    // For now, return empty array - will be wired in integration phase
    return [];
  }

  async getById(id: string): Promise<UnifiedKnowledgeEntity | null> {
    // Query knowledge graph by ID
    return null;
  }

  async getByPath(appId: number, path: string): Promise<UnifiedKnowledgeEntity[]> {
    // Query knowledge graph by file path
    return [];
  }
}

/**
 * Vector Memory Connector
 * Connects to the Vector Memory module
 */
class VectorMemoryConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // This would be connected to the actual Vector Memory module
    return [];
  }

  async findSimilar(
    entity: UnifiedKnowledgeEntity,
    options?: { minSimilarity?: number; limit?: number }
  ): Promise<UnifiedKnowledgeEntity[]> {
    // Semantic similarity search using embeddings
    return [];
  }
}

/**
 * Dependency Graph Connector
 * Connects to dependency analysis tools
 */
class DependencyGraphConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // Query dependency graph
    return [];
  }
}

/**
 * Architecture Connector
 * Connects to architecture decision repository
 */
class ArchitectureConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // Query architecture decisions
    return [];
  }
}

/**
 * Reasoning Connector
 * Connects to reasoning infrastructure
 */
class ReasoningConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // Query reasoning traces
    return [];
  }
}

/**
 * Memory Connector
 * Connects to session/memory storage
 */
class MemoryConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // Query memory/state
    return [];
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface CachedQueryResult {
  result: KnowledgeQueryResult;
  timestamp: number;
}

interface QueryStats {
  totalQueries: number;
  cacheHits: number;
  averageQueryTime: number;
  sourceStats: Map<KnowledgeSource, { queries: number; totalTime: number }>;
}

// Import DEFAULT_KIL_CONFIG from types
import { DEFAULT_KIL_CONFIG as importedConfig } from "./types";
const DEFAULT_KIL_CONFIG = importedConfig;
