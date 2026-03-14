/**
 * Dependency Upgrader Tool
 * Safely upgrades dependencies to latest compatible versions
 * Uses npm-check for intelligent upgrades
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const DependencyUpgraderArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Specific packages to upgrade (optional, upgrades all if not specified) */
  packages: z.array(z.string()).optional(),
  /** Upgrade to latest versions (not just wanted) */
  useLatest: z.boolean().default(false),
  /** Create a backup branch before upgrading */
  createBackup: z.boolean().default(true),
});

type DependencyUpgraderArgs = z.infer<typeof DependencyUpgraderArgs>;

// Result type
interface UpgradeResult {
  upgraded: string[];
  failed: string[];
  warnings: string[];
  command?: string;
}

// Execute npm command
async function runNpmCommand(
  command: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, _reject) => {
    exec(
      command,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          code: error?.code || 0,
        });
      },
    );
  });
}

// Run git command
async function runGitCommand(
  command: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, _reject) => {
    exec(
      command,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          code: error?.code || 0,
        });
      },
    );
  });
}

// Check if directory is a git repo
async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGitCommand(
    "git rev-parse --is-inside-work-tree",
    cwd,
  );
  return result.code === 0;
}

// Create backup branch
async function createBackupBranch(cwd: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branchName = `backup-before-upgrade-${timestamp}`;

  const result = await runGitCommand(`git checkout -b ${branchName}`, cwd);

  if (result.code !== 0) {
    throw new Error(`Failed to create backup branch: ${result.stderr}`);
  }

  return branchName;
}

// Get current branch
async function _getCurrentBranch(cwd: string): Promise<string> {
  const result = await runGitCommand("git branch --show-current", cwd);
  return result.stdout.trim();
}

// Upgrade a single package
async function upgradePackage(
  packageName: string,
  cwd: string,
  useLatest: boolean,
): Promise<{ success: boolean; version?: string; error?: string }> {
  const flag = useLatest ? "latest" : "wanted";
  const result = await runNpmCommand(
    `npm install ${packageName}@${flag} --save`,
    cwd,
  );

  if (result.code !== 0) {
    return {
      success: false,
      error: result.stderr || "Unknown error",
    };
  }

  // Extract new version
  const pkgJsonPath = path.join(cwd, "package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  const version =
    pkgJson.dependencies?.[packageName] ||
    pkgJson.devDependencies?.[packageName];

  return {
    success: true,
    version,
  };
}

// Upgrade all outdated packages
async function upgradeAllPackages(
  cwd: string,
  useLatest: boolean,
): Promise<{ upgraded: string[]; failed: string[] }> {
  const upgraded: string[] = [];
  const failed: string[] = [];

  // Get outdated packages
  const result = await runNpmCommand("npm outdated --json", cwd);

  if (result.code !== 0 || !result.stdout.trim()) {
    return { upgraded, failed };
  }

  try {
    const outdated = JSON.parse(result.stdout);
    const packages = Object.keys(outdated);

    for (const pkg of packages) {
      const upgradeResult = await upgradePackage(pkg, cwd, useLatest);
      if (upgradeResult.success) {
        upgraded.push(`${pkg}@${upgradeResult.version}`);
      } else {
        failed.push(pkg);
      }
    }
  } catch {
    // No outdated packages
  }

  return { upgraded, failed };
}

// Main upgrade function
async function upgradeDependencies(
  args: DependencyUpgraderArgs,
  ctx: AgentContext,
): Promise<UpgradeResult> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${projectPath}`);
  }

  const warnings: string[] = [];
  const upgraded: string[] = [];
  const failed: string[] = [];

  // Check if git repo and create backup
  if (args.createBackup) {
    const isRepo = await isGitRepo(projectPath);
    if (isRepo) {
      try {
        ctx.onXmlStream(
          `<dyad-status title="Dependency Upgrader">Creating backup branch...</dyad-status>`,
        );
        const branch = await createBackupBranch(projectPath);
        warnings.push(`Created backup branch: ${branch}`);
      } catch (error) {
        warnings.push(`Could not create backup branch: ${error}`);
      }
    }
  }

  // Upgrade specific packages or all
  if (args.packages && args.packages.length > 0) {
    ctx.onXmlStream(
      `<dyad-status title="Dependency Upgrader">Upgrading ${args.packages.length} packages...</dyad-status>`,
    );

    for (const pkg of args.packages) {
      const result = await upgradePackage(pkg, projectPath, args.useLatest);
      if (result.success) {
        upgraded.push(`${pkg}@${result.version}`);
      } else {
        failed.push(`${pkg}: ${result.error}`);
      }
    }
  } else {
    ctx.onXmlStream(
      `<dyad-status title="Dependency Upgrader">Finding outdated packages...</dyad-status>`,
    );

    const result = await upgradeAllPackages(projectPath, args.useLatest);
    upgraded.push(...result.upgraded);
    failed.push(...result.failed);
  }

  // Run npm install to update lockfile
  ctx.onXmlStream(
    `<dyad-status title="Dependency Upgrader">Updating package-lock.json...</dyad-status>`,
  );

  const installResult = await runNpmCommand("npm install", projectPath);
  if (installResult.code !== 0) {
    warnings.push(
      `npm install had issues: ${installResult.stderr.slice(0, 200)}`,
    );
  }

  return {
    upgraded,
    failed,
    warnings,
  };
}

// Generate XML output
function generateUpgradeXml(result: UpgradeResult): string {
  const lines: string[] = [`# Dependency Upgrade Report`, ``];

  if (result.upgraded.length === 0 && result.failed.length === 0) {
    lines.push("✅ All dependencies are already up to date!");
  } else {
    if (result.upgraded.length > 0) {
      lines.push(`## ✅ Upgraded (${result.upgraded.length})`);
      for (const pkg of result.upgraded) {
        lines.push(`- ${pkg}`);
      }
      lines.push("");
    }

    if (result.failed.length > 0) {
      lines.push(`## ❌ Failed (${result.failed.length})`);
      for (const pkg of result.failed) {
        lines.push(`- ${pkg}`);
      }
      lines.push("");
    }

    if (result.warnings.length > 0) {
      lines.push(`## ⚠️ Warnings`);
      for (const warning of result.warnings) {
        lines.push(`- ${warning}`);
      }
    }

    lines.push("");
    lines.push(
      "> Run `npm run build` or `npm run ts` to verify the upgrade doesn't break anything.",
    );
  }

  return lines.join("\n");
}

export const dependencyUpgraderTool: ToolDefinition<DependencyUpgraderArgs> = {
  name: "dependency_upgrader",
  description:
    "Upgrade project dependencies to latest compatible versions. Can upgrade specific packages or all outdated packages. Creates a backup branch automatically.",
  inputSchema: DependencyUpgraderArgs,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    if (args.packages && args.packages.length > 0) {
      return `Upgrade packages: ${args.packages.join(", ")}`;
    }
    return "Upgrade all outdated dependencies";
  },

  execute: async (args, ctx) => {
    const result = await upgradeDependencies(args, ctx);

    const report = generateUpgradeXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Dependency Upgrade Complete">${result.upgraded.length} upgraded, ${result.failed.length} failed</dyad-status>`,
    );

    return report;
  },
};
