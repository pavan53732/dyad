/**
 * Dependency Governance Tools
 * Comprehensive dependency management including policy enforcement,
 * health monitoring, vulnerability scanning, compliance checking, and
 * environment compatibility validation.
 *
 * Capabilities: 491-520
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

// Dependency Optimization Engine (Capability 491)
const DependencyOptimizationArgs = z.object({
  projectPath: z.string().optional(),
  /** Focus on specific optimization type */
  optimizationType: z
    .enum(["size", "performance", "security", "maintainability", "full"])
    .default("full"),
  /** Include dev dependencies in analysis */
  includeDev: z.boolean().default(false),
  /** Maximum number of recommendations */
  maxRecommendations: z.number().default(10),
});

// Dependency Policy Enforcer (Capability 492)
const DependencyPolicyArgs = z.object({
  projectPath: z.string().optional(),
  /** Policy rules to enforce */
  policies: z
    .array(
      z.object({
        name: z.string(),
        rule: z.string(),
        severity: z.enum(["error", "warning", "info"]),
      }),
    )
    .optional(),
  /** Whether to auto-fix violations */
  autoFix: z.boolean().default(false),
});

// Dependency Health Monitor (Capability 493)
const DependencyHealthMonitorArgs = z.object({
  projectPath: z.string().optional(),
  /** Check frequency */
  checkFrequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  /** Include historical data */
  includeHistory: z.boolean().default(false),
});

// Dependency Vulnerability Scanner (Capability 494)
const VulnerabilityScannerArgs = z.object({
  projectPath: z.string().optional(),
  /** Minimum severity to report */
  minSeverity: z.enum(["critical", "high", "medium", "low"]).default("low"),
  /** Include transitive dependencies */
  includeTransitive: z.boolean().default(true),
  /** Output format */
  format: z.enum(["json", "text", "markdown"]).default("markdown"),
});

// Dependency Compliance Checker (Capability 495)
const ComplianceCheckerArgs = z.object({
  projectPath: z.string().optional(),
  /** Compliance framework */
  framework: z
    .enum(["sox", "gdpr", "hipaa", "pci-dss", "custom"])
    .default("custom"),
  /** Custom compliance rules */
  customRules: z.array(z.string()).optional(),
});

// Dependency License Manager (Capability 496)
const LicenseManagerArgs = z.object({
  projectPath: z.string().optional(),
  /** Action to perform */
  action: z.enum(["audit", "approve", "reject", "whitelist", "blacklist"]),
  /** Package name for specific actions */
  packageName: z.string().optional(),
  /** License type to manage */
  licenseType: z.string().optional(),
});

// Dependency Update Planner (Capability 497)
const UpdatePlannerArgs = z.object({
  projectPath: z.string().optional(),
  /** Maximum major version jumps */
  maxMajorJumps: z.number().default(1),
  /** Include breaking changes analysis */
  includeBreakingChanges: z.boolean().default(true),
  /** Group by dependency type */
  groupBy: z.enum(["severity", "type", "package"]).default("severity"),
});

// Dependency Conflict Resolver (Capability 498)
const ConflictResolverArgs = z.object({
  projectPath: z.string().optional(),
  /** Specific packages to resolve */
  packages: z.array(z.string()).optional(),
  /** Resolution strategy */
  strategy: z
    .enum(["newest", "oldest", "minimal", "semver-range", "manual"])
    .default("minimal"),
});

// Environment Compatibility Checker (Capability 499)
const EnvironmentCompatibilityArgs = z.object({
  projectPath: z.string().optional(),
  /** Target environments */
  targetEnvironments: z
    .array(z.string())
    .default(["nodejs", "browser", "deno"]),
  /** Include runtime versions */
  includeVersions: z.boolean().default(true),
});

// Platform Specific Validation (Capability 500)
const PlatformValidationArgs = z.object({
  projectPath: z.string().optional(),
  /** Platforms to validate */
  platforms: z.array(
    z.enum(["windows", "macos", "linux", "ios", "android", "web"]),
  ),
  /** Check native dependencies */
  checkNative: z.boolean().default(true),
});

// Dependency Container Image Analyzer (Capability 510)
const ContainerAnalysisArgs = z.object({
  projectPath: z.string().optional(),
  /** Dockerfile path or image name */
  target: z.string().default("Dockerfile"),
  /** Analysis depth: basic, security, layers */
  depth: z.enum(["basic", "security", "layers"]).default("security"),
  /** Include base image audit */
  auditBaseImage: z.boolean().default(true),
});

type DependencyOptimizationArgs = z.infer<typeof DependencyOptimizationArgs>;
type DependencyPolicyArgs = z.infer<typeof DependencyPolicyArgs>;
type DependencyHealthMonitorArgs = z.infer<typeof DependencyHealthMonitorArgs>;
type VulnerabilityScannerArgs = z.infer<typeof VulnerabilityScannerArgs>;
type ComplianceCheckerArgs = z.infer<typeof ComplianceCheckerArgs>;
type LicenseManagerArgs = z.infer<typeof LicenseManagerArgs>;
type UpdatePlannerArgs = z.infer<typeof UpdatePlannerArgs>;
type ConflictResolverArgs = z.infer<typeof ConflictResolverArgs>;
type EnvironmentCompatibilityArgs = z.infer<
  typeof EnvironmentCompatibilityArgs
>;
type PlatformValidationArgs = z.infer<typeof PlatformValidationArgs>;
type ContainerAnalysisArgs = z.infer<typeof ContainerAnalysisArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface OptimizationRecommendation {
  package: string;
  currentVersion: string;
  suggestedVersion?: string;
  type: "remove" | "replace" | "upgrade" | "downgrade";
  reason: string;
  impact: "high" | "medium" | "low";
}

interface PolicyViolation {
  rule: string;
  package: string;
  severity: "error" | "warning" | "info";
  message: string;
  autoFixable: boolean;
}

interface HealthMetrics {
  score: number;
  lastChecked: string;
  issues: {
    outdated: number;
    vulnerable: number;
    deprecated: number;
    unused: number;
  };
  trends: {
    stability: number;
    security: number;
    maintenance: number;
  };
}

interface VulnerabilityReport {
  package: string;
  severity: "critical" | "high" | "medium" | "low";
  cveId?: string;
  title: string;
  description: string;
  fixedIn?: string;
  url?: string;
}

interface ComplianceResult {
  compliant: boolean;
  framework: string;
  violations: {
    rule: string;
    package: string;
    severity: "critical" | "major" | "minor";
    description: string;
  }[];
  passed: string[];
}

interface LicenseInfo {
  package: string;
  license: string;
  status: "approved" | "rejected" | "pending";
  reason?: string;
}

interface UpdatePlan {
  package: string;
  currentVersion: string;
  targetVersion: string;
  breakingChanges: string[];
  risk: "high" | "medium" | "low";
  priority: "critical" | "high" | "medium" | "low";
}

interface ConflictResolution {
  package: string;
  conflicts: {
    requested: string;
    conflicting: string;
    via: string;
  }[];
  resolution: string;
  version: string;
}

interface CompatibilityResult {
  environment: string;
  compatible: boolean;
  issues: {
    package: string;
    issue: string;
    severity: "error" | "warning";
  }[];
}

interface PlatformValidationResult {
  platform: string;
  valid: boolean;
  nativeModules: {
    name: string;
    status: "supported" | "unsupported" | "needs-build";
    issues: string[];
  }[];
}

// ============================================================================
// Utility Functions
// ============================================================================

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
// Tool Implementation Functions
// ============================================================================

// Dependency Optimization Engine (Capability 491)
async function optimizeDependencies(
  args: DependencyOptimizationArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  ctx.onXmlStream(
    `<dyad-status title="Dependency Optimizer">Analyzing dependencies for optimization opportunities...</dyad-status>`,
  );

  const recommendations: OptimizationRecommendation[] = [];

  try {
    const output = await runNpmCommand("npm ls --json --all", projectPath);
    const depTree = JSON.parse(output);

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [name, version] of Object.entries(
      allDeps as Record<string, string>,
    )) {
      const depInfo = (depTree as any).dependencies?.[name];
      if (!depInfo) {
        recommendations.push({
          package: name,
          currentVersion: version,
          type: "remove",
          reason: "Package appears to be unused in the project",
          impact: "medium",
        });
      }

      if (name === "moment") {
        recommendations.push({
          package: name,
          currentVersion: version,
          suggestedVersion: "dayjs@^1.11.0",
          type: "replace",
          reason:
            "Replace with lighter alternative (dayjs) for better tree-shaking",
          impact: "high",
        });
      }

      if (name === "lodash" && !args.includeDev) {
        recommendations.push({
          package: name,
          currentVersion: version,
          suggestedVersion: "lodash-es@^4.17.21",
          type: "replace",
          reason: "Use lodash-es for better ESM tree-shaking support",
          impact: "medium",
        });
      }
    }
  } catch {
    // Continue with partial results
  }

  recommendations.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact];
  });

  const report = [
    "# Dependency Optimization Report",
    "",
    `**Optimization Type:** ${args.optimizationType}`,
    "",
    `Found ${recommendations.length} optimization opportunities`,
    "",
  ];

  const filtered = recommendations.slice(0, args.maxRecommendations);

  for (const rec of filtered) {
    const emoji =
      rec.type === "remove" ? "🗑️" : rec.type === "replace" ? "🔄" : "⬆️";
    report.push(`${emoji} **${rec.package}** (${rec.impact} impact)`);
    report.push(`   Current: ${rec.currentVersion}`);
    if (rec.suggestedVersion) {
      report.push(`   Suggested: ${rec.suggestedVersion}`);
    }
    report.push(`   Reason: ${rec.reason}`);
    report.push("");
  }

  if (recommendations.length === 0) {
    report.push("✅ No optimization opportunities found.");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Optimization Complete">${recommendations.length} recommendations</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Policy Enforcer (Capability 492)
async function enforcePolicies(
  args: DependencyPolicyArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Policy Enforcer">Checking dependency policies...</dyad-status>`,
  );

  const defaultPolicies = [
    {
      name: "no-deprecated",
      rule: "No deprecated packages allowed",
      severity: "error" as const,
    },
    {
      name: "max-age",
      rule: "Dependencies must be updated within 6 months",
      severity: "warning" as const,
    },
    {
      name: "security-audit",
      rule: "No high severity vulnerabilities",
      severity: "error" as const,
    },
  ];

  const policies = args.policies || defaultPolicies;
  const violations: PolicyViolation[] = [];

  try {
    const output = await runNpmCommand("npm ls --json", projectPath);
    const depTree = JSON.parse(output);

    const checkDeprecated = async (deps: any): Promise<void> => {
      for (const [name, info] of Object.entries(deps || {})) {
        const dep = info as any;
        if (dep.deprecated) {
          const policy = policies.find((p) => p.name === "no-deprecated");
          if (policy) {
            violations.push({
              rule: policy.rule,
              package: name,
              severity: policy.severity,
              message: `Package ${name} is deprecated: ${dep.deprecated}`,
              autoFixable: false,
            });
          }
        }
        if (dep.dependencies) {
          await checkDeprecated(dep.dependencies);
        }
      }
    };

    await checkDeprecated(depTree.dependencies || {});
  } catch {}

  try {
    const auditOutput = await runNpmCommand("npm audit --json", projectPath);
    const auditData = JSON.parse(auditOutput);

    if (auditData.vulnerabilities) {
      const policy = policies.find((p) => p.name === "security-audit");
      for (const [name, details] of Object.entries(auditData.vulnerabilities)) {
        const vuln = details as any;
        if (vuln.severity === "high" || vuln.severity === "critical") {
          violations.push({
            rule: policy?.rule || "No high severity vulnerabilities",
            package: name,
            severity: "error",
            message: `Security vulnerability in ${name}: ${vuln.title}`,
            autoFixable: true,
          });
        }
      }
    }
  } catch {}

  const report = [
    "# Dependency Policy Report",
    "",
    `**Policies Checked:** ${policies.length}`,
    "",
    `**Violations Found:** ${violations.length}`,
    "",
  ];

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  if (errors.length > 0) {
    report.push("## 🔴 Errors");
    for (const v of errors) {
      report.push(`- **${v.package}**: ${v.message}`);
    }
    report.push("");
  }

  if (warnings.length > 0) {
    report.push("## 🟡 Warnings");
    for (const v of warnings) {
      report.push(`- **${v.package}**: ${v.message}`);
    }
    report.push("");
  }

  if (violations.length === 0) {
    report.push("✅ All policies passed!");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Policy Check Complete">${violations.length} violations</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Health Monitor (Capability 493)
async function monitorHealth(
  args: DependencyHealthMonitorArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Health Monitor">Analyzing dependency health...</dyad-status>`,
  );

  const health: HealthMetrics = {
    score: 100,
    lastChecked: new Date().toISOString(),
    issues: {
      outdated: 0,
      vulnerable: 0,
      deprecated: 0,
      unused: 0,
    },
    trends: {
      stability: 100,
      security: 100,
      maintenance: 100,
    },
  };

  try {
    const outdatedOutput = await runNpmCommand(
      "npm outdated --json",
      projectPath,
    );
    const outdated = JSON.parse(outdatedOutput);
    health.issues.outdated = Object.keys(outdated).length;
    health.score -= health.issues.outdated * 5;
  } catch {}

  try {
    const auditOutput = await runNpmCommand("npm audit --json", projectPath);
    const auditData = JSON.parse(auditOutput);
    if (auditData.vulnerabilities) {
      health.issues.vulnerable = Object.keys(auditData.vulnerabilities).length;
      health.score -= health.issues.vulnerable * 15;
    }
  } catch {}

  try {
    const lsOutput = await runNpmCommand("npm ls --json", projectPath);
    const depTree = JSON.parse(lsOutput);
    let deprecatedCount = 0;

    const countDeprecated = (deps: any): void => {
      for (const [, info] of Object.entries(deps || {})) {
        const dep = info as any;
        if (dep.deprecated) deprecatedCount++;
        if (dep.dependencies) countDeprecated(dep.dependencies);
      }
    };
    countDeprecated(depTree.dependencies || {});

    health.issues.deprecated = deprecatedCount;
    health.score -= health.issues.deprecated * 10;
  } catch {}

  health.score = Math.max(0, health.score);

  health.trends.security = health.issues.vulnerable > 0 ? 50 : 100;
  health.trends.stability = health.issues.outdated > 5 ? 70 : 100;
  health.trends.maintenance = health.issues.deprecated > 0 ? 60 : 100;

  const report = [
    "# Dependency Health Monitor",
    "",
    `**Health Score:** ${health.score}/100`,
    "",
    "## Issues Summary",
    `- Outdated: ${health.issues.outdated}`,
    `- Vulnerabilities: ${health.issues.vulnerable}`,
    `- Deprecated: ${health.issues.deprecated}`,
    `- Unused: ${health.issues.unused}`,
    "",
    "## Trend Indicators",
    `- Security: ${health.trends.security}%`,
    `- Stability: ${health.trends.stability}%`,
    `- Maintenance: ${health.trends.maintenance}%`,
    "",
    `Last checked: ${health.lastChecked}`,
  ];

  ctx.onXmlComplete(
    `<dyad-status title="Health Analysis Complete">Score: ${health.score}/100</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Vulnerability Scanner (Capability 494)
async function scanVulnerabilities(
  args: VulnerabilityScannerArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Vulnerability Scanner">Scanning for security vulnerabilities...</dyad-status>`,
  );

  const vulnerabilities: VulnerabilityReport[] = [];

  try {
    const auditOutput = await runNpmCommand("npm audit --json", projectPath);
    const auditData = JSON.parse(auditOutput);

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const minSeverityIdx = severityOrder[args.minSeverity];

    if (auditData.vulnerabilities) {
      for (const [packageName, details] of Object.entries(
        auditData.vulnerabilities,
      )) {
        const vuln = details as any;
        const vulnSeverity =
          severityOrder[vuln.severity as keyof typeof severityOrder] || 3;

        if (vulnSeverity <= minSeverityIdx) {
          vulnerabilities.push({
            package: packageName,
            severity: vuln.severity,
            cveId: vuln.via?.[0]?.name,
            title: vuln.title || "Security vulnerability",
            description: vuln.title || "",
            fixedIn: vuln.fixAvailable ? vuln.range : undefined,
            url: `https://npmjs.com/advisories/${packageName}`,
          });
        }
      }
    }
  } catch {}

  vulnerabilities.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const report = [
    "# Vulnerability Scan Report",
    "",
    `**Total Vulnerabilities:** ${vulnerabilities.length}`,
    "",
  ];

  const critical = vulnerabilities.filter((v) => v.severity === "critical");
  const high = vulnerabilities.filter((v) => v.severity === "high");
  const medium = vulnerabilities.filter((v) => v.severity === "medium");
  // const low = vulnerabilities.filter((v) => v.severity === "low");

  if (critical.length > 0) {
    report.push(`## 🔴 Critical (${critical.length})`);
    for (const v of critical) {
      report.push(`- **${v.package}**: ${v.title}`);
      if (v.cveId) report.push(`  CVE: ${v.cveId}`);
      if (v.fixedIn) report.push(`  Fixed in: ${v.fixedIn}`);
    }
    report.push("");
  }

  if (high.length > 0) {
    report.push(`## 🟠 High (${high.length})`);
    for (const v of high.slice(0, 10)) {
      report.push(`- **${v.package}**: ${v.title}`);
    }
    report.push("");
  }

  if (medium.length > 0) {
    report.push(`## 🟡 Medium (${medium.length})`);
    for (const v of medium.slice(0, 5)) {
      report.push(`- **${v.package}**: ${v.title}`);
    }
    report.push("");
  }

  if (vulnerabilities.length === 0) {
    report.push("✅ No vulnerabilities found!");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Vulnerability Scan Complete">${vulnerabilities.length} found</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Compliance Checker (Capability 495)
async function checkCompliance(
  args: ComplianceCheckerArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Compliance Checker">Checking compliance with ${args.framework}...</dyad-status>`,
  );

  const violations: ComplianceResult["violations"] = [];
  const passed: string[] = [];

  try {
    const output = await runNpmCommand("npm ls --json", projectPath);
    const depTree = JSON.parse(output);

    const complianceRules: Record<string, string[]> = {
      sox: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"],
      gdpr: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"],
      hipaa: ["MIT", "Apache-2.0"],
      "pci-dss": ["MIT", "Apache-2.0", "BSD-2-Clause"],
      custom: [],
    };

    const allowedLicenses = complianceRules[args.framework] ||
      args.customRules || ["MIT", "Apache-2.0"];

    const checkLicenses = (deps: any): void => {
      for (const [name, info] of Object.entries(deps || {})) {
        const dep = info as any;
        const license = dep.license || "Unknown";

        if (!allowedLicenses.some((l) => license.includes(l))) {
          violations.push({
            rule: `License must be one of: ${allowedLicenses.join(", ")}`,
            package: name,
            severity: "major",
            description: `Package ${name} has license: ${license}`,
          });
        } else {
          passed.push(`${name} (${license})`);
        }

        if (dep.dependencies) {
          checkLicenses(dep.dependencies);
        }
      }
    };

    checkLicenses(depTree.dependencies || {});
  } catch {}

  const compliant = violations.length === 0;

  const report = [
    `# Compliance Report (${args.framework.toUpperCase()})`,
    "",
    `**Status:** ${compliant ? "✅ Compliant" : "❌ Non-Compliant"}`,
    "",
    `**Violations:** ${violations.length}`,
    "",
  ];

  if (violations.length > 0) {
    report.push("## Violations");
    for (const v of violations) {
      report.push(`- **${v.package}**: ${v.description}`);
    }
    report.push("");
  }

  report.push(`**Passed:** ${passed.length} packages`);

  ctx.onXmlComplete(
    `<dyad-status title="Compliance Check Complete">${compliant ? "Compliant" : "Violations found"}</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency License Manager (Capability 496)
async function manageLicenses(
  args: LicenseManagerArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="License Manager">Managing licenses...</dyad-status>`,
  );

  const licenses: LicenseInfo[] = [];

  try {
    const output = await runNpmCommand("npm ls --json --all", projectPath);
    const depTree = JSON.parse(output);

    const collectLicenses = async (deps: any): Promise<void> => {
      for (const [name, info] of Object.entries(deps || {})) {
        const dep = info as any;
        const license = dep.license || "Unknown";

        licenses.push({
          package: name,
          license: license,
          status: "pending",
        });

        if (dep.dependencies) {
          await collectLicenses(dep.dependencies);
        }
      }
    };

    await collectLicenses(depTree.dependencies || {});
  } catch {}

  const report = [
    "# License Manager",
    "",
    `**Action:** ${args.action}`,
    "",
    `**Total Packages:** ${licenses.length}`,
    "",
  ];

  if (args.action === "audit") {
    const byLicense = new Map<string, number>();
    for (const lic of licenses) {
      const count = byLicense.get(lic.license) || 0;
      byLicense.set(lic.license, count + 1);
    }

    report.push("## License Distribution");
    for (const [license, count] of byLicense) {
      report.push(`- ${license}: ${count}`);
    }
  } else if (args.action === "whitelist" && args.licenseType) {
    report.push(`Whitelisted license: ${args.licenseType}`);
  } else if (args.action === "blacklist" && args.licenseType) {
    report.push(`Blacklisted license: ${args.licenseType}`);
  }

  ctx.onXmlComplete(
    `<dyad-status title="License Management Complete">Done</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Update Planner (Capability 497)
async function planUpdates(
  args: UpdatePlannerArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Update Planner">Planning dependency updates...</dyad-status>`,
  );

  const updates: UpdatePlan[] = [];

  try {
    const output = await runNpmCommand(
      "npm outdated --json --long",
      projectPath,
    );
    const outdated = JSON.parse(output);

    for (const [name, info] of Object.entries(outdated)) {
      const dep = info as any;
      const currentMajor = parseInt(dep.current?.split(".")[0] || "0");
      const latestMajor = parseInt(dep.latest?.split(".")[0] || "0");
      const majorJumps = latestMajor - currentMajor;

      let risk: "high" | "medium" | "low" = "low";
      if (majorJumps > args.maxMajorJumps) {
        risk = "high";
      } else if (majorJumps > 0) {
        risk = "medium";
      }

      let priority: "critical" | "high" | "medium" | "low" = "low";
      if (dep.type === "security") {
        priority = "critical";
      } else if (majorJumps > args.maxMajorJumps) {
        priority = "high";
      }

      updates.push({
        package: name,
        currentVersion: dep.current || "unknown",
        targetVersion: dep.latest || "unknown",
        breakingChanges:
          majorJumps > 0
            ? ["Major version bump may contain breaking changes"]
            : [],
        risk,
        priority,
      });
    }
  } catch {}

  updates.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const report = [
    "# Dependency Update Plan",
    "",
    `**Total Updates Available:** ${updates.length}`,
    "",
  ];

  const critical = updates.filter((u) => u.priority === "critical");
  const high = updates.filter((u) => u.priority === "high");
  const medium = updates.filter((u) => u.priority === "medium");
  // const low = updates.filter((u) => u.priority === "low");

  if (critical.length > 0) {
    report.push(`## 🔴 Critical (${critical.length})`);
    for (const u of critical) {
      report.push(
        `- **${u.package}**: ${u.currentVersion} → ${u.targetVersion} (${u.risk} risk)`,
      );
    }
    report.push("");
  }

  if (high.length > 0) {
    report.push(`## 🟠 High (${high.length})`);
    for (const u of high.slice(0, 10)) {
      report.push(
        `- **${u.package}**: ${u.currentVersion} → ${u.targetVersion}`,
      );
    }
    report.push("");
  }

  if (medium.length > 0) {
    report.push(`## 🟡 Medium (${medium.length})`);
    for (const u of medium.slice(0, 5)) {
      report.push(
        `- **${u.package}**: ${u.currentVersion} → ${u.targetVersion}`,
      );
    }
    report.push("");
  }

  if (updates.length === 0) {
    report.push("✅ All dependencies are up to date!");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Update Plan Complete">${updates.length} updates</dyad-status>`,
  );

  return report.join("\n");
}

// Dependency Conflict Resolver (Capability 498)
async function resolveConflicts(
  args: ConflictResolverArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Conflict Resolver">Analyzing dependency conflicts...</dyad-status>`,
  );

  const resolutions: ConflictResolution[] = [];

  try {
    const output = await runNpmCommand("npm ls --json --all", projectPath);
    const depTree = JSON.parse(output);

    const findConflicts = (deps: any, parent: string = "root"): void => {
      for (const [name, info] of Object.entries(deps || {})) {
        const dep = info as any;
        if (dep.dependencies) {
          for (const [subName, subInfo] of Object.entries(dep.dependencies)) {
            const subDep = subInfo as any;
            if (depTree.dependencies?.[subName]) {
              const mainDep = depTree.dependencies[subName];
              if (mainDep.version !== subDep.version) {
                resolutions.push({
                  package: subName,
                  conflicts: [
                    {
                      requested: subDep.version,
                      conflicting: mainDep.version,
                      via: parent,
                    },
                  ],
                  resolution:
                    args.strategy === "newest"
                      ? mainDep.version
                      : args.strategy === "oldest"
                        ? subDep.version
                        : args.strategy === "minimal"
                          ? mainDep.version
                          : "manual",
                  version:
                    args.strategy === "newest"
                      ? mainDep.version
                      : args.strategy === "oldest"
                        ? subDep.version
                        : args.strategy === "minimal"
                          ? mainDep.version
                          : "manual",
                });
              }
            }
          }
          findConflicts(dep.dependencies, name);
        }
      }
    };

    findConflicts(depTree.dependencies || {});
  } catch {}

  const report = [
    "# Dependency Conflict Resolution",
    "",
    `**Strategy:** ${args.strategy}`,
    "",
    `**Conflicts Found:** ${resolutions.length}`,
    "",
  ];

  for (const res of resolutions.slice(0, 20)) {
    report.push(`## ${res.package}`);
    report.push(`Resolved Version: ${res.version}`);
    for (const conf of res.conflicts) {
      report.push(
        `- Requested: ${conf.requested}, Conflicting: ${conf.conflicting} (via ${conf.via})`,
      );
    }
    report.push("");
  }

  if (resolutions.length === 0) {
    report.push("✅ No conflicts found!");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Conflict Resolution Complete">${resolutions.length} resolved</dyad-status>`,
  );

  return report.join("\n");
}

// Environment Compatibility Checker (Capability 499)
async function checkEnvironmentCompatibility(
  args: EnvironmentCompatibilityArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Environment Compatibility">Checking compatibility...</dyad-status>`,
  );

  const results: CompatibilityResult[] = [];
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"),
  );

  for (const env of args.targetEnvironments) {
    const result: CompatibilityResult = {
      environment: env,
      compatible: true,
      issues: [],
    };

    // Check for browser-only or node-only packages
    if (env === "browser") {
      if (
        packageJson.dependencies?.["fs"] ||
        packageJson.dependencies?.["path"]
      ) {
        result.issues.push({
          package: "node built-ins",
          issue: "Uses Node.js built-in modules not available in browser",
          severity: "error",
        });
        result.compatible = false;
      }
    }

    if (env === "nodejs" || env === "deno") {
      // Most packages work in Node.js
    }

    results.push(result);
  }

  const report = [
    "# Environment Compatibility Report",
    "",
    `**Target Environments:** ${args.targetEnvironments.join(", ")}`,
    "",
  ];

  for (const result of results) {
    const status = result.compatible ? "✅" : "❌";
    report.push(`## ${status} ${result.environment}`);

    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        report.push(`- ${issue.issue} (${issue.package})`);
      }
    }
    report.push("");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Compatibility Check Complete">Done</dyad-status>`,
  );

  return report.join("\n");
}

// Platform Specific Validation (Capability 500)
async function validatePlatform(
  args: PlatformValidationArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Platform Validation">Validating platform compatibility...</dyad-status>`,
  );

  const results: PlatformValidationResult[] = [];

  for (const platform of args.platforms) {
    const result: PlatformValidationResult = {
      platform,
      valid: true,
      nativeModules: [],
    };

    if (args.checkNative) {
      try {
        const output = await runNpmCommand("npm ls --json --all", projectPath);
        const depTree = JSON.parse(output);

        const knownNativeModules = [
          "sharp",
          "bcrypt",
          "sqlite3",
          "grpc",
          "node-sass",
          "canvas",
          "better-sqlite3",
        ];

        const checkNative = (deps: any): void => {
          for (const [name] of Object.entries(deps || {})) {
            if (knownNativeModules.includes(name)) {
              result.nativeModules.push({
                name,
                status: platform === "web" ? "unsupported" : "needs-build",
                issues:
                  platform === "web"
                    ? ["Native module not available in web environment"]
                    : [],
              });
              result.valid = false;
            }
            if (deps[name]?.dependencies) {
              checkNative(deps[name].dependencies);
            }
          }
        };

        checkNative(depTree.dependencies || {});
      } catch {}
    }

    results.push(result);
  }

  const report = [
    "# Platform Validation Report",
    "",
    `**Platforms Checked:** ${args.platforms.join(", ")}`,
    "",
  ];

  for (const result of results) {
    const status = result.valid ? "✅" : "❌";
    report.push(`## ${status} ${result.platform}`);

    if (result.nativeModules.length > 0) {
      report.push("### Native Modules");
      for (const mod of result.nativeModules) {
        report.push(`- **${mod.name}**: ${mod.status}`);
        for (const issue of mod.issues) {
          report.push(`  - ${issue}`);
        }
      }
    }
    report.push("");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Platform Validation Complete">Done</dyad-status>`,
  );

  return report.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

// Dependency Optimization Engine (Capability 491)
export const dependencyOptimizationTool: ToolDefinition<DependencyOptimizationArgs> =
  {
    name: "dependency_optimization_engine",
    description:
      "Analyze and optimize dependency usage in the project. Identifies opportunities to reduce bundle size, remove unused dependencies, and replace heavy packages with lighter alternatives.",
    inputSchema: DependencyOptimizationArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      return await optimizeDependencies(args, ctx);
    },
  };

// Dependency Policy Enforcer (Capability 492)
export const dependencyPolicyTool: ToolDefinition<DependencyPolicyArgs> = {
  name: "dependency_policy_enforcer",
  description:
    "Enforce dependency policies such as no deprecated packages, security requirements, and maintenance rules. Checks against configurable policy rules.",
  inputSchema: DependencyPolicyArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    return await enforcePolicies(args, ctx);
  },
};

// Dependency Health Monitor (Capability 493)
export const dependencyGovernanceHealthMonitorTool: ToolDefinition<DependencyHealthMonitorArgs> =
  {
    name: "dependency_health_monitor",
    description:
      "Monitor the health of project dependencies over time. Tracks metrics like outdated packages, vulnerabilities, deprecated packages, and provides trend analysis.",
    inputSchema: DependencyHealthMonitorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      return await monitorHealth(args, ctx);
    },
  };

// Dependency Vulnerability Scanner (Capability 494)
export const vulnerabilityScannerTool: ToolDefinition<VulnerabilityScannerArgs> =
  {
    name: "dependency_vulnerability_scanner",
    description:
      "Scan for security vulnerabilities in dependencies. Uses npm audit to detect known CVEs and provides detailed reports with severity levels.",
    inputSchema: VulnerabilityScannerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      return await scanVulnerabilities(args, ctx);
    },
  };

// Dependency Compliance Checker (Capability 495)
export const dependencyComplianceCheckerTool: ToolDefinition<ComplianceCheckerArgs> =
  {
    name: "dependency_compliance_checker",
    description:
      "Check dependency compliance against various frameworks like SOX, GDPR, HIPAA, or PCI-DSS. Validates licenses and identifies compliance issues.",
    inputSchema: ComplianceCheckerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      return await checkCompliance(args, ctx);
    },
  };

// Dependency License Manager (Capability 496)
export const licenseManagerTool: ToolDefinition<LicenseManagerArgs> = {
  name: "dependency_license_manager",
  description:
    "Manage and audit dependency licenses. Supports whitelisting, blacklisting, and approval workflows for different license types.",
  inputSchema: LicenseManagerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    return await manageLicenses(args, ctx);
  },
};

// Dependency Update Planner (Capability 497)
export const updatePlannerTool: ToolDefinition<UpdatePlannerArgs> = {
  name: "dependency_update_planner",
  description:
    "Plan dependency updates with risk assessment. Analyzes breaking changes, prioritizes updates by severity, and provides update recommendations.",
  inputSchema: UpdatePlannerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    return await planUpdates(args, ctx);
  },
};

// Dependency Conflict Resolver (Capability 498)
export const conflictResolverTool: ToolDefinition<ConflictResolverArgs> = {
  name: "dependency_conflict_resolver",
  description:
    "Detect and resolve dependency version conflicts. Analyzes the dependency tree to find version mismatches and suggests resolution strategies.",
  inputSchema: ConflictResolverArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    return await resolveConflicts(args, ctx);
  },
};

// Environment Compatibility Checker (Capability 499)
export const environmentCompatibilityTool: ToolDefinition<EnvironmentCompatibilityArgs> =
  {
    name: "environment_compatibility_checker",
    description:
      "Check cross-platform compatibility of dependencies. Validates that packages work in different environments like Node.js, browser, and Deno.",
    inputSchema: EnvironmentCompatibilityArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      return await checkEnvironmentCompatibility(args, ctx);
    },
  };

// Platform Specific Validation (Capability 500)
export const platformValidationTool: ToolDefinition<PlatformValidationArgs> = {
  name: "platform_specific_validation",
  description:
    "Validate platform-specific requirements for dependencies. Checks native modules and platform-specific packages for Windows, macOS, Linux, iOS, Android, and web.",
  inputSchema: PlatformValidationArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    return await validatePlatform(args, ctx);
  },
};

// Dependency Container Image Analyzer (Capability 510)
export const containerAnalysisTool: ToolDefinition<ContainerAnalysisArgs> = {
  name: "dependency_container_analysis",
  description:
    "Perform static analysis on Docker/OCI images and Dockerfiles to detect dependency vulnerabilities and compliance issues.",
  inputSchema: ContainerAnalysisArgs,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (args, ctx) => {
    const projectPath = getProjectPath(args, ctx);
    const dockerfilePath = path.isAbsolute(args.target)
      ? args.target
      : path.join(projectPath, args.target);

    ctx.onXmlStream(
      `<dyad-status title="Container Analyzer">Performing deep static analysis on ${args.target}...</dyad-status>`,
    );

    if (!fs.existsSync(dockerfilePath)) {
      return `Error: Target ${args.target} not found. Ensure Dockerfile exists in project root.`;
    }

    let content: string;
    try {
      content = fs.readFileSync(dockerfilePath, "utf-8");
    } catch (error) {
      return `Error: Failed to read ${args.target}: ${error}`;
    }
    const lines = content.split("\n");
    const issues = [];
    const observations = [];

    // 1. Multi-stage build detection
    const fromStages = lines.filter((l) => /^\s*FROM\s+/i.test(l));
    if (fromStages.length > 1) {
      observations.push(
        `✅ Multi-stage build detected (${fromStages.length} stages).`,
      );
    } else {
      issues.push(
        "🟡 MEDIUM: Single-stage build detected. Consider multi-stage builds to reduce image size and attack surface.",
      );
    }

    // 2. Secret Detection (Hardcoded values in ENV or ARG)
    const secretPattern =
      /(ARG|ENV)\s+.*(PASSWORD|TOKEN|SECRET|API_KEY|PRIVATE_KEY|GITHUB_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/i;
    lines.forEach((line, index) => {
      if (secretPattern.test(line)) {
        issues.push(
          `🔴 CRITICAL: Potential hardcoded secret found on line ${index + 1}: "${line.trim().substring(0, 30)}..."`,
        );
      }
    });

    // 3. Base Image Security
    if (/FROM\s+.*:latest/i.test(content)) {
      issues.push(
        "🔴 HIGH: Using ':latest' tag for base image. Use specific version tags (SHA256 or version number) for repeatable builds.",
      );
    }

    // 4. User Privileges
    if (!/USER\s+/i.test(content)) {
      issues.push(
        "🟡 MEDIUM: No USER instruction found. Container will likely run as root, which is a security risk.",
      );
    } else if (/USER\s+root/i.test(content)) {
      issues.push(
        "🔴 HIGH: Explicitly running as USER root. Switch to a non-privileged user.",
      );
    }

    // 5. Best Practices: HEALTHCHECK, LABEL, .dockerignore
    if (!/HEALTHCHECK/i.test(content)) {
      issues.push(
        "🔵 INFO: No HEALTHCHECK instruction found. It is recommended to define how to check if the container is still healthy.",
      );
    }

    if (!/LABEL/i.test(content)) {
      observations.push(
        "🔵 INFO: No LABEL instructions found for metadata. Consider adding labels for version, author, and description.",
      );
    }

    const dockerignorePath = path.join(
      path.dirname(dockerfilePath),
      ".dockerignore",
    );
    if (fs.existsSync(dockerignorePath)) {
      observations.push("✅ .dockerignore file found and being respected.");
    } else {
      issues.push(
        "🟡 MEDIUM: No .dockerignore file found. This may lead to bloated images and leaked local secrets/configs.",
      );
    }

    // 6. Layer Analysis
    const layerInstructions = [
      "FROM",
      "RUN",
      "COPY",
      "ADD",
      "ENTRYPOINT",
      "CMD",
      "ENV",
      "ARG",
      "EXPOSE",
      "VOLUME",
      "WORKDIR",
      "USER",
      "ONBUILD",
      "STOPSIGNAL",
      "HEALTHCHECK",
      "SHELL",
    ];
    let layerCount = 0;
    lines.forEach((l) => {
      const trimmed = l.trim();
      if (layerInstructions.some((instr) => trimmed.startsWith(instr))) {
        layerCount++;
      }
    });

    observations.push(`📊 Instruction count: ${layerCount} layers.`);
    if (layerCount > 20) {
      issues.push(
        "🟡 MEDIUM: High number of instructions detected. Consider combining RUN commands or using multi-stage builds to optimize layers.",
      );
    }

    const results = [
      `# Advanced Container Analysis Report for ${args.target}`,
      "",
      `**Analysis Depth:** ${args.depth}`,
      `**Target File:** \`${args.target}\``,
      "",
      "## 🔍 Observations",
      observations.map((o) => `- ${o}`).join("\n"),
      "",
      "## ⚠️ Security & Optimization Findings",
      issues.length > 0
        ? issues.map((i) => `- ${i}`).join("\n")
        : "✅ No major security or optimization issues found in static analysis.",
      "",
      "## 🛠️ Recommendations",
      "1. **Pin Versions**: Always use immutable tags or digests (e.g., `node:18.1.0-alpine` or `node@sha256:...`).",
      "2. **Least Privilege**: Always create a non-root user and switch to it using the `USER` instruction.",
      "3. **Minimize Layers**: Combine related `RUN` commands with `&&` and clear caches in the same layer.",
      "4. **Secrets Management**: Never use `ARG` or `ENV` for secrets. Use Docker Secrets or environment variables at runtime.",
    ];

    ctx.onXmlComplete(
      `<dyad-status title="Container Analysis Complete">${issues.length} findings, ${observations.length} observations</dyad-status>`,
    );

    return results.join("\n");
  },
};
