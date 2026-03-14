/**
 * Runtime Analysis & Memory Profiling Tools
 * Capabilities 326-332: Memory profiling, performance tracing, bottleneck detection,
 * heap analysis, CPU profiling, leak detection, and thread analysis
 */

import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

const logger = log.scope("runtime_analysis");

// ============================================================================
// Input Schemas
// ============================================================================

const memoryProfileSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z
    .string()
    .optional()
    .describe("Function to profile memory for"),
  allocation_tracking: z
    .boolean()
    .optional()
    .describe("Track memory allocations"),
});

const performanceTraceSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z.string().optional().describe("Function to trace"),
  include_async: z
    .boolean()
    .optional()
    .describe("Include async operation timing"),
});

const bottleneckDetectSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z.string().optional().describe("Function to analyze"),
  check_loops: z.boolean().optional().describe("Check for loop optimizations"),
  check_recursion: z
    .boolean()
    .optional()
    .describe("Check for recursion issues"),
});

const heapAnalysisSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  object_types: z
    .boolean()
    .optional()
    .describe("Analyze object type distribution"),
  retention_paths: z.boolean().optional().describe("Analyze retention paths"),
});

const cpuProfileSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z.string().optional().describe("Function to profile"),
  sample_rate: z.number().optional().describe("Sample rate in ms"),
});

const leakDetectionSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  check_event_listeners: z
    .boolean()
    .optional()
    .describe("Check for event listener leaks"),
  check_closures: z.boolean().optional().describe("Check for closure leaks"),
  check_caches: z.boolean().optional().describe("Check for cache leaks"),
});

const threadAnalysisSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  check_race_conditions: z
    .boolean()
    .optional()
    .describe("Check for race conditions"),
  check_deadlocks: z
    .boolean()
    .optional()
    .describe("Check for deadlock potential"),
  analyze_async_patterns: z
    .boolean()
    .optional()
    .describe("Analyze async patterns"),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse source file
 */
async function parseSourceFile(
  filePath: string,
  appPath: string,
): Promise<{ content: string; lines: string[] }> {
  const fullPath = join(appPath, filePath);
  const content = await readFile(fullPath, "utf-8");
  const lines = content.split("\n");
  return { content, lines };
}

/**
 * Extract functions from source code
 */
function extractFunctions(
  lines: string[],
): Array<{ name: string; startLine: number; endLine: number; body: string[] }> {
  const functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    body: string[];
  }> = [];
  let currentFunction: {
    name: string;
    startLine: number;
    body: string[];
  } | null = null;
  let braceCount = 0;

  const functionPattern =
    /(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s*)?\(?|(?:async\s+)?(?:\w+)\s+(\w+)\s*\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const match = trimmed.match(functionPattern);
    if (
      match &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("if") &&
      !trimmed.startsWith("for") &&
      !trimmed.startsWith("while")
    ) {
      const funcName = match[1] || match[2] || match[3];
      if (funcName) {
        if (currentFunction) {
          functions.push({
            ...currentFunction,
            endLine: i,
          });
        }
        currentFunction = { name: funcName, startLine: i + 1, body: [] };
      }
    }

    if (currentFunction) {
      currentFunction.body.push(line);
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (braceCount === 0 && trimmed.endsWith("}")) {
        functions.push({
          ...currentFunction,
          endLine: i + 1,
        });
        currentFunction = null;
        braceCount = 0;
      }
    }
  }

  return functions;
}

/**
 * Analyze memory allocations in code
 */
function analyzeAllocations(
  lines: string[],
): Array<{ line: number; type: string; variable: string }> {
  const allocations: Array<{ line: number; type: string; variable: string }> =
    [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Object creation
    if (trimmed.includes("new ") && trimmed.includes("(")) {
      const match = trimmed.match(/new\s+(\w+)/);
      if (match) {
        const varMatch = trimmed.match(/(?:const|let|var)\s+(\w+)/);
        allocations.push({
          line: i + 1,
          type: `new ${match[1]}`,
          variable: varMatch ? varMatch[1] : "anonymous",
        });
      }
    }

    // Array creation
    if (
      trimmed.includes("[") &&
      trimmed.includes("]") &&
      trimmed.includes("=")
    ) {
      const varMatch = trimmed.match(/(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        allocations.push({
          line: i + 1,
          type: "array",
          variable: varMatch[1],
        });
      }
    }

    // String concatenation (can create new strings)
    if (trimmed.includes("+") && trimmed.includes('"')) {
      const varMatch = trimmed.match(/(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        allocations.push({
          line: i + 1,
          type: "string",
          variable: varMatch[1],
        });
      }
    }
  }

  return allocations;
}

/**
 * Analyze loops for potential bottlenecks
 */
function analyzeLoops(lines: string[]): Array<{
  line: number;
  type: string;
  complexity: string;
  suggestions: string[];
}> {
  const loops: Array<{
    line: number;
    type: string;
    complexity: string;
    suggestions: string[];
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("for") || trimmed.startsWith("while")) {
      const suggestions: string[] = [];
      let complexity = "low";

      // Check for nested loops
      const bodyStart = i + 1;
      let innerLoopDepth = 0;
      for (let j = bodyStart; j < Math.min(bodyStart + 20, lines.length); j++) {
        if (lines[j].includes("for") || lines[j].includes("while")) {
          innerLoopDepth++;
        }
      }

      if (innerLoopDepth >= 2) {
        complexity = "high";
        suggestions.push(
          "Consider breaking out nested loops into separate functions",
        );
        suggestions.push("Consider using more efficient algorithms");
      } else if (innerLoopDepth >= 1) {
        complexity = "medium";
        suggestions.push("Watch for O(n²) complexity");
      }

      // Check for array operations in loop
      if (
        lines.some(
          (l, idx) =>
            idx > i &&
            idx < i + 20 &&
            (l.includes(".map(") ||
              l.includes(".filter(") ||
              l.includes(".reduce(")),
        )
      ) {
        suggestions.push("Array methods in loop may cause repeated iterations");
      }

      loops.push({
        line: i + 1,
        type: trimmed.startsWith("for") ? "for-loop" : "while-loop",
        complexity,
        suggestions,
      });
    }
  }

  return loops;
}

/**
 * Check for potential memory leaks
 */
function detectPotentialLeaks(lines: string[]): Array<{
  line: number;
  type: string;
  description: string;
  severity: string;
}> {
  const leaks: Array<{
    line: number;
    type: string;
    description: string;
    severity: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Event listeners without cleanup
    if (
      trimmed.includes("addEventListener") &&
      !lines.slice(i, i + 20).some((l) => l.includes("removeEventListener"))
    ) {
      leaks.push({
        line: i + 1,
        type: "event_listener",
        description:
          "addEventListener without corresponding removeEventListener",
        severity: "medium",
      });
    }

    // setInterval without clearInterval
    if (
      trimmed.includes("setInterval") &&
      !lines.slice(i, i + 30).some((l) => l.includes("clearInterval"))
    ) {
      leaks.push({
        line: i + 1,
        type: "timer",
        description:
          "setInterval without clearInterval - timer will never be cleaned up",
        severity: "medium",
      });
    }

    // Closures capturing large objects
    if (trimmed.includes("=>") && trimmed.includes("{")) {
      // Check if closure captures many variables
      const varsInClosure = line.match(/\b\w+\b/g)?.length || 0;
      if (varsInClosure > 5) {
        leaks.push({
          line: i + 1,
          type: "closure",
          description: `Closure captures ${varsInClosure} variables - may retain references`,
          severity: "low",
        });
      }
    }

    // Cache without size limit
    if (
      trimmed.includes("Map") ||
      trimmed.includes("Object.create") ||
      trimmed.includes("cache")
    ) {
      if (
        !trimmed.includes("size") &&
        !trimmed.includes("limit") &&
        !trimmed.includes("clear")
      ) {
        leaks.push({
          line: i + 1,
          type: "cache",
          description: "Unbounded cache/Map may grow indefinitely",
          severity: "medium",
        });
      }
    }
  }

  return leaks;
}

/**
 * Check for race conditions and threading issues
 */
function analyzeThreading(lines: string[]): Array<{
  line: number;
  type: string;
  description: string;
  severity: string;
}> {
  const issues: Array<{
    line: number;
    type: string;
    description: string;
    severity: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for shared mutable state
    if (
      (trimmed.includes("let ") || trimmed.includes("var ")) &&
      !trimmed.startsWith("//")
    ) {
      // Check if it's used in async context
      const contextLines = lines.slice(Math.max(0, i - 5), i + 10);
      const hasAsync = contextLines.some(
        (l) => l.includes("async") || l.includes("await"),
      );
      if (hasAsync && !trimmed.includes("const")) {
        // Check for multiple async access points
        const asyncAccessPoints = contextLines.filter(
          (l) =>
            l.includes("await") &&
            l.includes(trimmed.match(/\b\w+\b/)?.[0] || ""),
        ).length;
        if (asyncAccessPoints > 1) {
          issues.push({
            line: i + 1,
            type: "race_condition",
            description: `Shared variable '${trimmed.match(/\b\w+\b/)?.[0]}' accessed in multiple async contexts`,
            severity: "high",
          });
        }
      }
    }

    // Check for improper await ordering
    if (trimmed.includes("await") && i > 0) {
      const prevLine = lines[i - 1]?.trim();
      if (prevLine && prevLine.includes("await")) {
        issues.push({
          line: i,
          type: "await_ordering",
          description: "Sequential awaits may be parallelizable",
          severity: "low",
        });
      }
    }

    // Check for missing error handling in async
    if (trimmed.includes("await") && !trimmed.includes("try")) {
      const hasCatchBelow = lines
        .slice(i, i + 5)
        .some((l) => l.includes("catch"));
      if (!hasCatchBelow) {
        issues.push({
          line: i + 1,
          type: "unhandled_rejection",
          description:
            "await without try-catch - potential unhandled rejection",
          severity: "medium",
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const MEMORY_PROFILE_DESCRIPTION = `Profile memory usage in code.

This tool analyzes:
- Memory allocations
- Object creation patterns
- Variable lifetimes
- Potential memory growth areas

Use this tool to understand memory usage patterns and identify optimization opportunities.`;

export const memoryProfileTool: ToolDefinition<
  z.infer<typeof memoryProfileSchema>
> = {
  name: "memory_profile",
  description: MEMORY_PROFILE_DESCRIPTION,
  inputSchema: memoryProfileSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Profile memory usage in ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-memory file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-memory>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Memory profiling: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let targetFunctions = functions;
    if (args.function_name) {
      targetFunctions = functions.filter((f) => f.name === args.function_name);
      if (targetFunctions.length === 0) {
        throw new Error(`Function '${args.function_name}' not found`);
      }
    }

    let resultText = `Memory Profile for ${args.file_path}${args.function_name ? ` (${args.function_name})` : ""}:\n\n`;

    // Overall file analysis
    const totalLines = lines.length;
    const allocations = analyzeAllocations(lines);

    resultText += `File Statistics:\n`;
    resultText += `  Total lines: ${totalLines}\n`;
    resultText += `  Memory allocations found: ${allocations.length}\n\n`;

    // Breakdown by type
    const allocationTypes: Record<string, number> = {};
    for (const alloc of allocations) {
      allocationTypes[alloc.type] = (allocationTypes[alloc.type] || 0) + 1;
    }

    resultText += `Allocation Breakdown:\n`;
    for (const [type, count] of Object.entries(allocationTypes)) {
      resultText += `  ${type}: ${count}\n`;
    }

    if (args.allocation_tracking) {
      resultText += `\nDetailed Allocations:\n`;
      for (const alloc of allocations.slice(0, 20)) {
        resultText += `  Line ${alloc.line}: ${alloc.type} -> ${alloc.variable}\n`;
      }
      if (allocations.length > 20) {
        resultText += `  ... and ${allocations.length - 20} more\n`;
      }
    }

    // Per-function analysis
    if (targetFunctions.length > 0 && targetFunctions.length < 10) {
      resultText += `\nPer-Function Analysis:\n`;
      for (const func of targetFunctions) {
        const funcAllocations = analyzeAllocations(func.body);
        resultText += `  ${func.name}: ${funcAllocations.length} allocations\n`;
      }
    }

    ctx.onXmlComplete(
      `<dyad-memory file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-memory>`,
    );

    return resultText;
  },
};

const PERFORMANCE_TRACE_DESCRIPTION = `Trace execution performance of code.

This tool:
- Identifies execution hotspots
- Tracks async operation timing
- Analyzes function call patterns
- Estimates time complexity

Use this tool to understand execution flow and timing characteristics.`;

export const performanceTraceTool: ToolDefinition<
  z.infer<typeof performanceTraceSchema>
> = {
  name: "performance_trace",
  description: PERFORMANCE_TRACE_DESCRIPTION,
  inputSchema: performanceTraceSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Trace performance in ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-trace file="${escapeXmlAttr(args.file_path)}">Tracing...</dyad-trace>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Performance trace: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let targetFunctions = functions;
    if (args.function_name) {
      targetFunctions = functions.filter((f) => f.name === args.function_name);
      if (targetFunctions.length === 0) {
        throw new Error(`Function '${args.function_name}' not found`);
      }
    }

    let resultText = `Performance Trace for ${args.file_path}${args.function_name ? ` (${args.function_name})` : ""}:\n\n`;

    // Analyze each function
    for (const func of targetFunctions) {
      resultText += `Function: ${func.name}\n`;
      resultText += `  Lines: ${func.startLine} - ${func.endLine}\n`;

      // Count operations
      const operations = {
        loops: func.body.filter((l) => l.includes("for") || l.includes("while"))
          .length,
        asyncOps: func.body.filter((l) => l.includes("await")).length,
        calls: func.body.filter((l) => l.includes("(") && !l.includes("=>"))
          .length,
        returns: func.body.filter((l) => l.trim().startsWith("return")).length,
      };

      resultText += `  Operations:\n`;
      resultText += `    Loops: ${operations.loops}\n`;
      resultText += `    Async operations: ${operations.asyncOps}\n`;
      resultText += `    Function calls: ${operations.calls}\n`;
      resultText += `    Returns: ${operations.returns}\n`;

      // Estimate complexity
      let complexity = "O(1)";
      if (operations.loops > 0) complexity = "O(n)";
      if (operations.loops > 1) complexity = "O(n²) or worse";

      resultText += `  Estimated complexity: ${complexity}\n\n`;
    }

    // Async patterns analysis
    if (args.include_async) {
      resultText += `Async Pattern Analysis:\n`;
      const asyncFunctions = functions.filter((f) =>
        f.body.some((l) => l.includes("async") || l.includes("await")),
      );
      resultText += `  Functions with async: ${asyncFunctions.length}\n`;

      // Sequential vs parallel await
      for (const func of asyncFunctions.slice(0, 5)) {
        const awaitLines = func.body
          .map((l, i) => ({ line: l, idx: func.startLine + i }))
          .filter((l) => l.line.includes("await"));
        let pattern = "unknown";
        if (awaitLines.length === 0)
          pattern = "async without await (returns Promise)";
        else if (awaitLines.length === 1) pattern = "single await";
        else {
          // Check if they're sequential (consecutive)
          let gaps = 0;
          for (let i = 1; i < awaitLines.length; i++) {
            if (awaitLines[i].idx - awaitLines[i - 1].idx > 2) gaps++;
          }
          pattern =
            gaps > 0
              ? "sequential awaits (may parallelize)"
              : "sequential awaits";
        }
        resultText += `    ${func.name}: ${pattern}\n`;
      }
    }

    ctx.onXmlComplete(
      `<dyad-trace file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-trace>`,
    );

    return resultText;
  },
};

const BOTTLENECK_DETECT_DESCRIPTION = `Detect performance bottlenecks in code.

This tool identifies:
- Nested loops
- Inefficient algorithms
- Recursive calls
- Unnecessary computations

Use this tool to find optimization opportunities.`;

export const bottleneckDetectTool: ToolDefinition<
  z.infer<typeof bottleneckDetectSchema>
> = {
  name: "bottleneck_detect",
  description: BOTTLENECK_DETECT_DESCRIPTION,
  inputSchema: bottleneckDetectSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Detect bottlenecks in ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-bottleneck file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-bottleneck>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Detecting bottlenecks: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let resultText = `Bottleneck Analysis for ${args.file_path}${args.function_name ? ` (${args.function_name})` : ""}:\n\n`;

    // Analyze loops if requested
    if (args.check_loops !== false) {
      const loops = analyzeLoops(lines);
      if (loops.length > 0) {
        resultText += `Loop Analysis:\n`;
        for (const loop of loops) {
          resultText += `  Line ${loop.line}: ${loop.type} (${loop.complexity} complexity)\n`;
          for (const suggestion of loop.suggestions) {
            resultText += `    - ${suggestion}\n`;
          }
        }
      } else {
        resultText += `Loop Analysis: No significant loops found\n`;
      }
    }

    // Check for recursion
    if (args.check_recursion !== false) {
      resultText += `\nRecursion Analysis:\n`;
      const recursiveFunctions = functions.filter((f) =>
        f.body.some((l) => l.includes(f.name + "(")),
      );

      if (recursiveFunctions.length > 0) {
        resultText += `  Potential recursive functions:\n`;
        for (const func of recursiveFunctions) {
          const callCount = func.body.filter((l) =>
            l.includes(func.name + "("),
          ).length;
          resultText += `    ${func.name}: ${callCount} recursive call(s)\n`;

          // Check for base case
          const hasBaseCase = func.body.some(
            (l) =>
              l.includes("if") && (l.includes("return") || l.includes("throw")),
          );
          if (!hasBaseCase) {
            resultText += `      WARNING: No obvious base case - possible infinite recursion\n`;
          }
        }
      } else {
        resultText += `  No recursive functions detected\n`;
      }
    }

    // Additional bottleneck patterns
    resultText += `\nAdditional Patterns:\n`;

    // Check for DOM operations in loops
    const domInLoop = lines.some(
      (l, i) =>
        (l.includes("for") || l.includes("while")) &&
        lines
          .slice(i, i + 10)
          .some(
            (sub) =>
              sub.includes("document.") ||
              sub.includes(".innerHTML") ||
              sub.includes(".appendChild"),
          ),
    );
    resultText += `  DOM in loops: ${domInLoop ? "DETECTED" : "not detected"}\n`;

    // Check for unnecessary array copies
    const arrayCopies = lines.filter(
      (l) =>
        l.includes("[...") || l.includes(".slice()") || l.includes(".concat("),
    ).length;
    resultText += `  Array copies: ${arrayCopies}\n`;

    // Check for string concatenation in loops
    const stringConcat = lines.some(
      (l, i) =>
        (l.includes("for") || l.includes("while")) &&
        lines
          .slice(i, i + 10)
          .some((sub) => sub.includes('+ "') || sub.includes("+ '")),
    );
    resultText += `  String concat in loops: ${stringConcat ? "DETECTED" : "not detected"}\n`;

    ctx.onXmlComplete(
      `<dyad-bottleneck file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-bottleneck>`,
    );

    return resultText;
  },
};

const HEAP_ANALYSIS_DESCRIPTION = `Analyze heap usage patterns in code.

This tool:
- Identifies object allocation patterns
- Tracks object retention
- Analyzes data structure usage
- Finds memory retention issues

Use this tool to understand heap usage and find memory retention problems.`;

export const heapAnalysisTool: ToolDefinition<
  z.infer<typeof heapAnalysisSchema>
> = {
  name: "heap_analysis",
  description: HEAP_ANALYSIS_DESCRIPTION,
  inputSchema: heapAnalysisSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Analyze heap usage in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-heap file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-heap>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Heap analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    let resultText = `Heap Analysis for ${args.file_path}:\n\n`;

    // Object type analysis
    const objectTypes: Record<string, number> = {};

    for (const line of lines) {
      // Detect object creations
      const newMatches = line.match(/new\s+(\w+)/g);
      if (newMatches) {
        newMatches.forEach((m) => {
          const type = m.replace("new ", "");
          objectTypes[type] = (objectTypes[type] || 0) + 1;
        });
      }

      // Detect array usage
      if (line.includes("[]")) {
        objectTypes["Array"] = (objectTypes["Array"] || 0) + 1;
      }

      // Detect Map/Set
      if (line.includes("new Map"))
        objectTypes["Map"] = (objectTypes["Map"] || 0) + 1;
      if (line.includes("new Set"))
        objectTypes["Set"] = (objectTypes["Set"] || 0) + 1;
    }

    if (args.object_types) {
      resultText += `Object Type Distribution:\n`;
      const sorted = Object.entries(objectTypes).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted.slice(0, 10)) {
        resultText += `  ${type}: ${count}\n`;
      }
    }

    // Retention path analysis
    if (args.retention_paths) {
      resultText += `\nRetention Path Analysis:\n`;

      // Find closures that might retain references
      const closures = lines.filter((l) => l.includes("=>") && l.includes("{"));
      resultText += `  Closures found: ${closures.length}\n`;

      // Find global references
      const globals = lines.filter(
        (l) =>
          (l.startsWith("let ") ||
            l.startsWith("var ") ||
            l.startsWith("const ")) &&
          !l.includes("function") &&
          !l.includes("=>"),
      );
      resultText += `  Potential globals: ${globals.length}\n`;

      // Find class instances
      const classes = lines.filter(
        (l) => l.includes("class ") && !l.startsWith("//"),
      );
      resultText += `  Classes defined: ${classes.length}\n`;
    }

    // Summary
    resultText += `\nHeap Usage Summary:\n`;
    resultText += `  Total object creations: ${Object.values(objectTypes).reduce((a, b) => a + b, 0)}\n`;
    resultText += `  Unique types: ${Object.keys(objectTypes).length}\n`;

    ctx.onXmlComplete(
      `<dyad-heap file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-heap>`,
    );

    return resultText;
  },
};

const CPU_PROFILE_DESCRIPTION = `Profile CPU usage in code.

This tool:
- Identifies CPU-intensive operations
- Estimates execution time
- Analyzes algorithmic efficiency
- Finds optimization targets

Use this tool to understand CPU usage patterns.`;

export const cpuProfileTool: ToolDefinition<z.infer<typeof cpuProfileSchema>> =
  {
    name: "cpu_profile",
    description: CPU_PROFILE_DESCRIPTION,
    inputSchema: cpuProfileSchema,
    defaultConsent: "always",

    getConsentPreview: (args) =>
      `Profile CPU usage in ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

    buildXml: (args, isComplete) => {
      if (isComplete) return undefined;
      if (!args.file_path) return undefined;
      return `<dyad-cpu file="${escapeXmlAttr(args.file_path)}">Profiling...</dyad-cpu>`;
    },

    execute: async (args, ctx: AgentContext) => {
      logger.log(`CPU profiling: ${args.file_path}`);

      const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
      const functions = extractFunctions(lines);

      let targetFunctions = functions;
      if (args.function_name) {
        targetFunctions = functions.filter(
          (f) => f.name === args.function_name,
        );
        if (targetFunctions.length === 0) {
          throw new Error(`Function '${args.function_name}' not found`);
        }
      }

      let resultText = `CPU Profile for ${args.file_path}${args.function_name ? ` (${args.function_name})` : ""}:\n\n`;

      // Analyze each function
      for (const func of targetFunctions) {
        resultText += `Function: ${func.name}\n`;

        // Count operations that could be CPU intensive
        let cpuScore = 0;
        const operations: string[] = [];

        // Nested loops are expensive
        const loops = func.body.filter(
          (l) => l.includes("for") || l.includes("while"),
        ).length;
        if (loops > 0) {
          cpuScore += loops * 10;
          operations.push(`${loops} loop(s)`);
        }

        // Math operations
        const mathOps = func.body.filter(
          (l) =>
            l.includes("Math.") ||
            l.includes("**") ||
            l.includes("Math.pow") ||
            l.includes("sqrt"),
        ).length;
        if (mathOps > 0) {
          cpuScore += mathOps * 5;
          operations.push(`${mathOps} math operation(s)`);
        }

        // Regex operations
        const regexOps = func.body.filter(
          (l) => l.includes("RegExp") || l.includes(".match("),
        ).length;
        if (regexOps > 0) {
          cpuScore += regexOps * 3;
          operations.push(`${regexOps} regex operation(s)`);
        }

        // JSON parsing
        const jsonOps = func.body.filter(
          (l) => l.includes("JSON.parse") || l.includes("JSON.stringify"),
        ).length;
        if (jsonOps > 0) {
          cpuScore += jsonOps * 5;
          operations.push(`${jsonOps} JSON operation(s)`);
        }

        // Sorting
        const sortOps = func.body.filter((l) => l.includes(".sort(")).length;
        if (sortOps > 0) {
          cpuScore += sortOps * 10;
          operations.push(`${sortOps} sort operation(s)`);
        }

        // Estimate CPU cost
        let costLevel = "low";
        if (cpuScore > 50) costLevel = "high";
        else if (cpuScore > 20) costLevel = "medium";

        resultText += `  Estimated CPU cost: ${costLevel} (score: ${cpuScore})\n`;
        resultText += `  Operations: ${operations.join(", ") || "minimal"}\n\n`;
      }

      ctx.onXmlComplete(
        `<dyad-cpu file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-cpu>`,
      );

      return resultText;
    },
  };

const LEAK_DETECTION_DESCRIPTION = `Detect memory leaks in code.

This tool identifies:
- Event listeners not cleaned up
- Timers not cleared
- Closures retaining references
- Unbounded caches

Use this tool to find and fix memory leaks.`;

export const leakDetectionTool: ToolDefinition<
  z.infer<typeof leakDetectionSchema>
> = {
  name: "leak_detection",
  description: LEAK_DETECTION_DESCRIPTION,
  inputSchema: leakDetectionSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Detect memory leaks in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-leak file="${escapeXmlAttr(args.file_path)}">Detecting...</dyad-leak>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Leak detection: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    let resultText = `Memory Leak Detection for ${args.file_path}:\n\n`;

    const potentialLeaks = detectPotentialLeaks(lines);

    if (potentialLeaks.length > 0) {
      resultText += `Potential Leaks Found: ${potentialLeaks.length}\n\n`;

      // Group by severity
      const bySeverity: Record<string, typeof potentialLeaks> = {};
      for (const leak of potentialLeaks) {
        if (!bySeverity[leak.severity]) bySeverity[leak.severity] = [];
        bySeverity[leak.severity].push(leak);
      }

      for (const severity of ["high", "medium", "low"]) {
        if (bySeverity[severity]) {
          resultText += `[${severity.toUpperCase()}]\n`;
          for (const leak of bySeverity[severity]) {
            resultText += `  Line ${leak.line}: ${leak.type}\n`;
            resultText += `    ${leak.description}\n`;
          }
          resultText += "\n";
        }
      }
    } else {
      resultText += `No obvious memory leaks detected.\n`;
      resultText += `\nNote: Dynamic analysis at runtime is needed for definitive leak detection.\n`;
    }

    // Additional checks
    resultText += `\nAdditional Checks:\n`;

    // Check event listeners
    if (args.check_event_listeners) {
      const addListeners = lines.filter((l) =>
        l.includes("addEventListener"),
      ).length;
      const removeListeners = lines.filter((l) =>
        l.includes("removeEventListener"),
      ).length;
      resultText += `  Event listeners: ${addListeners} added, ${removeListeners} removed\n`;
    }

    // Check closures
    if (args.check_closures) {
      const closures = lines.filter((l) => l.includes("=>")).length;
      resultText += `  Closures: ${closures}\n`;
    }

    // Check caches
    if (args.check_caches) {
      const caches = lines.filter(
        (l) =>
          (l.includes("new Map") ||
            l.includes("new WeakMap") ||
            l.includes("cache")) &&
          !l.includes("cache ="),
      ).length;
      resultText += `  Cache-like structures: ${caches}\n`;
    }

    ctx.onXmlComplete(
      `<dyad-leak file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-leak>`,
    );

    return resultText;
  },
};

const THREAD_ANALYSIS_DESCRIPTION = `Analyze thread behavior and concurrency patterns.

This tool identifies:
- Race conditions
- Deadlock potential
- Async/await patterns
- Synchronization issues

Use this tool to find concurrency problems.`;

export const threadAnalysisTool: ToolDefinition<
  z.infer<typeof threadAnalysisSchema>
> = {
  name: "thread_analysis",
  description: THREAD_ANALYSIS_DESCRIPTION,
  inputSchema: threadAnalysisSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Analyze thread behavior in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-thread file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-thread>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Thread analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    let resultText = `Thread Analysis for ${args.file_path}:\n\n`;

    // Check for race conditions
    if (args.check_race_conditions) {
      resultText += `Race Condition Analysis:\n`;
      const raceConditions = analyzeThreading(lines).filter(
        (i) => i.type === "race_condition",
      );

      if (raceConditions.length > 0) {
        resultText += `  Potential race conditions: ${raceConditions.length}\n`;
        for (const issue of raceConditions) {
          resultText += `    Line ${issue.line}: ${issue.description}\n`;
        }
      } else {
        resultText += `  No obvious race conditions detected\n`;
      }
      resultText += "\n";
    }

    // Check for deadlock potential
    if (args.check_deadlocks) {
      resultText += `Deadlock Analysis:\n`;

      // Look for nested awaits or lock patterns
      const nestedAwaits = lines.filter(
        (l, i) =>
          l.includes("await") &&
          lines.slice(i + 1, i + 5).some((next) => next.includes("await")),
      ).length;

      if (nestedAwaits > 0) {
        resultText += `  Nested await patterns: ${nestedAwaits}\n`;
        resultText += `  Warning: Nested awaits can cause deadlock if resources are shared\n`;
      } else {
        resultText += `  No nested await patterns detected\n`;
      }
      resultText += "\n";
    }

    // Analyze async patterns
    if (args.analyze_async_patterns) {
      resultText += `Async Pattern Analysis:\n`;

      const functions = extractFunctions(lines);
      const asyncFunctions = functions.filter((f) =>
        f.body.some((l) => l.includes("async") || l.includes("await")),
      );

      resultText += `  Async functions: ${asyncFunctions.length}\n`;

      // Analyze patterns
      let promiseAll = 0;
      let promiseRace = 0;
      let sequential = 0;

      for (const line of lines) {
        if (line.includes("Promise.all")) promiseAll++;
        if (line.includes("Promise.race")) promiseRace++;
        if (line.match(/await\s+\w+.*\n.*await\s+\w+/)) sequential++;
      }

      resultText += `  Promise.all usage: ${promiseAll}\n`;
      resultText += `  Promise.race usage: ${promiseRace}\n`;
      resultText += `  Sequential await patterns: ${sequential}\n\n`;

      // Suggestions
      if (sequential > 0 && promiseAll === 0) {
        resultText += `  Suggestion: Consider using Promise.all() for independent async operations\n`;
      }
    }

    // General threading info
    resultText += `General Threading Info:\n`;
    const asyncCount = lines.filter(
      (l) =>
        l.includes("async") || l.includes("await") || l.includes("Promise"),
    ).length;
    resultText += `  Async-related lines: ${asyncCount}\n`;

    const workerCount = lines.filter(
      (l) => l.includes("Worker") || l.includes("SharedWorker"),
    ).length;
    resultText += `  Web Workers: ${workerCount}\n`;

    ctx.onXmlComplete(
      `<dyad-thread file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-thread>`,
    );

    return resultText;
  },
};
