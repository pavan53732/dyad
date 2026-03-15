/**
 * Knowledge Aggregator - Cross-Module Data Fusion
 * 
 * Aggregates knowledge from multiple sources, performs entity resolution,
 * deduplication, and context enrichment for unified knowledge queries.
 */

import type {
  UnifiedKnowledgeEntity,
  KnowledgeSource,
  KnowledgeRelationship,
  KnowledgeInsight,
  AggregatedKnowledgeContext,
  ArchitectureDecisionRecord,
  ContextRecommendation,
  KnowledgeEntityType,
} from "./types";

/**
 * Knowledge Aggregator
 * 
 * Performs cross-source data fusion, entity resolution, and context enrichment.
 */
export class KnowledgeAggregator {
  private entityCache: Map<string, UnifiedKnowledgeEntity> = new Map();
  private relationshipIndex: Map<string, KnowledgeRelationship[]> = new Map();
  private sourcePriority: Map<KnowledgeSource, number>;

  constructor(sourcePriority?: Partial<Record<KnowledgeSource, number>>) {
    this.sourcePriority = new Map([
      ["code_graph", 1.0],
      ["architecture", 0.95],
      ["dependency_graph", 0.9],
      ["vector_memory", 0.8],
      ["reasoning", 0.7],
      ["memory", 0.6],
      ...Object.entries(sourcePriority || {}).map(([k, v]) => [k as KnowledgeSource, v as number]),
    ]);
  }

  /**
   * Aggregate entities from multiple sources
   */
  aggregateEntities(
    sourceResults: Map<KnowledgeSource, UnifiedKnowledgeEntity[]>
  ): UnifiedKnowledgeEntity[] {
    const allEntities: UnifiedKnowledgeEntity[] = [];

    for (const [source, entities] of sourceResults) {
      const priority = this.sourcePriority.get(source) || 0.5;
      for (const entity of entities) {
        const enrichedEntity = this.enrichEntity(entity, source, priority);
        allEntities.push(enrichedEntity);
      }
    }

    // Resolve duplicates
    const resolved = this.resolveEntities(allEntities);

    // Build relationship index
    this.buildRelationshipIndex(resolved);

    return resolved;
  }

  /**
   * Fuse entity data from multiple sources
   */
  fuseEntities(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity {
    if (entities.length === 0) {
      throw new Error("Cannot fuse empty entity list");
    }

    if (entities.length === 1) {
      return entities[0];
    }

    // Sort by source priority (highest first)
    const sorted = [...entities].sort((a, b) => {
      const priorityA = this.sourcePriority.get(a.source) || 0;
      const priorityB = this.sourcePriority.get(b.source) || 0;
      return priorityB - priorityA;
    });

    // Use highest priority entity as base
    const base = { ...sorted[0] };

    // Merge properties from other sources
    const mergedProperties: Record<string, unknown> = { ...base.properties };
    const allRelationships: KnowledgeRelationship[] = [...(base.relationships || [])];

    for (let i = 1; i < sorted.length; i++) {
      const entity = sorted[i];
      
      // Merge properties (lower priority sources fill in missing values)
      for (const [key, value] of Object.entries(entity.properties)) {
        if (mergedProperties[key] === undefined) {
          mergedProperties[key] = value;
        }
      }

      // Collect relationships
      allRelationships.push(...(entity.relationships || []));

      // Update confidence (weighted average)
      const baseWeight = this.sourcePriority.get(base.source) || 0.5;
      const entityWeight = this.sourcePriority.get(entity.source) || 0.5;
      const totalWeight = baseWeight + entityWeight;
      
      base.metadata.confidence = 
        (base.metadata.confidence * baseWeight + entity.metadata.confidence * entityWeight) / totalWeight;
    }

    // Deduplicate relationships
    base.relationships = this.deduplicateRelationships(allRelationships);
    base.properties = mergedProperties;

    // Update source to indicate fusion
    base.source = entities[0].source; // Keep primary source
    base.metadata.sourceSpecific.fusedFrom = entities.map(e => e.source);

    return base;
  }

  /**
   * Resolve entity conflicts using configurable strategies
   */
  resolveEntityConflict(
    entities: UnifiedKnowledgeEntity[],
    strategy: "priority" | "confidence" | "recency" | "merge" = "merge"
  ): UnifiedKnowledgeEntity {
    if (entities.length === 0) {
      throw new Error("Cannot resolve empty entity list");
    }

    if (entities.length === 1) {
      return entities[0];
    }

    switch (strategy) {
      case "priority":
        return this.resolveByPriority(entities);
      case "confidence":
        return this.resolveByConfidence(entities);
      case "recency":
        return this.resolveByRecency(entities);
      case "merge":
      default:
        return this.fuseEntities(entities);
    }
  }

  /**
   * Enrich entity with cross-source context
   */
  enrichEntity(
    entity: UnifiedKnowledgeEntity,
    source: KnowledgeSource,
    priority: number
  ): UnifiedKnowledgeEntity {
    // Calculate enriched confidence
    const baseConfidence = entity.metadata.confidence;
    const sourceWeightedConfidence = baseConfidence * priority;

    return {
      ...entity,
      metadata: {
        ...entity.metadata,
        confidence: sourceWeightedConfidence,
        sourceSpecific: {
          ...entity.metadata.sourceSpecific,
          sourcePriority: priority,
        },
      },
    };
  }

  /**
   * Get related entities for context building
   */
  getRelatedEntities(
    entityId: string,
    depth: number = 2,
    relationshipTypes?: string[]
  ): UnifiedKnowledgeEntity[] {
    const visited = new Set<string>();
    const related: UnifiedKnowledgeEntity[] = [];

    this.traverseRelationships(entityId, depth, visited, related, relationshipTypes);

    return related;
  }

  /**
   * Build aggregated knowledge context for a task
   */
  buildAggregatedContext(
    task: string,
    appId: number,
    options?: {
      includeDecisions?: boolean;
      includePatterns?: boolean;
      includeRecommendations?: boolean;
      maxEntities?: number;
    }
  ): AggregatedKnowledgeContext {
    const context: AggregatedKnowledgeContext = {
      task,
      appId,
      codeEntities: [],
      dependencies: [],
      architectureDecisions: [],
      similarDecisions: [],
      reasoningContext: {
        relevantTraces: [],
        patterns: [],
        antiPatterns: [],
      },
      recommendations: [],
      confidence: 0,
    };

    // Extract task keywords for matching
    const taskKeywords = this.extractKeywords(task);

    // Find relevant code entities
    for (const [id, entity] of this.entityCache) {
      if (entity.appId === appId) {
        const relevance = this.calculateTaskRelevance(entity, taskKeywords);
        if (relevance > 0.3) {
          context.codeEntities.push(entity);
        }
      }
    }

    // Sort by relevance and limit
    context.codeEntities = context.codeEntities
      .sort((a, b) => (b.metadata.confidence || 0) - (a.metadata.confidence || 0))
      .slice(0, options?.maxEntities || 50);

    // Calculate overall confidence
    if (context.codeEntities.length > 0) {
      const totalConfidence = context.codeEntities.reduce(
        (sum, e) => sum + (e.metadata.confidence || 0),
        0
      );
      context.confidence = totalConfidence / context.codeEntities.length;
    }

    return context;
  }

  /**
   * Generate recommendations from knowledge context
   */
  generateRecommendations(
    context: AggregatedKnowledgeContext
  ): ContextRecommendation[] {
    const recommendations: ContextRecommendation[] = [];

    // Analyze patterns in code entities
    const patternRecommendations = this.analyzePatterns(context.codeEntities);
    recommendations.push(...patternRecommendations);

    // Analyze dependencies
    const dependencyRecommendations = this.analyzeDependencies(context.dependencies);
    recommendations.push(...dependencyRecommendations);

    // Analyze architecture decisions
    const architectureRecommendations = this.analyzeArchitectureDecisions(
      context.architectureDecisions,
      context.similarDecisions
    );
    recommendations.push(...architectureRecommendations);

    // Sort by priority and confidence
    return recommendations
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.confidence - a.confidence;
      })
      .slice(0, 10);
  }

  /**
   * Clear internal caches
   */
  clearCache(): void {
    this.entityCache.clear();
    this.relationshipIndex.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private resolveEntities(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity[] {
    // Group entities by canonical ID
    const entityGroups = new Map<string, UnifiedKnowledgeEntity[]>();

    for (const entity of entities) {
      const canonicalId = this.getCanonicalId(entity);
      const group = entityGroups.get(canonicalId) || [];
      group.push(entity);
      entityGroups.set(canonicalId, group);
    }

    // Resolve each group
    const resolved: UnifiedKnowledgeEntity[] = [];
    for (const [id, group] of entityGroups) {
      if (group.length === 1) {
        resolved.push(group[0]);
      } else {
        resolved.push(this.fuseEntities(group));
      }
      // Cache the resolved entity
      this.entityCache.set(id, resolved[resolved.length - 1]);
    }

    return resolved;
  }

  private getCanonicalId(entity: UnifiedKnowledgeEntity): string {
    // Generate canonical ID based on entity type and properties
    if (entity.filePath && entity.name) {
      return `${entity.appId}:${entity.filePath}:${entity.name}:${entity.type}`;
    }
    return entity.id;
  }

  private resolveByPriority(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity {
    return entities.reduce((best, current) => {
      const bestPriority = this.sourcePriority.get(best.source) || 0;
      const currentPriority = this.sourcePriority.get(current.source) || 0;
      return currentPriority > bestPriority ? current : best;
    });
  }

  private resolveByConfidence(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity {
    return entities.reduce((best, current) => {
      return current.metadata.confidence > best.metadata.confidence ? current : best;
    });
  }

  private resolveByRecency(entities: UnifiedKnowledgeEntity[]): UnifiedKnowledgeEntity {
    return entities.reduce((best, current) => {
      const bestTime = best.metadata.lastUpdated.getTime();
      const currentTime = current.metadata.lastUpdated.getTime();
      return currentTime > bestTime ? current : best;
    });
  }

  private buildRelationshipIndex(entities: UnifiedKnowledgeEntity[]): void {
    for (const entity of entities) {
      for (const rel of entity.relationships || []) {
        const existing = this.relationshipIndex.get(entity.id) || [];
        existing.push(rel);
        this.relationshipIndex.set(entity.id, existing);
      }
    }
  }

  private deduplicateRelationships(
    relationships: KnowledgeRelationship[]
  ): KnowledgeRelationship[] {
    const seen = new Set<string>();
    const deduped: KnowledgeRelationship[] = [];

    for (const rel of relationships) {
      const key = `${rel.targetId}:${rel.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(rel);
      }
    }

    return deduped;
  }

  private traverseRelationships(
    entityId: string,
    depth: number,
    visited: Set<string>,
    result: UnifiedKnowledgeEntity[],
    relationshipTypes?: string[]
  ): void {
    if (depth <= 0 || visited.has(entityId)) {
      return;
    }

    visited.add(entityId);
    const relationships = this.relationshipIndex.get(entityId) || [];

    for (const rel of relationships) {
      if (relationshipTypes && !relationshipTypes.includes(rel.type)) {
        continue;
      }

      const relatedEntity = this.entityCache.get(rel.targetId);
      if (relatedEntity && !visited.has(rel.targetId)) {
        result.push(relatedEntity);
        this.traverseRelationships(rel.targetId, depth - 1, visited, result, relationshipTypes);
      }
    }
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "shall", "can", "need", "to", "of",
      "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "during", "before", "after", "above", "below", "between", "under",
      "again", "further", "then", "once", "and", "but", "or", "nor", "so",
      "yet", "both", "either", "neither", "not", "only", "own", "same",
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private calculateTaskRelevance(
    entity: UnifiedKnowledgeEntity,
    taskKeywords: string[]
  ): number {
    const entityWords = [
      entity.name.toLowerCase(),
      ...(entity.properties.description as string)?.toLowerCase() || "",
      entity.filePath?.toLowerCase() || "",
    ].join(" ");

    const matches = taskKeywords.filter(keyword => entityWords.includes(keyword));
    return matches.length / Math.max(taskKeywords.length, 1);
  }

  private analyzePatterns(entities: UnifiedKnowledgeEntity[]): ContextRecommendation[] {
    const recommendations: ContextRecommendation[] = [];

    // Analyze entity types distribution
    const typeCounts = new Map<KnowledgeEntityType, number>();
    for (const entity of entities) {
      typeCounts.set(entity.type, (typeCounts.get(entity.type) || 0) + 1);
    }

    // Check for common patterns
    const classCount = typeCounts.get("class") || 0;
    const functionCount = typeCounts.get("function") || 0;

    if (classCount > 0 && functionCount > classCount * 5) {
      recommendations.push({
        id: `rec-pattern-${Date.now()}-1`,
        text: "Consider organizing utility functions into service classes for better structure",
        type: "pattern",
        confidence: 0.7,
        sources: ["code_graph"],
        evidence: [`Found ${functionCount} functions vs ${classCount} classes`],
        priority: 6,
      });
    }

    return recommendations;
  }

  private analyzeDependencies(entities: UnifiedKnowledgeEntity[]): ContextRecommendation[] {
    const recommendations: ContextRecommendation[] = [];

    // Check for circular dependencies
    for (const entity of entities) {
      const visited = new Set<string>();
      if (this.hasCircularDependency(entity.id, visited)) {
        recommendations.push({
          id: `rec-dep-${Date.now()}-${entity.id}`,
          text: `Potential circular dependency detected involving ${entity.name}`,
          type: "dependency",
          confidence: 0.8,
          sources: ["dependency_graph"],
          evidence: [`Entity ${entity.name} has cyclic relationships`],
          priority: 8,
        });
        break; // Only report once
      }
    }

    return recommendations;
  }

  private hasCircularDependency(entityId: string, visited: Set<string>): boolean {
    if (visited.has(entityId)) {
      return true;
    }
    visited.add(entityId);

    const relationships = this.relationshipIndex.get(entityId) || [];
    for (const rel of relationships) {
      if (rel.type === "depends_on" || rel.type === "imports") {
        if (this.hasCircularDependency(rel.targetId, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  }

  private analyzeArchitectureDecisions(
    decisions: ArchitectureDecisionRecord[],
    similarDecisions: ArchitectureDecisionRecord[]
  ): ContextRecommendation[] {
    const recommendations: ContextRecommendation[] = [];

    // Learn from past decisions
    const successfulDecisions = decisions.filter(d => d.outcome.status === "success");
    
    if (successfulDecisions.length > 0) {
      const topDecision = successfulDecisions[0];
      recommendations.push({
        id: `rec-arch-${Date.now()}`,
        text: `Based on past success, consider ${topDecision.selectedOption} for similar scenarios`,
        type: "architecture",
        confidence: topDecision.confidence,
        sources: ["architecture"],
        evidence: [`Previous decision "${topDecision.title}" was successful`],
        priority: 7,
      });
    }

    return recommendations;
  }
}
