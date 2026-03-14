/**
 * Self-Verifier Tool
 * Capabilities 51-60: Validates AI output correctness
 * - Output correctness validation
 * - Logical consistency checking
 * - Confidence estimation
 * - Self-critique generation
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const SelfVerifierArgs = z.object({
  /** The AI output to verify */
  output: z.string().min(1),
  /** The original task/request */
  task: z.string(),
  /** Expected outcome or requirements */
  requirements: z.string().optional(),
  /** The code context (if applicable) */
  codeContext: z.string().optional(),
  /** Whether to check logical consistency */
  checkConsistency: z.boolean().default(true),
  /** Whether to estimate confidence */
  estimateConfidence: z.boolean().default(true),
  /** Whether to generate self-critique */
  generateCritique: z.boolean().default(true),
});

type SelfVerifierArgs = z.infer<typeof SelfVerifierArgs>;

// ============================================================================
// Types
// ============================================================================

/** Types of issues that can be detected */
type IssueType =
  | "syntax_error"
  | "logic_error"
  | "type_error"
  | "security_issue"
  | "incomplete"
  | "incorrect"
  | "missing_edge_case"
  | "inefficient"
  | "inconsistent";

/** Severity of the issue */
type IssueSeverity = "critical" | "high" | "medium" | "low";

/** A detected issue */
interface DetectedIssue {
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  location?: string;
  suggestion?: string;
}

/** Consistency check result */
interface ConsistencyResult {
  isConsistent: boolean;
  contradictions: { statement1: string; statement2: string; resolution: string }[];
  assumptions: string[];
  dependencies: { satisfied: boolean; description: string }[];
}

/** Confidence estimation */
interface ConfidenceEstimation {
  overallConfidence: number;
  factors: {
    factor: string;
    score: number;
    reasoning: string;
  }[];
  uncertaintyAreas: string[];
}

/** Self-critique */
interface SelfCritique {
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  alternativeApproaches: string[];
  riskAssessment: string;
}

/** Complete verification result */
interface VerificationResult {
  isValid: boolean;
  issues: DetectedIssue[];
  issueCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  consistency: ConsistencyResult;
  confidence: ConfidenceEstimation;
  critique: SelfCritique;
  summary: string;
}

// ============================================================================
// Verification Logic
// ============================================================================

/** Check for common syntax issues */
function detectSyntaxIssues(output: string): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Check for unbalanced brackets
  const brackets = [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "<", close: ">" },
  ];

  for (const { open, close } of brackets) {
    const openCount = (output.match(new RegExp(`\\${open}`, "g")) || []).length;
    const closeCount = (output.match(new RegExp(`\\${close}`, "g")) || []).length;

    if (openCount !== closeCount) {
      issues.push({
        type: "syntax_error",
        severity: "critical",
        description: `Unbalanced ${open === "{" ? "curly" : open === "[" ? "square" : open === "(" ? "parenthesis" : "angle"} brackets`,
        suggestion: `Add missing ${open} or ${close}`,
      });
    }
  }

  // Check for unclosed strings
  const singleQuoteCount = (output.match(/'/g) || []).length;
  const doubleQuoteCount = (output.match(/"/g) || []).length;
  const templateLiteralCount = (output.match(/`/g) || []).length;

  if (singleQuoteCount % 2 !== 0) {
    issues.push({
      type: "syntax_error",
      severity: "critical",
      description: "Unclosed single quote string",
    });
  }

  if (doubleQuoteCount % 2 !== 0) {
    issues.push({
      type: "syntax_error",
      severity: "critical",
      description: "Unclosed double quote string",
    });
  }

  if (templateLiteralCount % 2 !== 0) {
    issues.push({
      type: "syntax_error",
      severity: "critical",
      description: "Unclosed template literal",
    });
  }

  // Check for common typos in keywords
  const keywordTypos = [
    { pattern: /\bfunctio\b/, correct: "function", severity: "high" as IssueSeverity },
    { pattern: /\bretrun\b/, correct: "return", severity: "high" as IssueSeverity },
    { pattern: /\bdefintion\b/, correct: "definition", severity: "high" as IssueSeverity },
    { pattern: /\bvarible\b/, correct: "variable", severity: "medium" as IssueSeverity },
    { pattern: /\bparamater\b/, correct: "parameter", severity: "medium" as IssueSeverity },
  ];

  for (const { pattern, correct, severity } of keywordTypos) {
    if (pattern.test(output)) {
      issues.push({
        type: "syntax_error",
        severity,
        description: `Possible typo - should be "${correct}"`,
      });
    }
  }

  return issues;
}

/** Check for security issues */
function detectSecurityIssues(output: string): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Check for hardcoded secrets
  const secretPatterns = [
    { pattern: /password\s*=\s*["'][^"']+["']/i, desc: "Hardcoded password" },
    { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i, desc: "Hardcoded API key" },
    { pattern: /secret\s*=\s*["'][^"']+["']/i, desc: "Hardcoded secret" },
    { pattern: /token\s*=\s*["'][^"']+["']/i, desc: "Hardcoded token" },
    { pattern: /private[_-]?key\s*=\s*["'][^"']+["']/i, desc: "Hardcoded private key" },
  ];

  for (const { pattern, desc } of secretPatterns) {
    if (pattern.test(output)) {
      issues.push({
        type: "security_issue",
        severity: "critical",
        description: desc,
        suggestion: "Use environment variables instead",
      });
    }
  }

  // Check for dangerous eval usage
  if (/\beval\s*\(/.test(output)) {
    issues.push({
      type: "security_issue",
      severity: "high",
      description: "Use of eval() - potential code injection risk",
      suggestion: "Avoid eval() or sanitize input thoroughly",
    });
  }

  // Check for SQL injection vulnerabilities
  if (/query\s*\(.*\+.*\)|"SELECT.*\+.*"/.test(output)) {
    issues.push({
      type: "security_issue",
      severity: "high",
      description: "Potential SQL injection vulnerability",
      suggestion: "Use parameterized queries",
    });
  }

  // Check for innerHTML usage without sanitization
  if (/innerHTML\s*=/.test(output) && !output.includes("sanitize") && !output.includes("DOMPurify")) {
    issues.push({
      type: "security_issue",
      severity: "medium",
      description: "innerHTML assignment without sanitization",
      suggestion: "Sanitize user input before using innerHTML",
    });
  }

  return issues;
}

/** Check logical consistency */
function checkConsistency(output: string, task: string, _requirements?: string): ConsistencyResult {
  const contradictions: { statement1: string; statement2: string; resolution: string }[] = [];
  const assumptions: string[] = [];
  const dependencies: { satisfied: boolean; description: string }[] = [];

  // Check for contradictory statements in the output
  const _conditionalStatements = output.match(/if\s*\([^)]+\)\s*{[^}]*}/g) || [];

  // Check if task mentions specific requirements
  const taskLower = task.toLowerCase();
  const requiresAsync = taskLower.includes("async") || taskLower.includes("promise");
  const requiresErrorHandling = taskLower.includes("error") || taskLower.includes("catch");

  if (requiresAsync && !output.includes("async") && !output.includes("await") && !output.includes("Promise")) {
    dependencies.push({
      satisfied: false,
      description: "Task requires async operation but code is synchronous",
    });
  } else if (requiresAsync) {
    dependencies.push({
      satisfied: true,
      description: "Async requirement addressed",
    });
  }

  if (requiresErrorHandling) {
    if (!output.includes("catch") && !output.includes("try") && !output.includes("error")) {
      dependencies.push({
        satisfied: false,
        description: "Task requires error handling but no error handling found",
      });
    } else {
      dependencies.push({
        satisfied: true,
        description: "Error handling present",
      });
    }
  }

  // Check for incomplete implementations
  const incompletePatterns = [
    { pattern: /TODO/, desc: "Incomplete implementation (TODO found)" },
    { pattern: /FIXME/, desc: "Known issue not resolved (FIXME found)" },
    { pattern: /NotImplementedError/, desc: "Feature not implemented" },
    { pattern: /throw\s+new\s+Error\(\)/, desc: "Error thrown without message" },
  ];

  for (const { pattern, desc } of incompletePatterns) {
    if (pattern.test(output)) {
      dependencies.push({
        satisfied: false,
        description: desc,
      });
    }
  }

  // Check for common logical errors
  const logicalErrors = [
    { pattern: /if\s*\(\s*true\s*\)/, desc: "Always-true condition" },
    { pattern: /if\s*\(\s*false\s*\)/, desc: "Always-false condition (dead code)" },
    { pattern: /for\s*\([^)]*;\s*;\s*\)/, desc: "Infinite loop (empty condition)" },
  ];

  for (const { pattern, desc } of logicalErrors) {
    if (pattern.test(output)) {
      contradictions.push({
        statement1: desc,
        statement2: "Expected to be handled",
        resolution: "Fix the logical error",
      });
    }
  }

  // Identify assumptions
  if (output.includes("assume") || output.includes("assuming")) {
    const assumptionMatches = output.match(/(?:assume|assuming)[^.]+\./gi) || [];
    assumptions.push(...assumptionMatches);
  }

  if (output.includes("should") || output.includes("might") || output.includes("may")) {
    const potentialAssumptions = output.match(/[^.]*(?:should|might|may)[^.]+\./gi) || [];
    assumptions.push(...potentialAssumptions.slice(0, 3));
  }

  const isConsistent = contradictions.length === 0 && dependencies.every((d) => d.satisfied);

  return {
    isConsistent,
    contradictions,
    assumptions,
    dependencies,
  };
}

/** Estimate confidence in the output */
function estimateConfidence(
  output: string,
  task: string,
  requirements?: string,
): ConfidenceEstimation {
  const factors: { factor: string; score: number; reasoning: string }[] = [];

  // Completeness factor
  const hasCode = output.includes("function") || output.includes("class") || output.includes("const ") || output.includes("let ");
  const hasReturn = output.includes("return");
  const taskLower = task.toLowerCase();
  const isComplexTask = taskLower.includes("build") || taskLower.includes("create") || taskLower.includes("implement");

  let completenessScore = 0.5;
  if (hasCode) completenessScore += 0.2;
  if (hasReturn || !isComplexTask) completenessScore += 0.15;
  if (output.length > 100) completenessScore += 0.15;

  factors.push({
    factor: "Completeness",
    score: Math.min(1, completenessScore),
    reasoning: hasCode ? "Code appears complete" : "Code may be incomplete",
  });

  // Quality factor
  let qualityScore = 0.5;

  // Check for comments
  if (output.includes("//") || output.includes("/*")) {
    qualityScore += 0.15;
  }

  // Check for error handling
  if (output.includes("try") || output.includes("catch") || output.includes("error")) {
    qualityScore += 0.15;
  }

  // Check for proper naming
  const camelCaseVars = (output.match(/[a-z][A-Z]/g) || []).length;
  if (camelCaseVars > 2) {
    qualityScore += 0.1;
  }

  factors.push({
    factor: "Code Quality",
    score: Math.min(1, qualityScore),
    reasoning: qualityScore > 0.6 ? "Good coding practices detected" : "Could benefit from improvements",
  });

  // Specificity factor
  let specificityScore = 0.5;
  if (requirements) {
    const reqLower = requirements.toLowerCase();
    const keywords = ["type", "parameter", "return", "handle", "check", "validate"];

    for (const keyword of keywords) {
      if (reqLower.includes(keyword) && output.toLowerCase().includes(keyword)) {
        specificityScore += 0.1;
      }
    }
  }

  factors.push({
    factor: "Requirements Coverage",
    score: Math.min(1, specificityScore),
    reasoning: specificityScore > 0.6 ? "Addresses requirements" : "May miss some requirements",
  });

  // Calculate overall confidence
  const weights = { Completeness: 0.4, Code_Quality: 0.3, Requirements_Coverage: 0.3 };
  const overallConfidence =
    factors[0].score * weights.Completeness +
    factors[1].score * weights.Code_Quality +
    factors[2].score * weights.Requirements_Coverage;

  // Identify uncertainty areas
  const uncertaintyAreas: string[] = [];

  if (!hasReturn && isComplexTask) {
    uncertaintyAreas.push("Return value not clear");
  }

  if (!output.includes("error") && isComplexTask) {
    uncertaintyAreas.push("Error handling not evident");
  }

  if (output.length < 100 && isComplexTask) {
    uncertaintyAreas.push("Implementation seems minimal");
  }

  return {
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    factors,
    uncertaintyAreas,
  };
}

/** Generate self-critique */
function generateSelfCritique(
  output: string,
  task: string,
  issues: DetectedIssue[],
  consistency: ConsistencyResult,
  confidence: ConfidenceEstimation,
): SelfCritique {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];
  const alternativeApproaches: string[] = [];

  // Identify strengths
  if (output.includes("try") && output.includes("catch")) {
    strengths.push("Good error handling implementation");
  }

  if (output.includes("//") || output.includes("/*")) {
    strengths.push("Code is well-commented");
  }

  if (!issues.some((i) => i.type === "syntax_error")) {
    strengths.push("No obvious syntax errors");
  }

  if (consistency.isConsistent) {
    strengths.push("Logic appears consistent");
  }

  if (confidence.overallConfidence > 0.7) {
    strengths.push("High confidence in implementation");
  }

  // Identify weaknesses based on issues
  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const highIssues = issues.filter((i) => i.severity === "high");

  if (criticalIssues.length > 0) {
    weaknesses.push(`${criticalIssues.length} critical issue(s) need attention`);
  }

  if (highIssues.length > 0) {
    weaknesses.push(`${highIssues.length} high-priority issue(s) identified`);
  }

  if (consistency.dependencies.some((d) => !d.satisfied)) {
    const unsatisfied = consistency.dependencies.filter((d) => !d.satisfied);
    weaknesses.push(unsatisfied.map((d) => d.description).join(", "));
  }

  if (confidence.uncertaintyAreas.length > 0) {
    weaknesses.push("Uncertainty in: " + confidence.uncertaintyAreas.join(", "));
  }

  // Generate improvement suggestions
  if (issues.some((i) => i.type === "security_issue")) {
    improvements.push("Address security issues before production use");
  }

  if (!output.includes("test") && !output.includes("spec")) {
    improvements.push("Consider adding tests");
  }

  if (!output.includes("type") && output.includes(":")) {
    improvements.push("Consider adding TypeScript types for better maintainability");
  }

  if (output.length > 500 && !output.includes("export")) {
    improvements.push("Consider breaking into smaller modules");
  }

  // Alternative approaches
  const taskLower = task.toLowerCase();
  if (taskLower.includes("api") || taskLower.includes("fetch")) {
    alternativeApproaches.push("Could use a different HTTP client");
    alternativeApproaches.push("Could implement caching for better performance");
  }

  if (taskLower.includes("data") || taskLower.includes("list")) {
    alternativeApproaches.push("Could use pagination for large datasets");
    alternativeApproaches.push("Could add virtualization for rendering");
  }

  // Risk assessment
  let riskAssessment = "Medium risk";
  if (criticalIssues.length > 0 || !consistency.isConsistent) {
    riskAssessment = "High risk - critical issues must be resolved";
  } else if (confidence.overallConfidence > 0.8 && issues.length === 0) {
    riskAssessment = "Low risk - implementation appears solid";
  }

  return {
    strengths,
    weaknesses,
    improvements,
    alternativeApproaches,
    riskAssessment,
  };
}

// ============================================================================
// Main Verification Function
// ============================================================================

async function verifyOutput(
  args: SelfVerifierArgs,
  _ctx: AgentContext,
): Promise<VerificationResult> {
  const { output, task, requirements, codeContext: _codeContext, checkConsistency: doCheckConsistency, estimateConfidence: doEstimateConfidence, generateCritique: doGenerateCritique } = args;

  // Detect issues
  const syntaxIssues = detectSyntaxIssues(output);
  const securityIssues = detectSecurityIssues(output);

  // Combine all issues
  const allIssues = [...syntaxIssues, ...securityIssues];

  // Check consistency
  const consistency = doCheckConsistency
    ? checkConsistency(output, task, requirements)
    : {
        isConsistent: true,
        contradictions: [],
        assumptions: [],
        dependencies: [],
      };

  // Estimate confidence
  const confidence = doEstimateConfidence
    ? estimateConfidence(output, task, requirements)
    : {
        overallConfidence: 0.5,
        factors: [],
        uncertaintyAreas: [],
      };

  // Generate critique
  const critique = doGenerateCritique
    ? generateSelfCritique(output, task, allIssues, consistency, confidence)
    : {
        strengths: [],
        weaknesses: [],
        improvements: [],
        alternativeApproaches: [],
        riskAssessment: "Not assessed",
      };

  // Count issues by severity
  const issueCount = {
    critical: allIssues.filter((i) => i.severity === "critical").length,
    high: allIssues.filter((i) => i.severity === "high").length,
    medium: allIssues.filter((i) => i.severity === "medium").length,
    low: allIssues.filter((i) => i.severity === "low").length,
  };

  // Determine if output is valid
  const isValid =
    issueCount.critical === 0 &&
    issueCount.high === 0 &&
    consistency.isConsistent &&
    confidence.overallConfidence > 0.5;

  // Generate summary
  let summary = "";
  if (!isValid) {
    summary = "Verification failed - issues detected";
  } else if (confidence.overallConfidence > 0.8) {
    summary = "Verification passed with high confidence";
  } else {
    summary = "Verification passed with moderate confidence";
  }

  return {
    isValid,
    issues: allIssues,
    issueCount,
    consistency,
    confidence,
    critique,
    summary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateVerificationXml(result: VerificationResult): string {
  const status = result.isValid ? "✅ PASSED" : "❌ FAILED";

  const lines: string[] = [
    `# Self-Verification Result`,
    ``,
    `**Status:** ${status}`,
    `**Confidence:** ${(result.confidence.overallConfidence * 100).toFixed(0)}%`,
    `**Risk:** ${result.critique.riskAssessment}`,
    ``,
  ];

  // Issue summary
  if (result.issues.length > 0) {
    lines.push(`## Issues Found (${result.issues.length})`);
    if (result.issueCount.critical > 0) {
      lines.push(`- 🔴 Critical: ${result.issueCount.critical}`);
    }
    if (result.issueCount.high > 0) {
      lines.push(`- 🟠 High: ${result.issueCount.high}`);
    }
    if (result.issueCount.medium > 0) {
      lines.push(`- 🟡 Medium: ${result.issueCount.medium}`);
    }
    if (result.issueCount.low > 0) {
      lines.push(`- 🔵 Low: ${result.issueCount.low}`);
    }
    lines.push(``);

    // List critical and high issues
    const criticalHighIssues = result.issues.filter(
      (i) => i.severity === "critical" || i.severity === "high",
    );
    if (criticalHighIssues.length > 0) {
      lines.push(`### Critical/High Issues`);
      for (const issue of criticalHighIssues) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.suggestion) {
          lines.push(`  → ${issue.suggestion}`);
        }
      }
      lines.push(``);
    }
  }

  // Consistency check
  if (!result.consistency.isConsistent) {
    lines.push(`## ⚠️ Consistency Issues`);
    for (const dep of result.consistency.dependencies) {
      if (!dep.satisfied) {
        lines.push(`- ${dep.description}`);
      }
    }
    lines.push(``);
  }

  // Confidence factors
  if (result.confidence.factors.length > 0) {
    lines.push(`## Confidence Breakdown`);
    for (const factor of result.confidence.factors) {
      lines.push(`- ${factor.factor}: ${(factor.score * 100).toFixed(0)}%`);
    }
    lines.push(``);
  }

  // Self-critique
  if (result.critique.strengths.length > 0) {
    lines.push(`## ✅ Strengths`);
    for (const strength of result.critique.strengths) {
      lines.push(`- ${strength}`);
    }
    lines.push(``);
  }

  if (result.critique.weaknesses.length > 0) {
    lines.push(`## ⚠️ Weaknesses`);
    for (const weakness of result.critique.weaknesses) {
      lines.push(`- ${weakness}`);
    }
    lines.push(``);
  }

  if (result.critique.improvements.length > 0) {
    lines.push(`## 💡 Suggested Improvements`);
    for (const improvement of result.critique.improvements) {
      lines.push(`- ${improvement}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const selfVerifierTool: ToolDefinition<SelfVerifierArgs> = {
  name: "self_verifier",
  description:
    "Validates AI output correctness, checks logical consistency, estimates confidence, and generates self-critique. Use this to verify code quality and identify issues before finalizing.",
  inputSchema: SelfVerifierArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Self-Verifier">Verifying output...</dyad-status>`,
    );

    const result = await verifyOutput(args, ctx);

    const report = generateVerificationXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Verification Complete">${result.isValid ? "Passed" : "Failed"} (${(result.confidence.overallConfidence * 100).toFixed(0)}% confidence)</dyad-status>`,
    );

    return report;
  },
};
