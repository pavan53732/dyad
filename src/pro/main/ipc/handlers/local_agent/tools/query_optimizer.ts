/**
 * Query Optimizer Tool
 * Capabilities 421-440: Database query analysis and optimization
 * - Analyze database queries
 * - Detect N+1 query patterns
 * - Suggest query optimizations
 * - Analyze index usage
 * - Optimize data fetching patterns
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const QueryOptimizerArgs = z.object({
  /** The file path to analyze */
  targetPath: z.string().optional(),
  /** The code content to analyze directly */
  code: z.string().optional(),
  /** Whether to detect N+1 patterns */
  detectNPlusOne: z.boolean().default(true),
  /** Whether to analyze index usage */
  analyzeIndexes: z.boolean().default(true),
  /** Whether to suggest query optimizations */
  suggestOptimizations: z.boolean().default(true),
  /** Whether to analyze ORM patterns */
  analyzeORM: z.boolean().default(true),
});

type QueryOptimizerArgs = z.infer<typeof QueryOptimizerArgs>;

// ============================================================================
// Types
// ============================================================================

/** Query issue type */
type QueryIssueType =
  | "n_plus_one"
  | "missing_index"
  | "full_table_scan"
  | "inefficient_join"
  | "select_star"
  | "missing_limit"
  | "unoptimized_where"
  | "redundant_query";

/** Severity of the issue */
type IssueSeverity = "critical" | "high" | "medium" | "low";

/** A detected query issue */
interface QueryIssue {
  type: QueryIssueType;
  severity: IssueSeverity;
  description: string;
  location?: string;
  lineNumber?: number;
  query?: string;
  suggestion?: string;
  estimatedImpact?: string;
}

/** N+1 pattern detection */
interface NPlusOneDetection {
  occurrences: {
    pattern: string;
    location: string;
    lineNumber: number;
    suggestedFix: string;
  }[];
  severity: "critical" | "high" | "medium";
}

/** Index analysis */
interface IndexAnalysis {
  missingIndexes: string[];
  unusedIndexes: string[];
  suggestions: string[];
}

/** Query optimization suggestion */
interface QueryOptimization {
  type: string;
  description: string;
  original: string;
  optimized: string;
  benefit: string;
}

/** ORM pattern analysis */
interface ORMPatternAnalysis {
  patterns: string[];
  issues: string[];
  improvements: string[];
}

/** Complete query optimization result */
interface QueryOptimizationResult {
  fileName: string;
  analysis: {
    issues: QueryIssue[];
    nPlusOne: NPlusOneDetection;
    indexes: IndexAnalysis;
    optimizations: QueryOptimization[];
    ormPatterns: ORMPatternAnalysis;
  };
  summary: string;
}

// ============================================================================
// Analysis Logic
// ============================================================================

/** Detect N+1 query patterns */
function detectNPlusOnePatterns(code: string): NPlusOneDetection {
  const occurrences: NPlusOneDetection["occurrences"] = [];
  const lines = code.split("\n");

  // Common ORM patterns that cause N+1
  const nPlusOnePatterns = [
    // Loop with query inside
    { pattern: /for\s*\([^)]*\)\s*\{[^}]*\.find\(/, type: "loop with .find()" },
    { pattern: /for\s*\([^)]*\)\s*\{[^}]*\.get\(/, type: "loop with .get()" },
    { pattern: /for\s*\([^)]*\)\s*\{[^}]*await.*\./, type: "loop with await query" },
    // map with query
    { pattern: /\.map\([^)]*=>[^}]*\.find\(/, type: "map with .find()" },
    { pattern: /\.map\([^)]*=>[^}]*await/, type: "map with await query" },
    // forEach with query
    { pattern: /\.forEach\([^)]*=>[^}]*\.find\(/, type: "forEach with .find()" },
    { pattern: /\.forEach\([^)]*=>[^}]*await/, type: "forEach with await" },
  ];

  let severity: NPlusOneDetection["severity"] = "medium";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const { pattern, type } of nPlusOnePatterns) {
      if (pattern.test(line)) {
        occurrences.push({
          pattern: type,
          location: `Line ${lineNumber}: ${line.trim()}`,
          lineNumber,
          suggestedFix: "Use batch query (.whereIn) or eager loading instead",
        });
        severity = "high";
      }
    }
  }

  // Check for common Supabase/Drizzle patterns that could be N+1
  if (code.includes(".eq(") && code.includes("forEach")) {
    occurrences.push({
      pattern: "Supabase .eq() in loop",
      location: "Detected filter operation inside iteration",
      lineNumber: 0,
      suggestedFix: "Collect all IDs and use .in() or .any() for batch filtering",
    });
    severity = "critical";
  }

  return { occurrences, severity };
}

/** Analyze index usage */
function performIndexAnalysis(code: string): IndexAnalysis {
  const missingIndexes: string[] = [];
  const unusedIndexes: string[] = [];
  const suggestions: string[] = [];

  // Detect columns used in WHERE but might lack indexes
  const whereColumns = code.match(/\.eq\(['"](\w+)['"]\)/g) || [];
  const whereInColumns = code.match(/\.in\(['"](\w+)['"]\)/g) || [];
  const orderByColumns = code.match(/\.order\(['"](\w+)['"]/g) || [];

  const allColumns = [...whereColumns, ...whereInColumns, ...orderByColumns];
  const uniqueColumns = [...new Set(allColumns.map((c) => c.match(/['"](\w+)['"]/)?.[1] || ""))];

  // Check for foreign key patterns
  if (code.includes("_id") || code.includes("Id")) {
    const hasForeignKeyIndex = code.includes("index") || code.includes("Index");
    if (!hasForeignKeyIndex) {
      missingIndexes.push("Foreign key columns may need indexes for join performance");
    }
  }

  // Detect LIKE queries that might need indexes
  if (code.includes(".like(") || code.includes(".ilike(")) {
    suggestions.push("Consider full-text search indexes for text search operations");
  }

  // Check for ORDER BY without index
  if (code.includes(".order(") && !code.includes("index")) {
    suggestions.push("ORDER BY columns may benefit from indexes");
  }

  // Check for range queries
  if (code.includes(".gt(") || code.includes(".lt(") || code.includes(".gte(") || code.includes(".lte(")) {
    suggestions.push("Range queries on large tables may need indexes");
  }

  return { missingIndexes, unusedIndexes, suggestions };
}

/** Detect common query issues */
function detectQueryIssues(code: string): QueryIssue[] {
  const issues: QueryIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for SELECT *
    if (/\.select\(['"]\*['"]\)/.test(line)) {
      issues.push({
        type: "select_star",
        severity: "medium",
        description: "Using SELECT * - specify columns for better performance",
        lineNumber,
        suggestion: "Select only needed columns: .select('id', 'name', 'email')",
        estimatedImpact: "20-30% reduction in data transfer",
      });
    }

    // Check for missing LIMIT
    if (/\.(findMany|all|get)\(/.test(line) && !line.includes("limit") && !line.includes("range")) {
      issues.push({
        type: "missing_limit",
        severity: "high",
        description: "Query without LIMIT - could return unbounded results",
        lineNumber,
        suggestion: "Add .limit() to prevent excessive result sets",
        estimatedImpact: "Prevents potential OOM on large tables",
      });
    }

    // Check for multiple sequential queries
    if (line.includes("await") && (line.includes(".findFirst") || line.includes(".findUnique"))) {
      const prevLines = lines.slice(Math.max(0, i - 5), i);
      if (prevLines.some((l) => l.includes("await") && (l.includes(".find") || l.includes(".get")))) {
        issues.push({
          type: "redundant_query",
          severity: "medium",
          description: "Sequential queries detected - could be combined",
          lineNumber,
          suggestion: "Consider using .whereIn() or batch queries",
          estimatedImpact: "N queries → 1 query",
        });
      }
    }
  }

  // Check for inefficient joins
  if (code.includes(".join(") && code.includes("forEach")) {
    issues.push({
      type: "inefficient_join",
      severity: "high",
      description: "Join inside loop - N+1 pattern with joins",
      suggestion: "Use eager loading or batch queries instead",
      estimatedImpact: "N+1 queries → 1 query",
    });
  }

  return issues;
}

/** Suggest query optimizations */
function suggestQueryOptimizations(code: string): QueryOptimization[] {
  const optimizations: QueryOptimization[] = [];

  // Check for pagination
  if (!code.includes("range") && !code.includes("limit") && !code.includes("offset")) {
    optimizations.push({
      type: "Pagination",
      description: "Add pagination to prevent loading all records",
      original: "const items = await db.query.findMany()",
      optimized: `const { data, count } = await db.query.findMany({
  range: [0, 100] // or use pagination library
})`,
      benefit: "Reduce initial load time and memory usage",
    });
  }

  // Check for missing eager loading
  if (code.includes(".include(") || code.includes(".with(")) {
    // Already using eager loading
  } else if (code.includes("relations") || code.includes("join")) {
    optimizations.push({
      type: "Eager Loading",
      description: "Use eager loading to prevent N+1 queries",
      original: "const posts = await db.posts.findMany()\n// then: posts.map(p => p.author)",
      optimized: "const posts = await db.posts.findMany({ include: { author: true } })",
      benefit: "2 queries instead of N+1",
    });
  }

  // Check for filtering
  if (code.includes("filter(") && !code.includes("where")) {
    optimizations.push({
      type: "Server-side Filtering",
      description: "Move filtering to database instead of in-memory",
      original: "const items = (await db.query.findMany()).filter(...)",
      optimized: "const items = await db.query.findMany({ where: { ... } })",
      benefit: "Reduce data transfer and leverage database indexes",
    });
  }

  // Check for sorting
  if (code.includes(".sort(") && !code.includes(".order(")) {
    optimizations.push({
      type: "Server-side Sorting",
      description: "Move sorting to database instead of in-memory",
      optimized: "const items = await db.query.findMany({ orderBy: { createdAt: 'desc' } })",
      original: "const items = (await db.query.findMany()).sort(...)",
      benefit: "Leverage database indexes and reduce memory usage",
    });
  }

  // Check for select specific columns
  if (!code.includes(".select(") && (code.includes("findMany") || code.includes("findAll"))) {
    optimizations.push({
      type: "Column Selection",
      description: "Select only needed columns",
      original: "const items = await db.items.findMany()",
      optimized: "const items = await db.items.findMany({ select: { id: true, name: true } })",
      benefit: "Reduce data transfer by 50-90%",
    });
  }

  return optimizations;
}

/** Analyze ORM patterns */
function analyzeORMPatterns(code: string): ORMPatternAnalysis {
  const patterns: string[] = [];
  const issues: string[] = [];
  const improvements: string[] = [];

  // Detect ORM type
  if (code.includes("prisma.")) {
    patterns.push("Prisma ORM detected");
  } else if (code.includes("drizzle") || code.includes("db.")) {
    patterns.push("Drizzle ORM detected");
  } else if (code.includes("supabase")) {
    patterns.push("Supabase client detected");
  } else if (code.includes("knex") || code.includes("knex(")) {
    patterns.push("Knex.js detected");
  }

  // Check for proper transaction usage
  if (code.includes("transaction") || code.includes("Transaction")) {
    patterns.push("Using transactions");
  }

  // Check for error handling on queries
  if (code.includes("await") && !code.includes("try") && !code.includes("catch")) {
    issues.push("Queries without try/catch - add error handling");
  }

  // Check for proper error handling patterns
  if (code.includes(".catch(") || code.includes("try")) {
    improvements.push("Good: Error handling detected on database operations");
  }

  // Check for connection pooling
  if (!code.includes("pool") && !code.includes("Pool")) {
    issues.push("No explicit connection pooling configuration detected");
    improvements.push("Configure connection pooling for better concurrent performance");
  }

  return { patterns, issues, improvements };
}

// ============================================================================
// Main Analysis Function
// ============================================================================

async function analyzeQueries(
  args: QueryOptimizerArgs,
  _ctx: AgentContext,
): Promise<QueryOptimizationResult> {
  const { targetPath, code, detectNPlusOne, analyzeIndexes, suggestOptimizations, analyzeORM } = args;

  let codeToAnalyze = code || "";
  let fileName = "inline code";

  if (targetPath) {
    try {
      codeToAnalyze = await fs.readFile(targetPath, "utf-8");
      fileName = path.basename(targetPath);
    } catch {
      return {
        fileName: targetPath,
        analysis: {
          issues: [{
            type: "n_plus_one",
            severity: "critical",
            description: `Could not read file: ${targetPath}`,
          }],
          nPlusOne: { occurrences: [], severity: "medium" },
          indexes: { missingIndexes: [], unusedIndexes: [], suggestions: [] },
          optimizations: [],
          ormPatterns: { patterns: [], issues: [], improvements: [] },
        },
        summary: "Error: Could not read the specified file",
      };
    }
  }

  const issues: QueryIssue[] = [];

  // Run analyses
  let nPlusOne: NPlusOneDetection = { occurrences: [], severity: "medium" };
  if (detectNPlusOne) {
    nPlusOne = detectNPlusOnePatterns(codeToAnalyze);
    
    for (const occ of nPlusOne.occurrences) {
      issues.push({
        type: "n_plus_one",
        severity: nPlusOne.severity === "critical" ? "critical" : "high",
        description: `N+1 pattern: ${occ.pattern}`,
        lineNumber: occ.lineNumber,
        location: occ.location,
        suggestion: occ.suggestedFix,
        estimatedImpact: "N queries → 1 query",
      });
    }
  }

  let indexes: IndexAnalysis = { missingIndexes: [], unusedIndexes: [], suggestions: [] };
  if (analyzeIndexes) {
    indexes = performIndexAnalysis(codeToAnalyze);
    
    for (const idx of indexes.missingIndexes) {
      issues.push({
        type: "missing_index",
        severity: "medium",
        description: idx,
        suggestion: "Add appropriate index for better query performance",
      });
    }
  }

  issues.push(...detectQueryIssues(codeToAnalyze));

  let optimizations: QueryOptimization[] = [];
  if (suggestOptimizations) {
    optimizations = suggestQueryOptimizations(codeToAnalyze);
  }

  let ormPatterns: ORMPatternAnalysis = { patterns: [], issues: [], improvements: [] };
  if (analyzeORM) {
    ormPatterns = analyzeORMPatterns(codeToAnalyze);
  }

  // Generate summary
  let summary = "";
  const critical = issues.filter((i) => i.severity === "critical").length;
  const high = issues.filter((i) => i.severity === "high").length;

  if (critical > 0 || high > 0) {
    summary = `Found ${critical + high} critical/high priority query issues`;
  } else if (nPlusOne.occurrences.length > 0) {
    summary = `Found ${nPlusOne.occurrences.length} N+1 query patterns`;
  } else if (issues.length > 0) {
    summary = `Found ${issues.length} query optimization opportunities`;
  } else {
    summary = "No significant query issues detected";
  }

  return {
    fileName,
    analysis: {
      issues,
      nPlusOne,
      indexes,
      optimizations,
      ormPatterns,
    },
    summary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateQueryXml(result: QueryOptimizationResult): string {
  const lines: string[] = [
    `# Query Optimizer Report`,
    ``,
    `**File:** ${result.fileName}`,
    `**Summary:** ${result.summary}`,
    ``,
  ];

  const { issues, nPlusOne, indexes, optimizations, ormPatterns } = result.analysis;

  // N+1 patterns
  if (nPlusOne.occurrences.length > 0) {
    lines.push(`## 🚨 N+1 Query Patterns (${nPlusOne.occurrences.length})`);
    lines.push(`**Severity:** ${nPlusOne.severity.toUpperCase()}`);
    lines.push(``);
    
    for (const occ of nPlusOne.occurrences) {
      lines.push(`### ${occ.pattern}`);
      lines.push(`- Location: ${occ.location}`);
      lines.push(`- Fix: ${occ.suggestedFix}`);
      lines.push(``);
    }
  }

  // Issues by severity
  const otherIssues = issues.filter((i) => i.type !== "n_plus_one");
  if (otherIssues.length > 0) {
    lines.push(`## Query Issues (${otherIssues.length})`);
    const critical = otherIssues.filter((i) => i.severity === "critical");
    const high = otherIssues.filter((i) => i.severity === "high");
    const medium = otherIssues.filter((i) => i.severity === "medium");

    if (critical.length > 0) {
      lines.push(`### 🔴 Critical`);
      for (const issue of critical) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.suggestion) lines.push(`  → ${issue.suggestion}`);
      }
      lines.push(``);
    }
    if (high.length > 0) {
      lines.push(`### 🟠 High`);
      for (const issue of high) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.suggestion) lines.push(`  → ${issue.suggestion}`);
        if (issue.estimatedImpact) lines.push(`  → Impact: ${issue.estimatedImpact}`);
      }
      lines.push(``);
    }
    if (medium.length > 0) {
      lines.push(`### 🟡 Medium`);
      for (const issue of medium) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
      }
      lines.push(``);
    }
  }

  // Index analysis
  if (indexes.suggestions.length > 0) {
    lines.push(`## Index Analysis`);
    if (indexes.missingIndexes.length > 0) {
      lines.push(`### Missing Indexes`);
      for (const idx of indexes.missingIndexes) {
        lines.push(`- ${idx}`);
      }
    }
    if (indexes.suggestions.length > 0) {
      lines.push(`### Suggestions`);
      for (const sug of indexes.suggestions) {
        lines.push(`- ${sug}`);
      }
    }
    lines.push(``);
  }

  // Query optimizations
  if (optimizations.length > 0) {
    lines.push(`## Query Optimizations`);
    for (const opt of optimizations) {
      lines.push(`### ${opt.type}`);
      lines.push(`- **Description:** ${opt.description}`);
      lines.push(`- **Benefit:** ${opt.benefit}`);
      lines.push(`- **Before:** \`${opt.original}\``);
      lines.push(`- **After:** ${opt.optimized.replace(/\n/g, "\n  ")}`);
      lines.push(``);
    }
  }

  // ORM patterns
  if (ormPatterns.patterns.length > 0 || ormPatterns.issues.length > 0) {
    lines.push(`## ORM Analysis`);
    if (ormPatterns.patterns.length > 0) {
      lines.push(`### Detected Patterns`);
      for (const p of ormPatterns.patterns) {
        lines.push(`- ${p}`);
      }
    }
    if (ormPatterns.issues.length > 0) {
      lines.push(`### Issues`);
      for (const issue of ormPatterns.issues) {
        lines.push(`- ${issue}`);
      }
    }
    if (ormPatterns.improvements.length > 0) {
      lines.push(`### Improvements`);
      for (const imp of ormPatterns.improvements) {
        lines.push(`- ${imp}`);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const queryOptimizerTool: ToolDefinition<QueryOptimizerArgs> = {
  name: "query_optimizer",
  description:
    "Analyzes database queries for performance issues. Detects N+1 query patterns, missing indexes, inefficient queries, and suggests optimizations. Use this to improve database performance and reduce query latency.",
  inputSchema: QueryOptimizerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Query Optimizer">Analyzing database queries...</dyad-status>`,
    );

    const result = await analyzeQueries(args, ctx);

    const report = generateQueryXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Query Analysis Complete">${result.summary}</dyad-status>`,
    );

    return report;
  },
};
