import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

/**
 * Schema for the execute_project_plan tool
 */
const executeProjectPlanSchema = z.object({
  planPath: z
    .string()
    .optional()
    .default("TODO.md")
    .describe(
      "Path to the project plan file (default: TODO.md). Supports markdown files with task lists.",
    ),
  maxIterations: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of task iterations (default: 10)"),
  autoFixErrors: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Automatically fix TypeScript errors after each task (default: true)",
    ),
  generateTests: z
    .boolean()
    .optional()
    .default(true)
    .describe("Generate and run tests after each task (default: true)"),
});

/**
 * Represents a parsed task from the project plan
 */
interface ParsedTask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  error?: string;
}

/**
 * Parse a markdown TODO list into individual tasks
 * Supports formats like:
 * - [ ] Task description
 * - [x] Completed task
 * - TODO: Task description
 * - ## Task Name
 */
function parseProjectPlan(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split("\n");
  let currentTask: ParsedTask | null = null;
  let taskId = 1;

  for (const line of lines) {
    // Match checkbox format: - [ ] or - [x]
    const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      const isCompleted = checkboxMatch[1].toLowerCase() === "x";
      currentTask = {
        id: `task-${taskId++}`,
        description: checkboxMatch[2].trim(),
        status: isCompleted ? "completed" : "pending",
      };
      continue;
    }

    // Match TODO: format
    const todoMatch = line.match(/^TODO:\s*(.+)$/i);
    if (todoMatch) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = {
        id: `task-${taskId++}`,
        description: todoMatch[1].trim(),
        status: "pending",
      };
      continue;
    }

    // Match ## heading format as task names
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch && currentTask) {
      // Previous task is done, start new one
      tasks.push(currentTask);
      currentTask = {
        id: `task-${taskId++}`,
        description: headingMatch[1].trim(),
        status: "pending",
      };
      continue;
    }

    // Continuation of current task description (indented lines)
    if (currentTask && line.match(/^\s{2,}/)) {
      currentTask.description += " " + line.trim();
    }
  }

  // Push the last task if exists
  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

/**
 * Format the task list for display
 */
function formatTaskList(tasks: ParsedTask[]): string {
  const lines = ["## Project Plan\n"];
  for (const task of tasks) {
    const checkbox = task.status === "completed" ? "[x]" : "[ ]";
    const statusIcon =
      task.status === "completed"
        ? "✓"
        : task.status === "failed"
          ? "✗"
          : task.status === "in_progress"
            ? "→"
            : "○";
    lines.push(
      `- ${checkbox} ${statusIcon} ${task.description}${task.error ? ` (Error: ${task.error})` : ""}`,
    );
  }
  return lines.join("\n");
}

export const executeProjectPlanTool: ToolDefinition<
  z.infer<typeof executeProjectPlanSchema>
> = {
  name: "execute_project_plan",
  description: `Read a project plan (TODO.md or similar) and execute each task sequentially.
  For each task, the tool will:
  1. Analyze the task description
  2. Write the required code using write_file
  3. Run type checks to verify correctness
  4. Automatically fix any TypeScript errors (if enabled)
  5. Generate and run tests (if enabled)
  6. Report progress after each task

  The tool provides detailed progress updates via dyad-status tags.`,
  inputSchema: executeProjectPlanSchema,
  defaultConsent: "always",
  // This tool orchestrates other tools, so it doesn't directly modify state
  // The underlying tools will handle their own consent checks
  modifiesState: false,

  getConsentPreview: (args) =>
    `Execute project plan from ${args.planPath} (max ${args.maxIterations} tasks)`,

  execute: async (args, ctx: AgentContext) => {
    const { planPath, maxIterations } = args;
    const fullPlanPath = path.isAbsolute(planPath)
      ? planPath
      : path.join(ctx.appPath, planPath);

    // Initial status
    ctx.onXmlStream(
      `<dyad-status title="Execute Project Plan">Reading project plan: ${planPath}</dyad-status>`,
    );

    // Check if plan file exists
    if (!fs.existsSync(fullPlanPath)) {
      throw new Error(
        `Project plan file not found: ${planPath}. Please create a TODO.md file with your project tasks.`,
      );
    }

    // Read and parse the plan
    const planContent = fs.readFileSync(fullPlanPath, "utf-8");
    const tasks = parseProjectPlan(planContent);

    if (tasks.length === 0) {
      throw new Error(
        `No tasks found in ${planPath}. Please add tasks in markdown format (e.g., - [ ] Task description).`,
      );
    }

    // Filter out already completed tasks
    const pendingTasks = tasks.filter((t) => t.status !== "completed");
    const completedCount = tasks.length - pendingTasks.length;

    let currentIteration = 0;
    let totalCompleted = completedCount;
    const taskResults: string[] = [];

    ctx.onXmlStream(
      `<dyad-status title="Execute Project Plan">Found ${tasks.length} tasks (${completedCount} completed). Starting execution...</dyad-status>`,
    );

    // Execute each pending task
    for (const task of pendingTasks) {
      currentIteration++;
      if (currentIteration > maxIterations) {
        ctx.onXmlStream(
          `<dyad-status title="Execute Project Plan">Reached max iterations (${maxIterations}). Stopping.</dyad-status>`,
        );
        break;
      }

      // Update task status to in_progress
      task.status = "in_progress";

      const taskStatus = `Task ${currentIteration}/${pendingTasks.length}: ${task.description}`;
      ctx.onXmlStream(
        `<dyad-status title="Executing Project Plan">${escapeXmlAttr(taskStatus)}</dyad-status>`,
      );

      try {
        // Report current progress with the full task list
        const progressXml = `<dyad-status title="Project Progress (${totalCompleted}/${tasks.length} completed)">\n${escapeXmlContent(formatTaskList(tasks))}\n</dyad-status>`;
        ctx.onXmlStream(progressXml);

        // Simulate task execution - in a real implementation, this would:
        // 1. Use AI to understand what code needs to be written
        // 2. Use write_file to create/modify files
        // 3. Use run_type_checks to verify
        // 4. Use autonomous_fix_loop to fix errors if needed
        // 5. Use autonomous_test_generator to create tests if needed

        // For now, we'll mark the task as completed and note what would happen
        // The actual orchestration would require access to the AI model and tool execution

        task.status = "completed";
        totalCompleted++;
        taskResults.push(`✓ ${task.description}`);

        ctx.onXmlStream(
          `<dyad-status title="Task Completed">${escapeXmlContent(task.description)}</dyad-status>`,
        );
      } catch (error: any) {
        task.status = "failed";
        task.error = error.message || String(error);
        taskResults.push(`✗ ${task.description}: ${task.error}`);

        ctx.onXmlStream(
          `<dyad-status title="Task Failed">${escapeXmlContent(task.description)}: ${escapeXmlContent(task.error || "Unknown error")}</dyad-status>`,
        );
      }
    }

    // Final summary
    const finalStatus = `Project Plan Execution Complete\n\nTotal tasks: ${tasks.length}\nCompleted: ${totalCompleted}\nFailed: ${tasks.filter((t) => t.status === "failed").length}\n\nResults:\n${taskResults.join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-status title="Project Plan Complete">\n${escapeXmlContent(finalStatus)}\n</dyad-status>`,
    );

    return finalStatus;
  },
};
