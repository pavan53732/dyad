/**
 * Technical Debt Analysis Tool
 * Analyzes, prioritizes, and tracks technical debt:
 * - analyze_debt (361) - Technical debt analysis
 * - debt_prioritize (362) - Prioritize debt items
 * - debt_tracking (363) - Track debt over time
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

const AnalyzeDebtArgs = z.object({
  /** Path to analyze (defaults to app root) */
  projectPath: z.string().optional(),
  /** Categories to analyze */
  categories: z
    .enum(["all", "code", "test", "documentation", "dependency", "security", "performance"])
    .array()
    .default(["all"]),
  /** Include cost estimation */
  includeCostEstimation: z.boolean().default(true),
});

type AnalyzeDebtArgs = z.infer<typeof AnalyzeDebtArgs>;

const PrioritizeDebtArgs = z.object({
  /** List of debt items to prioritize */
  debtItems: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      title: z.string(),
      description: z.string(),
      effortHours: z.number().optional(),
      impactScore: z.number().optional(),
    }),
  ),
  /** Prioritization strategy */
  strategy: z.enum(["impact-first", "effort-first", "roi", "critical-path"]).default("roi"),
  /** Maximum items to return */
  limit: z.number().min(1).max(50).default(10),
});

type PrioritizeDebtArgs = z.infer<typeof PrioritizeDebtArgs>;

const TrackDebtArgs = z.object({
  /** Path to the debt tracking file */
  trackingFile: z.string().default(".dyad/technical-debt.json"),
  /** Action to perform */
  action: z.enum(["add", "update", "remove", "list", "summary"]),
  /** Debt item data (for add/update) */
  item: z
    .object({
      id: z.string(),
      category: z.string(),
      title: z.string(),
      description: z.string(),
      severity: z.enum(["critical", "high", "medium", "low"]),
      effortHours: z.number().optional(),
      status: z.enum(["identified", "in-progress", "resolved"]).default("identified"),
      relatedFiles: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  /** Item ID to remove or update */
  itemId: z.string().optional(),
});

type TrackDebtArgs = z.infer<typeof TrackDebtArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface DebtItem {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  location?: string;
  effortHours?: number;
  interestPayment?: number; // Hours per month of maintenance
  relatedFiles?: string[];
}

interface DebtAnalysis {
  totalItems: number;
  totalEffortHours: number;
  monthlyInterestPayment: number;
  categories: Record<string, { count: number; effortHours: number }>;
  severityBreakdown: Record<string, number>;
  items: DebtItem[];
}

interface PrioritizedDebtItem extends DebtItem {
  priorityScore: number;
  rank: number;
  recommendation: string;
}

interface DebtTrackingRecord {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  effortHours?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  relatedFiles?: string[];
  tags?: string[];
}

// ============================================================================
// Debt Analysis Logic
// ============================================================================

function analyzeTechnicalDebt(
  files: string[],
  content: Map<string, string>,
  categories: string[],
  includeCostEstimation: boolean,
): DebtAnalysis {
  const items: DebtItem[] = [];
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  // Code debt - missing tests
  if (categories.includes("all") || categories.includes("code") || categories.includes("test")) {
    const sourceFiles = files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"),
    );
    for (const file of sourceFiles) {
      const hasTest =
        files.some((f) => f.includes(file.replace(/\.(ts|tsx|js|jsx)$/, ".test."))) ||
        files.some((f) => f.includes(file.replace(/\.(ts|tsx|js|jsx)$/, ".spec."))) ||
        files.includes(file.replace(/src\//, "src/__tests__/").replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"));

      if (!hasTest && !file.includes("__tests__") && !file.includes(".test.") && !file.includes(".spec.")) {
        items.push({
          id: `debt-test-${items.length + 1}`,
          category: "test",
          title: "Missing test coverage",
          description: `File lacks test coverage: ${path.basename(file)}`,
          severity: "medium",
          location: file,
          effortHours: includeCostEstimation ? 2 : undefined,
          relatedFiles: [file],
        });
      }
    }
  }

  // Code debt - code duplication
  if (categories.includes("all") || categories.includes("code")) {
    const codeBlocks = new Map<string, { count: number; locations: string[] }>();
    for (const [file, fileContent] of content) {
      const funcRegex = /(?:function|const|let|var)\s+(\w+)\s*[=:]/g;
      let match;
      while ((match = funcRegex.exec(fileContent)) !== null) {
        const block = match[0].slice(0, 60);
        const existing = codeBlocks.get(block) || { count: 0, locations: [] };
        existing.count++;
        existing.locations.push(file);
        codeBlocks.set(block, existing);
      }
    }
    for (const [block, info] of codeBlocks) {
      if (info.count > 3) {
        items.push({
          id: `debt-dup-${items.length + 1}`,
          category: "code",
          title: "Code duplication detected",
          description: `Similar code block repeated ${info.count} times`,
          severity: "medium",
          effortHours: includeCostEstimation ? info.count * 2 : undefined,
          relatedFiles: info.locations,
        });
      }
    }
  }

  // Code debt - TODO comments
  if (categories.includes("all") || categories.includes("code")) {
    for (const [file, fileContent] of content) {
      const todos = fileContent.match(/\/\/\s*TODO[^\n]*/gi);
      if (todos && todos.length > 2) {
        items.push({
          id: `debt-todo-${items.length + 1}`,
          category: "code",
          title: "Outstanding TODO comments",
          description: `Found ${todos.length} TODO comments in ${path.basename(file)}`,
          severity: "low",
          location: file,
          effortHours: includeCostEstimation ? todos.length * 0.5 : undefined,
          relatedFiles: [file],
        });
      }
    }
  }

  // Documentation debt
  if (categories.includes("all") || categories.includes("documentation")) {
    const hasReadme = files.some((f) => f.toLowerCase().includes("readme"));
    if (!hasReadme) {
      items.push({
        id: "debt-doc-1",
        category: "documentation",
        title: "Missing README",
        description: "Project lacks a README file",
        severity: "medium",
        effortHours: includeCostEstimation ? 2 : undefined,
      });
    }

    // Check for missing JSDoc in exported functions
    for (const [file, fileContent] of content) {
      const exports = fileContent.match(/export\s+(?:function|class|const|interface|type)\s+\w+/g);
      const jsdocs = fileContent.match(/\/\*\*[\s\S]*?\*\//g);
      if (exports && jsdocs && exports.length > jsdocs.length * 1.5) {
        items.push({
          id: `debt-doc-${items.length + 1}`,
          category: "documentation",
          title: "Missing documentation",
          description: `Exported items lack JSDoc comments in ${path.basename(file)}`,
          severity: "low",
          location: file,
          effortHours: includeCostEstimation ? exports.length * 0.5 : undefined,
          relatedFiles: [file],
        });
      }
    }
  }

  // Dependency debt
  if (categories.includes("all") || categories.includes("dependency")) {
    // Check for outdated patterns (simplified)
    for (const [file, fileContent] of content) {
      // Check for var usage
      if (/\bvar\s+\w+/.test(fileContent)) {
        items.push({
          id: `debt-dep-${items.length + 1}`,
          category: "dependency",
          title: "Using deprecated 'var' keyword",
          description: "Use 'let' or 'const' instead of 'var'",
          severity: "low",
          location: file,
          effortHours: includeCostEstimation ? 0.5 : undefined,
          relatedFiles: [file],
        });
      }

      // Check for == instead of ===
      if (/[^=]==[^=]/.test(fileContent) && !/===\s*$/.test(fileContent)) {
        items.push({
          id: `debt-dep-${items.length + 1}`,
          category: "code",
          title: "Loose equality comparison",
          description: "Use strict equality (===) instead of loose equality (==)",
          severity: "low",
          location: file,
          effortHours: includeCostEstimation ? 0.25 : undefined,
          relatedFiles: [file],
        });
      }
    }
  }

  // Security debt
  if (categories.includes("all") || categories.includes("security")) {
    for (const [file, fileContent] of content) {
      // Check for hardcoded secrets (simplified)
      if (/api[_-]?key|password|secret|token/i.test(fileContent)) {
        if (!/example|your_[a-z_]+|replace|xxx|placeholder/i.test(fileContent)) {
          items.push({
            id: `debt-sec-${items.length + 1}`,
            category: "security",
            title: "Potential hardcoded secret",
            description: "Possible hardcoded credential detected",
            severity: "critical",
            location: file,
            effortHours: includeCostEstimation ? 1 : undefined,
            relatedFiles: [file],
          });
        }
      }
    }
  }

  // Performance debt
  if (categories.includes("all") || categories.includes("performance")) {
    for (const [file, fileContent] of content) {
      // Check for nested loops (simplified performance issue)
      const nestedLoops = fileContent.match(/(for|while)\s*\([^)]+\)\s*\{[^}]*?(for|while)\s*\(/g);
      if (nestedLoops && nestedLoops.length > 0) {
        items.push({
          id: `debt-perf-${items.length + 1}`,
          category: "performance",
          title: "Nested loops detected",
          description: "Potential O(n²) or worse complexity",
          severity: "medium",
          location: file,
          effortHours: includeCostEstimation ? 4 : undefined,
          relatedFiles: [file],
        });
      }
    }
  }

  // Calculate totals
  const totalEffortHours = items.reduce((sum, item) => sum + (item.effortHours || 0), 0);
  const monthlyInterestPayment = items.reduce(
    (sum, item) => sum + (item.severity === "critical" ? 4 : item.severity === "high" ? 2 : item.severity === "medium" ? 1 : 0.25),
    0,
  );

  const categoryBreakdown: Record<string, { count: number; effortHours: number }> = {};
  const severityBreakdown: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const item of items) {
    if (!categoryBreakdown[item.category]) {
      categoryBreakdown[item.category] = { count: 0, effortHours: 0 };
    }
    categoryBreakdown[item.category].count++;
    categoryBreakdown[item.category].effortHours += item.effortHours || 0;
    severityBreakdown[item.severity]++;
  }

  return {
    totalItems: items.length,
    totalEffortHours,
    monthlyInterestPayment,
    categories: categoryBreakdown,
    severityBreakdown,
    items,
  };
}

// ============================================================================
// Debt Prioritization Logic
// ============================================================================

function prioritizeDebtItems(
  items: PrioritizeDebtArgs["debtItems"],
  strategy: string,
  limit: number,
): PrioritizedDebtItem[] {
  const severityScores: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  const scored = items.map((item) => {
    // Use impactScore if provided, otherwise default to medium
    const impactScore = item.impactScore || 2;
    const effort = item.effortHours || 1;
    // Derive severity from impactScore if not provided
    const severity: "critical" | "high" | "medium" | "low" = impactScore >= 4 ? "critical" : impactScore >= 3 ? "high" : impactScore >= 2 ? "medium" : "low";

    let priorityScore: number;
    switch (strategy) {
      case "impact-first":
        priorityScore = impactScore * 10 - effort;
        break;
      case "effort-first":
        priorityScore = (10 - effort) * 5 + impactScore;
        break;
      case "roi":
        priorityScore = impactScore / Math.max(effort, 0.5);
        break;
      case "critical-path":
        priorityScore = impactScore * 5 + (severity === "critical" ? 20 : 0);
        break;
      default:
        priorityScore = impactScore / Math.max(effort, 0.5);
    }

    return { ...item, severity, priorityScore };
  });

  // Sort by priority score (descending)
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Add rank and recommendation
  return scored.slice(0, limit).map((item, idx) => {
    let recommendation: string;
    if (idx === 0) {
      recommendation = "Start here - highest priority item";
    } else if (item.severity === "critical") {
      recommendation = "Address immediately - critical severity";
    } else if (item.effortHours && item.effortHours < 2) {
      recommendation = "Quick win - low effort, moderate impact";
    } else {
      recommendation = "Schedule for next sprint";
    }

    return { 
      id: item.id,
      category: item.category,
      title: item.title,
      description: item.description,
      severity: item.severity,
      effortHours: item.effortHours,
      priorityScore: item.priorityScore, 
      rank: idx + 1, 
      recommendation 
    };
  });
}

// ============================================================================
// Debt Tracking Logic
// ============================================================================

function getTrackingFilePath(trackingFile: string, ctx: AgentContext): string {
  const isAbsolute = path.isAbsolute(trackingFile);
  return isAbsolute ? trackingFile : path.join(ctx.appPath, trackingFile);
}

function loadTrackingData(filePath: string): DebtTrackingRecord[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      return parsed.debtItems || [];
    }
  } catch {
    // Return empty array if file doesn't exist or is invalid
  }
  return [];
}

function saveTrackingData(filePath: string, items: DebtTrackingRecord[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    debtItems: items,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function trackDebt(
  action: string,
  item: TrackDebtArgs["item"],
  itemId: string | undefined,
  ctx: AgentContext,
  trackingFile: string,
): string {
  const filePath = getTrackingFilePath(trackingFile, ctx);
  let items = loadTrackingData(filePath);

  switch (action) {
    case "add": {
      if (!item) {
        throw new Error("Item data required for add action");
      }
      const newItem: DebtTrackingRecord = {
        ...item,
        status: item.status || "identified",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(newItem);
      saveTrackingData(filePath, items);
      return `Added debt item: ${item.title} (ID: ${item.id})`;
    }

    case "update": {
      if (!itemId || !item) {
        throw new Error("Item ID and data required for update action");
      }
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx === -1) {
        throw new Error(`Debt item not found: ${itemId}`);
      }
      items[idx] = {
        ...items[idx],
        ...item,
        updatedAt: new Date().toISOString(),
      };
      if (item.status === "resolved") {
        items[idx].resolvedAt = new Date().toISOString();
      }
      saveTrackingData(filePath, items);
      return `Updated debt item: ${itemId}`;
    }

    case "remove": {
      if (!itemId) {
        throw new Error("Item ID required for remove action");
      }
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx === -1) {
        throw new Error(`Debt item not found: ${itemId}`);
      }
      items.splice(idx, 1);
      saveTrackingData(filePath, items);
      return `Removed debt item: ${itemId}`;
    }

    case "list": {
      if (items.length === 0) {
        return "No technical debt items tracked.";
      }

      const lines: string[] = ["# Technical Debt Tracking", ""];

      const byStatus = {
        identified: items.filter((i) => i.status === "identified"),
        "in-progress": items.filter((i) => i.status === "in-progress"),
        resolved: items.filter((i) => i.status === "resolved"),
      };

      for (const [status, statusItems] of Object.entries(byStatus)) {
        if (statusItems.length > 0) {
          lines.push(`## ${status.replace("-", " ").toUpperCase()} (${statusItems.length})`);
          for (const i of statusItems) {
            const severity = i.severity === "critical" ? "🔴" : i.severity === "high" ? "🟠" : i.severity === "medium" ? "🟡" : "🟢";
            lines.push(`- ${severity} **[${i.id}]** ${i.title}`);
            lines.push(`  - ${i.description}`);
            if (i.effortHours) {
              lines.push(`  - Effort: ${i.effortHours}h`);
            }
          }
          lines.push("");
        }
      }

      return lines.join("\n");
    }

    case "summary": {
      const total = items.length;
      const resolved = items.filter((i) => i.status === "resolved").length;
      const inProgress = items.filter((i) => i.status === "in-progress").length;
      const identified = items.filter((i) => i.status === "identified").length;

      const bySeverity = {
        critical: items.filter((i) => i.severity === "critical").length,
        high: items.filter((i) => i.severity === "high").length,
        medium: items.filter((i) => i.severity === "medium").length,
        low: items.filter((i) => i.severity === "low").length,
      };

      const byCategory = items.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalEffort = items
        .filter((i) => i.status !== "resolved")
        .reduce((sum, i) => sum + (i.effortHours || 0), 0);

      const lines: string[] = [
        "# Technical Debt Summary",
        "",
        `**Total items:** ${total}`,
        `**Resolved:** ${resolved} (${total > 0 ? Math.round((resolved / total) * 100) : 0}%)`,
        `**In Progress:** ${inProgress}`,
        `**Identified:** ${identified}`,
        "",
        "### By Severity",
        `- 🔴 Critical: ${bySeverity.critical}`,
        `- 🟠 High: ${bySeverity.high}`,
        `- 🟡 Medium: ${bySeverity.medium}`,
        `- 🟢 Low: ${bySeverity.low}`,
        "",
        "### By Category",
        ...Object.entries(byCategory).map(([cat, count]) => `- ${cat}: ${count}`),
        "",
        `**Total estimated effort:** ${totalEffort}h`,
      ];

      return lines.join("\n");
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ============================================================================
// Execute Functions
// ============================================================================

async function analyzeDebtExecute(args: AnalyzeDebtArgs, ctx: AgentContext): Promise<string> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Technical Debt Analysis">Analyzing code...</dyad-status>`,
  );

  const { files, content } = await scanProject(projectPath);
  const analysis = analyzeTechnicalDebt(files, content, args.categories, args.includeCostEstimation);

  const lines: string[] = [
    "# Technical Debt Analysis Report",
    "",
    `**Total debt items:** ${analysis.totalItems}`,
    `**Estimated total effort:** ${analysis.totalEffortHours}h`,
    `**Monthly maintenance cost:** ~${analysis.monthlyInterestPayment}h/month`,
    "",
  ];

  // Severity breakdown
  lines.push("### By Severity");
  for (const [severity, count] of Object.entries(analysis.severityBreakdown)) {
    if (count > 0) {
      const emoji = severity === "critical" ? "🔴" : severity === "high" ? "🟠" : severity === "medium" ? "🟡" : "🟢";
      lines.push(`- ${emoji} ${severity}: ${count}`);
    }
  }
  lines.push("");

  // Category breakdown
  lines.push("### By Category");
  for (const [category, data] of Object.entries(analysis.categories)) {
    lines.push(`- **${category}**: ${data.count} items (${data.effortHours}h)`);
  }
  lines.push("");

  // Top items
  if (analysis.items.length > 0) {
    lines.push("### Top Debt Items");
    for (const item of analysis.items.slice(0, 15)) {
      const emoji = item.severity === "critical" ? "🔴" : item.severity === "high" ? "🟠" : item.severity === "medium" ? "🟡" : "🟢";
      lines.push(`- ${emoji} **[${item.category}]** ${item.title}`);
      lines.push(`  - ${item.description}`);
      if (item.effortHours && args.includeCostEstimation) {
        lines.push(`  - Est. effort: ${item.effortHours}h`);
      }
    }
  }

  ctx.onXmlComplete(
    `<dyad-status title="Debt Analysis Complete">${analysis.totalItems} items found</dyad-status>`,
  );

  return lines.join("\n");
}

async function prioritizeDebtExecute(args: PrioritizeDebtArgs, ctx: AgentContext): Promise<string> {
  ctx.onXmlStream(
    `<dyad-status title="Debt Prioritization">Calculating priorities...</dyad-status>`,
  );

  const prioritized = prioritizeDebtItems(args.debtItems, args.strategy, args.limit);

  const lines: string[] = [
    "# Technical Debt Prioritization",
    "",
    `**Strategy:** ${args.strategy}`,
    `**Items analyzed:** ${args.debtItems.length}`,
    "",
  ];

  for (const item of prioritized) {
    const rankEmoji = item.rank <= 3 ? "🥇🥈🥉"[item.rank - 1] : "4️⃣";
    lines.push(`## ${rankEmoji} Rank #${item.rank}: ${item.title}`);
    lines.push(`- **Priority Score:** ${item.priorityScore.toFixed(2)}`);
    lines.push(`- **Category:** ${item.category}`);
    lines.push(`- **Severity:** ${item.severity}`);
    if (item.effortHours) {
      lines.push(`- **Effort:** ${item.effortHours}h`);
    }
    lines.push(`- **Description:** ${item.description}`);
    lines.push(`- **Recommendation:** ${item.recommendation}`);
    lines.push("");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Prioritization Complete">Top ${prioritized.length} items ranked</dyad-status>`,
  );

  return lines.join("\n");
}

async function trackDebtExecute(args: TrackDebtArgs, ctx: AgentContext): Promise<string> {
  ctx.onXmlStream(
    `<dyad-status title="Debt Tracking">Processing...</dyad-status>`,
  );

  const result = trackDebt(args.action, args.item, args.itemId, ctx, args.trackingFile);

  ctx.onXmlComplete(
    `<dyad-status title="Debt Tracking Complete">${args.action} completed</dyad-status>`,
  );

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function scanProject(projectPath: string): Promise<{
  files: string[];
  content: Map<string, string>;
}> {
  const files: string[] = [];
  const content = new Map<string, string>();

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
  ]);

  async function scan(dirPath: string, depth: number = 0): Promise<void> {
    if (depth > 5) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || skipDirs.has(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (entry.isDirectory()) {
          await scan(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".ts", ".tsx", ".js", ".jsx", ".md", ".json"].includes(ext)) {
            files.push(relativePath);
            try {
              content.set(relativePath, fs.readFileSync(fullPath, "utf-8"));
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scan(projectPath);
  return { files, content };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const analyzeDebtTool: ToolDefinition<AnalyzeDebtArgs> = {
  name: "analyze_debt",
  description:
    "Analyze technical debt in the codebase including missing tests, code duplication, TODO comments, documentation gaps, dependency issues, and security concerns.",
  inputSchema: AnalyzeDebtArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => analyzeDebtExecute(args, ctx),
};

export const prioritizeDebtTool: ToolDefinition<PrioritizeDebtArgs> = {
  name: "debt_prioritize",
  description:
    "Prioritize technical debt items based on different strategies: impact-first, effort-first, ROI (impact/effort ratio), or critical-path analysis.",
  inputSchema: PrioritizeDebtArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => prioritizeDebtExecute(args, ctx),
};

export const trackDebtTool: ToolDefinition<TrackDebtArgs> = {
  name: "debt_tracking",
  description:
    "Track technical debt over time. Add, update, remove, list, or summarize debt items. Maintains persistent tracking file.",
  inputSchema: TrackDebtArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => trackDebtExecute(args, ctx),
};
