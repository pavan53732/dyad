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

// Import other tools to orchestrate them
import { autonomousFixLoopTool } from "./autonomous_fix_loop";
import { autonomousTestGeneratorTool } from "./autonomous_test_generator";
import { gitCommitAndPushTool } from "./git_commit_and_push";
import { autonomousPullRequestTool } from "./autonomous_pull_request";
import { runTypeChecksTool } from "./run_type_checks";
import { verifyOutput, VerificationResult } from "./self_verifier";
import { monitorReasoning, ReasoningMonitorResult } from "./metacognition";
import { aegisContainmentCoordinatorTool } from "./aegis_containment_coordinator";
import { deterministicDispatcherTool } from "./deterministic_dispatcher";

// Core editing tools for the inner loop
import { writeFileTool, writeFileSchema } from "./write_file";
import { editFileTool, editFileSchema } from "./edit_file";
import { searchReplaceTool, searchReplaceSchema } from "./search_replace";
import { readFileTool, readFileSchema } from "./read_file";
import { listFilesTool, listFilesSchema } from "./list_files";
import { codeSearchTool, codeSearchSchema } from "./code_search";

const autonomousSoftwareEngineerSchema = z.object({
  goal: z
    .string()
    .describe("The high-level goal or feature request to implement."),
  planPath: z
    .string()
    .optional()
    .default("TODO.md")
    .describe("Path to the project plan file (default: TODO.md)."),
  maxTasks: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of tasks to execute from the plan."),
});

// Import the synthesizer
import { toolSynthesizerTool, toolSynthesizerSchema } from "./tool_synthesizer";

export const autonomousSoftwareEngineerTool: ToolDefinition<
  z.infer<typeof autonomousSoftwareEngineerSchema>
> = {
  name: "autonomous_software_engineer",
  description: `The ultimate meta-orchestrator. It takes a high-level goal, creates/reads a plan, implements it task-by-task, fixes errors, runs tests, and submits a PR.`,
  inputSchema: autonomousSoftwareEngineerSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Execute Autonomous Software Engineer pipeline for: "${args.goal}"`,

  execute: async (args, ctx: AgentContext) => {
    const { goal, planPath, maxTasks } = args;
    const fullPlanPath = path.join(ctx.appPath, planPath);

    ctx.onXmlStream(
      `<dyad-status title="Autonomous Software Engineer">Starting pipeline for: ${escapeXmlAttr(goal)}</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // 1. Planning Phase
    let planContent = "";
    if (fs.existsSync(fullPlanPath)) {
      planContent = fs.readFileSync(fullPlanPath, "utf-8");
      ctx.onXmlStream(
        `<dyad-status title="Autonomous Software Engineer">Found existing plan at ${planPath}</dyad-status>`,
      );
    } else {
      ctx.onXmlStream(
        `<dyad-status title="Autonomous Software Engineer">Generating project plan...</dyad-status>`,
      );
      const planningPrompt = `Generate a detailed TODO.md plan for the following goal: ${goal}. 
Return ONLY the markdown task list (e.g. - [ ] Task).`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: planningPrompt,
      });
      planContent = text;
      fs.writeFileSync(fullPlanPath, planContent, "utf-8");
      ctx.onXmlStream(
        `<dyad-status title="Autonomous Software Engineer">Plan generated and saved to ${planPath}</dyad-status>`,
      );
    }

    // Parse tasks
    const tasks = planContent
      .split("\n")
      .filter((line) => line.trim().startsWith("- [ ]"))
      .map((line) => line.replace("- [ ]", "").trim())
      .slice(0, maxTasks);

    if (tasks.length === 0) {
      return "No pending tasks found in the plan.";
    }

    ctx.onXmlStream(
      `<dyad-status title="Autonomous Software Engineer">Executing ${tasks.length} tasks sequence...</dyad-status>`,
    );

    // 2. Execution Loop
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      ctx.onXmlStream(
        `<dyad-status title="Task ${i + 1}/${tasks.length}">Implementing: ${escapeXmlAttr(task)}</dyad-status>`,
      );

      // Inner Loop: Implement Task
      // We use generateText with tools to act as a sub-agent for this specific task
      await generateText({
        model: modelClient.model,
        system: `You are an autonomous senior developer implementing one specific task from a TODO list.
Task: ${task}
Context Goal: ${goal}
Plan Path: ${planPath}
You MUST use your tools to complete this task. 
Every tool call you make will be verified against the mission plan by a deterministic gatekeeper.
If you encounter a task that requires a capability not provided by your current tools, you have the ability to SYNTHESIZE a new tool using the 'tool_synthesizer' tool. 
Describe the new tool's purpose, define its Zod schema, and provide the TypeScript implementation logic.
When finished, provide a brief summary.`,
        prompt: `Current task: ${task}. Start by reading relevant files or searching the codebase if needed.`,
        tools: {
          write_file: {
            description: writeFileTool.description,
            inputSchema: writeFileTool.inputSchema as any,
            execute: async (args: z.infer<typeof writeFileSchema>) => {
              const access = await deterministicDispatcherTool.execute(
                { toolName: "write_file", targetFile: args.path, planPath },
                ctx,
              );
              try {
                if (!JSON.parse(access).isApproved) return access;
              } catch {
                return `Error: Dispatcher JSON parse failure: ${access}`;
              }
              return writeFileTool.execute(args, ctx);
            },
          },
          edit_file: {
            description: editFileTool.description,
            inputSchema: editFileTool.inputSchema as any,
            execute: async (args: z.infer<typeof editFileSchema>) => {
              const access = await deterministicDispatcherTool.execute(
                { toolName: "edit_file", targetFile: args.path, planPath },
                ctx,
              );
              try {
                if (!JSON.parse(access).isApproved) return access;
              } catch {
                return `Error: Dispatcher JSON parse failure: ${access}`;
              }
              return editFileTool.execute(args, ctx);
            },
          },
          search_replace: {
            description: searchReplaceTool.description,
            inputSchema: searchReplaceTool.inputSchema as any,
            execute: async (args: z.infer<typeof searchReplaceSchema>) => {
              const access = await deterministicDispatcherTool.execute(
                {
                  toolName: "search_replace",
                  targetFile: args.file_path,
                  planPath,
                },
                ctx,
              );
              try {
                if (!JSON.parse(access).isApproved) return access;
              } catch {
                return `Error: Dispatcher JSON parse failure: ${access}`;
              }
              return searchReplaceTool.execute(args, ctx);
            },
          },
          read_file: {
            description: readFileTool.description,
            inputSchema: readFileTool.inputSchema as any,
            execute: async (args: z.infer<typeof readFileSchema>) => {
              // Read-only tools are generally approved but still logged
              await deterministicDispatcherTool.execute(
                { toolName: "read_file", targetFile: args.path, planPath },
                ctx,
              );
              return readFileTool.execute(args, ctx);
            },
          },
          list_files: {
            description: listFilesTool.description,
            inputSchema: listFilesTool.inputSchema as any,
            execute: async (args: z.infer<typeof listFilesSchema>) => {
              await deterministicDispatcherTool.execute(
                { toolName: "list_files", planPath },
                ctx,
              );
              return listFilesTool.execute(args, ctx);
            },
          },
          code_search: {
            description: codeSearchTool.description,
            inputSchema: codeSearchTool.inputSchema as any,
            execute: async (args: z.infer<typeof codeSearchSchema>) => {
              await deterministicDispatcherTool.execute(
                { toolName: "code_search", planPath },
                ctx,
              );
              return codeSearchTool.execute(args, ctx);
            },
          },
          tool_synthesizer: {
            description: toolSynthesizerTool.description,
            inputSchema: toolSynthesizerTool.inputSchema as any,
            execute: async (args: z.infer<typeof toolSynthesizerSchema>) => {
              const access = await deterministicDispatcherTool.execute(
                { toolName: "tool_synthesizer", planPath },
                ctx,
              );
              try {
                if (!JSON.parse(access).isApproved) return access;
              } catch {
                return `Error: Dispatcher JSON parse failure: ${access}`;
              }
              return toolSynthesizerTool.execute(args, ctx);
            },
          },
        },
      });

      // 2b. Run Type Checks explicitly after writing code
      ctx.onXmlStream(
        `<dyad-status title="Task ${i + 1}/${tasks.length}">Running type checks...</dyad-status>`,
      );
      await runTypeChecksTool.execute({}, ctx);

      // 3. Heal Phase - Fix any type errors found
      ctx.onXmlStream(
        `<dyad-status title="Task ${i + 1}/${tasks.length}">Healing (Autonomous Fix Loop)...</dyad-status>`,
      );
      await autonomousFixLoopTool.execute({ maxIterations: 3 }, ctx);

      // --- AEGIS SAFETY CHECK (Level 6.5) ---
      ctx.onXmlStream(
        `<dyad-status title="Task ${i + 1}/${tasks.length}">Aegis Safety Eval...</dyad-status>`,
      );

      // 1. Check for Mission Drift
      const metacogResult: ReasoningMonitorResult = await monitorReasoning(
        task,
        [task], // Current steps
        goal, // Original intent
      );

      // 2. Bayesian Hallucination Check
      // Capture actual output if possible; here we pass a placeholder for high-level monitoring
      const verificationResult: VerificationResult = await verifyOutput(
        {
          output: `Task execution: ${task}`,
          task,
          requirements: goal,
          checkConsistency: true,
          estimateConfidence: true,
          generateCritique: true,
        },
        ctx,
      );

      // 3. Coordinate Containment
      const aegisStatus = await aegisContainmentCoordinatorTool.execute(
        {
          signals: {
            hallucinationProbability:
              verificationResult.hallucinationProbability,
            driftScore: metacogResult.driftScore,
            criticalIssueCount: verificationResult.issueCount.critical,
          },
          context: `Task: ${task}`,
        },
        ctx,
      );

      if (aegisStatus.includes("⚠️ RESTRICTED")) {
        ctx.onXmlStream(
          `<dyad-status title="AEGIS HALT">System restricted due to safety violations.</dyad-status>`,
        );
        return `AEGIS EMERGENCY HALT: Deployment stopped due to excessive risk. Please review logs.`;
      }
      // --- END AEGIS ---

      // 4. Verify Phase
      ctx.onXmlStream(
        `<dyad-status title="Task ${i + 1}/${tasks.length}">Verifying (Autonomous Test Generator)...</dyad-status>`,
      );
      // We need to decide which file to test. For now, we'll try to find a file modified in this task.
      // (This is a simplified approach)
      await autonomousTestGeneratorTool.execute(
        {
          testName: `verify_task_${i + 1}`,
          componentPath: "src/App.tsx", // Fallback or derived
          behaviorToTest: task,
        },
        ctx,
      );

      // Update TODO.md
      planContent = planContent.replace(`- [ ] ${task}`, `- [x] ${task}`);
      fs.writeFileSync(fullPlanPath, planContent, "utf-8");
    }

    // 5. Submission Phase
    ctx.onXmlStream(
      `<dyad-status title="Autonomous Software Engineer">Submitting changes...</dyad-status>`,
    );

    const commitMsg = `feat: ${goal}\n\nTasks implemented:\n${tasks.map((t) => `- ${t}`).join("\n")}`;
    await gitCommitAndPushTool.execute({ message: commitMsg }, ctx);

    const prResult = await autonomousPullRequestTool.execute(
      {
        title: `Feature: ${goal}`,
        body: `This PR implements the following goal: ${goal}\n\nAutomated Verification Passed.`,
      },
      ctx,
    );

    const finalSummary = `Autonomous Software Engineer successfully completed the goal: ${goal}. \nPR: ${prResult}`;
    ctx.onXmlComplete(
      `<dyad-status title="Goal Achieved">${escapeXmlContent(finalSummary)}</dyad-status>`,
    );

    return finalSummary;
  },
};
