import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlContent,
} from "./types";
import { generateProblemReport } from "@/ipc/processors/tsc";
import { applySearchReplace } from "@/pro/main/ipc/processors/search_replace_processor";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

const autonomousFixLoopSchema = z.object({
  maxIterations: z.number().optional().default(3).describe("Maximum number of fix-and-check iterations."),
});

export const autonomousFixLoopTool: ToolDefinition<
  z.infer<typeof autonomousFixLoopSchema>
> = {
  name: "autonomous_fix_loop",
  description: `Automatically run TypeScript type checks, analyze errors, and attempt to fix them in a loop without user intervention.`,
  inputSchema: autonomousFixLoopSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Run autonomous TSC fix loop (max ${args.maxIterations} iterations)`,

  execute: async (args, ctx: AgentContext) => {
    let currentIteration = 1;
    let totalFixed = 0;
    const maxIterations = args.maxIterations;

    const settings = readSettings();
    const selectedModel = settings.selectedModel;
    if (!selectedModel) {
      throw new Error("No model selected in settings.");
    }
    const { modelClient } = await getModelClient(selectedModel, settings);

    while (currentIteration <= maxIterations) {
      ctx.onXmlStream(
        `<dyad-status title="Autonomous Fix Loop (Iteration ${currentIteration}/${maxIterations})">Running type checks...</dyad-status>`,
      );

      const report = await generateProblemReport({
        fullResponse: "", // Virtual changes not used here
        appPath: ctx.appPath,
      });

      if (report.problems.length === 0) {
        const successMsg = `No type errors found. Project is clean after ${currentIteration - 1} iterations.`;
        ctx.onXmlComplete(`<dyad-status title="Autonomous Fix Loop: Success">${escapeXmlContent(successMsg)}</dyad-status>`);
        return successMsg;
      }

      ctx.onXmlStream(
        `<dyad-status title="Autonomous Fix Loop (Iteration ${currentIteration}/${maxIterations})">Found ${report.problems.length} errors. Attempting fixes...</dyad-status>`,
      );

      // Group problems by file
      const problemsByFile = new Map<string, string[]>();
      for (const p of report.problems) {
        if (!p.file) continue;
        const list = problemsByFile.get(p.file) || [];
        list.push(`${p.line}:${p.column} - ${p.message} (${p.code})`);
        problemsByFile.set(p.file, list);
      }

      let iterationFixed = 0;
      for (const [file, errors] of problemsByFile.entries()) {
        const fullPath = path.isAbsolute(file) ? file : path.join(ctx.appPath, file);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, "utf-8");
        
        const systemPrompt = `You are an autonomous senior developer tasked with fixing TypeScript errors.
Apply fixes using SEARCH/REPLACE blocks.

Format:
<<<<<<< SEARCH
[exact code to find]
=======
[fixed code]
>>>>>>> REPLACE

Keep fixes minimal and correct. Do not use placeholders.`;

        const userPrompt = `File: ${file}\n\nCurrent Errors:\n${errors.join("\n")}\n\nFile Content:\n\`\`\`typescript\n${content}\n\`\`\``;

        const { text } = await generateText({
          model: modelClient.model,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.2,
        });

        const result = applySearchReplace(content, text);
        if (result.success && result.content) {
          fs.writeFileSync(fullPath, result.content, "utf-8");
          iterationFixed++;
          totalFixed++;
        }
      }

      if (iterationFixed === 0) {
        const failMsg = `Failed to make any progress in iteration ${currentIteration}. Stopping.`;
        ctx.onXmlComplete(`<dyad-status title="Autonomous Fix Loop: Stalled">${escapeXmlContent(failMsg)}</dyad-status>`);
        return failMsg;
      }

      currentIteration++;
    }

    const finalMsg = `Reached max iterations (${maxIterations}). Fixed ${totalFixed} files total. Remaining errors may exist.`;
    ctx.onXmlComplete(`<dyad-status title="Autonomous Fix Loop: Completed">${escapeXmlContent(finalMsg)}</dyad-status>`);
    return finalMsg;
  },
};
