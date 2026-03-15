/**
 * Aegis Containment Coordinator
 * Mechanism 174: Autonomous containment protocols.
 * - Autonomous "Emergency Brake"
 * - Risk-based permission revocation
 * - Safety boundary enforcement
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const ContainmentArgs = z.object({
  /** Current safety signals to evaluate */
  signals: z.object({
    hallucinationProbability: z.number().min(0).max(1),
    driftScore: z.number().min(0).max(1),
    adversarialRiskScore: z.number().min(0).max(1).optional(),
    criticalIssueCount: z.number().default(0),
  }),
  /** Reason for checking containment status */
  context: z.string().optional(),
});

type ContainmentArgs = z.infer<typeof ContainmentArgs>;

// ============================================================================
// Types
// ============================================================================

interface ContainmentStatus {
  isRestricted: boolean;
  restrictionLevel: "none" | "warn" | "quarantine" | "halt";
  activeRevocations: string[];
  lastEvaluation: string;
  reasons: string[];
}

// ============================================================================
// Logic
// ============================================================================

function getAegisStatusPath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "aegis_status.json");
}

function evaluateContainment(args: ContainmentArgs): ContainmentStatus {
  const { signals } = args;
  const reasons: string[] = [];
  let restrictionLevel: ContainmentStatus["restrictionLevel"] = "none";
  const activeRevocations: string[] = [];

  // Thresholds (Level 6.5 Safety Config)
  const HALT_THRESHOLD = 0.8;
  const QUARANTINE_THRESHOLD = 0.5;
  const WARN_THRESHOLD = 0.3;

  const maxRisk = Math.max(
    signals.hallucinationProbability,
    signals.driftScore,
    signals.adversarialRiskScore ?? 0,
  );

  if (maxRisk >= HALT_THRESHOLD || signals.criticalIssueCount > 2) {
    restrictionLevel = "halt";
    reasons.push("CRITICAL RISK: Safety thresholds exceeded HALT level.");
    activeRevocations.push(
      "all_write_actions",
      "shell_execution",
      "external_api_calls",
    );
  } else if (
    maxRisk >= QUARANTINE_THRESHOLD ||
    signals.criticalIssueCount > 0
  ) {
    restrictionLevel = "quarantine";
    reasons.push(
      "WARNING: High risk detected. Entering containment quarantine.",
    );
    activeRevocations.push("filesystem_mutation", "unverified_tool_use");
  } else if (maxRisk >= WARN_THRESHOLD) {
    restrictionLevel = "warn";
    reasons.push("Notice: Moderate risk detected. Observations active.");
  }

  return {
    isRestricted: restrictionLevel !== "none",
    restrictionLevel,
    activeRevocations,
    lastEvaluation: new Date().toISOString(),
    reasons,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const aegisContainmentCoordinatorTool: ToolDefinition<ContainmentArgs> =
  {
    name: "aegis_containment_coordinator",
    description:
      "Aegis Containment Coordinator (Mechanism 174). Centralized safety coordinator that evaluates risk signals (hallucination, drift, adversarial risk) and triggers automated containment or 'emergency brake' protocols.",
    inputSchema: ContainmentArgs,
    defaultConsent: "always",
    modifiesState: true,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Aegis Safety Audit">Evaluating risk signals across control plane...</dyad-status>`,
      );

      const status = evaluateContainment(args);

      // Persist Aegis status for other tools to check
      const statusPath = getAegisStatusPath(ctx);
      const dir = path.dirname(statusPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf-8");

      if (
        status.restrictionLevel === "halt" ||
        status.restrictionLevel === "quarantine"
      ) {
        ctx.onXmlComplete(
          `<dyad-status title="EMERGENCY BRAKE ACTIVE">Restriction Level: ${status.restrictionLevel.toUpperCase()}</dyad-status>`,
        );
      } else {
        ctx.onXmlComplete(
          `<dyad-status title="Safety Audit Complete">System Nominal (Risk: ${Math.max(args.signals.hallucinationProbability, args.signals.driftScore).toFixed(2)})</dyad-status>`,
        );
      }

      let output = `# Aegis Containment Status\n\n`;
      output += `**Status:** ${status.isRestricted ? "⚠️ RESTRICTED" : "✅ NOMINAL"}\n`;
      output += `**Level:** ${status.restrictionLevel.toUpperCase()}\n`;
      output += `**Evaluated:** ${status.lastEvaluation}\n\n`;

      if (status.reasons.length > 0) {
        output += `## Reasons\n`;
        for (const reason of status.reasons) {
          output += `- ${reason}\n`;
        }
      }

      if (status.activeRevocations.length > 0) {
        output += `\n## Active Revocations\n`;
        for (const rev of status.activeRevocations) {
          output += `- 🚫 ${rev}\n`;
        }
      }

      return output;
    },
  };
