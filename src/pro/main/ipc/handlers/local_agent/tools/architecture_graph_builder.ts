/**
 * Architecture Graph Builder Tool
 * Builds comprehensive architectural graphs for understanding system structure:
 * - Component relationship graph
 * - Service dependency graph
 * - Data flow architecture graph
 * - API communication graph
 * - Architecture constraint engine
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const ArchitectureGraphBuilderArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Types of graphs to build */
  graphTypes: z
    .enum([
      "all",
      "component",
      "service",
      "dataflow",
      "eventflow",
      "api",
      "constraint",
    ])
    .default("all"),
  /** Include detailed edge weights for dependencies */
  includeWeights: z.boolean().default(true),
  /** Generate visualization data (nodes/edges for UI) */
  generateVisualization: z.boolean().default(true),
  /** Maximum depth for dependency analysis */
  maxDepth: z.number().min(1).max(10).default(5),
});

type ArchitectureGraphBuilderArgs = z.infer<
  typeof ArchitectureGraphBuilderArgs
>;

// Result types
interface GraphNode {
  id: string;
  label: string;
  type: "component" | "service" | "module" | "database" | "api" | "external";
  path?: string;
  metadata?: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  weight?: number;
  type: "import" | "dependency" | "dataflow" | "api" | "event";
}

interface ComponentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalComponents: number;
    totalDependencies: number;
    cyclicDependencies: string[];
  };
}

interface ServiceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalServices: number;
    externalDependencies: string[];
    serviceBoundaries: string[];
  };
}

interface DataFlowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    entryPoints: string[];
    dataStores: string[];
    processingNodes: string[];
  };
}

interface EventFlowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    producers: string[];
    consumers: string[];
    eventBuses: string[];
  };
}

interface ApiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalEndpoints: number;
    exposedApis: string[];
    consumedApis: string[];
  };
}

interface Constraint {
  id: string;
  type: "ownership" | "layer" | "dependency" | "cycle";
  description: string;
  violated: boolean;
  affectedNodes: string[];
}

interface ArchitectureConstraintEngine {
  constraints: Constraint[];
  violations: Constraint[];
  suggestions: string[];
}

interface GraphBuilderReport {
  componentGraph?: ComponentGraph;
  serviceGraph?: ServiceGraph;
  dataFlowGraph?: DataFlowGraph;
  eventFlowGraph?: EventFlowGraph;
  apiGraph?: ApiGraph;
  constraintEngine?: ArchitectureConstraintEngine;
  visualizationData?: {
    nodes: Array<{ id: string; label: string; type: string; group?: string }>;
    edges: Array<{ from: string; to: string; label?: string; type?: string }>;
  };
}

// Helper: Extract imports from TypeScript/JavaScript file
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES6 imports
  const es6ImportRegex = /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Require statements
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

// Helper: Extract API route patterns
function extractApiRoutes(content: string, filePath: string): string[] {
  const routes: string[] = [];

  // Next.js API routes: /app/api/.../route.ts
  if (filePath.includes("/api/") || filePath.includes("/app/api/")) {
    // Express/Next.js route handlers
    const expressRouteRegex =
      /(?:app|router|Server)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = expressRouteRegex.exec(content)) !== null) {
      routes.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
  }

  return routes;
}

// Helper: Extract database operations
function extractDatabaseOperations(content: string): string[] {
  const operations: string[] = [];

  // Common ORM patterns
  const dbPatterns = [
    /(?:await\s+)?(\w+)\.(find|create|update|delete|insert)\s*\(?/g,
    /SELECT\s+.*?FROM\s+(\w+)/gi,
    /INSERT\s+INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi,
    /DELETE\s+FROM\s+(\w+)/gi,
  ];

  for (const pattern of dbPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      operations.push(match[1] || match[0]);
    }
  }

  return operations;
}

// Helper: Detect service files
function isServiceFile(filePath: string): boolean {
  return (
    filePath.includes("/services/") ||
    filePath.includes("/api/") ||
    filePath.includes("/server/") ||
    filePath.includes("/controllers/")
  );
}

// Helper: Detect database files
function isDatabaseFile(filePath: string): boolean {
  return (
    filePath.includes("/db/") ||
    filePath.includes("/database/") ||
    filePath.includes("/models/") ||
    filePath.includes("/prisma/") ||
    filePath.includes("/drizzle/") ||
    filePath.includes("/migrations/")
  );
}

// Helper: Detect external dependencies
function isExternalDependency(importPath: string): boolean {
  return (
    !importPath.startsWith(".") &&
    !importPath.startsWith("/") &&
    !importPath.startsWith("@")
  );
}

// Analyze directory and build all graph data
async function analyzeProjectStructure(
  projectPath: string,
  maxDepth: number,
): Promise<{
  files: Array<{
    path: string;
    content?: string;
    imports: string[];
    apiRoutes: string[];
    dbOperations: string[];
  }>;
  componentMap: Map<string, GraphNode>;
}> {
  const files: Array<{
    path: string;
    content?: string;
    imports: string[];
    apiRoutes: string[];
    dbOperations: string[];
  }> = [];
  const componentMap = new Map<string, GraphNode>();

  const skipDirs = new Set([
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
    "venv",
    "coverage",
    ".git",
    "target",
    "bin",
    "obj",
  ]);

  async function scanDirectory(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || skipDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (
            [
              ".ts",
              ".tsx",
              ".js",
              ".jsx",
              ".py",
              ".go",
              ".rs",
              ".java",
            ].includes(ext)
          ) {
            const fileData: {
              path: string;
              content?: string;
              imports: string[];
              apiRoutes: string[];
              dbOperations: string[];
            } = {
              path: fullPath,
              imports: [],
              apiRoutes: [],
              dbOperations: [],
            };

            // For TypeScript/JavaScript, analyze content
            if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
              try {
                const content = fs.readFileSync(fullPath, "utf-8");
                fileData.content = content;
                fileData.imports = extractImports(content);
                fileData.apiRoutes = extractApiRoutes(content, fullPath);
                fileData.dbOperations = extractDatabaseOperations(content);
              } catch {
                // Skip unreadable files
              }
            }

            files.push(fileData);

            // Create component node
            const nodeId = fullPath;
            let nodeType: GraphNode["type"] = "component";

            if (isServiceFile(fullPath)) nodeType = "service";
            else if (isDatabaseFile(fullPath)) nodeType = "database";
            else if (
              fullPath.includes("/pages/") ||
              fullPath.includes("/app/")
            ) {
              nodeType = "component";
            }

            componentMap.set(nodeId, {
              id: nodeId,
              label: path.basename(entry.name, ext),
              type: nodeType,
              path: fullPath,
            });
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scanDirectory(projectPath, 0);

  return { files, componentMap };
}

// Build component relationship graph
function buildComponentGraph(
  files: Array<{ path: string; imports: string[] }>,
  componentMap: Map<string, GraphNode>,
): ComponentGraph {
  const nodes = Array.from(componentMap.values());
  const edges: GraphEdge[] = [];
  const cyclicDependencies: string[] = [];

  // Track dependencies to detect cycles
  const depTracker = new Map<string, Set<string>>();

  for (const file of files) {
    for (const imp of file.imports) {
      // Find matching target component
      let targetId: string | null = null;

      for (const [nodeId, node] of componentMap) {
        if (
          imp.includes(node.label) ||
          node.label.toLowerCase() === imp.toLowerCase() ||
          node.label.toLowerCase() === imp.replace("@", "").toLowerCase()
        ) {
          targetId = nodeId;
          break;
        }
      }

      if (targetId && targetId !== file.path) {
        edges.push({
          source: file.path,
          target: targetId,
          type: "import",
          weight: 1,
        });

        // Track for cycle detection
        if (!depTracker.has(file.path)) {
          depTracker.set(file.path, new Set());
        }
        depTracker.get(file.path)!.add(targetId);

        // Check for cycle (simplified)
        const visited = new Set<string>();
        if (detectCycle(targetId, depTracker, visited)) {
          cyclicDependencies.push(`${file.path} -> ${targetId}`);
        }
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      totalComponents: nodes.length,
      totalDependencies: edges.length,
      cyclicDependencies: [...new Set(cyclicDependencies)].slice(0, 10),
    },
  };
}

// Helper: Detect cycle in dependency graph
function detectCycle(
  nodeId: string,
  depTracker: Map<string, Set<string>>,
  visited: Set<string>,
): boolean {
  if (visited.has(nodeId)) return true;
  visited.add(nodeId);

  const deps = depTracker.get(nodeId);
  if (!deps) return false;

  for (const dep of deps) {
    if (detectCycle(dep, depTracker, new Set(visited))) {
      return true;
    }
  }

  return false;
}

// Build service dependency graph
function buildServiceGraph(
  files: Array<{ path: string; imports: string[] }>,
  componentMap: Map<string, GraphNode>,
): ServiceGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const externalDependencies = new Set<string>();
  const serviceBoundaries = new Set<string>();

  // Filter to service-related nodes
  for (const [id, node] of componentMap) {
    if (
      node.type === "service" ||
      id.includes("/services/") ||
      id.includes("/api/")
    ) {
      nodes.push(node);

      // Determine service boundary
      const parts = id.split(path.sep);
      const serviceIdx = parts.findIndex(
        (p) => p === "services" || p === "api",
      );
      if (serviceIdx >= 0 && parts[serviceIdx + 1]) {
        serviceBoundaries.add(parts[serviceIdx + 1]);
      }
    }
  }

  // Add external dependencies
  for (const file of files) {
    for (const imp of file.imports) {
      if (isExternalDependency(imp)) {
        externalDependencies.add(imp);
      }
    }
  }

  // Build service-to-service edges
  for (const file of files) {
    if (!file.path.includes("/services/") && !file.path.includes("/api/")) {
      continue;
    }

    for (const imp of file.imports) {
      for (const [nodeId, node] of componentMap) {
        if (
          node.type === "service" &&
          (imp.includes(node.label) ||
            node.label.toLowerCase() === imp.toLowerCase())
        ) {
          edges.push({
            source: file.path,
            target: nodeId,
            type: "dependency",
            weight: 1,
          });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      totalServices: nodes.length,
      externalDependencies: Array.from(externalDependencies),
      serviceBoundaries: Array.from(serviceBoundaries),
    },
  };
}

// Build data flow graph
function buildDataFlowGraph(
  files: Array<{ path: string; imports: string[]; dbOperations: string[] }>,
  componentMap: Map<string, GraphNode>,
): DataFlowGraph {
  const nodes = Array.from(componentMap.values());
  const edges: GraphEdge[] = [];
  const entryPoints: string[] = [];
  const dataStores: string[] = [];
  const processingNodes: string[] = [];

  // Categorize nodes
  for (const [id, node] of componentMap) {
    if (
      id.includes("/pages/") ||
      id.includes("/app/") ||
      id.includes("/routes/")
    ) {
      entryPoints.push(id);
    } else if (node.type === "database" || id.includes("/models/")) {
      dataStores.push(id);
    } else if (node.type === "service" || id.includes("/services/")) {
      processingNodes.push(id);
    }
  }

  // Build data flow edges
  for (const file of files) {
    // Connect entry points to services
    if (entryPoints.some((ep) => file.path.startsWith(ep))) {
      for (const imp of file.imports) {
        if (
          processingNodes.some(
            (pn) => pn.includes(imp) || imp.includes(path.basename(pn)),
          )
        ) {
          edges.push({
            source: file.path,
            target: imp,
            type: "dataflow",
          });
        }
      }
    }

    // Connect services to data stores
    if (processingNodes.some((pn) => file.path.startsWith(pn))) {
      for (const op of file.dbOperations) {
        const storeNode = dataStores.find((ds) =>
          ds.toLowerCase().includes(op.toLowerCase()),
        );
        if (storeNode) {
          edges.push({
            source: file.path,
            target: storeNode,
            type: "dataflow",
          });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      entryPoints,
      dataStores,
      processingNodes,
    },
  };
}

// Build event flow graph
function buildEventFlowGraph(
  files: Array<{ path: string; imports: string[]; content?: string }>,
  componentMap: Map<string, GraphNode>,
): EventFlowGraph {
  const nodes = Array.from(componentMap.values());
  const edges: GraphEdge[] = [];
  const producers: string[] = [];
  const consumers: string[] = [];
  const eventBuses: string[] = [];

  for (const file of files) {
    const content = file.content || "";
    const isProducer = /emit|publish|broadcast/i.test(content);
    const isConsumer = /on\(|subscribe|listen/i.test(content);
    const isBus = /EventBus|EventEmitter|MessageBus/i.test(file.path);

    if (isProducer) producers.push(file.path);
    if (isConsumer) consumers.push(file.path);
    if (isBus) eventBuses.push(file.path);

    // Simple edge detection: if a file imports an event bus and emits
    if (isProducer) {
      for (const bus of eventBuses) {
        if (file.imports.some((imp) => bus.includes(imp))) {
          edges.push({ source: file.path, target: bus, type: "event" });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: { producers, consumers, eventBuses },
  };
}

// Build API communication graph
function buildApiGraph(
  files: Array<{ path: string; apiRoutes: string[]; imports: string[] }>,
  _componentMap: Map<string, GraphNode>,
): ApiGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const exposedApis: string[] = [];
  const consumedApis: string[] = [];

  // Find API endpoints
  for (const file of files) {
    for (const route of file.apiRoutes) {
      nodes.push({
        id: file.path,
        label: `${path.basename(file.path)}: ${route}`,
        type: "api",
        path: file.path,
      });
      exposedApis.push(route);
    }
  }

  // Find API consumers
  for (const file of files) {
    if (!file.apiRoutes.length) continue;

    for (const imp of file.imports) {
      // Check if importing from API routes
      if (imp.includes("/api/") || imp.includes("/services/")) {
        consumedApis.push(imp);
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      totalEndpoints: exposedApis.length,
      exposedApis,
      consumedApis: [...new Set(consumedApis)],
    },
  };
}

// Build constraint engine
function buildConstraintEngine(
  componentGraph: ComponentGraph,
  serviceGraph: ServiceGraph,
): ArchitectureConstraintEngine {
  const constraints: Constraint[] = [];
  const violated: Constraint[] = [];
  const suggestions: string[] = [];

  // Layer constraint: components should only depend on same/lower layers
  constraints.push({
    id: "layer-001",
    type: "layer",
    description: "UI components should not directly import from database layer",
    violated: false,
    affectedNodes: [],
  });

  // Dependency constraint: no cyclic dependencies
  if (componentGraph.metadata.cyclicDependencies.length > 0) {
    violated.push({
      id: "cycle-001",
      type: "cycle",
      description: "Cyclic dependencies detected in component graph",
      violated: true,
      affectedNodes: componentGraph.metadata.cyclicDependencies,
    });
    suggestions.push(
      "Refactor to break cyclic dependencies by introducing interfaces or shared modules",
    );
  }

  // Ownership constraint: each service should have clear boundaries
  if (serviceGraph.metadata.serviceBoundaries.length > 1) {
    constraints.push({
      id: "ownership-001",
      type: "ownership",
      description: "Service ownership boundaries should be clearly defined",
      violated: false,
      affectedNodes: [],
    });
  }

  // External dependency constraint
  if (serviceGraph.metadata.externalDependencies.length > 10) {
    violated.push({
      id: "dependency-001",
      type: "dependency",
      description: "Too many external dependencies detected",
      violated: true,
      affectedNodes: serviceGraph.metadata.externalDependencies.slice(0, 5),
    });
    suggestions.push(
      "Consider consolidating external dependencies or creating abstraction layers",
    );
  }

  return {
    constraints: [...constraints, ...violated],
    violations: violated,
    suggestions,
  };
}

// Generate visualization data
function generateVisualizationData(
  componentGraph: ComponentGraph,
  serviceGraph?: ServiceGraph,
): {
  nodes: Array<{ id: string; label: string; type: string; group?: string }>;
  edges: Array<{ from: string; to: string; label?: string; type?: string }>;
} {
  const nodes: Array<{
    id: string;
    label: string;
    type: string;
    group?: string;
  }> = [];
  const edges: Array<{
    from: string;
    to: string;
    label?: string;
    type?: string;
  }> = [];

  // Add component graph nodes
  for (const node of componentGraph.nodes) {
    nodes.push({
      id: node.id,
      label: node.label,
      type: node.type,
      group: node.type,
    });
  }

  // Add component graph edges
  for (const edge of componentGraph.edges) {
    edges.push({
      from: edge.source,
      to: edge.target,
      type: edge.type,
    });
  }

  // Add service graph if present
  if (serviceGraph) {
    for (const node of serviceGraph.nodes) {
      if (!nodes.find((n) => n.id === node.id)) {
        nodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          group: "service",
        });
      }
    }
  }

  return { nodes, edges };
}

// Main execution function
async function buildArchitectureGraphs(
  args: ArchitectureGraphBuilderArgs,
  ctx: AgentContext,
): Promise<GraphBuilderReport> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Architecture Graph Builder">Scanning project structure...</dyad-status>`,
  );

  // Analyze project structure
  const { files, componentMap } = await analyzeProjectStructure(
    projectPath,
    args.maxDepth,
  );

  ctx.onXmlStream(
    `<dyad-status title="Architecture Graph Builder">Analyzing ${files.length} files...</dyad-status>`,
  );

  const report: GraphBuilderReport = {};

  // Build requested graphs
  const buildAll = args.graphTypes === "all";

  if (buildAll || args.graphTypes === "component") {
    report.componentGraph = buildComponentGraph(files, componentMap);
  }

  if (buildAll || args.graphTypes === "service") {
    report.serviceGraph = buildServiceGraph(files, componentMap);
  }

  if (buildAll || args.graphTypes === "dataflow") {
    report.dataFlowGraph = buildDataFlowGraph(files, componentMap);
  }

  if (buildAll || args.graphTypes === "eventflow") {
    report.eventFlowGraph = buildEventFlowGraph(files, componentMap);
  }

  if (buildAll || args.graphTypes === "api") {
    report.apiGraph = buildApiGraph(files, componentMap);
  }

  // Build constraint engine if building component graph
  if (report.componentGraph) {
    report.constraintEngine = buildConstraintEngine(
      report.componentGraph,
      report.serviceGraph!,
    );
  }

  // Generate visualization data
  if (args.generateVisualization) {
    report.visualizationData = generateVisualizationData(
      report.componentGraph!,
      report.serviceGraph,
    );
  }

  return report;
}

// Generate XML report
function generateGraphXml(report: GraphBuilderReport): string {
  const lines: string[] = [`# Architecture Graph Builder Report`, ``];

  // Component Graph Summary
  if (report.componentGraph) {
    lines.push(`## Component Relationship Graph`);
    lines.push(
      `- **Components**: ${report.componentGraph.metadata.totalComponents}`,
    );
    lines.push(
      `- **Dependencies**: ${report.componentGraph.metadata.totalDependencies}`,
    );
    if (report.componentGraph.metadata.cyclicDependencies.length > 0) {
      lines.push(
        `- **⚠️ Cyclic Dependencies**: ${report.componentGraph.metadata.cyclicDependencies.length}`,
      );
    }
    lines.push(``);
  }

  // Service Graph Summary
  if (report.serviceGraph) {
    lines.push(`## Service Dependency Graph`);
    lines.push(`- **Services**: ${report.serviceGraph.metadata.totalServices}`);
    lines.push(
      `- **Service Boundaries**: ${report.serviceGraph.metadata.serviceBoundaries.join(", ") || "None detected"}`,
    );
    lines.push(
      `- **External Dependencies**: ${report.serviceGraph.metadata.externalDependencies.length}`,
    );
    lines.push(``);
  }

  // Data Flow Summary
  if (report.dataFlowGraph) {
    lines.push(`## Data Flow Architecture`);
    lines.push(
      `- **Entry Points**: ${report.dataFlowGraph.metadata.entryPoints.length}`,
    );
    lines.push(
      `- **Data Stores**: ${report.dataFlowGraph.metadata.dataStores.length}`,
    );
    lines.push(
      `- **Processing Nodes**: ${report.dataFlowGraph.metadata.processingNodes.length}`,
    );
    lines.push(``);
  }

  // API Graph Summary
  if (report.apiGraph) {
    lines.push(`## API Communication Graph`);
    lines.push(
      `- **Total Endpoints**: ${report.apiGraph.metadata.totalEndpoints}`,
    );
    if (report.apiGraph.metadata.exposedApis.length > 0) {
      lines.push(`### Exposed APIs`);
      for (const api of report.apiGraph.metadata.exposedApis.slice(0, 10)) {
        lines.push(`  - ${api}`);
      }
    }
    lines.push(``);
  }

  // Constraint Engine Summary
  if (report.constraintEngine) {
    if (report.constraintEngine.violations.length > 0) {
      lines.push(`## ⚠️ Constraint Violations`);
      for (const violation of report.constraintEngine.violations) {
        lines.push(`- **${violation.description}**`);
      }
      lines.push(``);
    }

    if (report.constraintEngine.suggestions.length > 0) {
      lines.push(`## 💡 Suggestions`);
      for (const suggestion of report.constraintEngine.suggestions) {
        lines.push(`- ${suggestion}`);
      }
    }
  }

  // Visualization info
  if (report.visualizationData) {
    lines.push(`## 🔍 Visualization`);
    lines.push(
      `- ${report.visualizationData.nodes.length} nodes, ${report.visualizationData.edges.length} edges available for graph visualization`,
    );
  }

  return lines.join("\n");
}

export const architectureGraphBuilderTool: ToolDefinition<ArchitectureGraphBuilderArgs> =
  {
    name: "architecture_graph_builder",
    description:
      "Build comprehensive architectural graphs: component relationships, service dependencies, data flow, and API communication. Detects cycles and constraint violations.",
    inputSchema: ArchitectureGraphBuilderArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const report = await buildArchitectureGraphs(args, ctx);

      const reportXml = generateGraphXml(report);

      const totalNodes = report.visualizationData?.nodes.length || 0;
      const totalEdges = report.visualizationData?.edges.length || 0;

      ctx.onXmlComplete(
        `<dyad-status title="Architecture Graph Built">${totalNodes} nodes, ${totalEdges} edges</dyad-status>`,
      );

      return reportXml;
    },
  };
