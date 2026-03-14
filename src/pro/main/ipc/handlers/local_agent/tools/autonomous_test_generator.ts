import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { generateText } from "ai";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

const autonomousTestGeneratorSchema = z.object({
  testName: z
    .string()
    .describe("Unique name for the test file (e.g., 'counter_verification')"),
  componentPath: z
    .string()
    .describe("Relative path to the component or file to be tested"),
  behaviorToTest: z
    .string()
    .describe("Description of the behavior the test should verify"),
});

export const autonomousTestGeneratorTool: ToolDefinition<
  z.infer<typeof autonomousTestGeneratorSchema>
> = {
  name: "autonomous_test_generator",
  description: `Autonomously generate and run an E2E test using Playwright to verify code behavior.`,
  inputSchema: autonomousTestGeneratorSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Generate and run E2E test '${args.testName}' for ${args.componentPath}`,

  execute: async (args, ctx: AgentContext) => {
    const { testName, componentPath, behaviorToTest } = args;
    const fixturePath = path.join(
      ctx.appPath,
      "e2e-tests",
      "fixtures",
      "engine",
      "local-agent",
      `${testName}.ts`,
    );
    const specPath = path.join(ctx.appPath, "e2e-tests", `${testName}.spec.ts`);

    ctx.onXmlStream(
      `<dyad-status title="Autonomous Test Generator">Analyzing ${componentPath}...</dyad-status>`,
    );

    const fullComponentPath = path.isAbsolute(componentPath)
      ? componentPath
      : path.join(ctx.appPath, componentPath);
    if (!fs.existsSync(fullComponentPath)) {
      throw new Error(`File not found: ${componentPath}`);
    }

    const componentContent = fs.readFileSync(fullComponentPath, "utf-8");
    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // 1. Generate the Fixture and Spec
    ctx.onXmlStream(
      `<dyad-status title="Autonomous Test Generator">Generating test spec and fixture...</dyad-status>`,
    );

    const systemPrompt = `You are a Test Architect specializing in Playwright E2E tests for Electron.
You must generate TWO things:
1. A 'LocalAgentFixture' (TypeScript) that simulates the agent turns needed to trigger the behavior.
2. A Playwright '.spec.ts' file that uses the fixture and verifies the outcome.

Format your output as two code blocks labeled 'FIXTURE' and 'SPEC'.

MATCH THIS PATTERN FOR FIXTURE:
import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";
export const fixture: LocalAgentFixture = {
  description: "...",
  turns: [...]
};

MATCH THIS PATTERN FOR SPEC:
import { expect } from "@playwright/test";
import { testSkipIfWindows } from "./helpers/test_helper";
testSkipIfWindows("${testName}", async ({ po }) => {
  await po.setUpDyadPro({ localAgent: true });
  await po.importApp("minimal"); // or relevant template
  await po.chatActions.selectLocalAgentMode();
  await po.sendPrompt("tc=local-agent/${testName}");
  await po.chatActions.waitForChatCompletion();
  // ... verification code ...
});`;

    const userPrompt = `Target behavior: ${behaviorToTest}
Component Path: ${componentPath}
Component Content:
\`\`\`typescript
${componentContent}
\`\`\``;

    const { text } = await generateText({
      model: modelClient.model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2,
    });

    const fixtureMatch =
      text.match(
        /```(?:typescript|ts)?\s*[\s\S]*?FIXTURE[\s\S]*?\n([\s\S]*?)```/i,
      ) || text.match(/FIXTURE[\s\S]*?```(?:typescript|ts)?\n([\s\S]*?)```/i);
    const specMatch =
      text.match(
        /```(?:typescript|ts)?\s*[\s\S]*?SPEC[\s\S]*?\n([\s\S]*?)```/i,
      ) || text.match(/SPEC[\s\S]*?```(?:typescript|ts)?\n([\s\S]*?)```/i);

    const fixtureContent = fixtureMatch ? fixtureMatch[1] : null;
    const specContent = specMatch ? specMatch[1] : null;

    if (!fixtureContent || !specContent) {
      // Fallback: try to just find code blocks if the labels failed
      const codeBlocks = text.match(/```(?:typescript|ts)?\n([\s\S]*?)```/g);
      if (codeBlocks && codeBlocks.length >= 2) {
        // Assume first is fixture, second is spec if labels missed
        // (Risky, but better than instant fail)
      } else {
        throw new Error(
          "Failed to generate valid test fixture and spec. LLM output was incomplete.",
        );
      }
    }

    // Ensure directories exist
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });

    fs.writeFileSync(fixturePath, fixtureContent || "", "utf-8");
    fs.writeFileSync(specPath, specContent || "", "utf-8");

    // 2. Run the Test
    ctx.onXmlStream(
      `<dyad-status title="Autonomous Test Generator">Executing Playwright test: ${testName}...</dyad-status>`,
    );

    return new Promise((resolve, reject) => {
      const child = spawn("npx", ["playwright", "test", specPath], {
        cwd: ctx.appPath,
        shell: true,
        env: {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_NAME: `${testName}-results.json`,
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        const resultMsg =
          code === 0
            ? `Test '${testName}' PASSED.`
            : `Test '${testName}' FAILED with exit code ${code}.\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

        ctx.onXmlComplete(
          `<dyad-status title="Autonomous Test Result">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        resolve(resultMsg);
      });

      child.on("error", (err) => {
        reject(err);
      });
    });
  },
};
