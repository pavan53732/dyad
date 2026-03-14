import { z } from "zod";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlContent,
} from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";
import {
  gitCurrentBranch,
  gitLog,
  gitAddAll,
  gitCommit,
  gitPush,
  gitListBranches,
  getGitUncommittedFilesWithStatus,
} from "@/ipc/utils/git_utils";
import { db } from "@/db";
import { apps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDyadAppPath } from "@/paths/paths";
import log from "electron-log";

const logger = log.scope("autonomous_pull_request");

// GitHub API constants (same as in github_handlers.ts)
const GITHUB_API_BASE = "https://api.github.com";

const autonomousPullRequestSchema = z.object({
  title: z.string().optional().describe("PR title (optional, will be auto-generated if not provided)"),
  body: z.string().optional().describe("PR description body (optional, will be auto-generated if not provided)"),
  labels: z.array(z.string()).optional().describe("Labels to add to the PR (optional)"),
  baseBranch: z.string().optional().describe("Base branch to merge into (default: main)"),
  commitMessage: z.string().optional().describe("Commit message if there are uncommitted changes"),
});

interface PullRequestResult {
  prUrl: string;
  prNumber: number;
  title: string;
  status: "created" | "updated" | "error";
  message: string;
}

/**
 * Get the base branch for PR (main or master)
 */
async function getBaseBranch(appPath: string): Promise<string> {
  const branches = await gitListBranches({ path: appPath });
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return "main";
}

/**
 * Get GitHub access token from settings
 */
function getGitHubAccessToken(): string {
  const settings = readSettings();
  return settings.githubAccessToken?.value || "";
}

/**
 * Create a pull request via GitHub API
 */
async function createPullRequest({
  owner,
  repo,
  title,
  body,
  head,
  base,
  accessToken,
}: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  accessToken: string;
}): Promise<{ number: number; html_url: string }> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      head,
      base,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // Check if PR already exists (422 - branch already exists)
    if (response.status === 422 && errorData.errors) {
      // Try to get existing PR
      const existingPr = await getExistingPullRequest({ owner, repo, head, accessToken });
      if (existingPr) {
        return existingPr;
      }
    }
    throw new Error(`Failed to create PR: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Get existing pull request for a branch
 */
async function getExistingPullRequest({
  owner,
  repo,
  head,
  accessToken,
}: {
  owner: string;
  repo: string;
  head: string;
  accessToken: string;
}): Promise<{ number: number; html_url: string } | null> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?head=${owner}:${head}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const prs = await response.json();
  if (prs.length > 0) {
    return { number: prs[0].number, html_url: prs[0].html_url };
  }

  return null;
}

/**
 * Add labels to a pull request
 */
async function addLabelsToPullRequest({
  owner,
  repo,
  prNumber,
  labels,
  accessToken,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  labels: string[];
  accessToken: string;
}): Promise<void> {
  if (labels.length === 0) return;

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/labels`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labels }),
    },
  );

  if (!response.ok) {
    logger.warn(`Failed to add labels to PR: ${response.statusText}`);
  }
}

/**
 * Generate AI-powered PR description
 */
async function generatePRDescription({
  appPath,
  branchName,
  baseBranch,
  modelClient,
}: {
  appPath: string;
  branchName: string;
  baseBranch: string;
  modelClient: any;
}): Promise<{ title: string; body: string }> {
  // Get recent commits on this branch
  const commits = await gitLog({ path: appPath, depth: 10 });
  
  // Get uncommitted files
  const uncommittedFiles = await getGitUncommittedFilesWithStatus({ path: appPath });

  const commitMessages = commits
    .slice(0, 5)
    .map(c => `- ${c.commit.message.trim()}`)
    .join("\n");

  const changedFiles = uncommittedFiles
    .map(f => `- ${f.status}: ${f.path}`)
    .join("\n");

  const systemPrompt = `You are a GitHub Pull Request assistant. Generate a concise, informative PR title and description based on the provided git commit history and changed files.

Follow these rules:
1. Title: Use imperative mood, 50 chars or less, no period at end
2. Description: Include:
   - Brief summary of changes (2-3 sentences)
   - List of commit messages
   - List of changed files with their status
3. Use GitHub-flavored markdown
4. If there are uncommitted changes, mention them in the description
5. Add appropriate sections like "Summary", "Changes", "Files Changed"

Return ONLY a JSON object with "title" and "body" fields, no other text.`;

  const userPrompt = `Branch: ${branchName}
Base branch: ${baseBranch}

Recent commits:
${commitMessages || "No commits yet"}

Changed files (uncommitted):
${changedFiles || "No uncommitted changes"}`;

  const { text } = await generateText({
    model: modelClient.model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
  });

  try {
    // Try to parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || `Update ${branchName}`,
        body: parsed.body || "No description provided.",
      };
    }
  } catch  {
    logger.warn("Failed to parse AI response as JSON, using fallback");
  }

  // Fallback if AI response can't be parsed
  return {
    title: commits[0]?.commit.message.split("\n")[0].slice(0, 50) || `Update ${branchName}`,
    body: `## Summary\n\nRecent changes on branch \`${branchName}\`.\n\n### Commits\n${commitMessages || "No commits"}\n\n### Changed Files\n${changedFiles || "None"}`,
  };
}

export const autonomousPullRequestTool: ToolDefinition<
  z.infer<typeof autonomousPullRequestSchema>
> = {
  name: "autonomous_pull_request",
  description: `Autonomously create a GitHub Pull Request from the current branch. If there are uncommitted changes, it will commit and push them first. Uses AI to generate a PR description based on commit history.`,
  inputSchema: autonomousPullRequestSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    const branch = args.baseBranch || "main";
    return `Create PR: ${args.title || '[auto-generated]'} -> ${branch}`;
  },

  execute: async (args, ctx: AgentContext) => {
    ctx.onXmlStream(
      `<dyad-status title="Creating Pull Request">Preparing to create PR...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(settings.selectedModel || "gpt-4o", settings);

    // Get app info from database
    const app = await db.query.apps.findFirst({ where: eq(apps.id, ctx.appId) });
    if (!app || !app.githubOrg || !app.githubRepo) {
      throw new Error("App is not connected to a GitHub repository.");
    }

    const appPath = getDyadAppPath(app.path);
    const accessToken = getGitHubAccessToken();

    if (!accessToken) {
      throw new Error("GitHub is not authenticated. Please connect GitHub in settings.");
    }

    // Get current branch
    const currentBranch = await gitCurrentBranch({ path: appPath });
    if (!currentBranch) {
      throw new Error("Not on a git branch.");
    }

    ctx.onXmlStream(
      `<dyad-status title="Creating Pull Request">Current branch: ${currentBranch}</dyad-status>`,
    );

    // Check for uncommitted changes and commit if needed
    const uncommittedFiles = await getGitUncommittedFilesWithStatus({ path: appPath });
    if (uncommittedFiles.length > 0) {
      ctx.onXmlStream(
        `<dyad-status title="Creating Pull Request">Committing uncommitted changes...</dyad-status>`,
      );

      const commitMessage = args.commitMessage || `chore: auto-commit before creating PR for ${currentBranch}`;
      
      await gitAddAll({ path: appPath });
      await gitCommit({ path: appPath, message: commitMessage });
      
      // Push the branch
      await gitPush({
        path: appPath,
        branch: currentBranch,
        accessToken,
      });

      logger.info(`Auto-committed and pushed changes for branch ${currentBranch}`);
    } else {
      // Just push the branch to ensure it's up to date
      try {
        await gitPush({
          path: appPath,
          branch: currentBranch,
          accessToken,
        });
      } catch (pushError: any) {
        // Ignore push errors if branch already exists - we'll still try to create/update PR
        logger.warn(`Push warning: ${pushError.message}`);
      }
    }

    // Get base branch
    const baseBranch = args.baseBranch || await getBaseBranch(appPath);

    ctx.onXmlStream(
      `<dyad-status title="Creating Pull Request">Generating PR description...</dyad-status>`,
    );

    // Generate PR title and description using AI
    let prTitle = args.title;
    let prBody = args.body;

    if (!prTitle || !prBody) {
      const generated = await generatePRDescription({
        appPath,
        branchName: currentBranch,
        baseBranch,
        modelClient,
      });
      
      prTitle = prTitle || generated.title;
      prBody = prBody || generated.body;
    }

    // Add AI-generated note if auto-generated
    if (!args.body) {
      prBody = `${prBody}\n\n---\n*This PR description was auto-generated by Dyad.*`;
    }

    ctx.onXmlStream(
      `<dyad-status title="Creating Pull Request">Creating PR on GitHub...</dyad-status>`,
    );

    // Create the pull request
    let prResult: { number: number; html_url: string };
    let prStatus: "created" | "updated" = "created";

    try {
      // Check if PR already exists
      const existingPr = await getExistingPullRequest({
        owner: app.githubOrg,
        repo: app.githubRepo,
        head: currentBranch,
        accessToken,
      });

      if (existingPr) {
        prResult = existingPr;
        prStatus = "updated";
        logger.info(`PR already exists: ${prResult.html_url}`);
      } else {
        prResult = await createPullRequest({
          owner: app.githubOrg,
          repo: app.githubRepo,
          title: prTitle,
          body: prBody,
          head: currentBranch,
          base: baseBranch,
          accessToken,
        });
      }
    } catch (prError: any) {
      const errorMsg = prError.message || String(prError);
      
      // Check if error indicates PR already exists
      if (errorMsg.includes("A pull request already exists") || errorMsg.includes("branch already exists")) {
        // Try to get existing PR one more time
        const existingPr = await getExistingPullRequest({
          owner: app.githubOrg,
          repo: app.githubRepo,
          head: currentBranch,
          accessToken,
        });
        
        if (existingPr) {
          prResult = existingPr;
          prStatus = "updated";
        } else {
          throw new Error(`Failed to create PR: ${errorMsg}`);
        }
      } else {
        throw new Error(`Failed to create PR: ${errorMsg}`);
      }
    }

    // Add labels if provided
    if (args.labels && args.labels.length > 0) {
      await addLabelsToPullRequest({
        owner: app.githubOrg,
        repo: app.githubRepo,
        prNumber: prResult.number,
        labels: args.labels,
        accessToken,
      });
    }

    const result: PullRequestResult = {
      prUrl: prResult.html_url,
      prNumber: prResult.number,
      title: prTitle,
      status: prStatus,
      message: prStatus === "created" 
        ? `Successfully created pull request #${prResult.number}`
        : `Pull request #${prResult.number} already exists`,
    };

    const resultXml = `<dyad-status title="Pull Request ${prStatus === 'created' ? 'Created' : 'Updated'}">
- PR URL: ${result.prUrl}
- PR Number: #${result.prNumber}
- Title: ${escapeXmlContent(result.title)}
- Status: ${result.status}
</dyad-status>`;

    ctx.onXmlComplete(resultXml);

    return `Pull Request ${prStatus === 'created' ? 'created' : 'updated'}: ${result.prUrl}`;
  },
};
