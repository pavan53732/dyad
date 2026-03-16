/**
 * Knowledge Graph Engine - Module Index
 *
 * This module provides a persistent knowledge graph for representing
 * relationships between code entities (files, functions, classes, etc.)
 *
 * Main components:
 * - GraphStorage: Persistent storage for nodes and edges
 * - GraphQueryEngine: Advanced query and traversal capabilities
 * - CodeGraphBuilder: Extracts code entities and builds the graph
 *
 * Usage:
 * ```typescript
 * import { graphStorage, graphQueryEngine, codeGraphBuilder } from "@/pro/main/knowledge_graph";
 *
 * // Build graph from codebase
 * const result = await codeGraphBuilder.buildGraph({
 *   appId: 1,
 *   rootPath: "/path/to/app",
 * });
 *
 * // Query nodes
 * const functions = await graphStorage.queryNodes(1, { type: "function" });
 *
 * // Find callers
 * const callers = await graphQueryEngine.findCallers("node-id");
 * ```
 */

// Core types
export * from "./types";

// Storage service
export {
  GraphStorage,
  graphStorage,
  type KnowledgeNodeRow,
  type KnowledgeNodeInsert,
  type KnowledgeEdgeRow,
  type KnowledgeEdgeInsert,
} from "./storage";

// Query engine
export { GraphQueryEngine, graphQueryEngine } from "./query_engine";
export type {
  GraphPattern,
  PatternMatchResult,
  GraphAnalysisResult,
  SubgraphOptions,
  Subgraph,
} from "./query_engine";

// Code graph builder
export { CodeGraphBuilder, codeGraphBuilder } from "./code_graph_builder";
