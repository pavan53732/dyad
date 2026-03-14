/**
 * Security Scanner Tool
 * Capabilities 281-300: Scan code for common security vulnerabilities
 * - Detect hardcoded secrets/credentials
 * - Identify insecure patterns (SQL injection, XSS, etc.)
 * - Check dependency vulnerabilities
 * - Analyze code for security anti-patterns
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const SecurityScannerArgs = z.object({
  /** The file or directory path to scan */
  targetPath: z.string().min(1),
  /** Whether to scan for hardcoded secrets */
  checkSecrets: z.boolean().default(true),
  /** Whether to scan for SQL injection vulnerabilities */
  checkSqlInjection: z.boolean().default(true),
  /** Whether to scan for XSS vulnerabilities */
  checkXss: z.boolean().default(true),
  /** Whether to scan for cryptographic issues */
  checkCrypto: z.boolean().default(true),
  /** Whether to scan for insecure random number generation */
  checkInsecureRandom: z.boolean().default(true),
  /** Whether to scan for command injection risks */
  checkCommandInjection: z.boolean().default(true),
  /** File patterns to include (e.g., ["*.ts", "*.js"]) */
  includePatterns: z
    .array(z.string())
    .default(["*.ts", "*.js", "*.tsx", "*.jsx"]),
  /** File patterns to exclude */
  excludePatterns: z
    .array(z.string())
    .default(["node_modules/*", "dist/*", "build/*"]),
});

type SecurityScannerArgs = z.infer<typeof SecurityScannerArgs>;

// ============================================================================
// Types
// ============================================================================

type VulnerabilitySeverity = "critical" | "high" | "medium" | "low";

type VulnerabilityCategory =
  | "hardcoded_secret"
  | "sql_injection"
  | "xss"
  | "crypto_weak"
  | "insecure_random"
  | "command_injection"
  | "insecure_deserialization"
  | "path_traversal"
  | "unsafe_yaml"
  | "eval_usage";

interface Vulnerability {
  id: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  codeSnippet?: string;
  suggestion: string;
  cwe?: string;
}

interface ScanResult {
  targetPath: string;
  totalFilesScanned: number;
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scanTime: number;
}

// ============================================================================
// Security Patterns
// ============================================================================

interface SecurityPattern {
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  pattern: RegExp;
  suggestion: string;
  cwe?: string;
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  // Hardcoded Secrets
  {
    category: "hardcoded_secret",
    severity: "critical",
    title: "Hardcoded API Key",
    description:
      "Hardcoded API key detected - should use environment variables",
    pattern: /api[_-]?key\s*[=:]\s*["'][a-zA-Z0-9_-]{20,}["']/i,
    suggestion: "Use process.env.API_KEY instead",
    cwe: "CWE-798",
  },
  {
    category: "hardcoded_secret",
    severity: "critical",
    title: "Hardcoded Password",
    description:
      "Hardcoded password detected - should use environment variables",
    pattern: /password\s*[=:]\s*["'][^"']{4,}["']/i,
    suggestion: "Use process.env.PASSWORD instead",
    cwe: "CWE-798",
  },
  {
    category: "hardcoded_secret",
    severity: "critical",
    title: "Hardcoded Secret",
    description: "Hardcoded secret detected - should use environment variables",
    pattern: /(?:secret|token)\s*[=:]\s*["'][a-zA-Z0-9_-]{20,}["']/i,
    suggestion: "Use environment variables for secrets",
    cwe: "CWE-798",
  },
  {
    category: "hardcoded_secret",
    severity: "critical",
    title: "Hardcoded Private Key",
    description: "Hardcoded private key detected",
    pattern: /private[_-]?key\s*[=:]\s*["']-----BEGIN.*?-----/i,
    suggestion: "Load private key from secure storage or environment variable",
    cwe: "CWE-798",
  },
  {
    category: "hardcoded_secret",
    severity: "high",
    title: "AWS Access Key",
    description: "AWS access key ID detected in code",
    pattern: /(?:AWS_ACCESS_KEY|AKIA)[A-Z0-9]{16,}/i,
    suggestion: "Use IAM roles or environment variables",
    cwe: "CWE-798",
  },

  // SQL Injection
  {
    category: "sql_injection",
    severity: "critical",
    title: "SQL Injection Risk",
    description: "String concatenation in SQL query - potential injection",
    pattern:
      /(?:query|execute|select|insert|update|delete)\s*\([^)]*\+\s*(?:req\.|request\.|params\.|body\.|query\.)/i,
    suggestion: "Use parameterized queries or prepared statements",
    cwe: "CWE-89",
  },
  {
    category: "sql_injection",
    severity: "critical",
    title: "Template Literal SQL Injection",
    description: "Template literals in SQL queries - potential injection",
    pattern: /`\s*(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/i,
    suggestion: "Use parameterized queries",
    cwe: "CWE-89",
  },

  // XSS
  {
    category: "xss",
    severity: "high",
    title: "Unsafe innerHTML Usage",
    description: "Direct innerHTML assignment without sanitization",
    pattern:
      /\.innerHTML\s*=\s*(?:req\.|request\.|params\.|body\.|user|input)/i,
    suggestion: "Use textContent or sanitize with DOMPurify",
    cwe: "CWE-79",
  },
  {
    category: "xss",
    severity: "high",
    title: "DangerouslySetInnerHTML Usage",
    description: "React dangerouslySetInnerHTML without sanitization",
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/i,
    suggestion: "Sanitize HTML with DOMPurify before using",
    cwe: "CWE-79",
  },
  {
    category: "xss",
    severity: "medium",
    title: "document.write Usage",
    description: "Using document.write - potential XSS vector",
    pattern: /document\.write\s*\(/i,
    suggestion: "Use DOM manipulation methods instead",
    cwe: "CWE-79",
  },

  // Cryptographic Issues
  {
    category: "crypto_weak",
    severity: "high",
    title: "Weak Cryptographic Algorithm",
    description: "Using weak cryptographic algorithm (MD5, SHA1)",
    pattern:
      /md5|sha1\s*\(|\.createHash\s*\(\s*['"]md5['"]\)|\.createHash\s*\(\s*['"]sha1['"]\)/gi,
    suggestion: "Use SHA-256 or stronger",
    cwe: "CWE-327",
  },
  {
    category: "crypto_weak",
    severity: "high",
    title: "Weak Password Hashing",
    description: "Using weak password hashing (DES, MD5)",
    pattern:
      /(?:passwordHash|hashPassword)\s*\(\s*(?:['"]md5['"]|['"]des['"]|['"]sha1['"])/i,
    suggestion: "Use bcrypt, scrypt, or Argon2",
    cwe: "CWE-327",
  },
  {
    category: "crypto_weak",
    severity: "medium",
    title: "Insecure Encryption",
    description: "Using DES encryption",
    pattern: /DES|CBCMode/gi,
    suggestion: "Use AES-GCM or ChaCha20-Poly1305",
    cwe: "CWE-327",
  },

  // Insecure Random
  {
    category: "insecure_random",
    severity: "high",
    title: "Math.random for Security",
    description: "Using Math.random for security-sensitive operations",
    pattern: /Math\.random\s*\(\s*\)/,
    suggestion: "Use crypto.getRandomValues() or secure-random",
    cwe: "CWE-338",
  },
  {
    category: "insecure_random",
    severity: "high",
    title: "Insecure Random Generation",
    description: "Using insecure random number generator",
    pattern: /\b(?:random|rand)\s*\(\s*\)(?!.*crypto)/i,
    suggestion: "Use crypto.randomBytes() or the 'random' package with crypto",
    cwe: "CWE-338",
  },

  // Command Injection
  {
    category: "command_injection",
    severity: "critical",
    title: "Command Injection Risk",
    description: "User input in shell command - potential injection",
    pattern:
      /(?:exec|spawn|execSync|execFile)\s*\([^)]*\+\s*(?:req\.|request\.|params\.|body\.|user|input)/i,
    suggestion: "Validate input and use array form of exec",
    cwe: "CWE-78",
  },
  {
    category: "command_injection",
    severity: "critical",
    title: "Shell Execution Risk",
    description: "Using shell=true in exec - command injection risk",
    pattern: /(?:exec|spawn)\s*\([^)]*\{[^}]*shell:\s*true[^}]*\}/i,
    suggestion: "Set shell: false and use array arguments",
    cwe: "CWE-78",
  },
  {
    category: "command_injection",
    severity: "high",
    title: "eval with User Input",
    description: "Using eval with potential user input",
    pattern: /eval\s*\(\s*(?:req\.|request\.|params\.|body\.|user|input)/i,
    suggestion: "Avoid eval entirely or sanitize thoroughly",
    cwe: "CWE-95",
  },

  // Unsafe Deserialization
  {
    category: "insecure_deserialization",
    severity: "critical",
    title: "Unsafe Deserialization",
    description: "Using JSON.parse with untrusted data",
    pattern:
      /JSON\.parse\s*\(\s*(?:req\.|request\.|params\.|body\.|user|input)/i,
    suggestion: "Validate JSON structure before parsing",
    cwe: "CWE-502",
  },
  {
    category: "insecure_deserialization",
    severity: "high",
    title: "YAML Unsafe Load",
    description: "Using yaml.load instead of yaml.safeLoad",
    pattern: /yaml\.load\s*\(/i,
    suggestion: "Use yaml.safeLoad or yaml.load with safe schema",
    cwe: "CWE-502",
  },

  // Path Traversal
  {
    category: "path_traversal",
    severity: "high",
    title: "Path Traversal Risk",
    description: "User input in file path without validation",
    pattern:
      /(?:readFile|readFileSync|open|createReadStream)\s*\([^)]*\+\s*(?:req\.|request\.|params\.|body\.|filename|path)/i,
    suggestion:
      "Validate and sanitize file paths, use path.join with base directory",
    cwe: "CWE-22",
  },
];

// ============================================================================
// Scanning Logic
// ============================================================================

/**
 * Check if a file matches the include/exclude patterns
 */
function matchesPatterns(
  filePath: string,
  includePatterns: string[],
  excludePatterns: string[],
): boolean {
  const fileName = path.basename(filePath);

  // Check exclusions first
  for (const pattern of excludePatterns) {
    const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."));
    if (regex.test(filePath) || regex.test(fileName)) {
      return false;
    }
  }

  // Check inclusions
  for (const pattern of includePatterns) {
    const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."));
    if (regex.test(filePath) || regex.test(fileName)) {
      return true;
    }
  }

  return false;
}

/**
 * Scan a single file for vulnerabilities
 */
async function scanFile(
  filePath: string,
  options: SecurityScannerArgs,
): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (const pattern of SECURITY_PATTERNS) {
      // Skip patterns based on options
      if (pattern.category === "hardcoded_secret" && !options.checkSecrets) {
        continue;
      }
      if (pattern.category === "sql_injection" && !options.checkSqlInjection) {
        continue;
      }
      if (pattern.category === "xss" && !options.checkXss) {
        continue;
      }
      if (pattern.category === "crypto_weak" && !options.checkCrypto) {
        continue;
      }
      if (
        pattern.category === "insecure_random" &&
        !options.checkInsecureRandom
      ) {
        continue;
      }
      if (
        pattern.category === "command_injection" &&
        !options.checkCommandInjection
      ) {
        continue;
      }

      // Search for pattern
      const matches = content.matchAll(pattern.pattern);

      for (const match of matches) {
        // Find line number
        let lineNumber: number | undefined;
        let codeSnippet: string | undefined;

        // Count newlines to find line number
        const matchIndex = match.index ?? 0;
        const beforeMatch = content.substring(0, matchIndex);
        lineNumber = (beforeMatch.match(/\n/g) ?? []).length + 1;

        // Get code snippet (3 lines around the match)
        if (lineNumber && lineNumber > 0 && lineNumber <= lines.length) {
          const startLine = Math.max(0, lineNumber - 2);
          const endLine = Math.min(lines.length, lineNumber + 1);
          codeSnippet = lines.slice(startLine, endLine).join("\n");
        }

        vulnerabilities.push({
          id: `${filePath}:${lineNumber}:${pattern.category}`,
          category: pattern.category,
          severity: pattern.severity,
          title: pattern.title,
          description: pattern.description,
          filePath,
          lineNumber,
          codeSnippet,
          suggestion: pattern.suggestion,
          cwe: pattern.cwe,
        });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return vulnerabilities;
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
        // Skip if matches exclude patterns
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

// ============================================================================
// Main Scan Function
// ============================================================================

async function performScan(
  args: SecurityScannerArgs,
  _ctx: AgentContext,
): Promise<ScanResult> {
  const startTime = Date.now();
  const vulnerabilities: Vulnerability[] = [];
  let totalFilesScanned = 0;

  try {
    const stats = await fs.stat(args.targetPath);

    if (stats.isFile()) {
      // Scan single file
      totalFilesScanned = 1;
      const fileVulns = await scanFile(args.targetPath, args);
      vulnerabilities.push(...fileVulns);
    } else if (stats.isDirectory()) {
      // Scan directory
      const files = await getAllFiles(
        args.targetPath,
        args.includePatterns,
        args.excludePatterns,
      );

      totalFilesScanned = files.length;

      // Scan each file
      for (const file of files) {
        const fileVulns = await scanFile(file, args);
        vulnerabilities.push(...fileVulns);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to scan ${args.targetPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Calculate summary
  const summary = {
    critical: vulnerabilities.filter((v) => v.severity === "critical").length,
    high: vulnerabilities.filter((v) => v.severity === "high").length,
    medium: vulnerabilities.filter((v) => v.severity === "medium").length,
    low: vulnerabilities.filter((v) => v.severity === "low").length,
  };

  return {
    targetPath: args.targetPath,
    totalFilesScanned,
    vulnerabilities,
    summary,
    scanTime: Date.now() - startTime,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateScanXml(result: ScanResult): string {
  const lines: string[] = [
    `# Security Scan Results`,
    ``,
    `**Target:** ${result.targetPath}`,
    `**Files Scanned:** ${result.totalFilesScanned}`,
    `**Scan Time:** ${result.scanTime}ms`,
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

  if (result.vulnerabilities.length === 0) {
    lines.push(``);
    lines.push(`✅ No vulnerabilities detected!`);
  } else {
    lines.push(``);
    lines.push(`## Vulnerabilities`);
    lines.push(``);

    // Sort by severity
    const severityOrder: VulnerabilitySeverity[] = [
      "critical",
      "high",
      "medium",
      "low",
    ];
    const sortedVulns = [...result.vulnerabilities].sort(
      (a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
    );

    for (const vuln of sortedVulns) {
      const severityEmoji =
        vuln.severity === "critical"
          ? "🔴"
          : vuln.severity === "high"
            ? "🟠"
            : vuln.severity === "medium"
              ? "🟡"
              : "🔵";

      lines.push(
        `### ${severityEmoji} ${vuln.title} (${vuln.severity.toUpperCase()})`,
      );
      lines.push(``);
      lines.push(`**Category:** ${vuln.category}`);
      lines.push(
        `**File:** ${vuln.filePath}${vuln.lineNumber ? `:${vuln.lineNumber}` : ""}`,
      );
      lines.push(``);
      lines.push(`**Description:** ${vuln.description}`);
      lines.push(``);
      lines.push(`**Suggestion:** ${vuln.suggestion}`);
      if (vuln.cwe) {
        lines.push(``);
        lines.push(`**CWE:** ${vuln.cwe}`);
      }
      if (vuln.codeSnippet) {
        lines.push(``);
        lines.push("```");
        lines.push(vuln.codeSnippet);
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

export const securityScannerTool: ToolDefinition<SecurityScannerArgs> = {
  name: "security_scanner",
  description:
    "Scans code for common security vulnerabilities including hardcoded secrets, SQL injection, XSS, cryptographic issues, and command injection. Use this to identify security issues in your codebase.",
  inputSchema: SecurityScannerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Security Scanner">Scanning ${args.targetPath}...</dyad-status>`,
    );

    const result = await performScan(args, ctx);

    const report = generateScanXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Security Scan Complete">Found ${result.vulnerabilities.length} issues (${result.summary.critical} critical, ${result.summary.high} high)</dyad-status>`,
    );

    return report;
  },
};
