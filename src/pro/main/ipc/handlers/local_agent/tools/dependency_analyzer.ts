/**
 * Dependency Analyzer Tool
 * Analyzes package.json and package-lock.json for:
 * - Outdated dependencies
 * - Security vulnerabilities
 * - License compliance
 * - Deprecated packages
 * - Deep transitive dependencies
 * - Circular dependency detection
 * - Bundle impact analysis
 * - Duplicate/orphan dependencies
 *
 * Capabilities: 451-520
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

// Original analyzer args
const DependencyAnalyzerArgs = z.object({
  projectPath: z.string().optional(),
  checkOutdated: z.boolean().default(true),
  checkSecurity: z.boolean().default(true),
  checkLicenses: z.boolean().default(false),
});

// Transitive scan args (Capability 451-455)
const TransitiveScanArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Maximum depth to traverse (default: unlimited) */
  maxDepth: z.number().optional(),
  /** Filter to specific package */
  filterPackage: z.string().optional(),
});

// Transitive vulnerabilities args (Capability 456-460)
const TransitiveVulnerabilitiesArgs = z.object({
  projectPath: z.string().optional(),
  /** Minimum severity to report */
  minSeverity: z.enum(["critical", "high", "medium", "low"]).default("low"),
});

// Transitive outdated args (Capability 461-465)
const TransitiveOutdatedArgs = z.object({
  projectPath: z.string().optional(),
});

// Deep dependency tree args (Capability 466-470)
const DeepDependencyTreeArgs = z.object({
  projectPath: z.string().optional(),
  /** Output format: 'text' | 'json' | 'graphviz' */
  format: z.enum(["text", "json", "graphviz"]).default("text"),
  /** Maximum depth to display */
  maxDepth: z.number().optional(),
});

// Detect cycles args (Capability 509)
const DetectCyclesArgs = z.object({
  projectPath: z.string().optional(),
});

// Cycle path args (Capability 509)
const CyclePathArgs = z.object({
  projectPath: z.string().optional(),
  /** Package name to find cycles for */
  packageName: z.string().optional(),
});

// Cycle impact args (Capability 509)
const CycleImpactArgs = z.object({
  projectPath: z.string().optional(),
});

// License check args (Capability 471-480)
const LicenseCheckArgs = z.object({
  projectPath: z.string().optional(),
  /** Specific licenses to check for conflicts */
  checkLicenses: z.array(z.string()).optional(),
});

// Bundle impact args (Capability 481-490)
const BundleImpactArgs = z.object({
  projectPath: z.string().optional(),
  /** Include dev dependencies */
  includeDev: z.boolean().default(false),
});

// Duplicate deps args (Capability 491-500)
const DuplicateDepsArgs = z.object({
  projectPath: z.string().optional(),
});

// Orphan deps args (Capability 501-510)
const OrphanDepsArgs = z.object({
  projectPath: z.string().optional(),
});

// Deprecated check args (Capability 511-520)
const DeprecatedCheckArgs = z.object({
  projectPath: z.string().optional(),
  /** Check specific packages */
  packages: z.array(z.string()).optional(),
});

// Verify imports args (Mechanism 13)
const VerifyImportsArgs = z.object({
  projectPath: z.string().optional(),
  /** Code snippet to analyze */
  code: z.string(),
});

type DependencyAnalyzerArgs = z.infer<typeof DependencyAnalyzerArgs>;
type TransitiveScanArgs = z.infer<typeof TransitiveScanArgs>;
type TransitiveVulnerabilitiesArgs = z.infer<
  typeof TransitiveVulnerabilitiesArgs
>;
type TransitiveOutdatedArgs = z.infer<typeof TransitiveOutdatedArgs>;
type DeepDependencyTreeArgs = z.infer<typeof DeepDependencyTreeArgs>;
type DetectCyclesArgs = z.infer<typeof DetectCyclesArgs>;
type CyclePathArgs = z.infer<typeof CyclePathArgs>;
type CycleImpactArgs = z.infer<typeof CycleImpactArgs>;
type LicenseCheckArgs = z.infer<typeof LicenseCheckArgs>;
type BundleImpactArgs = z.infer<typeof BundleImpactArgs>;
type DuplicateDepsArgs = z.infer<typeof DuplicateDepsArgs>;
type OrphanDepsArgs = z.infer<typeof OrphanDepsArgs>;
type DeprecatedCheckArgs = z.infer<typeof DeprecatedCheckArgs>;
type VerifyImportsArgs = z.infer<typeof VerifyImportsArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface DependencyIssue {
  name: string;
  current: string;
  latest?: string;
  wanted?: string;
  type:
    | "outdated"
    | "security"
    | "license"
    | "deprecated"
    | "orphan"
    | "duplicate";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  advisoryUrl?: string;
  license?: string;
}

interface AnalysisResult {
  summary: {
    total: number;
    outdated: number;
    security: number;
    licenses: number;
    deprecated: number;
  };
  issues: DependencyIssue[];
  analyzedAt: string;
}

// Transitive dependency node
interface TransitiveDepNode {
  name: string;
  version: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
}

// Transitive scan result
interface TransitiveScanResult {
  totalPackages: number;
  directDeps: number;
  transitiveDeps: number;
  tree: TransitiveDepNode;
  packages: Map<string, TransitiveDepNode>;
}

// Vulnerability in transitive dep
interface TransitiveVulnerability {
  package: string;
  severity: "critical" | "high" | "medium" | "low";
  Via: string[];
  range: string;
  title: string;
  url: string;
}

// Cycle detection result
interface CycleResult {
  hasCycles: boolean;
  cycles: string[][];
  cycleCount: number;
}

// License info
interface LicenseInfo {
  package: string;
  license: string;
  licenseFile?: string;
  source: "package.json" | "npm" | "fallback";
}

// Bundle size estimate
interface BundleImpact {
  package: string;
  version: string;
  size: number; // bytes
  isminified?: boolean;
  files: string[];
  percentOfTotal?: number;
}

// Duplicate dependency
interface DuplicateDep {
  package: string;
  versions: string[];
  locations: string[];
}

// Orphan dependency
interface OrphanDep {
  package: string;
  version: string;
  location: string;
  reason: "not-imported" | "not-required" | "unreachable";
}

// ============================================================================
// Utility Functions
// ============================================================================

// Execute npm command and return JSON output
async function runNpmCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(`Command failed: ${stderr || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

// Get project path
function getProjectPath(
  args: { projectPath?: string },
  ctx: AgentContext,
): string {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }
  return projectPath;
}

// ============================================================================
// Parsing Functions
// ============================================================================

// Parse npm outdated output
function parseNpmOutdated(output: string): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  if (!output.trim()) return issues;

  try {
    const data = JSON.parse(output);
    for (const [name, info] of Object.entries(data)) {
      const dep = info as any;
      issues.push({
        name,
        current: dep.current || "unknown",
        wanted: dep.wanted,
        latest: dep.latest,
        type: "outdated",
        severity: "low",
        message: `Package is outdated. Current: ${dep.current}, Latest: ${dep.latest}`,
      });
    }
  } catch {
    // Not JSON output
  }
  return issues;
}

// Parse npm audit output for security issues
function parseNpmAudit(output: string): DependencyIssue[] {
  const issues: DependencyIssue[] = [];

  try {
    const auditData = JSON.parse(output);
    if (auditData.vulnerabilities) {
      const vulns = auditData.vulnerabilities;

      for (const [packageName, details] of Object.entries(vulns)) {
        const vuln = details as any;
        const severity =
          vuln.severity === "critical"
            ? "critical"
            : vuln.severity === "high"
              ? "high"
              : vuln.severity === "medium"
                ? "medium"
                : "low";

        issues.push({
          name: packageName,
          current: "unknown",
          type: "security",
          severity,
          message: `${vuln.title || "Security vulnerability"} - ${vuln.range || "unknown range"}`,
          advisoryUrl: `https://npmjs.com/advisories/${packageName}`,
        });
      }
    }
  } catch {
    // Not JSON output
  }

  return issues;
}

// Parse npm ls --all --json output for full tree
function parseNpmLsTree(output: string): TransitiveScanResult {
  const result: TransitiveScanResult = {
    totalPackages: 0,
    directDeps: 0,
    transitiveDeps: 0,
    tree: { name: "root", version: "0.0.0" },
    packages: new Map(),
  };

  try {
    const data = JSON.parse(output);
    result.tree = data as unknown as TransitiveDepNode;

    // Count packages recursively
    const countDeps = (
      node: TransitiveDepNode,
      isDirect: boolean = false,
    ): number => {
      let count = 0;
      result.packages.set(`${node.name}@${node.version}`, node);

      if (isDirect) result.directDeps++;

      if (node.dependencies) {
        for (const [name, version] of Object.entries(node.dependencies)) {
          const childNode: TransitiveDepNode = { name, version };
          const child = (node as any)._dependencies?.[name];
          if (child) {
            Object.assign(childNode, child);
          }
          count += 1 + countDeps(childNode, false);
        }
      }
      return count;
    };

    result.totalPackages = 1 + countDeps(result.tree, true);
    result.transitiveDeps = result.totalPackages - result.directDeps - 1;
  } catch {
    // Handle parse error
  }

  return result;
}

// Detect cycles using DFS (Tarjan's algorithm simplified)
function detectCyclesInDepTree(tree: any): CycleResult {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: any, parentPath: string[]): void => {
    if (!node || !node.name) return;

    const nodeName = `${node.name}@${node.version || "unknown"}`;

    if (recursionStack.has(nodeName)) {
      // Found a cycle
      const cycleStart = parentPath.indexOf(nodeName);
      if (cycleStart !== -1) {
        const cycle = [...parentPath.slice(cycleStart), nodeName];
        cycles.push(cycle);
      }
      return;
    }

    if (visited.has(nodeName)) return;

    visited.add(nodeName);
    recursionStack.add(nodeName);
    path.push(nodeName);

    if (node.dependencies) {
      for (const [depName, depVersion] of Object.entries(node.dependencies)) {
        const child = (node as any)._dependencies?.[depName];
        if (child) {
          dfs(child, [...path, `${depName}@${depVersion}`]);
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeName);
  };

  dfs(tree, []);

  return {
    hasCycles: cycles.length > 0,
    cycles,
    cycleCount: cycles.length,
  };
}

// Check for license compatibility issues
async function checkLicenseCompatibility(
  packages: string[],
  cwd: string,
): Promise<LicenseInfo[]> {
  const results: LicenseInfo[] = [];

  for (const pkg of packages.slice(0, 50)) {
    try {
      const output = await runNpmCommand(`npm view ${pkg} license --json`, cwd);
      const license = output.trim().replace(/^"/, "").replace(/"$/, "");

      if (license && license !== "null") {
        results.push({
          package: pkg,
          license,
          source: "npm",
        });
      }
    } catch {
      // Skip if not found
    }
  }

  return results;
}

// Estimate bundle size from package info
async function estimateBundleSize(
  packageName: string,
  version: string,
  cwd: string,
): Promise<BundleImpact | null> {
  try {
    const output = await runNpmCommand(
      `npm view ${packageName}@${version} dist --json`,
      cwd,
    );
    const dist = JSON.parse(output);
    const size = dist?.size || 0;

    return {
      package: packageName,
      version,
      size,
      files: dist?.fileCount ? [`${dist.fileCount} files in package`] : [],
    };
  } catch {
    return null;
  }
}

// Find duplicate dependencies
function findDuplicates(tree: any): DuplicateDep[] {
  const versionsByPackage = new Map<string, Map<string, string[]>>();

  const traverse = (node: any, path: string[]): void => {
    if (!node || !node.name) return;

    const packageName = node.name;
    const version = node.version || "unknown";
    const location = path.join(" > ");

    if (!versionsByPackage.has(packageName)) {
      versionsByPackage.set(packageName, new Map());
    }

    const versionMap = versionsByPackage.get(packageName)!;
    if (!versionMap.has(version)) {
      versionMap.set(version, []);
    }
    versionMap.get(version)!.push(location);

    if (node.dependencies) {
      for (const [depName, _depVersion] of Object.entries(node.dependencies)) {
        const child = (node as any)._dependencies?.[depName];
        if (child) {
          traverse(child, [...path, depName]);
        }
      }
    }
  };

  traverse(tree, ["root"]);

  const duplicates: DuplicateDep[] = [];
  for (const [packageName, versionMap] of versionsByPackage) {
    if (versionMap.size > 1) {
      duplicates.push({
        package: packageName,
        versions: Array.from(versionMap.keys()),
        locations: Array.from(versionMap.values()).flat(),
      });
    }
  }

  return duplicates;
}

// Find orphan dependencies (not in package.json deps)
function findOrphans(tree: any, packageJson: any): OrphanDep[] {
  const declaredDeps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
  ]);

  const orphans: OrphanDep[] = [];
  const reachable = new Set<string>();

  const traverse = (node: any): void => {
    if (!node || !node.name) return;

    reachable.add(node.name);

    if (node.dependencies) {
      for (const depName of Object.keys(node.dependencies)) {
        const child = (node as any)._dependencies?.[depName];
        if (child) {
          traverse(child);
        }
      }
    }
  };

  traverse(tree);

  // Find all packages in tree
  const allPackages = new Map<string, any>();
  const collectAll = (node: any): void => {
    if (!node || !node.name) return;
    allPackages.set(node.name, node);
    if (node.dependencies) {
      for (const depName of Object.keys(node.dependencies)) {
        const child = (node as any)._dependencies?.[depName];
        if (child) {
          collectAll(child);
        }
      }
    }
  };
  collectAll(tree);

  for (const [pkgName, pkgInfo] of allPackages) {
    if (!declaredDeps.has(pkgName) && !reachable.has(pkgName)) {
      orphans.push({
        package: pkgName,
        version: pkgInfo.version || "unknown",
        location: "deep transitive",
        reason: "unreachable",
      });
    }
  }

  return orphans;
}

// Check deprecated packages
async function checkDeprecated(
  packages: string[],
  cwd: string,
): Promise<DependencyIssue[]> {
  const issues: DependencyIssue[] = [];

  for (const pkg of packages.slice(0, 50)) {
    try {
      const output = await runNpmCommand(
        `npm view ${pkg} deprecated --json`,
        cwd,
      );
      if (output && output.trim() && output.trim() !== "null") {
        issues.push({
          name: pkg,
          current: "unknown",
          type: "deprecated",
          severity: "high",
          message: `Package is deprecated: ${output.trim()}`,
        });
      }
    } catch {
      // Not deprecated
    }
  }

  return issues;
}

/**
 * Verify Library Existence (Mechanism 13)
 * Checks imports in a code snippet against the declared dependencies in package.json.
 */
function verifyImports(code: string, packageJson: any): string[] {
  const missing: string[] = [];
  const declaredDeps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
    // Built-in node modules (common)
    "fs",
    "path",
    "os",
    "http",
    "https",
    "crypto",
    "stream",
    "buffer",
    "util",
    "events",
    "child_process",
  ]);

  // Simple regex to find imports (both ES6 and CommonJS)
  const importRegex =
    /(?:import\s+.*\s+from\s+['"]|require\(['"])(@?[\w\d\-./]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    // Extract base package name (e.g., '@org/package/foo' -> '@org/package', 'lodash/fp' -> 'lodash')
    let pkgName = importPath;
    if (importPath.startsWith("@")) {
      const parts = importPath.split("/");
      if (parts.length >= 2) pkgName = `${parts[0]}/${parts[1]}`;
    } else {
      pkgName = importPath.split("/")[0];
    }

    if (
      !declaredDeps.has(pkgName) &&
      !pkgName.startsWith(".") &&
      !pkgName.startsWith("/")
    ) {
      missing.push(pkgName);
    }
  }

  return [...new Set(missing)];
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

async function analyzeDependencies(
  args: DependencyAnalyzerArgs,
  ctx: AgentContext,
): Promise<AnalysisResult> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  const issues: DependencyIssue[] = [];
  const allDeps = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];

  ctx.onXmlStream(
    `<dyad-status title="Dependency Analyzer">Analyzing ${allDeps.length} dependencies in ${path.basename(projectPath)}...</dyad-status>`,
  );

  if (args.checkOutdated) {
    ctx.onXmlStream(
      `<dyad-status title="Dependency Analyzer">Checking for outdated packages...</dyad-status>`,
    );
    try {
      const outdatedOutput = await runNpmCommand(
        "npm outdated --json --long",
        projectPath,
      );
      issues.push(...parseNpmOutdated(outdatedOutput));
    } catch {}
  }

  if (args.checkSecurity) {
    ctx.onXmlStream(
      `<dyad-status title="Dependency Analyzer">Checking for security vulnerabilities...</dyad-status>`,
    );
    try {
      const auditOutput = await runNpmCommand("npm audit --json", projectPath);
      issues.push(...parseNpmAudit(auditOutput));
    } catch {}
  }

  const deprecated = await checkDeprecated(allDeps, projectPath);
  issues.push(...deprecated);

  const summary = {
    total: issues.length,
    outdated: issues.filter((i) => i.type === "outdated").length,
    security: issues.filter((i) => i.type === "security").length,
    licenses: issues.filter((i) => i.type === "license").length,
    deprecated: issues.filter((i) => i.type === "deprecated").length,
  };

  return { summary, issues, analyzedAt: new Date().toISOString() };
}

// Transitive Scan (Capability 451-455)
async function performTransitiveScan(
  args: TransitiveScanArgs,
  ctx: AgentContext,
): Promise<TransitiveScanResult> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Transitive Scan">Building full dependency tree...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const result = parseNpmLsTree(output);

  // Filter if requested
  if (args.filterPackage) {
    const filtered = result.packages.get(args.filterPackage);
    if (filtered) {
      return {
        ...result,
        tree: filtered,
        totalPackages: 1,
        directDeps: 0,
        transitiveDeps: 0,
      };
    }
  }

  return result;
}

// Transitive Vulnerabilities (Capability 456-460)
async function findTransitiveVulnerabilities(
  args: TransitiveVulnerabilitiesArgs,
  ctx: AgentContext,
): Promise<TransitiveVulnerability[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Transitive Vulnerabilities">Scanning for CVEs...</dyad-status>`,
  );

  const output = await runNpmCommand("npm audit --json", projectPath);
  const auditData = JSON.parse(output);

  const vulnerabilities: TransitiveVulnerability[] = [];
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const minSeverityIdx = severityOrder[args.minSeverity];

  if (auditData.vulnerabilities) {
    for (const [packageName, details] of Object.entries(
      auditData.vulnerabilities,
    )) {
      const vuln = details as any;
      if (
        severityOrder[vuln.severity as keyof typeof severityOrder] <=
        minSeverityIdx
      ) {
        vulnerabilities.push({
          package: packageName,
          severity: vuln.severity,
          Via: vuln.Via || [],
          range: vuln.range || "unknown",
          title: vuln.title || "Security vulnerability",
          url: `https://npmjs.com/advisories/${packageName}`,
        });
      }
    }
  }

  return vulnerabilities.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
}

// Transitive Outdated (Capability 461-465)
async function findTransitiveOutdated(
  args: TransitiveOutdatedArgs,
  ctx: AgentContext,
): Promise<DependencyIssue[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Transitive Outdated">Checking all dependency versions...</dyad-status>`,
  );

  try {
    const output = await runNpmCommand(
      "npm outdated --json --long --all",
      projectPath,
    );
    return parseNpmOutdated(output);
  } catch {
    return [];
  }
}

// Deep Dependency Tree (Capability 466-470)
async function generateDeepDependencyTree(
  args: DeepDependencyTreeArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Deep Dependency Tree">Generating complete tree...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  const maxDepth = args.maxDepth || 10;

  const formatText = (node: any, depth: number = 0): string => {
    if (depth > maxDepth) return "";
    const indent = "  ".repeat(depth);
    let result = `${indent}${node.name}@${node.version}\n`;
    if (node.dependencies && depth < maxDepth) {
      for (const [name, version] of Object.entries(node.dependencies)) {
        const child = (node as any)._dependencies?.[name];
        if (child) {
          result += formatText(child, depth + 1);
        } else {
          result += `${indent}  ${name}@${version}\n`;
        }
      }
    }
    return result;
  };

  const formatJson = (node: any): string => {
    return JSON.stringify(node, null, 2);
  };

  const formatGraphviz = (node: any, depth: number = 0): string => {
    if (depth > maxDepth) return "";
    let result = `  "${node.name}@${node.version}" [label="${node.name}\\n${node.version}"];\n`;
    if (node.dependencies && depth < maxDepth) {
      for (const [name, version] of Object.entries(node.dependencies)) {
        const child = (node as any)._dependencies?.[name];
        result += `  "${node.name}@${node.version}" -> "${name}@${version}";\n`;
        if (child) {
          result += formatGraphviz(child, depth + 1);
        }
      }
    }
    return result;
  };

  switch (args.format) {
    case "json":
      return formatJson(data);
    case "graphviz":
      return `digraph dependencies {\n${formatGraphviz(data)}\n}`;
    default:
      return formatText(data);
  }
}

// Detect Cycles (Capability 509)
async function detectCycles(
  args: DetectCyclesArgs,
  ctx: AgentContext,
): Promise<CycleResult> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Detect Cycles">Analyzing dependency graph...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  return detectCyclesInDepTree(data);
}

// Cycle Path (Capability 509)
async function getCyclePath(
  args: CyclePathArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  const result = detectCyclesInDepTree(data);

  if (result.cycles.length === 0) {
    return "No circular dependencies detected.";
  }

  if (args.packageName) {
    const filtered = result.cycles.filter((c) =>
      c.some((p) => p.startsWith(args.packageName!)),
    );
    if (filtered.length === 0) {
      return `No cycles found involving package: ${args.packageName}`;
    }
    return filtered
      .map((c, i) => `Cycle ${i + 1}:\n${c.join(" → ")}`)
      .join("\n\n");
  }

  return result.cycles
    .map((c, i) => `Cycle ${i + 1}:\n${c.join(" → ")}`)
    .join("\n\n");
}

// Cycle Impact (Capability 509)
async function analyzeCycleImpact(
  args: CycleImpactArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Cycle Impact">Analyzing impact...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  const result = detectCyclesInDepTree(data);

  if (result.cycles.length === 0) {
    return "No circular dependencies detected. No impact concerns.";
  }

  const impactReport = [
    `## Circular Dependency Impact Analysis`,
    ``,
    `**Total Cycles Found:** ${result.cycleCount}`,
    ``,
  ];

  for (let i = 0; i < result.cycles.length; i++) {
    const cycle = result.cycles[i];
    const packages = cycle.map((p) => p.split("@")[0]).join(", ");

    impactReport.push(`### Cycle ${i + 1}`);
    impactReport.push(`**Path:** ${cycle.join(" → ")}`);
    impactReport.push(`**Packages Involved:** ${packages}`);
    impactReport.push(``);
    impactReport.push(`**Potential Issues:**`);
    impactReport.push(`- Module resolution complexity`);
    impactReport.push(`- Potential memory leaks in require cache`);
    impactReport.push(`- Difficulty in debugging and tracing`);
    impactReport.push(`- Build optimization challenges`);
    impactReport.push(``);
  }

  return impactReport.join("\n");
}

// License Check (Capability 471-480)
async function checkLicenses(
  args: LicenseCheckArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  const allDeps = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];

  ctx.onXmlStream(
    `<dyad-status title="License Check">Scanning ${allDeps.length} packages...</dyad-status>`,
  );

  const licenseInfos = await checkLicenseCompatibility(allDeps, projectPath);

  const problematic = [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
  ];

  const issues: string[] = [];
  for (const info of licenseInfos) {
    if (problematic.some((p) => info.license.includes(p))) {
      issues.push(
        `⚠️ **${info.package}**: ${info.license} (copyleft - may have compatibility issues)`,
      );
    }
  }

  const report = [
    "# License Compatibility Report",
    ``,
    `Total packages checked: ${licenseInfos.length}`,
    ``,
  ];

  if (issues.length > 0) {
    report.push("## Potential License Conflicts");
    report.push("");
    issues.forEach((issue) => report.push(issue));
  } else {
    report.push("✅ No license conflicts detected.");
  }

  report.push("");
  report.push("## All Licenses");
  for (const info of licenseInfos.slice(0, 20)) {
    report.push(`- ${info.package}: ${info.license}`);
  }

  return report.join("\n");
}

// Bundle Impact (Capability 481-490)
async function analyzeBundleImpact(
  args: BundleImpactArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  const deps = args.includeDev
    ? {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }
    : packageJson.dependencies;

  const packages = Object.entries(deps || {});

  ctx.onXmlStream(
    `<dyad-status title="Bundle Impact">Analyzing ${packages.length} packages...</dyad-status>`,
  );

  const impacts: BundleImpact[] = [];
  let totalSize = 0;

  for (const [name, version] of packages) {
    const impact = await estimateBundleSize(
      name,
      version as string,
      projectPath,
    );
    if (impact) {
      impacts.push(impact);
      totalSize += impact.size;
    }
  }

  // Calculate percentages
  for (const impact of impacts) {
    impact.percentOfTotal = (impact.size / totalSize) * 100;
  }

  // Sort by size
  impacts.sort((a, b) => b.size - a.size);

  const report = [
    "# Bundle Size Impact Analysis",
    ``,
    `**Total estimated size:** ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    ``,
    "## Top Packages by Size",
    "",
  ];

  for (const impact of impacts.slice(0, 20)) {
    const sizeStr =
      impact.size > 1024 * 1024
        ? `${(impact.size / 1024 / 1024).toFixed(2)} MB`
        : `${(impact.size / 1024).toFixed(2)} KB`;
    report.push(
      `- **${impact.package}@${impact.version}**: ${sizeStr} (${impact.percentOfTotal?.toFixed(1)}%)`,
    );
  }

  return report.join("\n");
}

// Duplicate Dependencies (Capability 491-500)
async function findDuplicateDeps(
  args: DuplicateDepsArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Duplicate Dependencies">Scanning for duplicates...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  const duplicates = findDuplicates(data);

  const report = [
    "# Duplicate Dependencies Report",
    ``,
    `Found ${duplicates.length} packages with multiple versions`,
    ``,
  ];

  for (const dup of duplicates) {
    report.push(`## ${dup.package}`);
    report.push(`Versions: ${dup.versions.join(", ")}`);
    report.push(``);
    for (const loc of dup.locations.slice(0, 3)) {
      report.push(`- ${loc}`);
    }
    report.push("");
  }

  if (duplicates.length === 0) {
    report.push("✅ No duplicate dependencies found.");
  }

  return report.join("\n");
}

// Orphan Dependencies (Capability 501-510)
async function findOrphanDeps(
  args: OrphanDepsArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  ctx.onXmlStream(
    `<dyad-status title="Orphan Dependencies">Finding unused packages...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const data = JSON.parse(output);

  const orphans = findOrphans(data, packageJson);

  const report = [
    "# Orphan Dependencies Report",
    ``,
    `Found ${orphans.length} potentially unused packages`,
    ``,
  ];

  for (const orphan of orphans.slice(0, 20)) {
    report.push(
      `- **${orphan.package}@${orphan.version}** (${orphan.location}): ${orphan.reason}`,
    );
  }

  if (orphans.length === 0) {
    report.push("✅ No orphan dependencies found.");
  }

  return report.join("\n");
}

// Deprecated Check (Capability 511-520)
async function checkDeprecatedPackages(
  args: DeprecatedCheckArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  const packages = args.packages || [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];

  ctx.onXmlStream(
    `<dyad-status title="Deprecated Check">Checking ${packages.length} packages...</dyad-status>`,
  );

  const issues = await checkDeprecated(packages, projectPath);

  const report = [
    "# Deprecated Packages Report",
    ``,
    `Found ${issues.length} deprecated packages`,
    ``,
  ];

  for (const issue of issues) {
    report.push(`- **${issue.name}**: ${issue.message}`);
  }

  if (issues.length === 0) {
    report.push("✅ No deprecated packages found.");
  }

  return report.join("\n");
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateAnalysisXml(result: AnalysisResult): string {
  const lines: string[] = [
    `# Dependency Analysis Report`,
    ``,
    `## Summary`,
    `- Total Issues: ${result.summary.total}`,
    `- Outdated: ${result.summary.outdated}`,
    `- Security: ${result.summary.security}`,
    `- Deprecated: ${result.summary.deprecated}`,
    ``,
  ];

  if (result.issues.length === 0) {
    lines.push("✅ All dependencies are up to date and secure!");
  } else {
    const critical = result.issues.filter((i) => i.severity === "critical");
    const high = result.issues.filter((i) => i.severity === "high");
    const medium = result.issues.filter((i) => i.severity === "medium");
    const low = result.issues.filter((i) => i.severity === "low");

    if (critical.length > 0) {
      lines.push(`## 🔴 Critical (${critical.length})`);
      for (const issue of critical.slice(0, 10)) {
        lines.push(`- **${issue.name}**: ${issue.message}`);
      }
      lines.push("");
    }

    if (high.length > 0) {
      lines.push(`## 🟠 High (${high.length})`);
      for (const issue of high.slice(0, 10)) {
        lines.push(`- **${issue.name}**: ${issue.message}`);
      }
      lines.push("");
    }

    if (medium.length > 0) {
      lines.push(`## 🟡 Medium (${medium.length})`);
      for (const issue of medium.slice(0, 5)) {
        lines.push(`- ${issue.name}: ${issue.message}`);
      }
      lines.push("");
    }

    if (low.length > 0) {
      lines.push(`## 🔵 Low / Info (${low.length})`);
      for (const issue of low.slice(0, 5)) {
        lines.push(`- ${issue.name}: ${issue.message}`);
      }
    }
  }

  return lines.join("\n");
}

function generateTransitiveScanXml(result: TransitiveScanResult): string {
  const lines = [
    `# Transitive Dependency Scan`,
    ``,
    `## Summary`,
    `- Total Packages: ${result.totalPackages}`,
    `- Direct Dependencies: ${result.directDeps}`,
    `- Transitive Dependencies: ${result.transitiveDeps}`,
    ``,
    `## Package Count by Level`,
    ``,
  ];

  // Build depth counts
  const depthCounts = new Map<number, number>();
  const countByDepth = (node: TransitiveDepNode, depth: number): void => {
    const current = depthCounts.get(depth) || 0;
    depthCounts.set(depth, current + 1);
    if (node.dependencies) {
      for (const depName of Object.keys(node.dependencies)) {
        const child = (node as any)._dependencies?.[depName];
        if (child) {
          countByDepth(child, depth + 1);
        }
      }
    }
  };
  countByDepth(result.tree, 0);

  for (const [depth, count] of depthCounts) {
    lines.push(`- Depth ${depth}: ${count} packages`);
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

// Original dependency analyzer (Capability 450)
export const dependencyAnalyzerTool: ToolDefinition<DependencyAnalyzerArgs> = {
  name: "dependency_analyzer",
  description:
    "Analyze project dependencies for outdated packages, security vulnerabilities, and deprecated packages. Provides a comprehensive report of dependency health.",
  inputSchema: DependencyAnalyzerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeDependencies(args, ctx);
    const report = generateAnalysisXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Dependency Analysis Complete">Found ${result.summary.total} issues</dyad-status>`,
    );

    return report;
  },
};

// Transitive Scan (Capability 451)
export const transitiveScanTool: ToolDefinition<TransitiveScanArgs> = {
  name: "transitive_scan",
  description:
    "Perform deep transitive dependency scanning. Analyze the full dependency tree including all nested dependencies beyond direct dependencies. Useful for finding issues in indirect dependencies.",
  inputSchema: TransitiveScanArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await performTransitiveScan(args, ctx);
    const report = generateTransitiveScanXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Transitive Scan Complete">Found ${result.totalPackages} packages</dyad-status>`,
    );

    return report;
  },
};

// Transitive Vulnerabilities (Capability 456)
export const transitiveVulnerabilitiesTool: ToolDefinition<TransitiveVulnerabilitiesArgs> =
  {
    name: "transitive_vulnerabilities",
    description:
      "Find security vulnerabilities (CVEs) in transitive dependencies. Scans all nested dependencies beyond direct ones for known security issues.",
    inputSchema: TransitiveVulnerabilitiesArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const vulnerabilities = await findTransitiveVulnerabilities(args, ctx);

      const lines = [
        `# Transitive Dependencies Security Audit`,
        ``,
        `Found ${vulnerabilities.length} vulnerabilities in transitive dependencies`,
        ``,
      ];

      for (const vuln of vulnerabilities.slice(0, 20)) {
        const emoji =
          vuln.severity === "critical"
            ? "🔴"
            : vuln.severity === "high"
              ? "🟠"
              : vuln.severity === "medium"
                ? "🟡"
                : "🔵";
        lines.push(`${emoji} **${vuln.package}** (${vuln.severity})`);
        lines.push(`   ${vuln.title}`);
        lines.push(`   Range: ${vuln.range}`);
        lines.push(``);
      }

      ctx.onXmlComplete(
        `<dyad-status title="Transitive Vulnerabilities Found">${vulnerabilities.length} CVEs</dyad-status>`,
      );

      return lines.join("\n");
    },
  };

// Transitive Outdated (Capability 461)
export const transitiveOutdatedTool: ToolDefinition<TransitiveOutdatedArgs> = {
  name: "transitive_outdated",
  description:
    "Detect outdated packages in the full dependency chain, including transitive dependencies. Shows which indirect dependencies have newer versions available.",
  inputSchema: TransitiveOutdatedArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const outdated = await findTransitiveOutdated(args, ctx);

    const lines = [
      `# Transitive Outdated Dependencies`,
      ``,
      `Found ${outdated.length} outdated transitive dependencies`,
      ``,
    ];

    for (const dep of outdated.slice(0, 20)) {
      lines.push(
        `- **${dep.name}**: ${dep.current} → ${dep.latest || "latest"}`,
      );
    }

    ctx.onXmlComplete(
      `<dyad-status title="Transitive Outdated Complete">${outdated.length} outdated</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Deep Dependency Tree (Capability 466)
export const deepDependencyTreeTool: ToolDefinition<DeepDependencyTreeArgs> = {
  name: "deep_dependency_tree",
  description:
    "Generate complete dependency tree visualization. Shows the full nested dependency structure with multiple output formats (text, JSON, graphviz).",
  inputSchema: DeepDependencyTreeArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const tree = await generateDeepDependencyTree(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Dependency Tree Generated">View below</dyad-status>`,
    );

    return tree;
  },
};

// Detect Cycles (Capability 509)
export const detectCyclesTool: ToolDefinition<DetectCyclesArgs> = {
  name: "detect_cycles",
  description:
    "Detect circular dependencies in the dependency graph. Uses DFS-based algorithm to find any circular references between packages.",
  inputSchema: DetectCyclesArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await detectCycles(args, ctx);

    const lines = [
      `# Circular Dependency Detection`,
      ``,
      `**Result:** ${result.hasCycles ? "⚠️ Cycles Detected" : "✅ No Cycles"}`,
      ``,
      `Total cycles found: ${result.cycleCount}`,
      ``,
    ];

    if (result.cycles.length > 0) {
      lines.push("## Cycles Detected");
      lines.push("");
      for (let i = 0; i < result.cycles.length; i++) {
        lines.push(`### Cycle ${i + 1}`);
        lines.push(result.cycles[i].join(" → "));
        lines.push("");
      }
    }

    ctx.onXmlComplete(
      `<dyad-status title="Cycle Detection Complete">${result.cycleCount} cycles found</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Cycle Path (Capability 509)
export const cyclePathTool: ToolDefinition<CyclePathArgs> = {
  name: "cycle_path",
  description:
    "Show the full path of any detected cycles. Optionally filter by specific package name to find cycles involving that package.",
  inputSchema: CyclePathArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const paths = await getCyclePath(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Cycle Paths Retrieved">Done</dyad-status>`,
    );

    return `# Cycle Paths\n\n${paths}`;
  },
};

// Cycle Impact (Capability 509)
export const cycleImpactTool: ToolDefinition<CycleImpactArgs> = {
  name: "cycle_impact",
  description:
    "Analyze the impact of circular dependencies on the project. Describes potential issues and risks associated with detected cycles.",
  inputSchema: CycleImpactArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const impact = await analyzeCycleImpact(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Cycle Impact Analyzed">Done</dyad-status>`,
    );

    return impact;
  },
};

// License Check (Capability 471)
export const licenseCheckTool: ToolDefinition<LicenseCheckArgs> = {
  name: "license_check",
  description:
    "Check for license compatibility issues across all dependencies. Identifies copyleft licenses (GPL, AGPL, LGPL) that may conflict with permissive licenses.",
  inputSchema: LicenseCheckArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await checkLicenses(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="License Check Complete">Done</dyad-status>`,
    );

    return report;
  },
};

// Bundle Impact (Capability 481)
export const bundleImpactTool: ToolDefinition<BundleImpactArgs> = {
  name: "bundle_impact",
  description:
    "Estimate bundle size impact of each dependency. Shows how much space each package contributes to the final bundle size.",
  inputSchema: BundleImpactArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await analyzeBundleImpact(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Bundle Impact Analyzed">Done</dyad-status>`,
    );

    return report;
  },
};

// Duplicate Dependencies (Capability 491)
export const duplicateDepsTool: ToolDefinition<DuplicateDepsArgs> = {
  name: "duplicate_deps",
  description:
    "Detect duplicate dependencies with different versions. Finds packages that are installed multiple times with different version numbers.",
  inputSchema: DuplicateDepsArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await findDuplicateDeps(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Duplicate Detection Complete">Done</dyad-status>`,
    );

    return report;
  },
};

// Orphan Dependencies (Capability 501)
export const orphanDepsTool: ToolDefinition<OrphanDepsArgs> = {
  name: "orphan_deps",
  description:
    "Find unused or unreachable dependencies. Identifies packages that are installed but not directly required by the project.",
  inputSchema: OrphanDepsArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await findOrphanDeps(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Orphan Detection Complete">Done</dyad-status>`,
    );

    return report;
  },
};

// Deprecated Check (Capability 511)
export const deprecatedCheckTool: ToolDefinition<DeprecatedCheckArgs> = {
  name: "deprecated_check",
  description:
    "Check for deprecated packages in the project. Identifies packages that have been marked as deprecated by their maintainers.",
  inputSchema: DeprecatedCheckArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await checkDeprecatedPackages(args, ctx);

    ctx.onXmlComplete(
      `<dyad-status title="Deprecated Check Complete">Done</dyad-status>`,
    );

    return report;
  },
};

// Verify Imports Tool (Mechanism 13)
export const verifyImportsTool: ToolDefinition<VerifyImportsArgs> = {
  name: "verify_imports",
  description:
    "Verifies that all imports in a code snippet exist in the project dependencies.",
  inputSchema: VerifyImportsArgs,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (args, ctx) => {
    const projectPath = getProjectPath(args, ctx);
    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    const missing = verifyImports(args.code, packageJson);

    if (missing.length === 0) {
      return "✅ All imports are valid and declared in package.json.";
    }

    return `❌ Missing dependencies detected: ${missing.join(", ")}\n\nPlease ensure these packages are installed before using the code.`;
  },
};
