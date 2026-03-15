/**
 * Knowledge Integration Layer - IPC Handlers
 * 
 * Provides IPC interface for renderer process to access
 * the Knowledge Integration Layer capabilities.
 */

import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import type {
  KnowledgeQuery,
  KnowledgeQueryResult,
  ArchitectureDecisionRecord,
  DecisionContext,
  AggregatedKnowledgeContext,
} from "./types";
import { QueryOrchestrator } from "./query_orchestrator";
import { KnowledgeAggregator } from "./knowledge_aggregator";
import { LearningRepository } from "./learning_repository";

// IPC Channel names
export const KIL_IPC_CHANNELS = {
  // Query operations
  QUERY: "kil:query",
  QUERY_SIMILAR: "kil:query-similar",
  GET_ENTITY: "kil:get-entity",
  GET_ENTITIES_BY_PATH: "kil:get-entities-by-path",

  // Decision operations
  RECORD_DECISION: "kil:record-decision",
  UPDATE_DECISION_OUTCOME: "kil:update-decision-outcome",
  GET_DECISION: "kil:get-decision",
  GET_DECISIONS_FOR_APP: "kil:get-decisions-for-app",
  FIND_SIMILAR_DECISIONS: "kil:find-similar-decisions",

  // Learning operations
  GET_LEARNED_PATTERNS: "kil:get-learned-patterns",
  GET_RECOMMENDATIONS: "kil:get-recommendations",
  ANALYZE_DECISION_QUALITY: "kil:analyze-decision-quality",

  // Context operations
  BUILD_CONTEXT: "kil:build-context",
  CLEAR_CACHE: "kil:clear-cache",
  GET_STATS: "kil:get-stats",
} as const;

/**
 * Knowledge Integration Layer IPC Handlers
 */
export class KnowledgeIntegrationIpcHandlers {
  private queryOrchestrator: QueryOrchestrator;
  private knowledgeAggregator: KnowledgeAggregator;
  private learningRepository: LearningRepository;

  constructor() {
    this.queryOrchestrator = new QueryOrchestrator();
    this.knowledgeAggregator = new KnowledgeAggregator();
    this.learningRepository = new LearningRepository();
  }

  /**
   * Register all IPC handlers
   */
  register(): void {
    // Query operations
    ipcMain.handle(KIL_IPC_CHANNELS.QUERY, this.handleQuery.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.QUERY_SIMILAR, this.handleQuerySimilar.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_ENTITY, this.handleGetEntity.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_ENTITIES_BY_PATH, this.handleGetEntitiesByPath.bind(this));

    // Decision operations
    ipcMain.handle(KIL_IPC_CHANNELS.RECORD_DECISION, this.handleRecordDecision.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.UPDATE_DECISION_OUTCOME, this.handleUpdateDecisionOutcome.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_DECISION, this.handleGetDecision.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_DECISIONS_FOR_APP, this.handleGetDecisionsForApp.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.FIND_SIMILAR_DECISIONS, this.handleFindSimilarDecisions.bind(this));

    // Learning operations
    ipcMain.handle(KIL_IPC_CHANNELS.GET_LEARNED_PATTERNS, this.handleGetLearnedPatterns.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_RECOMMENDATIONS, this.handleGetRecommendations.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.ANALYZE_DECISION_QUALITY, this.handleAnalyzeDecisionQuality.bind(this));

    // Context operations
    ipcMain.handle(KIL_IPC_CHANNELS.BUILD_CONTEXT, this.handleBuildContext.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.CLEAR_CACHE, this.handleClearCache.bind(this));
    ipcMain.handle(KIL_IPC_CHANNELS.GET_STATS, this.handleGetStats.bind(this));
  }

  /**
   * Unregister all IPC handlers
   */
  unregister(): void {
    for (const channel of Object.values(KIL_IPC_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  }

  // ============================================================================
  // QUERY HANDLERS
  // ============================================================================

  private async handleQuery(
    _event: Electron.IpcMainInvokeEvent,
    query: Omit<KnowledgeQuery, "id">
  ): Promise<KnowledgeQueryResult> {
    const fullQuery: KnowledgeQuery = {
      ...query,
      id: query.id || `query_${randomUUID()}`,
    };

    return this.queryOrchestrator.query(fullQuery);
  }

  private async handleQuerySimilar(
    _event: Electron.IpcMainInvokeEvent,
    entityId: string,
    options?: {
      sources?: string[];
      limit?: number;
      minSimilarity?: number;
    }
  ): Promise<unknown[]> {
    return this.queryOrchestrator.findSimilar(entityId, options as {
      sources?: ("code_graph" | "vector_memory" | "dependency_graph" | "architecture" | "reasoning" | "memory" | "all")[];
      limit?: number;
      minSimilarity?: number;
    });
  }

  private async handleGetEntity(
    _event: Electron.IpcMainInvokeEvent,
    entityId: string
  ): Promise<unknown> {
    return this.queryOrchestrator.getEntityById(entityId);
  }

  private async handleGetEntitiesByPath(
    _event: Electron.IpcMainInvokeEvent,
    appId: number,
    filePath: string,
    sources?: string[]
  ): Promise<unknown[]> {
    return this.queryOrchestrator.getEntitiesByPath(appId, filePath, sources as ("code_graph" | "vector_memory" | "dependency_graph" | "architecture" | "reasoning" | "memory" | "all")[]);
  }

  // ============================================================================
  // DECISION HANDLERS
  // ============================================================================

  private async handleRecordDecision(
    _event: Electron.IpcMainInvokeEvent,
    decision: Omit<ArchitectureDecisionRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<ArchitectureDecisionRecord> {
    return this.learningRepository.recordDecision(decision);
  }

  private async handleUpdateDecisionOutcome(
    _event: Electron.IpcMainInvokeEvent,
    decisionId: string,
    outcome: Partial<ArchitectureDecisionRecord["outcome"]>
  ): Promise<ArchitectureDecisionRecord | null> {
    return this.learningRepository.updateOutcome(decisionId, outcome);
  }

  private async handleGetDecision(
    _event: Electron.IpcMainInvokeEvent,
    decisionId: string
  ): Promise<ArchitectureDecisionRecord | null> {
    return this.learningRepository.getDecision(decisionId);
  }

  private async handleGetDecisionsForApp(
    _event: Electron.IpcMainInvokeEvent,
    appId: number,
    options?: {
      type?: string;
      status?: string;
      limit?: number;
    }
  ): Promise<ArchitectureDecisionRecord[]> {
    return this.learningRepository.getDecisionsForApp(appId, options as {
      type?: "pattern_selection" | "technology_choice" | "structure_change" | "dependency_addition" | "api_design" | "data_model" | "security_decision" | "performance_optimization" | "refactoring_strategy" | "testing_approach" | "deployment_strategy" | "custom";
      status?: "pending" | "success" | "partial" | "failure" | "reverted";
      limit?: number;
    });
  }

  private async handleFindSimilarDecisions(
    _event: Electron.IpcMainInvokeEvent,
    context: DecisionContext,
    options?: {
      limit?: number;
      minSimilarity?: number;
      includeOutcomes?: boolean;
    }
  ): Promise<Array<{ decision: ArchitectureDecisionRecord; similarity: number }>> {
    return this.learningRepository.findSimilarDecisions(context, options);
  }

  // ============================================================================
  // LEARNING HANDLERS
  // ============================================================================

  private async handleGetLearnedPatterns(
    _event: Electron.IpcMainInvokeEvent,
    appId: number,
    context?: DecisionContext
  ): Promise<unknown[]> {
    return this.learningRepository.getLearnedPatterns(appId, context);
  }

  private async handleGetRecommendations(
    _event: Electron.IpcMainInvokeEvent,
    appId: number,
    context: DecisionContext
  ): Promise<unknown[]> {
    return this.learningRepository.getRecommendations(appId, context);
  }

  private async handleAnalyzeDecisionQuality(
    _event: Electron.IpcMainInvokeEvent,
    appId: number
  ): Promise<unknown> {
    return this.learningRepository.analyzeDecisionQuality(appId);
  }

  // ============================================================================
  // CONTEXT HANDLERS
  // ============================================================================

  private async handleBuildContext(
    _event: Electron.IpcMainInvokeEvent,
    task: string,
    appId: number,
    options?: {
      includeDecisions?: boolean;
      includePatterns?: boolean;
      includeRecommendations?: boolean;
      maxEntities?: number;
    }
  ): Promise<AggregatedKnowledgeContext> {
    return this.knowledgeAggregator.buildAggregatedContext(task, appId, options);
  }

  private async handleClearCache(): Promise<void> {
    this.queryOrchestrator.clearCache();
    this.knowledgeAggregator.clearCache();
    this.learningRepository.clearCache();
  }

  private async handleGetStats(): Promise<{
    queryStats: unknown;
    cacheSize: number;
  }> {
    return {
      queryStats: this.queryOrchestrator.getStats(),
      cacheSize: 0, // Would be calculated from actual cache
    };
  }
}

/**
 * Initialize Knowledge Integration Layer IPC handlers
 */
export function initKnowledgeIntegrationIpcHandlers(): KnowledgeIntegrationIpcHandlers {
  const handlers = new KnowledgeIntegrationIpcHandlers();
  handlers.register();
  return handlers;
}

/**
 * Get IPC handler definitions for registration
 */
export function getKnowledgeIntegrationIpcHandlers(): Array<{
  channel: string;
  handler: (...args: unknown[]) => Promise<unknown>;
}> {
  const instance = new KnowledgeIntegrationIpcHandlers();
  
  return [
    { channel: KIL_IPC_CHANNELS.QUERY, handler: (q) => instance.handleQuery({} as Electron.IpcMainInvokeEvent, q as Omit<KnowledgeQuery, "id">) },
    { channel: KIL_IPC_CHANNELS.CLEAR_CACHE, handler: () => instance.handleClearCache() },
    { channel: KIL_IPC_CHANNELS.GET_STATS, handler: () => instance.handleGetStats() },
  ];
}
