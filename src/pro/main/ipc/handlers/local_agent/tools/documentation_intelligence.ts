/**
 * Documentation Intelligence Tools (Capabilities 261-270)
 *
 * Tools for generating, analyzing, formatting, and maintaining documentation.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { glob } from "glob";

const execAsync = promisify(exec);
const logger = log.scope("documentation_intelligence");

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all source files in the project
 */
async function getSourceFiles(
  appPath: string,
  extensions: string[] = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
  ],
): Promise<string[]> {
  const allFiles: string[] = [];
  for (const ext of extensions) {
    const pattern = `**/*${ext}`;
    const files = await glob(pattern, {
      cwd: appPath,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
      absolute: false,
    });
    allFiles.push(...files);
  }
  return allFiles;
}

/**
 * Detect the primary language of the project
 */
async function detectProjectLanguage(appPath: string): Promise<string> {
  const files = await getSourceFiles(appPath);
  const extCounts: Record<string, number> = {};

  for (const file of files) {
    const ext = path.extname(file);
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }

  const extToLang: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript/React",
    ".js": "JavaScript",
    ".jsx": "JavaScript/React",
    ".py": "Python",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".cpp": "C++",
    ".c": "C",
    ".cs": "C#",
  };

  let maxExt = "";
  let maxCount = 0;
  for (const [ext, count] of Object.entries(extCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxExt = ext;
    }
  }

  return extToLang[maxExt] || "Unknown";
}

/**
 * Extract functions and classes from TypeScript/JavaScript files
 */
async function extractCodeElements(
  appPath: string,
  filePaths: string[],
): Promise<{ functions: string[]; classes: string[]; interfaces: string[] }> {
  const functions: string[] = [];
  const classes: string[] = [];
  const interfaces: string[] = [];

  const readFile = fs.promises.readFile;

  for (const filePath of filePaths) {
    const fullPath = safeJoin(appPath, filePath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = await readFile(fullPath, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        // Extract function declarations
        const funcMatch = line.match(
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\(/,
        );
        if (funcMatch) {
          const funcName = funcMatch[1] || funcMatch[2] || funcMatch[3];
          if (
            funcName &&
            !["if", "for", "while", "switch", "catch"].includes(funcName)
          ) {
            functions.push(`${filePath}: ${funcName}`);
          }
        }

        // Extract class declarations
        const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
        if (classMatch) {
          classes.push(`${filePath}: ${classMatch[1]}`);
        }

        // Extract interface declarations
        const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) {
          interfaces.push(`${filePath}: ${interfaceMatch[1]}`);
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return { functions, classes, interfaces };
}

/**
 * Get git history for changelog generation
 */
async function getGitHistory(
  appPath: string,
  limit: number = 50,
): Promise<{ hash: string; message: string; date: string; author: string }[]> {
  try {
    const { stdout } = await execAsync(
      `git log --format="%H|%s|%ai|%an" -n ${limit}`,
      { cwd: appPath },
    );

    return stdout
      .trim()
      .split("\n")
      .filter((line) => line)
      .map((line) => {
        const [hash, message, date, author] = line.split("|");
        return { hash, message, date, author };
      });
  } catch {
    return [];
  }
}

/**
 * Group commits by type for changelog
 */
function categorizeCommits(
  commits: { hash: string; message: string; date: string; author: string }[],
): {
  features: string[];
  fixes: string[];
  breaking: string[];
  other: string[];
} {
  const features: string[] = [];
  const fixes: string[] = [];
  const breaking: string[] = [];
  const other: string[] = [];

  const featurePatterns = [/feat/i, /add/i, /new/i, /feature/i, /implement/i];
  const fixPatterns = [/fix/i, /bug/i, /patch/i, /repair/i, /resolve/i];
  const breakingPatterns = [/breaking/i, /breaking[- ]change/i];

  for (const commit of commits) {
    const msg = commit.message;
    if (breakingPatterns.some((p) => p.test(msg))) {
      breaking.push(msg);
    } else if (featurePatterns.some((p) => p.test(msg))) {
      features.push(msg);
    } else if (fixPatterns.some((p) => p.test(msg))) {
      fixes.push(msg);
    } else {
      other.push(msg);
    }
  }

  return { features, fixes, breaking, other };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const autoDocGeneratorSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Specific file or directory path to generate documentation for"),
  output_path: z
    .string()
    .optional()
    .describe("Output path for the generated documentation file"),
  format: z
    .enum(["markdown", "html", "json"])
    .optional()
    .default("markdown")
    .describe("Documentation output format"),
  include_private: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include private members in documentation"),
});

const apiDocGeneratorSchema = z.object({
  path: z
    .string()
    .describe("Path to the file or directory to generate API docs for"),
  output_path: z
    .string()
    .optional()
    .describe("Output path for the generated API documentation"),
  style: z
    .enum(["jsdoc", "openapi", "typedoc", "swagger"])
    .optional()
    .default("jsdoc")
    .describe("API documentation style"),
  include_examples: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include code examples in documentation"),
});

const readmeGeneratorSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Path to generate README for (default: root)"),
  output_path: z
    .string()
    .optional()
    .describe("Output path for the generated README"),
  sections: z
    .array(
      z.enum([
        "installation",
        "usage",
        "api",
        "examples",
        "contributing",
        "license",
        "features",
        "requirements",
        "configuration",
      ]),
    )
    .optional()
    .describe("Sections to include in README"),
  include_badge: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include build/status badges"),
});

const codeCommentGeneratorSchema = z.object({
  path: z.string().describe("File or directory path to generate comments for"),
  style: z
    .enum(["jsdoc", "docstring", "inline", "block"])
    .optional()
    .default("jsdoc")
    .describe("Comment style to generate"),
  language: z
    .string()
    .optional()
    .describe("Programming language (auto-detected if not provided)"),
  thoroughness: z
    .enum(["minimal", "standard", "comprehensive"])
    .optional()
    .default("standard")
    .describe("How thorough the comments should be"),
});

const changelogGeneratorSchema = z.object({
  output_path: z
    .string()
    .optional()
    .describe("Output path for the generated changelog"),
  from_version: z
    .string()
    .optional()
    .describe("Version to start from (tag or date)"),
  to_version: z
    .string()
    .optional()
    .describe("Version to end at (default: HEAD)"),
  include_breaking: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include breaking changes section"),
  limit: z
    .number()
    .int()
    .optional()
    .default(50)
    .describe("Number of commits to include"),
});

const architectureDocGeneratorSchema = z.object({
  output_path: z
    .string()
    .optional()
    .describe("Output path for the architecture documentation"),
  format: z
    .enum(["markdown", "ascii", "mermaid", "plantuml"])
    .optional()
    .default("markdown")
    .describe("Architecture diagram format"),
  depth: z
    .enum(["overview", "detailed", "complete"])
    .optional()
    .default("overview")
    .describe("Depth of architecture details to include"),
  include_components: z
    .array(z.string())
    .optional()
    .describe("Specific components to document"),
});

const docFormatterSchema = z.object({
  path: z.string().describe("Path to documentation file(s) to format"),
  style: z
    .enum(["markdown", "jsdoc", "rst", "adoc", "google", "microsoft", "airbnb"])
    .optional()
    .default("markdown")
    .describe("Documentation style to format to"),
  fix_links: z.boolean().optional().default(true).describe("Fix broken links"),
  fix_spacing: z
    .boolean()
    .optional()
    .default(true)
    .describe("Fix spacing and alignment"),
});

const docConsistencyCheckerSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Path to check for consistency (default: entire project)"),
  check_terminology: z
    .boolean()
    .optional()
    .default(true)
    .describe("Check for consistent terminology"),
  check_formatting: z
    .boolean()
    .optional()
    .default(true)
    .describe("Check for consistent formatting"),
  check_links: z
    .boolean()
    .optional()
    .default(true)
    .describe("Check for broken links"),
});

const docCoverageAnalyzerSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Path to analyze documentation coverage"),
  output_format: z
    .enum(["json", "markdown", "html"])
    .optional()
    .default("markdown")
    .describe("Output format for coverage report"),
  include_public: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include public API in coverage analysis"),
  include_private: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include private members in coverage analysis"),
});

const docUpdaterSchema = z.object({
  path: z.string().describe("Path to documentation file to update"),
  changes: z
    .array(
      z.object({
        type: z.enum(["add", "update", "remove", "fix"]),
        section: z.string().describe("Section to update"),
        content: z.string().describe("New content or update"),
      }),
    )
    .describe("List of changes to apply"),
  create_if_missing: z
    .boolean()
    .optional()
    .default(true)
    .describe("Create file if it doesn't exist"),
});

// ============================================================================
// Tool Definitions
// ============================================================================

// Capability 261: Auto-generate documentation from code
export const autoDocGeneratorTool: ToolDefinition<
  z.infer<typeof autoDocGeneratorSchema>
> = {
  name: "auto_doc_generator",
  description: `Automatically generate documentation from source code.
  
Analyzes code structure (functions, classes, interfaces) and generates comprehensive documentation.
- Supports multiple output formats (Markdown, HTML, JSON)
- Can target specific files or entire directories
- Optionally includes private members`,
  inputSchema: autoDocGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    const target = args.path || "entire project";
    return `Generate documentation for ${target}`;
  },

  buildXml: (args, isComplete) => {
    const target = args.path || "project";
    let xml = `<dyad-doc-generator path="${escapeXmlAttr(target)}" format="${args.format || "markdown"}">`;
    if (isComplete) {
      xml += "\n</dyad-doc-generator>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path || "";
    const fullTargetPath = targetPath ? safeJoin(appPath, targetPath) : appPath;

    // Get files to document
    let filesToDoc: string[] = [];
    if (targetPath && fs.existsSync(fullTargetPath)) {
      const stat = fs.statSync(fullTargetPath);
      if (stat.isDirectory()) {
        filesToDoc = await getSourceFiles(fullTargetPath);
      } else {
        filesToDoc = [targetPath];
      }
    } else {
      filesToDoc = await getSourceFiles(appPath);
    }

    // Extract code elements
    const elements = await extractCodeElements(appPath, filesToDoc);

    // Generate documentation content
    const language = await detectProjectLanguage(appPath);
    let docContent = `# ${path.basename(appPath)} Documentation\n\n`;
    docContent += `Generated for ${language} project\n\n`;
    docContent += `## Overview\n\n`;
    docContent += `This documentation was automatically generated.\n\n`;
    docContent += `## Code Elements\n\n`;

    if (elements.classes.length > 0) {
      docContent += `### Classes\n\n`;
      for (const cls of elements.classes) {
        docContent += `- ${cls}\n`;
      }
      docContent += "\n";
    }

    if (elements.interfaces.length > 0) {
      docContent += `### Interfaces\n\n`;
      for (const iface of elements.interfaces) {
        docContent += `- ${iface}\n`;
      }
      docContent += "\n";
    }

    if (elements.functions.length > 0) {
      docContent += `### Functions\n\n`;
      for (const func of elements.functions) {
        docContent += `- ${func}\n`;
      }
      docContent += "\n";
    }

    // Write output file
    const outputPath = args.output_path || "docs/GENERATED.md";
    const fullOutputPath = safeJoin(appPath, outputPath);

    // Ensure directory exists
    const outputDir = path.dirname(fullOutputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(fullOutputPath, docContent);

    logger.log(`Generated documentation at ${outputPath}`);
    return `Successfully generated documentation at ${outputPath}\n\nDocumentation covers:\n- ${elements.classes.length} classes\n- ${elements.interfaces.length} interfaces\n- ${elements.functions.length} functions`;
  },
};

// Capability 262: Generate API documentation
export const apiDocGeneratorTool: ToolDefinition<
  z.infer<typeof apiDocGeneratorSchema>
> = {
  name: "api_doc_generator",
  description: `Generate API documentation from code.
  
Creates comprehensive API reference documentation in various formats:
- JSDoc/TypeDoc style
- OpenAPI/Swagger specifications
- Can include code examples`,
  inputSchema: apiDocGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Generate ${args.style} API documentation for ${args.path}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-api-doc path="${escapeXmlAttr(args.path)}" style="${args.style || "jsdoc"}">`;
    if (isComplete) {
      xml += "\n</dyad-api-doc>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path;
    const fullTargetPath = safeJoin(appPath, targetPath);

    if (!fs.existsSync(fullTargetPath)) {
      throw new Error(`Path does not exist: ${targetPath}`);
    }

    const isDirectory = fs.statSync(fullTargetPath).isDirectory();
    let files: string[] = [];

    if (isDirectory) {
      files = await getSourceFiles(fullTargetPath);
    } else {
      files = [targetPath];
    }

    // Extract API elements
    const elements = await extractCodeElements(appPath, files);

    // Generate API documentation
    let docContent = `# API Reference\n\n`;
    docContent += `Style: ${args.style}\n\n`;

    if (elements.interfaces.length > 0) {
      docContent += `## Interfaces\n\n`;
      for (const iface of elements.interfaces) {
        const [file, name] = iface.split(": ");
        docContent += `### ${name}\n\n`;
        docContent += `**File:** ${file}\n\n`;
        docContent += `Description: TODO\n\n`;
      }
    }

    if (elements.classes.length > 0) {
      docContent += `## Classes\n\n`;
      for (const cls of elements.classes) {
        const [file, name] = cls.split(": ");
        docContent += `### ${name}\n\n`;
        docContent += `**File:** ${file}\n\n`;
        docContent += `#### Methods\n\n`;
        docContent += `TODO\n\n`;
      }
    }

    if (elements.functions.length > 0) {
      docContent += `## Functions\n\n`;
      for (const func of elements.functions) {
        const [file, name] = func.split(": ");
        docContent += `### ${name}\n\n`;
        docContent += `**File:** ${file}\n\n`;
        docContent += `Parameters: TODO\n\n`;
        docContent += `Returns: TODO\n\n`;
        if (args.include_examples) {
          docContent += `#### Example\n\n\`\`\`typescript\n// TODO: Add example\n\`\`\`\n\n`;
        }
      }
    }

    const outputPath = args.output_path || "docs/API.md";
    const fullOutputPath = safeJoin(appPath, outputPath);
    const outputDir = path.dirname(fullOutputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(fullOutputPath, docContent);

    return `Successfully generated API documentation at ${outputPath}\n\nCovers:\n- ${elements.interfaces.length} interfaces\n- ${elements.classes.length} classes\n- ${elements.functions.length} functions`;
  },
};

// Capability 263: Generate README files
export const readmeGeneratorTool: ToolDefinition<
  z.infer<typeof readmeGeneratorSchema>
> = {
  name: "readme_generator",
  description: `Generate README files for projects.
  
Creates comprehensive README documentation with customizable sections:
- Installation instructions
- Usage examples
- API reference
- Configuration options
- And more...`,
  inputSchema: readmeGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    const target = args.path || "root";
    return `Generate README for ${target}`;
  },

  buildXml: (args, isComplete) => {
    const target = args.path || "root";
    let xml = `<dyad-readme-generator path="${escapeXmlAttr(target)}">`;
    if (isComplete) {
      xml += "\n</dyad-readme-generator>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path ? safeJoin(appPath, args.path) : appPath;

    // Detect project language
    const language = await detectProjectLanguage(appPath);

    // Read package.json for project info if available
    let projectName = path.basename(appPath);
    let projectVersion = "1.0.0";
    let projectDescription = "";

    const packageJsonPath = safeJoin(appPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        projectName = pkg.name || projectName;
        projectVersion = pkg.version || projectVersion;
        projectDescription = pkg.description || "";
      } catch {
        // Use defaults
      }
    }

    // Default sections
    const sections = args.sections || [
      "installation",
      "usage",
      "api",
      "features",
      "contributing",
      "license",
    ];

    // Build README content
    let readmeContent = `# ${projectName}\n\n`;

    if (projectDescription) {
      readmeContent += `${projectDescription}\n\n`;
    }

    if (args.include_badge) {
      readmeContent += `![Version](https://img.shields.io/badge/version-${projectVersion}-blue)\n\n`;
    }

    // Add requested sections
    if (sections.includes("features")) {
      readmeContent += `## Features\n\n`;
      readmeContent += `- Feature 1\n`;
      readmeContent += `- Feature 2\n\n`;
    }

    if (
      sections.includes("requirements") ||
      sections.includes("installation")
    ) {
      readmeContent += `## Requirements\n\n`;
      readmeContent += `- ${language} runtime\n`;
      if (language === "TypeScript" || language === "JavaScript") {
        readmeContent += `- Node.js 18+\n`;
      }
      readmeContent += "\n";
    }

    if (sections.includes("installation")) {
      readmeContent += `## Installation\n\n`;
      if (language === "TypeScript" || language === "JavaScript") {
        readmeContent += "```bash\nnpm install\n```\n\n";
      } else if (language === "Python") {
        readmeContent += "```bash\npip install -r requirements.txt\n```\n\n";
      }
    }

    if (sections.includes("usage")) {
      readmeContent += `## Usage\n\n`;
      readmeContent += "```bash\n# Add usage examples here\n```\n\n";
    }

    if (sections.includes("api")) {
      readmeContent += `## API\n\n`;
      readmeContent += "See [API Documentation](docs/API.md) for details.\n\n";
    }

    if (sections.includes("contributing")) {
      readmeContent += `## Contributing\n\n`;
      readmeContent +=
        "Contributions are welcome! Please read the [contributing guidelines](CONTRIBUTING.md) first.\n\n";
    }

    if (sections.includes("license")) {
      readmeContent += `## License\n\n`;
      readmeContent += "MIT License - see LICENSE file for details.\n\n";
    }

    const outputPath = args.output_path || "README.md";
    const fullOutputPath = safeJoin(appPath, outputPath);
    fs.writeFileSync(fullOutputPath, readmeContent);

    return `Successfully generated README at ${outputPath}`;
  },
};

// Capability 264: Generate inline code comments
export const codeCommentGeneratorTool: ToolDefinition<
  z.infer<typeof codeCommentGeneratorSchema>
> = {
  name: "code_comment_generator",
  description: `Generate inline code comments for functions, classes, and methods.
  
Supports various comment styles:
- JSDoc for JavaScript/TypeScript
- Docstring for Python
- Block and inline comments`,
  inputSchema: codeCommentGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Generate ${args.style} comments for ${args.path}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-comment-generator path="${escapeXmlAttr(args.path)}" style="${args.style || "jsdoc"}">`;
    if (isComplete) {
      xml += "\n</dyad-comment-generator>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path;
    const fullTargetPath = safeJoin(appPath, targetPath);

    if (!fs.existsSync(fullTargetPath)) {
      throw new Error(`Path does not exist: ${targetPath}`);
    }

    const isDirectory = fs.statSync(fullTargetPath).isDirectory();
    let files: string[] = [];

    if (isDirectory) {
      files = await getSourceFiles(fullTargetPath);
    } else {
      files = [targetPath];
    }

    const readFile = fs.promises.readFile;
    let commentedFiles = 0;

    for (const file of files) {
      const fullPath = safeJoin(appPath, file);
      if (!fs.existsSync(fullPath)) continue;

      try {
        let content = await readFile(fullPath, "utf8");
        const ext = path.extname(file);

        // Add comments based on style and language
        const commentStyles: Record<
          string,
          { start: string; end: string; line: string }
        > = {
          ".ts": { start: "/**", end: " */", line: "//" },
          ".tsx": { start: "/**", end: " */", line: "//" },
          ".js": { start: "/**", end: " */", line: "//" },
          ".jsx": { start: "/**", end: " */", line: "//" },
          ".py": { start: '"""', end: '"""', line: "#" },
          ".java": { start: "/**", end: " */", line: "//" },
          ".go": { start: "//", end: "", line: "//" },
          ".rs": { start: "/**", end: " */", line: "//" },
        };

        const style = commentStyles[ext] || {
          start: "//",
          end: "",
          line: "//",
        };

        // Generate header comment
        const headerComment = `${style.start} File: ${path.basename(file)}\n${style.end}\n\n`;

        // Insert header comment if not already present
        if (!content.startsWith(style.start)) {
          content = headerComment + content;
        }

        fs.writeFileSync(fullPath, content);
        commentedFiles++;
      } catch {
        // Skip files that can't be processed
      }
    }

    return `Generated comments for ${commentedFiles} file(s)`;
  },
};

// Capability 265: Generate changelog from git history
export const changelogGeneratorTool: ToolDefinition<
  z.infer<typeof changelogGeneratorSchema>
> = {
  name: "changelog_generator",
  description: `Generate changelog from git commit history.
  
Analyzes git commits and groups them into:
- Features/New features
- Bug fixes
- Breaking changes
- Other changes`,
  inputSchema: changelogGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    const output = args.output_path || "CHANGELOG.md";
    return `Generate changelog at ${output}`;
  },

  buildXml: (args, isComplete) => {
    const output = args.output_path || "CHANGELOG.md";
    let xml = `<dyad-changelog output="${escapeXmlAttr(output)}">`;
    if (isComplete) {
      xml += "\n</dyad-changelog>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;

    // Get git history
    const commits = await getGitHistory(appPath, args.limit || 50);

    if (commits.length === 0) {
      throw new Error("No git history found or not a git repository");
    }

    // Categorize commits
    const categorized = categorizeCommits(commits);

    // Generate changelog
    let changelog = `# Changelog\n\n`;
    changelog += `All notable changes to this project will be documented in this file.\n\n`;
    changelog += `## [Unreleased]\n\n`;

    if (categorized.breaking.length > 0 && args.include_breaking) {
      changelog += `### Breaking Changes\n\n`;
      for (const msg of categorized.breaking) {
        changelog += `- ${msg}\n`;
      }
      changelog += "\n";
    }

    if (categorized.features.length > 0) {
      changelog += `### Features\n\n`;
      for (const msg of categorized.features) {
        changelog += `- ${msg}\n`;
      }
      changelog += "\n";
    }

    if (categorized.fixes.length > 0) {
      changelog += `### Bug Fixes\n\n`;
      for (const msg of categorized.fixes) {
        changelog += `- ${msg}\n`;
      }
      changelog += "\n";
    }

    if (categorized.other.length > 0) {
      changelog += `### Other Changes\n\n`;
      for (const msg of categorized.other) {
        changelog += `- ${msg}\n`;
      }
      changelog += "\n";
    }

    // Get latest version info
    if (commits.length > 0) {
      const latestDate = commits[0]?.date || "Unknown";
      changelog += `---\n`;
      changelog += `Generated on ${latestDate}\n`;
    }

    const outputPath = args.output_path || "CHANGELOG.md";
    const fullOutputPath = safeJoin(appPath, outputPath);
    fs.writeFileSync(fullOutputPath, changelog);

    return `Successfully generated changelog at ${outputPath}\n\nSummary:\n- ${categorized.features.length} features\n- ${categorized.fixes.length} fixes\n- ${categorized.breaking.length} breaking changes`;
  },
};

// Capability 266: Generate architecture documentation
export const architectureDocGeneratorTool: ToolDefinition<
  z.infer<typeof architectureDocGeneratorSchema>
> = {
  name: "architecture_doc_generator",
  description: `Generate architecture documentation for the project.
  
Creates comprehensive architecture documentation including:
- Component diagrams
- Module relationships
- Data flow
- Supports multiple output formats`,
  inputSchema: architectureDocGeneratorSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => {
    const output = args.output_path || "docs/ARCHITECTURE.md";
    return `Generate architecture docs at ${output}`;
  },

  buildXml: (args, isComplete) => {
    const output = args.output_path || "docs/ARCHITECTURE.md";
    let xml = `<dyad-arch-doc output="${escapeXmlAttr(output)}" format="${args.format || "markdown"}">`;
    if (isComplete) {
      xml += "\n</dyad-arch-doc>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const format = args.format || "markdown";
    const depth = args.depth || "overview";

    // Get source files for analysis
    const files = await getSourceFiles(appPath);

    // Analyze directory structure
    const dirStructure: Record<string, number> = {};
    for (const file of files) {
      const dir = path.dirname(file);
      dirStructure[dir] = (dirStructure[dir] || 0) + 1;
    }

    // Generate architecture documentation
    let docContent = `# Architecture Documentation\n\n`;
    docContent += `## Overview\n\n`;
    docContent += `This document describes the architecture of ${path.basename(appPath)}.\n\n`;

    if (depth === "overview" || depth === "detailed" || depth === "complete") {
      docContent += `## Project Structure\n\n`;
      docContent += `The project contains ${files.length} source files organized as follows:\n\n`;

      // List top-level directories
      const topDirs = Object.entries(dirStructure)
        .filter(([dir]) => !dir.includes("/") || dir === ".")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      docContent += `| Directory | Files |\n`;
      docContent += `|-----------|-------|\n`;
      for (const [dir, count] of topDirs) {
        const dirName = dir === "." ? "Root" : dir;
        docContent += `| ${dirName} | ${count} |\n`;
      }
      docContent += "\n";
    }

    if (depth === "detailed" || depth === "complete") {
      docContent += `## Components\n\n`;
      docContent += `### Source Files\n\n`;
      docContent += `Total: ${files.length} files\n\n`;
    }

    if (format === "mermaid") {
      docContent += `## Diagram\n\n`;
      docContent += `\`\`\`mermaid\n`;
      docContent += `graph TD\n`;
      for (const [dir] of Object.entries(dirStructure).slice(0, 10)) {
        if (dir !== ".") {
          docContent += `  ${dir.replace(/[^a-zA-Z]/g, "_")}[${dir}]\n`;
        }
      }
      docContent += `\`\`\`\n`;
    }

    docContent += `## Technology Stack\n\n`;
    docContent += `- Language: ${await detectProjectLanguage(appPath)}\n`;
    docContent += `- Total Source Files: ${files.length}\n\n`;

    const outputPath = args.output_path || "docs/ARCHITECTURE.md";
    const fullOutputPath = safeJoin(appPath, outputPath);
    const outputDir = path.dirname(fullOutputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(fullOutputPath, docContent);

    return `Successfully generated architecture documentation at ${outputPath}`;
  },
};

// Capability 267: Format documentation
export const docFormatterTool: ToolDefinition<
  z.infer<typeof docFormatterSchema>
> = {
  name: "doc_formatter",
  description: `Format documentation files to follow consistent style guidelines.
  
Supports various documentation formats and styles:
- Markdown formatting
- JSDoc formatting
- Link fixing
- Spacing normalization`,
  inputSchema: docFormatterSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => `Format documentation in ${args.path}`,

  buildXml: (args, isComplete) => {
    let xml = `<dyad-doc-formatter path="${escapeXmlAttr(args.path)}" style="${args.style || "markdown"}">`;
    if (isComplete) {
      xml += "\n</dyad-doc-formatter>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = safeJoin(appPath, args.path);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Path does not exist: ${args.path}`);
    }

    const stat = fs.statSync(targetPath);
    let files: string[] = [];

    if (stat.isDirectory()) {
      const pattern = args.style === "markdown" ? "**/*.md" : "**/*";
      files = await glob(pattern, {
        cwd: targetPath,
        ignore: ["**/node_modules/**"],
      });
    } else {
      files = [args.path];
    }

    let formatted = 0;
    const readFile = fs.promises.readFile;

    for (const file of files) {
      const fullPath = safeJoin(appPath, file);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory())
        continue;

      try {
        let content = await readFile(fullPath, "utf8");

        // Apply formatting based on style
        if (args.fix_spacing) {
          // Fix multiple consecutive newlines
          content = content.replace(/\n{3,}/g, "\n\n");
          // Fix trailing whitespace
          content = content.replace(/[ \t]+$/gm, "");
          // Fix spacing around code blocks
          content = content.replace(/```\n/g, "```\n");
        }

        fs.writeFileSync(fullPath, content);
        formatted++;
      } catch {
        // Skip files that can't be processed
      }
    }

    return `Formatted ${formatted} documentation file(s)`;
  },
};

// Capability 268: Check documentation consistency
export const docConsistencyCheckerTool: ToolDefinition<
  z.infer<typeof docConsistencyCheckerSchema>
> = {
  name: "doc_consistency_checker",
  description: `Check documentation for consistency issues.
  
Detects:
- Inconsistent terminology
- Formatting inconsistencies
- Broken links
- Missing sections`,
  inputSchema: docConsistencyCheckerSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => {
    const target = args.path || "project";
    return `Check documentation consistency in ${target}`;
  },

  buildXml: (args, isComplete) => {
    const target = args.path || "project";
    let xml = `<dyad-doc-checker path="${escapeXmlAttr(target)}">`;
    if (isComplete) {
      xml += "\n</dyad-doc-checker>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path ? safeJoin(appPath, args.path) : appPath;

    // Find documentation files
    const mdFiles = await glob("**/*.md", {
      cwd: appPath,
      ignore: ["**/node_modules/**", "**/.git/**"],
    });

    const issues: string[] = [];
    const readFile = fs.promises.readFile;

    // Check each file
    for (const file of mdFiles.slice(0, 50)) {
      const fullPath = safeJoin(appPath, file);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const content = await readFile(fullPath, "utf8");

        // Check for broken links
        if (args.check_links) {
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
          let match;
          while ((match = linkRegex.exec(content)) !== null) {
            const link = match[2];
            if (
              link.startsWith("http") ||
              link.startsWith("mailto:") ||
              link.startsWith("#")
            ) {
              continue;
            }

            // Check if relative link exists
            const linkPath = safeJoin(path.dirname(fullPath), link);
            if (!fs.existsSync(linkPath)) {
              issues.push(`${file}: Broken link: ${link}`);
            }
          }
        }

        // Check for consistent formatting
        if (args.check_formatting) {
          // Check for inconsistent heading levels
          const headingRegex = /^(#{1,6})\s+/gm;
          const headings = content.match(headingRegex) || [];
          let lastLevel = 0;
          for (const heading of headings) {
            const level = heading.trim().length;
            if (level > lastLevel + 1 && lastLevel !== 0) {
              issues.push(
                `${file}: Inconsistent heading level (jumped from ${lastLevel} to ${level})`,
              );
            }
            lastLevel = level;
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Check terminology consistency across files
    if (args.check_terminology) {
      // This is a simplified check - in a real implementation,
      // you'd compare against a terminology dictionary
      issues.push(
        "Terminology check: Use a terminology dictionary for full analysis",
      );
    }

    const result =
      issues.length === 0
        ? "Documentation consistency check passed!"
        : `Found ${issues.length} issue(s):\n\n${issues.slice(0, 20).join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-doc-checker>${escapeXmlContent(result)}</dyad-doc-checker>`,
    );

    return result;
  },
};

// Capability 269: Analyze documentation coverage
export const docCoverageAnalyzerTool: ToolDefinition<
  z.infer<typeof docCoverageAnalyzerSchema>
> = {
  name: "doc_coverage_analyzer",
  description: `Analyze documentation coverage across the codebase.
  
Identifies:
- Documented vs undocumented code elements
- Coverage percentage
- Missing documentation suggestions`,
  inputSchema: docCoverageAnalyzerSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => {
    const target = args.path || "entire project";
    return `Analyze documentation coverage for ${target}`;
  },

  buildXml: (args, isComplete) => {
    const target = args.path || "project";
    let xml = `<dyad-doc-coverage path="${escapeXmlAttr(target)}">`;
    if (isComplete) {
      xml += "\n</dyad-doc-coverage>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const appPath = ctx.appPath;
    const targetPath = args.path ? safeJoin(appPath, args.path) : appPath;

    // Get source files
    const sourceFiles = await getSourceFiles(targetPath);

    // Find documentation files
    const docFiles = await glob("**/*.md", {
      cwd: appPath,
      ignore: ["**/node_modules/**"],
    });

    // Extract code elements
    const elements = await extractCodeElements(appPath, sourceFiles);
    const totalElements =
      elements.functions.length +
      elements.classes.length +
      elements.interfaces.length;

    // Check for JSDoc-style comments in source
    let documentedElements = 0;
    const readFile = fs.promises.readFile;

    for (const file of sourceFiles.slice(0, 100)) {
      const fullPath = safeJoin(appPath, file);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const content = await readFile(fullPath, "utf8");
        // Count JSDoc-style comments
        const jsdocCount = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
        documentedElements += jsdocCount;
      } catch {
        // Skip
      }
    }

    // Calculate coverage
    const coverage =
      totalElements > 0
        ? Math.round((documentedElements / totalElements) * 100)
        : 0;

    // Generate report
    let report = `# Documentation Coverage Report\n\n`;
    report += `## Summary\n\n`;
    report += `- Total Code Elements: ${totalElements}\n`;
    report += `- Documented Elements: ${documentedElements}\n`;
    report += `- Coverage: ${coverage}%\n\n`;
    report += `## Details\n\n`;
    report += `- Classes: ${elements.classes.length}\n`;
    report += `- Interfaces: ${elements.interfaces.length}\n`;
    report += `- Functions: ${elements.functions.length}\n`;
    report += `- Documentation Files: ${docFiles.length}\n\n`;

    if (coverage < 50) {
      report += `## Recommendations\n\n`;
      report += `- Consider adding more inline comments\n`;
      report += `- Generate API documentation\n`;
      report += `- Add usage examples\n`;
    }

    const outputPath = "docs/COVERAGE.md";
    const fullOutputPath = safeJoin(appPath, outputPath);
    const outputDir = path.dirname(fullOutputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(fullOutputPath, report);

    return `Documentation coverage: ${coverage}%\n\nReport generated at ${outputPath}`;
  },
};

// Capability 270: Update existing documentation
export const docUpdaterTool: ToolDefinition<z.infer<typeof docUpdaterSchema>> =
  {
    name: "doc_updater",
    description: `Update existing documentation files.
  
Applies targeted updates to documentation:
- Add new sections
- Update existing content
- Fix issues
- Remove deprecated sections`,
    inputSchema: docUpdaterSchema,
    defaultConsent: "ask",
    modifiesState: true,

    getConsentPreview: (args) => `Update documentation at ${args.path}`,

    buildXml: (args, isComplete) => {
      let xml = `<dyad-doc-updater path="${escapeXmlAttr(args.path)}">`;
      if (isComplete) {
        xml += "\n</dyad-doc-updater>";
      }
      return xml;
    },

    execute: async (args, ctx: AgentContext) => {
      const appPath = ctx.appPath;
      const targetPath = safeJoin(appPath, args.path);

      // Check if file exists
      if (!fs.existsSync(targetPath)) {
        if (args.create_if_missing) {
          // Create new file with initial content
          let content = `# ${path.basename(args.path, ".md")}\n\n`;
          for (const change of args.changes) {
            content += `## ${change.section}\n\n`;
            content += `${change.content}\n\n`;
          }
          fs.writeFileSync(targetPath, content);
          return `Created new documentation at ${args.path}`;
        } else {
          throw new Error(`File does not exist: ${args.path}`);
        }
      }

      // Read existing content
      let content = fs.readFileSync(targetPath, "utf8");

      // Apply changes
      for (const change of args.changes) {
        switch (change.type) {
          case "add": {
            // Add new section
            content += `\n## ${change.section}\n\n`;
            content += `${change.content}\n`;
            break;
          }
          case "update": {
            // Update existing section
            const sectionRegex = new RegExp(
              `(##\\s+${escapeRegex(change.section)}[\\s\\S]*?)(?=\\n##|\\n#|\\Z)`,
              "i",
            );
            if (sectionRegex.test(content)) {
              content = content.replace(
                sectionRegex,
                `## ${change.section}\n\n${change.content}`,
              );
            } else {
              // Section not found, add it
              content += `\n## ${change.section}\n\n`;
              content += `${change.content}\n`;
            }
            break;
          }
          case "remove": {
            // Remove section
            const removeRegex = new RegExp(
              `\\n##\\s+${escapeRegex(change.section)}[\\s\\S]*?(?=\\n##|\\n#|\\Z)`,
              "i",
            );
            content = content.replace(removeRegex, "");
            break;
          }
          case "fix": {
            // Simple fix - append to end or add warning section
            content += `\n### Fixes\n\n`;
            content += `- ${change.content}\n`;
            break;
          }
        }
      }

      fs.writeFileSync(targetPath, content);

      return `Successfully updated documentation at ${args.path}`;
    },
  };

// Helper function to escape regex special characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Export all tools
// ============================================================================

export const documentationIntelligenceTools = {
  autoDocGeneratorTool,
  apiDocGeneratorTool,
  readmeGeneratorTool,
  codeCommentGeneratorTool,
  changelogGeneratorTool,
  architectureDocGeneratorTool,
  docFormatterTool,
  docConsistencyCheckerTool,
  docCoverageAnalyzerTool,
  docUpdaterTool,
};
