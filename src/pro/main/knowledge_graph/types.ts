/**
 * Knowledge Graph Engine - Type Definitions
 * 
 * This module defines the core types for the persistent knowledge graph
 * that represents relationships between code entities.
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * Types of entities that can be represented as nodes in the knowledge graph
 */
export type KnowledgeNodeType =
  | "file"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "constant"
  | "module"
  | "component"
  | "dependency"
  | "api_endpoint"
  | "database_table"
  | "database_column"
  | "config"
  | "test"
  | "documentation";

/**
 * Base properties common to all knowledge nodes
 */
export interface KnowledgeNodeBase {
  /** Unique identifier for the node */
  id: string;
  /** Type of the node */
  type: KnowledgeNodeType;
  /** Human-readable name */
  name: string;
  /** File path where this entity is defined (if applicable) */
  filePath?: string;
  /** Line number where this entity is defined */
  lineStart?: number;
  /** End line number for multi-line entities */
  lineEnd?: number;
  /** Column number where this entity starts */
  columnStart?: number;
  /** Column number where this entity ends */
  columnEnd?: number;
  /** Programming language of the entity */
  language?: string;
  /** Application ID this node belongs to */
  appId: number;
  /** Timestamp when this node was created/updated */
  updatedAt: Date;
  /** Additional metadata as JSON */
  metadata?: Record<string, unknown>;
}

/**
 * File node representing a source file
 */
export interface FileNode extends KnowledgeNodeBase {
  type: "file";
  /** File extension */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Hash of file contents for change detection */
  contentHash: string;
  /** Number of lines in the file */
  lineCount: number;
}

/**
 * Function node representing a function or method
 */
export interface FunctionNode extends KnowledgeNodeBase {
  type: "function";
  /** Function signature */
  signature: string;
  /** Return type (if typed language) */
  returnType?: string;
  /** Parameters as JSON array */
  parameters: Array<{
    name: string;
    type?: string;
    defaultValue?: string;
    optional: boolean;
  }>;
  /** Whether this is an async function */
  isAsync: boolean;
  /** Whether this is a generator function */
  isGenerator: boolean;
  /** Whether this is exported */
  isExported: boolean;
  /** Cyclomatic complexity */
  complexity?: number;
  /** Number of lines in the function body */
  lineCount?: number;
}

/**
 * Class node representing a class definition
 */
export interface ClassNode extends KnowledgeNodeBase {
  type: "class";
  /** Whether this is an abstract class */
  isAbstract: boolean;
  /** Whether this is exported */
  isExported: boolean;
  /** Parent class name (if any) */
  extendsClass?: string;
  /** Implemented interfaces */
  implementsInterfaces: string[];
  /** Class methods */
  methods: string[];
  /** Class properties */
  properties: string[];
}

/**
 * Interface node representing an interface definition
 */
export interface InterfaceNode extends KnowledgeNodeBase {
  type: "interface";
  /** Whether this is exported */
  isExported: boolean;
  /** Extended interfaces */
  extendsInterfaces: string[];
  /** Interface methods */
  methods: string[];
  /** Interface properties */
  properties: string[];
}

/**
 * Module node representing a module/package
 */
export interface ModuleNode extends KnowledgeNodeBase {
  type: "module";
  /** Module path (e.g., npm package name or local module path) */
  modulePath: string;
  /** Module version (for dependencies) */
  version?: string;
  /** Whether this is an external dependency */
  isExternal: boolean;
  /** Exported symbols */
  exports: string[];
}

/**
 * Component node representing a UI component
 */
export interface ComponentNode extends KnowledgeNodeBase {
  type: "component";
  /** Component framework (react, vue, svelte, etc.) */
  framework: string;
  /** Props interface name */
  propsType?: string;
  /** Whether this is a server component */
  isServerComponent?: boolean;
  /** Whether this uses client-side hooks */
  usesClientHooks?: boolean;
}

/**
 * Dependency node representing a package dependency
 */
export interface DependencyNode extends KnowledgeNodeBase {
  type: "dependency";
  /** Package name */
  packageName: string;
  /** Version constraint */
  versionConstraint: string;
  /** Installed version */
  installedVersion?: string;
  /** Whether this is a dev dependency */
  isDev: boolean;
  /** Whether this is a peer dependency */
  isPeer: boolean;
}

/**
 * API endpoint node representing a REST/GraphQL endpoint
 */
export interface ApiEndpointNode extends KnowledgeNodeBase {
  type: "api_endpoint";
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "*";
  /** Endpoint path */
  path: string;
  /** Request body type */
  requestType?: string;
  /** Response type */
  responseType?: string;
  /** Whether this requires authentication */
  requiresAuth: boolean;
}

/**
 * Database table node representing a database table
 */
export interface DatabaseTableNode extends KnowledgeNodeBase {
  type: "database_table";
  /** Table name */
  tableName: string;
  /** Database schema */
  schema?: string;
  /** Primary key columns */
  primaryKeys: string[];
  /** Table columns */
  columns: string[];
}

/**
 * Union type of all knowledge node types
 */
export type KnowledgeNode =
  | FileNode
  | FunctionNode
  | ClassNode
  | InterfaceNode
  | ModuleNode
  | ComponentNode
  | DependencyNode
  | ApiEndpointNode
  | DatabaseTableNode
  | KnowledgeNodeBase;

// ============================================================================
// Edge Types
// ============================================================================

/**
 * Types of relationships between nodes
 */
export type KnowledgeEdgeType =
  | "imports" // A imports B
  | "exports" // A exports B
  | "calls" // A calls B (function call)
  | "extends" // A extends B (class inheritance)
  | "implements" // A implements B (interface)
  | "contains" // A contains B (file contains function)
  | "defines" // A defines B (module defines export)
  | "references" // A references B (variable reference)
  | "depends_on" // A depends on B (dependency)
  | "uses" // A uses B (component uses hook/util)
  | "returns" // A returns B (function return type)
  | "throws" // A throws B (exception)
  | "annotates" // A annotates B (decorator)
  | "documents" // A documents B (doc comments)
  | "tests" // A tests B (test file)
  | "renders" // A renders B (component renders child)
  | "queries" // A queries B (function queries table)
  | "mutates" // A mutates B (function modifies table)
  | "routes_to" // A routes to B (API route to handler)
  | "provides" // A provides B (module provides functionality);

/**
 * Knowledge graph edge representing a relationship between two nodes
 */
export interface KnowledgeEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  type: KnowledgeEdgeType;
  /** Weight/strength of the relationship (0-1) */
  weight?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Application ID this edge belongs to */
  appId: number;
  /** Timestamp when this edge was created/updated */
  updatedAt: Date;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Graph query filter conditions
 */
export interface KnowledgeQueryFilter {
  /** Filter by node type */
  type?: KnowledgeNodeType | KnowledgeNodeType[];
  /** Filter by file path (supports glob patterns) */
  filePath?: string | string[];
  /** Filter by name (supports glob patterns) */
  name?: string | string[];
  /** Filter by metadata properties */
  metadata?: Record<string, unknown>;
  /** Custom filter function (for in-memory queries) */
  custom?: (node: KnowledgeNode) => boolean;
}

/**
 * Graph traversal options
 */
export interface GraphTraversalOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Edge types to follow */
  edgeTypes?: KnowledgeEdgeType[];
  /** Edge direction */
  direction?: "outgoing" | "incoming" | "both";
  /** Whether to include the starting node */
  includeStart?: boolean;
  /** Filter for visited nodes */
  nodeFilter?: KnowledgeQueryFilter;
  /** Maximum number of nodes to return */
  limit?: number;
}

/**
 * Graph query result
 */
export interface KnowledgeQueryResult<T = KnowledgeNode | KnowledgeEdge> {
  /** Query results */
  items: T[];
  /** Total count (before pagination) */
  total: number;
  /** Whether there are more results */
  hasMore: boolean;
  /** Query execution time in ms */
  executionTime: number;
}

// ============================================================================
// Graph Statistics Types
// ============================================================================

/**
 * Statistics about the knowledge graph
 */
export interface KnowledgeGraphStats {
  /** Total number of nodes */
  totalNodes: number;
  /** Total number of edges */
  totalEdges: number;
  /** Nodes by type */
  nodesByType: Record<KnowledgeNodeType, number>;
  /** Edges by type */
  edgesByType: Record<KnowledgeEdgeType, number>;
  /** Number of disconnected components */
  disconnectedComponents: number;
  /** Average node degree */
  averageDegree: number;
  /** Most connected nodes */
  hubNodes: Array<{ nodeId: string; name: string; degree: number }>;
  /** Last updated timestamp */
  lastUpdated: Date;
}

// ============================================================================
// Graph Update Types
// ============================================================================

/**
 * Result of a graph update operation
 */
export interface GraphUpdateResult {
  /** Number of nodes added */
  nodesAdded: number;
  /** Number of nodes updated */
  nodesUpdated: number;
  /** Number of nodes deleted */
  nodesDeleted: number;
  /** Number of edges added */
  edgesAdded: number;
  /** Number of edges updated */
  edgesUpdated: number;
  /** Number of edges deleted */
  edgesDeleted: number;
  /** Any errors encountered */
  errors: Array<{ message: string; context?: unknown }>;
  /** Timestamp of the update */
  timestamp: Date;
}

/**
 * Options for building a knowledge graph from code
 */
export interface CodeGraphBuildOptions {
  /** Application ID */
  appId: number;
  /** Root directory to analyze */
  rootPath: string;
  /** File patterns to include */
  includePatterns?: string[];
  /** File patterns to exclude */
  excludePatterns?: string[];
  /** Whether to parse dependencies */
  parseDependencies?: boolean;
  /** Whether to analyze type relationships */
  analyzeTypes?: boolean;
  /** Whether to extract API endpoints */
  extractApiEndpoints?: boolean;
  /** Whether to analyze database schema */
  analyzeDatabaseSchema?: boolean;
  /** Maximum file size to parse (in bytes) */
  maxFileSize?: number;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  KnowledgeNodeBase,
  FileNode,
  FunctionNode,
  ClassNode,
  InterfaceNode,
  ModuleNode,
  ComponentNode,
  DependencyNode,
  ApiEndpointNode,
  DatabaseTableNode,
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeQueryFilter,
  GraphTraversalOptions,
  KnowledgeQueryResult,
  KnowledgeGraphStats,
  GraphUpdateResult,
  CodeGraphBuildOptions,
};
