import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import log from "electron-log";
import { ToolDefinition, AgentContext, escapeXmlAttr } from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";

const logger = log.scope("write_env_vars");

const writeEnvVarsSchema = z.object({
  envVars: z.record(z.string(), z.string()).describe("A record of environment variable keys and their corresponding values"),
});

export const writeEnvVarsTool: ToolDefinition<z.infer<typeof writeEnvVarsSchema>> = {
  name: "write_env_vars",
  description: "Securely write environment variables to the .env file in the app root directory.",
  inputSchema: writeEnvVarsSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    const keys = Object.keys(args.envVars || {}).join(", ");
    return `Write environment variables to .env: ${keys}`;
  },

  buildXml: (args) => {
    const keys = Object.keys(args.envVars || {}).join(", ");
    return `<dyad-write-env-vars keys="${escapeXmlAttr(keys)}"></dyad-write-env-vars>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const envPath = safeJoin(ctx.appPath, ".env");
    
    let currentContent = "";
    if (fs.existsSync(envPath)) {
      currentContent = fs.readFileSync(envPath, "utf-8");
      // Ensure it ends with a newline
      if (currentContent && !currentContent.endsWith("\\n")) {
        currentContent += "\\n";
      }
    }

    // Process each variable
    for (const [key, value] of Object.entries(args.envVars || {})) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
      
      const escapedValue = String(value).replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const newEntry = `${key}="${escapedValue}"`;
      
      if (regex.test(currentContent)) {
        // Replace existing
        currentContent = currentContent.replace(regex, newEntry);
      } else {
        // Append
        currentContent += `${newEntry}\\n`;
      }
    }

    try {
      fs.writeFileSync(envPath, currentContent);
      logger.log(`Successfully wrote to .env file in ${ctx.appPath}`);
    } catch (error: any) {
      logger.error(`Failed to write .env file: ${error.message}`, error);
      throw new Error(`Failed to write environment variables: ${error.message}`);
    }

    return `Successfully updated .env file with ${Object.keys(args.envVars || {}).length} variables.`;
  },
};
