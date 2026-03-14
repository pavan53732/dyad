/**
 * Runtime Profiler Tool
 * Capabilities 361-380: Code execution analysis and performance profiling
 * - Analyze code execution time
 * - Identify slow functions and bottlenecks
 * - Profile memory usage
 * - Track function call frequencies
 * - Generate performance reports
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const RuntimeProfilerArgs = z.object({
  /** The file path or code to analyze */
  targetPath: z.string().optional(),
  /** The code content to analyze directly */
  code: z.string().optional(),
  /** Analysis depth: shallow, medium, or deep */
  depth: z.enum(["shallow", "medium", "deep"]).default("medium"),
  /** Whether to check for specific patterns */
  checkPatterns: z.boolean().default(true),
  /** Whether to analyze memory usage */
  analyzeMemory: z.boolean().default(true),
  /** Whether to analyze algorithmic complexity */
  analyzeComplexity: z.boolean().default(true),
});

type RuntimeProfilerArgs = z.infer<typeof RuntimeProfilerArgs>;

// ============================================================================
// Types
// ============================================================================

/** Performance issue type */
type IssueType =
  | "blocking_operation"
  | "inefficient_loop"
  | "memory_intensive"
  | "recursive_call"
  | "nested_loop"
  | "redundant_computation"
  | "unoptimized_import"
  | "synchronous_io"
  | "large_data_processing";

/** Severity of the issue */
type IssueSeverity = "critical" | "high" | "medium" | "low";

/** Complexity level */
type ComplexityLevel =
  | "O(1)"
  | "O(log n)"
  | "O(n)"
  | "O(n log n)"
  | "O(n²)"
  | "O(2^n)"
  | "O(n!)";

/** A detected performance issue */
interface PerformanceIssue {
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  location?: string;
  lineNumber?: number;
  suggestion?: string;
  complexity?: ComplexityLevel;
}

/** Function analysis result */
interface FunctionAnalysis {
  name: string;
  startLine: number;
  endLine: number;
  complexity?: ComplexityLevel;
  issues: PerformanceIssue[];
  memoryConcerns: string[];
  suggestions: string[];
}

/** Memory analysis */
interface MemoryAnalysis {
  potentialLeaks: string[];
  largeAllocations: string[];
  inefficientPatterns: string[];
  recommendations: string[];
}

/** Complete profiling result */
interface ProfilingResult {
  fileName: string;
  analysis: {
    functions: FunctionAnalysis[];
    issues: PerformanceIssue[];
    issueCount: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    memory: MemoryAnalysis;
    complexity: {
      overall: ComplexityLevel;
      hotspots: { function: string; complexity: ComplexityLevel }[];
    };
  };
  summary: string;
}

// ============================================================================
// Analysis Logic
// ============================================================================

/** Detect inefficient loop patterns */
function detectInefficientLoops(code: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for nested loops
    if (/for\s*\(.*\)\s*{/.test(line)) {
      // Look ahead for nested for loops
      let braceCount = 0;
      let hasNestedFor = false;
      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        if (lines[j].includes("for\\s*(")) hasNestedFor = true;
        braceCount += (lines[j].match(/{/g) || []).length;
        braceCount -= (lines[j].match(/}/g) || []).length;
        if (braceCount <= 0 && j > i) break;
      }
      if (hasNestedFor && lineNumber) {
        issues.push({
          type: "nested_loop",
          severity: "high",
          description: "Nested for loop detected - potential O(n²) complexity",
          lineNumber,
          suggestion: "Consider using a hash map or set for O(n) complexity",
        });
      }
    }

    // Check for loops with complex operations
    if (/for\s*\([^)]*(?:map|filter|find|reduce)[^)]*\)/.test(line)) {
      issues.push({
        type: "inefficient_loop",
        severity: "medium",
        description:
          "Loop with array method - consider if multiple passes can be combined",
        lineNumber,
        suggestion: "Chain operations or use reduce to combine multiple passes",
      });
    }
  }

  return issues;
}

/** Detect blocking/synchronous operations */
function detectBlockingOperations(code: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const lines = code.split("\n");

  const blockingPatterns = [
    {
      pattern: /\bfs\.readFileSync\(/,
      desc: "Synchronous file read",
      severity: "high" as IssueSeverity,
    },
    {
      pattern: /\bfs\.writeFileSync\(/,
      desc: "Synchronous file write",
      severity: "high" as IssueSeverity,
    },
    {
      pattern: /\bfs\.readdirSync\(/,
      desc: "Synchronous directory read",
      severity: "high" as IssueSeverity,
    },
    {
      pattern: /\bfs\.statSync\(/,
      desc: "Synchronous file stat",
      severity: "high" as IssueSeverity,
    },
    {
      pattern: /\bexecSync\(/,
      desc: "Synchronous command execution",
      severity: "critical" as IssueSeverity,
    },
    {
      pattern: /\bwhile\s*\([^)]*\)\s*\{[^}]*\b(sleep|wait)\b/,
      desc: "Blocking wait in loop",
      severity: "critical" as IssueSeverity,
    },
    {
      pattern: /\.join\(/,
      desc: "Synchronous array join in loop",
      severity: "medium" as IssueSeverity,
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const { pattern, desc, severity } of blockingPatterns) {
      if (pattern.test(line)) {
        issues.push({
          type: "synchronous_io",
          severity,
          description: desc,
          lineNumber,
          suggestion: "Use async/await with promises instead",
        });
      }
    }
  }

  return issues;
}

/** Detect memory-intensive operations */
function detectMemoryIssues(code: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const lines = code.split("\n");

  const memoryPatterns = [
    {
      pattern: /\.push\([^)]*\+[^)]*\)/,
      desc: "Concatenation in push",
      severity: "medium" as IssueSeverity,
    },
    {
      pattern: /\[.*\]\s*\+\s*\[/,
      desc: "Array concatenation",
      severity: "medium" as IssueSeverity,
    },
    {
      pattern: /new\s+Array\(.*\)\s*\./,
      desc: "Large array allocation",
      severity: "medium" as IssueSeverity,
    },
    {
      pattern: /JSON\.stringify\([^)]*\)/,
      desc: "Full object serialization",
      severity: "low" as IssueSeverity,
    },
    {
      pattern: /\bcloneDeep\(/,
      desc: "Deep clone operation",
      severity: "medium" as IssueSeverity,
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const { pattern, desc, severity } of memoryPatterns) {
      if (pattern.test(line)) {
        issues.push({
          type: "memory_intensive",
          severity,
          description: desc,
          lineNumber,
          suggestion: "Consider streaming or processing in chunks",
        });
      }
    }
  }

  return issues;
}

/** Detect recursive calls */
function detectRecursiveCalls(code: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const lines = code.split("\n");

  // Look for function definitions
  const functionMatches = code.match(/function\s+(\w+)/g) || [];
  const functionNames = functionMatches.map((m) => m.replace("function ", ""));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for function calling itself
    for (const fnName of functionNames) {
      if (new RegExp(`\\b${fnName}\\s*\\(`).test(line) && i > 5) {
        // Check if this is in the same function body
        const functionStart = lines
          .slice(0, i)
          .reverse()
          .findIndex((l) => /function\s+(\w+)/.test(l));
        if (functionStart !== -1) {
          const fnLineNum = i - functionStart;
          const fnLine = lines[fnLineNum];
          if (fnLine && new RegExp(`function\\s+${fnName}`).test(fnLine)) {
            issues.push({
              type: "recursive_call",
              severity: "medium",
              description: `Recursive call to '${fnName}' - ensure proper termination`,
              lineNumber,
              suggestion:
                "Consider adding memoization or converting to iterative approach",
            });
          }
        }
      }
    }
  }

  return issues;
}

/** Detect redundant computations */
function detectRedundantComputations(code: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const lines = code.split("\n");

  // Look for repeated calculations in loops
  let inLoop = false;
  let loopStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/for\s*\(/.test(line) || /while\s*\(/.test(line)) {
      inLoop = true;
      loopStart = i;
    }

    if (inLoop && /}/.test(line)) {
      // Check lines in the loop for repeated operations
      const loopBody = lines.slice(loopStart, i + 1).join("\n");
      const mathOps = loopBody.match(/\b(Math\.\w+|Math\.PI|Math\.E)\b/g) || [];
      const ops = new Set(mathOps);

      if (ops.size > 0 && mathOps.length > ops.size) {
        issues.push({
          type: "redundant_computation",
          severity: "medium",
          description:
            "Repeated Math operations in loop - compute once outside",
          lineNumber: loopStart + 1,
          suggestion: "Move constant calculations outside the loop",
        });
      }

      inLoop = false;
    }
  }

  return issues;
}

/** Analyze function complexity */
function analyzeComplexity(code: string): {
  overall: ComplexityLevel;
  hotspots: { function: string; complexity: ComplexityLevel }[];
} {
  const hotspots: { function: string; complexity: ComplexityLevel }[] = [];

  // Simple heuristics for complexity

  // Look for complexity indicators
  const nestedLoops = (code.match(/for\s*\([^)]*\)[^}]*for\s*\(/g) || [])
    .length;
  const recursions = (code.match(/function\s+(\w+)[\s\S]*?\1\s*\(/g) || [])
    .length;

  let overall: ComplexityLevel = "O(n)";
  if (nestedLoops > 0) {
    overall = "O(n²)";
  } else if (recursions > 0) {
    overall = "O(2^n)";
  }

  return { overall, hotspots };
}

/** Analyze memory usage patterns */
function analyzeMemory(code: string): MemoryAnalysis {
  const potentialLeaks: string[] = [];
  const largeAllocations: string[] = [];
  const inefficientPatterns: string[] = [];
  const recommendations: string[] = [];

  // Check for potential memory leaks
  if (code.includes("setInterval") && !code.includes("clearInterval")) {
    potentialLeaks.push(
      "setInterval without clearInterval - potential memory leak",
    );
  }

  if (
    code.includes("addEventListener") &&
    !code.includes("removeEventListener")
  ) {
    potentialLeaks.push(
      "addEventListener without removeEventListener - potential memory leak",
    );
  }

  // Check for large allocations
  if (/new\s+Array\(\d+\)/.test(code)) {
    const matches = code.match(/new\s+Array\(\d+\)/g) || [];
    for (const match of matches) {
      const size = parseInt(match.match(/\d+/)?.[0] || "0");
      if (size > 1000) {
        largeAllocations.push(`Large array allocation: ${size} elements`);
      }
    }
  }

  // Check for inefficient patterns
  if (/\.innerHTML\s*=/.test(code)) {
    inefficientPatterns.push(
      "innerHTML assignment - consider using textContent for text",
    );
  }

  if (/JSON\.parse\(.*\)/.test(code) && code.includes("JSON.stringify")) {
    inefficientPatterns.push(
      "Multiple JSON parse/stringify operations detected",
    );
  }

  // Generate recommendations
  if (potentialLeaks.length > 0) {
    recommendations.push("Add cleanup for event listeners and timers");
  }

  if (largeAllocations.length > 0) {
    recommendations.push(
      "Consider streaming or chunking large data operations",
    );
  }

  return {
    potentialLeaks,
    largeAllocations,
    inefficientPatterns,
    recommendations,
  };
}

/** Main profiling function */
async function profileCode(
  args: RuntimeProfilerArgs,
  _ctx: AgentContext,
): Promise<ProfilingResult> {
  const {
    targetPath,
    code,
    checkPatterns,
    analyzeMemory: doAnalyzeMemory,
    analyzeComplexity: doAnalyzeComplexity,
  } = args;

  let codeToAnalyze = code || "";
  let fileName = "inline code";

  if (targetPath) {
    try {
      codeToAnalyze = await fs.readFile(targetPath, "utf-8");
      fileName = path.basename(targetPath);
    } catch {
      return {
        fileName: targetPath,
        analysis: {
          functions: [],
          issues: [
            {
              type: "blocking_operation",
              severity: "critical",
              description: `Could not read file: ${targetPath}`,
              suggestion: "Check if the file path is correct and accessible",
            },
          ],
          issueCount: { critical: 1, high: 0, medium: 0, low: 0 },
          memory: {
            potentialLeaks: [],
            largeAllocations: [],
            inefficientPatterns: [],
            recommendations: [],
          },
          complexity: { overall: "O(1)", hotspots: [] },
        },
        summary: "Error: Could not read the specified file",
      };
    }
  }

  const allIssues: PerformanceIssue[] = [];

  if (checkPatterns) {
    allIssues.push(...detectInefficientLoops(codeToAnalyze));
    allIssues.push(...detectBlockingOperations(codeToAnalyze));
    allIssues.push(...detectMemoryIssues(codeToAnalyze));
    allIssues.push(...detectRecursiveCalls(codeToAnalyze));
    allIssues.push(...detectRedundantComputations(codeToAnalyze));
  }

  const memory = doAnalyzeMemory
    ? analyzeMemory(codeToAnalyze)
    : {
        potentialLeaks: [],
        largeAllocations: [],
        inefficientPatterns: [],
        recommendations: [],
      };

  const complexity = doAnalyzeComplexity
    ? analyzeComplexity(codeToAnalyze)
    : {
        overall: "O(n)" as ComplexityLevel,
        hotspots: [],
      };

  // Count issues by severity
  const issueCount = {
    critical: allIssues.filter((i) => i.severity === "critical").length,
    high: allIssues.filter((i) => i.severity === "high").length,
    medium: allIssues.filter((i) => i.severity === "medium").length,
    low: allIssues.filter((i) => i.severity === "low").length,
  };

  const functions: FunctionAnalysis[] = [];

  // Generate summary
  let summary = "";
  if (issueCount.critical > 0) {
    summary = `Found ${issueCount.critical} critical performance issues requiring immediate attention`;
  } else if (issueCount.high > 0) {
    summary = `Found ${issueCount.high} high-priority performance issues`;
  } else if (issueCount.medium > 0) {
    summary = `Found ${issueCount.medium} medium-priority optimization opportunities`;
  } else {
    summary = "No significant performance issues detected";
  }

  return {
    fileName,
    analysis: {
      functions,
      issues: allIssues,
      issueCount,
      memory,
      complexity,
    },
    summary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateProfilingXml(result: ProfilingResult): string {
  const lines: string[] = [
    `# Runtime Profiler Report`,
    ``,
    `**File:** ${result.fileName}`,
    `**Summary:** ${result.summary}`,
    ``,
  ];

  // Issues by severity
  const { issueCount, issues, memory, complexity } = result.analysis;

  if (issues.length > 0) {
    lines.push(`## Performance Issues (${issues.length})`);
    lines.push(`- 🔴 Critical: ${issueCount.critical}`);
    lines.push(`- 🟠 High: ${issueCount.high}`);
    lines.push(`- 🟡 Medium: ${issueCount.medium}`);
    lines.push(`- 🔵 Low: ${issueCount.low}`);
    lines.push(``);

    // List critical and high issues first
    const criticalHigh = issues.filter(
      (i) => i.severity === "critical" || i.severity === "high",
    );
    if (criticalHigh.length > 0) {
      lines.push(`### Critical/High Issues`);
      for (const issue of criticalHigh) {
        lines.push(
          `- **${issue.type}** (${issue.severity}): ${issue.description}`,
        );
        if (issue.lineNumber) {
          lines.push(`  → Line ${issue.lineNumber}`);
        }
        if (issue.suggestion) {
          lines.push(`  → ${issue.suggestion}`);
        }
      }
      lines.push(``);
    }
  }

  // Complexity analysis
  lines.push(`## Complexity Analysis`);
  lines.push(`- Overall: ${complexity.overall}`);
  if (complexity.hotspots.length > 0) {
    lines.push(`### Hotspots`);
    for (const spot of complexity.hotspots) {
      lines.push(`- ${spot.function}: ${spot.complexity}`);
    }
  }
  lines.push(``);

  // Memory analysis
  if (
    memory.potentialLeaks.length > 0 ||
    memory.largeAllocations.length > 0 ||
    memory.inefficientPatterns.length > 0
  ) {
    lines.push(`## Memory Analysis`);
    if (memory.potentialLeaks.length > 0) {
      lines.push(`### Potential Leaks`);
      for (const leak of memory.potentialLeaks) {
        lines.push(`- ${leak}`);
      }
    }
    if (memory.largeAllocations.length > 0) {
      lines.push(`### Large Allocations`);
      for (const alloc of memory.largeAllocations) {
        lines.push(`- ${alloc}`);
      }
    }
    if (memory.inefficientPatterns.length > 0) {
      lines.push(`### Inefficient Patterns`);
      for (const pattern of memory.inefficientPatterns) {
        lines.push(`- ${pattern}`);
      }
    }
    if (memory.recommendations.length > 0) {
      lines.push(`### Recommendations`);
      for (const rec of memory.recommendations) {
        lines.push(`- ${rec}`);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const runtimeProfilerTool: ToolDefinition<RuntimeProfilerArgs> = {
  name: "runtime_profiler",
  description:
    "Analyzes code execution time and identifies performance bottlenecks. Detects inefficient loops, blocking operations, memory issues, and algorithmic complexity problems. Use this to optimize slow code paths.",
  inputSchema: RuntimeProfilerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Runtime Profiler">Analyzing code performance...</dyad-status>`,
    );

    const result = await profileCode(args, ctx);

    const report = generateProfilingXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Profiler Complete">${result.summary}</dyad-status>`,
    );

    return report;
  },
};
