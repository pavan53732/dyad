/**
 * Knowledge Integration Layer - Module Entry Point
 *
 * Provides unified knowledge access across all sources:
 * - Code Graph (entities, relationships)
 * - Vector Memory (semantic search)
 * - Dependency Graph (package analysis)
 * - Architecture (decisions, patterns)
 * - Reasoning (traces, insights)
 *
 * ## Features
 *
 * - Unified query interface across all knowledge sources
 * - Cross-source entity resolution and deduplication
 * - Architecture decision recording with outcome tracking
 * - Learning from past decisions through similarity matching
 * - Knowledge context aggregation for complex tasks
 *
 * ## Evolution
 *
 * - Cycle 1: Initial KIL implementation with stub connectors
 * - Cycle 2: Wired source connectors to actual modules
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   QueryOrchestrator,
 *   KnowledgeAggregator,
 *   LearningRepository,
 *   sourceConnectorRegistry,
 * } from '@/pro/main/knowledge_integration';
 *
 * // Execute a unified query
 * const orchestrator = new QueryOrchestrator();
 * const result = await orchestrator.query({
 *   id: 'query-1',
 *   appId: 1,
 *   query: 'authentication flow',
 *   sources: ['code_graph', 'vector_memory'],
 * });
 *
 * // Record an architecture decision
 * const learning = new LearningRepository();
 * const decision = await learning.recordDecision({
 *   appId: 1,
 *   title: 'Use JWT for authentication',
 *   type: 'technology_choice',
 *   context: { problem: '...', constraints: [...], goals: [...] },
 *   alternatives: [...],
 *   selectedOption: 'JWT',
 *   rationale: '...',
 *   outcome: { status: 'pending' },
 *   confidence: 0.8,
 * });
 *
 * // Build aggregated context for a task
 * const aggregator = new KnowledgeAggregator();
 * const context = await aggregator.buildAggregatedContext(
 *   'Implement user authentication',
 *   1 // appId
 * );
 *
 * // Check source connector availability
 * const availability = await sourceConnectorRegistry.checkAvailability([
 *   'code_graph',
 *   'vector_memory',
 * ]);
 * ```
 */

// Core Components
export { QueryOrchestrator } from "./query_orchestrator";
export { KnowledgeAggregator } from "./knowledge_aggregator";
export { LearningRepository } from "./learning_repository";

// Source Connectors (Evolution Cycle 2)
export {
  sourceConnectorRegistry,
  SourceConnectorRegistry,
  CodeGraphSourceConnector,
  VectorMemorySourceConnector,
  DependencyGraphSourceConnector,
  ArchitectureSourceConnector,
  ReasoningSourceConnector,
  type SourceConnector,
} from "./source_connectors";

// Entity Mappers (Evolution Cycle 2)
export {
  mapNodeToEntity,
  mapNodesToEntities,
  mapMemoryEntryToEntity,
  mapMemoryEntriesToEntities,
  mapEntityTypesToNodeTypes,
  mapEntityTypesToContentTypes,
  mergeEntities,
  calculateRelevanceScore,
  sortByRelevance,
} from "./entity_mappers";

// Decision Persistence (Evolution Cycle 3)
export {
  decisionPersistence,
  DecisionPersistence,
  type LoadDecisionsOptions,
  type PersistedPattern,
  type DecisionStats,
} from "./decision_persistence";

// IPC Handlers
export {
  KnowledgeIntegrationIpcHandlers,
  initKnowledgeIntegrationIpcHandlers,
  getKnowledgeIntegrationIpcHandlers,
  KIL_IPC_CHANNELS,
} from "./ipc_handlers";

// Types
export type {
  // Source and Entity Types
  KnowledgeSource,
  KnowledgeEntityType,
  KnowledgeRelationType,
  UnifiedKnowledgeEntity,
  KnowledgeRelationship,

  // Query Types
  KnowledgeQuery,
  QueryContext,
  KnowledgeQueryResult,
  SourceQueryResult,
  KnowledgeInsight,

  // Learning Types
  ArchitectureDecisionRecord,
  ArchitectureDecisionType,
  DecisionContext,
  DecisionAlternative,
  DecisionOutcome,

  // Aggregation Types
  AggregatedKnowledgeContext,
  ContextRecommendation,

  // Event Types
  KnowledgeIntegrationEvent,
  KnowledgeIntegrationEventType,

  // Configuration Types
  KnowledgeIntegrationConfig,
} from "./types";

export { DEFAULT_KIL_CONFIG } from "./types";
