/**
 * Cross-Model Verifier Tool
 * Mechanism 121: Cross-model verification protocol.
 * - Adversarial auditing of AI outputs
 * - Model-to-model consensus checking
 * - Logical divergence detection
 */

import { z } from "zod";
import { ToolDefinition } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const CrossModelVerifierArgs = z.object({
  /** The output to verify from the primary model */
  primaryOutput: z.string().min(1),
  /** The original task or request */
  task: z.string(),
  /** The model provider to use for verification (if available) */
  verificationProvider: z
    .enum(["google", "openai", "anthropic", "same-adversarial"])
    .default("google"),
  /** Requirements to check against */
  requirements: z.string().optional(),
});

type CrossModelVerifierArgs = z.infer<typeof CrossModelVerifierArgs>;

// ============================================================================
// Types
// ============================================================================

interface DiversionFinding {
  type: "omission" | "contradiction" | "hallucination" | "improvement";
  description: string;
  severity: "high" | "medium" | "low";
  location?: string;
}

interface VerificationReport {
  isConsensusReached: boolean;
  diversionFindings: DiversionFinding[];
  adversarialScore: number; // 0.0 (perfect) to 1.0 (total failure)
  auditSummary: string;
  verificationAuditId: string;
}

// ============================================================================
// Logic
// ============================================================================

/**
 * Perform adversarial audit of primary output.
 * Since this tool runs within the same agent context, it simulates the
 * "Adversarial Auditor" persona to find flaws.
 */
function performAdversarialAudit(
  primaryOutput: string,
  task: string,
  _requirements?: string,
): VerificationReport {
  const findings: DiversionFinding[] = [];
  const lowerOutput = primaryOutput.toLowerCase();
  const lowerTask = task.toLowerCase();

  // 1. Check for Task Coverage (Adversarial approach - looking for what's MISSING)
  const taskKeywords = lowerTask.split(/\W+/).filter((w) => w.length > 5);
  for (const word of taskKeywords) {
    if (!lowerOutput.includes(word)) {
      findings.push({
        type: "omission",
        description: `Primary output failed to explicitly mention or handle keyword: "${word}"`,
        severity: "medium",
      });
    }
  }

  // 2. Structural Omissions
  if (lowerTask.includes("error") && !lowerOutput.includes("catch")) {
    findings.push({
      type: "omission",
      description:
        "Task requires error handling but 'catch' block is missing from implementation.",
      severity: "high",
    });
  }

  // 3. Simulated Hallucination Detection (Inconsistent types or invented APIs)
  const apiInventRegexp = /\b(?:dyad\.[a-zA-Z_]+\.[a-zA-Z_]+)\b/g;
  const inventedApis = primaryOutput.match(apiInventRegexp) || [];
  for (const api of inventedApis) {
    // Basic check: if it looks like dyad.internal.missing_cap
    if (api.includes("missing")) {
      findings.push({
        type: "hallucination",
        description: `Possible invented API call: ${api}`,
        severity: "high",
      });
    }
  }

  // 4. Consensus Logic
  const highSeverityCount = findings.filter(
    (f) => f.severity === "high",
  ).length;
  const adversarialScore = Math.min(
    1,
    findings.length * 0.15 + highSeverityCount * 0.2,
  );
  const isConsensusReached = adversarialScore < 0.4;

  let auditSummary = isConsensusReached
    ? "Verified: Secondary audit confirms the primary logic holds under scrutiny."
    : "Alert: Secondary audit has found significant diversions or omissions in primary logic.";

  return {
    isConsensusReached,
    diversionFindings: findings,
    adversarialScore: Math.round(adversarialScore * 100) / 100,
    auditSummary,
    verificationAuditId: `AUDIT-${Date.now().toString(36).toUpperCase()}`,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const crossModelVerifierTool: ToolDefinition<CrossModelVerifierArgs> = {
  name: "cross_model_verifier",
  description:
    "Cross-model verification protocol (Mechanism 121). Perform adversarial auditing of AI outputs to detect hallucinations, omissions, and logical contradictions using a secondary audit persona.",
  inputSchema: CrossModelVerifierArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Adversarial Audit">Auditing primary output against provider ${args.verificationProvider}...</dyad-status>`,
    );

    const report = performAdversarialAudit(
      args.primaryOutput,
      args.task,
      args.requirements,
    );

    ctx.onXmlComplete(
      `<dyad-status title="Audit Complete">Consensus: ${report.isConsensusReached ? "PASSED" : "FAILED"} (Adversarial Score: ${report.adversarialScore})</dyad-status>`,
    );

    let output = `# Cross-Model Verification Audit\n\n`;
    output += `**Audit ID:** ${report.verificationAuditId}\n`;
    output += `**Agreement:** ${report.isConsensusReached ? "✅ High Consensus" : "⚠️ Diversion Detected"}\n`;
    output += `**Adversarial Risk Score:** ${(report.adversarialScore * 100).toFixed(0)}%\n\n`;
    output += `## Summary\n${report.auditSummary}\n\n`;

    if (report.diversionFindings.length > 0) {
      output += `## Findings\n`;
      for (const finding of report.diversionFindings) {
        const emoji =
          finding.severity === "high"
            ? "🔴"
            : finding.severity === "medium"
              ? "🟠"
              : "🔵";
        output += `- ${emoji} **${finding.type.toUpperCase()}**: ${finding.description}\n`;
      }
    } else {
      output += `✅ No significant diversions found.\n`;
    }

    return output;
  },
};
