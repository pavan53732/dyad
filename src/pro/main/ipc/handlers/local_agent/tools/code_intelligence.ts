/**
 * Code Intelligence Tool
 * Provides deep code understanding capabilities:
 * - Code complexity analysis
 * - Code smell detection
 * - Design pattern detection
 * - Function/class analysis
 * - Refactoring suggestions
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const CodeIntelligenceArgs = z.object({
  /** Path to analyze */
  filePath: z.string(),
  /** Focus on specific analysis type */
  analysisType: z
    .enum(["complexity", "smells", "patterns", "functions", "all"])
    .default("all"),
});

type CodeIntelligenceArgs = z.infer<typeof CodeIntelligenceArgs>;

// Analysis result types
interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  lines: number;
  functions: number;
  maintainability: number;
}

interface CodeSmell {
  type: string;
  severity: "critical" | "major" | "minor" | "info";
  message: string;
  line: number;
}

interface DetectedPattern {
  name: string;
  location: string;
  confidence: number;
}

interface FunctionAnalysis {
  name: string;
  line: number;
  parameters: number;
  complexity: number;
  isAsync: boolean;
  isExported: boolean;
}

interface CodeIntelligenceResult {
  file: string;
  language: string;
  complexity: ComplexityMetrics;
  smells: CodeSmell[];
  patterns: DetectedPattern[];
  functions: FunctionAnalysis[];
  suggestions: string[];
}

// Calculate cyclomatic complexity
function calculateCyclomatic(content: string): number {
  let complexity = 1; // Base complexity

  // Count decision points
  const decisionPatterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bwhile\b/g,
    /\bfor\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\?/g,
    /&&/g,
    /\|\|/g,
  ];

  for (const pattern of decisionPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

// Detect code smells
function detectCodeSmells(content: string, lines: string[]): CodeSmell[] {
  const smells: CodeSmell[] = [];

  // Check for long lines
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 120) {
      smells.push({
        type: "Long Line",
        severity: "minor",
        message: `Line exceeds 120 characters (${lines[i].length} chars)`,
        line: i + 1,
      });
    }
  }

  // Check for deeply nested code
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    currentNesting += openBraces - closeBraces;
    maxNesting = Math.max(maxNesting, currentNesting);
  }
  if (maxNesting > 4) {
    smells.push({
      type: "Deep Nesting",
      severity: "major",
      message: `Code is nested ${maxNesting} levels deep`,
      line: 1,
    });
  }

  // Check for magic numbers
  const magicNumberRegex = /\b(\d{2,})\b/g;
  let match;
  const usedNumbers = new Set<number>();
  while ((match = magicNumberRegex.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    if (!usedNumbers.has(num) && num !== 0 && num !== 1) {
      smells.push({
        type: "Magic Number",
        severity: "minor",
        message: `Magic number ${num} found - consider using a named constant`,
        line: content.substring(0, match.index).split("\n").length,
      });
      usedNumbers.add(num);
    }
  }

  // Check for empty catch blocks
  const emptyCatchRegex = /catch\s*\([^)]*\)\s*{\s*}/g;
  let emptyCatchMatch;
  while ((emptyCatchMatch = emptyCatchRegex.exec(content)) !== null) {
    smells.push({
      type: "Empty Catch",
      severity: "major",
      message: "Empty catch block - errors are being silently ignored",
      line: content.substring(0, emptyCatchMatch.index).split("\n").length,
    });
  }

  // Check for console.log statements
  const consoleLogRegex = /console\.(log|debug|info)/g;
  const consoleMatches = content.match(consoleLogRegex);
  if (consoleMatches && consoleMatches.length > 3) {
    smells.push({
      type: "Debug Code",
      severity: "minor",
      message: `${consoleMatches.length} console statements found - remove for production`,
      line: 1,
    });
  }

  // Check for TODO/FIXME comments
  const todoRegex = /\/\/\s*(TODO|FIXME|HACK|XXX):/gi;
  const todoMatches = content.match(todoRegex);
  if (todoMatches) {
    smells.push({
      type: "TODO Comment",
      severity: "info",
      message: `${todoMatches.length} TODO/FIXME comments found`,
      line: 1,
    });
  }

  return smells;
}

// Detect design patterns
function detectPatterns(content: string): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Singleton pattern
  if (/export\s+default\s+/.test(content) && /getInstance\s*\(/.test(content)) {
    patterns.push({
      name: "Singleton",
      location: "class",
      confidence: 0.8,
    });
  }

  // Observer/Event pattern
  if (/addEventListener|on\(|emit\(/.test(content)) {
    patterns.push({
      name: "Observer",
      location: "event handling",
      confidence: 0.7,
    });
  }

  // Factory pattern
  if (/factory|create\w+Factory/.test(content)) {
    patterns.push({
      name: "Factory",
      location: "function",
      confidence: 0.6,
    });
  }

  // React Hook pattern
  if (/^use[A-Z]\w+\s*=\s*\(|export\s+const\s+use[A-Z]/.test(content)) {
    patterns.push({
      name: "React Custom Hook",
      location: "hook",
      confidence: 0.9,
    });
  }

  // HOC pattern
  if (/export\s+default\s+with[A-Z]\w+/.test(content)) {
    patterns.push({
      name: "Higher-Order Component",
      location: "component",
      confidence: 0.8,
    });
  }

  // Provider pattern (React Context)
  if (/createContext|Provider/.test(content) && /useContext/.test(content)) {
    patterns.push({
      name: "Context Provider",
      location: "state management",
      confidence: 0.85,
    });
  }

  // Strategy pattern
  if (
    /strategy|Strategy/.test(content) &&
    /interface\s+\w*Strategy/.test(content)
  ) {
    patterns.push({
      name: "Strategy",
      location: "interface",
      confidence: 0.7,
    });
  }

  // Builder pattern
  if (/\.build\(\)|Builder\s*class|\.set\w+\(.*\)\s*\{/.test(content)) {
    patterns.push({
      name: "Builder",
      location: "method chain",
      confidence: 0.6,
    });
  }

  return patterns;
}

// Analyze functions
function analyzeFunctions(content: string): FunctionAnalysis[] {
  const functions: FunctionAnalysis[] = [];

  // Match function declarations
  const functionRegex =
    /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\([^)]*\)\s*(?:=>|{))/g;

  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (!name) continue;

    const funcStart = content.substring(0, match.index);
    const line = funcStart.split("\n").length;

    // Get function body to count complexity
    const bodyStart = match.index + match[0].length;
    let braceCount = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length; i++) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    const funcBody = content.substring(bodyStart, bodyEnd);
    const complexity = calculateCyclomatic(funcBody);

    // Count parameters
    const paramsMatch = match[0].match(/\(([^)]*)\)/);
    const paramCount = paramsMatch
      ? paramsMatch[1].split(",").filter((p) => p.trim()).length
      : 0;

    functions.push({
      name,
      line,
      parameters: paramCount,
      complexity,
      isAsync: /async\s+/.test(match[0]),
      isExported: /export\s+/.test(
        funcStart.substring(funcStart.lastIndexOf("\n")),
      ),
    });
  }

  return functions;
}

// Calculate maintainability index
function calculateMaintainability(
  lines: number,
  cyclomatic: number,
  volume: number,
): number {
  // Simplified maintainability index calculation
  const mi =
    171 - 5.2 * Math.log(volume) - 0.23 * cyclomatic - 16.2 * Math.log(lines);
  return Math.max(0, Math.min(100, Math.round(mi * 100) / 100));
}

// Main analysis function
async function analyzeCode(
  args: CodeIntelligenceArgs,
  ctx: AgentContext,
): Promise<CodeIntelligenceResult> {
  const fullPath = path.isAbsolute(args.filePath)
    ? args.filePath
    : path.join(ctx.appPath, args.filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  // Determine language
  const ext = path.extname(fullPath).toLowerCase();
  const languageMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript (react)",
    ".js": "javascript",
    ".jsx": "javascript (react)",
    ".py": "python",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cs": "csharp",
  };
  const language = languageMap[ext] || "unknown";

  ctx.onXmlStream(
    `<dyad-status title="Code Intelligence">Analyzing ${path.basename(fullPath)}...</dyad-status>`,
  );

  // Calculate complexity metrics
  const cyclomatic = calculateCyclomatic(content);
  const linesOfCode = lines.filter((l) => l.trim().length > 0).length;
  const functions = analyzeFunctions(content);
  const volume = content.length * Math.log2(26); // Approximate volume
  const maintainability = calculateMaintainability(
    linesOfCode,
    cyclomatic,
    volume,
  );

  const complexityMetrics: ComplexityMetrics = {
    cyclomatic,
    cognitive: cyclomatic, // Simplified
    lines: linesOfCode,
    functions: functions.length,
    maintainability,
  };

  // Detect code smells
  const smells =
    args.analysisType === "all" || args.analysisType === "smells"
      ? detectCodeSmells(content, lines)
      : [];

  // Detect patterns
  const patterns =
    args.analysisType === "all" || args.analysisType === "patterns"
      ? detectPatterns(content)
      : [];

  // Generate suggestions
  const suggestions: string[] = [];

  if (maintainability < 65) {
    suggestions.push(
      "Consider refactoring - maintainability index is below 65",
    );
  }

  if (cyclomatic > 10) {
    suggestions.push(
      `High cyclomatic complexity (${cyclomatic}) - consider breaking into smaller functions`,
    );
  }

  for (const smell of smells) {
    if (smell.severity === "critical" || smell.severity === "major") {
      suggestions.push(`${smell.type} at line ${smell.line}: ${smell.message}`);
    }
  }

  // Look for refactoring opportunities
  const longFunctions = functions.filter(
    (f) => f.complexity > 10 || f.parameters > 4,
  );
  if (longFunctions.length > 0) {
    suggestions.push(
      `${longFunctions.length} functions have high complexity or too many parameters`,
    );
  }

  return {
    file: fullPath,
    language,
    complexity: complexityMetrics,
    smells,
    patterns,
    functions,
    suggestions,
  };
}

// Generate XML report
function generateIntelligenceXml(result: CodeIntelligenceResult): string {
  const lines: string[] = [
    `# Code Intelligence Report`,
    `## ${path.basename(result.file)}`,
    ``,
    `**Language:** ${result.language}`,
    ``,
    `## Complexity Metrics`,
    `- Cyclomatic Complexity: ${result.complexity.cyclomatic}`,
    `- Lines of Code: ${result.complexity.lines}`,
    `- Functions: ${result.complexity.functions}`,
    `- Maintainability Index: ${result.complexity.maintainability}/100`,
    ``,
  ];

  // Code smells
  if (result.smells.length > 0) {
    lines.push(`## 🔍 Code Smells`);
    const critical = result.smells.filter((s) => s.severity === "critical");
    const major = result.smells.filter((s) => s.severity === "major");
    const minor = result.smells.filter((s) => s.severity === "minor");

    if (critical.length > 0) {
      lines.push(`### Critical (${critical.length})`);
      for (const smell of critical.slice(0, 5)) {
        lines.push(`- Line ${smell.line}: ${smell.message}`);
      }
      lines.push("");
    }

    if (major.length > 0) {
      lines.push(`### Major (${major.length})`);
      for (const smell of major.slice(0, 5)) {
        lines.push(`- Line ${smell.line}: ${smell.message}`);
      }
      lines.push("");
    }

    if (minor.length > 0) {
      lines.push(`### Minor (${minor.length})`);
      for (const smell of minor.slice(0, 3)) {
        lines.push(`- ${smell.message}`);
      }
      lines.push("");
    }
  }

  // Detected patterns
  if (result.patterns.length > 0) {
    lines.push(`## 🏗️ Detected Patterns`);
    for (const pattern of result.patterns) {
      lines.push(
        `- **${pattern.name}** (${Math.round(pattern.confidence * 100)}% confidence)`,
      );
    }
    lines.push("");
  }

  // High complexity functions
  const complexFunctions = result.functions.filter((f) => f.complexity > 5);
  if (complexFunctions.length > 0) {
    lines.push(`## ⚠️ Complex Functions`);
    for (const func of complexFunctions) {
      lines.push(
        `- **${func.name}** (line ${func.line}) - complexity: ${func.complexity}, params: ${func.parameters}`,
      );
    }
    lines.push("");
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push(`## 💡 Suggestions`);
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join("\n");
}

export const codeIntelligenceTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "code_intelligence",
  description:
    "Analyze code for complexity, code smells, design patterns, and refactoring opportunities. Provides detailed metrics and actionable suggestions.",
  inputSchema: CodeIntelligenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const result = await analyzeCode(args, ctx);

    const report = generateIntelligenceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Code Intelligence Complete">Maintainability: ${result.complexity.maintainability}/100</dyad-status>`,
    );

    return report;
  },
};
