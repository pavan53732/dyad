import log from "electron-log";
import { db } from "../../db";
import { messages, chats } from "../../db/schema";
import { desc, eq, and } from "drizzle-orm";
import { readSettings } from "@/main/settings";
import { getModelClient } from "../utils/get_model_client";
import { generateText } from "ai";
import { getDyadAppPath } from "../../paths/paths";
import path from "node:path";
import fs from "node:fs";
import { createLoggedHandler } from "./safe_handle";
import {
  AiSuggestionSchema,
} from "../types/proposals";
import { z } from "zod";

const logger = log.scope("ai_suggestions_handler");
const handle = createLoggedHandler(logger);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Walk a directory up to maxDepth levels, collecting relative paths */
function walkDir(
  dir: string,
  base: string,
  maxDepth: number,
  depth = 0,
): string[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const IGNORE = new Set([
    "node_modules",
    ".git",
    "dist",
    ".next",
    "build",
    ".cache",
    "coverage",
    ".turbo",
  ]);
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, base, maxDepth, depth + 1));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

/** Read a file safely, returning up to maxLines lines */
function readFileSafe(filePath: string, maxLines = 200): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length <= maxLines) return content;
    return lines.slice(0, maxLines).join("\n") + "\n// ... (truncated)";
  } catch {
    return "";
  }
}

/** Extract TODO/FIXME comments from files */
function extractTodos(appPath: string, files: string[]): string[] {
  const todos: string[] = [];
  const TODO_REGEX = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)[:\s](.+)/gi;
  const CODE_EXTS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".vue",
    ".svelte",
  ]);
  for (const rel of files) {
    if (!CODE_EXTS.has(path.extname(rel))) continue;
    const fullPath = path.join(appPath, rel);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        const match = TODO_REGEX.exec(line);
        if (match) {
          todos.push(`${rel}:${i + 1} — ${match[0].trim()}`);
        }
        TODO_REGEX.lastIndex = 0; // reset regex state
      });
    } catch {
      /* skip */
    }
    if (todos.length >= 8) break;
  }
  return todos.slice(0, 8);
}

/** Detect code smells: empty catches, console.logs, missing error handling */
function detectCodeSmells(appPath: string, files: string[]): string[] {
  const smells: string[] = [];
  const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, label: "Empty catch block" },
    { regex: /console\.log\(/g, label: "Debug console.log left in" },
    { regex: /any\b/g, label: "TypeScript 'any' type used" },
  ];
  for (const rel of files) {
    if (!CODE_EXTS.has(path.extname(rel))) continue;
    const fullPath = path.join(appPath, rel);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const { regex, label } of patterns) {
        regex.lastIndex = 0;
        const match = regex.exec(content);
        if (match) {
          smells.push(`${label} in ${rel}`);
          if (smells.length >= 6) return smells;
        }
      }
    } catch {
      /* skip */
    }
  }
  return smells;
}

/** Pick the most important key files to include full contents for */
function pickKeyFiles(appPath: string, files: string[]): string[] {
  const priority = [
    "src/App.tsx",
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "src/pages/index.tsx",
    "src/main.tsx",
    "src/index.tsx",
    "app/page.tsx",
    "app/layout.tsx",
    "pages/index.tsx",
  ];
  const picked: string[] = [];
  // First: priority matches
  for (const p of priority) {
    if (files.includes(p)) picked.push(p);
    if (picked.length >= 3) break;
  }
  // Then: recently modified TypeScript component files (heuristic: shortest path = most root-level = most important)
  const remaining = files
    .filter((f) => [".tsx", ".ts"].includes(path.extname(f)) && !picked.includes(f))
    .sort((a, b) => a.split("/").length - b.split("/").length);
  for (const f of remaining) {
    if (picked.length >= 6) break;
    picked.push(f);
  }
  return picked;
}

/** Detect framework from package.json */
function detectFramework(appPath: string): string {
  try {
    const pkgPath = path.join(appPath, "package.json");
    if (!fs.existsSync(pkgPath)) return "Unknown";
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const parts: string[] = [];
    if (deps["next"]) parts.push(`Next.js ${deps["next"]}`);
    else if (deps["vite"]) parts.push(`Vite ${deps["vite"]}`);
    if (deps["react"]) parts.push(`React ${deps["react"]}`);
    if (deps["vue"]) parts.push(`Vue ${deps["vue"]}`);
    if (deps["svelte"]) parts.push(`Svelte`);
    if (deps["typescript"]) parts.push("TypeScript");
    if (deps["tailwindcss"]) parts.push(`Tailwind CSS`);
    if (deps["@supabase/supabase-js"]) parts.push("Supabase");
    if (deps["prisma"] || deps["@prisma/client"]) parts.push("Prisma");
    if (deps["drizzle-orm"]) parts.push("Drizzle ORM");
    return parts.length ? parts.join(", ") : "React app";
  } catch {
    return "Unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 1: Git history — recently changed files
// ─────────────────────────────────────────────────────────────────────────────

/** Returns list of files changed in last 3 commits and a short diff summary */
function getGitContext(appPath: string): { recentFiles: string[]; diffSummary: string } {
  try {
    const { execSync } = require("node:child_process");
    // Get list of files changed in last 3 commits
    const filesRaw: string = execSync("git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ''", {
      cwd: appPath,
      timeout: 3000,
      encoding: "utf-8",
    });
    const recentFiles = filesRaw
      .split("\n")
      .map((f: string) => f.trim())
      .filter((f: string) => f.length > 0)
      .slice(0, 10);

    // Get a short diff stat (lines changed per file)
    const statRaw: string = execSync("git diff --stat HEAD~3 HEAD 2>/dev/null || git diff --stat HEAD~1 HEAD 2>/dev/null || echo ''", {
      cwd: appPath,
      timeout: 3000,
      encoding: "utf-8",
    });
    const diffSummary = statRaw.split("\n").slice(0, 8).join("\n").trim();

    return { recentFiles, diffSummary };
  } catch {
    return { recentFiles: [], diffSummary: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 2: Build error signals
// ─────────────────────────────────────────────────────────────────────────────

/** Reads electron-log files to extract recent build/runtime errors */
function getBuildErrors(appPath: string): string[] {
  const errors: string[] = [];
  try {
    // Check for common error files in the project
    const errorFiles = [
      path.join(appPath, ".next", "error.log"),
      path.join(appPath, "build-error.log"),
      path.join(appPath, "npm-debug.log"),
      path.join(appPath, ".turbo", "error.log"),
    ];
    for (const f of errorFiles) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, "utf-8");
        const lines = content.split("\n").filter((l) => /error|Error|ERROR/.test(l));
        errors.push(...lines.slice(0, 5));
      }
    }

    // Also try running tsc --noEmit briefly to detect type errors
    if (errors.length === 0 && fs.existsSync(path.join(appPath, "tsconfig.json"))) {
      try {
        const { execSync } = require("node:child_process");
        const tscOut: string = execSync("npx tsc --noEmit 2>&1 | head -20", {
          cwd: appPath,
          timeout: 8000,
          encoding: "utf-8",
        });
        if (tscOut.includes("error TS")) {
          const tsErrors = tscOut
            .split("\n")
            .filter((l: string) => l.includes("error TS"))
            .slice(0, 5);
          errors.push(...tsErrors);
        }
      } catch (e: unknown) {
        // tsc output is in stderr when there are errors
        const msg = e instanceof Error ? e.message : String(e);
        const tsErrors = msg
          .split("\n")
          .filter((l: string) => l.includes("error TS"))
          .slice(0, 5);
        errors.push(...tsErrors);
      }
    }
  } catch {
    // ignore
  }
  return errors.slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 3: Database schema awareness
// ─────────────────────────────────────────────────────────────────────────────

/** Reads DB schema files (Prisma, Drizzle, SQL) and returns a short summary */
function getDbSchemaSummary(appPath: string, allFiles: string[]): string {
  const schemaFiles = [
    // Prisma
    "prisma/schema.prisma",
    // Drizzle
    "src/db/schema.ts",
    "db/schema.ts",
    "src/schema.ts",
    // SQL
    "schema.sql",
    "database/schema.sql",
    // Supabase
    "supabase/migrations",
  ];

  for (const candidate of schemaFiles) {
    // Handle directory (supabase/migrations)
    const fullPath = path.join(appPath, candidate);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      try {
        const files = fs.readdirSync(fullPath).filter((f) => f.endsWith(".sql")).slice(-2);
        if (files.length > 0) {
          const content = files
            .map((f) => readFileSafe(path.join(fullPath, f), 40))
            .join("\n");
          return `[Supabase migrations]\n${content.slice(0, 800)}`;
        }
      } catch { /* skip */ }
    }
    // File-based schemas
    if (allFiles.includes(candidate)) {
      const content = readFileSafe(path.join(appPath, candidate), 60);
      if (content) return `[${candidate}]\n${content.slice(0, 1000)}`;
    }
  }

  // Fallback: find any file named schema.*
  const schemaFile = allFiles.find((f) =>
    /schema\.(ts|prisma|sql)$/.test(f) && !f.includes("node_modules")
  );
  if (schemaFile) {
    const content = readFileSafe(path.join(appPath, schemaFile), 60);
    if (content) return `[${schemaFile}]\n${content.slice(0, 1000)}`;
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 4: Developer intent detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects what type of app the user is building based on
 * dependencies, file patterns, and folder structure.
 */
function detectDeveloperIntent(
  appPath: string,
  allFiles: string[],
): { appType: string; missingFeatures: string[] } {
  let appType = "web app";
  const missingFeatures: string[] = [];

  try {
    const pkgPath = path.join(appPath, "package.json");
    if (!fs.existsSync(pkgPath)) return { appType, missingFeatures };

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depNames = Object.keys(deps);
    const fileStr = allFiles.join(" ").toLowerCase();

    // ── SaaS detection ──
    const isSaas =
      depNames.some((d) => ["stripe", "@stripe/stripe-js", "lemonsqueezy", "paddle"].includes(d)) ||
      fileStr.includes("subscription") ||
      fileStr.includes("billing") ||
      fileStr.includes("pricing");

    if (isSaas) {
      appType = "SaaS application";
      if (!depNames.includes("stripe") && !depNames.includes("lemonsqueezy"))
        missingFeatures.push("payment processing (Stripe)");
      if (!fileStr.includes("webhook"))
        missingFeatures.push("webhook handler for payment events");
      if (!fileStr.includes("subscription"))
        missingFeatures.push("subscription management UI");
    }

    // ── Blog/CMS detection ──
    const isBlog =
      depNames.some((d) => ["contentlayer", "@sanity/client", "@prismic/client", "gray-matter", "remark", "rehype"].includes(d)) ||
      fileStr.includes("blog") ||
      fileStr.includes("post") ||
      fileStr.includes("cms");

    if (isBlog && !isSaas) {
      appType = "blog / content site";
      if (!fileStr.includes("sitemap"))
        missingFeatures.push("sitemap.xml for SEO");
      if (!fileStr.includes("rss") && !fileStr.includes("feed"))
        missingFeatures.push("RSS feed");
      if (!fileStr.includes("og:") && !fileStr.includes("opengraph"))
        missingFeatures.push("Open Graph meta tags");
    }

    // ── API / backend detection ──
    const isApiFirst =
      (fileStr.includes("api/") || fileStr.includes("routes/")) &&
      depNames.some((d) => ["express", "fastify", "hono", "koa", "@hono/node-server"].includes(d));

    if (isApiFirst && !isSaas && !isBlog) {
      appType = "API server";
      if (!fileStr.includes("middleware"))
        missingFeatures.push("middleware layer (auth, logging)");
      if (!fileStr.includes("rate-limit") && !fileStr.includes("ratelimit"))
        missingFeatures.push("rate limiting");
      if (!fileStr.includes(".test.") && !fileStr.includes(".spec."))
        missingFeatures.push("API endpoint tests");
    }

    // ── Mobile detection ──
    const isMobile =
      depNames.some((d) => ["@capacitor/core", "react-native", "expo"].includes(d));
    if (isMobile) {
      appType = "mobile app";
      if (!fileStr.includes("push") && !fileStr.includes("notification"))
        missingFeatures.push("push notifications");
      if (!fileStr.includes("offline"))
        missingFeatures.push("offline support");
    }

    // ── Common missing features regardless of type ──
    const hasAuth =
      depNames.some((d) => ["next-auth", "@auth/core", "lucia", "clerk", "@clerk/nextjs", "supabase"].includes(d)) ||
      fileStr.includes("signin") ||
      fileStr.includes("login");
    if (!hasAuth) missingFeatures.push("user authentication");

    const hasEnvValidation = depNames.includes("zod") && fileStr.includes("env");
    if (!hasEnvValidation) missingFeatures.push("env variable validation (Zod)");

  } catch {
    // ignore
  }

  return { appType, missingFeatures: missingFeatures.slice(0, 4) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_SUGGESTIONS = [
  { text: "Add a loading state to your UI", category: "improve" as const },
  { text: "Add error handling to API calls", category: "improve" as const },
  { text: "Write a test for the main feature", category: "feature" as const },
];

export function registerAiSuggestionsHandlers() {
  handle(
    "generate-ai-suggestions",
    async (
      _event,
      { chatId, appId }: { chatId: number; appId: number },
    ) => {
      const settings = readSettings();

      // ── 1. Get recent chat messages ──────────────────────────────────────
      const recentMessages = await db.query.messages.findMany({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.role, "assistant"),
        ),
        orderBy: [desc(messages.id)],
        limit: 5,
        columns: { content: true, role: true },
      });

      const userMessages = await db.query.messages.findMany({
        where: and(eq(messages.chatId, chatId), eq(messages.role, "user")),
        orderBy: [desc(messages.id)],
        limit: 5,
        columns: { content: true, role: true },
      });

      // Interleave and sort by recency (we don't have timestamps so just combine)
      const allRecentMsgs = [...recentMessages, ...userMessages]
        .slice(0, 10)
        .map((m) => `[${m.role}]: ${(m.content ?? "").slice(0, 400)}`)
        .join("\n\n");

      // ── 2. Get app file tree + detect framework ──────────────────────────
      const chat = await db.query.chats.findFirst({
        where: eq(chats.id, chatId),
        columns: { appId: true },
      });
      const resolvedAppId = chat?.appId ?? appId;

      // Fetch the app record to get the app's folder path
      const { apps } = await import("../../db/schema");
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, resolvedAppId),
        columns: { path: true },
      });

      if (!app?.path) {
        logger.warn("App path not found, returning fallback suggestions");
        return { suggestions: FALLBACK_SUGGESTIONS };
      }

      const appPath = getDyadAppPath(app.path);

      const allFiles = walkDir(appPath, appPath, 4);
      const fileTree = allFiles.slice(0, 60).join("\n");
      const framework = detectFramework(appPath);

      // ── 3. Read key file contents ────────────────────────────────────────
      const keyFiles = pickKeyFiles(appPath, allFiles);
      const keyFileContents = keyFiles
        .map((rel) => {
          const content = readFileSafe(path.join(appPath, rel), 150);
          return content
            ? `\n### ${rel}\n\`\`\`\n${content}\n\`\`\``
            : "";
        })
        .filter(Boolean)
        .join("\n");

      // ── 4. Extract TODOs and code smells ─────────────────────────────────
      const todos = extractTodos(appPath, allFiles);
      const smells = detectCodeSmells(appPath, allFiles);

      // ── 5 (NEW). Git history — recently changed files ────────────────────
      const { recentFiles, diffSummary } = getGitContext(appPath);

      // ── 6 (NEW). Build errors ────────────────────────────────────────────
      const buildErrors = getBuildErrors(appPath);

      // ── 7 (NEW). Database schema ─────────────────────────────────────────
      const dbSchema = getDbSchemaSummary(appPath, allFiles);

      // ── 8 (NEW). Developer intent ─────────────────────────────────────────
      const { appType, missingFeatures } = detectDeveloperIntent(
        appPath,
        allFiles,
      );

      // ── 9. Build the rich prompt ──────────────────────────────────────────
      const systemPrompt = `You are a world-class senior software engineer doing a deep code review.

Your task: Analyze the developer's project and generate EXACTLY 3 short, hyper-specific, actionable suggestions (max 10 words each) for what they should do next.

PRIORITY ORDER:
1. 🔴 Fix build errors / TypeScript errors (most urgent)
2. 🔴 Fix runtime bugs discovered from errors
3. 🟡 Complete unfinished work (TODOs, empty states, stubs)
4. 🟡 Add missing core features for this app type
5. 🟢 UX improvements (loading states, error handling, accessibility)
6. ✨ Feature enhancements aligned with what they're building

RULES:
- Be EXTREMELY SPECIFIC — name exact file names and line numbers when available
- Use the app type (${appType}) to guide what features make sense to suggest
- One suggestion per category max
- Sound like a senior engineer, not a chatbot
- Never give generic advice like "add more features"
- Return ONLY valid JSON: [{"text": "...", "category": "fix|complete|improve|feature"}, ...]`;

      const userPrompt = [
        `<app_type>${appType}</app_type>`,
        `<framework>${framework}</framework>`,
        `<file_tree>\n${fileTree}\n</file_tree>`,
        `<key_file_contents>${keyFileContents}\n</key_file_contents>`,
        dbSchema ? `<database_schema>\n${dbSchema}\n</database_schema>` : "",
        `<recently_changed_files>\n${recentFiles.length ? recentFiles.join("\n") : "No git history found"}\n</recently_changed_files>`,
        diffSummary ? `<git_diff_stat>\n${diffSummary}\n</git_diff_stat>` : "",
        buildErrors.length
          ? `<build_errors>\n${buildErrors.join("\n")}\n</build_errors>`
          : "",
        `<missing_features_for_app_type>\n${missingFeatures.length ? missingFeatures.join("\n") : "None detected"}\n</missing_features_for_app_type>`,
        `<code_signals>\nTODOs:\n${todos.length ? todos.join("\n") : "None found"}\n\nCode smells:\n${smells.length ? smells.join("\n") : "None found"}\n</code_signals>`,
        `<chat_history>\n${allRecentMsgs || "No messages yet"}\n</chat_history>`,
        "Generate 3 suggestions as JSON array.",
      ]
        .filter(Boolean)
        .join("\n\n");

      // ── 6. Call user's model ─────────────────────────────────────────────
      try {
        const selectedModel = settings.selectedModel;
        if (!selectedModel) {
          logger.warn("No model selected, returning fallback suggestions");
          return { suggestions: FALLBACK_SUGGESTIONS };
        }

        const { modelClient } = await getModelClient(selectedModel, settings);

        const { text } = await generateText({
          model: modelClient.model,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.7,
        });

        // Parse JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\[[\s\S]*?\]/);
        if (!jsonMatch) {
          logger.warn("Model did not return JSON array, using fallback");
          return { suggestions: FALLBACK_SUGGESTIONS };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const validated = z.array(AiSuggestionSchema).safeParse(parsed);
        if (!validated.success) {
          logger.warn("Invalid suggestion format:", validated.error);
          return { suggestions: FALLBACK_SUGGESTIONS };
        }

        return { suggestions: validated.data.slice(0, 3) };
      } catch (error) {
        logger.error("Failed to generate AI suggestions:", error);
        // Return safe fallback so UI doesn't break
        return { suggestions: FALLBACK_SUGGESTIONS };
      }
    },
  );
}
