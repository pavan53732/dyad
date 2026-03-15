import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { ToolDefinition, AgentContext } from "./types";

const ToolAccessArgs = z.object({
  toolName: z.string().describe("The name of the tool intended to be called"),
  targetFile: z
    .string()
    .optional()
    .describe("The file path the tool will interact with"),
  planPath: z
    .string()
    .optional()
    .default("TODO.md")
    .describe("Path to the mission plan (TODO.md)"),
});

type ToolAccessArgs = z.infer<typeof ToolAccessArgs>;

interface ValidationResult {
  isApproved: boolean;
  reason: string;
  mappedTask?: string;
}

/**
 * Deterministic Dispatcher (Mechanism 171)
 * Enforces Tool-Access Trust by verifying calls against the Mission Plan.
 */
function validateToolAccess(
  args: ToolAccessArgs,
  ctx: AgentContext,
): ValidationResult {
  const fullPlanPath = path.normalize(
    path.isAbsolute(args.planPath)
      ? args.planPath
      : path.join(ctx.appPath, args.planPath),
  );

  // Security check: Ensure the plan path stays within the project directory
  if (!fullPlanPath.startsWith(path.normalize(ctx.appPath))) {
    return {
      isApproved: false,
      reason:
        "Security violation: Mission Plan path escapes the project directory.",
    };
  }

  if (!fs.existsSync(fullPlanPath)) {
    return {
      isApproved: false,
      reason: `Mission Plan not found at ${args.planPath}. No tool calls allowed without an approved plan.`,
    };
  }

  let planContent: string;
  try {
    planContent = fs.readFileSync(fullPlanPath, "utf-8");
  } catch (error) {
    return {
      isApproved: false,
      reason: `Failed to read mission plan: ${error}. Engineering access blocked.`,
    };
  }
  const lines = planContent.split("\n");

  // Extract active tasks (not completed)
  const activeTasks = lines
    .filter((line) => line.includes("[ ]"))
    .map((line) =>
      line
        .replace(/[-*]\s+\[ \]\s+/, "")
        .trim()
        .toLowerCase(),
    );

  if (activeTasks.length === 0) {
    return {
      isApproved: false,
      reason:
        "No active tasks found in the Mission Plan. Current mission is completed or undefined.",
    };
  }

  const toolLower = args.toolName.toLowerCase();
  const fileLower = args.targetFile?.toLowerCase() || "";

  // Strategy: Semantic mapping of tool functions to task descriptions
  // e.g., "write_file" to "Implement ...", "run_command" to "Build ...", etc.
  for (const task of activeTasks) {
    // 1. Direct command match
    if (task.includes(toolLower)) {
      return {
        isApproved: true,
        reason: "Direct tool reference found in task.",
        mappedTask: task,
      };
    }

    // 2. Functional mapping
    const fileBase = fileLower ? path.basename(fileLower) : "";
    if (fileBase && task.includes(fileBase)) {
      return {
        isApproved: true,
        reason: `Target file ${fileBase} is mentioned in the active task.`,
        mappedTask: task,
      };
    }

    // 3. Generic action mapping
    if (toolLower === "write_file" || toolLower === "replace_file_content") {
      if (
        task.startsWith("implement") ||
        task.startsWith("create") ||
        task.startsWith("add") ||
        task.startsWith("fix")
      ) {
        return {
          isApproved: true,
          reason: "File mutation is consistent with implementation/fix task.",
          mappedTask: task,
        };
      }
    }

    if (toolLower === "run_command" || toolLower === "execute_command") {
      if (
        task.startsWith("build") ||
        task.startsWith("test") ||
        task.startsWith("run") ||
        task.startsWith("install")
      ) {
        return {
          isApproved: true,
          reason: "Command execution is consistent with build/test/run task.",
          mappedTask: task,
        };
      }
    }
  }

  return {
    isApproved: false,
    reason: `The tool '${args.toolName}' on target '${args.targetFile || "N/A"}' does not align with any active task in ${args.planPath}.`,
  };
}

export const deterministicDispatcherTool: ToolDefinition<ToolAccessArgs> = {
  name: "verify_tool_access",
  description:
    "Hard-coded gatekeeper (Mechanism 171) that verifies if a tool call is authorized by the current Mission Plan (TODO.md). MUST be called before any state-mutating tool.",
  inputSchema: ToolAccessArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    try {
      ctx.onXmlStream(
        `<dyad-status title="Deterministic Dispatcher">Verifying access for ${args.toolName}...</dyad-status>`,
      );

      const result = validateToolAccess(args, ctx);

      const logPath = path.join(ctx.appPath, ".dyad", "governance.json");
      if (fs.existsSync(logPath)) {
        const tempPath = `${logPath}.${Date.now()}.tmp`;
        try {
          // Note: For high-concurrency, a real lock or queue would be better,
          // but atomic rename provides a basic level of safety for local operations.
          const currentContent = fs.readFileSync(logPath, "utf-8");
          const gov = JSON.parse(currentContent);
          gov.auditLogs.push({
            timestamp: new Date().toISOString(),
            agentId: "deterministic_dispatcher",
            action: "verify_access",
            target: args.toolName,
            outcome: result.isApproved ? "success" : "blocked",
            severity: result.isApproved ? "info" : "critical",
            details: result.reason,
          });
          fs.writeFileSync(tempPath, JSON.stringify(gov, null, 2), "utf-8");
          fs.renameSync(tempPath, logPath);
        } catch (e) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          console.error("Failed to update governance log atomically:", e);
          ctx.onXmlStream(
            `<dyad-status title="Dispatcher Error">Failed to update governance log: ${e}</dyad-status>`,
          );
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Dispatcher Result">${result.isApproved ? "APPROVED" : "BLOCKED"}</dyad-status>`,
      );

      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error("Deterministic Dispatcher critical failure:", error);
      ctx.onXmlComplete(
        `<dyad-status title="Dispatcher Failure">CRITICAL ERROR</dyad-status>`,
      );
      return JSON.stringify(
        { isApproved: false, reason: `Dispatcher critical failure: ${error}` },
        null,
        2,
      );
    }
  },
};
