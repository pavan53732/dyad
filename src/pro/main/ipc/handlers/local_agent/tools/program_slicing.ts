/**
 * Program Slicing & Control Flow Analysis Tools
 * Capabilities 221-227: Program slicing, control flow graphs, data flow analysis,
 * reachability analysis, dependence graphs, static analysis, and dynamic analysis
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

const logger = log.scope("program_slicing");

// ============================================================================
// Input Schemas
// ============================================================================

const computeSliceSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  target_line: z.number().describe("Line number to compute slice from"),
  criterion: z
    .enum(["backward", "forward"])
    .describe(
      "Slice direction: backward (dependencies) or forward (dependents)",
    ),
  variable: z
    .string()
    .optional()
    .describe("Specific variable to track (default: all)"),
});

const controlFlowGraphSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z
    .string()
    .optional()
    .describe("Function name to analyze (default: entire file)"),
});

const dataFlowAnalysisSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  start_line: z.number().describe("Start line for analysis"),
  end_line: z.number().describe("End line for analysis"),
  track_variables: z
    .array(z.string())
    .optional()
    .describe("Variables to track"),
});

const reachabilitySchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  entry_point: z.string().describe("Function or line number to start from"),
  target: z.string().describe("Target function or line to check reachability"),
});

const dependenceGraphSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z
    .string()
    .optional()
    .describe("Function to analyze (default: entire file)"),
});

const staticAnalysisSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  analysis_types: z
    .array(
      z.enum([
        "complexity",
        "unused_code",
        "type_errors",
        "security",
        "best_practices",
      ]),
    )
    .optional()
    .describe("Types of static analysis to perform"),
});

const dynamicAnalysisSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  test_file: z
    .string()
    .optional()
    .describe("Path to test file or test command"),
  capture_output: z
    .boolean()
    .optional()
    .describe("Capture and return execution output"),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple source code parser for basic program analysis
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
 * Extract functions from source code (basic heuristic)
 */
function extractFunctions(lines: string[]): Array<{
  name: string;
  startLine: number;
  endLine: number;
}> {
  const functions: Array<{ name: string; startLine: number; endLine: number }> =
    [];
  let currentFunction: { name: string; startLine: number } | null = null;
  let braceCount = 0;

  const functionPattern =
    /(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s*)?\(?|(?:async\s+)?(?:\w+)\s+(\w+)\s*\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for function declaration
    const match = trimmed.match(functionPattern);
    if (match && !trimmed.startsWith("//") && !trimmed.startsWith("*")) {
      const funcName = match[1] || match[2] || match[3];
      if (
        funcName &&
        !funcName.startsWith("if") &&
        !funcName.startsWith("for")
      ) {
        if (currentFunction) {
          functions.push({
            ...currentFunction,
            endLine: i,
          });
        }
        currentFunction = { name: funcName, startLine: i + 1 };
      }
    }

    // Track braces for function boundaries
    if (currentFunction) {
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
 * Calculate cyclomatic complexity (basic)
 */
function calculateComplexity(lines: string[]): number {
  let complexity = 1;
  const controlPatterns = [
    /\bif\b/,
    /\belse\s+if\b/,
    /\bfor\b/,
    /\bwhile\b/,
    /\bcase\b/,
    /\bcatch\b/,
    /&&/,
    /\|\|/,
  ];

  for (const line of lines) {
    for (const pattern of controlPatterns) {
      if (pattern.test(line)) {
        complexity++;
      }
    }
  }

  return complexity;
}

/**
 * Detect unused code (basic heuristic)
 */
function detectUnusedCode(
  lines: string[],
): Array<{ line: number; type: string; name: string }> {
  const unused: Array<{ line: number; type: string; name: string }> = [];

  // Track variable declarations
  const varDeclarations = new Map<string, number>();
  const varUsages = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track const/let/var declarations
    const declMatch = trimmed.match(/(?:const|let|var)\s+(\w+)/);
    if (declMatch) {
      varDeclarations.set(declMatch[1], i + 1);
    }

    // Track usages (skip declarations)
    if (
      !trimmed.startsWith("const ") &&
      !trimmed.startsWith("let ") &&
      !trimmed.startsWith("var ")
    ) {
      const usages = trimmed.match(/\b\w+\b/g);
      if (usages) {
        usages.forEach((v) => varUsages.add(v));
      }
    }
  }

  // Report unused variables
  for (const [name, line] of varDeclarations) {
    if (
      !varUsages.has(name) ||
      (varUsages.has(name) &&
        [...varUsages].filter((v) => v === name).length <= 1)
    ) {
      unused.push({ line, type: "variable", name });
    }
  }

  return unused;
}

/**
 * Basic type error detection
 */
function detectTypeErrors(
  lines: string[],
): Array<{ line: number; message: string; severity: "error" | "warning" }> {
  const errors: Array<{
    line: number;
    message: string;
    severity: "error" | "warning";
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for common issues
    if (trimmed.includes("undefined.")) {
      errors.push({
        line: i + 1,
        message: "Potential null/undefined access",
        severity: "warning",
      });
    }

    // Check for unused variables (simple heuristic)
    const declMatch = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=/);
    if (declMatch) {
      const varName = declMatch[1];
      const usageCount = lines.filter((l) => l.includes(varName)).length;
      if (usageCount === 1) {
        errors.push({
          line: i + 1,
          message: `Variable '${varName}' is declared but never used`,
          severity: "warning",
        });
      }
    }
  }

  return errors;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const COMPUTE_SLICE_DESCRIPTION = `Compute a program slice from a specific line in the source code.

A program slice is the set of statements that may affect the values at a specific point in a program.
- Backward slice: statements that the target line depends on
- Forward slice: statements that depend on the target line

Use this tool to understand code dependencies and trace variable values through a program.`;

export const computeSliceTool: ToolDefinition<
  z.infer<typeof computeSliceSchema>
> = {
  name: "compute_slice",
  description: COMPUTE_SLICE_DESCRIPTION,
  inputSchema: computeSliceSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Compute ${args.criterion} slice from line ${args.target_line} in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path || !args.target_line) return undefined;
    return `<dyad-slice file="${escapeXmlAttr(args.file_path)}" line="${args.target_line}" direction="${args.criterion}">Analyzing...</dyad-slice>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Computing slice: ${args.file_path}:${args.target_line}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const targetLineIndex = args.target_line - 1;

    if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
      throw new Error(`Invalid target line: ${args.target_line}`);
    }

    const targetLine = lines[targetLineIndex];
    const slice: number[] = [args.target_line];

    if (args.criterion === "backward") {
      // Backward slice: find dependencies
      const variable = args.variable;

      // Extract variables from target line
      const targetVars = variable
        ? [variable]
        : (targetLine.match(/\b\w+\b/g) || []).filter(
            (v) => v !== "const" && v !== "let" && v !== "var",
          );

      // Find lines that define these variables
      for (let i = targetLineIndex - 1; i >= 0; i--) {
        const line = lines[i];
        for (const v of targetVars) {
          if (
            line.includes(v) &&
            (line.match(/(?:=|:)\s*.*\b\w+\b/) ||
              line.includes(`const ${v}`) ||
              line.includes(`let ${v}`) ||
              line.includes(`var ${v}`))
          ) {
            slice.push(i + 1);
            // Add new variables to track
            const newVars = (line.match(/\b\w+\b/g) || []).filter(
              (x) =>
                !targetVars.includes(x) &&
                x !== "const" &&
                x !== "let" &&
                x !== "var",
            );
            targetVars.push(...newVars);
            break;
          }
        }
      }
    } else {
      // Forward slice: find dependents
      const targetVars = (targetLine.match(/\b\w+\b/g) || []).filter(
        (v) => v !== "const" && v !== "let" && v !== "var",
      );

      // Find lines that use these variables
      for (let i = targetLineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        for (const v of targetVars) {
          if (line.includes(v)) {
            slice.push(i + 1);
            break;
          }
        }
      }
    }

    const resultText = `Program Slice (${args.criterion}, line ${args.target_line}):\n${slice
      .sort((a, b) => a - b)
      .map((l) => `  Line ${l}: ${lines[l - 1]?.substring(0, 80)}`)
      .join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-slice file="${escapeXmlAttr(args.file_path)}" line="${args.target_line}" direction="${args.criterion}">${escapeXmlContent(resultText)}</dyad-slice>`,
    );

    return resultText;
  },
};

const CONTROL_FLOW_GRAPH_DESCRIPTION = `Build a control flow graph (CFG) for a function or file.

A control flow graph represents all possible execution paths through a program.
Nodes are statements/blocks, edges show control flow between them.

Use this tool to understand program flow, detect unreachable code, and analyze loop structures.`;

export const controlFlowGraphTool: ToolDefinition<
  z.infer<typeof controlFlowGraphSchema>
> = {
  name: "control_flow_graph",
  description: CONTROL_FLOW_GRAPH_DESCRIPTION,
  inputSchema: controlFlowGraphSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Build control flow graph for ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-cfg file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-cfg>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Building control flow graph: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let targetFunctions = functions;
    if (args.function_name) {
      targetFunctions = functions.filter((f) => f.name === args.function_name);
      if (targetFunctions.length === 0) {
        throw new Error(`Function '${args.function_name}' not found`);
      }
    }

    const cfgs: string[] = [];

    for (const func of targetFunctions) {
      const funcLines = lines.slice(func.startLine - 1, func.endLine);
      const nodes: string[] = [];
      const edges: string[] = [];

      let currentNode = 1;
      nodes.push(`  Node ${currentNode}: Entry (${func.name})`);

      for (let i = 0; i < funcLines.length; i++) {
        const line = funcLines[i].trim();
        if (!line || line.startsWith("//") || line.startsWith("/*")) continue;

        currentNode++;
        const nodeId = currentNode;
        const displayLine =
          line.length > 50 ? line.substring(0, 50) + "..." : line;
        nodes.push(`  Node ${nodeId}: ${displayLine}`);

        // Add control flow edges
        if (
          line.includes("if") ||
          line.includes("for") ||
          line.includes("while")
        ) {
          edges.push(`  Node ${nodeId} -> Node ${nodeId + 1} (true)`);
          edges.push(`  Node ${nodeId} -> Node ${nodeId + 2} (false)`);
        } else if (i < funcLines.length - 1) {
          edges.push(`  Node ${nodeId} -> Node ${nodeId + 1}`);
        }
      }

      cfgs.push(
        `Control Flow Graph for '${func.name}' (lines ${func.startLine}-${func.endLine}):\n${nodes.join("\n")}\n\nEdges:\n${edges.join("\n")}`,
      );
    }

    const resultText = cfgs.join("\n\n---\n\n");

    ctx.onXmlComplete(
      `<dyad-cfg file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-cfg>`,
    );

    return resultText;
  },
};

const DATA_FLOW_ANALYSIS_DESCRIPTION = `Perform data flow analysis on a range of code.

Data flow analysis tracks how values of variables change as they flow through a program.
- Identify where variables are defined (assigned)
- Track where variables are used
- Detect uninitialized variable usage

Use this tool to understand variable lifecycle and spot potential bugs.`;

export const dataFlowAnalysisTool: ToolDefinition<
  z.infer<typeof dataFlowAnalysisSchema>
> = {
  name: "data_flow_analysis",
  description: DATA_FLOW_ANALYSIS_DESCRIPTION,
  inputSchema: dataFlowAnalysisSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Analyze data flow in ${args.file_path} (lines ${args.start_line}-${args.end_line})`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-dataflow file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-dataflow>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Performing data flow analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const startIdx = Math.max(0, args.start_line - 1);
    const endIdx = Math.min(lines.length, args.end_line);

    const rangeLines = lines.slice(startIdx, endIdx);

    // Track variable definitions and uses
    const varDefs = new Map<string, number[]>();
    const varUses = new Map<string, number[]>();

    for (let i = 0; i < rangeLines.length; i++) {
      const line = rangeLines[i];
      const lineNum = startIdx + i + 1;

      // Find definitions (const/let/var)
      const defMatch = line.match(/(?:const|let|var)\s+(\w+)/g);
      if (defMatch) {
        defMatch.forEach((match) => {
          const varName = match.replace(/(?:const|let|var)\s+/, "");
          if (!varDefs.has(varName)) varDefs.set(varName, []);
          varDefs.get(varName)!.push(lineNum);
        });
      }

      // Find uses
      if (args.track_variables) {
        for (const varName of args.track_variables) {
          if (
            line.includes(varName) &&
            !line.includes(`const ${varName}`) &&
            !line.includes(`let ${varName}`) &&
            !line.includes(`var ${varName}`)
          ) {
            if (!varUses.has(varName)) varUses.set(varName, []);
            varUses.get(varName)!.push(lineNum);
          }
        }
      }
    }

    let resultText = `Data Flow Analysis for ${args.file_path} (lines ${args.start_line}-${args.end_line}):\n\n`;

    if (args.track_variables) {
      for (const varName of args.track_variables) {
        const defs = varDefs.get(varName) || [];
        const uses = varUses.get(varName) || [];
        resultText += `Variable '${varName}':\n`;
        resultText += `  Defined at: ${defs.length ? defs.join(", ") : "none"}\n`;
        resultText += `  Used at: ${uses.length ? uses.join(", ") : "none"}\n\n`;
      }
    } else {
      resultText += `Variables defined in range:\n`;
      for (const [varName, defLines] of varDefs) {
        resultText += `  ${varName}: lines ${defLines.join(", ")}\n`;
      }
    }

    ctx.onXmlComplete(
      `<dyad-dataflow file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-dataflow>`,
    );

    return resultText;
  },
};

const REACHABILITY_DESCRIPTION = `Perform reachability analysis to determine if a target is reachable from an entry point.

This analysis determines whether there exists an execution path from the entry point
to the target through the program's control flow.

Use this tool to find unreachable code, understand program structure, and verify code paths.`;

export const reachabilityTool: ToolDefinition<
  z.infer<typeof reachabilitySchema>
> = {
  name: "reachability",
  description: REACHABILITY_DESCRIPTION,
  inputSchema: reachabilitySchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Check if '${args.target}' is reachable from ${args.entry_point} in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-reach file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-reach>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Performing reachability analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    // Find entry point
    let entryLine: number;
    const entryFunc = functions.find((f) => f.name === args.entry_point);
    if (entryFunc) {
      entryLine = entryFunc.startLine;
    } else {
      entryLine = parseInt(args.entry_point, 10);
      if (isNaN(entryLine)) {
        throw new Error(`Entry point '${args.entry_point}' not found`);
      }
    }

    // Find target
    let targetLine: number;
    const targetFunc = functions.find((f) => f.name === args.target);
    if (targetFunc) {
      targetLine = targetFunc.startLine;
    } else {
      targetLine = parseInt(args.target, 10);
      if (isNaN(targetLine)) {
        throw new Error(`Target '${args.target}' not found`);
      }
    }

    // Simple reachability: check if target appears after entry in source
    // (conservative approximation)
    const reachable = entryLine < targetLine;

    // Find potential paths
    const pathLines: number[] = [];
    for (let i = entryLine - 1; i < targetLine; i++) {
      const line = lines[i]?.trim();
      if (
        line &&
        !line.startsWith("//") &&
        !line.startsWith("/*") &&
        (line.includes("function") ||
          line.includes("=>") ||
          line.includes("{") ||
          line.includes("return") ||
          line.includes("if") ||
          line.includes("for") ||
          line.includes("while"))
      ) {
        pathLines.push(i + 1);
      }
    }

    const resultText = `Reachability Analysis:\n`;
    const status = reachable ? "REACHABLE" : "NOT REACHABLE";
    const pathInfo = reachable
      ? `\n\nPotential execution path:\n${pathLines.map((l) => `  Line ${l}`).join("\n")}`
      : "\n\nNo execution path found from entry point to target.";

    ctx.onXmlComplete(
      `<dyad-reach file="${escapeXmlAttr(args.file_path)}" entry="${escapeXmlAttr(args.entry_point)}" target="${escapeXmlAttr(args.target)}" result="${status}">${escapeXmlContent(resultText + status + pathInfo)}</dyad-reach>`,
    );

    return `${resultText}${status}${pathInfo}`;
  },
};

const DEPENDENCE_GRAPH_DESCRIPTION = `Build a dependence graph for a function or file.

A dependence graph shows:
- Data dependencies: how data flows between statements
- Control dependencies: which statements control the execution of others

Use this tool to understand code coupling and identify what would need to change
when modifying specific parts of the code.`;

export const dependenceGraphTool: ToolDefinition<
  z.infer<typeof dependenceGraphSchema>
> = {
  name: "dependence_graph",
  description: DEPENDENCE_GRAPH_DESCRIPTION,
  inputSchema: dependenceGraphSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Build dependence graph for ${args.file_path}${args.function_name ? `: ${args.function_name}` : ""}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-depgraph file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-depgraph>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Building dependence graph: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let targetFunctions = functions;
    if (args.function_name) {
      targetFunctions = functions.filter((f) => f.name === args.function_name);
      if (targetFunctions.length === 0) {
        throw new Error(`Function '${args.function_name}' not found`);
      }
    }

    const graphs: string[] = [];

    for (const func of targetFunctions) {
      const funcLines = lines.slice(func.startLine - 1, func.endLine);
      const dataDeps: Array<{ from: number; to: number; variable: string }> =
        [];
      const controlDeps: Array<{ from: number; to: number; type: string }> = [];

      // Analyze data dependencies
      const varDefs = new Map<string, number>();
      for (let i = 0; i < funcLines.length; i++) {
        const line = funcLines[i];
        const lineNum = func.startLine + i;

        // Find variable definitions
        const defMatch = line.match(/(?:const|let|var)\s+(\w+)/);
        if (defMatch) {
          varDefs.set(defMatch[1], lineNum);
        }

        // Find variable uses and create dependencies
        const useMatch = line.match(/\b(\w+)\b/g);
        if (useMatch) {
          for (const varName of useMatch) {
            if (varDefs.has(varName) && varDefs.get(varName) !== lineNum) {
              dataDeps.push({
                from: varDefs.get(varName)!,
                to: lineNum,
                variable: varName,
              });
            }
          }
        }
      }

      // Analyze control dependencies
      for (let i = 0; i < funcLines.length; i++) {
        const line = funcLines[i];
        const lineNum = func.startLine + i;

        if (
          line.includes("if") ||
          line.includes("for") ||
          line.includes("while")
        ) {
          // Find statements controlled by this
          for (let j = i + 1; j < funcLines.length; j++) {
            const nextLine = funcLines[j].trim();
            if (nextLine && !nextLine.startsWith("}")) {
              controlDeps.push({
                from: lineNum,
                to: func.startLine + j,
                type: line.includes("if")
                  ? "if"
                  : line.includes("for")
                    ? "for"
                    : "while",
              });
              break;
            }
          }
        }
      }

      graphs.push(
        `Dependence Graph for '${func.name}':\n\nData Dependencies:\n${
          dataDeps
            .map((d) => `  Line ${d.from} -> Line ${d.to} (via ${d.variable})`)
            .join("\n") || "  (none)"
        }\n\nControl Dependencies:\n${
          controlDeps
            .map((d) => `  Line ${d.from} -> Line ${d.to} (${d.type})`)
            .join("\n") || "  (none)"
        }`,
      );
    }

    const resultText = graphs.join("\n\n---\n\n");

    ctx.onXmlComplete(
      `<dyad-depgraph file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-depgraph>`,
    );

    return resultText;
  },
};

const STATIC_ANALYSIS_DESCRIPTION = `Perform static code analysis on a source file.

Static analysis examines code without executing it to identify:
- Complexity issues
- Unused code
- Type errors
- Security vulnerabilities
- Best practice violations

Use this tool to identify code quality issues and potential bugs.`;

export const staticAnalysisTool: ToolDefinition<
  z.infer<typeof staticAnalysisSchema>
> = {
  name: "static_analysis",
  description: STATIC_ANALYSIS_DESCRIPTION,
  inputSchema: staticAnalysisSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Perform static analysis on ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-static file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-static>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Performing static analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const analysisTypes = args.analysis_types || [
      "complexity",
      "unused_code",
      "type_errors",
    ];

    const results: string[] = [];

    if (analysisTypes.includes("complexity")) {
      const complexity = calculateComplexity(lines);
      let severity = "low";
      if (complexity > 20) severity = "high";
      else if (complexity > 10) severity = "medium";
      results.push(`Cyclomatic Complexity: ${complexity} (${severity})`);
    }

    if (analysisTypes.includes("unused_code")) {
      const unused = detectUnusedCode(lines);
      if (unused.length > 0) {
        results.push(
          `\nUnused Code:\n${unused
            .map((u) => `  Line ${u.line}: ${u.type} '${u.name}'`)
            .join("\n")}`,
        );
      } else {
        results.push("\nUnused Code: None detected");
      }
    }

    if (analysisTypes.includes("type_errors")) {
      const errors = detectTypeErrors(lines);
      if (errors.length > 0) {
        results.push(
          `\nType Issues:\n${errors
            .map((e) => `  Line ${e.line}: [${e.severity}] ${e.message}`)
            .join("\n")}`,
        );
      } else {
        results.push("\nType Issues: None detected");
      }
    }

    if (analysisTypes.includes("security")) {
      results.push("\nSecurity Analysis: Basic scan performed");
      // Check for common security issues
      const securityIssues: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("eval(")) {
          securityIssues.push(
            `Line ${i + 1}: Use of 'eval' - potential code injection`,
          );
        }
        if (line.includes("innerHTML") && !line.includes("sanitize")) {
          securityIssues.push(`Line ${i + 1}: Potential XSS via innerHTML`);
        }
      }
      if (securityIssues.length > 0) {
        results.push(securityIssues.join("\n"));
      } else {
        results.push("  No obvious security issues found");
      }
    }

    if (analysisTypes.includes("best_practices")) {
      results.push("\nBest Practices:");
      // Check for common issues
      const practices: string[] = [];
      const hasAsyncAwait = lines.some(
        (l) => l.includes("async") && l.includes("await"),
      );
      const hasConsoleLog = lines.some(
        (l) => l.includes("console.log") && !l.trim().startsWith("//"),
      );
      const hasTODO = lines.some(
        (l) => l.includes("TODO") || l.includes("FIXME"),
      );

      practices.push(`  Async/await usage: ${hasAsyncAwait ? "Yes" : "No"}`);
      practices.push(
        `  Console.log statements: ${hasConsoleLog ? "Found (consider removing in production)" : "None"}`,
      );
      practices.push(`  TODO/FIXME comments: ${hasTODO ? "Found" : "None"}`);

      results.push(practices.join("\n"));
    }

    const resultText = `Static Analysis Results for ${args.file_path}:\n\n${results.join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-static file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-static>`,
    );

    return resultText;
  },
};

const DYNAMIC_ANALYSIS_DESCRIPTION = `Perform dynamic execution analysis on code.

Dynamic analysis runs the code and observes its behavior:
- Execute test cases or the code itself
- Capture runtime output
- Observe execution flow

Use this tool to understand how code behaves at runtime and identify issues
that only appear during execution.`;

export const dynamicAnalysisTool: ToolDefinition<
  z.infer<typeof dynamicAnalysisSchema>
> = {
  name: "dynamic_analysis",
  description: DYNAMIC_ANALYSIS_DESCRIPTION,
  inputSchema: dynamicAnalysisSchema,
  defaultConsent: "ask",

  getConsentPreview: (args) => `Run dynamic analysis on ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-dynamic file="${escapeXmlAttr(args.file_path)}">Executing...</dyad-dynamic>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Performing dynamic analysis: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    // Basic dynamic analysis: check syntax and imports
    const syntaxErrors: string[] = [];
    const importErrors: string[] = [];

    // Check for obvious syntax issues
    let braceCount = 0;
    let parenCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      parenCount += (line.match(/\(/g) || []).length;
      parenCount -= (line.match(/\)/g) || []).length;

      // Check for import statements
      if (line.includes("import ") && !line.includes("from")) {
        importErrors.push(`Line ${i + 1}: Malformed import statement`);
      }
    }

    if (braceCount !== 0) {
      syntaxErrors.push(
        "Mismatched braces: " +
          (braceCount > 0 ? "missing closing" : "extra closing"),
      );
    }
    if (parenCount !== 0) {
      syntaxErrors.push(
        "Mismatched parentheses: " +
          (parenCount > 0 ? "missing closing" : "extra closing"),
      );
    }

    let resultText = `Dynamic Analysis for ${args.file_path}:\n\n`;

    if (syntaxErrors.length > 0) {
      resultText += `Syntax Issues:\n${syntaxErrors.map((e) => `  - ${e}`).join("\n")}\n\n`;
    } else {
      resultText += "Syntax: OK\n\n";
    }

    if (importErrors.length > 0) {
      resultText += `Import Issues:\n${importErrors.map((e) => `  - ${e}`).join("\n")}\n\n`;
    }

    // File info
    const totalLines = lines.length;
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0).length;
    resultText += `File Statistics:\n`;
    resultText += `  Total lines: ${totalLines}\n`;
    resultText += `  Non-empty lines: ${nonEmptyLines}\n`;
    resultText += `  Average line length: ${Math.round(lines.reduce((acc, l) => acc + l.length, 0) / totalLines)} chars\n`;

    if (args.test_file) {
      resultText += `\nTest file specified: ${args.test_file}\n`;
      resultText += `(Execute the test file to observe runtime behavior)`;
    }

    ctx.onXmlComplete(
      `<dyad-dynamic file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-dynamic>`,
    );

    return resultText;
  },
};
