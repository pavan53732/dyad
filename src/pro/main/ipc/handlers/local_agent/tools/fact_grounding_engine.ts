import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { ToolDefinition, AgentContext } from "./types";
import { spawn } from "node:child_process";
import {
  getRgExecutablePath,
  MAX_FILE_SEARCH_SIZE,
  RIPGREP_EXCLUDED_GLOBS,
} from "@/ipc/utils/ripgrep_utils";

const FactGroundingArgs = z.object({
  claims: z.array(z.string()).describe("List of factual claims to verify"),
  contextPaths: z
    .array(z.string())
    .optional()
    .describe("Optional files to check for grounding"),
});

type FactGroundingArgs = z.infer<typeof FactGroundingArgs>;

interface GroundingResult {
  claim: string;
  isGrounded: boolean;
  confidence: number;
  source?: string;
  explanation: string;
}

interface RipgrepMatch {
  path: string;
  lineNumber: number;
  lineText: string;
}

async function ripgrepSearch(
  appPath: string,
  query: string,
  include?: string[],
): Promise<RipgrepMatch[]> {
  return new Promise((resolve) => {
    const results: RipgrepMatch[] = [];
    const args: string[] = [
      "--json",
      "--no-config",
      "--ignore-case",
      "--max-filesize",
      `${MAX_FILE_SEARCH_SIZE}`,
    ];

    if (include && include.length > 0) {
      for (const pattern of include) {
        args.push("--glob", pattern);
      }
    }

    args.push(...RIPGREP_EXCLUDED_GLOBS.flatMap((glob) => ["--glob", glob]));
    args.push("--", query, ".");

    const rg = spawn(getRgExecutablePath(), args, { cwd: appPath });
    let buffer = "";

    const timeout = setTimeout(() => {
      rg.kill();
      console.error(`Ripgrep search timed out for query: ${query}`);
      resolve([]);
    }, 10000); // 10s timeout

    rg.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "match" && event.data) {
            results.push({
              path: (event.data.path?.text || "").replace(/^\.\//, ""),
              lineNumber: event.data.line_number as number,
              lineText: (event.data.lines?.text || "").replace(/\r?\n$/, ""),
            });
          }
        } catch {}
      }
    });

    rg.on("close", () => {
      clearTimeout(timeout);
      resolve(results);
    });
    rg.on("error", () => {
      clearTimeout(timeout);
      resolve([]);
    });
  });
}

/**
 * Fact Grounding Engine (Mechanism 7)
 * Verifies AI claims against Knowledge Base and local project files.
 */
async function verifyClaims(
  args: FactGroundingArgs,
  ctx: AgentContext,
): Promise<GroundingResult[]> {
  const results: GroundingResult[] = [];
  const knowledgePath = path.join(ctx.appPath, ".dyad", "knowledge_base.json");
  let knowledge: any[] = [];

  if (fs.existsSync(knowledgePath)) {
    try {
      knowledge = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"));
    } catch {
      // Ignore knowledge base errors
    }
  }

  for (const claim of args.claims) {
    let grounded = false;
    let score = 0;
    let foundSource = "";
    let explanation =
      "No direct evidence found in knowledge base or project files.";

    // 1. Check Knowledge Base
    const queryLower = claim.toLowerCase();
    const relevantKnowledge = knowledge.filter(
      (entry) =>
        entry.key.toLowerCase().includes(queryLower) ||
        entry.value.toLowerCase().includes(queryLower),
    );

    if (relevantKnowledge.length > 0) {
      grounded = true;
      score = 0.8;
      foundSource = `Knowledge Base: ${relevantKnowledge[0].key}`;
      explanation = `Matched claim against historical knowledge entry: "${relevantKnowledge[0].key}".`;
    }

    // 2. Check Codebase (if not grounded or to increase confidence)
    if (!grounded || score < 0.9) {
      try {
        const grepResults = await ripgrepSearch(
          ctx.appPath,
          claim,
          args.contextPaths,
        );

        if (grepResults.length > 0) {
          grounded = true;
          score = Math.max(score, 0.9);
          foundSource = grepResults[0].path;
          explanation = `Direct evidence found in codebase at ${grepResults[0].path}.`;
        }
      } catch {
        // Grep error
      }
    }

    results.push({
      claim,
      isGrounded: grounded,
      confidence: score,
      source: foundSource,
      explanation,
    });
  }

  return results;
}

export const factGroundingTool: ToolDefinition<FactGroundingArgs> = {
  name: "fact_grounding_checker",
  description:
    "Verifies factual claims against the persistent Knowledge Base and the project codebase (Mechanism 7). Use this to ensure that statements about project architecture, historical decisions, or existing patterns are grounded in reality.",
  inputSchema: FactGroundingArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Fact Grounding">Verifying ${args.claims.length} claims...</dyad-status>`,
    );

    const results = await verifyClaims(args, ctx);
    const allGrounded = results.every((r) => r.isGrounded);

    const lines = ["# Fact Grounding Report", ""];
    for (const res of results) {
      const icon = res.isGrounded ? "✅" : "❌";
      lines.push(`### ${icon} Claim: ${res.claim}`);
      lines.push(`- **Status:** ${res.isGrounded ? "Grounded" : "Ungrounded"}`);
      lines.push(`- **Confidence:** ${(res.confidence * 100).toFixed(0)}%`);
      if (res.source) lines.push(`- **Source:** ${res.source}`);
      lines.push(`- **Details:** ${res.explanation}`);
      lines.push("");
    }

    ctx.onXmlComplete(
      `<dyad-status title="Fact Grounding Complete">${allGrounded ? "All Grounded" : "Gaps Detected"}</dyad-status>`,
    );

    return lines.join("\n");
  },
};
