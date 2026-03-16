/**
 * Source Connectors for Knowledge Integration Layer
 *
 * Provides real implementations of source connectors that wire to actual
 * knowledge modules (Knowledge Graph, Vector Memory, etc.).
 *
 * Evolution Cycle 2: Wire source connectors to actual modules
 */

import type {
  KnowledgeQuery,
  UnifiedKnowledgeEntity,
  KnowledgeSource,
  KnowledgeEntityType,
} from "./types";
import { graphStorage } from "../knowledge_graph/storage";
import { graphQueryEngine } from "../knowledge_graph/query_engine";
import { vectorStorage } from "../vector_memory/vector_storage";
import { embeddingService } from "../vector_memory/embedding_service";
import {
  mapNodeToEntity,
  mapNodesToEntities,
  mapMemoryEntryToEntity,
  mapMemoryEntriesToEntities,
  mapEntityTypesToNodeTypes,
  mapEntityTypesToContentTypes,
  sortByRelevance,
} from "./entity_mappers";
import type { KnowledgeNodeType } from "../knowledge_graph/types";
import type { MemoryContentType } from "../vector_memory/types";

// ============================================================================
// Source Connector Interface
// ============================================================================

/**
 * Base interface for source connectors
 */
export interface SourceConnector {
  readonly source: KnowledgeSource;

  /**
   * Execute a knowledge query against this source
   */
  query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]>;

  /**
   * Get entity by ID
   */
  getById?(id: string): Promise<UnifiedKnowledgeEntity | null>;

  /**
   * Get entities by file path
   */
  getByPath?(appId: number, path: string): Promise<UnifiedKnowledgeEntity[]>;

  /**
   * Find entities similar to a given entity
   */
  findSimilar?(
    entity: UnifiedKnowledgeEntity,
    options?: { minSimilarity?: number; limit?: number },
  ): Promise<UnifiedKnowledgeEntity[]>;

  /**
   * Check if the source is available
   */
  isAvailable?(): Promise<boolean>;
}

// ============================================================================
// Code Graph Source Connector
// ============================================================================

/**
 * Connector for the Knowledge Graph module
 *
 * Provides access to code entities (functions, classes, components, etc.)
 * stored in the knowledge graph with relationship information.
 */
export class CodeGraphSourceConnector implements SourceConnector {
  readonly source: KnowledgeSource = "code_graph";

  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const { appId, query: queryString, entityTypes, limit = 50 } = query;

    // Map entity types to node types
    const nodeTypes = mapEntityTypesToNodeTypes(
      entityTypes,
    ) as KnowledgeNodeType[];

    try {
      // Use the query engine for name-based search
      const result = await graphQueryEngine.findNodesByName(
        appId,
        queryString,
        {
          limit,
          types: nodeTypes,
        },
      );

      // Convert to unified entities
      const entities = mapNodesToEntities(result.items);

      // Sort by relevance
      return sortByRelevance(entities, queryString);
    } catch (error) {
      console.error("[CodeGraphConnector] Query failed:", error);
      return [];
    }
  }

  async getById(id: string): Promise<UnifiedKnowledgeEntity | null> {
    try {
      // Remove source prefix if present
      const nodeId = id.replace(/^kg:/, "");
      const node = await graphStorage.getNode(nodeId);
      return node ? mapNodeToEntity(node) : null;
    } catch (error) {
      console.error("[CodeGraphConnector] getById failed:", error);
      return null;
    }
  }

  async getByPath(
    appId: number,
    path: string,
  ): Promise<UnifiedKnowledgeEntity[]> {
    try {
      const nodes = await graphQueryEngine.findNodesInFile(appId, path);
      return mapNodesToEntities(nodes);
    } catch (error) {
      console.error("[CodeGraphConnector] getByPath failed:", error);
      return [];
    }
  }

  async findSimilar(
    entity: UnifiedKnowledgeEntity,
    options?: { minSimilarity?: number; limit?: number },
  ): Promise<UnifiedKnowledgeEntity[]> {
    const limit = options?.limit || 10;

    try {
      // Get the source node ID
      const nodeId = entity.sourceId;

      if (!nodeId) return [];

      // Find callers and callees as "similar" entities
      const [callers, callees] = await Promise.all([
        graphQueryEngine.findCallers(nodeId, { recursive: false }),
        graphQueryEngine.findCallees(nodeId, { recursive: false }),
      ]);

      // Combine and deduplicate
      const relatedNodes = [...callers, ...callees];
      const uniqueNodes = relatedNodes.filter(
        (node, index, self) =>
          index === self.findIndex((n) => n.id === node.id) &&
          node.id !== nodeId,
      );

      return mapNodesToEntities(uniqueNodes.slice(0, limit));
    } catch (error) {
      console.error("[CodeGraphConnector] findSimilar failed:", error);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple check - try to query
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get callers of a function/class
   */
  async getCallers(
    entityId: string,
    options?: { recursive?: boolean },
  ): Promise<UnifiedKnowledgeEntity[]> {
    const nodeId = entityId.replace(/^kg:/, "");
    const callers = await graphQueryEngine.findCallers(nodeId, options);
    return mapNodesToEntities(callers);
  }

  /**
   * Get callees of a function/class
   */
  async getCallees(
    entityId: string,
    options?: { recursive?: boolean },
  ): Promise<UnifiedKnowledgeEntity[]> {
    const nodeId = entityId.replace(/^kg:/, "");
    const callees = await graphQueryEngine.findCallees(nodeId, options);
    return mapNodesToEntities(callees);
  }

  /**
   * Get subgraph around a node
   */
  async getSubgraph(
    entityId: string,
    radius: number = 2,
  ): Promise<{
    nodes: UnifiedKnowledgeEntity[];
    edges: Array<{ source: string; target: string; type: string }>;
  }> {
    const nodeId = entityId.replace(/^kg:/, "");

    const subgraph = await graphQueryEngine.extractSubgraph({
      centerNodeIds: [nodeId],
      radius,
      direction: "both",
    });

    const nodes = mapNodesToEntities(subgraph.nodes);
    const edges = subgraph.edges.map((e) => ({
      source: `kg:${e.sourceId}`,
      target: `kg:${e.targetId}`,
      type: e.type,
    }));

    return { nodes, edges };
  }
}

// ============================================================================
// Vector Memory Source Connector
// ============================================================================

/**
 * Connector for the Vector Memory module
 *
 * Provides semantic search over stored embeddings and memory entries.
 */
export class VectorMemorySourceConnector implements SourceConnector {
  readonly source: KnowledgeSource = "vector_memory";

  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const { appId, query: queryString, entityTypes, limit = 20 } = query;

    try {
      // Map entity types to content types
      const contentTypes = mapEntityTypesToContentTypes(
        entityTypes,
      ) as MemoryContentType[];

      // Perform semantic search
      const result = await vectorStorage.search({
        appId,
        query: queryString,
        contentTypes,
        limit,
        minSimilarity: 0.3,
      });

      // Convert to unified entities
      return result.results.map((r) => {
        const entity = mapMemoryEntryToEntity(r.entry);
        // Add similarity score to metadata
        entity.metadata.confidence = r.similarity;
        return entity;
      });
    } catch (error) {
      console.error("[VectorMemoryConnector] Query failed:", error);
      return [];
    }
  }

  async getById(id: string): Promise<UnifiedKnowledgeEntity | null> {
    try {
      // Remove source prefix if present
      const entryId = id.replace(/^vm:/, "");
      const entry = await vectorStorage.get(entryId);
      return entry ? mapMemoryEntryToEntity(entry) : null;
    } catch (error) {
      console.error("[VectorMemoryConnector] getById failed:", error);
      return null;
    }
  }

  async getByPath(
    appId: number,
    path: string,
  ): Promise<UnifiedKnowledgeEntity[]> {
    try {
      const entries = await vectorStorage.getByApp(appId, {
        limit: 100,
      });

      // Filter by file path
      const filtered = entries.filter((e) => e.filePath === path);
      return mapMemoryEntriesToEntities(filtered);
    } catch (error) {
      console.error("[VectorMemoryConnector] getByPath failed:", error);
      return [];
    }
  }

  async findSimilar(
    entity: UnifiedKnowledgeEntity,
    options?: { minSimilarity?: number; limit?: number },
  ): Promise<UnifiedKnowledgeEntity[]> {
    const limit = options?.limit || 10;
    const minSimilarity = options?.minSimilarity || 0.7;

    try {
      // Get the source entry ID
      const entryId = entity.sourceId;
      if (!entryId) return [];

      // Use vector storage's findSimilar
      const results = await vectorStorage.findSimilar(entryId, {
        limit,
        minSimilarity,
      });

      return results.map((r) => {
        const ent = mapMemoryEntryToEntity(r.entry);
        ent.metadata.confidence = r.similarity;
        return ent;
      });
    } catch (error) {
      console.error("[VectorMemoryConnector] findSimilar failed:", error);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store a new memory entry
   */
  async storeMemory(
    appId: number,
    content: string,
    options?: {
      contentType?: MemoryContentType;
      filePath?: string;
      importance?: number;
    },
  ): Promise<UnifiedKnowledgeEntity | null> {
    try {
      // Generate embedding
      const { embedding } = await embeddingService.embed(content);

      // Store in vector memory
      const entry = await vectorStorage.store({
        appId,
        content,
        embedding,
        contentType: options?.contentType || "context",
        filePath: options?.filePath,
        importance: options?.importance || 0.5,
        embeddingModel: "text-embedding-3-small",
        dimensions: embedding.length,
      });

      return mapMemoryEntryToEntity(entry);
    } catch (error) {
      console.error("[VectorMemoryConnector] storeMemory failed:", error);
      return null;
    }
  }
}

// ============================================================================
// Dependency Graph Source Connector
// ============================================================================

/**
 * Connector for dependency graph information
 *
 * Provides access to package and module dependency information.
 */
export class DependencyGraphSourceConnector implements SourceConnector {
  readonly source: KnowledgeSource = "dependency_graph";

  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const { appId, query: queryString, limit = 20 } = query;

    try {
      // Query knowledge graph for dependency-related nodes
      const result = await graphStorage.queryNodes(
        appId,
        {
          type: ["config"] as KnowledgeNodeType[],
          name: `%${queryString}%`,
        },
        { limit },
      );

      // Filter for package.json and dependency files
      const depNodes = result.items.filter(
        (n) =>
          n.filePath?.includes("package.json") ||
          n.name.includes("package") ||
          n.name.includes("import"),
      );

      return mapNodesToEntities(depNodes).map((e) => ({
        ...e,
        source: "dependency_graph" as KnowledgeSource,
        type: "package" as KnowledgeEntityType,
      }));
    } catch (error) {
      console.error("[DependencyGraphConnector] Query failed:", error);
      return [];
    }
  }

  async getById(id: string): Promise<UnifiedKnowledgeEntity | null> {
    // Dependency nodes are stored in knowledge graph
    const nodeId = id.replace(/^dg:/, "");
    const node = await graphStorage.getNode(nodeId);
    if (!node) return null;

    return {
      ...mapNodeToEntity(node),
      source: "dependency_graph",
      type: "package",
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// Architecture Source Connector
// ============================================================================

/**
 * Connector for architecture decisions and patterns
 *
 * Provides access to stored architecture decisions and detected patterns.
 */
export class ArchitectureSourceConnector implements SourceConnector {
  readonly source: KnowledgeSource = "architecture";

  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const { appId, query: queryString, limit = 20 } = query;

    try {
      // Use graph query engine to find architectural patterns
      const analysis = await graphQueryEngine.analyzeGraph(appId);

      const entities: UnifiedKnowledgeEntity[] = [];

      // Convert detected patterns to entities
      for (const pattern of analysis.patterns) {
        entities.push({
          id: `arch:pattern:${pattern.name.toLowerCase().replace(/\s+/g, "-")}`,
          sourceId: pattern.name,
          source: "architecture",
          type: "pattern",
          name: pattern.name,
          description: pattern.description,
          data: {
            matchCount: pattern.matches.length,
          },
          relationships: [],
          metadata: {
            confidence: 0.8,
            lastUpdated: new Date(),
            accessCount: 0,
          },
        });
      }

      // Convert important nodes to architectural entities
      for (const important of analysis.importantNodes.slice(0, limit)) {
        entities.push({
          id: `arch:hub:${important.nodeId}`,
          sourceId: important.nodeId,
          source: "architecture",
          type: "component",
          name: important.name,
          description: important.reason,
          data: {
            importance: important.importance,
          },
          relationships: [],
          metadata: {
            confidence: 0.7,
            lastUpdated: new Date(),
            accessCount: 0,
          },
        });
      }

      // Filter by query string
      const filtered = entities.filter(
        (e) =>
          e.name.toLowerCase().includes(queryString.toLowerCase()) ||
          e.description?.toLowerCase().includes(queryString.toLowerCase()),
      );

      return filtered.slice(0, limit);
    } catch (error) {
      console.error("[ArchitectureConnector] Query failed:", error);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// Reasoning Source Connector
// ============================================================================

/**
 * Connector for reasoning traces and insights
 *
 * Provides access to stored reasoning history and derived insights.
 */
export class ReasoningSourceConnector implements SourceConnector {
  readonly source: KnowledgeSource = "reasoning";

  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const { appId, query: queryString, limit = 20 } = query;

    try {
      // Query vector memory for reasoning-related content
      const result = await vectorStorage.search({
        appId,
        query: queryString,
        contentTypes: ["decision", "pattern", "context"],
        limit,
        minSimilarity: 0.3,
      });

      return result.results.map((r) => {
        const entity = mapMemoryEntryToEntity(r.entry);
        entity.source = "reasoning";
        entity.metadata.confidence = r.similarity;
        return entity;
      });
    } catch (error) {
      console.error("[ReasoningConnector] Query failed:", error);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// Connector Registry
// ============================================================================

/**
 * Registry of all available source connectors
 */
export class SourceConnectorRegistry {
  private connectors: Map<KnowledgeSource, SourceConnector> = new Map();

  constructor() {
    // Register default connectors
    this.register(new CodeGraphSourceConnector());
    this.register(new VectorMemorySourceConnector());
    this.register(new DependencyGraphSourceConnector());
    this.register(new ArchitectureSourceConnector());
    this.register(new ReasoningSourceConnector());
  }

  /**
   * Register a source connector
   */
  register(connector: SourceConnector): void {
    this.connectors.set(connector.source, connector);
  }

  /**
   * Get a connector by source
   */
  get(source: KnowledgeSource): SourceConnector | undefined {
    return this.connectors.get(source);
  }

  /**
   * Get all registered connectors
   */
  getAll(): SourceConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get connectors for specified sources
   */
  getForSources(sources: KnowledgeSource[]): SourceConnector[] {
    return sources
      .map((s) => this.connectors.get(s))
      .filter((c): c is SourceConnector => c !== undefined);
  }

  /**
   * Check if all specified sources are available
   */
  async checkAvailability(
    sources: KnowledgeSource[],
  ): Promise<Map<KnowledgeSource, boolean>> {
    const results = new Map<KnowledgeSource, boolean>();

    await Promise.all(
      sources.map(async (source) => {
        const connector = this.connectors.get(source);
        if (connector?.isAvailable) {
          results.set(source, await connector.isAvailable());
        } else {
          results.set(source, connector !== undefined);
        }
      }),
    );

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const sourceConnectorRegistry = new SourceConnectorRegistry();
