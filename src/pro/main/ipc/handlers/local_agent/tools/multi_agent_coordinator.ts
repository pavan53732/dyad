import { z } from "zod";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

// Import core tools for sub-agents
import { writeFileTool } from "./write_file";
import { readFileTool } from "./read_file";
import { listFilesTool } from "./list_files";
import { searchReplaceTool } from "./search_replace";

const multiAgentCoordinatorSchema = z.object({
  task: z
    .string()
    .describe("High-level task to decompose and assign to multiple agents"),
  numAgents: z
    .number()
    .optional()
    .default(3)
    .describe("Number of parallel agents to spawn (default: 3)"),
  strategy: z
    .enum(["divide_conquer", "review", "consensus"])
    .optional()
    .default("divide_conquer")
    .describe(
      "Coordination strategy: divide_conquer (parallel work), review (agent reviews agent), consensus (vote on best)",
    ),
  aggregationPrompt: z
    .string()
    .optional()
    .describe("Optional prompt to aggregate results from multiple agents"),
});

interface _AgentResult {
  agentId: number;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
}

export const multiAgentCoordinatorTool: ToolDefinition<
  z.infer<typeof multiAgentCoordinatorSchema>
> = {
  name: "multi_agent_coordinator",
  description: `Coordinate multiple AI agents working in parallel on a complex task. Decomposes a task into subtasks, executes them concurrently, and aggregates results. Useful for parallel research, code generation across multiple files, or exploring different solution approaches.`,
  inputSchema: multiAgentCoordinatorSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Spawn ${args.numAgents || 3} parallel agents to work on: "${args.task.substring(0, 50)}..."`,

  buildXml: (args, isComplete) => {
    if (!args.task) return undefined;

    let xml = `<dyad-multi-agent task="${escapeXmlAttr(args.task.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-multi-agent>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      task,
      numAgents = 3,
      strategy = "divide_conquer",
      aggregationPrompt,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Multi-Agent Coordinator">Starting ${numAgents} agents with strategy: ${strategy}</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // 1. Decompose the task into subtasks
    ctx.onXmlStream(
      `<dyad-status title="Task Decomposition">Breaking down task into ${numAgents} subtasks...</dyad-status>`,
    );

    const decompositionPrompt = `Decompose the following task into ${numAgents} independent subtasks that can be executed in parallel.
Each subtask should be self-contained and not depend on the output of other subtasks.

Task: ${task}

Return a JSON array of subtask objects with "id", "description", and "approach" fields:
[
  {"id": 1, "description": "...", "approach": "..."},
  ...
]`;

    const { text: decompositionText } = await generateText({
      model: modelClient.model,
      prompt: decompositionPrompt,
      temperature: 0.3,
    });

    // Parse subtasks from the response
    let subtasks: { id: number; description: string; approach: string }[] = [];
    try {
      const jsonMatch = decompositionText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        subtasks = JSON.parse(jsonMatch[0]);
      }
    } catch  {
      // Fallback: create simple subtasks
      subtasks = Array.from({ length: numAgents }, (_, i) => ({
        id: i + 1,
        description: `Subtask ${i + 1}: Part of "${task}"`,
        approach: "Work on this portion of the task independently",
      }));
    }

    ctx.onXmlStream(
      `<dyad-status title="Multi-Agent Coordinator">Executing ${subtasks.length} subtasks in parallel...</dyad-status>`,
    );

    // 2. Execute subtasks in parallel using Promise.all
    const agentPromises = subtasks.map(async (subtask, index) => {
      const agentId = index + 1;

      ctx.onXmlStream(
        `<dyad-status title="Agent ${agentId}/${subtasks.length}">Starting: ${escapeXmlAttr(subtask.description)}</dyad-status>`,
      );

      try {
        // Each sub-agent gets a focused system prompt
        const agentSystemPrompt = `You are Agent ${agentId} of a multi-agent team. Your role is to complete your assigned subtask independently.
        
Main Task: ${task}

Your Subtask: ${subtask.description}
Approach: ${subtask.approach}

You have access to file operations (read, write, search_replace), list_files, and code search tools.
Complete your subtask and provide a summary of what you accomplished.`;

        const { text: agentResult } = await generateText({
          model: modelClient.model,
          system: agentSystemPrompt,
          prompt: `Complete subtask ${agentId}: ${subtask.description}`,
          tools: {
            write_file: {
              description: writeFileTool.description,
              inputSchema: writeFileTool.inputSchema as any,
              execute: async (toolArgs: any) =>
                writeFileTool.execute(toolArgs, ctx),
            },
            read_file: {
              description: readFileTool.description,
              inputSchema: readFileTool.inputSchema as any,
              execute: async (toolArgs: any) =>
                readFileTool.execute(toolArgs, ctx),
            },
            list_files: {
              description: listFilesTool.description,
              inputSchema: listFilesTool.inputSchema as any,
              execute: async (toolArgs: any) =>
                listFilesTool.execute(toolArgs, ctx),
            },
            search_replace: {
              description: searchReplaceTool.description,
              inputSchema: searchReplaceTool.inputSchema as any,
              execute: async (toolArgs: any) =>
                searchReplaceTool.execute(toolArgs, ctx),
            },
          },
        });

        ctx.onXmlStream(
          `<dyad-status title="Agent ${agentId} Complete">Finished subtask ${agentId}</dyad-status>`,
        );

        return {
          agentId,
          status: "completed" as const,
          result: agentResult,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.onXmlStream(
          `<dyad-status title="Agent ${agentId} Failed">Error: ${escapeXmlAttr(errorMsg)}</dyad-status>`,
        );

        return {
          agentId,
          status: "failed" as const,
          error: errorMsg,
        };
      }
    });

    // Wait for all agents to complete
    const results = await Promise.all(agentPromises);

    // 3. Aggregate results based on strategy
    ctx.onXmlStream(
      `<dyad-status title="Aggregating Results">Combining outputs from ${results.length} agents...</dyad-status>`,
    );

    let finalResult: string;
    const completedResults = results.filter((r) => r.status === "completed");
    const failedResults = results.filter((r) => r.status === "failed");

    if (strategy === "divide_conquer") {
      // Simple concatenation of all results
      const aggregated = completedResults
        .map((r) => `## Agent ${r.agentId} Result\n\n${r.result}`)
        .join("\n\n---\n\n");

      finalResult = aggregated;
    } else if (strategy === "review") {
      // One agent reviews all results
      const reviewPrompt = `You are a senior reviewer. Review the following solutions from multiple agents and provide feedback.
      
Original Task: ${task}

${completedResults.map((r) => `### Agent ${r.agentId} Solution:\n${r.result}`).join("\n\n")}

${aggregationPrompt || "Provide a summary of the best approaches and any issues found."}`;

      const { text: reviewResult } = await generateText({
        model: modelClient.model,
        prompt: reviewPrompt,
        temperature: 0.2,
      });

      finalResult = reviewResult;
    } else if (strategy === "consensus") {
      // Agents vote on the best approach
      const consensusPrompt = `Given the following solutions from multiple agents for the task: ${task}

${completedResults.map((r) => `Agent ${r.agentId}: ${r.result}`).join("\n\n")}

${aggregationPrompt || "Synthesize these approaches into a single best solution. Explain your reasoning."}`;

      const { text: consensusResult } = await generateText({
        model: modelClient.model,
        prompt: consensusPrompt,
        temperature: 0.2,
      });

      finalResult = consensusResult;
    } else {
      finalResult = completedResults.map((r) => r.result).join("\n\n");
    }

    // 4. Format final output
    const summaryLines = [
      `Multi-Agent Coordination Complete`,
      `===================`,
      ``,
      `Strategy: ${strategy}`,
      `Total Agents: ${results.length}`,
      `Successful: ${completedResults.length}`,
      `Failed: ${failedResults.length}`,
      ``,
      `---`,
      ``,
      finalResult,
    ];

    if (failedResults.length > 0) {
      summaryLines.push(`\n---`);
      summaryLines.push(`\nFailed Agents:`);
      for (const r of failedResults) {
        summaryLines.push(`- Agent ${r.agentId}: ${r.error}`);
      }
    }

    const finalSummary = summaryLines.join("\n");
    ctx.onXmlComplete(
      `<dyad-status title="Multi-Agent Complete">${escapeXmlContent(finalSummary)}</dyad-status>`,
    );

    return finalSummary;
  },
};
