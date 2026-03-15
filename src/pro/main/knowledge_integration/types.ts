/**
 * Knowledge Integration Layer - Type Definitions
 * 
 * Unified types for cross-module knowledge queries and integration.
 * This module provides the type foundation for the Knowledge Integration Layer (KIL).
 */

// ============================================================================
// KNOWLEDGE SOURCE TYPES
// ============================================================================

/**
 * Available knowledge sources in the system
 */
export type KnowledgeSource = 
  | "code_graph"      // Code entities from knowledge graph
  | "vector_memory"   // Semantic embeddings
  | "dependency_graph" // Package dependencies
  | "architecture"     // Architecture decisions
  | "reasoning"        // Reasoning traces
  | "memory"           // Session/memory state
  | "all";             // Query all sources

/**
 * Knowledge entity types across all sources
 */
export type KnowledgeEntityType = 
  | "file"
  | "function"
  | "class"
  | "interface"
  | "module"
  | "package"
  | "component"
  | "api_endpoint"
  | "database_table"
  | "architecture_decision"
  | "reasoning_trace"
  | "pattern";

/**
 * Relationship types between knowledge entities
 */
export type KnowledgeRelationType = 
  | "imports"
  | "exports"
  | "calls"
  | "extends"
  | "implements"
  | "contains"
  | "depends_on"
  | "references"
  | "defines"
  | "uses"
  | "similar_to"
  | "related_to"
  | "architects"
  | "decides";

// ============================================================================
// UNIFIED KNOWLEDGE ENTITY
// ============================================================================

/**
 * Unified knowledge entity representation across all sources
 */
export interface UnifiedKnowledgeEntity {
  /** Unique identifier across all knowledge sources */
  id: string;
  
  /** Type of the entity */
  type: KnowledgeEntityType;
  
  /** Human-readable name */
  name: string;
  
  /** Source system that provided this entity */
  source: KnowledgeSource;
  
  /** Original source-specific ID (for reference) */
  sourceId: string;
  
  /** Application this entity belongs to */
  appId: number;
  
  /** File path if applicable */
  filePath?: string;
  
  /** Line range in source file */
  location?: {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
  };
  
  /** Semantic embedding vector (if available) */
  embedding?: number[];
  
  /** Entity-specific properties */
  properties: Record<string, unknown>;
  
  /** Metadata from the source system */
  metadata: {
    confidence: number;
    lastUpdated: Date;
    accessCount: number;
    sourceSpecific: Record<string, unknown>;
  };
  
  /** Relationships to other entities */
  relationships?: KnowledgeRelationship[];
}

/**
 * Relationship between knowledge entities
 */
export interface KnowledgeRelationship {
  /** Target entity ID */
  targetId: string;
  
  /** Type of relationship */
  type: KnowledgeRelationType;
  
  /** Relationship weight/strength */
  weight: number;
  
  /** Source of the relationship */
  source: KnowledgeSource;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Unified knowledge query interface
 */
export interface KnowledgeQuery {
  /** Query ID for tracking */
  id: string;
  
  /** Application context */
  appId: number;
  
  /** Query text (natural language or structured) */
  query: string;
  
  /** Sources to query (default: all) */
  sources?: KnowledgeSource[];
  
  /** Entity types to filter (optional) */
  entityTypes?: KnowledgeEntityType[];
  
  /** File path filter (optional) */
  filePath?: string;
  
  /** Maximum results per source */
  limit?: number;
  
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  
  /** Include relationships in results */
  includeRelationships?: boolean;
  
  /** Include embeddings in results */
  includeEmbeddings?: boolean;
  
  /** Query context for disambiguation */
  context?: QueryContext;
  
  /** Ranking strategy */
  rankingStrategy?: "relevance" | "confidence" | "recency" | "access" | "hybrid";
}

/**
 * Context for query disambiguation
 */
export interface QueryContext {
  /** Current task/goal */
  currentTask?: string;
  
  /** Active file being edited */
  activeFile?: string;
  
  /** Recent files accessed */
  recentFiles?: string[];
  
  /** Current git branch */
  gitBranch?: string;
  
  /** Architecture context */
  architectureContext?: {
    currentPattern?: string;
    constraints?: string[];
  };
  
  /** Custom context */
  custom?: Record<string, unknown>;
}

/**
 * Knowledge query result
 */
export interface KnowledgeQueryResult {
  /** Query that produced this result */
  queryId: string;
  
  /** Entities found */
  entities: UnifiedKnowledgeEntity[];
  
  /** Aggregated insights */
  insights: KnowledgeInsight[];
  
  /** Query metadata */
  metadata: {
    totalResults: number;
    sourcesQueried: KnowledgeSource[];
    queryTimeMs: number;
    confidence: number;
  };
  
  /** Source-specific results for debugging */
  sourceResults?: Map<KnowledgeSource, SourceQueryResult>;
}

/**
 * Result from a single source
 */
export interface SourceQueryResult {
  source: KnowledgeSource;
  entities: UnifiedKnowledgeEntity[];
  queryTimeMs: number;
  error?: string;
}

/**
 * Insight derived from cross-source analysis
 */
export interface KnowledgeInsight {
  /** Insight type */
  type: "pattern" | "anomaly" | "recommendation" | "relationship" | "dependency";
  
  /** Insight title */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Entities involved in this insight */
  entityIds: string[];
  
  /** Confidence in this insight */
  confidence: number;
  
  /** Source of this insight */
  derivedFrom: KnowledgeSource[];
  
  /** Actionable suggestions */
  suggestions?: string[];
}

// ============================================================================
// LEARNING TYPES
// ============================================================================

/**
 * Architecture Decision Record for learning
 */
export interface ArchitectureDecisionRecord {
  /** Unique ID */
  id: string;
  
  /** Application context */
  appId: number;
  
  /** Decision title */
  title: string;
  
  /** Decision description */
  description: string;
  
  /** Decision type */
  type: ArchitectureDecisionType;
  
  /** Context in which decision was made */
  context: DecisionContext;
  
  /** Alternatives considered */
  alternatives: DecisionAlternative[];
  
  /** Selected option */
  selectedOption: string;
  
  /** Rationale for selection */
  rationale: string;
  
  /** Decision outcome */
  outcome: DecisionOutcome;
  
  /** Confidence in the decision */
  confidence: number;
  
  /** Tags for categorization */
  tags: string[];
  
  /** Related entities from knowledge graph */
  relatedEntities: string[];
  
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
}

/**
 * Types of architecture decisions
 */
export type ArchitectureDecisionType = 
  | "pattern_selection"
  | "technology_choice"
  | "structure_change"
  | "dependency_addition"
  | "api_design"
  | "data_model"
  | "security_decision"
  | "performance_optimization"
  | "refactoring_strategy"
  | "testing_approach"
  | "deployment_strategy"
  | "custom";

/**
 * Context for architecture decision
 */
export interface DecisionContext {
  /** Problem being solved */
  problem: string;
  
  /** Constraints */
  constraints: string[];
  
  /** Goals */
  goals: string[];
  
  /** Relevant files/modules */
  relevantPaths: string[];
  
  /** Codebase context */
  codebaseState?: {
    totalFiles: number;
    languages: string[];
    frameworks: string[];
    patterns: string[];
  };
}

/**
 * Alternative option for a decision
 */
export interface DecisionAlternative {
  /** Option name */
  name: string;
  
  /** Option description */
  description: string;
  
  /** Pros of this option */
  pros: string[];
  
  /** Cons of this option */
  cons: string[];
  
  /** Estimated effort */
  effort: "low" | "medium" | "high";
  
  /** Risk level */
  risk: "low" | "medium" | "high";
  
  /** Why it was/wasn't selected */
  selectionReason?: string;
}

/**
 * Decision outcome tracking
 */
export interface DecisionOutcome {
  /** Outcome status */
  status: "pending" | "success" | "partial" | "failure" | "reverted";
  
  /** Metrics collected */
  metrics?: {
    implementationTime?: number;
    testsPassing?: boolean;
    performanceImpact?: number;
    codeQualityScore?: number;
    userSatisfaction?: number;
  };
  
  /** Lessons learned */
  lessonsLearned?: string[];
  
  /** Follow-up actions */
  followUpActions?: string[];
  
  /** When outcome was determined */
  determinedAt?: Date;
  
  /** Who/what determined the outcome */
  determinedBy?: "user" | "system" | "test" | "review";
}

// ============================================================================
// AGGREGATION TYPES
// ============================================================================

/**
 * Aggregated knowledge context for a specific task
 */
export interface AggregatedKnowledgeContext {
  /** Task description */
  task: string;
  
  /** Application ID */
  appId: number;
  
  /** Relevant code entities */
  codeEntities: UnifiedKnowledgeEntity[];
  
  /** Relevant dependencies */
  dependencies: UnifiedKnowledgeEntity[];
  
  /** Related architecture decisions */
  architectureDecisions: ArchitectureDecisionRecord[];
  
  /** Similar past decisions */
  similarDecisions: ArchitectureDecisionRecord[];
  
  /** Reasoning context */
  reasoningContext: {
    relevantTraces: string[];
    patterns: string[];
    antiPatterns: string[];
  };
  
  /** Recommendations based on context */
  recommendations: ContextRecommendation[];
  
  /** Context confidence score */
  confidence: number;
}

/**
 * Recommendation based on knowledge context
 */
export interface ContextRecommendation {
  /** Recommendation ID */
  id: string;
  
  /** Recommendation text */
  text: string;
  
  /** Recommendation type */
  type: "pattern" | "approach" | "tool" | "dependency" | "architecture";
  
  /** Confidence level */
  confidence: number;
  
  /** Source of this recommendation */
  sources: KnowledgeSource[];
  
  /** Supporting evidence */
  evidence: string[];
  
  /** Priority (1-10) */
  priority: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Knowledge integration event
 */
export interface KnowledgeIntegrationEvent {
  /** Event type */
  type: KnowledgeIntegrationEventType;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Application context */
  appId: number;
  
  /** Event payload */
  payload: unknown;
}

/**
 * Types of knowledge integration events
 */
export type KnowledgeIntegrationEventType = 
  | "query_executed"
  | "entity_created"
  | "entity_updated"
  | "entity_deleted"
  | "relationship_created"
  | "relationship_deleted"
  | "decision_recorded"
  | "outcome_updated"
  | "context_aggregated"
  | "learning_applied";

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Knowledge Integration Layer configuration
 */
export interface KnowledgeIntegrationConfig {
  /** Enable caching */
  enableCaching: boolean;
  
  /** Cache TTL in seconds */
  cacheTtl: number;
  
  /** Maximum query results */
  maxQueryResults: number;
  
  /** Default minimum confidence */
  defaultMinConfidence: number;
  
  /** Enable cross-source analysis */
  enableCrossSourceAnalysis: boolean;
  
  /** Enable learning from outcomes */
  enableLearning: boolean;
  
  /** Learning confidence threshold */
  learningConfidenceThreshold: number;
  
  /** Source weights for ranking */
  sourceWeights: Record<KnowledgeSource, number>;
}

/**
 * Default configuration
 */
export const DEFAULT_KIL_CONFIG: KnowledgeIntegrationConfig = {
  enableCaching: true,
  cacheTtl: 300, // 5 minutes
  maxQueryResults: 100,
  defaultMinConfidence: 0.5,
  enableCrossSourceAnalysis: true,
  enableLearning: true,
  learningConfidenceThreshold: 0.7,
  sourceWeights: {
    code_graph: 1.0,
    vector_memory: 0.8,
    dependency_graph: 0.9,
    architecture: 1.0,
    reasoning: 0.7,
    memory: 0.6,
    all: 1.0,
  },
};
