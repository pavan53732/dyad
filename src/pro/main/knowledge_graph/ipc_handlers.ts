/**
 * Knowledge Graph IPC Handlers
 *
 * Exposes knowledge graph operations to the renderer process
 * and integrates with the agent runtime.
 */

import { ipcMain } from "electron";
import { graphStorage } from "./storage";
import { graphQueryEngine } from "./query_engine";
import { codeGraphBuilder } from "./code_graph_builder";
import type {
  KnowledgeNodeType,
  KnowledgeEdgeType,
  CodeGraphBuildOptions,
} from "./types";

// ============================================================================
// IPC Channel Names
// ============================================================================

export const KNOWLEDGE_GRAPH_CHANNELS = {
  // Node operations
  GET_NODE: "knowledge-graph:get-node",
  QUERY_NODES: "knowledge-graph:query-nodes",
  DELETE_NODE: "knowledge-graph:delete-node",

  // Edge operations
  GET_OUTGOING_EDGES: "knowledge-graph:get-outgoing-edges",
  GET_INCOMING_EDGES: "knowledge-graph:get-incoming-edges",

  // Graph building
  BUILD_GRAPH: "knowledge-graph:build-graph",
  UPDATE_GRAPH: "knowledge-graph:update-graph",
  CLEAR_GRAPH: "knowledge-graph:clear-graph",

  // Graph queries
  FIND_NODES_BY_NAME: "knowledge-graph:find-nodes-by-name",
  FIND_NODES_IN_FILE: "knowledge-graph:find-nodes-in-file",
  FIND_CALLERS: "knowledge-graph:find-callers",
  FIND_CALLEES: "knowledge-graph:find-callees",
  FIND_PATH: "knowledge-graph:find-path",
  EXTRACT_SUBGRAPH: "knowledge-graph:extract-subgraph",

  // Graph analysis
  GET_STATS: "knowledge-graph:get-stats",
  ANALYZE_GRAPH: "knowledge-graph:analyze-graph",

  // Snapshot operations
  CREATE_SNAPSHOT: "knowledge-graph:create-snapshot",
  GET_LATEST_SNAPSHOT: "knowledge-graph:get-latest-snapshot",
} as const;

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register all knowledge graph IPC handlers
 */
export function registerKnowledgeGraphHandlers(): void {
  // -------------------------------------------------------------------------
  // Node Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.GET_NODE,
    async (_, nodeId: string) => {
      return graphStorage.getNode(nodeId);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.QUERY_NODES,
    async (
      _,
      appId: number,
      filter?: {
        type?: KnowledgeNodeType | KnowledgeNodeType[];
        filePath?: string | string[];
        name?: string | string[];
      },
      options?: { limit?: number; offset?: number },
    ) => {
      return graphStorage.queryNodes(appId, filter, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.DELETE_NODE,
    async (_, nodeId: string) => {
      return graphStorage.deleteNode(nodeId);
    },
  );

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.GET_OUTGOING_EDGES,
    async (_, nodeId: string, types?: KnowledgeEdgeType[]) => {
      return graphStorage.getOutgoingEdges(nodeId, types);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.GET_INCOMING_EDGES,
    async (_, nodeId: string, types?: KnowledgeEdgeType[]) => {
      return graphStorage.getIncomingEdges(nodeId, types);
    },
  );

  // -------------------------------------------------------------------------
  // Graph Building
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.BUILD_GRAPH,
    async (_, options: CodeGraphBuildOptions) => {
      return codeGraphBuilder.buildGraph(options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.UPDATE_GRAPH,
    async (_, options: CodeGraphBuildOptions) => {
      // For updates, we rebuild the entire graph for simplicity
      // In production, this would be incremental
      return codeGraphBuilder.buildGraph(options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.CLEAR_GRAPH,
    async (_, appId: number) => {
      const nodesDeleted = await graphStorage.deleteNodesForApp(appId);
      const edgesDeleted = await graphStorage.deleteEdgesForApp(appId);
      return { nodesDeleted, edgesDeleted };
    },
  );

  // -------------------------------------------------------------------------
  // Graph Queries
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.FIND_NODES_BY_NAME,
    async (
      _,
      appId: number,
      pattern: string,
      options?: { limit?: number; types?: KnowledgeNodeType[] },
    ) => {
      return graphQueryEngine.findNodesByName(appId, pattern, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.FIND_NODES_IN_FILE,
    async (
      _,
      appId: number,
      filePath: string,
      options?: { types?: KnowledgeNodeType[] },
    ) => {
      return graphQueryEngine.findNodesInFile(appId, filePath, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.FIND_CALLERS,
    async (
      _,
      nodeId: string,
      options?: { recursive?: boolean; maxDepth?: number },
    ) => {
      return graphQueryEngine.findCallers(nodeId, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.FIND_CALLEES,
    async (
      _,
      nodeId: string,
      options?: { recursive?: boolean; maxDepth?: number },
    ) => {
      return graphQueryEngine.findCallees(nodeId, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.FIND_PATH,
    async (
      _,
      startNodeId: string,
      endNodeId: string,
      options?: { maxDepth?: number; edgeTypes?: KnowledgeEdgeType[] },
    ) => {
      return graphQueryEngine.findPath(startNodeId, endNodeId, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.EXTRACT_SUBGRAPH,
    async (
      _,
      options: {
        centerNodeIds: string[];
        radius: number;
        edgeTypes?: KnowledgeEdgeType[];
        direction?: "outgoing" | "incoming" | "both";
        maxNodes?: number;
      },
    ) => {
      return graphQueryEngine.extractSubgraph(options);
    },
  );

  // -------------------------------------------------------------------------
  // Graph Analysis
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.GET_STATS,
    async (_, appId: number) => {
      return graphStorage.getStats(appId);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.ANALYZE_GRAPH,
    async (_, appId: number) => {
      return graphQueryEngine.analyzeGraph(appId);
    },
  );

  // -------------------------------------------------------------------------
  // Snapshot Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.CREATE_SNAPSHOT,
    async (
      _,
      appId: number,
      options?: { name?: string; snapshotType?: string; commitHash?: string },
    ) => {
      return graphStorage.createSnapshot(appId, options);
    },
  );

  ipcMain.handle(
    KNOWLEDGE_GRAPH_CHANNELS.GET_LATEST_SNAPSHOT,
    async (_, appId: number) => {
      return graphStorage.getLatestSnapshot(appId);
    },
  );
}
