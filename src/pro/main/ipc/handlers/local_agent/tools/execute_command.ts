import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlAttr } from "./types";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import log from "electron-log";
import { safeJoin } from "@/ipc/utils/path_utils";

const logger = log.scope("execute_command");
const execAsync = promisify(exec);

const executeCommandSchema = z.object({
  command: z.string().describe("The shell command to execute (e.g., 'npm install', 'npx create-next-app@latest .', 'npm run build')"),
  cwd: z.string().optional().describe("Optional working directory relative to the app root to execute the command in. Defaults to the app root."),
});

export const executeCommandTool: ToolDefinition<
  z.infer<typeof executeCommandSchema>
> = {
  name: "execute_command",
  description: "Execute a shell command within the application directory.",
  inputSchema: executeCommandSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    return args.cwd 
      ? `Run '${args.command}' in ${args.cwd}`
      : `Run '${args.command}'`;
  },

  buildXml: (args, _isComplete) => {
    if (!args.command) return undefined;
    return `<dyad-execute-command command="${escapeXmlAttr(args.command)}" cwd="${escapeXmlAttr(args.cwd || "")}"></dyad-execute-command>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const cwd = args.cwd ? safeJoin(ctx.appPath, args.cwd) : ctx.appPath;
    
    logger.info(`Executing command: ${args.command} in ${cwd}`);

    // Basic safety check for path traversal
    if (
      !cwd.startsWith(ctx.appPath + path.sep) &&
      cwd !== ctx.appPath
    ) {
      throw new Error(`Cannot execute commands outside of app directory: ${ctx.appPath}`);
    }

    try {
      const { stdout, stderr } = await execAsync(args.command, { 
        cwd,
        timeout: 120000, // 2 minutes timeout for scaffolding commands
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      let result = "Command executed successfully.\\n";
      if (stdout.trim()) {
        result += `\\nSTDOUT:\\n${stdout}`;
      }
      if (stderr.trim()) {
        result += `\\nSTDERR:\\n${stderr}`;
      }
      return result;
    } catch (error: any) {
      logger.error(`Command failed: ${args.command}`, error);
      let result = `Command failed with exit code ${error.code || 'unknown'}.\\n`;
      if (error.stdout) {
        result += `\\nSTDOUT:\\n${error.stdout}`;
      }
      if (error.stderr) {
        result += `\\nSTDERR:\\n${error.stderr}`;
      }
      if (error.message && !error.stderr) {
        result += `\\nERROR:\\n${error.message}`;
      }
      return result;
    }
  },
};
