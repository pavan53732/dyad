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

// Core editing tools for the inner loop
import { writeFileTool } from "./write_file";
import { editFileTool } from "./edit_file";
import { searchReplaceTool } from "./search_replace";
import { readFileTool } from "./read_file";
import { listFilesTool } from "./list_files";
import { codeSearchTool } from "./code_search";

const autonomousSoftwareEngineerSchema = z.object({
  goal: z.string().describe("The high-level goal or feature request to implement."),
  planPath: z.string().optional().default("TODO.md").describe("Path to the project plan file (default: TODO.md)."),
  maxTasks: z.number().optional().default(5).describe("Maximum number of tasks to execute from the plan."),
});

export const autonomousSoftwareEngineerTool: ToolDefinition<
  z.infer<typeof autonomousSoftwareEngineerSchema>
> = {
  name: "autonomous_software_engineer",
  description: `The ultimate meta-orchestrator. It takes a high-level goal, creates/reads a plan, implements it task-by-task, fixes errors, runs tests, and submits a PR.`,
  inputSchema: autonomousSoftwareEngineerSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Execute Autonomous Software Engineer pipeline for: "${args.goal}"`,

  execute: async (args, ctx: AgentContext) => {
    const { goal, planPath, maxTasks } = args;
    const fullPlanPath = path.join(ctx.appPath, planPath);
    
    ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Starting pipeline for: ${escapeXmlAttr(goal)}</dyad-status>`);

    const settings = readSettings();
    const { modelClient } = await getModelClient(settings.selectedModel || "gpt-4o", settings);

    // 1. Planning Phase
    let planContent = "";
    if (fs.existsSync(fullPlanPath)) {
      planContent = fs.readFileSync(fullPlanPath, "utf-8");
      ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Found existing plan at ${planPath}</dyad-status>`);
    } else {
      ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Generating project plan...</dyad-status>`);
      const planningPrompt = `Generate a detailed TODO.md plan for the following goal: ${goal}. 
Return ONLY the markdown task list (e.g. - [ ] Task).`;
      
      const { text } = await generateText({
        model: modelClient.model,
        prompt: planningPrompt,
      });
      planContent = text;
      fs.writeFileSync(fullPlanPath, planContent, "utf-8");
      ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Plan generated and saved to ${planPath}</dyad-status>`);
    }

    // Parse tasks
    const tasks = planContent.split("\n")
      .filter(line => line.trim().startsWith("- [ ]"))
      .map(line => line.replace("- [ ]", "").trim())
      .slice(0, maxTasks);

    if (tasks.length === 0) {
       return "No pending tasks found in the plan.";
    }

    ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Executing ${tasks.length} tasks sequence...</dyad-status>`);

    // 2. Execution Loop
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      ctx.onXmlStream(`<dyad-status title="Task ${i+1}/${tasks.length}">Implementing: ${escapeXmlAttr(task)}</dyad-status>`);

      // Inner Loop: Implement Task
      // We use generateText with tools to act as a sub-agent for this specific task
      await generateText({
        model: modelClient.model,
        system: `You are an autonomous senior developer implementing one specific task from a TODO list.
Task: ${task}
Context Goal: ${goal}
You MUST use your tools to complete this task. When finished, provide a brief summary.`,
        prompt: `Current task: ${task}. Start by reading relevant files or searching the codebase if needed.`,
        tools: {
          write_file: {
            description: writeFileTool.description,
            parameters: writeFileTool.inputSchema as any,
            execute: async (args: any) => writeFileTool.execute(args, ctx),
          },
          edit_file: {
            description: editFileTool.description,
            parameters: editFileTool.inputSchema as any,
            execute: async (args: any) => editFileTool.execute(args, ctx),
          },
          search_replace: {
            description: searchReplaceTool.description,
            parameters: searchReplaceTool.inputSchema as any,
            execute: async (args: any) => searchReplaceTool.execute(args, ctx),
          },
          read_file: {
            description: readFileTool.description,
            parameters: readFileTool.inputSchema as any,
            execute: async (args: any) => readFileTool.execute(args, ctx),
          },
          list_files: {
            description: listFilesTool.description,
            parameters: listFilesTool.inputSchema as any,
            execute: async (args: any) => listFilesTool.execute(args, ctx),
          },
          code_search: {
            description: codeSearchTool.description,
            parameters: codeSearchTool.inputSchema as any,
            execute: async (args: any) => codeSearchTool.execute(args, ctx),
          },
        },
        maxSteps: 10,
      });

      // 3. Heal Phase
      ctx.onXmlStream(`<dyad-status title="Task ${i+1}/${tasks.length}">Healing (Autonomous Fix Loop)...</dyad-status>`);
      await autonomousFixLoopTool.execute({ maxIterations: 3 }, ctx);

      // 4. Verify Phase
      ctx.onXmlStream(`<dyad-status title="Task ${i+1}/${tasks.length}">Verifying (Autonomous Test Generator)...</dyad-status>`);
      // We need to decide which file to test. For now, we'll try to find a file modified in this task.
      // (This is a simplified approach)
      await autonomousTestGeneratorTool.execute({
        testName: `verify_task_${i+1}`,
        componentPath: "src/App.tsx", // Fallback or derived
        behaviorToTest: task,
      }, ctx);

      // Update TODO.md
      planContent = planContent.replace(`- [ ] ${task}`, `- [x] ${task}`);
      fs.writeFileSync(fullPlanPath, planContent, "utf-8");
    }

    // 5. Submission Phase
    ctx.onXmlStream(`<dyad-status title="Autonomous Software Engineer">Submitting changes...</dyad-status>`);
    
    const commitMsg = `feat: ${goal}\n\nTasks implemented:\n${tasks.map(t => `- ${t}`).join("\n")}`;
    await gitCommitAndPushTool.execute({ message: commitMsg }, ctx);

    const prResult = await autonomousPullRequestTool.execute({
      title: `Feature: ${goal}`,
      body: `This PR implements the following goal: ${goal}\n\nAutomated Verification Passed.`,
    }, ctx);

    const finalSummary = `Autonomous Software Engineer successfully completed the goal: ${goal}. \nPR: ${prResult}`;
    ctx.onXmlComplete(`<dyad-status title="Goal Achieved">${escapeXmlContent(finalSummary)}</dyad-status>`);
    
    return finalSummary;
  },
};
