/**
 * Knowledge Graph Storage Service
 * 
 * Provides persistent storage operations for the knowledge graph.
 * Uses SQLite via Drizzle ORM for node and edge persistence.
 */

import { eq, and, or, inArray, like, sql, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db";
import {
  knowledgeNodes,
  knowledgeEdges,
  knowledgeGraphSnapshots,
} from "@/db/schema";
import type {
  KnowledgeNodeType,
  KnowledgeEdgeType,
  KnowledgeQueryFilter,
  KnowledgeQueryResult,
  GraphTraversalOptions,
} from "./types";

// Type aliases for database rows
export type KnowledgeNodeRow = typeof knowledgeNodes.$inferSelect;
export type KnowledgeNodeInsert = typeof knowledgeNodes.$inferInsert;
export type KnowledgeEdgeRow = typeof knowledgeEdges.$inferSelect;
export type KnowledgeEdgeInsert = typeof knowledgeEdges.$inferInsert;

// ============================================================================
// Storage Service Class
// ============================================================================

/**
 * GraphStorage provides all database operations for the knowledge graph
 */
export class GraphStorage {
  // -------------------------------------------------------------------------
  // Node Operations
  // -------------------------------------------------------------------------

  /**
   * Insert a new node into the knowledge graph
   */
  async insertNode(node: Omit<KnowledgeNodeInsert, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeNodeRow> {
    const id = uuidv4();
    const now = new Date();

    const [inserted] = await db.insert(knowledgeNodes).values({
      id,
      ...node,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return inserted;
  }

  /**
   * Insert multiple nodes in a batch operation
   */
  async insertNodes(nodes: Array<Omit<KnowledgeNodeInsert, "id" | "createdAt" | "updatedAt">>): Promise<KnowledgeNodeRow[]> {
    if (nodes.length === 0) return [];

    const now = new Date();
    const nodesToInsert = nodes.map(node => ({
      id: uuidv4(),
      ...node,
      createdAt: now,
      updatedAt: now,
    }));

    return db.insert(knowledgeNodes).values(nodesToInsert).returning();
  }

  /**
   * Get a node by its ID
   */
  async getNode(id: string): Promise<KnowledgeNodeRow | null> {
    const [node] = await db.select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id))
      .limit(1);

    return node ?? null;
  }

  /**
   * Get nodes by their IDs
   */
  async getNodesById(ids: string[]): Promise<KnowledgeNodeRow[]> {
    if (ids.length === 0) return [];

    return db.select()
      .from(knowledgeNodes)
      .where(inArray(knowledgeNodes.id, ids));
  }

  /**
   * Query nodes with filtering
   */
  async queryNodes(
    appId: number,
    filter?: KnowledgeQueryFilter,
    options?: { limit?: number; offset?: number; orderBy?: "name" | "type" | "updatedAt" },
  ): Promise<KnowledgeQueryResult<KnowledgeNodeRow>> {
    const startTime = Date.now();
    const conditions = [eq(knowledgeNodes.appId, appId)];

    // Apply type filter
    if (filter?.type) {
      if (Array.isArray(filter.type)) {
        conditions.push(inArray(knowledgeNodes.type, filter.type));
      } else {
        conditions.push(eq(knowledgeNodes.type, filter.type));
      }
    }

    // Apply file path filter
    if (filter?.filePath) {
      if (Array.isArray(filter.filePath)) {
        conditions.push(or(...filter.filePath.map(fp => like(knowledgeNodes.filePath, fp))));
      } else {
        conditions.push(like(knowledgeNodes.filePath, filter.filePath));
      }
    }

    // Apply name filter
    if (filter?.name) {
      if (Array.isArray(filter.name)) {
        conditions.push(or(...filter.name.map(n => like(knowledgeNodes.name, n))));
      } else {
        conditions.push(like(knowledgeNodes.name, filter.name));
      }
    }

    // Build the query
    const whereClause = and(...conditions);
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Determine order
    const orderByColumn = options?.orderBy === "name" ? knowledgeNodes.name
      : options?.orderBy === "type" ? knowledgeNodes.type
      : desc(knowledgeNodes.updatedAt);

    // Execute query
    const nodes = await db.select()
      .from(knowledgeNodes)
      .where(whereClause)
      .orderBy(orderByColumn)
      .limit(limit + 1) // Fetch one extra to check for hasMore
      .offset(offset);

    // Get total count
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(knowledgeNodes)
      .where(whereClause);

    const hasMore = nodes.length > limit;
    const items = hasMore ? nodes.slice(0, -1) : nodes;

    return {
      items,
      total: count,
      hasMore,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Update a node
   */
  async updateNode(id: string, updates: Partial<Omit<KnowledgeNodeInsert, "id" | "appId" | "createdAt">>): Promise<KnowledgeNodeRow | null> {
    const [updated] = await db.update(knowledgeNodes)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeNodes.id, id))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a node by ID (cascade deletes edges)
   */
  async deleteNode(id: string): Promise<boolean> {
    const result = await db.delete(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id))
      .returning({ id: knowledgeNodes.id });

    return result.length > 0;
  }

  /**
   * Delete all nodes for an app
   */
  async deleteNodesForApp(appId: number): Promise<number> {
    const result = await db.delete(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId))
      .returning({ id: knowledgeNodes.id });

    return result.length;
  }

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  /**
   * Insert a new edge into the knowledge graph
   */
  async insertEdge(edge: Omit<KnowledgeEdgeInsert, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeEdgeRow> {
    const id = uuidv4();
    const now = new Date();

    const [inserted] = await db.insert(knowledgeEdges).values({
      id,
      ...edge,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return inserted;
  }

  /**
   * Insert multiple edges in a batch operation
   */
  async insertEdges(edges: Array<Omit<KnowledgeEdgeInsert, "id" | "createdAt" | "updatedAt">>): Promise<KnowledgeEdgeRow[]> {
    if (edges.length === 0) return [];

    const now = new Date();
    const edgesToInsert = edges.map(edge => ({
      id: uuidv4(),
      ...edge,
      createdAt: now,
      updatedAt: now,
    }));

    return db.insert(knowledgeEdges).values(edgesToInsert).returning();
  }

  /**
   * Get edges from a node (outgoing)
   */
  async getOutgoingEdges(nodeId: string, types?: KnowledgeEdgeType[]): Promise<KnowledgeEdgeRow[]> {
    const conditions = [eq(knowledgeEdges.sourceId, nodeId)];
    
    if (types && types.length > 0) {
      conditions.push(inArray(knowledgeEdges.type, types));
    }

    return db.select()
      .from(knowledgeEdges)
      .where(and(...conditions));
  }

  /**
   * Get edges to a node (incoming)
   */
  async getIncomingEdges(nodeId: string, types?: KnowledgeEdgeType[]): Promise<KnowledgeEdgeRow[]> {
    const conditions = [eq(knowledgeEdges.targetId, nodeId)];
    
    if (types && types.length > 0) {
      conditions.push(inArray(knowledgeEdges.type, types));
    }

    return db.select()
      .from(knowledgeEdges)
      .where(and(...conditions));
  }

  /**
   * Get all edges for a node (both directions)
   */
  async getAllEdgesForNode(nodeId: string, types?: KnowledgeEdgeType[]): Promise<KnowledgeEdgeRow[]> {
    const conditions = [or(
      eq(knowledgeEdges.sourceId, nodeId),
      eq(knowledgeEdges.targetId, nodeId),
    )];
    
    if (types && types.length > 0) {
      conditions.push(inArray(knowledgeEdges.type, types));
    }

    return db.select()
      .from(knowledgeEdges)
      .where(and(...conditions));
  }

  /**
   * Delete an edge by ID
   */
  async deleteEdge(id: string): Promise<boolean> {
    const result = await db.delete(knowledgeEdges)
      .where(eq(knowledgeEdges.id, id))
      .returning({ id: knowledgeEdges.id });

    return result.length > 0;
  }

  /**
   * Delete all edges for an app
   */
  async deleteEdgesForApp(appId: number): Promise<number> {
    const result = await db.delete(knowledgeEdges)
      .where(eq(knowledgeEdges.appId, appId))
      .returning({ id: knowledgeEdges.id });

    return result.length;
  }

  // -------------------------------------------------------------------------
  // Graph Traversal Operations
  // -------------------------------------------------------------------------

  /**
   * Traverse the graph starting from a node
   */
  async traverseFrom(
    startNodeId: string,
    options: GraphTraversalOptions = {},
  ): Promise<KnowledgeNodeRow[]> {
    const {
      maxDepth = 3,
      edgeTypes,
      direction = "outgoing",
      includeStart = true,
      limit = 100,
    } = options;

    const visited = new Set<string>();
    const result: KnowledgeNodeRow[] = [];

    // Add start node if requested
    if (includeStart) {
      const startNode = await this.getNode(startNodeId);
      if (startNode) {
        result.push(startNode);
        visited.add(startNodeId);
      }
    }

    // BFS traversal
    let currentLevel = [startNodeId];
    
    for (let depth = 0; depth < maxDepth && result.length < limit; depth++) {
      const nextLevel: string[] = [];

      for (const nodeId of currentLevel) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        // Get connected nodes
        let edges: KnowledgeEdgeRow[];
        if (direction === "outgoing") {
          edges = await this.getOutgoingEdges(nodeId, edgeTypes);
        } else if (direction === "incoming") {
          edges = await this.getIncomingEdges(nodeId, edgeTypes);
        } else {
          edges = await this.getAllEdgesForNode(nodeId, edgeTypes);
        }

        // Get connected node IDs
        const connectedIds = edges.map(e => 
          direction === "incoming" ? e.sourceId : e.targetId,
        );

        for (const id of connectedIds) {
          if (!visited.has(id)) {
            const node = await this.getNode(id);
            if (node) {
              result.push(node);
              nextLevel.push(id);
              if (result.length >= limit) break;
            }
          }
        }

        if (result.length >= limit) break;
      }

      currentLevel = nextLevel;
    }

    return result;
  }

  /**
   * Find the shortest path between two nodes
   */
  async findPath(
    startNodeId: string,
    endNodeId: string,
    options: { maxDepth?: number; edgeTypes?: KnowledgeEdgeType[] } = {},
  ): Promise<KnowledgeNodeRow[]> {
    const { maxDepth = 10, edgeTypes } = options;

    // BFS to find shortest path
    const visited = new Set<string>([startNodeId]);
    const parentMap = new Map<string, { nodeId: string; edge: KnowledgeEdgeRow }>();
    const queue = [startNodeId];

    while (queue.length > 0 && visited.size < maxDepth * 100) {
      const currentId = queue.shift()!;

      if (currentId === endNodeId) {
        // Reconstruct path
        const path: KnowledgeNodeRow[] = [];
        let current = endNodeId;

        while (current) {
          const node = await this.getNode(current);
          if (node) path.unshift(node);
          
          const parent = parentMap.get(current);
          current = parent?.nodeId ?? "";
          if (!parent) break;
        }

        return path;
      }

      const edges = await this.getOutgoingEdges(currentId, edgeTypes);

      for (const edge of edges) {
        if (!visited.has(edge.targetId)) {
          visited.add(edge.targetId);
          parentMap.set(edge.targetId, { nodeId: currentId, edge });
          queue.push(edge.targetId);
        }
      }
    }

    return []; // No path found
  }

  // -------------------------------------------------------------------------
  // Statistics Operations
  // -------------------------------------------------------------------------

  /**
   * Get statistics about the knowledge graph for an app
   */
  async getStats(appId: number): Promise<{ totalNodes: number; totalEdges: number; nodesByType: Record<KnowledgeNodeType, number>; edgesByType: Record<KnowledgeEdgeType, number>; disconnectedComponents: number; averageDegree: number; hubNodes: Array<{ nodeId: string; name: string; degree: number }>; lastUpdated: Date }> {
    // Get node counts by type
    const nodeTypeCounts = await db.select({
      type: knowledgeNodes.type,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId))
      .groupBy(knowledgeNodes.type);

    const nodesByType: Record<KnowledgeNodeType, number> = {} as Record<KnowledgeNodeType, number>;
    let totalNodes = 0;
    for (const row of nodeTypeCounts) {
      nodesByType[row.type as KnowledgeNodeType] = row.count;
      totalNodes += row.count;
    }

    // Get edge counts by type
    const edgeTypeCounts = await db.select({
      type: knowledgeEdges.type,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.appId, appId))
      .groupBy(knowledgeEdges.type);

    const edgesByType: Record<KnowledgeEdgeType, number> = {} as Record<KnowledgeEdgeType, number>;
    let totalEdges = 0;
    for (const row of edgeTypeCounts) {
      edgesByType[row.type as KnowledgeEdgeType] = row.count;
      totalEdges += row.count;
    }

    // Get hub nodes (nodes with most connections)
    const hubNodesRaw = await db.select({
      nodeId: knowledgeNodes.id,
      name: knowledgeNodes.name,
      edgeCount: sql<number>`(
        SELECT COUNT(*) FROM knowledge_edges 
        WHERE source_id = knowledge_nodes.id OR target_id = knowledge_nodes.id
      )`.as("edge_count"),
    })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId))
      .orderBy(sql`edge_count DESC`)
      .limit(10);

    const hubNodes = hubNodesRaw.map(row => ({
      nodeId: row.nodeId,
      name: row.name,
      degree: row.edgeCount,
    }));

    // Calculate average degree
    const averageDegree = totalNodes > 0 ? (totalEdges * 2) / totalNodes : 0;

    // Get last updated
    const [lastUpdatedNode] = await db.select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId))
      .orderBy(desc(knowledgeNodes.updatedAt))
      .limit(1);

    return {
      totalNodes,
      totalEdges,
      nodesByType,
      edgesByType,
      disconnectedComponents: 0, // Would require more complex analysis
      averageDegree,
      hubNodes,
      lastUpdated: lastUpdatedNode?.updatedAt ?? new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Snapshot Operations
  // -------------------------------------------------------------------------

  /**
   * Create a snapshot of the current graph state
   */
  async createSnapshot(
    appId: number,
    options: { name?: string; snapshotType?: string; commitHash?: string } = {},
  ): Promise<number> {
    // Get all node and edge IDs
    const nodes = await db.select({ id: knowledgeNodes.id })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId));

    const edges = await db.select({ id: knowledgeEdges.id })
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.appId, appId));

    const [snapshot] = await db.insert(knowledgeGraphSnapshots).values({
      appId,
      name: options.name,
      snapshotType: options.snapshotType ?? "manual",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      graphData: {
        nodes: nodes.map(n => n.id),
        edges: edges.map(e => e.id),
      },
      commitHash: options.commitHash,
    }).returning({ id: knowledgeGraphSnapshots.id });

    return snapshot.id;
  }

  /**
   * Get the most recent snapshot for an app
   */
  async getLatestSnapshot(appId: number): Promise<{
    id: number;
    nodeCount: number;
    edgeCount: number;
    createdAt: Date;
  } | null> {
    const [snapshot] = await db.select({
      id: knowledgeGraphSnapshots.id,
      nodeCount: knowledgeGraphSnapshots.nodeCount,
      edgeCount: knowledgeGraphSnapshots.edgeCount,
      createdAt: knowledgeGraphSnapshots.createdAt,
    })
      .from(knowledgeGraphSnapshots)
      .where(eq(knowledgeGraphSnapshots.appId, appId))
      .orderBy(desc(knowledgeGraphSnapshots.createdAt))
      .limit(1);

    return snapshot ?? null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const graphStorage = new GraphStorage();
