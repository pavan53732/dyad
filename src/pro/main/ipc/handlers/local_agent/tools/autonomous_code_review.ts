import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

const autonomousCodeReviewSchema = z.object({
  filePath: z.string().describe("Relative path to the file to review"),
  focus: z
    .enum(["security", "performance", "style", "bugs", "full"])
    .optional()
    .default("full")
    .describe(
      "Focus area for the review: security, performance, style, bugs, or full review",
    ),
  includeSuggestions: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to include improvement suggestions"),
});

interface ReviewFinding {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
}

export const autonomousCodeReviewTool: ToolDefinition<
  z.infer<typeof autonomousCodeReviewSchema>
> = {
  name: "autonomous_code_review",
  description: `Perform AI-powered code review on a file. Analyzes code for issues, security vulnerabilities, performance problems, style violations, and bugs. Provides detailed feedback with specific line numbers and improvement suggestions.`,
  inputSchema: autonomousCodeReviewSchema,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) =>
    `Review code in ${args.filePath} (focus: ${args.focus})`,

  buildXml: (args, isComplete) => {
    if (!args.filePath) return undefined;

    let xml = `<dyad-code-review file="${escapeXmlAttr(args.filePath)}"`;
    if (args.focus) {
      xml += ` focus="${escapeXmlAttr(args.focus)}"`;
    }
    if (isComplete) {
      xml += "></dyad-code-review>";
    } else {
      xml += ">";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { filePath, focus = "full", includeSuggestions = true } = args;

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.appPath, filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    ctx.onXmlStream(
      `<dyad-status title="Code Review">Analyzing ${filePath}...</dyad-status>`,
    );

    const content = fs.readFileSync(fullPath, "utf-8");
    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Determine what to look for based on focus
    let focusInstructions = "";
    switch (focus) {
      case "security":
        focusInstructions =
          "Focus specifically on security vulnerabilities, injection risks, authentication issues, and data exposure. Look for: SQL injection, XSS, command injection, hardcoded secrets, insecure deserialization.";
        break;
      case "performance":
        focusInstructions =
          "Focus specifically on performance issues, memory leaks, inefficient algorithms, unnecessary re-renders, and N+1 query patterns. Look for: O(n²) algorithms, missing memoization, excessive API calls.";
        break;
      case "style":
        focusInstructions =
          "Focus specifically on code style, readability, and best practices. Look for: naming conventions, code duplication, function complexity, missing comments, inconsistent formatting.";
        break;
      case "bugs":
        focusInstructions =
          "Focus specifically on potential bugs, logical errors, edge cases, and runtime issues. Look for: null pointer exceptions, race conditions, unhandled errors, incorrect error handling.";
        break;
      case "full":
      default:
        focusInstructions =
          "Perform a comprehensive review covering security, performance, style, and potential bugs.";
    }

    const systemPrompt = `You are an expert code reviewer. Analyze the provided code and identify issues.
    
${focusInstructions}

Return your review in JSON format:
{
  "summary": "Brief overview of the review",
  "findings": [
    {
      "severity": "critical|warning|info",
      "category": "security|performance|style|bug|other",
      "message": "Description of the issue",
      "line": number (optional),
      "suggestion": "How to fix it (optional)"
    }
  ],
  "score": number (1-10 overall code quality),
  "strengths": ["list of good practices found"]
}

Be thorough but practical. Only report real issues.`;

    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();

    const { text } = await generateText({
      model: modelClient.model,
      system: systemPrompt,
      prompt: `File: ${filePath}\n\n\`\`\`${extension.replace(".", "")}\n${content}\n\`\`\``,
      temperature: 0.2,
    });

    // Parse the JSON response
    let reviewResult: {
      summary: string;
      findings: ReviewFinding[];
      score: number;
      strengths: string[];
    } | null = null;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewResult = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, create a basic result
      reviewResult = {
        summary: "Review completed but could not parse detailed findings.",
        findings: [],
        score: 5,
        strengths: [],
      };
    }

    if (!reviewResult) {
      throw new Error("Failed to generate code review");
    }

    // Format the review output
    const lines: string[] = [
      `## Code Review: ${fileName}`,
      `=================`,
      ``,
      `**Overall Score:** ${reviewResult.score}/10`,
      ``,
      `**Summary:** ${reviewResult.summary}`,
      ``,
    ];

    if (reviewResult.strengths && reviewResult.strengths.length > 0) {
      lines.push(`**Strengths:**`);
      for (const strength of reviewResult.strengths) {
        lines.push(`- ${strength}`);
      }
      lines.push("");
    }

    // Group findings by severity
    const critical = reviewResult.findings.filter(
      (f) => f.severity === "critical",
    );
    const warnings = reviewResult.findings.filter(
      (f) => f.severity === "warning",
    );
    const infos = reviewResult.findings.filter((f) => f.severity === "info");

    if (critical.length > 0) {
      lines.push(`## 🚨 Critical Issues (${critical.length})`);
      for (const finding of critical) {
        lines.push(`- **Line ${finding.line || "?"}**: ${finding.message}`);
        if (includeSuggestions && finding.suggestion) {
          lines.push(`  > Suggestion: ${finding.suggestion}`);
        }
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push(`## ⚠️ Warnings (${warnings.length})`);
      for (const finding of warnings) {
        lines.push(`- **Line ${finding.line || "?"}**: ${finding.message}`);
        if (includeSuggestions && finding.suggestion) {
          lines.push(`  > Suggestion: ${finding.suggestion}`);
        }
      }
      lines.push("");
    }

    if (infos.length > 0) {
      lines.push(`## ℹ️ Info (${infos.length})`);
      for (const finding of infos) {
        lines.push(`- **Line ${finding.line || "?"}**: ${finding.message}`);
        if (includeSuggestions && finding.suggestion) {
          lines.push(`  > Suggestion: ${finding.suggestion}`);
        }
      }
      lines.push("");
    }

    if (reviewResult.findings.length === 0) {
      lines.push("No issues found! Great code!");
    }

    const finalResult = lines.join("\n");

    // Send structured XML for UI

    const completeXml = `<dyad-status title="Code Review Complete">${escapeXmlContent(finalResult)}</dyad-status>`;
    ctx.onXmlComplete(completeXml);

    return finalResult;
  },
};
