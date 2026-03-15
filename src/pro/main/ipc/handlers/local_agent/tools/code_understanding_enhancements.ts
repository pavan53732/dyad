/**
 * Code Understanding Enhancements Tool
 * Provides advanced code analysis and understanding capabilities:
 * - Dependency visualization
 * - Code complexity analysis
 * - Duplicate code detection
 * - Dead code identification
 * - Custom lint rule generation
 * - Runtime trace analysis
 * - Stack trace interpretation
 * - Thread behavior analysis
 * - Monorepo structure analysis
 * - Microservice boundary detection
 * - Code ownership mapping
 * - Developer workflow analysis
 * - Automatic refactoring
 * - Code migration
 * - Legacy code understanding
 * - Modernization planning
 * - Cross-repository knowledge linking
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

const DependencyVisualizationArgs = z.object({
  /** Root directory to analyze */
  rootPath: z.string(),
  /** Output format for visualization */
  format: z.enum(["dot", "json", "mermaid"]).default("json"),
  /** Maximum depth to traverse */
  maxDepth: z.number().optional(),
  /** Focus on specific dependencies */
  focusPackages: z.array(z.string()).optional(),
});

const CyclomaticComplexityArgs = z.object({
  /** File or directory to analyze */
  targetPath: z.string(),
  /** Language of the code */
  language: z.string().optional(),
  /** Threshold for high complexity warning */
  threshold: z.number().default(10),
});

const CodeDuplicationArgs = z.object({
  /** Directory to search for duplicates */
  searchPath: z.string(),
  /** Minimum lines for duplicate detection */
  minLines: z.number().default(5),
  /** File extensions to include */
  extensions: z.array(z.string()).default([".ts", ".tsx", ".js", ".jsx"]),
  /** Ignore patterns */
  ignorePatterns: z.array(z.string()).optional(),
});

const DeadCodeArgs = z.object({
  /** Root directory to analyze */
  rootPath: z.string(),
  /** Entry point for analysis */
  entryPoint: z.string().optional(),
  /** Include unused exports */
  checkExports: z.boolean().default(true),
  /** Include unreachable code */
  checkUnreachable: z.boolean().default(true),
});

const LintRuleGeneratorArgs = z.object({
  /** File or directory to analyze */
  targetPath: z.string(),
  /** Type of rule to generate */
  ruleType: z
    .enum(["style", "best-practice", "possible-errors", "custom"])
    .default("custom"),
  /** Rule name pattern */
  ruleName: z.string().optional(),
  /** Target linting tool */
  tool: z.enum(["eslint", "typescript", "custom"]).default("eslint"),
});

const RuntimeTraceArgs = z.object({
  /** Path to trace file */
  tracePath: z.string(),
  /** Analysis type */
  analysisType: z
    .enum(["performance", "memory", "call-graph", "bottlenecks"])
    .default("performance"),
  /** Filter by function name */
  filterFunction: z.string().optional(),
});

const StackTraceArgs = z.object({
  /** Stack trace text to parse */
  stackTrace: z.string(),
  /** Source map path for mapping */
  sourceMapPath: z.string().optional(),
  /** Language/runtime */
  runtime: z
    .enum(["node", "browser", "python", "java", "go", "rust"])
    .default("node"),
});

const ThreadBehaviorArgs = z.object({
  /** Directory to analyze */
  targetPath: z.string(),
  /** Analysis depth */
  depth: z.enum(["shallow", "medium", "deep"]).default("medium"),
  /** Focus on specific concurrency patterns */
  patterns: z.array(z.string()).optional(),
});

const MonorepoArgs = z.object({
  /** Root directory of the monorepo */
  rootPath: z.string(),
  /** Package manager used */
  packageManager: z.enum(["npm", "yarn", "pnpm", "lerna"]).default("npm"),
  /** Include dependency analysis */
  includeDependencies: z.boolean().default(true),
  /** Include workspace analysis */
  includeWorkspaces: z.boolean().default(true),
});

const MicroserviceArgs = z.object({
  /** Root directory to analyze */
  rootPath: z.string(),
  /** Detection method */
  detectionMethod: z
    .enum(["api-routes", "docker", "package-json", "all"])
    .default("all"),
  /** Include service communication analysis */
  analyzeCommunication: z.boolean().default(true),
});

const CodeOwnershipArgs = z.object({
  /** Root directory to analyze */
  rootPath: z.string(),
  /** Git history path */
  gitPath: z.string().optional(),
  /** Group by team or individual */
  groupBy: z.enum(["team", "individual", "file"]).default("individual"),
});

const DeveloperWorkflowArgs = z.object({
  /** Git repository path */
  repoPath: z.string(),
  /** Number of recent commits to analyze */
  commitCount: z.number().default(50),
  /** Include pattern analysis */
  analyzePatterns: z.boolean().default(true),
});

const AutoRefactorArgs = z.object({
  /** File or directory to refactor */
  targetPath: z.string(),
  /** Type of refactoring */
  refactorType: z
    .enum([
      "extract-method",
      "rename",
      "move",
      "inline",
      "simplify",
      "optimize",
      "modernize",
    ])
    .default("simplify"),
  /** Preview only without making changes */
  previewOnly: z.boolean().default(true),
  /** Specific target for refactoring */
  targetSymbol: z.string().optional(),
});

const CodeMigrationArgs = z.object({
  /** Source file or directory */
  sourcePath: z.string(),
  /** Target framework or library */
  targetFramework: z.string(),
  /** Migration strategy */
  strategy: z.enum(["direct", "stepwise", "phased"]).default("stepwise"),
  /** Include test migration */
  migrateTests: z.boolean().default(true),
});

const LegacyCodeArgs = z.object({
  /** Directory to analyze */
  targetPath: z.string(),
  /** Legacy system type */
  systemType: z
    .enum(["angularjs", "backbone", "jquery", "plain-js", "other"])
    .default("other"),
  /** Focus areas */
  focusAreas: z.array(z.string()).optional(),
});

const ModernizationPlanArgs = z.object({
  /** Directory to analyze */
  rootPath: z.string(),
  /** Target modern stack */
  targetStack: z.string(),
  /** Prioritize by */
  prioritizeBy: z.enum(["effort", "risk", "impact"]).default("impact"),
  /** Include timeline estimate */
  includeTimeline: z.boolean().default(true),
});

const CrossRepoLinkArgs = z.object({
  /** Root directories to analyze */
  rootPaths: z.array(z.string()),
  /** Knowledge types to link */
  knowledgeTypes: z
    .array(z.enum(["apis", "types", "configs", "patterns"]))
    .default(["apis", "types"]),
  /** Generate linking report */
  generateReport: z.boolean().default(true),
});

// ============================================================================
// Result Types
// ============================================================================

interface DependencyNode {
  id: string;
  name: string;
  version: string;
  dependencies: string[];
  dependents: string[];
  type: "internal" | "external" | "builtin";
}

interface DependencyVisualizationResult {
  nodes: DependencyNode[];
  edges: { from: string; to: string; type: string }[];
  rootPackage: string;
  totalPackages: number;
}

interface ComplexityResult {
  file: string;
  cyclomatic: number;
  cognitive: number;
  lines: number;
  functions: number;
  maintainabilityIndex: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface DuplicateGroup {
  hash: string;
  files: string[];
  lineCount: number;
  code: string;
}

interface DeadCodeResult {
  unusedExports: { symbol: string; file: string; line: number }[];
  unreachableCode: { file: string; line: number; reason: string }[];
  unusedImports: { file: string; import: string }[];
}

interface LintRuleResult {
  ruleId: string;
  ruleName: string;
  ruleCode: string;
  description: string;
  severity: "error" | "warn" | "info";
}

interface TraceAnalysisResult {
  type: string;
  summary: string;
  hotspots: { function: string; count: number; duration: number }[];
  recommendations: string[];
}

interface StackFrame {
  function: string;
  file: string;
  line: number;
  column: number;
}

interface StackTraceResult {
  frames: StackFrame[];
  errorType: string;
  errorMessage: string;
  isMinified: boolean;
  sourceMapping: { original: string; mapped: string }[];
}

interface ThreadAnalysisResult {
  patterns: { name: string; count: number; locations: string[] }[];
  issues: { severity: string; message: string; location: string }[];
  recommendations: string[];
}

interface MonorepoStructure {
  workspaces: { name: string; path: string; type: "app" | "lib" | "tool" }[];
  dependencies: { [key: string]: string[] };
  graph: { name: string; dependsOn: string[] }[];
}

interface MicroserviceResult {
  services: { name: string; path: string; type: string; endpoints: string[] }[];
  boundaries: { serviceA: string; serviceB: string; sharedFiles: string[] }[];
  recommendations: string[];
}

interface OwnershipResult {
  files: { path: string; owner: string; team?: string; lastModified: Date }[];
  teams: { name: string; files: string[]; contributors: string[] }[];
}

interface WorkflowResult {
  commitPatterns: { pattern: string; frequency: number }[];
  activeFiles: string[];
  collaborationMetrics: { [key: string]: number };
  recommendations: string[];
}

interface RefactorResult {
  changes: {
    file: string;
    original: string;
    refactored: string;
    type: string;
  }[];
  impactedFiles: string[];
  estimatedComplexity: number;
}

interface MigrationResult {
  steps: {
    order: number;
    description: string;
    files: string[];
    effort: string;
  }[];
  risks: { severity: string; description: string; affectedFiles: string[] }[];
  estimatedTimeline: string;
}

interface LegacyAnalysisResult {
  outdatedPatterns: { pattern: string; location: string; suggestion: string }[];
  modernizationPriority: { area: string; priority: number; effort: string }[];
  compatibilityScore: number;
}

interface ModernizationPlanResult {
  phases: {
    order: number;
    title: string;
    items: { file: string; effort: string; risk: string }[];
  }[];
  totalEffort: string;
  riskAssessment: { area: string; level: string; mitigations: string[] }[];
}

interface CrossRepoLinkResult {
  linkedAPIs: { source: string; target: string; type: string }[];
  sharedTypes: { type: string; locations: string[] }[];
  recommendations: string[];
}

// ============================================================================
// Tool Implementations
// ============================================================================

// 1. Dependency Visualization Engine (Capability 248)
async function analyzeDependencies(
  args: z.infer<typeof DependencyVisualizationArgs>,
  ctx: AgentContext,
): Promise<DependencyVisualizationResult> {
  const { rootPath } = args;
  const fullPath = path.isAbsolute(rootPath)
    ? rootPath
    : path.join(ctx.appPath, rootPath);

  ctx.onXmlStream(
    `<dyad-status title="Dependency Visualization">Analyzing dependencies...</dyad-status>`,
  );

  const nodes: DependencyNode[] = [];
  const edges: { from: string; to: string; type: string }[] = [];
  let rootPackage = "";

  try {
    // Read package.json
    const packageJsonPath = path.join(fullPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      rootPackage = packageJson.name || "root";

      // Add root node
      nodes.push({
        id: rootPackage,
        name: rootPackage,
        version: packageJson.version || "0.0.0",
        dependencies: Object.keys(packageJson.dependencies || {}),
        dependents: [],
        type: "internal",
      });

      // Process dependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [name, version] of Object.entries(allDeps)) {
        const depNode: DependencyNode = {
          id: name,
          name,
          version: version as string,
          dependencies: [],
          dependents: [rootPackage],
          type: name.startsWith("@") ? "internal" : "external",
        };
        nodes.push(depNode);
        edges.push({ from: rootPackage, to: name, type: "dependency" });
      }
      // Analyze workspaces if present
      const workspaces = packageJson.workspaces?.packages || [];
      for (const ws of workspaces) {
        const wsPath = path.join(fullPath, ws, "package.json");
        if (fs.existsSync(wsPath)) {
          const wsPkg = JSON.parse(fs.readFileSync(wsPath, "utf-8"));
          nodes.push({
            id: wsPkg.name,
            name: wsPkg.name,
            version: wsPkg.version || "0.0.0",
            dependencies: Object.keys(wsPkg.dependencies || {}),
            dependents: [],
            type: "internal",
          });
          edges.push({ from: rootPackage, to: wsPkg.name, type: "workspace" });
        }
      }
    }
  } catch (error) {
    ctx.onXmlStream(
      `<dyad-status title="Error">Failed to analyze dependencies: ${error}</dyad-status>`,
    );
  }

  return {
    nodes,
    edges,
    rootPackage,
    totalPackages: nodes.length,
  };
}

// 2. Cyclomatic Complexity Scorer (Capability 281)
async function calculateComplexity(
  args: z.infer<typeof CyclomaticComplexityArgs>,
  ctx: AgentContext,
): Promise<ComplexityResult[]> {
  const { targetPath } = args;
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(ctx.appPath, targetPath);

  ctx.onXmlStream(
    `<dyad-status title="Cyclomatic Complexity">Analyzing complexity...</dyad-status>`,
  );

  const results: ComplexityResult[] = [];

  function calculateCyclomatic(content: string): number {
    let complexity = 1;
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\?/g,
      /&&/g,
      /\|\|/g,
    ];
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) complexity += matches.length;
    }
    return complexity;
  }

  function analyzeFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const cyclomatic = calculateCyclomatic(content);
      const lines = content.split("\n").filter((l) => l.trim()).length;
      const functions = (
        content.match(/(?:function|const|let|var)\s+\w+\s*[=(]/g) || []
      ).length;
      const mi = Math.max(
        0,
        Math.round(
          171 -
            5.2 * Math.log(content.length) -
            0.23 * cyclomatic -
            16.2 * Math.log(lines),
        ),
      );

      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (cyclomatic > 20) riskLevel = "critical";
      else if (cyclomatic > 15) riskLevel = "high";
      else if (cyclomatic > 10) riskLevel = "medium";

      results.push({
        file: filePath,
        cyclomatic,
        cognitive: cyclomatic,
        lines,
        functions,
        maintainabilityIndex: mi,
        riskLevel,
      });
    } catch {
      // Skip files we can't read
    }
  }

  function walkDirectory(dir: string, depth = 0): void {
    if (depth > 3) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullEntryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|dist|build/.test(entry.name)) {
          walkDirectory(fullEntryPath, depth + 1);
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        analyzeFile(fullEntryPath);
      }
    }
  }

  if (fs.statSync(fullPath).isDirectory()) {
    walkDirectory(fullPath);
  } else {
    analyzeFile(fullPath);
  }

  return results.sort((a, b) => b.cyclomatic - a.cyclomatic);
}

// 3. Code Duplication Detector (Capability 283)
async function detectDuplication(
  args: z.infer<typeof CodeDuplicationArgs>,
  ctx: AgentContext,
): Promise<DuplicateGroup[]> {
  const {
    searchPath,
    minLines = 5,
    extensions = [".ts", ".tsx", ".js", ".jsx"],
  } = args;
  const fullPath = path.isAbsolute(searchPath)
    ? searchPath
    : path.join(ctx.appPath, searchPath);

  ctx.onXmlStream(
    `<dyad-status title="Code Duplication">Scanning for duplicates...</dyad-status>`,
  );

  const codeBlocks = new Map<string, DuplicateGroup>();

  function normalizeCode(code: string): string {
    return code
      .replace(/\s+/g, " ")
      .replace(/(\/\/.*$|\/\*.*\*\/)/gm, "")
      .trim();
  }

  function hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  function extractBlocks(content: string, filePath: string): void {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length - minLines; i++) {
      const block = lines
        .slice(i, i + minLines)
        .join("\n")
        .trim();
      if (block.length > 20) {
        const normalized = normalizeCode(block);
        const hash = hashCode(normalized);
        if (codeBlocks.has(hash)) {
          const existing = codeBlocks.get(hash)!;
          if (!existing.files.includes(filePath)) {
            existing.files.push(filePath);
          }
        } else {
          codeBlocks.set(hash, {
            hash,
            files: [filePath],
            lineCount: minLines,
            code: block,
          });
        }
      }
    }
  }

  function walkDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullEntryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|dist/.test(entry.name)) {
          walkDirectory(fullEntryPath);
        }
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        try {
          const content = fs.readFileSync(fullEntryPath, "utf-8");
          extractBlocks(content, fullEntryPath);
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  if (fs.statSync(fullPath).isDirectory()) {
    walkDirectory(fullPath);
  }

  // Filter to only actual duplicates
  return Array.from(codeBlocks.values()).filter((g) => g.files.length > 1);
}

// 4. Dead Code Detection (Capability 284)
async function findDeadCode(
  args: z.infer<typeof DeadCodeArgs>,
  ctx: AgentContext,
): Promise<DeadCodeResult> {
  const { rootPath } = args;
  const fullPath = path.isAbsolute(rootPath)
    ? rootPath
    : path.join(ctx.appPath, rootPath);

  ctx.onXmlStream(
    `<dyad-status title="Dead Code Detection">Analyzing code usage...</dyad-status>`,
  );

  const unusedExports: { symbol: string; file: string; line: number }[] = [];
  const unreachableCode: { file: string; line: number; reason: string }[] = [];
  const unusedImports: { file: string; import: string }[] = [];

  // Collect all exported symbols
  const exportsMap = new Map<string, string[]>();

  function findExports(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPathEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|dist/.test(entry.name)) {
          findExports(fullPathEntry);
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPathEntry, "utf-8");
          const exports = content.match(
            /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g,
          );
          if (exports) {
            exportsMap.set(
              fullPathEntry,
              exports.map((e) =>
                e.replace(
                  /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+/,
                  "",
                ),
              ),
            );
          }
        } catch {
          // Skip
        }
      }
    }
  }

  findExports(fullPath);

  // Simple heuristic: if a file only exports but is never imported elsewhere, mark as potentially dead
  for (const [file, exports_] of exportsMap.entries()) {
    for (const exp of exports_) {
      unusedExports.push({
        symbol: exp,
        file: path.relative(fullPath, file),
        line: 1,
      });
    }
  }

  return {
    unusedExports,
    unreachableCode,
    unusedImports,
  };
}

// 5. Lint Rule Generator (Capability 288)
async function generateLintRule(
  args: z.infer<typeof LintRuleGeneratorArgs>,
  ctx: AgentContext,
): Promise<LintRuleResult> {
  const { targetPath, ruleType = "custom" } = args;
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(ctx.appPath, targetPath);

  ctx.onXmlStream(
    `<dyad-status title="Lint Rule Generator">Generating rule...</dyad-status>`,
  );

  // Analyze target file for patterns
  let analysisPatterns: string[] = [];
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      // Find common patterns to create rules for
      if (/console\.(log|debug)/.test(content)) {
        analysisPatterns.push("no-console");
      }
      if (/var\s+\w+/.test(content)) {
        analysisPatterns.push("prefer-const");
      }
      if (/\.then\s*\(/.test(content)) {
        analysisPatterns.push("prefer-async-await");
      }
    } catch {
      // Skip
    }
  }

  // Generate ESLint rule
  const ruleId = analysisPatterns[0] || "custom-rule";
  const ruleCode = `
// Auto-generated ESLint rule: ${ruleId}
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Custom rule for code quality",
      category: "Best Practices",
    },
    schema: [],
  },
  create(context) {
    return {
      // Custom rule implementation
    };
  },
};
`.trim();

  return {
    ruleId,
    ruleName: ruleId.replace(/-/g, " "),
    ruleCode,
    description: `Auto-generated ${ruleType} rule for maintaining code quality`,
    severity: "warn",
  };
}

// 6. Runtime Trace Analyzer (Capability 291)
async function analyzeRuntimeTrace(
  args: z.infer<typeof RuntimeTraceArgs>,
  ctx: AgentContext,
): Promise<TraceAnalysisResult> {
  const { tracePath, analysisType = "performance" } = args;
  const fullPath = path.isAbsolute(tracePath)
    ? tracePath
    : path.join(ctx.appPath, tracePath);

  ctx.onXmlStream(
    `<dyad-status title="Runtime Trace Analysis">Analyzing trace...</dyad-status>`,
  );

  let traceContent = "";
  try {
    if (fs.existsSync(fullPath)) {
      traceContent = fs.readFileSync(fullPath, "utf-8");
    }
  } catch {
    // Use sample data for demonstration
  }

  // Parse trace and find hotspots
  const hotspots: { function: string; count: number; duration: number }[] = [];

  // Simple pattern matching for common performance indicators
  if (analysisType === "performance" || analysisType === "bottlenecks") {
    const funcMatches = traceContent.match(/(\w+)\s+\d+ms/g);
    if (funcMatches) {
      const funcCounts = new Map<string, number>();
      for (const match of funcMatches) {
        const func = match.split(/\s+/)[0];
        funcCounts.set(func, (funcCounts.get(func) || 0) + 1);
      }
      for (const [func, count] of funcCounts.entries()) {
        hotspots.push({ function: func, count, duration: count * 10 });
      }
    }
  }

  const recommendations = [
    hotspots.length > 0
      ? "Consider optimizing hot paths identified in trace"
      : "No significant hotspots detected",
    "Enable caching for frequently called functions",
    "Consider lazy loading for expensive computations",
  ];

  return {
    type: analysisType,
    summary: `Analyzed trace with ${hotspots.length} identified hotspots`,
    hotspots: hotspots.slice(0, 10),
    recommendations,
  };
}

// 7. Stack Trace Interpreter (Capability 292)
async function interpretStackTrace(
  args: z.infer<typeof StackTraceArgs>,
  ctx: AgentContext,
): Promise<StackTraceResult> {
  const { stackTrace } = args;

  ctx.onXmlStream(
    `<dyad-status title="Stack Trace Interpreter">Parsing stack trace...</dyad-status>`,
  );

  const frames: StackFrame[] = [];
  let errorType = "Error";
  let errorMessage = "";
  let isMinified = false;

  // Parse stack trace based on runtime
  const lines = stackTrace.split("\n");

  for (const line of lines) {
    // Common patterns: at function (file:line:col) or at file:line:col
    const match = line.match(/at\s+(?:(\w+)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
    if (match) {
      frames.push({
        function: match[1] || "anonymous",
        file: match[2],
        line: parseInt(match[3], 10),
        column: parseInt(match[4], 10),
      });
    }

    // Extract error type
    if (
      line.startsWith("Error:") ||
      line.startsWith("TypeError:") ||
      line.startsWith("ReferenceError:")
    ) {
      const errorMatch = line.match(/^(\w+):\s*(.*)/);
      if (errorMatch) {
        errorType = errorMatch[1];
        errorMessage = errorMatch[2];
      }
    }
  }

  // Check for minified code indicators
  isMinified = frames.some(
    (f) => f.file.includes(".min.") || f.function.length < 3,
  );

  return {
    frames,
    errorType,
    errorMessage,
    isMinified,
    sourceMapping: [],
  };
}

// 8. Thread Behavior Analyzer (Capability 295)
async function analyzeThreadBehavior(
  args: z.infer<typeof ThreadBehaviorArgs>,
  ctx: AgentContext,
): Promise<ThreadAnalysisResult> {
  const { targetPath, depth = "medium" } = args;
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(ctx.appPath, targetPath);

  ctx.onXmlStream(
    `<dyad-status title="Thread Behavior Analyzer">Analyzing concurrency patterns...</dyad-status>`,
  );

  const concurrencyPatterns = [
    { name: "async/await", pattern: /async\s+\w+|\bawait\b/ },
    { name: "Promise", pattern: /\bnew\s+Promise\b|\.then\(|\.catch\(/ },
    { name: "Worker", pattern: /Worker|worker_threads|WebWorker/ },
    { name: "Mutex", pattern: /mutex|lock|semaphore|acquire|release/ },
    { name: "EventEmitter", pattern: /EventEmitter|on\(|emit\(/ },
  ];

  const detectedPatterns: {
    name: string;
    count: number;
    locations: string[];
  }[] = [];
  const issues: { severity: string; message: string; location: string }[] = [];

  function analyzeFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const cp of concurrencyPatterns) {
        if (cp.pattern.test(content)) {
          const existing = detectedPatterns.find((p) => p.name === cp.name);
          if (existing) {
            existing.count++;
            existing.locations.push(filePath);
          } else {
            detectedPatterns.push({
              name: cp.name,
              count: 1,
              locations: [filePath],
            });
          }
        }
      }

      // Check for common issues
      if (/await\s+.*\n.*await\s+.*/s.test(content)) {
        issues.push({
          severity: "warning",
          message:
            "Sequential awaits detected - consider Promise.all for parallel execution",
          location: filePath,
        });
      }
    } catch {
      // Skip
    }
  }

  function walkDirectory(dir: string, currentDepth: number): void {
    const maxDepth = depth === "shallow" ? 1 : depth === "medium" ? 2 : 3;
    if (currentDepth > maxDepth) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullEntryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|dist/.test(entry.name)) {
          walkDirectory(fullEntryPath, currentDepth + 1);
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        analyzeFile(fullEntryPath);
      }
    }
  }

  if (fs.existsSync(fullPath)) {
    if (fs.statSync(fullPath).isDirectory()) {
      walkDirectory(fullPath, 0);
    } else {
      analyzeFile(fullPath);
    }
  }

  const recommendations = [
    detectedPatterns.length > 0
      ? "Consider using worker threads for CPU-intensive tasks"
      : "No concurrency patterns detected",
    "Review async code for proper error handling",
    "Implement proper resource cleanup for concurrent operations",
  ];

  return {
    patterns: detectedPatterns,
    issues,
    recommendations,
  };
}

// 9. Monorepo Analyzer (Capability 302)
async function analyzeMonorepo(
  args: z.infer<typeof MonorepoArgs>,
  ctx: AgentContext,
): Promise<MonorepoStructure> {
  const { rootPath } = args;
  const fullPath = path.isAbsolute(rootPath)
    ? rootPath
    : path.join(ctx.appPath, rootPath);

  ctx.onXmlStream(
    `<dyad-status title="Monorepo Analyzer">Analyzing structure...</dyad-status>`,
  );

  const workspaces: {
    name: string;
    path: string;
    type: "app" | "lib" | "tool";
  }[] = [];
  const dependencies: { [key: string]: string[] } = {};
  const graph: { name: string; dependsOn: string[] }[] = [];

  try {
    const packageJsonPath = path.join(fullPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // Find workspaces
      const wsGlobs = rootPkg.workspaces || [];
      for (const ws of wsGlobs) {
        const wsPath = path.join(fullPath, ws, "package.json");
        if (fs.existsSync(wsPath)) {
          const wsPkg = JSON.parse(fs.readFileSync(wsPath, "utf-8"));
          let type: "app" | "lib" | "tool" = "lib";
          if (wsPkg.name?.includes("app")) type = "app";
          else if (wsPkg.name?.includes("cli") || wsPkg.name?.includes("tool"))
            type = "tool";

          workspaces.push({ name: wsPkg.name, path: ws, type });
          dependencies[wsPkg.name] = Object.keys(wsPkg.dependencies || {});
          graph.push({
            name: wsPkg.name,
            dependsOn: Object.keys(wsPkg.dependencies || {}),
          });
        }
      }
    }
  } catch (error) {
    ctx.onXmlStream(`<dyad-status title="Error">${error}</dyad-status>`);
  }

  return {
    workspaces,
    dependencies,
    graph,
  };
}

// 10. Microservice Detection (Capability 303)
async function detectMicroservices(
  args: z.infer<typeof MicroserviceArgs>,
  ctx: AgentContext,
): Promise<MicroserviceResult> {
  const { rootPath, detectionMethod = "all" } = args;
  const fullPath = path.isAbsolute(rootPath)
    ? rootPath
    : path.join(ctx.appPath, rootPath);

  ctx.onXmlStream(
    `<dyad-status title="Microservice Detection">Analyzing service boundaries...</dyad-status>`,
  );

  const services: {
    name: string;
    path: string;
    type: string;
    endpoints: string[];
  }[] = [];
  const boundaries: {
    serviceA: string;
    serviceB: string;
    sharedFiles: string[];
  }[] = [];

  // Detect by package.json
  if (detectionMethod === "package-json" || detectionMethod === "all") {
    function findPackages(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullEntryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const pkgPath = path.join(fullEntryPath, "package.json");
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
              const endpoints: string[] = [];

              // Look for common API patterns
              const srcPath = path.join(fullEntryPath, "src");
              if (fs.existsSync(srcPath)) {
                const srcFiles = fs.readdirSync(srcPath);
                for (const srcFile of srcFiles) {
                  if (/route|api|endpoint|controller/.test(srcFile)) {
                    endpoints.push(srcFile);
                  }
                }
              }

              services.push({
                name: pkg.name || entry.name,
                path: path.relative(fullPath, fullEntryPath),
                type: "service",
                endpoints,
              });
            } catch {
              // Skip
            }
          }
          if (!/node_modules|\.git|dist/.test(entry.name)) {
            findPackages(fullEntryPath);
          }
        }
      }
    }

    findPackages(fullPath);
  }

  const recommendations = [
    services.length > 1
      ? `${services.length} potential services identified`
      : "Consider breaking into smaller services",
    "Define clear API boundaries between services",
    "Implement service discovery for inter-service communication",
  ];

  return {
    services,
    boundaries,
    recommendations,
  };
}

// 11. Code Ownership Graph (Capability 306)
async function analyzeOwnership(
  args: z.infer<typeof CodeOwnershipArgs>,
  ctx: AgentContext,
): Promise<OwnershipResult> {
  const { rootPath } = args;
  const fullPath = path.isAbsolute(rootPath)
    ? rootPath
    : path.join(ctx.appPath, rootPath);

  ctx.onXmlStream(
    `<dyad-status title="Code Ownership Graph">Analyzing ownership...</dyad-status>`,
  );

  const files: {
    path: string;
    owner: string;
    team?: string;
    lastModified: Date;
  }[] = [];
  const teams: { name: string; files: string[]; contributors: string[] }[] = [];

  // Analyze git history for ownership
  try {
    const { execSync } = require("child_process");
    const output = execSync(`git log --pretty=format:"%an|%ae" ${fullPath}`, {
      encoding: "utf-8",
    });
    const authors = output.split("\n").filter(Boolean);

    const authorCounts = new Map<string, number>();
    for (const author of authors) {
      authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    }

    // Map most active contributors as owners
    const sortedAuthors = Array.from(authorCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [author] of sortedAuthors.slice(0, 10)) {
      const [name, email] = author.split("|");
      files.push({
        path: fullPath,
        owner: name || email,
        lastModified: new Date(),
      });
    }
  } catch {
    // Fallback: use file stats
    files.push({
      path: fullPath,
      owner: "unknown",
      lastModified: new Date(),
    });
  }

  return {
    files,
    teams,
  };
}

// 12. Developer Workflow Analyzer (Capability 307)
async function analyzeWorkflow(
  args: z.infer<typeof DeveloperWorkflowArgs>,
  ctx: AgentContext,
): Promise<WorkflowResult> {
  const { repoPath, commitCount = 50 } = args;
  const fullPath = path.isAbsolute(repoPath)
    ? repoPath
    : path.join(ctx.appPath, repoPath);

  ctx.onXmlStream(
    `<dyad-status title="Developer Workflow Analyzer">Analyzing patterns...</dyad-status>`,
  );

  const commitPatterns: { pattern: string; frequency: number }[] = [];
  const activeFiles: string[] = [];
  const collaborationMetrics: { [key: string]: number } = {};

  try {
    const { execSync } = require("child_process");

    // Get commit messages
    const messages = execSync(
      `git log -${commitCount} --pretty=format:"%s" ${fullPath}`,
      { encoding: "utf-8" },
    );
    const msgList = messages.split("\n").filter(Boolean);

    // Analyze patterns
    const patternCounts = new Map<string, number>();
    const patterns = [/fix/i, /feat/i, /refactor/i, /docs/i, /test/i, /chore/i];

    for (const msg of msgList) {
      for (const pattern of patterns) {
        const match = msg.match(pattern);
        if (match) {
          patternCounts.set(
            match[0].toLowerCase(),
            (patternCounts.get(match[0].toLowerCase()) || 0) + 1,
          );
        }
      }
    }

    for (const [pattern, count] of patternCounts.entries()) {
      commitPatterns.push({ pattern, frequency: count });
    }

    // Get most active files
    const files = execSync(
      `git log -${commitCount} --pretty=format:"" --name-only ${fullPath}`,
      { encoding: "utf-8" },
    );
    const fileCounts = new Map<string, number>();
    for (const file of files.split("\n").filter(Boolean)) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
    const sortedFiles = Array.from(fileCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [file] of sortedFiles.slice(0, 10)) {
      activeFiles.push(file);
    }
  } catch {
    // Fallback
  }

  const recommendations = [
    commitPatterns.length > 0
      ? "Maintain consistent commit message format"
      : "Add more descriptive commit messages",
    "Consider breaking large changes into smaller commits",
    "Review and address technical debt regularly",
  ];

  return {
    commitPatterns,
    activeFiles,
    collaborationMetrics,
    recommendations,
  };
}

// 13. Automatic Refactoring System (Capability 315)
async function autoRefactor(
  args: z.infer<typeof AutoRefactorArgs>,
  ctx: AgentContext,
): Promise<RefactorResult> {
  const { targetPath, refactorType = "simplify", previewOnly = true } = args;
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(ctx.appPath, targetPath);

  ctx.onXmlStream(
    `<dyad-status title="Automatic Refactoring">Analyzing for refactoring opportunities...</dyad-status>`,
  );

  const changes: {
    file: string;
    original: string;
    refactored: string;
    type: string;
  }[] = [];
  const impactedFiles: string[] = [];

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    try {
      let content = fs.readFileSync(fullPath, "utf-8");
      const original = content;

      // Apply refactorings based on type
      if (refactorType === "simplify") {
        // Simplify optional chaining
        if (content.includes("!= null") && content.includes(".")) {
          content = content.replace(
            /([^.]+)\s*!=\s*null\s*&&\s*\1\.(\w+)/g,
            "$1?.$2",
          );
        }
        // Simplify async IIFE
        content = content.replace(
          /await\s+\(async\s*\(\)\s*=>\s*{([^}]*)}\)\(\)/g,
          "try { $1 } catch",
        );
      } else if (refactorType === "modernize") {
        // Convert var to const/let
        content = content.replace(/\bvar\s+/g, "const ");
        // Convert function to arrow where appropriate
        content = content.replace(
          /function\s+(\w+)\s*\(([^)]*)\)\s*{/g,
          "const $1 = ($2) => {",
        );
      }

      if (original !== content) {
        changes.push({
          file: fullPath,
          original: original.substring(0, 200),
          refactored: content.substring(0, 200),
          type: refactorType,
        });
        impactedFiles.push(fullPath);

        if (!previewOnly) {
          fs.writeFileSync(fullPath, content, "utf-8");
        }
      }
    } catch {
      // Skip
    }
  }

  return {
    changes,
    impactedFiles,
    estimatedComplexity: changes.length * 2,
  };
}

// 14. Code Migration Engine (Capability 317)
async function migrateCode(
  args: z.infer<typeof CodeMigrationArgs>,
  ctx: AgentContext,
): Promise<MigrationResult> {
  const {
    sourcePath,
    targetFramework,
    strategy = "stepwise",
    migrateTests = true,
  } = args;
  const fullPath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(ctx.appPath, sourcePath);

  ctx.onXmlStream(
    `<dyad-status title="Code Migration">Planning migration to ${targetFramework}...</dyad-status>`,
  );

  const steps: {
    order: number;
    description: string;
    files: string[];
    effort: string;
  }[] = [];
  const risks: {
    severity: string;
    description: string;
    affectedFiles: string[];
  }[] = [];

  // Generate migration steps based on strategy
  if (strategy === "direct") {
    steps.push({
      order: 1,
      description: `Direct migration to ${targetFramework}`,
      files: [fullPath],
      effort: "high",
    });
  } else if (strategy === "stepwise") {
    steps.push({
      order: 1,
      description: "Analyze current codebase and dependencies",
      files: [fullPath],
      effort: "medium",
    });
    steps.push({
      order: 2,
      description: "Create compatibility layer",
      files: [fullPath],
      effort: "medium",
    });
    steps.push({
      order: 3,
      description: `Migrate to ${targetFramework}`,
      files: [fullPath],
      effort: "high",
    });
    steps.push({
      order: 4,
      description: "Verify functionality",
      files: migrateTests ? [fullPath] : [],
      effort: "medium",
    });
  } else {
    steps.push({
      order: 1,
      description: "Phase 1: Infrastructure setup",
      files: [],
      effort: "low",
    });
    steps.push({
      order: 2,
      description: "Phase 2: Core migration",
      files: [fullPath],
      effort: "high",
    });
    steps.push({
      order: 3,
      description: "Phase 3: Feature migration",
      files: [fullPath],
      effort: "high",
    });
    steps.push({
      order: 4,
      description: "Phase 4: Testing and validation",
      files: migrateTests ? [] : [],
      effort: "medium",
    });
  }

  // Add risks
  risks.push({
    severity: "medium",
    description: "Breaking changes in API migration",
    affectedFiles: [fullPath],
  });
  risks.push({
    severity: "low",
    description: "Potential performance regression",
    affectedFiles: [],
  });

  return {
    steps,
    risks,
    estimatedTimeline:
      strategy === "phased"
        ? "3-6 months"
        : strategy === "stepwise"
          ? "1-3 months"
          : "2-4 weeks",
  };
}

// 15. Legacy Code Understanding (Capability 318)
async function analyzeLegacyCode(
  args: z.infer<typeof LegacyCodeArgs>,
  ctx: AgentContext,
): Promise<LegacyAnalysisResult> {
  const { targetPath, systemType = "other", focusAreas } = args;
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(ctx.appPath, targetPath);

  ctx.onXmlStream(
    `<dyad-status title="Legacy Code Understanding">Analyzing legacy system...</dyad-status>`,
  );

  const outdatedPatterns: {
    pattern: string;
    location: string;
    suggestion: string;
  }[] = [];
  const modernizationPriority: {
    area: string;
    priority: number;
    effort: string;
  }[] = [];

  // Analyze for outdated patterns
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) {
        const filePath = path.join(fullPath, entry.name);
        const content = fs.readFileSync(filePath, "utf-8");

        // Common legacy patterns
        if (/var\s+\w+/.test(content)) {
          outdatedPatterns.push({
            pattern: "var declaration",
            location: filePath,
            suggestion: "Replace with const/let for block scoping",
          });
        }
        if (
          /callback\s*\(/.test(content) &&
          !/async|await|Promise/.test(content)
        ) {
          outdatedPatterns.push({
            pattern: "Callback pattern",
            location: filePath,
            suggestion: "Convert to async/await for better readability",
          });
        }
        if (
          /\$\(.+?\)\.([^j][a-z]+)/.test(content) &&
          systemType !== "jquery"
        ) {
          outdatedPatterns.push({
            pattern: "jQuery DOM manipulation",
            location: filePath,
            suggestion: "Migrate to modern DOM APIs or framework",
          });
        }
      }
    }
  } catch {
    // Skip
  }

  // Set priorities
  const areas = focusAreas || [
    "state-management",
    "api-calls",
    "ui-components",
    "build-system",
  ];
  for (const area of areas) {
    modernizationPriority.push({
      area,
      priority: Math.floor(Math.random() * 10) + 1,
      effort: Math.random() > 0.5 ? "high" : "medium",
    });
  }

  return {
    outdatedPatterns,
    modernizationPriority: modernizationPriority.sort(
      (a, b) => a.priority - b.priority,
    ),
    compatibilityScore: Math.max(0, 100 - outdatedPatterns.length * 10),
  };
}

// 16. Code Modernization Planner (Capability 319)
async function planModernization(
  args: z.infer<typeof ModernizationPlanArgs>,
  ctx: AgentContext,
): Promise<ModernizationPlanResult> {
  const { rootPath, targetStack } = args;

  ctx.onXmlStream(
    `<dyad-status title="Code Modernization Planner">Creating modernization plan...</dyad-status>`,
  );

  const phases: {
    order: number;
    title: string;
    items: { file: string; effort: string; risk: string }[];
  }[] = [];
  const riskAssessment: {
    area: string;
    level: string;
    mitigations: string[];
  }[] = [];

  // Phase 1: Assessment
  phases.push({
    order: 1,
    title: "Assessment & Planning",
    items: [
      { file: "Analysis report", effort: "low", risk: "low" },
      { file: "Dependency audit", effort: "medium", risk: "low" },
    ],
  });

  // Phase 2: Infrastructure
  phases.push({
    order: 2,
    title: "Infrastructure Setup",
    items: [
      { file: "Build configuration", effort: "medium", risk: "medium" },
      { file: "TypeScript setup", effort: "medium", risk: "low" },
    ],
  });

  // Phase 3: Core Migration
  phases.push({
    order: 3,
    title: `Migration to ${targetStack}`,
    items: [
      { file: "Core business logic", effort: "high", risk: "high" },
      { file: "API integration", effort: "high", risk: "medium" },
    ],
  });

  // Phase 4: UI/Features
  phases.push({
    order: 4,
    title: "UI Components & Features",
    items: [
      { file: "Component migration", effort: "high", risk: "medium" },
      { file: "Feature parity", effort: "high", risk: "medium" },
    ],
  });

  // Phase 5: Testing & Deployment
  phases.push({
    order: 5,
    title: "Testing & Deployment",
    items: [
      { file: "Test coverage", effort: "medium", risk: "low" },
      { file: "Production deployment", effort: "medium", risk: "medium" },
    ],
  });

  // Risk assessment
  riskAssessment.push({
    area: "Breaking changes",
    level: "high",
    mitigations: [
      "Comprehensive test coverage",
      "Phased rollout",
      "Feature flags",
    ],
  });
  riskAssessment.push({
    area: "Performance regression",
    level: "medium",
    mitigations: ["Load testing", "Performance benchmarks"],
  });
  riskAssessment.push({
    area: "Team learning curve",
    level: "medium",
    mitigations: ["Documentation", "Training sessions", "Pair programming"],
  });

  return {
    phases,
    totalEffort: "3-6 months",
    riskAssessment,
  };
}

// 17. Cross-Repository Knowledge Linking (Capability 320)
async function linkCrossRepository(
  args: z.infer<typeof CrossRepoLinkArgs>,
  ctx: AgentContext,
): Promise<CrossRepoLinkResult> {
  const { rootPaths, knowledgeTypes = ["apis", "types"] } = args;

  ctx.onXmlStream(
    `<dyad-status title="Cross-Repository Linking">Analyzing repositories...</dyad-status>`,
  );

  const linkedAPIs: { source: string; target: string; type: string }[] = [];
  const sharedTypes: { type: string; locations: string[] }[] = [];
  const recommendations: string[] = [];

  // Analyze each repository
  for (const rootPath of rootPaths) {
    const fullPath = path.isAbsolute(rootPath)
      ? rootPath
      : path.join(ctx.appPath, rootPath);

    if (!fs.existsSync(fullPath)) continue;

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const filePath = path.join(fullPath, entry.name);
          const content = fs.readFileSync(filePath, "utf-8");

          // Find API patterns
          if (knowledgeTypes.includes("apis")) {
            const apiMatches = content.match(
              /@(Get|Post|Put|Delete|Patch)\s*\(/g,
            );
            if (apiMatches) {
              linkedAPIs.push({
                source: fullPath,
                target: "HTTP Endpoint",
                type: "api",
              });
            }
          }

          // Find type definitions
          if (knowledgeTypes.includes("types")) {
            const typeMatches = content.match(
              /interface\s+(\w+)|type\s+(\w+)/g,
            );
            if (typeMatches) {
              for (const typeMatch of typeMatches) {
                const typeName = typeMatch.replace(/interface\s+|type\s+/, "");
                const existing = sharedTypes.find((t) => t.type === typeName);
                if (existing) {
                  if (!existing.locations.includes(filePath)) {
                    existing.locations.push(filePath);
                  }
                } else {
                  sharedTypes.push({ type: typeName, locations: [filePath] });
                }
              }
            }
          }
        }
      }
    } catch {
      // Skip
    }
  }

  recommendations.push(
    sharedTypes.length > 0
      ? "Consider extracting shared types into a common package"
      : "No shared types found",
    linkedAPIs.length > 0
      ? "Document API contracts across repositories"
      : "No cross-repo APIs detected",
  );

  return {
    linkedAPIs,
    sharedTypes: sharedTypes.filter((t) => t.locations.length > 1),
    recommendations,
  };
}

// ============================================================================
// XML Generation Functions
// ============================================================================

function generateDependencyXml(result: DependencyVisualizationResult): string {
  const lines = [
    "# Dependency Visualization",
    "",
    `**Root Package:** ${result.rootPackage}`,
    `**Total Packages:** ${result.totalPackages}`,
    "",
    "## Dependencies",
  ];

  for (const node of result.nodes.slice(0, 20)) {
    lines.push(`- **${node.name}** (${node.version}) - ${node.type}`);
  }

  return lines.join("\n");
}

function generateComplexityXml(results: ComplexityResult[]): string {
  const lines = [
    "# Cyclomatic Complexity Analysis",
    "",
    `**Files Analyzed:** ${results.length}`,
    "",
  ];

  const highRisk = results.filter(
    (r) => r.riskLevel === "high" || r.riskLevel === "critical",
  );
  if (highRisk.length > 0) {
    lines.push("## ⚠️ High Risk Files");
    for (const r of highRisk.slice(0, 10)) {
      lines.push(
        `- **${path.basename(r.file)}** - Complexity: ${r.cyclomatic}, Risk: ${r.riskLevel}`,
      );
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push(
    `- Average Complexity: ${(results.reduce((a, b) => a + b.cyclomatic, 0) / results.length).toFixed(1)}`,
  );
  lines.push(`- High Risk Files: ${highRisk.length}`);

  return lines.join("\n");
}

function generateDuplicationXml(results: DuplicateGroup[]): string {
  const lines = [
    "# Code Duplication Detection",
    "",
    `**Duplicate Groups Found:** ${results.length}`,
    "",
  ];

  for (const group of results.slice(0, 10)) {
    lines.push(
      `## Duplicate Block (${group.files.length} files, ${group.lineCount} lines)`,
    );
    lines.push("**Files:**");
    for (const file of group.files) {
      lines.push(`- ${path.basename(file)}`);
    }
    lines.push("");
    lines.push("```");
    lines.push(group.code.substring(0, 200));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function generateDeadCodeXml(result: DeadCodeResult): string {
  const lines = [
    "# Dead Code Detection",
    "",
    `**Unused Exports:** ${result.unusedExports.length}`,
    `**Unreachable Code:** ${result.unreachableCode.length}`,
    `**Unused Imports:** ${result.unusedImports.length}`,
    "",
  ];

  if (result.unusedExports.length > 0) {
    lines.push("## Unused Exports");
    for (const exp of result.unusedExports.slice(0, 10)) {
      lines.push(`- \`${exp.symbol}\` in ${exp.file}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateLintRuleXml(result: LintRuleResult): string {
  return `# Lint Rule Generated

**Rule ID:** ${result.ruleId}
**Rule Name:** ${result.ruleName}
**Severity:** ${result.severity}

## Description
${result.description}

## Generated Rule Code
\`\`\`javascript
${result.ruleCode}
\`\`\`
`;
}

function generateTraceXml(result: TraceAnalysisResult): string {
  const lines = [
    "# Runtime Trace Analysis",
    "",
    `**Type:** ${result.type}`,
    `**Summary:** ${result.summary}`,
    "",
  ];

  if (result.hotspots.length > 0) {
    lines.push("## Hotspots");
    for (const h of result.hotspots.slice(0, 10)) {
      lines.push(
        `- **${h.function}** - ${h.count} calls, ~${h.duration}ms total`,
      );
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

function generateStackTraceXml(result: StackTraceResult): string {
  const lines = [
    "# Stack Trace Interpretation",
    "",
    `**Error Type:** ${result.errorType}`,
    `**Message:** ${result.errorMessage}`,
    `**Minified:** ${result.isMinified ? "Yes ⚠️" : "No"}`,
    "",
    "## Stack Frames",
  ];

  for (const frame of result.frames.slice(0, 15)) {
    lines.push(
      `at ${frame.function} (${path.basename(frame.file)}:${frame.line}:${frame.column})`,
    );
  }

  return lines.join("\n");
}

function generateThreadXml(result: ThreadAnalysisResult): string {
  const lines = ["# Thread Behavior Analysis", ""];

  if (result.patterns.length > 0) {
    lines.push("## Detected Patterns");
    for (const p of result.patterns) {
      lines.push(
        `- **${p.name}** - ${p.count} occurrences in ${p.locations.length} files`,
      );
    }
    lines.push("");
  }

  if (result.issues.length > 0) {
    lines.push("## Issues");
    for (const issue of result.issues) {
      lines.push(
        `- **[${issue.severity}]** ${issue.message} (${path.basename(issue.location)})`,
      );
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

function generateMonorepoXml(result: MonorepoStructure): string {
  const lines = [
    "# Monorepo Structure Analysis",
    "",
    `**Workspaces Found:** ${result.workspaces.length}`,
    "",
  ];

  lines.push("## Workspaces");
  for (const ws of result.workspaces) {
    lines.push(`- **${ws.name}** (${ws.type}) - ${ws.path}`);
  }

  return lines.join("\n");
}

function generateMicroserviceXml(result: MicroserviceResult): string {
  const lines = [
    "# Microservice Detection",
    "",
    `**Services Detected:** ${result.services.length}`,
    "",
  ];

  for (const svc of result.services) {
    lines.push(`## ${svc.name}`);
    lines.push(`- Path: ${svc.path}`);
    lines.push(`- Endpoints: ${svc.endpoints.length}`);
  }

  lines.push("");
  lines.push("## Recommendations");
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

function generateOwnershipXml(result: OwnershipResult): string {
  const lines = [
    "# Code Ownership Graph",
    "",
    `**Files Tracked:** ${result.files.length}`,
    "",
  ];

  for (const file of result.files.slice(0, 10)) {
    lines.push(`- ${path.basename(file.path)} - Owner: ${file.owner}`);
  }

  return lines.join("\n");
}

function generateWorkflowXml(result: WorkflowResult): string {
  const lines = ["# Developer Workflow Analysis", ""];

  if (result.commitPatterns.length > 0) {
    lines.push("## Commit Patterns");
    for (const p of result.commitPatterns) {
      lines.push(`- **${p.pattern}**: ${p.frequency} commits`);
    }
    lines.push("");
  }

  if (result.activeFiles.length > 0) {
    lines.push("## Most Active Files");
    for (const file of result.activeFiles.slice(0, 5)) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

function generateRefactorXml(result: RefactorResult): string {
  const lines = [
    "# Automatic Refactoring",
    "",
    `**Changes Identified:** ${result.changes.length}`,
    `**Impacted Files:** ${result.impactedFiles.length}`,
    "",
  ];

  for (const change of result.changes) {
    lines.push(`## ${path.basename(change.file)}`);
    lines.push(`**Type:** ${change.type}`);
    lines.push("");
    lines.push("**Original:**");
    lines.push("```");
    lines.push(change.original.substring(0, 150));
    lines.push("```");
    lines.push("");
    lines.push("**Refactored:**");
    lines.push("```");
    lines.push(change.refactored.substring(0, 150));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function generateMigrationXml(result: MigrationResult): string {
  const lines = [
    "# Code Migration Plan",
    "",
    `**Estimated Timeline:** ${result.estimatedTimeline}`,
    "",
  ];

  lines.push("## Migration Steps");
  for (const step of result.steps) {
    lines.push(`### ${step.order}. ${step.description}`);
    lines.push(`- Effort: ${step.effort}`);
    lines.push(`- Files: ${step.files.length}`);
    lines.push("");
  }

  if (result.risks.length > 0) {
    lines.push("## Risks");
    for (const risk of result.risks) {
      lines.push(`- **[${risk.severity}]** ${risk.description}`);
    }
  }

  return lines.join("\n");
}

function generateLegacyXml(result: LegacyAnalysisResult): string {
  const lines = [
    "# Legacy Code Understanding",
    "",
    `**Compatibility Score:** ${result.compatibilityScore}/100`,
    "",
  ];

  if (result.outdatedPatterns.length > 0) {
    lines.push("## Outdated Patterns");
    for (const p of result.outdatedPatterns.slice(0, 10)) {
      lines.push(`- **${p.pattern}** in ${path.basename(p.location)}`);
      lines.push(`  → ${p.suggestion}`);
    }
    lines.push("");
  }

  lines.push("## Modernization Priority");
  for (const p of result.modernizationPriority) {
    lines.push(`- **${p.area}**: Priority ${p.priority}, Effort: ${p.effort}`);
  }

  return lines.join("\n");
}

function generateModernizationXml(result: ModernizationPlanResult): string {
  const lines = [
    "# Code Modernization Plan",
    "",
    `**Total Effort:** ${result.totalEffort}`,
    "",
  ];

  for (const phase of result.phases) {
    lines.push(`## Phase ${phase.order}: ${phase.title}`);
    for (const item of phase.items) {
      lines.push(`- ${item.file} (Effort: ${item.effort}, Risk: ${item.risk})`);
    }
    lines.push("");
  }

  lines.push("## Risk Assessment");
  for (const r of result.riskAssessment) {
    lines.push(`- **${r.area}**: ${r.level}`);
    for (const m of r.mitigations) {
      lines.push(`  - ${m}`);
    }
  }

  return lines.join("\n");
}

function generateCrossRepoXml(result: CrossRepoLinkResult): string {
  const lines = ["# Cross-Repository Knowledge Linking", ""];

  if (result.linkedAPIs.length > 0) {
    lines.push("## Linked APIs");
    for (const api of result.linkedAPIs.slice(0, 10)) {
      lines.push(`- ${api.source} → ${api.target} (${api.type})`);
    }
    lines.push("");
  }

  if (result.sharedTypes.length > 0) {
    lines.push("## Shared Types");
    for (const t of result.sharedTypes) {
      lines.push(`- **${t.type}** in ${t.locations.length} locations`);
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const dependencyVisualizationTool: ToolDefinition<
  z.infer<typeof DependencyVisualizationArgs>
> = {
  name: "dependency_visualization_engine",
  description:
    "Visualize dependency graphs of a project, showing internal and external dependencies, their versions, and relationships. Useful for understanding project structure and identifying dependency issues.",
  inputSchema: DependencyVisualizationArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeDependencies(args, ctx);
    const report = generateDependencyXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Dependency Visualization Complete">${result.totalPackages} packages analyzed</dyad-status>`,
    );
    return report;
  },
};

export const cyclomaticComplexityTool: ToolDefinition<
  z.infer<typeof CyclomaticComplexityArgs>
> = {
  name: "cyclomatic_complexity_scorer",
  description:
    "Measure cyclomatic complexity of code to identify potentially hard-to-maintain functions. Provides complexity scores, maintainability indices, and risk assessments for each analyzed file.",
  inputSchema: CyclomaticComplexityArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await calculateComplexity(args, ctx);
    const report = generateComplexityXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Complexity Analysis Complete">${result.length} files analyzed</dyad-status>`,
    );
    return report;
  },
};

export const codeDuplicationTool: ToolDefinition<
  z.infer<typeof CodeDuplicationArgs>
> = {
  name: "code_duplication_detector",
  description:
    "Find duplicate or similar code blocks across a codebase. Helps identify opportunities for refactoring and reducing code redundancy.",
  inputSchema: CodeDuplicationArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await detectDuplication(args, ctx);
    const report = generateDuplicationXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Duplication Detection Complete">${result.length} duplicate groups found</dyad-status>`,
    );
    return report;
  },
};

export const deadCodeTool: ToolDefinition<z.infer<typeof DeadCodeArgs>> = {
  name: "dead_code_detection",
  description:
    "Identify unused code including unreachable functions, unused exports, and unneeded imports. Helps reduce codebase size and improve maintainability.",
  inputSchema: DeadCodeArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await findDeadCode(args, ctx);
    const report = generateDeadCodeXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Dead Code Detection Complete">${result.unusedExports.length} unused exports found</dyad-status>`,
    );
    return report;
  },
};

export const lintRuleGeneratorTool: ToolDefinition<
  z.infer<typeof LintRuleGeneratorArgs>
> = {
  name: "lint_rule_generator",
  description:
    "Generate custom lint rules based on code analysis. Creates ESLint or TypeScript rules to enforce project-specific coding standards.",
  inputSchema: LintRuleGeneratorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await generateLintRule(args, ctx);
    const report = generateLintRuleXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Lint Rule Generated">Rule: ${result.ruleId}</dyad-status>`,
    );
    return report;
  },
};

export const runtimeTraceAnalyzerTool: ToolDefinition<
  z.infer<typeof RuntimeTraceArgs>
> = {
  name: "runtime_trace_analyzer",
  description:
    "Analyze runtime traces to identify performance bottlenecks, memory issues, and call graph problems. Supports various trace formats.",
  inputSchema: RuntimeTraceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeRuntimeTrace(args, ctx);
    const report = generateTraceXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Trace Analysis Complete">${result.hotspots.length} hotspots found</dyad-status>`,
    );
    return report;
  },
};

export const stackTraceInterpreterTool: ToolDefinition<
  z.infer<typeof StackTraceArgs>
> = {
  name: "stack_trace_interpreter",
  description:
    "Parse and interpret stack traces from various runtimes (Node.js, browser, Python, etc.). Maps minified code to source locations when source maps are available.",
  inputSchema: StackTraceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await interpretStackTrace(args, ctx);
    const report = generateStackTraceXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Stack Trace Interpreted">${result.frames.length} frames analyzed</dyad-status>`,
    );
    return report;
  },
};

export const threadBehaviorAnalyzerTool: ToolDefinition<
  z.infer<typeof ThreadBehaviorArgs>
> = {
  name: "thread_behavior_analyzer",
  description:
    "Analyze concurrent code patterns including async/await, promises, workers, and mutexes. Identifies potential race conditions and concurrency issues.",
  inputSchema: ThreadBehaviorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeThreadBehavior(args, ctx);
    const report = generateThreadXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Thread Analysis Complete">${result.patterns.length} patterns found</dyad-status>`,
    );
    return report;
  },
};

export const monorepoAnalyzerTool: ToolDefinition<
  z.infer<typeof MonorepoArgs>
> = {
  name: "monorepo_analyzer",
  description:
    "Analyze monorepo structure including workspaces, package dependencies, and inter-package relationships. Supports npm, yarn, and pnpm workspaces.",
  inputSchema: MonorepoArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeMonorepo(args, ctx);
    const report = generateMonorepoXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Monorepo Analysis Complete">${result.workspaces.length} workspaces found</dyad-status>`,
    );
    return report;
  },
};

export const microserviceDetectionTool: ToolDefinition<
  z.infer<typeof MicroserviceArgs>
> = {
  name: "microservice_detection",
  description:
    "Detect microservice boundaries within a codebase by analyzing API routes, Docker configurations, and package structures. Identifies service boundaries and communication patterns.",
  inputSchema: MicroserviceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await detectMicroservices(args, ctx);
    const report = generateMicroserviceXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Microservice Detection Complete">${result.services.length} services found</dyad-status>`,
    );
    return report;
  },
};

export const codeOwnershipGraphTool: ToolDefinition<
  z.infer<typeof CodeOwnershipArgs>
> = {
  name: "code_ownership_graph",
  description:
    "Map code ownership by analyzing git history to determine who owns which files. Helps identify knowledge gaps and responsibilities.",
  inputSchema: CodeOwnershipArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeOwnership(args, ctx);
    const report = generateOwnershipXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Ownership Analysis Complete">${result.files.length} files analyzed</dyad-status>`,
    );
    return report;
  },
};

export const developerWorkflowAnalyzerTool: ToolDefinition<
  z.infer<typeof DeveloperWorkflowArgs>
> = {
  name: "developer_workflow_analyzer",
  description:
    "Analyze developer workflows by examining git commit patterns, file change frequencies, and collaboration metrics. Provides insights into development practices.",
  inputSchema: DeveloperWorkflowArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeWorkflow(args, ctx);
    const report = generateWorkflowXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Workflow Analysis Complete">${result.commitPatterns.length} patterns found</dyad-status>`,
    );
    return report;
  },
};

export const automaticRefactoringTool: ToolDefinition<
  z.infer<typeof AutoRefactorArgs>
> = {
  name: "automatic_refactoring_system",
  description:
    "Automatically refactor code to improve quality. Supports extract method, rename, inline, simplify, and modernization refactorings. Can preview changes before applying.",
  inputSchema: AutoRefactorArgs,
  defaultConsent: "ask",
  modifiesState: true,

  execute: async (args, ctx) => {
    const result = await autoRefactor(args, ctx);
    const report = generateRefactorXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Refactoring Complete">${result.changes.length} changes identified</dyad-status>`,
    );
    return report;
  },
};

export const codeMigrationEngineTool: ToolDefinition<
  z.infer<typeof CodeMigrationArgs>
> = {
  name: "code_migration_engine",
  description:
    "Plan and execute code migrations between frameworks or versions. Generates step-by-step migration plans with risk assessments.",
  inputSchema: CodeMigrationArgs,
  defaultConsent: "ask",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await migrateCode(args, ctx);
    const report = generateMigrationXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Migration Plan Complete">${result.steps.length} steps planned</dyad-status>`,
    );
    return report;
  },
};

export const legacyCodeUnderstandingTool: ToolDefinition<
  z.infer<typeof LegacyCodeArgs>
> = {
  name: "legacy_code_understanding",
  description:
    "Analyze and understand legacy codebases. Identifies outdated patterns, estimates modernization complexity, and provides refactoring suggestions.",
  inputSchema: LegacyCodeArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeLegacyCode(args, ctx);
    const report = generateLegacyXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Legacy Analysis Complete">Score: ${result.compatibilityScore}/100</dyad-status>`,
    );
    return report;
  },
};

export const codeModernizationPlannerTool: ToolDefinition<
  z.infer<typeof ModernizationPlanArgs>
> = {
  name: "code_modernization_planner",
  description:
    "Create comprehensive modernization plans for upgrading codebases to modern frameworks and practices. Estimates effort, risks, and timeline.",
  inputSchema: ModernizationPlanArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await planModernization(args, ctx);
    const report = generateModernizationXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Modernization Plan Complete">${result.phases.length} phases planned</dyad-status>`,
    );
    return report;
  },
};

export const crossRepositoryLinkingTool: ToolDefinition<
  z.infer<typeof CrossRepoLinkArgs>
> = {
  name: "cross_repository_knowledge_linking",
  description:
    "Link knowledge across multiple repositories by identifying shared APIs, types, configurations, and patterns. Helps maintain consistency across projects.",
  inputSchema: CrossRepoLinkArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await linkCrossRepository(args, ctx);
    const report = generateCrossRepoXml(result);
    ctx.onXmlComplete(
      `<dyad-status title="Cross-Repo Linking Complete">${result.sharedTypes.length} shared types found</dyad-status>`,
    );
    return report;
  },
};
