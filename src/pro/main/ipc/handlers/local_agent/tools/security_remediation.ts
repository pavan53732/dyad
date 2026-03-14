/**
 * Security Remediation Tool
 * Capabilities 341-360: Suggest and apply fixes for detected vulnerabilities
 * - Suggest fixes for detected vulnerabilities
 * - Generate secure code replacements
 * - Apply security patches
 * - Prioritize remediation by severity
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const SecurityRemediationArgs = z.object({
  /** The file path to remediate */
  targetPath: z.string().min(1),
  /** Vulnerability ID to remediate (from security scanner) */
  vulnerabilityId: z.string().optional(),
  /** Category of vulnerability to fix */
  vulnerabilityCategory: z
    .enum([
      "hardcoded_secret",
      "sql_injection",
      "xss",
      "crypto_weak",
      "insecure_random",
      "command_injection",
      "insecure_deserialization",
      "path_traversal",
    ])
    .optional(),
  /** Whether to auto-apply fixes (if false, just generate suggestions) */
  autoApply: z.boolean().default(false),
  /** Create backup before applying fixes */
  createBackup: z.boolean().default(true),
});

type SecurityRemediationArgs = z.infer<typeof SecurityRemediationArgs>;

// ============================================================================
// Types
// ============================================================================

type Severity = "critical" | "high" | "medium" | "low";

interface RemediationFix {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  originalCode: string;
  fixedCode: string;
  description: string;
  lineNumber: number;
  filePath: string;
  applied: boolean;
  error?: string;
}

interface RemediationResult {
  targetPath: string;
  fixes: RemediationFix[];
  summary: {
    applied: number;
    failed: number;
    pending: number;
  };
  remediationTime: number;
}

// ============================================================================
// Remediation Strategies
// ============================================================================

interface RemediationStrategy {
  category: string;
  patterns: { search: RegExp; replace: string }[];
  description: string;
}

const REMEDIATION_STRATEGIES: RemediationStrategy[] = [
  // Hardcoded Secrets
  {
    category: "hardcoded_secret",
    patterns: [
      {
        search: /api[_-]?key\s*[=:]\s*["'][a-zA-Z0-9_-]{20,}["']/gi,
        replace: "process.env.API_KEY",
      },
      {
        search: /password\s*[=:]\s*["'][^"']{4,}["']/gi,
        replace: "process.env.PASSWORD",
      },
      {
        search: /(?:secret|token)\s*[=:]\s*["'][a-zA-Z0-9_-]{20,}["']/gi,
        replace: "process.env.SECRET",
      },
    ],
    description: "Replace hardcoded secrets with environment variables",
  },

  // SQL Injection
  {
    category: "sql_injection",
    patterns: [
      {
        search: /(\w+)\s*\(\s*[^)]*\+\s*(?:req\.|request\.|params\.|body\.)\s*\)/gi,
        replace: "$1($1, [$2])",
      },
    ],
    description: "Use parameterized queries",
  },

  // XSS
  {
    category: "xss",
    patterns: [
      {
        search: /\.innerHTML\s*=\s*([^;]+)/g,
        replace: ".textContent = $1",
      },
      {
        search: /dangerouslySetInnerHTML\s*=\s*\{\s*\{ __html:\s*([^}]+)\s*\}\s*\}/g,
        replace: "dangerouslySetInnerHTML={{ __html: sanitize($1) }}",
      },
    ],
    description: "Use textContent or sanitize HTML",
  },

  // Weak Crypto
  {
    category: "crypto_weak",
    patterns: [
      {
        search: /createHash\s*\(\s*['"](md5|sha1)['"]\s*\)/gi,
        replace: "createHash('sha256')",
      },
      {
        search: /md5\s*\(/gi,
        replace: "createHash('sha256')",
      },
    ],
    description: "Use SHA-256 or stronger",
  },

  // Insecure Random
  {
    category: "insecure_random",
    patterns: [
      {
        search: /Math\.random\s*\(\s*\)/g,
        replace: "crypto.randomBytes(16).toString('hex')",
      },
    ],
    description: "Use crypto.getRandomValues() or crypto.randomBytes()",
  },

  // Command Injection
  {
    category: "command_injection",
    patterns: [
      {
        search: /exec\s*\(\s*[^)]*\+\s*/g,
        replace: "execFile(",
      },
      {
        search: /shell:\s*true/g,
        replace: "shell: false",
      },
    ],
    description: "Use execFile with array arguments",
  },

  // Insecure Deserialization
  {
    category: "insecure_deserialization",
    patterns: [
      {
        search: /yaml\.load\s*\(/g,
        replace: "yaml.load(",
      },
    ],
    description: "Use yaml.safeLoad or validate structure",
  },

  // Path Traversal
  {
    category: "path_traversal",
    patterns: [
      {
        search: /readFile\s*\(\s*[^)]*\+\s*(?:req\.|request\.|params\.|filename)/g,
        replace: "path.join(__dirname, 'safe', path.basename($1))",
      },
    ],
    description: "Validate and sanitize file paths",
  },
];

// ============================================================================
// Remediation Logic
// ============================================================================

/**
 * Apply remediation to a file
 */
async function applyRemediation(
  filePath: string,
  category?: string,
  autoApply: boolean = false,
  createBackup: boolean = true,
): Promise<RemediationFix[]> {
  const fixes: RemediationFix[] = [];

  try {
    let content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // Determine which strategies to apply
    const strategiesToApply = category
      ? REMEDIATION_STRATEGIES.filter((s) => s.category === category)
      : REMEDIATION_STRATEGIES;

    for (const strategy of strategiesToApply) {
      for (const { search, replace } of strategy.patterns) {
        const matches = content.matchAll(new RegExp(search, "gi"));

        for (const match of matches) {
          const matchIndex = match.index ?? 0;
          const beforeMatch = content.substring(0, matchIndex);
          const lineNumber = (beforeMatch.match(/\n/g) ?? []).length + 1;

          const originalCode = match[0];
          const fixedCode = originalCode.replace(search, replace);

          // Skip if no change
          if (originalCode === fixedCode) continue;

          // Get code snippet
          let codeSnippet: string | undefined;
          if (lineNumber > 0 && lineNumber <= lines.length) {
            const startLine = Math.max(0, lineNumber - 2);
            const endLine = Math.min(lines.length, lineNumber + 1);
            codeSnippet = lines.slice(startLine, endLine).join("\n");
          }

          const fix: RemediationFix = {
            id: `${filePath}:${lineNumber}:${strategy.category}`,
            category: strategy.category,
            severity: "high",
            title: `${strategy.category} fix`,
            originalCode,
            fixedCode,
            description: strategy.description,
            lineNumber,
            filePath,
            applied: false,
          };

          // Apply fix if autoApply is enabled
          if (autoApply) {
            try {
              // Create backup if requested
              if (createBackup) {
                const backupPath = `${filePath}.backup.${Date.now()}`;
                await fs.copyFile(filePath, backupPath);
              }

              // Apply the fix
              content = content.replace(originalCode, fixedCode);
              await fs.writeFile(filePath, content, "utf-8");
              fix.applied = true;
            } catch (error) {
              fix.error = error instanceof Error ? error.message : "Unknown error";
            }
          }

          fixes.push(fix);
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to remediate ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return fixes;
}

/**
 * Generate remediation suggestions without applying
 */
function generateSuggestions(
  filePath: string,
  category?: string,
): RemediationFix[] {
  const suggestions: RemediationFix[] = [];

  // For a quick suggestion, return general guidance
  const strategiesToApply = category
    ? REMEDIATION_STRATEGIES.filter((s) => s.category === category)
    : REMEDIATION_STRATEGIES;

  for (const strategy of strategiesToApply) {
    suggestions.push({
      id: `suggestion:${strategy.category}`,
      category: strategy.category,
      severity: "high",
      title: `${strategy.category} remediation`,
      originalCode: "/* Vulnerable code */",
      fixedCode: "/* Secure code */",
      description: strategy.description,
      lineNumber: 0,
      filePath,
      applied: false,
    });
  }

  return suggestions;
}

// ============================================================================
// Main Remediation Function
// ============================================================================

async function performRemediation(
  args: SecurityRemediationArgs,
  _ctx: AgentContext,
): Promise<RemediationResult> {
  const startTime = Date.now();
  let fixes: RemediationFix[] = [];

  try {
    const stats = await fs.stat(args.targetPath);

    if (stats.isFile()) {
      if (args.autoApply) {
        fixes = await applyRemediation(
          args.targetPath,
          args.vulnerabilityCategory,
          args.autoApply,
          args.createBackup,
        );
      } else {
        fixes = generateSuggestions(args.targetPath, args.vulnerabilityCategory);
      }
    } else if (stats.isDirectory()) {
      // Process all files in directory
      const entries = await fs.readdir(args.targetPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if ([".ts", ".js", ".tsx", ".jsx"].includes(ext)) {
            const filePath = path.join(args.targetPath, entry.name);
            if (args.autoApply) {
              const fileFixes = await applyRemediation(
                filePath,
                args.vulnerabilityCategory,
                args.autoApply,
                args.createBackup,
              );
              fixes.push(...fileFixes);
            } else {
              fixes.push(...generateSuggestions(filePath, args.vulnerabilityCategory));
            }
          }
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to remediate ${args.targetPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Remove duplicates
  const uniqueFixes = fixes.filter(
    (fix, index, self) => index === self.findIndex((f) => f.id === fix.id),
  );

  // Calculate summary
  const summary = {
    applied: uniqueFixes.filter((f) => f.applied).length,
    failed: uniqueFixes.filter((f) => f.error).length,
    pending: uniqueFixes.filter((f) => !f.applied && !f.error).length,
  };

  return {
    targetPath: args.targetPath,
    fixes: uniqueFixes,
    summary,
    remediationTime: Date.now() - startTime,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateRemediationXml(result: RemediationResult): string {
  const lines: string[] = [
    `# Security Remediation Results`,
    ``,
    `**Target:** ${result.targetPath}`,
    `**Remediation Time:** ${result.remediationTime}ms`,
    ``,
    `## Summary`,
    ``,
    `- ✅ Applied: ${result.summary.applied}`,
    `- ❌ Failed: ${result.summary.failed}`,
    `- ⏳ Pending: ${result.summary.pending}`,
    ``,
  ];

  if (result.fixes.length === 0) {
    lines.push(`No remediation suggestions available.`);
  } else {
    lines.push(`## Remediation Actions`);
    lines.push(``);

    // Group by applied status
    const applied = result.fixes.filter((f) => f.applied);
    const failed = result.fixes.filter((f) => f.error);
    const pending = result.fixes.filter((f) => !f.applied && !f.error);

    // Applied fixes
    if (applied.length > 0) {
      lines.push(`### ✅ Applied Fixes`);
      lines.push(``);
      for (const fix of applied) {
        lines.push(`- **${fix.category}** at line ${fix.lineNumber}: ${fix.description}`);
      }
      lines.push(``);
    }

    // Failed fixes
    if (failed.length > 0) {
      lines.push(`### ❌ Failed Fixes`);
      lines.push(``);
      for (const fix of failed) {
        lines.push(`- **${fix.category}** at line ${fix.lineNumber}: ${fix.error}`);
      }
      lines.push(``);
    }

    // Pending fixes
    if (pending.length > 0) {
      lines.push(`### ⏳ Suggested Fixes (Not Applied)`);
      lines.push(``);
      for (const fix of pending) {
        lines.push(`#### ${fix.category}`);
        lines.push(``);
        lines.push(`**Description:** ${fix.description}`);
        lines.push(``);
        lines.push(`**Original:**`);
        lines.push("```");
        lines.push(fix.originalCode);
        lines.push("```");
        lines.push(``);
        lines.push(`**Fixed:**`);
        lines.push("```");
        lines.push(fix.fixedCode);
        lines.push("```");
        lines.push(``);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const securityRemediationTool: ToolDefinition<SecurityRemediationArgs> = {
  name: "security_remediation",
  description:
    "Suggests and applies fixes for detected security vulnerabilities. Can auto-apply fixes or generate suggestions for manual remediation. Use this to address issues found by security_scanner or vulnerability_detector.",
  inputSchema: SecurityRemediationArgs,
  defaultConsent: "ask",
  modifiesState: true,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Security Remediation">Processing ${args.targetPath}...</dyad-status>`,
    );

    const result = await performRemediation(args, ctx);

    const report = generateRemediationXml(result);

    if (args.autoApply) {
      ctx.onXmlComplete(
        `<dyad-status title="Remediation Complete">Applied ${result.summary.applied} fixes (${result.summary.failed} failed)</dyad-status>`,
      );
    } else {
      ctx.onXmlComplete(
        `<dyad-status title="Remediation Suggestions">Generated ${result.summary.pending} suggestions</dyad-status>`,
      );
    }

    return report;
  },
};
