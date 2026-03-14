/**
 * Architecture Analyzer Tool
 * Analyzes codebase structure and generates architectural insights:
 * - Component relationship graphs
 * - Service boundaries detection
 * - Pattern detection (CQRS, DDD, microservices, etc.)
 * - Architecture quality scoring
 * - Dependency flow analysis
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const ArchitectureAnalyzerArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Generate component relationship diagram */
  generateDiagram: z.boolean().default(true),
  /** Detect architectural patterns */
  detectPatterns: z.boolean().default(true),
  /** Analyze dependency flow */
  analyzeDependencies: z.boolean().default(true),
  /** Check for architectural anti-patterns */
  checkAntiPatterns: z.boolean().default(true),
});

type ArchitectureAnalyzerArgs = z.infer<typeof ArchitectureAnalyzerArgs>;

// Result types
interface FileNode {
  path: string;
  type: "file" | "directory";
  language?: string;
  imports?: string[];
  exports?: string[];
}

interface Component {
  name: string;
  path: string;
  type:
    | "component"
    | "service"
    | "module"
    | "page"
    | "hook"
    | "utility"
    | "type";
  dependencies: string[];
  dependents: string[];
  lines?: number;
}

interface DetectedPattern {
  name: string;
  confidence: number;
  description: string;
  evidence: string[];
}

interface AntiPattern {
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  location: string;
  suggestion: string;
}

interface ArchitectureReport {
  summary: {
    totalFiles: number;
    totalComponents: number;
    totalDirectories: number;
    languageBreakdown: Record<string, number>;
    averageFileSize: number;
  };
  components: Component[];
  patterns: DetectedPattern[];
  antiPatterns: AntiPattern[];
  dependencyGraph: Record<string, string[]>;
  qualityScore: {
    overall: number;
    modularity: number;
    complexity: number;
    maintainability: number;
  };
  recommendations: string[];
}

// Language detection by file extension
const languageMap: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".cpp": "cpp",
  ".c": "c",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".vue": "vue",
  ".svelte": "svelte",
};

// Component type detection by path/filename patterns
const componentPatterns: Record<
  string,
  { type: Component["type"]; patterns: RegExp[] }
> = {
  component: {
    type: "component",
    patterns: [
      /\/components\/[^/]+\.(tsx|jsx|vue|svelte)$/i,
      /\/ui\/[^/]+\.(tsx|jsx)$/i,
    ],
  },
  page: {
    type: "page",
    patterns: [
      /\/pages\/[^/]+\.(tsx|jsx)$/i,
      /\/app\/[^/]+\/page\.(tsx|jsx)$/i,
    ],
  },
  hook: {
    type: "hook",
    patterns: [/\/hooks\/[^/]+\.(ts|tsx)$/i, /^use[A-Z].+\.(ts|tsx)$/i],
  },
  service: {
    type: "service",
    patterns: [/\/services\/[^/]+\.(ts|js)$/i, /\/api\/[^/]+\.(ts|js)$/i],
  },
  module: {
    type: "module",
    patterns: [
      /\/modules\/[^/]+$/i,
      /\/features\/[^/]+$/i,
      /\/domain\/[^/]+$/i,
    ],
  },
  utility: {
    type: "utility",
    patterns: [
      /\/utils\/[^/]+\.(ts|js)$/i,
      /\/lib\/[^/]+\.(ts|js)$/i,
      /\/helpers\/[^/]+\.(ts|js)$/i,
    ],
  },
  type: {
    type: "type",
    patterns: [
      /\/types\/[^/]+\.(ts|d\.ts)$/i,
      /\/interfaces\/[^/]+\.(ts|d\.ts)$/i,
      /\.d\.ts$/i,
    ],
  },
};

// Detect component type from path
function detectComponentType(filePath: string): Component["type"] | null {
  for (const [, config] of Object.entries(componentPatterns)) {
    for (const pattern of config.patterns) {
      if (pattern.test(filePath)) {
        return config.type;
      }
    }
  }
  return null;
}

// Extract imports from TypeScript/JavaScript file
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

// Extract exports from TypeScript/JavaScript file
function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Named exports
  const namedExportRegex =
    /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Default exports
  if (/export\s+default/.test(content)) {
    exports.push("default");
  }

  return exports;
}

// Analyze a directory recursively
async function analyzeDirectory(
  dirPath: string,
  depth: number = 0,
  maxDepth: number = 5,
): Promise<{ files: FileNode[]; components: Component[] }> {
  const files: FileNode[] = [];
  const components: Component[] = [];

  if (depth > maxDepth) return { files, components };

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip common non-source directories
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".next" ||
        entry.name === "__pycache__" ||
        entry.name === "venv" ||
        entry.name === "coverage"
      ) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subResult = await analyzeDirectory(fullPath, depth + 1, maxDepth);
        files.push(...subResult.files);
        components.push(...subResult.components);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const language = languageMap[ext];

        if (language) {
          const fileNode: FileNode = {
            path: fullPath,
            type: "file",
            language,
          };

          // For TypeScript/JavaScript files, extract imports/exports
          if (
            ext === ".ts" ||
            ext === ".tsx" ||
            ext === ".js" ||
            ext === ".jsx"
          ) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              fileNode.imports = extractImports(content);
              fileNode.exports = extractExports(content);
            } catch {
              // Skip files that can't be read
            }
          }

          files.push(fileNode);

          // Check if it's a component
          const componentType = detectComponentType(fullPath);
          if (componentType) {
            components.push({
              name: path.basename(entry.name, ext),
              path: fullPath,
              type: componentType,
              dependencies: fileNode.imports || [],
              dependents: [],
            });
          }
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return { files, components };
}

// Detect architectural patterns
function detectPatterns(
  components: Component[],
  files: FileNode[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const hasReact = files.some(
    (f) => f.path.includes("react") || f.path.includes("nextjs"),
  );
  const hasState = files.some(
    (f) =>
      f.path.includes("store") ||
      f.path.includes("context") ||
      f.path.includes("zustand"),
  );
  const hasApi = files.some(
    (f) => f.path.includes("/api/") || f.path.includes("/services/"),
  );
  const hasDatabase = files.some(
    (f) =>
      f.path.includes("/db/") ||
      f.path.includes("/database/") ||
      f.path.includes("/models/") ||
      f.path.includes("/prisma/") ||
      f.path.includes("/drizzle/"),
  );
  const hasHooks = files.some(
    (f) => f.path.includes("/hooks/") || f.path.startsWith("use"),
  );
  const hasPages = files.some(
    (f) => f.path.includes("/pages/") || f.path.includes("/app/"),
  );
  const hasComponents = files.some(
    (f) => f.path.includes("/components/") || f.path.includes("/ui/"),
  );

  // React/Frontend pattern
  if (hasReact && hasComponents && hasHooks) {
    patterns.push({
      name: "Component-Based Architecture",
      confidence: 0.9,
      description: "Uses React component-based architecture with hooks",
      evidence: [
        "React dependencies detected",
        "Components directory found",
        "Custom hooks present",
      ],
    });
  }

  // Modern Web App (Next.js pattern)
  if (hasReact && hasPages) {
    patterns.push({
      name: "Modern Web Application",
      confidence: 0.85,
      description: "Full-stack web application with page-based routing",
      evidence: ["Page directory detected", "React framework detected"],
    });
  }

  // Layered Architecture
  const hasLayers = ["components", "services", "utils", "types"].every((dir) =>
    files.some((f) => f.path.includes(`/${dir}/`)),
  );
  if (hasLayers) {
    patterns.push({
      name: "Layered Architecture",
      confidence: 0.8,
      description: "Clear separation between UI, business logic, and utilities",
      evidence: ["components/, services/, utils/, types/ directories found"],
    });
  }

  // DDD-ish (Domain Driven)
  if (
    files.some((f) => f.path.includes("/domain/")) ||
    files.some((f) => f.path.includes("/features/"))
  ) {
    patterns.push({
      name: "Feature-Based / DDD",
      confidence: 0.7,
      description: "Domain-driven or feature-based organization",
      evidence: ["domain/ or features/ directory found"],
    });
  }

  // Client-Server
  if (hasApi && hasDatabase) {
    patterns.push({
      name: "Client-Server Architecture",
      confidence: 0.85,
      description: "Separated client and server concerns",
      evidence: ["API layer detected", "Database layer detected"],
    });
  }

  // State Management
  if (hasState) {
    patterns.push({
      name: "Centralized State Management",
      confidence: 0.8,
      description:
        "Uses centralized state management (Redux, Zustand, Jotai, etc.)",
      evidence: ["Store or context directory detected"],
    });
  }

  return patterns;
}

// Detect anti-patterns
function detectAntiPatterns(
  components: Component[],
  files: FileNode[],
): AntiPattern[] {
  const antiPatterns: AntiPattern[] = [];

  // Circular dependencies (simplified check)
  const allDeps = new Set<string>();
  for (const comp of components) {
    for (const dep of comp.dependencies) {
      allDeps.add(dep);
    }
  }

  // Check for large files
  for (const file of files) {
    try {
      const stats = fs.statSync(file.path);
      const lines = stats.size / 50; // Approximate lines

      if (lines > 500) {
        antiPatterns.push({
          name: "Large File",
          severity: "medium",
          description: `File has approximately ${Math.round(lines)} lines`,
          location: file.path,
          suggestion: "Consider splitting into smaller modules",
        });
      }
    } catch {
      // Skip
    }
  }

  // Check for deeply nested directories
  for (const file of files) {
    const depth = file.path.split(path.sep).length;
    if (depth > 8) {
      antiPatterns.push({
        name: "Deep Directory Structure",
        severity: "low",
        description: `File is ${depth} levels deep`,
        location: file.path,
        suggestion: "Consider flattening the directory structure",
      });
    }
  }

  // Check for mixed concerns (files with too many different types)
  const componentDirs = new Set<string>();
  for (const comp of components) {
    const dir = path.dirname(comp.path);
    componentDirs.add(dir);
  }

  return antiPatterns;
}

// Build dependency graph
function buildDependencyGraph(
  components: Component[],
): Record<string, string[]> {
  const graph: Record<string, string[]> = {};

  for (const comp of components) {
    const key = comp.path;
    graph[key] = [];

    for (const dep of comp.dependencies) {
      // Find matching component
      const matching = components.find(
        (c) =>
          dep.includes(c.name) ||
          c.name.toLowerCase().includes(dep.toLowerCase()),
      );
      if (matching && matching.path !== key) {
        graph[key].push(matching.path);
      }
    }
  }

  return graph;
}

// Calculate quality scores
function calculateQualityScores(
  components: Component[],
  files: FileNode[],
  patterns: DetectedPattern[],
  antiPatterns: AntiPattern[],
): ArchitectureReport["qualityScore"] {
  let modularity = 50;
  let complexity = 50;
  let maintainability = 50;

  // Modularity: based on component diversity and pattern detection
  const uniqueTypes = new Set(components.map((c) => c.type)).size;
  modularity += uniqueTypes * 5;
  modularity += patterns.length * 3;
  modularity = Math.min(100, modularity);

  // Complexity: based on file count and component dependencies
  complexity = files.length * 0.5;
  complexity +=
    components.reduce((sum, c) => sum + c.dependencies.length, 0) * 2;
  complexity = Math.min(100, complexity);

  // Maintainability: inversely related to anti-patterns
  maintainability -=
    antiPatterns.filter((a) => a.severity === "critical").length * 20;
  maintainability -=
    antiPatterns.filter((a) => a.severity === "high").length * 10;
  maintainability -=
    antiPatterns.filter((a) => a.severity === "medium").length * 5;
  maintainability = Math.max(0, Math.min(100, maintainability));

  return {
    overall: Math.round(
      (modularity + (100 - complexity) + maintainability) / 3,
    ),
    modularity: Math.min(100, modularity),
    complexity: Math.min(100, complexity),
    maintainability,
  };
}

// Generate recommendations
function generateRecommendations(
  components: Component[],
  patterns: DetectedPattern[],
  antiPatterns: AntiPattern[],
  quality: ArchitectureReport["qualityScore"],
): string[] {
  const recommendations: string[] = [];

  if (quality.modularity < 50) {
    recommendations.push(
      "Consider organizing code into clearer module boundaries",
    );
  }

  if (quality.complexity > 70) {
    recommendations.push(
      "High complexity detected - consider breaking down large components",
    );
  }

  const criticalAntiPatterns = antiPatterns.filter(
    (a) => a.severity === "critical",
  );
  if (criticalAntiPatterns.length > 0) {
    recommendations.push(
      `Address ${criticalAntiPatterns.length} critical architectural issues`,
    );
  }

  if (!patterns.find((p) => p.name === "Layered Architecture")) {
    recommendations.push(
      "Consider implementing a layered architecture for better separation of concerns",
    );
  }

  if (!patterns.find((p) => p.name === "Centralized State Management")) {
    recommendations.push(
      "Consider adding centralized state management for complex UI state",
    );
  }

  return recommendations;
}

// Main analysis function
async function analyzeArchitecture(
  args: ArchitectureAnalyzerArgs,
  ctx: AgentContext,
): Promise<ArchitectureReport> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Architecture Analyzer">Scanning project structure...</dyad-status>`,
  );

  const { files, components } = await analyzeDirectory(projectPath);

  ctx.onXmlStream(
    `<dyad-status title="Architecture Analyzer">Analyzing ${files.length} files and ${components.length} components...</dyad-status>`,
  );

  // Language breakdown
  const languageBreakdown: Record<string, number> = {};
  for (const file of files) {
    const lang = file.language || "unknown";
    languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
  }

  // Average file size
  let totalSize = 0;
  let measuredFiles = 0;
  for (const file of files) {
    try {
      const stats = fs.statSync(file.path);
      totalSize += stats.size;
      measuredFiles++;
    } catch {
      // Skip
    }
  }
  const averageFileSize =
    measuredFiles > 0 ? Math.round(totalSize / measuredFiles) : 0;

  // Detect patterns
  const patterns = args.detectPatterns ? detectPatterns(components, files) : [];

  // Detect anti-patterns
  const antiPatterns = args.checkAntiPatterns
    ? detectAntiPatterns(components, files)
    : [];

  // Build dependency graph
  const dependencyGraph = args.analyzeDependencies
    ? buildDependencyGraph(components)
    : {};

  // Calculate quality scores
  const qualityScore = calculateQualityScores(
    components,
    files,
    patterns,
    antiPatterns,
  );

  // Generate recommendations
  const recommendations = generateRecommendations(
    components,
    patterns,
    antiPatterns,
    qualityScore,
  );

  return {
    summary: {
      totalFiles: files.length,
      totalComponents: components.length,
      totalDirectories: new Set(files.map((f) => path.dirname(f.path))).size,
      languageBreakdown,
      averageFileSize,
    },
    components,
    patterns,
    antiPatterns,
    dependencyGraph,
    qualityScore,
    recommendations,
  };
}

// Generate XML report
function generateArchitectureXml(report: ArchitectureReport): string {
  const lines: string[] = [
    `# Architecture Analysis Report`,
    ``,
    `## Summary`,
    `- Total Files: ${report.summary.totalFiles}`,
    `- Components: ${report.summary.totalComponents}`,
    `- Languages: ${Object.keys(report.summary.languageBreakdown).join(", ")}`,
    ``,
    `## Quality Scores`,
    `- **Overall**: ${report.qualityScore.overall}/100`,
    `- Modularity: ${report.qualityScore.modularity}/100`,
    `- Complexity: ${report.qualityScore.complexity}/100`,
    `- Maintainability: ${report.qualityScore.maintainability}/100`,
    ``,
  ];

  // Detected patterns
  if (report.patterns.length > 0) {
    lines.push(`## 🏗️ Detected Patterns`);
    for (const pattern of report.patterns) {
      lines.push(
        `- **${pattern.name}** (${Math.round(pattern.confidence * 100)}% confidence)`,
      );
      lines.push(`  ${pattern.description}`);
    }
    lines.push("");
  }

  // Anti-patterns
  if (report.antiPatterns.length > 0) {
    const critical = report.antiPatterns.filter(
      (a) => a.severity === "critical",
    );
    const high = report.antiPatterns.filter((a) => a.severity === "high");

    if (critical.length > 0 || high.length > 0) {
      lines.push(`## ⚠️ Architectural Issues`);
      for (const issue of [...critical, ...high].slice(0, 5)) {
        lines.push(`- **${issue.name}** [${issue.severity}]`);
        lines.push(`  ${issue.description}`);
        lines.push(`  📍 ${issue.location}`);
      }
      lines.push("");
    }
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push(`## 💡 Recommendations`);
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join("\n");
}

export const architectureAnalyzerTool: ToolDefinition<ArchitectureAnalyzerArgs> =
  {
    name: "architecture_analyzer",
    description:
      "Analyze project architecture including component relationships, detected patterns (DDD, microservices, layered), anti-patterns, and quality scores. Provides actionable recommendations.",
    inputSchema: ArchitectureAnalyzerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const report = await analyzeArchitecture(args, ctx);

      const reportXml = generateArchitectureXml(report);

      ctx.onXmlComplete(
        `<dyad-status title="Architecture Analysis Complete">Quality Score: ${report.qualityScore.overall}/100</dyad-status>`,
      );

      return reportXml;
    },
  };
