/**
 * Code Reviewer Tool
 * Capabilities 461-480: Automated code review on pull requests
 * - Style consistency checks
 * - Best practice enforcement
 * - Security vulnerability review
 * - Performance review comments
 * - Generate review summaries
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const CodeReviewerArgs = z.object({
  /** The file or directory path to review */
  targetPath: z.string().min(1),
  /** Type of review to perform */
  reviewType: z
    .enum(["full", "security", "style", "performance", "best_practices"])
    .default("full"),
  /** Include security checks */
  checkSecurity: z.boolean().default(true),
  /** Include style checks */
  checkStyle: z.boolean().default(true),
  /** Include performance checks */
  checkPerformance: z.boolean().default(true),
  /** Include best practice checks */
  checkBestPractices: z.boolean().default(true),
  /** Include documentation checks */
  checkDocumentation: z.boolean().default(true),
  /** Generate review summary */
  generateSummary: z.boolean().default(true),
  /** File patterns to include */
  includePatterns: z.array(z.string()).default([
    "*.ts",
    "*.js",
    "*.tsx",
    "*.jsx",
  ]),
  /** File patterns to exclude */
  excludePatterns: z.array(z.string()).default([
    "node_modules/*",
    "dist/*",
    "build/*",
    "*.test.ts",
    "*.spec.ts",
  ]),
});

type CodeReviewerArgs = z.infer<typeof CodeReviewerArgs>;

// ============================================================================
// Types
// ============================================================================

type Severity = "critical" | "high" | "medium" | "low" | "info";

type ReviewCategory =
  | "security"
  | "style"
  | "performance"
  | "best_practices"
  | "documentation"
  | "type_safety"
  | "error_handling";

interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  codeSnippet?: string;
  suggestion: string;
  rule?: string;
}

interface ReviewResult {
  targetPath: string;
  reviewType: string;
  findings: ReviewFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    totalFiles: number;
    totalLines: number;
  };
  reviewTime: number;
  summaryText?: string;
}

// ============================================================================
// Review Rules
// ============================================================================

interface ReviewRule {
  id: string;
  category: ReviewCategory;
  severity: Severity;
  title: string;
  description: string;
  pattern: RegExp;
  suggestion: string;
  rule?: string;
}

const REVIEW_RULES: ReviewRule[] = [
  // Security Rules
  {
    id: "sec-hardcoded-secret",
    category: "security",
    severity: "critical",
    title: "Hardcoded Secret Detected",
    description: "Potential hardcoded API key, password, or secret found",
    pattern: /(?:apiKey|api_key|secret|password|token)\s*[=:]\s*["'][^"']{8,}["']/i,
    suggestion: "Use environment variables or a secrets manager instead",
    rule: "SEC001",
  },
  {
    id: "sec-sql-injection",
    category: "security",
    severity: "critical",
    title: "Potential SQL Injection",
    description: "String concatenation in SQL query could lead to injection",
    pattern: /(?:query|execute|raw)\s*\(\s*[`][^`]*\+/i,
    suggestion: "Use parameterized queries or prepared statements",
    rule: "SEC002",
  },
  {
    id: "sec-xss-risk",
    category: "security",
    severity: "high",
    title: "XSS Risk",
    description: "Direct use of innerHTML could lead to XSS attacks",
    pattern: /\.innerHTML\s*=/,
    suggestion: "Use textContent or sanitize with DOMPurify",
    rule: "SEC003",
  },
  {
    id: "sec-eval-use",
    category: "security",
    severity: "high",
    title: "Use of eval()",
    description: "eval() can execute arbitrary code and is a security risk",
    pattern: /\beval\s*\(/,
    suggestion: "Avoid eval(), use JSON.parse() or safer alternatives",
    rule: "SEC004",
  },
  {
    id: "sec-console-credentials",
    category: "security",
    severity: "high",
    title: "Console Logging Sensitive Data",
    description: "Potential sensitive data being logged to console",
    pattern: /(?:console\.log|logger)\s*\([^)]*(?:password|secret|token|key|credit)/i,
    suggestion: "Remove or mask sensitive data in logs",
    rule: "SEC005",
  },

  // Style Rules
  {
    id: "style-no-var",
    category: "style",
    severity: "medium",
    title: "Use of 'var' Keyword",
    description: "Use 'const' or 'let' instead of 'var'",
    pattern: /\bvar\s+\w+/,
    suggestion: "Use 'const' for values that don't change, 'let' for reassignable values",
    rule: "STY001",
  },
  {
    id: "style-magic-numbers",
    category: "style",
    severity: "low",
    title: "Magic Number",
    description: "Hardcoded numeric literal found",
    pattern: /(?<!\.)\b\d{2,}\b(?!\.\d)/,
    suggestion: "Extract magic numbers to named constants",
    rule: "STY002",
  },
  {
    id: "style-long-line",
    category: "style",
    severity: "low",
    title: "Line Too Long",
    description: "Line exceeds recommended maximum length",
    pattern: /^.{120,}$/m,
    suggestion: "Break long lines into multiple lines (max 120 characters)",
    rule: "STY003",
  },
  {
    id: "style-no-await-loop",
    category: "style",
    severity: "medium",
    title: "Await Inside Loop",
    description: "Using await inside a loop causes sequential execution",
    pattern: /(?:for|while|forEach|map)\s*\([^)]*\)\s*\{[^}]*\bawait\b/,
    suggestion: "Use Promise.all() for parallel execution when possible",
    rule: "STY004",
  },

  // Performance Rules
  {
    id: "perf-inner-loop",
    category: "performance",
    severity: "medium",
    title: "Nested Loop",
    description: "Nested loops detected - consider optimizing",
    pattern: /(?:for|while)\s*\([^)]*\)\s*\{[^}]*(?:for|while)\s*\(/,
    suggestion: "Consider using a hash map or set for O(1) lookups",
    rule: "PERF001",
  },
  {
    id: "perf-regex-in-loop",
    category: "performance",
    severity: "medium",
    title: "Regex in Loop",
    description: "Regex created inside loop - move outside for better performance",
    pattern: /(?:for|while|forEach|map)\s*\([^)]*\)\s*\{[^}]*new\s+RegExp/,
    suggestion: "Create regex outside the loop",
    rule: "PERF002",
  },
  {
    id: "perf-large-array-copy",
    category: "performance",
    severity: "low",
    title: "Inefficient Array Copy",
    description: "Using spread operator on large arrays in hot path",
    pattern: /\[(?:\s*\.\.\.[a-zA-Z_]\w*\s*)\]/,
    suggestion: "Consider using Array.from() or modifying in place",
    rule: "PERF003",
  },

  // Best Practices
  {
    id: "bp-no-error-handling",
    category: "best_practices",
    severity: "high",
    title: "Missing Error Handling",
    description: "Async operation without try-catch",
    pattern: /(?<!\bawait\s)(?:fetch|readFile|query|execute)\s*\([^)]*\)(?!\s*(?:\.catch|try))/,
    suggestion: "Add error handling with try-catch or .catch()",
    rule: "BP001",
  },
  {
    id: "bp-no-type-annotation",
    category: "best_practices",
    severity: "low",
    title: "Missing Type Annotations",
    description: "Function parameter without type annotation in TypeScript",
    pattern: /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|[^=]))\s*=>/,
    suggestion: "Add type annotations for better type safety",
    rule: "BP002",
  },
  {
    id: "bp-empty-catch",
    category: "best_practices",
    severity: "medium",
    title: "Empty Catch Block",
    description: "Empty catch block silently swallows errors",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    suggestion: "At minimum, log the error or add a comment explaining why it's empty",
    rule: "BP003",
  },
  {
    id: "bp-no-comments",
    category: "documentation",
    severity: "low",
    title: "Complex Function Without Comments",
    description: "Function has no comments explaining its purpose",
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{200,}\}/,
    suggestion: "Add JSDoc comments to explain complex logic",
    rule: "DOC001",
  },
  {
    id: "bp-hardcoded-url",
    category: "best_practices",
    severity: "medium",
    title: "Hardcoded URL",
    description: "Hardcoded URL found - consider using configuration",
    pattern: /(?:fetch|axios|http|https)\s*\(\s*["'][^"']+:\/\//,
    suggestion: "Use environment variables or configuration for URLs",
    rule: "BP004",
  },

  // Type Safety
  {
    id: "type-any-usage",
    category: "type_safety",
    severity: "medium",
    title: "Use of 'any' Type",
    description: "Using 'any' type loses type safety",
    pattern: /:\s*any\b/,
    suggestion: "Use specific types or unknown if type is truly unknown",
    rule: "TYPE001",
  },
  {
    id: "type-optional-chaining",
    category: "type_safety",
    severity: "low",
    title: "Use Optional Chaining",
    description: "Potential null/undefined access - use optional chaining",
    pattern: /\w+\.\w+\.\w+(?!\?)/,
    suggestion: "Consider using optional chaining (?.) for safer access",
    rule: "TYPE002",
  },

  // Error Handling
  {
    id: "error-throw-string",
    category: "error_handling",
    severity: "medium",
    title: "Throwing String Instead of Error",
    description: "Throwing a string instead of an Error object",
    pattern: /throw\s+["'][^"']+["']/,
    suggestion: "Throw new Error('message') instead of throw 'message'",
    rule: "ERR001",
  },
];

// ============================================================================
// Review Logic
// ============================================================================

/**
 * Check if a file matches include/exclude patterns
 */
function matchesPatterns(
  filePath: string,
  includePatterns: string[],
  excludePatterns: string[],
): boolean {
  const fileName = path.basename(filePath);

  for (const pattern of excludePatterns) {
    const regex = new RegExp(
      pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
    );
    if (regex.test(filePath) || regex.test(fileName)) {
      return false;
    }
  }

  for (const pattern of includePatterns) {
    const regex = new RegExp(
      pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
    );
    if (regex.test(filePath) || regex.test(fileName)) {
      return true;
    }
  }

  return false;
}

/**
 * Review a single file
 */
async function reviewFile(
  filePath: string,
  options: CodeReviewerArgs,
): Promise<{ findings: ReviewFinding[]; lines: number }> {
  const findings: ReviewFinding[] = [];

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const lines = fileContent.split("\n");

    for (const rule of REVIEW_RULES) {
      // Skip based on options
      if (rule.category === "security" && !options.checkSecurity) continue;
      if (rule.category === "style" && !options.checkStyle) continue;
      if (rule.category === "performance" && !options.checkPerformance) continue;
      if (
        rule.category === "best_practices" &&
        !options.checkBestPractices
      )
        continue;
      if (rule.category === "documentation" && !options.checkDocumentation)
        continue;

      // Skip if review type doesn't match
      if (options.reviewType !== "full") {
        const allowedCategories = mapReviewTypeToCategories(options.reviewType);
        if (!allowedCategories.includes(rule.category)) {
          continue;
        }
      }

      const matches = fileContent.matchAll(new RegExp(rule.pattern, "gi"));

      for (const match of matches) {
        const matchIndex = match.index ?? 0;
        const beforeMatch = fileContent.substring(0, matchIndex);
        const lineNumber = (beforeMatch.match(/\n/g) ?? []).length + 1;

        let codeSnippet: string | undefined;
        if (lineNumber > 0 && lineNumber <= lines.length) {
          const startLine = Math.max(0, lineNumber - 2);
          const endLine = Math.min(lines.length, lineNumber + 2);
          codeSnippet = lines.slice(startLine, endLine).join("\n");
        }

        findings.push({
          id: `${filePath}:${lineNumber}:${rule.id}`,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          filePath,
          lineNumber,
          codeSnippet,
          suggestion: rule.suggestion,
          rule: rule.rule,
        });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return { findings, lines: 0 };
}

/**
 * Map review type to categories
 */
function mapReviewTypeToCategories(
  reviewType: string,
): ReviewCategory[] {
  switch (reviewType) {
    case "security":
      return ["security"];
    case "style":
      return ["style"];
    case "performance":
      return ["performance"];
    case "best_practices":
      return ["best_practices", "type_safety", "error_handling"];
    default:
      return [
        "security",
        "style",
        "performance",
        "best_practices",
        "documentation",
        "type_safety",
        "error_handling",
      ];
  }
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(
  dirPath: string,
  includePatterns: string[],
  excludePatterns: string[],
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!matchesPatterns(fullPath, ["*"], excludePatterns)) {
          const subFiles = await getAllFiles(
            fullPath,
            includePatterns,
            excludePatterns,
          );
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        if (matchesPatterns(fullPath, includePatterns, excludePatterns)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return files;
}

/**
 * Generate summary text
 */
function generateSummaryText(result: ReviewResult): string {
  const totalIssues =
    result.summary.critical +
    result.summary.high +
    result.summary.medium +
    result.summary.low;

  if (totalIssues === 0) {
    return "Great job! No issues found in the code review.";
  }

  let summary = `Code review complete. Found ${totalIssues} issue(s) across ${result.summary.totalFiles} file(s).\n\n`;

  if (result.summary.critical > 0) {
    summary += `- ${result.summary.critical} critical issue(s) require immediate attention.\n`;
  }
  if (result.summary.high > 0) {
    summary += `- ${result.summary.high} high priority issue(s) should be addressed soon.\n`;
  }
  if (result.summary.medium > 0) {
    summary += `- ${result.summary.medium} medium priority issue(s) are recommended to fix.\n`;
  }
  if (result.summary.low > 0) {
    summary += `- ${result.summary.low} low priority issue(s) are suggestions for improvement.\n`;
  }

  return summary;
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateReviewXml(result: ReviewResult): string {
  const lines: string[] = [
    `# Code Review Results`,
    ``,
    `**Target:** ${result.targetPath}`,
    `**Review Type:** ${result.reviewType}`,
    `**Files Reviewed:** ${result.summary.totalFiles}`,
    `**Lines of Code:** ${result.summary.totalLines}`,
    `**Review Time:** ${result.reviewTime}ms`,
    ``,
    `## Summary`,
    ``,
  ];

  if (result.summary.critical > 0) {
    lines.push(`- 🔴 Critical: ${result.summary.critical}`);
  }
  if (result.summary.high > 0) {
    lines.push(`- 🟠 High: ${result.summary.high}`);
  }
  if (result.summary.medium > 0) {
    lines.push(`- 🟡 Medium: ${result.summary.medium}`);
  }
  if (result.summary.low > 0) {
    lines.push(`- 🔵 Low: ${result.summary.low}`);
  }
  if (result.summary.info > 0) {
    lines.push(`- ℹ️ Info: ${result.summary.info}`);
  }

  lines.push(``);

  if (result.summaryText) {
    lines.push(result.summaryText);
    lines.push(``);
  }

  if (result.findings.length === 0) {
    lines.push(`✅ No issues detected!`);
    lines.push(``);
    lines.push(`The code looks clean based on the selected review criteria.`);
  } else {
    lines.push(`## Findings`);
    lines.push(``);

    // Sort by severity
    const severityOrder = ["critical", "high", "medium", "low", "info"] as const;
    const sortedFindings = [...result.findings].sort(
      (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
    );

    for (const finding of sortedFindings) {
      const severityEmoji =
        finding.severity === "critical"
          ? "🔴"
          : finding.severity === "high"
            ? "🟠"
            : finding.severity === "medium"
              ? "🟡"
              : finding.severity === "low"
                ? "🔵"
                : "ℹ️";

      lines.push(
        `### ${severityEmoji} ${finding.title} (${finding.severity.toUpperCase()})`,
      );
      lines.push(``);
      lines.push(`**Category:** ${finding.category}`);
      lines.push(`**File:** ${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ""}`);
      if (finding.rule) {
        lines.push(`**Rule:** ${finding.rule}`);
      }
      lines.push(``);
      lines.push(`**Description:** ${finding.description}`);
      lines.push(``);
      lines.push(`**Suggestion:** ${finding.suggestion}`);
      if (finding.codeSnippet) {
        lines.push(``);
        lines.push("```");
        lines.push(finding.codeSnippet);
        lines.push("```");
      }
      lines.push(``);
      lines.push("---");
      lines.push(``);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const codeReviewerTool: ToolDefinition<CodeReviewerArgs> = {
  name: "code_reviewer",
  description:
    "Performs automated code reviews including style consistency checks, best practice enforcement, security vulnerability review, and performance analysis. Use this to review code changes and generate review summaries.",
  inputSchema: CodeReviewerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Code Reviewer">Reviewing ${args.targetPath}...</dyad-status>`,
    );

    const startTime = Date.now();
    const findings: ReviewFinding[] = [];

    try {
      const stats = await fs.stat(args.targetPath);

      if (stats.isFile()) {
        const { findings: fileFindings, lines } = await reviewFile(
          args.targetPath,
          args,
        );
        findings.push(...fileFindings);

        const result: ReviewResult = {
          targetPath: args.targetPath,
          reviewType: args.reviewType,
          findings,
          summary: {
            critical: findings.filter((f) => f.severity === "critical").length,
            high: findings.filter((f) => f.severity === "high").length,
            medium: findings.filter((f) => f.severity === "medium").length,
            low: findings.filter((f) => f.severity === "low").length,
            info: findings.filter((f) => f.severity === "info").length,
            totalFiles: 1,
            totalLines: lines,
          },
          reviewTime: Date.now() - startTime,
          summaryText: args.generateSummary
            ? generateSummaryText({
                targetPath: args.targetPath,
                reviewType: args.reviewType,
                findings,
                summary: {
                  critical: findings.filter((f) => f.severity === "critical").length,
                  high: findings.filter((f) => f.severity === "high").length,
                  medium: findings.filter((f) => f.severity === "medium").length,
                  low: findings.filter((f) => f.severity === "low").length,
                  info: findings.filter((f) => f.severity === "info").length,
                  totalFiles: 1,
                  totalLines: lines,
                },
                reviewTime: Date.now() - startTime,
              })
            : undefined,
        };

        const report = generateReviewXml(result);

        ctx.onXmlComplete(
          `<dyad-status title="Code Review Complete">Found ${findings.length} issues (${result.summary.critical} critical)</dyad-status>`,
        );

        return report;
      } else if (stats.isDirectory()) {
        const files = await getAllFiles(
          args.targetPath,
          args.includePatterns,
          args.excludePatterns,
        );

        let totalLines = 0;

        for (const file of files) {
          const { findings: fileFindings, lines } = await reviewFile(file, args);
          findings.push(...fileFindings);
          totalLines += lines;
        }

        const result: ReviewResult = {
          targetPath: args.targetPath,
          reviewType: args.reviewType,
          findings,
          summary: {
            critical: findings.filter((f) => f.severity === "critical").length,
            high: findings.filter((f) => f.severity === "high").length,
            medium: findings.filter((f) => f.severity === "medium").length,
            low: findings.filter((f) => f.severity === "low").length,
            info: findings.filter((f) => f.severity === "info").length,
            totalFiles: files.length,
            totalLines,
          },
          reviewTime: Date.now() - startTime,
          summaryText: args.generateSummary
            ? generateSummaryText({
                targetPath: args.targetPath,
                reviewType: args.reviewType,
                findings,
                summary: {
                  critical: findings.filter((f) => f.severity === "critical").length,
                  high: findings.filter((f) => f.severity === "high").length,
                  medium: findings.filter((f) => f.severity === "medium").length,
                  low: findings.filter((f) => f.severity === "low").length,
                  info: findings.filter((f) => f.severity === "info").length,
                  totalFiles: files.length,
                  totalLines,
                },
                reviewTime: Date.now() - startTime,
              })
            : undefined,
        };

        const report = generateReviewXml(result);

        ctx.onXmlComplete(
          `<dyad-status title="Code Review Complete">Found ${findings.length} issues (${result.summary.critical} critical)</dyad-status>`,
        );

        return report;
      }
    } catch (error) {
      throw new Error(
        `Failed to review ${args.targetPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return "No content to review";
  },
};
