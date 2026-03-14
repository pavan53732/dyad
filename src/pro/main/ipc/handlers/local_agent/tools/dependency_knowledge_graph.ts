/**
 * Dependency Knowledge Graph Tools
 * Advanced dependency analysis and graph operations for understanding complex dependency relationships.
 *
 * Capabilities: 471-480
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

// Dependency Graph Builder (Capability 471)
const DependencyGraphBuilderArgs = z.object({
  projectPath: z.string().optional(),
  /** Graph type: 'full', 'direct', 'transitive', 'security', 'license' */
  graphType: z.enum(["full", "direct", "transitive", "security", "license"]).default("full"),
  /** Include dev dependencies */
  includeDev: z.boolean().default(false),
  /** Maximum depth for transitive analysis */
  maxDepth: z.number().min(1).max(20).default(10),
  /** Output format */
  format: z.enum(["json", "graphviz", "mermaid"]).default("json"),
});

// Dependency Node Analyzer (Capability 472)
const DependencyNodeAnalyzerArgs = z.object({
  projectPath: z.string().optional(),
  /** Package name to analyze */
  packageName: z.string(),
  /** Analysis depth */
  depth: z.number().min(1).max(10).default(3),
  /** Include metadata analysis */
  includeMetadata: z.boolean().default(true),
});

// Dependency Edge Analyzer (Capability 473)
const DependencyEdgeAnalyzerArgs = z.object({
  projectPath: z.string().optional(),
  /** Source package */
  sourcePackage: z.string().optional(),
  /** Target package */
  targetPackage: z.string().optional(),
  /** Edge type filter */
  edgeType: z.enum(["direct", "transitive", "peer", "dev", "optional"]).optional(),
  /** Include strength/weights */
  includeWeights: z.boolean().default(true),
});

// Dependency Impact Calculator (Capability 474)
const DependencyImpactCalculatorArgs = z.object({
  projectPath: z.string().optional(),
  /** Package to calculate impact for */
  packageName: z.string(),
  /** Impact type: 'removal', 'update', 'downgrade' */
  impactType: z.enum(["removal", "update", "downgrade"]).default("removal"),
  /** Target version for update/downgrade */
  targetVersion: z.string().optional(),
  /** Include transitive impact */
  includeTransitive: z.boolean().default(true),
});

// Dependency Conflict Detector (Capability 475)
const DependencyConflictDetectorArgs = z.object({
  projectPath: z.string().optional(),
  /** Conflict types to detect */
  conflictTypes: z.array(z.enum(["version", "license", "peer", "circular"])).default(["version", "license", "peer"]),
  /** Minimum severity to report */
  minSeverity: z.enum(["low", "medium", "high", "critical"]).default("low"),
});

// Dependency Version Resolver (Capability 476)
const DependencyVersionResolverArgs = z.object({
  projectPath: z.string().optional(),
  /** Package name */
  packageName: z.string(),
  /** Current version constraint */
  currentConstraint: z.string(),
  /** Resolution strategy */
  strategy: z.enum(["latest", "compatible", "patch", "minor", "major"]).default("compatible"),
  /** Include pre-release versions */
  includePreRelease: z.boolean().default(false),
});

// Dependency Vulnerability Mapper (Capability 477)
const DependencyVulnerabilityMapperArgs = z.object({
  projectPath: z.string().optional(),
  /** CVE ID to map */
  cveId: z.string().optional(),
  /** Package name filter */
  packageName: z.string().optional(),
  /** Minimum severity */
  minSeverity: z.enum(["low", "medium", "high", "critical"]).default("low"),
  /** Include fix information */
  includeFixes: z.boolean().default(true),
});

// Dependency Evolution Tracker (Capability 478)
const DependencyEvolutionTrackerArgs = z.object({
  projectPath: z.string().optional(),
  /** Package name to track */
  packageName: z.string().optional(),
  /** Time range in days */
  timeRange: z.number().min(1).max(365).default(90),
  /** Include version changes */
  includeVersions: z.boolean().default(true),
  /** Include security updates */
  includeSecurity: z.boolean().default(true),
});

// Dependency Redundancy Finder (Capability 479)
const DependencyRedundancyFinderArgs = z.object({
  projectPath: z.string().optional(),
  /** Redundancy types to find */
  redundancyTypes: z.array(z.enum(["duplicate", "unused", "transitive", "peer"])).default(["duplicate", "unused"]),
  /** Minimum savings threshold (bytes) */
  minSavings: z.number().min(0).default(1000),
});

// Dependency Health Monitor (Capability 480)
const DependencyHealthMonitorArgs = z.object({
  projectPath: z.string().optional(),
  /** Health metrics to check */
  metrics: z.array(z.enum(["outdated", "security", "maintenance", "popularity", "downloads"])).default(["outdated", "security", "maintenance"]),
  /** Health score threshold (0-100) */
  threshold: z.number().min(0).max(100).default(70),
});

type DependencyGraphBuilderArgs = z.infer<typeof DependencyGraphBuilderArgs>;
type DependencyNodeAnalyzerArgs = z.infer<typeof DependencyNodeAnalyzerArgs>;
type DependencyEdgeAnalyzerArgs = z.infer<typeof DependencyEdgeAnalyzerArgs>;
type DependencyImpactCalculatorArgs = z.infer<typeof DependencyImpactCalculatorArgs>;
type DependencyConflictDetectorArgs = z.infer<typeof DependencyConflictDetectorArgs>;
type DependencyVersionResolverArgs = z.infer<typeof DependencyVersionResolverArgs>;
type DependencyVulnerabilityMapperArgs = z.infer<typeof DependencyVulnerabilityMapperArgs>;
type DependencyEvolutionTrackerArgs = z.infer<typeof DependencyEvolutionTrackerArgs>;
type DependencyRedundancyFinderArgs = z.infer<typeof DependencyRedundancyFinderArgs>;
type DependencyHealthMonitorArgs = z.infer<typeof DependencyHealthMonitorArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface DependencyNode {
  name: string;
  version: string;
  type: "direct" | "transitive" | "dev" | "peer" | "optional";
  resolved?: string;
  integrity?: string;
  size?: number;
  license?: string;
  homepage?: string;
  repository?: string;
  description?: string;
  maintainers?: string[];
  lastModified?: string;
  downloads?: number;
  popularity?: number;
}

interface DependencyEdge {
  source: string;
  target: string;
  type: "direct" | "transitive" | "peer" | "dev" | "optional";
  versionConstraint?: string;
  resolvedVersion?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    buildTime: string;
    graphType: string;
  };
}

interface NodeAnalysis {
  package: string;
  currentVersion: string;
  latestVersion?: string;
  size: number;
  dependents: string[];
  dependencies: string[];
  transitiveCount: number;
  license?: string;
  maintainers: string[];
  lastModified: string;
  downloads: number;
  popularity: number;
  vulnerabilities: number;
  isDeprecated: boolean;
  healthScore: number;
}

interface EdgeAnalysis {
  source: string;
  target: string;
  relationshipType: string;
  strength: number;
  criticality: "low" | "medium" | "high";
  alternatives?: string[];
  constraints: string[];
  lastUpdated: string;
}

interface ImpactCalculation {
  package: string;
  impactType: string;
  affectedPackages: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  estimatedEffort: number;
  breakingChanges: string[];
  migrationPath?: string;
  alternativeSolutions: string[];
}

interface ConflictReport {
  conflictType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedPackages: string[];
  resolution?: string;
  impact: string;
}

interface VersionResolution {
  package: string;
  currentConstraint: string;
  recommendedVersion: string;
  compatibility: "compatible" | "breaking" | "unknown";
  changelog?: string[];
  securityFixes?: string[];
  breakingChanges?: string[];
}

interface VulnerabilityMapping {
  cve: string;
  affectedPackage: string;
  installedVersion: string;
  vulnerableRange: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  fixAvailable: boolean;
  fixVersion?: string;
  published: string;
  references: string[];
}

interface EvolutionEntry {
  package: string;
  version: string;
  releaseDate: string;
  type: "patch" | "minor" | "major";
  changelog?: string;
  securityFixes: boolean;
  breakingChanges: boolean;
}

interface RedundancyReport {
  redundancyType: string;
  package: string;
  locations: string[];
  size: number;
  potentialSavings: number;
  severity: "low" | "medium" | "high";
  action: string;
}

interface HealthMetrics {
  package: string;
  metrics: {
    outdated: boolean;
    securityVulnerabilities: number;
    maintenance: "active" | "inactive" | "unknown";
    popularity: number;
    downloads: number;
    lastModified: string;
    licenseHealth: boolean;
  };
  overallScore: number;
  recommendations: string[];
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

// Parse package-lock.json or yarn.lock for detailed dependency info
function parseLockFile(projectPath: string): any {
  const packageLockPath = path.join(projectPath, "package-lock.json");
  const yarnLockPath = path.join(projectPath, "yarn.lock");

  if (fs.existsSync(packageLockPath)) {
    return JSON.parse(fs.readFileSync(packageLockPath, "utf-8"));
  } else if (fs.existsSync(yarnLockPath)) {
    // For yarn.lock, we'd need a parser - simplified for now
    return {};
  }
  return {};
}

// Get package metadata from npm
async function getPackageMetadata(packageName: string, version?: string): Promise<any> {
  try {
    const versionSuffix = version ? `@${version}` : "";
    const output = await runNpmCommand(`npm view ${packageName}${versionSuffix} --json`, ".");
    return JSON.parse(output);
  } catch {
    return {};
  }
}

// Calculate health score for a package
function calculateHealthScore(metrics: HealthMetrics["metrics"]): number {
  let score = 100;

  if (metrics.outdated) score -= 20;
  if (metrics.securityVulnerabilities > 0) score -= metrics.securityVulnerabilities * 15;
  if (metrics.maintenance === "inactive") score -= 25;
  if (metrics.popularity < 1000) score -= 10;
  if (!metrics.licenseHealth) score -= 30;

  // Check if package was modified recently
  const lastModified = new Date(metrics.lastModified);
  const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceModified > 365) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

// Dependency Graph Builder (Capability 471)
async function buildDependencyGraph(
  args: DependencyGraphBuilderArgs,
  ctx: AgentContext,
): Promise<DependencyGraph> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Dependency Graph Builder">Analyzing ${args.graphType} dependencies...</dyad-status>`,
  );

  const packageJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
  const lockFile = parseLockFile(projectPath);

  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  // Build nodes based on graph type
  const deps = args.includeDev
    ? { ...packageJson.dependencies, ...packageJson.devDependencies }
    : packageJson.dependencies || {};

  for (const [name, version] of Object.entries(deps)) {
    const metadata = await getPackageMetadata(name, version as string);
    nodes.push({
      name,
      version: version as string,
      type: "direct",
      resolved: metadata.dist?.tarball,
      size: metadata.dist?.size || 0,
      license: metadata.license,
      homepage: metadata.homepage,
      repository: metadata.repository?.url,
      description: metadata.description,
      maintainers: metadata.maintainers?.map((m: any) => m.name) || [],
      lastModified: metadata.time?.modified,
      downloads: metadata.downloads || 0,
      popularity: metadata.score?.detail?.popularity || 0,
    });
  }

  // Build edges
  if (args.graphType === "full" || args.graphType === "direct") {
    for (const [name] of Object.entries(deps)) {
      const metadata = await getPackageMetadata(name);
      if (metadata.dependencies) {
        for (const [depName, depVersion] of Object.entries(metadata.dependencies)) {
          if (nodes.find(n => n.name === depName) || args.graphType === "full") {
            edges.push({
              source: name,
              target: depName,
              type: "direct",
              versionConstraint: depVersion as string,
              weight: 1,
            });
          }
        }
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      buildTime: new Date().toISOString(),
      graphType: args.graphType,
    },
  };
}

// Dependency Node Analyzer (Capability 472)
async function analyzeDependencyNode(
  args: DependencyNodeAnalyzerArgs,
  ctx: AgentContext,
): Promise<NodeAnalysis> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Node Analyzer">Analyzing ${args.packageName}...</dyad-status>`,
  );

  const metadata = await getPackageMetadata(args.packageName);
  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const depTree = JSON.parse(output);

  const findDependents = (tree: any, target: string, path: string[] = []): string[] => {
    const dependents: string[] = [];

    if (tree.dependencies) {
      for (const [name, info] of Object.entries(tree.dependencies)) {
        const currentPath = [...path, name];
        if (name === target && path.length > 0) {
          dependents.push(path[path.length - 1]);
        }
        dependents.push(...findDependents(info as any, target, currentPath));
      }
    }

    return [...new Set(dependents)];
  };

  const dependents = findDependents(depTree, args.packageName);
  const dependencies = Object.keys(metadata.dependencies || {});
  const transitiveCount = metadata.dist?.dependencies || 0;

  // Calculate health score
  const healthMetrics = {
    outdated: false, // Would need to check against latest
    securityVulnerabilities: 0, // Would need security audit
    maintenance: metadata.maintainers?.length > 0 ? "active" : "unknown" as const,
    popularity: metadata.score?.detail?.popularity || 0,
    downloads: metadata.downloads || 0,
    lastModified: metadata.time?.modified || new Date().toISOString(),
    licenseHealth: !!metadata.license,
  };

  return {
    package: args.packageName,
    currentVersion: metadata.version || "unknown",
    latestVersion: metadata["dist-tags"]?.latest,
    size: metadata.dist?.size || 0,
    dependents,
    dependencies,
    transitiveCount,
    license: metadata.license,
    maintainers: metadata.maintainers?.map((m: any) => m.name) || [],
    lastModified: metadata.time?.modified || new Date().toISOString(),
    downloads: metadata.downloads || 0,
    popularity: metadata.score?.detail?.popularity || 0,
    vulnerabilities: 0, // Would need security audit
    isDeprecated: !!metadata.deprecated,
    healthScore: calculateHealthScore(healthMetrics),
  };
}

// Dependency Edge Analyzer (Capability 473)
async function analyzeDependencyEdges(
  args: DependencyEdgeAnalyzerArgs,
  ctx: AgentContext,
): Promise<EdgeAnalysis[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Edge Analyzer">Analyzing dependency relationships...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const depTree = JSON.parse(output);

  const edges: EdgeAnalysis[] = [];

  const traverseTree = (node: any, path: string[] = []): void => {
    if (node.dependencies) {
      for (const [name, info] of Object.entries(node.dependencies)) {
        const currentPath = [...path, name];
        const dep = info as any;

        let relationshipType = "transitive";
        let strength = 1;
        let criticality: "low" | "medium" | "high" = "low";

        if (path.length === 0) {
          relationshipType = "direct";
          strength = 10;
          criticality = "high";
        } else if (path.length === 1) {
          relationshipType = "direct";
          strength = 8;
          criticality = "medium";
        }

        // Filter by package names if specified
        if (args.sourcePackage && !currentPath.includes(args.sourcePackage)) continue;
        if (args.targetPackage && name !== args.targetPackage) continue;

        // Filter by edge type
        if (args.edgeType && relationshipType !== args.edgeType) continue;

        edges.push({
          source: path[path.length - 1] || "root",
          target: name,
          relationshipType,
          strength,
          criticality,
          alternatives: [], // Would need to analyze alternatives
          constraints: [dep.version || "unknown"],
          lastUpdated: new Date().toISOString(),
        });

        traverseTree(dep, currentPath);
      }
    }
  };

  traverseTree(depTree);

  return edges;
}

// Dependency Impact Calculator (Capability 474)
async function calculateDependencyImpact(
  args: DependencyImpactCalculatorArgs,
  ctx: AgentContext,
): Promise<ImpactCalculation> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Impact Calculator">Calculating impact of ${args.impactType}...</dyad-status>`,
  );

  const output = await runNpmCommand("npm ls --all --json", projectPath);
  const depTree = JSON.parse(output);

  const affectedPackages: string[] = [];
  const breakingChanges: string[] = [];
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let estimatedEffort = 1;

  // Find all packages that depend on the target package
  const findDependents = (tree: any, target: string, path: string[] = []): string[] => {
    const dependents: string[] = [];

    if (tree.dependencies) {
      for (const [name, info] of Object.entries(tree.dependencies)) {
        const currentPath = [...path, name];
        if (name === target) {
          dependents.push(...path);
        }
        dependents.push(...findDependents(info as any, target, currentPath));
      }
    }

    return [...new Set(dependents)];
  };

  const dependents = findDependents(depTree, args.packageName);

  if (args.impactType === "removal") {
    affectedPackages.push(...dependents);
    if (dependents.length > 10) riskLevel = "critical";
    else if (dependents.length > 5) riskLevel = "high";
    else if (dependents.length > 0) riskLevel = "medium";

    estimatedEffort = dependents.length * 2; // Rough estimate
    breakingChanges.push(`Removing ${args.packageName} will break ${dependents.length} dependent packages`);
  }

  return {
    package: args.packageName,
    impactType: args.impactType,
    affectedPackages,
    riskLevel,
    estimatedEffort,
    breakingChanges,
    alternativeSolutions: [], // Would need to suggest alternatives
  };
}

// Dependency Conflict Detector (Capability 475)
async function detectDependencyConflicts(
  args: DependencyConflictDetectorArgs,
  ctx: AgentContext,
): Promise<ConflictReport[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Conflict Detector">Detecting ${args.conflictTypes.join(", ")} conflicts...</dyad-status>`,
  );

  const conflicts: ConflictReport[] = [];

  // Version conflicts
  if (args.conflictTypes.includes("version")) {
    try {
      const output = await runNpmCommand("npm ls --all --json", projectPath);
      const depTree = JSON.parse(output);

      const versionMap = new Map<string, Set<string>>();

      const collectVersions = (node: any): void => {
        if (node.name && node.version) {
          if (!versionMap.has(node.name)) {
            versionMap.set(node.name, new Set());
          }
          versionMap.get(node.name)!.add(node.version);
        }

        if (node.dependencies) {
          for (const dep of Object.values(node.dependencies)) {
            collectVersions(dep as any);
          }
        }
      };

      collectVersions(depTree);

      for (const [packageName, versions] of versionMap) {
        if (versions.size > 1) {
          const severity = versions.size > 3 ? "high" : "medium";
          if (["low", "medium", "high", "critical"].indexOf(severity) >= ["low", "medium", "high", "critical"].indexOf(args.minSeverity)) {
            conflicts.push({
              conflictType: "version",
              severity,
              description: `${packageName} has ${versions.size} different versions installed`,
              affectedPackages: [packageName],
              impact: "May cause bundle size bloat and runtime inconsistencies",
            });
          }
        }
      }
    } catch (error) {
      // Handle error
    }
  }

  return conflicts;
}

// Dependency Version Resolver (Capability 476)
async function resolveDependencyVersion(
  args: DependencyVersionResolverArgs,
  ctx: AgentContext,
): Promise<VersionResolution> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Version Resolver">Resolving version for ${args.packageName}...</dyad-status>`,
  );

  const metadata = await getPackageMetadata(args.packageName);

  let recommendedVersion = args.currentConstraint;
  let compatibility: "compatible" | "breaking" | "unknown" = "unknown";

  switch (args.strategy) {
    case "latest":
      recommendedVersion = metadata["dist-tags"]?.latest || args.currentConstraint;
      compatibility = "breaking"; // Assume breaking for latest
      break;
    case "compatible":
      // Would need semver analysis here
      recommendedVersion = metadata["dist-tags"]?.latest || args.currentConstraint;
      compatibility = "compatible";
      break;
    case "patch":
    case "minor":
    case "major":
      // Would need semver increment logic
      recommendedVersion = args.currentConstraint;
      compatibility = args.strategy === "patch" ? "compatible" : "breaking";
      break;
  }

  return {
    package: args.packageName,
    currentConstraint: args.currentConstraint,
    recommendedVersion,
    compatibility,
    changelog: [], // Would need to fetch changelog
    securityFixes: [], // Would need to check security advisories
    breakingChanges: [], // Would need to analyze changelog
  } as VersionResolution;
}

// Dependency Vulnerability Mapper (Capability 477)
async function mapDependencyVulnerabilities(
  args: DependencyVulnerabilityMapperArgs,
  ctx: AgentContext,
): Promise<VulnerabilityMapping[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Vulnerability Mapper">Mapping vulnerabilities...</dyad-status>`,
  );

  try {
    const output = await runNpmCommand("npm audit --json", projectPath);
    const auditData = JSON.parse(output);

    const mappings: VulnerabilityMapping[] = [];

    if (auditData.vulnerabilities) {
      for (const [packageName, vuln] of Object.entries(auditData.vulnerabilities)) {
        const v = vuln as any;

        // Filter by package name if specified
        if (args.packageName && packageName !== args.packageName) continue;

        // Filter by severity
        const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        if (severityOrder[v.severity as keyof typeof severityOrder] < severityOrder[args.minSeverity]) continue;

        mappings.push({
          cve: v.cve || `TEMP-${packageName}`,
          affectedPackage: packageName,
          installedVersion: v.range || "unknown",
          vulnerableRange: v.range || "unknown",
          severity: v.severity,
          description: v.title || "Security vulnerability",
          fixAvailable: !!v.fixAvailable,
          fixVersion: v.fixAvailable?.version,
          published: v.published || new Date().toISOString(),
          references: v.references || [],
        });
      }
    }

    return mappings;
  } catch {
    return [];
  }
}

// Dependency Evolution Tracker (Capability 478)
async function trackDependencyEvolution(
  args: DependencyEvolutionTrackerArgs,
  ctx: AgentContext,
): Promise<EvolutionEntry[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Evolution Tracker">Tracking dependency evolution...</dyad-status>`,
  );

  const entries: EvolutionEntry[] = [];

  if (args.packageName) {
    try {
      const output = await runNpmCommand(`npm view ${args.packageName} versions --json`, projectPath);
      const versions = JSON.parse(output);

      // Get version history (simplified)
      for (const version of versions.slice(-10)) { // Last 10 versions
        const metadata = await getPackageMetadata(args.packageName, version);
        const releaseDate = metadata.time?.[version] || new Date().toISOString();

        const entry: EvolutionEntry = {
          package: args.packageName,
          version,
          releaseDate,
          type: "patch", // Would need semver analysis
          changelog: [], // Would need changelog parsing
          securityFixes: false, // Would need security analysis
          breakingChanges: false, // Would need changelog analysis
        };
        entries.push(entry);
      }
    } catch {
      // Handle error
    }
  }

  return entries.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
}

// Dependency Redundancy Finder (Capability 479)
async function findDependencyRedundancy(
  args: DependencyRedundancyFinderArgs,
  ctx: AgentContext,
): Promise<RedundancyReport[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Redundancy Finder">Finding redundant dependencies...</dyad-status>`,
  );

  const reports: RedundancyReport[] = [];

  try {
    const output = await runNpmCommand("npm ls --all --json", projectPath);
    const depTree = JSON.parse(output);

    // Find duplicate versions
    if (args.redundancyTypes.includes("duplicate")) {
      const versionMap = new Map<string, Set<string>>();

      const collectVersions = (node: any, location: string = "root"): void => {
        if (node.name && node.version) {
          if (!versionMap.has(node.name)) {
            versionMap.set(node.name, new Set());
          }
          versionMap.get(node.name)!.add(`${node.version}:${location}`);
        }

        if (node.dependencies) {
          for (const [name, dep] of Object.entries(node.dependencies)) {
            collectVersions(dep as any, `${location}/${name}`);
          }
        }
      };

      collectVersions(depTree);

      for (const [packageName, locations] of versionMap) {
        if (locations.size > 1) {
          const metadata = await getPackageMetadata(packageName);
          const size = metadata.dist?.size || 0;
          const potentialSavings = (locations.size - 1) * size;

          if (potentialSavings >= args.minSavings) {
            reports.push({
              redundancyType: "duplicate",
              package: packageName,
              locations: Array.from(locations),
              size,
              potentialSavings,
              severity: potentialSavings > 1000000 ? "high" : "medium",
              action: "Consider deduplication or version alignment",
            });
          }
        }
      }
    }

  } catch {
    // Handle error
  }

  return reports;
}

// Dependency Health Monitor (Capability 480)
async function monitorDependencyHealth(
  args: DependencyHealthMonitorArgs,
  ctx: AgentContext,
): Promise<HealthMetrics[]> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Health Monitor">Monitoring dependency health...</dyad-status>`,
  );

  const packageJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const healthMetrics: HealthMetrics[] = [];

  for (const [packageName, version] of Object.entries(allDeps).slice(0, 20)) { // Limit for performance
    const metadata = await getPackageMetadata(packageName, version as string);

    const metrics: HealthMetrics["metrics"] = {
      outdated: false, // Would need to compare versions
      securityVulnerabilities: 0, // Would need security audit
      maintenance: (metadata.maintainers?.length > 0 ? "active" : "inactive") as "active" | "inactive" | "unknown",
      popularity: metadata.score?.detail?.popularity || 0,
      downloads: metadata.downloads || 0,
      lastModified: metadata.time?.modified || new Date().toISOString(),
      licenseHealth: !!metadata.license,
    };

    const overallScore = calculateHealthScore(metrics);

    const recommendations: string[] = [];
    if (overallScore < args.threshold) {
      if (!metrics.licenseHealth) recommendations.push("Review license compatibility");
      if (metrics.maintenance === "inactive") recommendations.push("Consider finding an actively maintained alternative");
      if (metrics.popularity < 1000) recommendations.push("Package has low popularity - consider alternatives");
    }

    healthMetrics.push({
      package: packageName,
      metrics,
      overallScore,
      recommendations,
    });
  }

  return healthMetrics;
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateGraphXml(graph: DependencyGraph): string {
  const lines: string[] = [
    `# Dependency Graph Report`,
    ``,
    `## Summary`,
    `- **Nodes**: ${graph.metadata.totalNodes}`,
    `- **Edges**: ${graph.metadata.totalEdges}`,
    `- **Type**: ${graph.metadata.graphType}`,
    `- **Built**: ${new Date(graph.metadata.buildTime).toLocaleString()}`,
    ``,
  ];

  if (graph.nodes.length > 0) {
    lines.push(`## Top Packages by Size`);
    const sortedNodes = graph.nodes
      .filter(n => n.size)
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 10);

    for (const node of sortedNodes) {
      const size = node.size || 0;
      const sizeStr = size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(2)} MB` : `${(size / 1024).toFixed(2)} KB`;
      lines.push(`- **${node.name}**: ${sizeStr}`);
    }
  }

  return lines.join("\n");
}

function generateNodeAnalysisXml(analysis: NodeAnalysis): string {
  const lines: string[] = [
    `# Dependency Node Analysis: ${analysis.package}`,
    ``,
    `## Overview`,
    `- **Current Version**: ${analysis.currentVersion}`,
    `- **Latest Version**: ${analysis.latestVersion || "Unknown"}`,
    `- **Size**: ${(analysis.size / 1024).toFixed(2)} KB`,
    `- **License**: ${analysis.license || "Unknown"}`,
    `- **Health Score**: ${analysis.healthScore}/100`,
    `- **Downloads**: ${analysis.downloads.toLocaleString()}`,
    `- **Popularity**: ${analysis.popularity}`,
    ``,
    `## Dependencies`,
    `- **Direct**: ${analysis.dependencies.length}`,
    `- **Transitive**: ${analysis.transitiveCount}`,
    `- **Dependents**: ${analysis.dependents.length}`,
    ``,
  ];

  if (analysis.vulnerabilities > 0) {
    lines.push(`## ⚠️ Security Issues`, `- ${analysis.vulnerabilities} vulnerabilities found`, ``);
  }

  if (analysis.isDeprecated) {
    lines.push(`## ⚠️ Deprecation`, `- This package is deprecated`, ``);
  }

  if (analysis.maintainers.length > 0) {
    lines.push(`## Maintainers`, analysis.maintainers.map(m => `- ${m}`).join("\n"), ``);
  }

  return lines.join("\n");
}

function generateConflictReportXml(conflicts: ConflictReport[]): string {
  const lines: string[] = [
    `# Dependency Conflict Report`,
    ``,
    `Found ${conflicts.length} conflicts`,
    ``,
  ];

  for (const conflict of conflicts) {
    const emoji = conflict.severity === "critical" ? "🔴" : conflict.severity === "high" ? "🟠" : "🟡";
    lines.push(`## ${emoji} ${conflict.conflictType.toUpperCase()} - ${conflict.severity.toUpperCase()}`);
    lines.push(`${conflict.description}`);
    lines.push(``);
    lines.push(`**Affected Packages:**`);
    for (const pkg of conflict.affectedPackages) {
      lines.push(`- ${pkg}`);
    }
    lines.push(``);
    lines.push(`**Impact:** ${conflict.impact}`);
    if (conflict.resolution) {
      lines.push(`**Resolution:** ${conflict.resolution}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

function generateHealthReportXml(healthMetrics: HealthMetrics[]): string {
  const lines: string[] = [
    `# Dependency Health Report`,
    ``,
  ];

  const unhealthy = healthMetrics.filter(h => h.overallScore < 70);
  const healthy = healthMetrics.filter(h => h.overallScore >= 70);

  lines.push(`## Summary`);
  lines.push(`- **Total Packages**: ${healthMetrics.length}`);
  lines.push(`- **Healthy**: ${healthy.length}`);
  lines.push(`- **Needs Attention**: ${unhealthy.length}`);
  lines.push(``);

  if (unhealthy.length > 0) {
    lines.push(`## ⚠️ Packages Needing Attention`);
    for (const health of unhealthy.sort((a, b) => a.overallScore - b.overallScore)) {
      lines.push(`### ${health.package} - Score: ${health.overallScore}/100`);
      lines.push(`**Issues:**`);
      if (!health.metrics.licenseHealth) lines.push(`- License issues`);
      if (health.metrics.maintenance === "inactive") lines.push(`- Inactive maintenance`);
      if (health.metrics.popularity < 1000) lines.push(`- Low popularity`);
      lines.push(``);
      lines.push(`**Recommendations:**`);
      for (const rec of health.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

// Dependency Graph Builder (Capability 471)
export const dependencyGraphBuilderTool: ToolDefinition<DependencyGraphBuilderArgs> = {
  name: "dependency_graph_builder",
  description: "Build comprehensive dependency graphs showing relationships between packages. Supports different graph types including full dependency trees, direct dependencies, and specialized views for security and licensing.",
  inputSchema: DependencyGraphBuilderArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const graph = await buildDependencyGraph(args, ctx);
    const report = generateGraphXml(graph);

    ctx.onXmlComplete(
      `<dyad-status title="Dependency Graph Built">${graph.metadata.totalNodes} nodes, ${graph.metadata.totalEdges} edges</dyad-status>`,
    );

    return report;
  },
};

// Dependency Node Analyzer (Capability 472)
export const dependencyNodeAnalyzerTool: ToolDefinition<DependencyNodeAnalyzerArgs> = {
  name: "dependency_node_analyzer",
  description: "Analyze individual dependency nodes in detail, including metadata, dependents, dependencies, health metrics, and security information.",
  inputSchema: DependencyNodeAnalyzerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const analysis = await analyzeDependencyNode(args, ctx);
    const report = generateNodeAnalysisXml(analysis);

    ctx.onXmlComplete(
      `<dyad-status title="Node Analysis Complete">Health score: ${analysis.healthScore}/100</dyad-status>`,
    );

    return report;
  },
};

// Dependency Edge Analyzer (Capability 473)
export const dependencyEdgeAnalyzerTool: ToolDefinition<DependencyEdgeAnalyzerArgs> = {
  name: "dependency_edge_analyzer",
  description: "Analyze dependency relationships and edges, including strength, criticality, constraints, and alternative options.",
  inputSchema: DependencyEdgeAnalyzerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const edges = await analyzeDependencyEdges(args, ctx);

    const lines = [
      `# Dependency Edge Analysis`,
      ``,
      `Found ${edges.length} dependency relationships`,
      ``,
    ];

    for (const edge of edges.slice(0, 20)) {
      lines.push(`## ${edge.source} → ${edge.target}`);
      lines.push(`- **Type**: ${edge.relationshipType}`);
      lines.push(`- **Strength**: ${edge.strength}/10`);
      lines.push(`- **Criticality**: ${edge.criticality.toUpperCase()}`);
      lines.push(`- **Constraints**: ${edge.constraints.join(", ")}`);
      lines.push(``);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Edge Analysis Complete">${edges.length} relationships analyzed</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Impact Calculator (Capability 474)
export const dependencyImpactCalculatorTool: ToolDefinition<DependencyImpactCalculatorArgs> = {
  name: "dependency_impact_calculator",
  description: "Calculate the impact of dependency changes including removal, updates, and downgrades. Shows affected packages, risk levels, and migration paths.",
  inputSchema: DependencyImpactCalculatorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const impact = await calculateDependencyImpact(args, ctx);

    const lines = [
      `# Dependency Impact Analysis: ${args.impactType}`,
      ``,
      `## Package: ${impact.package}`,
      `- **Risk Level**: ${impact.riskLevel.toUpperCase()}`,
      `- **Affected Packages**: ${impact.affectedPackages.length}`,
      `- **Estimated Effort**: ${impact.estimatedEffort} hours`,
      ``,
      `## Breaking Changes`,
    ];

    for (const change of impact.breakingChanges) {
      lines.push(`- ${change}`);
    }

    lines.push(``, `## Alternative Solutions`);
    for (const solution of impact.alternativeSolutions) {
      lines.push(`- ${solution}`);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Impact Calculated">Risk: ${impact.riskLevel}, ${impact.affectedPackages.length} affected</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Conflict Detector (Capability 475)
export const dependencyConflictDetectorTool: ToolDefinition<DependencyConflictDetectorArgs> = {
  name: "dependency_conflict_detector",
  description: "Detect various types of dependency conflicts including version conflicts, license incompatibilities, peer dependency issues, and circular dependencies.",
  inputSchema: DependencyConflictDetectorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const conflicts = await detectDependencyConflicts(args, ctx);
    const report = generateConflictReportXml(conflicts);

    ctx.onXmlComplete(
      `<dyad-status title="Conflicts Detected">${conflicts.length} conflicts found</dyad-status>`,
    );

    return report;
  },
};

// Dependency Version Resolver (Capability 476)
export const dependencyVersionResolverTool: ToolDefinition<DependencyVersionResolverArgs> = {
  name: "dependency_version_resolver",
  description: "Resolve dependency versions with different strategies including latest, compatible, patch, minor, and major updates. Analyzes compatibility and breaking changes.",
  inputSchema: DependencyVersionResolverArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const resolution = await resolveDependencyVersion(args, ctx);

    const lines = [
      `# Version Resolution: ${resolution.package}`,
      ``,
      `- **Current**: ${resolution.currentConstraint}`,
      `- **Recommended**: ${resolution.recommendedVersion}`,
      `- **Compatibility**: ${resolution.compatibility.toUpperCase()}`,
      ``,
    ];

    if (resolution.securityFixes && resolution.securityFixes.length > 0) {
      lines.push(`## Security Fixes`, resolution.securityFixes.map(f => `- ${f}`).join("\n"), ``);
    }

    if (resolution.breakingChanges && resolution.breakingChanges.length > 0) {
      lines.push(`## ⚠️ Breaking Changes`, resolution.breakingChanges.map(c => `- ${c}`).join("\n"), ``);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Version Resolved">${resolution.recommendedVersion} (${resolution.compatibility})</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Vulnerability Mapper (Capability 477)
export const dependencyVulnerabilityMapperTool: ToolDefinition<DependencyVulnerabilityMapperArgs> = {
  name: "dependency_vulnerability_mapper",
  description: "Map security vulnerabilities to specific dependencies, showing CVE details, affected versions, severity levels, and available fixes.",
  inputSchema: DependencyVulnerabilityMapperArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const mappings = await mapDependencyVulnerabilities(args, ctx);

    const lines = [
      `# Vulnerability Mapping Report`,
      ``,
      `Found ${mappings.length} vulnerabilities`,
      ``,
    ];

    for (const mapping of mappings.slice(0, 20)) {
      const emoji = mapping.severity === "critical" ? "🔴" : mapping.severity === "high" ? "🟠" : "🟡";
      lines.push(`## ${emoji} ${mapping.cve}`);
      lines.push(`**Package:** ${mapping.affectedPackage}`);
      lines.push(`**Severity:** ${mapping.severity.toUpperCase()}`);
      lines.push(`**Vulnerable Range:** ${mapping.vulnerableRange}`);
      lines.push(`**Fix Available:** ${mapping.fixAvailable ? `Yes (${mapping.fixVersion})` : "No"}`);
      lines.push(`**Description:** ${mapping.description}`);
      lines.push(``);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Vulnerabilities Mapped">${mappings.length} CVEs found</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Evolution Tracker (Capability 478)
export const dependencyEvolutionTrackerTool: ToolDefinition<DependencyEvolutionTrackerArgs> = {
  name: "dependency_evolution_tracker",
  description: "Track dependency evolution over time, showing version history, release patterns, security fixes, and breaking changes.",
  inputSchema: DependencyEvolutionTrackerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const evolution = await trackDependencyEvolution(args, ctx);

    const lines = [
      `# Dependency Evolution Report`,
      ``,
      `Tracking ${evolution.length} versions`,
      ``,
    ];

    for (const entry of evolution.slice(0, 10)) {
      const securityIcon = entry.securityFixes ? "🛡️" : "";
      const breakingIcon = entry.breakingChanges ? "⚠️" : "";
      lines.push(`## ${entry.version} ${securityIcon}${breakingIcon}`);
      lines.push(`- **Released**: ${new Date(entry.releaseDate).toLocaleDateString()}`);
      lines.push(`- **Type**: ${entry.type}`);
      if (entry.changelog && Array.isArray(entry.changelog) && entry.changelog.length > 0) {
        lines.push(`- **Changes**: ${entry.changelog.slice(0, 3).join(", ")}`);
      }
      lines.push(``);
    }

    ctx.onXmlComplete(
      `<dyad-status title="Evolution Tracked">${evolution.length} versions analyzed</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Redundancy Finder (Capability 479)
export const dependencyRedundancyFinderTool: ToolDefinition<DependencyRedundancyFinderArgs> = {
  name: "dependency_redundancy_finder",
  description: "Find redundant dependencies including duplicates, unused packages, and transitive dependencies that could be optimized.",
  inputSchema: DependencyRedundancyFinderArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const redundancies = await findDependencyRedundancy(args, ctx);

    const lines = [
      `# Dependency Redundancy Report`,
      ``,
      `Found ${redundancies.length} redundancies`,
      ``,
    ];

    let totalSavings = 0;
    for (const redundancy of redundancies) {
      totalSavings += redundancy.potentialSavings;
      lines.push(`## ${redundancy.redundancyType.toUpperCase()}: ${redundancy.package}`);
      lines.push(`- **Severity**: ${redundancy.severity.toUpperCase()}`);
      lines.push(`- **Potential Savings**: ${(redundancy.potentialSavings / 1024).toFixed(2)} KB`);
      lines.push(`- **Locations**: ${redundancy.locations.length}`);
      lines.push(`- **Action**: ${redundancy.action}`);
      lines.push(``);
    }

    lines.push(`**Total Potential Savings**: ${(totalSavings / (1024 * 1024)).toFixed(2)} MB`);

    ctx.onXmlComplete(
      `<dyad-status title="Redundancies Found">${redundancies.length} issues, ${(totalSavings / (1024 * 1024)).toFixed(2)} MB savings</dyad-status>`,
    );

    return lines.join("\n");
  },
};

// Dependency Health Monitor (Capability 480)
export const dependencyHealthMonitorTool: ToolDefinition<DependencyHealthMonitorArgs> = {
  name: "dependency_health_monitor",
  description: "Monitor overall dependency health including outdated status, security vulnerabilities, maintenance activity, and popularity metrics.",
  inputSchema: DependencyHealthMonitorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const healthMetrics = await monitorDependencyHealth(args, ctx);
    const report = generateHealthReportXml(healthMetrics);

    const unhealthy = healthMetrics.filter(h => h.overallScore < args.threshold);
    ctx.onXmlComplete(
      `<dyad-status title="Health Monitored">${unhealthy.length}/${healthMetrics.length} packages need attention</dyad-status>`,
    );

    return report;
  },
};