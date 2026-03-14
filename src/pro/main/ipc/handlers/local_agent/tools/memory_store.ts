import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

const memoryStoreSchema = z.object({
  action: z
    .enum(["store", "recall", "list", "delete"])
    .describe(
      "Action to perform: store a memory, recall it, list all memories, or delete a memory",
    ),
  key: z.string().describe("Unique key/identifier for the memory"),
  value: z
    .string()
    .optional()
    .describe("Value to store (required for store action)"),
  query: z.string().optional().describe("Search query for recall action"),
});

interface MemoryEntry {
  key: string;
  value: string;
  timestamp: string;
  tags?: string[];
}

function getMemoryFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "memory.json");
}

function loadMemory(ctx: AgentContext): MemoryEntry[] {
  const filePath = getMemoryFilePath(ctx);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveMemory(ctx: AgentContext, memories: MemoryEntry[]): void {
  const filePath = getMemoryFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(memories, null, 2), "utf-8");
}

export const memoryStoreTool: ToolDefinition<
  z.infer<typeof memoryStoreSchema>
> = {
  name: "memory_store",
  description: `Persistent memory storage for the agent. Store important context, decisions, and information that should persist across sessions. Useful for maintaining project context, remembering user preferences, and recalling previous decisions.`,
  inputSchema: memoryStoreSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    switch (args.action) {
      case "store":
        return `Store memory: "${args.key}"`;
      case "recall":
        return `Recall memory: "${args.key}"`;
      case "list":
        return `List all stored memories`;
      case "delete":
        return `Delete memory: "${args.key}"`;
      default:
        return `Memory operation: ${args.action}`;
    }
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-memory action="${escapeXmlAttr(args.action)}">`;
    if (args.key) {
      xml += escapeXmlContent(args.key);
    }
    if (isComplete) {
      xml += "</dyad-memory>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { action, key, value, query } = args;

    switch (action) {
      case "store": {
        if (!key || value === undefined) {
          throw new Error("key and value are required for store action");
        }

        const memories = loadMemory(ctx);
        const existingIndex = memories.findIndex((m) => m.key === key);

        const entry: MemoryEntry = {
          key,
          value,
          timestamp: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          memories[existingIndex] = entry;
          ctx.onXmlStream(
            `<dyad-status title="Memory Store">Updated memory: ${escapeXmlAttr(key)}</dyad-status>`,
          );
        } else {
          memories.push(entry);
          ctx.onXmlStream(
            `<dyad-status title="Memory Store">Stored memory: ${escapeXmlAttr(key)}</dyad-status>`,
          );
        }

        saveMemory(ctx, memories);

        const resultMsg = `Successfully stored memory "${key}": ${value}`;
        ctx.onXmlComplete(
          `<dyad-status title="Memory Stored">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      case "recall": {
        if (!key && !query) {
          throw new Error("key or query is required for recall action");
        }

        const memories = loadMemory(ctx);
        let results: MemoryEntry[] = [];

        if (key) {
          // Exact match
          results = memories.filter((m) => m.key === key);
          if (results.length === 0) {
            // Partial match
            results = memories.filter((m) =>
              m.key.toLowerCase().includes(key.toLowerCase()),
            );
          }
        } else if (query) {
          // Search in key and value
          results = memories.filter(
            (m) =>
              m.key.toLowerCase().includes(query.toLowerCase()) ||
              m.value.toLowerCase().includes(query.toLowerCase()),
          );
        }

        ctx.onXmlStream(
          `<dyad-status title="Memory Recall">Found ${results.length} matching memories</dyad-status>`,
        );

        if (results.length === 0) {
          const msg = key
            ? `No memories found matching key: ${key}`
            : `No memories found matching query: ${query}`;
          ctx.onXmlComplete(
            `<dyad-status title="Memory Recall">${escapeXmlContent(msg)}</dyad-status>`,
          );
          return msg;
        }

        const formattedResults = results
          .map((m) => `- ${m.key} (${m.timestamp}): ${m.value}`)
          .join("\n");

        const resultMsg = `Found ${results.length} memory(ies):\n${formattedResults}`;
        ctx.onXmlComplete(
          `<dyad-status title="Memory Recall">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      case "list": {
        const memories = loadMemory(ctx);

        if (memories.length === 0) {
          const msg = "No memories stored yet.";
          ctx.onXmlComplete(
            `<dyad-status title="Memory List">${escapeXmlContent(msg)}</dyad-status>`,
          );
          return msg;
        }

        const formatted = memories
          .map(
            (m) =>
              `- ${m.key} (${m.timestamp}): ${m.value.substring(0, 100)}${m.value.length > 100 ? "..." : ""}`,
          )
          .join("\n");

        const resultMsg = `Stored memories (${memories.length}):\n${formatted}`;
        ctx.onXmlComplete(
          `<dyad-status title="Memory List">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      case "delete": {
        if (!key) {
          throw new Error("key is required for delete action");
        }

        const memories = loadMemory(ctx);
        const initialLength = memories.length;
        const filtered = memories.filter((m) => m.key !== key);

        if (filtered.length === initialLength) {
          const msg = `No memory found with key: ${key}`;
          ctx.onXmlComplete(
            `<dyad-status title="Memory Delete">${escapeXmlContent(msg)}</dyad-status>`,
          );
          return msg;
        }

        saveMemory(ctx, filtered);

        const resultMsg = `Successfully deleted memory "${key}"`;
        ctx.onXmlComplete(
          `<dyad-status title="Memory Deleted">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
};
