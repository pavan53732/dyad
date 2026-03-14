import { z } from "zod";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlContent,
} from "./types";
import {
  gitAddAll,
  gitCommit,
  gitPush,
  gitCurrentBranch,
} from "@/ipc/utils/git_utils";
import { readSettings } from "@/main/settings";

const gitCommitAndPushSchema = z.object({
  message: z.string().describe("The commit message explaining the changes."),
});

export const gitCommitAndPushTool: ToolDefinition<
  z.infer<typeof gitCommitAndPushSchema>
> = {
  name: "git_commit_and_push",
  description: `Stage all uncommitted changes, commit them with the provided message, and push them to the connected GitHub repository. Do not use this tool unless you are confident the changes compile and function properly.`,
  inputSchema: gitCommitAndPushSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `git commit -m "${args.message}" && git push`,

  execute: async (args, ctx: AgentContext) => {
    ctx.onXmlStream(
      `<dyad-status title="Committing and pushing to GitHub"></dyad-status>`,
    );

    try {
      // 1. Stage all changes
      await gitAddAll({ path: ctx.appPath });

      // 2. Commit the changes
      const commitHash = await gitCommit({
        path: ctx.appPath,
        message: args.message,
      });

      // 3. Get the current branch
      const currentBranch = await gitCurrentBranch({ path: ctx.appPath });

      // 4. Retrieve access token and push
      const settings = readSettings();
      const accessToken = settings.githubAccessToken?.value;
      
      await gitPush({
        path: ctx.appPath,
        branch: currentBranch || "main",
        accessToken: accessToken || "",
      });

      const result = `Successfully committed (Hash: ${commitHash}) and pushed to origin/${currentBranch || "main"}.`;
      
      ctx.onXmlComplete(
        `<dyad-status title="Pushed to GitHub">\n${escapeXmlContent(result)}\n</dyad-status>`,
      );

      return result;
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      const result = `Failed to commit and push: ${errorMsg}`;
      ctx.onXmlComplete(
        `<dyad-status title="Push failed">\n${escapeXmlContent(result)}\n</dyad-status>`,
      );
      throw e;
    }
  },
};
