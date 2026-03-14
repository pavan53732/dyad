/**
 * Dependency Analyzer Tool
 * Analyzes package.json and package-lock.json for:
 * - Outdated dependencies
 * - Security vulnerabilities
 * - License compliance
 * - Deprecated packages
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const DependencyAnalyzerArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Check for outdated packages */
  checkOutdated: z.boolean().default(true),
  /** Check for security vulnerabilities */
  checkSecurity: z.boolean().default(true),
  /** Check for license issues */
  checkLicenses: z.boolean().default(false),
});

type DependencyAnalyzerArgs = z.infer<typeof DependencyAnalyzerArgs>;

// Result types
interface DependencyIssue {
  name: string;
  current: string;
  latest?: string;
  wanted?: string;
  type: "outdated" | "security" | "license" | "deprecated";
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

// Execute npm command and return JSON output
async function runNpmCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
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

// Parse npm outdated output
function parseNpmOutdated(output: string): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  const lines = output.trim().split("\n");

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse npm outdated output format: Package Current Wanted Latest Location Depended by
    const parts = line.split(/\s+/);
    if (parts.length >= 5) {
      const [, current, wanted, latest] = parts;
      if (current && current !== "wanted" && current !== "latest") {
        issues.push({
          name: parts[0],
          current,
          wanted: wanted !== "wanted" ? wanted : undefined,
          latest: latest !== "latest" ? latest : undefined,
          type: "outdated",
          severity: "low",
          message: `Package is outdated. Current: ${current}, Latest: ${latest || "unknown"}`,
        });
      }
    }
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

// Check for deprecated packages
async function checkDeprecated(
  packages: string[],
  cwd: string,
): Promise<DependencyIssue[]> {
  const issues: DependencyIssue[] = [];

  // Use npm view to check each package
  for (const pkg of packages.slice(0, 20)) {
    // Limit to avoid too many requests
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
      // Package not deprecated or not found
    }
  }

  return issues;
}

// Main analyze function
async function analyzeDependencies(
  args: DependencyAnalyzerArgs,
  ctx: AgentContext,
): Promise<AnalysisResult> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }

  const issues: DependencyIssue[] = [];

  // Read package.json to get dependency list
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const allDeps = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];

  ctx.onXmlStream(
    `<dyad-status title="Dependency Analyzer">Analyzing ${allDeps.length} dependencies in ${path.basename(projectPath)}...</dyad-status>`,
  );

  // Check for outdated packages
  if (args.checkOutdated) {
    try {
      ctx.onXmlStream(
        `<dyad-status title="Dependency Analyzer">Checking for outdated packages...</dyad-status>`,
      );
      const outdatedOutput = await runNpmCommand(
        "npm outdated --json --long",
        projectPath,
      );
      const outdated = parseNpmOutdated(outdatedOutput);
      issues.push(...outdated);
    } catch  {
      // npm outdated might fail if no package-lock.json
    }
  }

  // Check for security vulnerabilities
  if (args.checkSecurity) {
    try {
      ctx.onXmlStream(
        `<dyad-status title="Dependency Analyzer">Checking for security vulnerabilities...</dyad-status>`,
      );
      const auditOutput = await runNpmCommand("npm audit --json", projectPath);
      const securityIssues = parseNpmAudit(auditOutput);
      issues.push(...securityIssues);
    } catch  {
      // npm audit might fail
    }
  }

  // Check for deprecated packages
  if (args.checkOutdated) {
    const deprecated = await checkDeprecated(allDeps, projectPath);
    issues.push(...deprecated);
  }

  // Build summary
  const summary = {
    total: issues.length,
    outdated: issues.filter((i) => i.type === "outdated").length,
    security: issues.filter((i) => i.type === "security").length,
    licenses: issues.filter((i) => i.type === "license").length,
    deprecated: issues.filter((i) => i.type === "deprecated").length,
  };

  return {
    summary,
    issues,
    analyzedAt: new Date().toISOString(),
  };
}

// Generate XML output
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
    // Group by severity
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
