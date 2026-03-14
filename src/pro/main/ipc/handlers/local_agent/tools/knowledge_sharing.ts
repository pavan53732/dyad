/**
 * Knowledge Sharing Tool
 * Capabilities 481-500: Share learned patterns between agents
 * - Cross-project knowledge transfer
 * - Documentation generation
 * - API documentation from code
 * - Code example sharing
 * - Team knowledge base updates
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const KnowledgeSharingArgs = z.object({
  /** Action to perform */
  action: z.enum([
    "share_pattern",
    "generate_docs",
    "generate_api_docs",
    "share_example",
    "update_knowledge_base",
    "search_knowledge",
    "export_knowledge",
  ]),
  /** Pattern or concept to share */
  pattern: z.string().optional(),
  /** Description of the pattern or concept */
  description: z.string().optional(),
  /** Programming language */
  language: z.string().default("typescript"),
  /** File path to analyze or save to */
  filePath: z.string().optional(),
  /** Source file path for API docs generation */
  sourcePath: z.string().optional(),
  /** Code example to share */
  codeExample: z.string().optional(),
  /** Tags for categorization */
  tags: z.array(z.string()).default([]),
  /** Category for knowledge base */
  category: z
    .enum([
      "patterns",
      "best_practices",
      "architecture",
      "security",
      "performance",
      "testing",
      "api",
      "utilities",
      "workflows",
    ])
    .default("patterns"),
  /** Search query for knowledge base */
  searchQuery: z.string().optional(),
  /** Maximum results to return */
  maxResults: z.number().min(1).max(50).default(10),
  /** Output format */
  format: z.enum(["markdown", "json", "html"]).default("markdown"),
});

type KnowledgeSharingArgs = z.infer<typeof KnowledgeSharingArgs>;

// ============================================================================
// Types
// ============================================================================

interface KnowledgeEntry {
  id: string;
  pattern: string;
  description: string;
  language: string;
  codeExample?: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  relevanceScore: number;
}

interface KnowledgeResult {
  action: string;
  success: boolean;
  message: string;
  data?: {
    entry?: KnowledgeEntry;
    entries?: KnowledgeEntry[];
    searchResults?: KnowledgeSearchResult[];
    documentation?: string;
    exportedData?: string;
  };
}

// ============================================================================
// In-Memory Knowledge Base
// ============================================================================

const knowledgeBase = new Map<string, KnowledgeEntry>();

// Initialize with some common patterns
const initialPatterns: KnowledgeEntry[] = [
  {
    id: "pat-1",
    pattern: "Singleton Pattern",
    description: "Ensures a class has only one instance and provides a global point of access to it",
    language: "typescript",
    codeExample: `class Singleton {
  private static instance: Singleton;
  private constructor() {}

  public static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }
    return Singleton.instance;
  }
}`,
    tags: ["design-pattern", "creational", "architecture"],
    category: "patterns",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: "pat-2",
    pattern: "Repository Pattern",
    description: "Mediates between the domain and data mapping layers using a collection-like interface",
    language: "typescript",
    codeExample: `interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

class UserRepository implements Repository<User> {
  // Implementation
}`,
    tags: ["design-pattern", "data-access", "architecture"],
    category: "patterns",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: "pat-3",
    pattern: "Error Handling Middleware",
    description: "Centralized error handling for Express.js applications",
    language: "typescript",
    codeExample: `function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err.stack);
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
}

app.use(errorHandler);`,
    tags: ["error-handling", "express", "middleware", "best-practices"],
    category: "best_practices",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: "pat-4",
    pattern: "React Custom Hook",
    description: "Extract and reuse stateful logic in React components",
    language: "typescript",
    codeExample: `function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  const reset = () => setCount(initialValue);

  return { count, increment, decrement, reset };
}`,
    tags: ["react", "hooks", "state-management", "reusable"],
    category: "patterns",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: "pat-5",
    pattern: "Debounce Function",
    description: "Limit the rate at which a function can fire",
    language: "typescript",
    codeExample: `function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}`,
    tags: ["performance", "utility", "optimization"],
    category: "utilities",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  },
];

initialPatterns.forEach((p) => knowledgeBase.set(p.id, p));

// ============================================================================
// Knowledge Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Share a new pattern
 */
function sharePattern(args: KnowledgeSharingArgs): KnowledgeResult {
  if (!args.pattern || !args.description) {
    return {
      action: "share_pattern",
      success: false,
      message: "Pattern name and description are required",
    };
  }

  const entry: KnowledgeEntry = {
    id: generateId("pat"),
    pattern: args.pattern,
    description: args.description,
    language: args.language,
    codeExample: args.codeExample,
    tags: args.tags,
    category: args.category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };

  knowledgeBase.set(entry.id, entry);

  return {
    action: "share_pattern",
    success: true,
    message: `Pattern "${args.pattern}" added to knowledge base`,
    data: { entry },
  };
}

/**
 * Generate documentation from code
 */
async function generateDocs(args: KnowledgeSharingArgs): Promise<KnowledgeResult> {
  if (!args.filePath) {
    return {
      action: "generate_docs",
      success: false,
      message: "File path is required for documentation generation",
    };
  }

  try {
    const content = await fs.readFile(args.filePath, "utf-8");
    const lines = content.split("\n");
    const fileName = path.basename(args.filePath, path.extname(args.filePath));

    // Extract functions and classes
    const functions: string[] = [];
    const classes: string[] = [];
    const interfaces: string[] = [];
    const exports: string[] = [];

    for (const line of lines) {
      // Match functions
      const funcMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:\([^)]*\)|[^=]))?\s*=>/);
      if (funcMatch && !line.includes("//")) {
        functions.push(funcMatch[1]);
      }

      // Match classes
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) {
        classes.push(classMatch[1]);
      }

      // Match interfaces
      const interfaceMatch = line.match(/interface\s+(\w+)/);
      if (interfaceMatch) {
        interfaces.push(interfaceMatch[1]);
      }

      // Match exports
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type)\s+(\w+)/);
      if (exportMatch) {
        exports.push(exportMatch[1]);
      }
    }

    const documentation = `# ${fileName}\n\n` +
      `## Overview\n\n` +
      `Generated documentation for ${path.basename(args.filePath)}\n\n` +
      (classes.length > 0 ? `## Classes\n\n${classes.map(c => `- ${c}`).join("\n")}\n\n` : "") +
      (interfaces.length > 0 ? `## Interfaces\n\n${interfaces.map(i => `- ${i}`).join("\n")}\n\n` : "") +
      (functions.length > 0 ? `## Functions\n\n${functions.map(f => `- ${f}`).join("\n")}\n\n` : "") +
      (exports.length > 0 ? `## Exports\n\n${exports.map(e => `- ${e}`).join("\n")}\n\n` : "") +
      `## Usage\n\n\`\`\`${args.language}\n// Import and use the exported members\nimport { ${exports.join(", ")} } from './${fileName}';\n\`\`\`\n`;

    return {
      action: "generate_docs",
      success: true,
      message: `Documentation generated for ${args.filePath}`,
      data: { documentation },
    };
  } catch (error) {
    return {
      action: "generate_docs",
      success: false,
      message: `Failed to generate docs: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Generate API documentation
 */
async function generateApiDocs(args: KnowledgeSharingArgs): Promise<KnowledgeResult> {
  if (!args.sourcePath) {
    return {
      action: "generate_api_docs",
      success: false,
      message: "Source path is required for API documentation generation",
    };
  }

  try {
    const content = await fs.readFile(args.sourcePath, "utf-8");
    const lines = content.split("\n");
    const fileName = path.basename(args.sourcePath);

    // Extract API endpoints and handlers
    const endpoints: Array<{
      method: string;
      path: string;
      handler: string;
      line: number;
    }> = [];

    // Match common API patterns
    const patterns = [
      /(?:app|router|express)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,?\s*(\w+)/gi,
      /@(\w+)\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const matches = [...line.matchAll(pattern)];
        for (const match of matches) {
          const method = (match[1] || "GET").toUpperCase();
          const path = match[2];
          const handler = match[3] || "handler";
          endpoints.push({ method, path, handler, line: i + 1 });
        }
      }
    }

    // Extract types and interfaces
    const types: string[] = [];
    const interfaces: string[] = [];

    for (const line of lines) {
      const typeMatch = line.match(/type\s+(\w+)/);
      if (typeMatch) {
        types.push(typeMatch[1]);
      }
      const interfaceMatch = line.match(/interface\s+(\w+)/);
      if (interfaceMatch) {
        interfaces.push(interfaceMatch[1]);
      }
    }

    let documentation = `# API Documentation: ${fileName}\n\n`;

    if (endpoints.length > 0) {
      documentation += `## Endpoints\n\n`;
      for (const endpoint of endpoints) {
        const methodEmoji =
          endpoint.method === "GET"
            ? "🔵"
            : endpoint.method === "POST"
              ? "🟢"
              : endpoint.method === "PUT"
                ? "🟠"
                : endpoint.method === "DELETE"
                  ? "🔴"
                  : "🟡";
        documentation += `### ${methodEmoji} \`${endpoint.method}\` ${endpoint.path}\n\n`;
        documentation += `- **Handler:** ${endpoint.handler}\n`;
        documentation += `- **Line:** ${endpoint.line}\n\n`;
      }
    }

    if (interfaces.length > 0) {
      documentation += `## Interfaces\n\n${interfaces.map(i => `- ${i}`).join("\n")}\n\n`;
    }

    if (types.length > 0) {
      documentation += `## Types\n\n${types.map(t => `- ${t}`).join("\n")}\n\n`;
    }

    if (endpoints.length === 0 && interfaces.length === 0 && types.length === 0) {
      documentation += "No API definitions found in the file.\n";
    }

    return {
      action: "generate_api_docs",
      success: true,
      message: `API documentation generated for ${args.sourcePath}`,
      data: { documentation },
    };
  } catch (error) {
    return {
      action: "generate_api_docs",
      success: false,
      message: `Failed to generate API docs: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Share a code example
 */
function shareExample(args: KnowledgeSharingArgs): KnowledgeResult {
  if (!args.codeExample) {
    return {
      action: "share_example",
      success: false,
      message: "Code example is required",
    };
  }

  const entry: KnowledgeEntry = {
    id: generateId("ex"),
    pattern: args.pattern || "Code Example",
    description: args.description || "Shared code example",
    language: args.language,
    codeExample: args.codeExample,
    tags: args.tags,
    category: args.category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };

  knowledgeBase.set(entry.id, entry);

  return {
    action: "share_example",
    success: true,
    message: "Code example added to knowledge base",
    data: { entry },
  };
}

/**
 * Update knowledge base entry
 */
function updateKnowledgeBase(args: KnowledgeSharingArgs): KnowledgeResult {
  // Find entry by pattern name
  const entry = Array.from(knowledgeBase.values()).find(
    (e) => e.pattern.toLowerCase() === args.pattern?.toLowerCase(),
  );

  if (!entry) {
    return {
      action: "update_knowledge_base",
      success: false,
      message: `Pattern "${args.pattern}" not found in knowledge base`,
    };
  }

  // Update fields
  if (args.description) entry.description = args.description;
  if (args.codeExample) entry.codeExample = args.codeExample;
  if (args.tags.length > 0) entry.tags = args.tags;
  if (args.category) entry.category = args.category;
  entry.updatedAt = new Date().toISOString();
  entry.usageCount++;

  knowledgeBase.set(entry.id, entry);

  return {
    action: "update_knowledge_base",
    success: true,
    message: `Updated knowledge base entry for "${entry.pattern}"`,
    data: { entry },
  };
}

/**
 * Search knowledge base
 */
function searchKnowledge(args: KnowledgeSharingArgs): KnowledgeResult {
  if (!args.searchQuery) {
    // Return all entries
    const entries = Array.from(knowledgeBase.values()).slice(0, args.maxResults);
    return {
      action: "search_knowledge",
      success: true,
      message: `Found ${entries.length} knowledge entries`,
      data: { entries },
    };
  }

  const query = args.searchQuery.toLowerCase();
  const results: KnowledgeSearchResult[] = [];

  for (const entry of knowledgeBase.values()) {
    let relevanceScore = 0;

    // Check pattern name
    if (entry.pattern.toLowerCase().includes(query)) {
      relevanceScore += 10;
    }

    // Check description
    if (entry.description.toLowerCase().includes(query)) {
      relevanceScore += 5;
    }

    // Check tags
    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(query)) {
        relevanceScore += 3;
      }
    }

    // Check code example
    if (entry.codeExample?.toLowerCase().includes(query)) {
      relevanceScore += 2;
    }

    if (relevanceScore > 0) {
      results.push({ entry, relevanceScore });
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topResults = results.slice(0, args.maxResults);

  return {
    action: "search_knowledge",
    success: true,
    message: `Found ${topResults.length} relevant entries`,
    data: { searchResults: topResults },
  };
}

/**
 * Export knowledge base
 */
function exportKnowledge(args: KnowledgeSharingArgs): KnowledgeResult {
  const entries = Array.from(knowledgeBase.values());

  let exportedData: string;

  switch (args.format) {
    case "json":
      exportedData = JSON.stringify(entries, null, 2);
      break;
    case "html":
      exportedData = `<!DOCTYPE html>
<html>
<head>
  <title>Knowledge Base Export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .entry { border: 1px solid #ddd; padding: 16px; margin: 16px 0; border-radius: 8px; }
    .tag { background: #e0e7ff; padding: 4px 8px; border-radius: 4px; margin-right: 4px; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Knowledge Base Export</h1>
  ${entries.map(entry => `
  <div class="entry">
    <h2>${entry.pattern}</h2>
    <p>${entry.description}</p>
    <p><strong>Language:</strong> ${entry.language}</p>
    <p><strong>Category:</strong> ${entry.category}</p>
    <p><strong>Tags:</strong> ${entry.tags.map(tag => `<span class="tag">${tag}</span>`).join(" ")}</p>
    ${entry.codeExample ? `<pre><code>${entry.codeExample}</code></pre>` : ""}
  </div>
  `).join("\n")}
</body>
</html>`;
      break;
    case "markdown":
    default:
      exportedData = entries
        .map(
          (entry) => `## ${entry.pattern}\n\n**Language:** ${entry.language}  \n**Category:** ${entry.category}  \n**Tags:** ${entry.tags.join(", ")}  \n\n${entry.description}\n\n${entry.codeExample ? "```" + entry.language + "\n" + entry.codeExample + "\n```" : ""}\n`,
        )
        .join("\n---\n\n");
      break;
  }

  return {
    action: "export_knowledge",
    success: true,
    message: `Exported ${entries.length} knowledge entries`,
    data: { exportedData, entries },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateKnowledgeXml(result: KnowledgeResult): string {
  const lines: string[] = [
    `# Knowledge Sharing`,
    ``,
    `**Action:** ${result.action}`,
    `**Status:** ${result.success ? "✅ Success" : "❌ Failed"}`,
    ``,
    result.message,
    ``,
  ];

  if (result.data) {
    if (result.data.entry) {
      lines.push(`## Entry Details`);
      lines.push(``);
      lines.push(`**Pattern:** ${result.data.entry.pattern}`);
      lines.push(`**Language:** ${result.data.entry.language}`);
      lines.push(`**Category:** ${result.data.entry.category}`);
      lines.push(`**Tags:** ${result.data.entry.tags.join(", ")}`);
      lines.push(``);
      lines.push(`**Description:** ${result.data.entry.description}`);
      if (result.data.entry.codeExample) {
        lines.push(``);
        lines.push("```" + result.data.entry.language);
        lines.push(result.data.entry.codeExample);
        lines.push("```");
      }
      lines.push(``);
    }

    if (result.data.entries && result.data.entries.length > 0) {
      lines.push(`## Knowledge Entries`);
      lines.push(``);
      for (const entry of result.data.entries) {
        lines.push(`### ${entry.pattern}`);
        lines.push(``);
        lines.push(entry.description);
        lines.push(``);
        lines.push(`*${entry.language} | ${entry.category} | ${entry.tags.join(", ")}*`);
        lines.push(``);
      }
    }

    if (result.data.searchResults && result.data.searchResults.length > 0) {
      lines.push(`## Search Results`);
      lines.push(``);
      for (const r of result.data.searchResults) {
        lines.push(`### ${r.entry.pattern} (Relevance: ${r.relevanceScore})`);
        lines.push(``);
        lines.push(r.entry.description);
        lines.push(``);
      }
    }

    if (result.data.documentation) {
      lines.push(`## Generated Documentation`);
      lines.push(``);
      lines.push(result.data.documentation);
      lines.push(``);
    }

    if (result.data.exportedData) {
      if (result.data.exportedData.length > 5000) {
        lines.push(`## Exported Data`);
        lines.push(``);
        lines.push(`(Output truncated - ${result.data.exportedData.length} characters)`);
        lines.push(``);
        lines.push("```");
        lines.push(result.data.exportedData.substring(0, 5000));
        lines.push("```");
      } else {
        lines.push(`## Exported Data`);
        lines.push(``);
        lines.push("```");
        lines.push(result.data.exportedData);
        lines.push("```");
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const knowledgeSharingTool: ToolDefinition<KnowledgeSharingArgs> = {
  name: "knowledge_sharing",
  description:
    "Shares learned patterns between agents, generates documentation from code, creates API documentation, shares code examples, and manages the team knowledge base. Use this to build and share knowledge across agents and team members.",
  inputSchema: KnowledgeSharingArgs,
  defaultConsent: "always",
  modifiesState: true,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Knowledge Sharing">Processing ${args.action}...</dyad-status>`,
    );

    let result: KnowledgeResult;

    switch (args.action) {
      case "share_pattern":
        result = sharePattern(args);
        break;
      case "generate_docs":
        result = await generateDocs(args);
        break;
      case "generate_api_docs":
        result = await generateApiDocs(args);
        break;
      case "share_example":
        result = shareExample(args);
        break;
      case "update_knowledge_base":
        result = updateKnowledgeBase(args);
        break;
      case "search_knowledge":
        result = searchKnowledge(args);
        break;
      case "export_knowledge":
        result = exportKnowledge(args);
        break;
      default:
        result = {
          action: args.action,
          success: false,
          message: `Unknown action: ${args.action}`,
        };
    }

    const report = generateKnowledgeXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Knowledge Sharing Complete">${result.message}</dyad-status>`,
    );

    return report;
  },
};
