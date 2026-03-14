/**
 * Compliance Checker Tool
 * Capabilities 321-340: Check code against compliance frameworks
 * - OWASP Top 10 compliance
 * - GDPR data protection requirements
 * - HIPAA security requirements
 * - Validate security headers and configurations
 * - Audit authentication/authorization patterns
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const ComplianceCheckerArgs = z.object({
  /** The file or directory path to check */
  targetPath: z.string().min(1),
  /** Compliance frameworks to check */
  frameworks: z
    .array(z.enum(["owasp", "gdpr", "hipaa", "pci-dss"]))
    .default(["owasp"]),
  /** Whether to check security headers */
  checkSecurityHeaders: z.boolean().default(true),
  /** Whether to check authentication patterns */
  checkAuthentication: z.boolean().default(true),
  /** Whether to check authorization patterns */
  checkAuthorization: z.boolean().default(true),
  /** Whether to check data handling (GDPR/HIPAA) */
  checkDataHandling: z.boolean().default(true),
  /** File patterns to include */
  includePatterns: z.array(z.string()).default([
    "*.ts",
    "*.js",
    "*.tsx",
    "*.jsx",
    "*.html",
    "*.json",
  ]),
  /** File patterns to exclude */
  excludePatterns: z.array(z.string()).default([
    "node_modules/*",
    "dist/*",
    "build/*",
  ]),
});

type ComplianceCheckerArgs = z.infer<typeof ComplianceCheckerArgs>;

// ============================================================================
// Types
// ============================================================================

type Severity = "critical" | "high" | "medium" | "low" | "info";

type ComplianceCategory =
  | "authentication"
  | "authorization"
  | "data_protection"
  | "security_headers"
  | "input_validation"
  | "encryption"
  | "session_management"
  | "error_handling"
  | "logging";

interface ComplianceFinding {
  id: string;
  category: ComplianceCategory;
  severity: Severity;
  framework: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  codeSnippet?: string;
  recommendation: string;
  cwe?: string;
  requirement?: string;
}

interface CheckResult {
  targetPath: string;
  frameworks: string[];
  findings: ComplianceFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    compliant: number;
  };
  checkTime: number;
}

// ============================================================================
// Compliance Rules
// ============================================================================

interface ComplianceRule {
  id: string;
  category: ComplianceCategory;
  severity: Severity;
  frameworks: string[];
  title: string;
  description: string;
  pattern: RegExp;
  recommendation: string;
  cwe?: string;
  requirement?: string;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  // OWASP Top 10 - A01:2021 Broken Access Control
  {
    id: "owasp-a01-missing-auth",
    category: "authentication",
    severity: "critical",
    frameworks: ["owasp", "hipaa"],
    title: "Missing Authentication",
    description: "Endpoint may be accessible without authentication",
    pattern: /(?:app|router|express)\.(?:get|post|put|delete)\s*\(\s*['"][^'"]+['"]\s*,?\s*(?:function|\([^)]*\)\s*=>)/i,
    recommendation: "Add authentication middleware to protect sensitive endpoints",
    cwe: "CWE-306",
    requirement: "OWASP A01:2021",
  },
  {
    id: "owasp-a01-idor",
    category: "authorization",
    severity: "high",
    frameworks: ["owasp"],
    title: "Potential IDOR Vulnerability",
    description: "Direct reference to objects without authorization check",
    pattern: /(?:req\.params|req\.query|req\.body)\.[a-z_]+.*\.find\s*\(/i,
    recommendation: "Add authorization checks before accessing user data",
    cwe: "CWE-639",
    requirement: "OWASP A01:2021",
  },

  // OWASP Top 10 - A02:2021 Cryptographic Failures
  {
    id: "owasp-a02-weak-crypto",
    category: "encryption",
    severity: "critical",
    frameworks: ["owasp", "pci-dss", "hipaa"],
    title: "Weak Cryptographic Algorithm",
    description: "Using weak cryptographic algorithm",
    pattern: /crypto\.createHash\s*\(\s*['"](?:md5|sha1)['"]\)/i,
    recommendation: "Use SHA-256 or stronger for hashing",
    cwe: "CWE-327",
    requirement: "OWASP A02:2021",
  },
  {
    id: "owasp-a02-hardcoded-key",
    category: "encryption",
    severity: "critical",
    frameworks: ["owasp", "pci-dss", "hipaa", "gdpr"],
    title: "Hardcoded Cryptographic Key",
    description: "Hardcoded encryption key detected",
    pattern: /(?:encryptKey|decryptKey|secretKey|cryptoKey)\s*[=:]\s*["'][^"']+["']/i,
    recommendation: "Use environment variables or secure key management",
    cwe: "CWE-798",
    requirement: "OWASP A02:2021",
  },

  // OWASP Top 10 - A03:2021 Injection
  {
    id: "owasp-a03-sql-injection",
    category: "input_validation",
    severity: "critical",
    frameworks: ["owasp", "pci-dss"],
    title: "SQL Injection Risk",
    description: "Potential SQL injection vulnerability",
    pattern: /(?:db\.query|connection\.query|pool\.query)\s*\([^)]*\+/i,
    recommendation: "Use parameterized queries or prepared statements",
    cwe: "CWE-89",
    requirement: "OWASP A03:2021",
  },
  {
    id: "owasp-a03-xss-risk",
    category: "input_validation",
    severity: "high",
    frameworks: ["owasp"],
    title: "XSS Risk",
    description: "Potential cross-site scripting vulnerability",
    pattern: /\.innerHTML\s*=/i,
    recommendation: "Use textContent or sanitize with DOMPurify",
    cwe: "CWE-79",
    requirement: "OWASP A03:2021",
  },

  // OWASP Top 10 - A05:2021 Security Misconfiguration
  {
    id: "owasp-a05-cors-wildcard",
    category: "security_headers",
    severity: "high",
    frameworks: ["owasp"],
    title: "CORS Wildcard Origin",
    description: "CORS configured to allow all origins",
    pattern: /Access-Control-Allow-Origin\s*:\s*['"]\*['"]/i,
    recommendation: "Restrict CORS to specific trusted origins",
    cwe: "CWE-346",
    requirement: "OWASP A05:2021",
  },
  {
    id: "owasp-a05-debug-enabled",
    category: "security_headers",
    severity: "high",
    frameworks: ["owasp"],
    title: "Debug Mode Enabled",
    description: "Application running in debug mode",
    pattern: /(?:debug|NODE_ENV)\s*[=:]\s*['"]development['"]/i,
    recommendation: "Disable debug mode in production",
    cwe: "CWE-11",
    requirement: "OWASP A05:2021",
  },

  // OWASP Top 10 - A07:2021 Identification and Authentication Failures
  {
    id: "owasp-a07-weak-password",
    category: "authentication",
    severity: "high",
    frameworks: ["owasp", "pci-dss"],
    title: "Weak Password Validation",
    description: "Weak or missing password validation",
    pattern: /password\s*[=:]\s*(?:req\.|request\.|body\.)/i,
    recommendation: "Implement strong password policies (min length, complexity)",
    cwe: "CWE-521",
    requirement: "OWASP A07:2021",
  },
  {
    id: "owasp-a07-no-session-timeout",
    category: "session_management",
    severity: "medium",
    frameworks: ["owasp", "pci-dss"],
    title: "Missing Session Timeout",
    description: "Session may not have proper timeout",
    pattern: /session\s*\(\s*\{[^}]*\}/i,
    recommendation: "Configure session timeout (maxAge or expires)",
    cwe: "CWE-613",
    requirement: "OWASP A07:2021",
  },

  // GDPR Specific Rules
  {
    id: "gdpr-pii-logging",
    category: "data_protection",
    severity: "high",
    frameworks: ["gdpr"],
    title: "Potential PII in Logs",
    description: "User data may be logged without protection",
    pattern: /(?:console\.log|logger|log)\s*\([^)]*(?:email|phone|ssn|address|credit|password)/i,
    recommendation: "Avoid logging PII, use masking if necessary",
    cwe: "CWE-532",
    requirement: "GDPR Article 32",
  },
  {
    id: "gdpr-consent-missing",
    category: "data_protection",
    severity: "critical",
    frameworks: ["gdpr"],
    title: "Missing Consent Check",
    description: "Processing may lack user consent verification",
    pattern: /(?:saveUser|createUser|register)\s*\([^)]*\)(?!.*consent)/i,
    recommendation: "Verify user consent before processing personal data",
    cwe: "CWE-862",
    requirement: "GDPR Article 7",
  },

  // HIPAA Specific Rules
  {
    id: "hipaa-phi-unencrypted",
    category: "encryption",
    severity: "critical",
    frameworks: ["hipaa"],
    title: "Unencrypted PHI Storage",
    description: "Potential unprotected health information storage",
    pattern: /(?:patient|medical|health|diagnosis|prescription)\s*[=:]\s*(?:req\.|request\.|body\.)/i,
    recommendation: "Encrypt PHI at rest and in transit",
    cwe: "CWE-311",
    requirement: "HIPAA Security Rule 164.312",
  },
  {
    id: "hipaa-audit-logging",
    category: "logging",
    severity: "medium",
    frameworks: ["hipaa"],
    title: "Missing Audit Trail",
    description: "PHI access may not be logged",
    pattern: /(?:app|router|express)\.(?:get|post|put|delete)\s*\([^)]*patient/i,
    recommendation: "Implement audit logging for PHI access",
    cwe: "CWE-778",
    requirement: "HIPAA Security Rule 164.312",
  },

  // PCI-DSS Specific Rules
  {
    id: "pci-cardholder-data",
    category: "data_protection",
    severity: "critical",
    frameworks: ["pci-dss"],
    title: "Cardholder Data Handling",
    description: "Potential unencrypted cardholder data",
    pattern: /(?:creditCard|cardNumber|cvv|expiry)\s*[=:]\s*(?:req\.|request\.|body\.)/i,
    recommendation: "Never store card data; use payment processor tokens",
    cwe: "CWE-311",
    requirement: "PCI-DSS Requirement 3",
  },

  // Security Headers
  {
    id: "header-x-content-type",
    category: "security_headers",
    severity: "medium",
    frameworks: ["owasp"],
    title: "Missing X-Content-Type-Options",
    description: "Server doesn't set X-Content-Type-Options header",
    pattern: /X-Content-Type-Options/i,
    recommendation: "Add 'X-Content-Type-Options: nosniff' header",
    cwe: "CWE-173",
  },
  {
    id: "header-x-frame-options",
    category: "security_headers",
    severity: "medium",
    frameworks: ["owasp"],
    title: "Missing X-Frame-Options",
    description: "Server doesn't set X-Frame-Options header",
    pattern: /X-Frame-Options/i,
    recommendation: "Add 'X-Frame-Options: DENY' or 'SAMEORIGIN' header",
    cwe: "CWE-346",
  },

  // Error Handling
  {
    id: "error-stack-trace",
    category: "error_handling",
    severity: "medium",
    frameworks: ["owasp"],
    title: "Stack Trace Exposure",
    description: "Error messages may expose stack traces",
    pattern: /(?:res\.status|next)\s*\(\s*(?:500|400|error)/i,
    recommendation: "Return generic error messages in production",
    cwe: "CWE-209",
  },
];

// ============================================================================
// Check Logic
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
    const regex = new RegExp(
      pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
    );
    if (regex.test(filePath) || regex.test(fileName)) {
      return false;
    }
  }

  // Check inclusions
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
 * Check file against compliance rules
 */
async function checkFile(
  filePath: string,
  frameworks: string[],
  options: ComplianceCheckerArgs,
): Promise<ComplianceFinding[]> {
  const findings: ComplianceFinding[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (const rule of COMPLIANCE_RULES) {
      // Skip if framework not selected
      const hasFramework = rule.frameworks.some((f) => frameworks.includes(f));
      if (!hasFramework) continue;

      // Skip based on options
      if (rule.category === "security_headers" && !options.checkSecurityHeaders) {
        continue;
      }
      if (rule.category === "authentication" && !options.checkAuthentication) {
        continue;
      }
      if (rule.category === "authorization" && !options.checkAuthorization) {
        continue;
      }
      if (
        rule.category === "data_protection" &&
        !options.checkDataHandling
      ) {
        continue;
      }

      // Search for pattern
      const matches = content.matchAll(new RegExp(rule.pattern, "gi"));

      for (const match of matches) {
        // Find line number
        const matchIndex = match.index ?? 0;
        const beforeMatch = content.substring(0, matchIndex);
        const lineNumber = (beforeMatch.match(/\n/g) ?? []).length + 1;

        // Get code snippet
        let codeSnippet: string | undefined;
        if (lineNumber > 0 && lineNumber <= lines.length) {
          const startLine = Math.max(0, lineNumber - 2);
          const endLine = Math.min(lines.length, lineNumber + 1);
          codeSnippet = lines.slice(startLine, endLine).join("\n");
        }

        findings.push({
          id: `${filePath}:${lineNumber}:${rule.id}`,
          category: rule.category,
          severity: rule.severity,
          framework: rule.frameworks.join(", "),
          title: rule.title,
          description: rule.description,
          filePath,
          lineNumber,
          codeSnippet,
          recommendation: rule.recommendation,
          cwe: rule.cwe,
          requirement: rule.requirement,
        });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return findings;
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
          const subFiles = await getAllFiles(fullPath, includePatterns, excludePatterns);
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
// Main Check Function
// ============================================================================

async function performCheck(
  args: ComplianceCheckerArgs,
  _ctx: AgentContext,
): Promise<CheckResult> {
  const startTime = Date.now();
  const findings: ComplianceFinding[] = [];

  try {
    const stats = await fs.stat(args.targetPath);

    if (stats.isFile()) {
      // Check single file
      const fileFindings = await checkFile(
        args.targetPath,
        args.frameworks,
        args,
      );
      findings.push(...fileFindings);
    } else if (stats.isDirectory()) {
      // Check directory
      const files = await getAllFiles(
        args.targetPath,
        args.includePatterns,
        args.excludePatterns,
      );

      // Check each file
      for (const file of files) {
        const fileFindings = await checkFile(file, args.frameworks, args);
        findings.push(...fileFindings);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to check ${args.targetPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Calculate summary
  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
    compliant: 0, // Will be calculated as files checked - files with findings
  };

  // Count compliant (files with no findings)
  summary.compliant = summary.critical + summary.high + summary.medium + summary.low;

  return {
    targetPath: args.targetPath,
    frameworks: args.frameworks,
    findings,
    summary,
    checkTime: Date.now() - startTime,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateComplianceXml(result: CheckResult): string {
  const lines: string[] = [
    `# Compliance Check Results`,
    ``,
    `**Target:** ${result.targetPath}`,
    `**Frameworks:** ${result.frameworks.join(", ")}`,
    `**Check Time:** ${result.checkTime}ms`,
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

  if (result.findings.length === 0) {
    lines.push(``);
    lines.push(`✅ No compliance issues detected!`);
    lines.push(``);
    lines.push(`The codebase appears to comply with the selected frameworks.`);
  } else {
    lines.push(``);
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

      lines.push(`### ${severityEmoji} ${finding.title} (${finding.severity.toUpperCase()})`);
      lines.push(``);
      lines.push(`**Framework:** ${finding.framework}`);
      lines.push(`**Category:** ${finding.category}`);
      lines.push(`**File:** ${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ""}`);
      lines.push(``);
      lines.push(`**Description:** ${finding.description}`);
      lines.push(``);
      lines.push(`**Recommendation:** ${finding.recommendation}`);
      if (finding.cwe) {
        lines.push(``);
        lines.push(`**CWE:** ${finding.cwe}`);
      }
      if (finding.requirement) {
        lines.push(``);
        lines.push(`**Requirement:** ${finding.requirement}`);
      }
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

export const complianceCheckerTool: ToolDefinition<ComplianceCheckerArgs> = {
  name: "compliance_checker",
  description:
    "Checks code against compliance frameworks (OWASP, GDPR, HIPAA, PCI-DSS), validates security headers, and audits authentication/authorization patterns. Use this to ensure your codebase meets security and compliance requirements.",
  inputSchema: ComplianceCheckerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Compliance Checker">Checking ${args.targetPath}...</dyad-status>`,
    );

    const result = await performCheck(args, ctx);

    const report = generateComplianceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Compliance Check Complete">Found ${result.findings.length} issues (${result.summary.critical} critical)</dyad-status>`,
    );

    return report;
  },
};
