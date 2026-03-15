/**
 * Tool Synthesizer (Level 6)
 * Autonomous capability expansion mechanism.
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext, escapeXmlAttr } from "./types";

export const toolSynthesizerSchema = z.object({
  toolName: z
    .string()
    .describe("The name of the tool to synthesize (snake_case)."),
  description: z
    .string()
    .describe("Detailed description of what the tool should do."),
  inputSchemaSource: z
    .string()
    .describe(
      "TypeScript/Zod definition for input arguments. Example: z.object({ path: z.string() })",
    ),
  implementationSource: z
    .string()
    .describe(
      "The full implementation logic for the execute function. Use 'args' and 'ctx' variables.",
    ),
});

export const toolSynthesizerTool: ToolDefinition<
  z.infer<typeof toolSynthesizerSchema>
> = {
  name: "tool_synthesizer",
  description:
    "Synthesize and register a new autonomous tool on the fly to expand system capabilities. Use this when facing a task that no existing tool can solve.",
  inputSchema: toolSynthesizerSchema,
  defaultConsent: "always",
  modifiesState: true,

  execute: async (args, ctx: AgentContext) => {
    const { toolName, description, inputSchemaSource, implementationSource } =
      args;

    // Strict validation to prevent path traversal
    if (!/^[a-z0-9_]+$/.test(toolName)) {
      return `Error: Invalid tool name "${toolName}". Only lowercase alphanumeric and underscores allowed (snake_case).`;
    }

    const toolsDir = path.join(
      ctx.appPath,
      "src/pro/main/ipc/handlers/local_agent/tools",
    );
    const toolFilePath = path.normalize(path.join(toolsDir, `${toolName}.ts`));

    // Final security check: ensure the resolved path stays within the tools directory
    if (!toolFilePath.startsWith(path.normalize(toolsDir))) {
      return `Error: Security violation. Tool path "${toolFilePath}" escapes the tools directory.`;
    }

    ctx.onXmlStream(
      `<dyad-status title="Tool Synthesizer">Synthesizing tool: ${escapeXmlAttr(toolName)}</dyad-status>`,
    );

    if (fs.existsSync(toolFilePath)) {
      return `Tool ${toolName} already exists at ${toolFilePath}.`;
    }

    // Basic security check for implementation source
    const dangerousPatterns = [
      /\bprocess\./,
      /\bchild_process\b/,
      /\bfs\./,
      /\bpath\./,
      /\beval\s*\(/,
      /\bnew\s+Function\(/,
      /import\s+/,
      /require\s*\(/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(implementationSource)) {
        return `Error: Security violation. Implementation source contains forbidden pattern: ${pattern.source}. All logic must use the provided 'ctx' and 'args' only.`;
      }
    }

    const toolTemplate = `
/**
 * Synthesized Tool: ${toolName}
 * Description: ${description}
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext, escapeXmlAttr } from "./types";

const ${toolName}Schema = ${inputSchemaSource};

export const ${toolName}Tool: ToolDefinition<z.infer<typeof ${toolName}Schema>> = {
  name: "${toolName}",
  description: "${description.replace(/"/g, '\\"')}",
  inputSchema: ${toolName}Schema,
  defaultConsent: "always",
  modifiesState: true,

  execute: async (args, ctx: AgentContext) => {
    ${implementationSource}
  },
};
`;

    // 1. Write the new tool file
    fs.writeFileSync(toolFilePath, toolTemplate.trim(), "utf-8");

    // 2. Update tool_definitions.ts
    const definitionsPath = path.join(
      ctx.appPath,
      "src/pro/main/ipc/handlers/local_agent/tool_definitions.ts",
    );
    let content = fs.readFileSync(definitionsPath, "utf-8");

    // Robust Import Insertion: find the last tools import
    const importRegex = /^import \{ .* \} from ".\/tools\/.*";/gm;
    let lastMatch;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastMatch = match;
    }

    if (lastMatch) {
      const insertPos = lastMatch.index + lastMatch[0].length;
      content =
        content.slice(0, insertPos) +
        `\nimport { ${toolName}Tool } from "./tools/${toolName}";` +
        content.slice(insertPos);
    } else {
      // Fallback: insert after the first line (license/header) or at top
      content =
        `import { ${toolName}Tool } from "./tools/${toolName}";\n` + content;
    }

    // Robust Array Insertion: find the TOOL_DEFINITIONS array end
    const arrayRegex =
      /export const TOOL_DEFINITIONS: ToolDefinition<any>\[\] = \[([\s\S]*?)\];/;
    const arrayMatch = content.match(arrayRegex);
    if (arrayMatch) {
      const arrayContent = arrayMatch[1].trim();
      const updatedArrayContent =
        arrayContent +
        (arrayContent.endsWith(",") ? "" : ",") +
        `\n  ${toolName}Tool`;
      content = content.replace(
        arrayRegex,
        `export const TOOL_DEFINITIONS: ToolDefinition<any>[] = [\n  ${updatedArrayContent}\n];`,
      );
    } else {
      // Last resort: standard string slice if regex fails
      const arrayEndMatch = content.lastIndexOf("];");
      if (arrayEndMatch !== -1) {
        content =
          content.slice(0, arrayEndMatch) +
          `  ${toolName}Tool,\n` +
          content.slice(arrayEndMatch);
      }
    }

    fs.writeFileSync(definitionsPath, content, "utf-8");

    const result = `Successfully synthesized and registered new tool: ${toolName} at ${toolFilePath}. The agent can now use this capability in subsequent steps.`;

    ctx.onXmlComplete(
      `<dyad-status title="Tool Synthesis Complete">Created ${escapeXmlAttr(toolName)}</dyad-status>`,
    );

    return result;
  },
};
