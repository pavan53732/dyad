/**
 * Knowledge Graph Query Engine
 *
 * Provides advanced query and analysis capabilities for the knowledge graph.
 * Supports graph traversal, pattern matching, and semantic queries.
 */

import { and, or, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeNodes, knowledgeEdges } from "@/db/schema";
import {
  graphStorage,
  type KnowledgeNodeRow,
  type KnowledgeEdgeRow,
} from "./storage";
import type {
  KnowledgeNodeType,
  KnowledgeEdgeType,
  KnowledgeQueryFilter,
  KnowledgeQueryResult,
} from "./types";

// ============================================================================
// Query Types
// ============================================================================

/**
 * Pattern for graph pattern matching
 */
export interface GraphPattern {
  /** Node patterns to match */
  nodes: Array<{
    alias: string;
    type?: KnowledgeNodeType | KnowledgeNodeType[];
    filter?: KnowledgeQueryFilter;
  }>;
  /** Edge patterns between nodes */
  edges: Array<{
    from: string;
    to: string;
    type?: KnowledgeEdgeType | KnowledgeEdgeType[];
    optional?: boolean;
  }>;
}

/**
 * Result of a pattern match
 */
export interface PatternMatchResult {
  /** Matched node alias -> node data */
  nodes: Map<string, KnowledgeNodeRow>;
  /** Matched edge indices */
  edges: Array<{
    fromAlias: string;
    toAlias: string;
    edge: KnowledgeEdgeRow;
  }>;
}

/**
 * Graph analysis result
 */
export interface GraphAnalysisResult {
  /** Detected patterns in the graph */
  patterns: Array<{
    name: string;
    description: string;
    matches: PatternMatchResult[];
  }>;
  /** Identified clusters/communities */
  clusters: Array<{
    id: string;
    nodeIds: string[];
    label?: string;
  }>;
  /** Important nodes (hubs, authorities) */
  importantNodes: Array<{
    nodeId: string;
    name: string;
    importance: number;
    reason: string;
  }>;
  /** Potential issues detected */
  issues: Array<{
    type: "circular_dependency" | "orphan" | "complexity" | "unused";
    severity: "low" | "medium" | "high";
    nodeId?: string;
    description: string;
    relatedNodes?: string[];
  }>;
}

/**
 * Subgraph extraction options
 */
export interface SubgraphOptions {
  /** Center node IDs */
  centerNodeIds: string[];
  /** Radius in hops from center */
  radius: number;
  /** Edge types to include */
  edgeTypes?: KnowledgeEdgeType[];
  /** Direction of traversal */
  direction?: "outgoing" | "incoming" | "both";
  /** Maximum nodes to include */
  maxNodes?: number;
}

/**
 * Extracted subgraph
 */
export interface Subgraph {
  nodes: KnowledgeNodeRow[];
  edges: KnowledgeEdgeRow[];
  centerNodeIds: string[];
  radius: number;
}

// ============================================================================
// Query Engine Class
// ============================================================================

/**
 * GraphQueryEngine provides advanced graph query capabilities
 */
export class GraphQueryEngine {
  // -------------------------------------------------------------------------
  // Basic Queries
  // -------------------------------------------------------------------------

  /**
   * Find nodes by name pattern (supports wildcards)
   */
  async findNodesByName(
    appId: number,
    pattern: string,
    options?: { limit?: number; types?: KnowledgeNodeType[] },
  ): Promise<KnowledgeQueryResult<KnowledgeNodeRow>> {
    const startTime = Date.now();
    const limit = options?.limit ?? 50;

    // Convert wildcard pattern to SQL LIKE pattern
    const likePattern = pattern.replace(/\*/g, "%").replace(/\?/g, "_");

    const conditions = [
      eq(knowledgeNodes.appId, appId),
      like(knowledgeNodes.name, likePattern),
    ];

    if (options?.types && options.types.length > 0) {
      conditions.push(inArray(knowledgeNodes.type, options.types));
    }

    const nodes = await db
      .select()
      .from(knowledgeNodes)
      .where(and(...conditions))
      .limit(limit + 1);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeNodes)
      .where(and(...conditions));

    return {
      items: nodes.slice(0, limit),
      total: count,
      hasMore: nodes.length > limit,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Find nodes in a file
   */
  async findNodesInFile(
    appId: number,
    filePath: string,
    options?: { types?: KnowledgeNodeType[] },
  ): Promise<KnowledgeNodeRow[]> {
    const conditions = [
      eq(knowledgeNodes.appId, appId),
      eq(knowledgeNodes.filePath, filePath),
    ];

    if (options?.types && options.types.length > 0) {
      conditions.push(inArray(knowledgeNodes.type, options.types));
    }

    return db
      .select()
      .from(knowledgeNodes)
      .where(and(...conditions))
      .orderBy(knowledgeNodes.lineStart);
  }

  /**
   * Find all callers of a function/class
   */
  async findCallers(
    nodeId: string,
    options?: { recursive?: boolean; maxDepth?: number },
  ): Promise<KnowledgeNodeRow[]> {
    const visited = new Set<string>();
    const result: KnowledgeNodeRow[] = [];
    const maxDepth = options?.maxDepth ?? (options?.recursive ? 5 : 1);

    const traverse = async (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const edges = await db
        .select()
        .from(knowledgeEdges)
        .where(
          and(
            eq(knowledgeEdges.targetId, currentId),
            inArray(knowledgeEdges.type, ["calls", "references"]),
          ),
        );

      for (const edge of edges) {
        const caller = await graphStorage.getNode(edge.sourceId);
        if (caller && !visited.has(caller.id)) {
          result.push(caller);
          if (options?.recursive) {
            await traverse(caller.id, depth + 1);
          }
        }
      }
    };

    await traverse(nodeId, 1);
    return result;
  }

  /**
   * Find all callees (functions called by a function)
   */
  async findCallees(
    nodeId: string,
    options?: { recursive?: boolean; maxDepth?: number },
  ): Promise<KnowledgeNodeRow[]> {
    const visited = new Set<string>();
    const result: KnowledgeNodeRow[] = [];
    const maxDepth = options?.maxDepth ?? (options?.recursive ? 5 : 1);

    const traverse = async (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const edges = await db
        .select()
        .from(knowledgeEdges)
        .where(
          and(
            eq(knowledgeEdges.sourceId, currentId),
            inArray(knowledgeEdges.type, ["calls", "references"]),
          ),
        );

      for (const edge of edges) {
        const callee = await graphStorage.getNode(edge.targetId);
        if (callee && !visited.has(callee.id)) {
          result.push(callee);
          if (options?.recursive) {
            await traverse(callee.id, depth + 1);
          }
        }
      }
    };

    await traverse(nodeId, 1);
    return result;
  }

  // -------------------------------------------------------------------------
  // Graph Traversal
  // -------------------------------------------------------------------------

  /**
   * Extract a subgraph around specified nodes
   */
  async extractSubgraph(options: SubgraphOptions): Promise<Subgraph> {
    const {
      centerNodeIds,
      radius,
      edgeTypes,
      direction = "both",
      maxNodes = 500,
    } = options;

    const nodeSet = new Set<string>(centerNodeIds);
    const edges: KnowledgeEdgeRow[] = [];
    let currentLevel = [...centerNodeIds];

    // BFS to expand the subgraph
    for (let hop = 0; hop < radius && nodeSet.size < maxNodes; hop++) {
      const nextLevel: string[] = [];

      for (const nodeId of currentLevel) {
        if (nodeSet.size >= maxNodes) break;

        // Get edges based on direction
        const edgeConditions: unknown[] = [];

        if (edgeTypes && edgeTypes.length > 0) {
          edgeConditions.push(inArray(knowledgeEdges.type, edgeTypes));
        }

        if (direction === "outgoing" || direction === "both") {
          const outgoing = await db
            .select()
            .from(knowledgeEdges)
            .where(and(eq(knowledgeEdges.sourceId, nodeId), ...edgeConditions));
          edges.push(...outgoing);

          for (const edge of outgoing) {
            if (!nodeSet.has(edge.targetId) && nodeSet.size < maxNodes) {
              nodeSet.add(edge.targetId);
              nextLevel.push(edge.targetId);
            }
          }
        }

        if (direction === "incoming" || direction === "both") {
          const incoming = await db
            .select()
            .from(knowledgeEdges)
            .where(and(eq(knowledgeEdges.targetId, nodeId), ...edgeConditions));
          edges.push(...incoming);

          for (const edge of incoming) {
            if (!nodeSet.has(edge.sourceId) && nodeSet.size < maxNodes) {
              nodeSet.add(edge.sourceId);
              nextLevel.push(edge.sourceId);
            }
          }
        }
      }

      currentLevel = nextLevel;
    }

    // Get all nodes in the subgraph
    const nodes = await graphStorage.getNodesById(Array.from(nodeSet));

    return {
      nodes,
      edges,
      centerNodeIds,
      radius,
    };
  }

  // -------------------------------------------------------------------------
  // Pattern Matching
  // -------------------------------------------------------------------------

  /**
   * Find patterns in the graph
   */
  async findPattern(
    appId: number,
    pattern: GraphPattern,
    options?: { limit?: number },
  ): Promise<PatternMatchResult[]> {
    const limit = options?.limit ?? 100;
    const results: PatternMatchResult[] = [];

    // Get the first node pattern to start matching
    const startPattern = pattern.nodes[0];
    if (!startPattern) return [];

    // Find candidate starting nodes
    const conditions = [eq(knowledgeNodes.appId, appId)];

    if (startPattern.type) {
      if (Array.isArray(startPattern.type)) {
        conditions.push(inArray(knowledgeNodes.type, startPattern.type));
      } else {
        conditions.push(eq(knowledgeNodes.type, startPattern.type));
      }
    }

    const startNodes = await db
      .select()
      .from(knowledgeNodes)
      .where(and(...conditions))
      .limit(limit * 10); // Get more candidates for pattern matching

    // For each starting node, try to match the pattern
    for (const startNode of startNodes) {
      if (results.length >= limit) break;

      const match = await this.matchPatternFromNode(appId, startNode, pattern);
      if (match) {
        results.push(match);
      }
    }

    return results;
  }

  /**
   * Try to match a pattern starting from a specific node
   */
  private async matchPatternFromNode(
    appId: number,
    startNode: KnowledgeNodeRow,
    pattern: GraphPattern,
  ): Promise<PatternMatchResult | null> {
    const nodeMap = new Map<string, KnowledgeNodeRow>();
    const edgeMatches: PatternMatchResult["edges"] = [];

    // Initialize with the starting node
    const startAlias = pattern.nodes[0].alias;
    nodeMap.set(startAlias, startNode);

    // Try to match each edge pattern
    for (const edgePattern of pattern.edges) {
      const fromNode = nodeMap.get(edgePattern.from);
      if (!fromNode) return null;

      // Find matching edge
      const edgeConditions = [
        eq(knowledgeEdges.appId, appId),
        eq(knowledgeEdges.sourceId, fromNode.id),
      ];

      if (edgePattern.type) {
        if (Array.isArray(edgePattern.type)) {
          edgeConditions.push(inArray(knowledgeEdges.type, edgePattern.type));
        } else {
          edgeConditions.push(eq(knowledgeEdges.type, edgePattern.type));
        }
      }

      const edges = await db
        .select()
        .from(knowledgeEdges)
        .where(and(...edgeConditions))
        .limit(1);

      if (edges.length === 0) {
        if (edgePattern.optional) continue;
        return null;
      }

      const edge = edges[0];
      const targetNode = await graphStorage.getNode(edge.targetId);

      if (!targetNode) {
        if (edgePattern.optional) continue;
        return null;
      }

      // Check if target matches the pattern
      const targetPattern = pattern.nodes.find(
        (n) => n.alias === edgePattern.to,
      );
      if (targetPattern?.type) {
        const types = Array.isArray(targetPattern.type)
          ? targetPattern.type
          : [targetPattern.type];
        if (!types.includes(targetNode.type as KnowledgeNodeType)) {
          if (edgePattern.optional) continue;
          return null;
        }
      }

      nodeMap.set(edgePattern.to, targetNode);
      edgeMatches.push({
        fromAlias: edgePattern.from,
        toAlias: edgePattern.to,
        edge,
      });
    }

    return {
      nodes: nodeMap,
      edges: edgeMatches,
    };
  }

  // -------------------------------------------------------------------------
  // Graph Analysis
  // -------------------------------------------------------------------------

  /**
   * Analyze the graph for patterns, issues, and important nodes
   */
  async analyzeGraph(appId: number): Promise<GraphAnalysisResult> {
    const [patterns, clusters, importantNodes, issues] = await Promise.all([
      this.detectPatterns(appId),
      this.detectClusters(appId),
      this.findImportantNodes(appId),
      this.detectIssues(appId),
    ]);

    return {
      patterns,
      clusters,
      importantNodes,
      issues,
    };
  }

  /**
   * Detect common architectural patterns
   */
  private async detectPatterns(
    appId: number,
  ): Promise<GraphAnalysisResult["patterns"]> {
    const patterns: GraphAnalysisResult["patterns"] = [];

    // Detect MVC pattern
    const mvcMatches = await this.findPattern(
      appId,
      {
        nodes: [
          { alias: "model", type: "class" },
          { alias: "view", type: "component" },
          { alias: "controller", type: "function" },
        ],
        edges: [
          { from: "controller", to: "model", type: "uses" },
          { from: "controller", to: "view", type: "uses" },
        ],
      },
      { limit: 10 },
    );

    if (mvcMatches.length > 0) {
      patterns.push({
        name: "MVC Pattern",
        description: "Model-View-Controller architecture detected",
        matches: mvcMatches,
      });
    }

    // Detect dependency injection pattern
    const diMatches = await this.findPattern(
      appId,
      {
        nodes: [
          { alias: "service", type: "class" },
          { alias: "injector", type: "function" },
        ],
        edges: [{ from: "injector", to: "service", type: "provides" }],
      },
      { limit: 10 },
    );

    if (diMatches.length > 0) {
      patterns.push({
        name: "Dependency Injection",
        description: "Services being injected/instantiated",
        matches: diMatches,
      });
    }

    // Detect hook patterns (React)
    const hookMatches = await this.findPattern(
      appId,
      {
        nodes: [
          { alias: "component", type: "component" },
          { alias: "hook", type: "function" },
        ],
        edges: [{ from: "component", to: "hook", type: "uses" }],
      },
      { limit: 20 },
    );

    if (hookMatches.length > 0) {
      patterns.push({
        name: "Hook Pattern",
        description: "React hooks being used in components",
        matches: hookMatches,
      });
    }

    return patterns;
  }

  /**
   * Detect clusters/communities in the graph
   */
  private async detectClusters(
    appId: number,
  ): Promise<GraphAnalysisResult["clusters"]> {
    const clusters: GraphAnalysisResult["clusters"] = [];

    // Group nodes by module/file
    const nodesByFile = await db
      .select({
        filePath: knowledgeNodes.filePath,
        nodeId: knowledgeNodes.id,
      })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId));

    const fileGroups = new Map<string, string[]>();
    for (const row of nodesByFile) {
      if (!row.filePath) continue;
      const dir = row.filePath.split("/").slice(0, -1).join("/");
      if (!fileGroups.has(dir)) {
        fileGroups.set(dir, []);
      }
      fileGroups.get(dir)!.push(row.nodeId);
    }

    // Convert to clusters
    let clusterId = 0;
    for (const [dir, nodeIds] of fileGroups) {
      if (nodeIds.length >= 3) {
        // Only include meaningful clusters
        clusters.push({
          id: `cluster-${clusterId++}`,
          nodeIds,
          label: dir.split("/").pop() || dir,
        });
      }
    }

    return clusters;
  }

  /**
   * Find important/hub nodes
   */
  private async findImportantNodes(
    appId: number,
  ): Promise<GraphAnalysisResult["importantNodes"]> {
    const importantNodes: GraphAnalysisResult["importantNodes"] = [];

    // Get nodes with high degree (many connections)
    const nodes = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId));

    for (const node of nodes.slice(0, 100)) {
      // Limit for performance
      const edges = await graphStorage.getAllEdgesForNode(node.id);
      const degree = edges.length;

      if (degree >= 5) {
        // Determine reason for importance
        const incoming = edges.filter((e) => e.targetId === node.id).length;
        const outgoing = edges.filter((e) => e.sourceId === node.id).length;

        let reason: string;
        if (incoming > outgoing * 2) {
          reason = "Authority - many nodes depend on this";
        } else if (outgoing > incoming * 2) {
          reason = "Hub - depends on many other nodes";
        } else {
          reason = "Central - highly connected in both directions";
        }

        importantNodes.push({
          nodeId: node.id,
          name: node.name,
          importance: degree,
          reason,
        });
      }
    }

    return importantNodes
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);
  }

  /**
   * Detect potential issues in the graph
   */
  private async detectIssues(
    appId: number,
  ): Promise<GraphAnalysisResult["issues"]> {
    const issues: GraphAnalysisResult["issues"] = [];

    // Check for circular dependencies
    const nodes = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.appId, appId));

    for (const node of nodes.slice(0, 50)) {
      // Limit for performance
      const visited = new Set<string>();
      const path: string[] = [];

      const hasCycle = async (
        currentId: string,
        startId: string,
        depth: number,
      ): Promise<string[] | null> => {
        if (depth > 20) return null; // Limit search depth
        if (visited.has(currentId)) {
          if (currentId === startId && depth > 1) {
            return [...path, currentId];
          }
          return null;
        }

        visited.add(currentId);
        path.push(currentId);

        const edges = await db
          .select()
          .from(knowledgeEdges)
          .where(
            and(
              eq(knowledgeEdges.sourceId, currentId),
              inArray(knowledgeEdges.type, ["imports", "depends_on"]),
            ),
          );

        for (const edge of edges) {
          if (edge.targetId === startId && depth > 0) {
            return [...path, startId];
          }
          const cycle = await hasCycle(edge.targetId, startId, depth + 1);
          if (cycle) return cycle;
        }

        path.pop();
        return null;
      };

      const cycle = await hasCycle(node.id, node.id, 0);
      if (cycle && cycle.length > 1) {
        issues.push({
          type: "circular_dependency",
          severity: "medium",
          nodeId: node.id,
          description: `Circular dependency detected starting from ${node.name}`,
          relatedNodes: cycle,
        });
      }
    }

    // Check for orphan nodes (no connections)
    for (const node of nodes) {
      const edges = await graphStorage.getAllEdgesForNode(node.id);
      if (
        edges.length === 0 &&
        node.type !== "config" &&
        node.type !== "documentation"
      ) {
        issues.push({
          type: "orphan",
          severity: "low",
          nodeId: node.id,
          description: `${node.name} has no connections to other nodes`,
        });
      }
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Get the dependency graph for a specific node type
   */
  async getDependencyGraph(
    appId: number,
    nodeType: KnowledgeNodeType,
  ): Promise<{ nodes: KnowledgeNodeRow[]; edges: KnowledgeEdgeRow[] }> {
    // Get all nodes of the specified type
    const nodes = await db
      .select()
      .from(knowledgeNodes)
      .where(
        and(eq(knowledgeNodes.appId, appId), eq(knowledgeNodes.type, nodeType)),
      );

    const nodeIds = nodes.map((n) => n.id);

    // Get dependency edges between these nodes
    const edges = await db
      .select()
      .from(knowledgeEdges)
      .where(
        and(
          eq(knowledgeEdges.appId, appId),
          inArray(knowledgeEdges.type, [
            "imports",
            "depends_on",
            "extends",
            "implements",
          ]),
          or(
            inArray(knowledgeEdges.sourceId, nodeIds),
            inArray(knowledgeEdges.targetId, nodeIds),
          ),
        ),
      );

    return { nodes, edges };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const graphQueryEngine = new GraphQueryEngine();
