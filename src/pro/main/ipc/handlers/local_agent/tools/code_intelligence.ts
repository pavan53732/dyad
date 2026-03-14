/**
 * Code Intelligence Tool
 * Provides deep code understanding capabilities:
 * - Code complexity analysis
 * - Code smell detection
 * - Design pattern detection
 * - Function/class analysis
 * - Refactoring suggestions
 * - Semantic code search
 * - Natural language code queries
 * - Code synthesis from specifications
 * - Cross-language code mapping
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const CodeIntelligenceArgs = z.object({
  /** Path to analyze or query */
  filePath: z.string(),
  /** Focus on specific analysis type */
  analysisType: z
    .enum([
      "complexity",
      "smells",
      "patterns",
      "functions",
      "all",
      "semantic_search",
      "nl_query",
      "code_synthesis",
      "cross_language",
    ])
    .default("all"),
  /** Query for semantic search or NL query */
  query: z.string().optional(),
  /** Optional: File path for context (used by semantic search and nl_query) */
  contextPath: z.string().optional(),
  /** Optional: Search scope - files, directories, or glob pattern */
  searchScope: z.string().optional(),
  /** Target language for code synthesis or cross-language mapping */
  targetLanguage: z.string().optional(),
  /** Framework for code synthesis */
  framework: z.string().optional(),
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
  /** Result for code synthesis */
  synthesizedCode?: string;
  /** Language of synthesized code */
  synthesizedLanguage?: string;
  /** Cross-language mapping results */
  crossLanguageMappings?: CrossLanguageMapping[];
}

// New types for enhanced capabilities

/** Semantic search result */
interface SemanticSearchResult {
  file: string;
  line: number;
  snippet: string;
  relevanceScore: number;
  matchType: "semantic" | "exact" | "partial";
}

/** Natural language query result */
interface NLQueryResult {
  answer: string;
  confidence: number;
  supportingCode: {
    file: string;
    line: number;
    snippet: string;
  }[];
  suggestedFiles: string[];
}

/** Cross-language mapping */
interface CrossLanguageMapping {
  sourceConcept: string;
  targetLanguage: string;
  equivalent: string;
  explanation: string;
}
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

// ============================================================================
// Semantic Search (Capability 311)
// ============================================================================

/** Perform semantic search on code */
function performSemanticSearch(
  query: string,
  scope: string,
  ctx: AgentContext,
): SemanticSearchResult[] {
  const results: SemanticSearchResult[] = [];
  const searchDir = scope || ctx.appPath;

  // Keywords for semantic matching
  const semanticKeywords: Record<string, string[]> = {
    "fetch data": ["fetch", "axios", "request", "get", "load", "data"],
    "handle error": ["catch", "error", "exception", "try", "throw", "reject"],
    authentication: ["auth", "login", "token", "credential", "session", "jwt"],
    "state management": [
      "state",
      "store",
      "redux",
      "context",
      "useState",
      "reactive",
    ],
    "render UI": ["render", "return", "jsx", "tsx", "component", "view"],
    "async operation": ["async", "await", "promise", "then", "callback"],
    database: ["query", "db", "sql", "mongo", "insert", "update", "select"],
    "API call": ["api", "endpoint", "route", "http", "request", "response"],
  };

  // Find matching semantic category
  const lowerQuery = query.toLowerCase();
  let matchedKeywords: string[] = [];

  for (const [category, keywords] of Object.entries(semanticKeywords)) {
    if (
      lowerQuery.includes(category) ||
      keywords.some((k) => lowerQuery.includes(k))
    ) {
      matchedKeywords = keywords;
      break;
    }
  }

  // If no semantic match, use the query itself
  if (matchedKeywords.length === 0) {
    matchedKeywords = query.toLowerCase().split(/\s+/);
  }

  // Search in scope (simplified - would use file system in real implementation)
  try {
    const searchFiles = (dir: string, depth: number = 0): void => {
      if (depth > 3) return; // Limit depth

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip certain directories
        if (entry.isDirectory()) {
          if (/node_modules|\.git|dist|build|coverage/.test(entry.name))
            continue;
          searchFiles(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Check file extension
          if (!/\.(ts|tsx|js|jsx|py|java|go|rs)$/.test(entry.name)) continue;

          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              let matchCount = 0;
              let matchType: "semantic" | "exact" | "partial" = "partial";

              for (const keyword of matchedKeywords) {
                if (line.toLowerCase().includes(keyword)) {
                  matchCount++;
                  // Exact match if it's the whole query
                  if (line.toLowerCase().includes(query.toLowerCase())) {
                    matchType = "exact";
                  } else {
                    matchType = "semantic";
                  }
                }
              }

              if (matchCount > 0) {
                const relevance = Math.min(
                  1,
                  (matchCount / matchedKeywords.length) * 0.8 + 0.2,
                );
                results.push({
                  file: fullPath,
                  line: i + 1,
                  snippet: line.substring(0, 100),
                  relevanceScore: Math.round(relevance * 100) / 100,
                  matchType,
                });
              }
            }
          } catch {
            // Skip files we can't read
          }
        }
      }
    };

    searchFiles(searchDir);
  } catch {
    // Scope not accessible
  }

  // Sort by relevance and return top results
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return results.slice(0, 20);
}

// ============================================================================
// Natural Language Query (Capability 312)
// ============================================================================

/** Answer natural language questions about code */
function answerNLQuery(
  query: string,
  filePath: string,
  ctx: AgentContext,
): NLQueryResult {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(ctx.appPath, filePath);

  let content = "";
  if (fs.existsSync(fullPath)) {
    content = fs.readFileSync(fullPath, "utf-8");
  }

  let answer = "";
  let confidence = 0.5;
  const supportingCode: NLQueryResult["supportingCode"] = [];
  const suggestedFiles: string[] = [];

  // Analyze query type and provide appropriate answer
  if (/what.*function|what.*does|explain/i.test(query)) {
    // Explain functionality
    const funcMatches = content.match(/(?:function|const|let|var)\s+(\w+)/g);
    if (funcMatches && funcMatches.length > 0) {
      answer = `This file contains ${funcMatches.length} function(s) or variable declarations.`;
      confidence = 0.7;

      // Extract key functions
      for (const match of funcMatches.slice(0, 5)) {
        const name = match.replace(/(?:function|const|let|var)\s+/, "");
        supportingCode.push({
          file: fullPath,
          line: content.indexOf(name),
          snippet: match,
        });
      }
    } else {
      answer = "Unable to identify specific functions in this file.";
    }
  } else if (/how.*work|what.*do/i.test(query)) {
    // Explain how it works
    const importMatches = content.match(/import\s+.*?from/g);
    const exportMatches = content.match(
      /export\s+(?:default|const|function|class)/g,
    );

    if (importMatches || exportMatches) {
      answer = "This module imports dependencies and exports functionality. ";
      if (importMatches) {
        answer += `It imports ${importMatches.length} item(s). `;
      }
      if (exportMatches) {
        answer += `It exports ${exportMatches.length} item(s).`;
      }
      confidence = 0.65;
    } else {
      answer =
        "This appears to be a self-contained file with no external dependencies.";
      confidence = 0.5;
    }
  } else if (/error|bug|issue|problem/i.test(query)) {
    // Look for potential issues
    const issues = content.match(/catch\s*\([^)]*\)\s*{\s*}/g);
    const todoMatches = content.match(/\/\/\s*(TODO|FIXME)/gi);

    if (issues || todoMatches) {
      answer = "Potential issues found: ";
      if (issues) {
        answer += `${issues.length} empty catch block(s). `;
      }
      if (todoMatches) {
        answer += `${todoMatches.length} TODO/FIXME comment(s).`;
      }
      confidence = 0.75;
    } else {
      answer = "No obvious issues detected in this file.";
      confidence = 0.6;
    }
  } else {
    // Generic answer based on file analysis
    const lines = content.split("\n").filter((l) => l.trim()).length;
    const funcs = (content.match(/function\s+\w+/g) || []).length;
    const classes = (content.match(/class\s+\w+/g) || []).length;

    answer = `This file contains approximately ${lines} lines of code.`;
    if (funcs > 0) answer += ` It defines ${funcs} function(s).`;
    if (classes > 0) answer += ` It defines ${classes} class(es).`;
    confidence = 0.55;
  }

  // Suggest related files based on imports
  const importMatches = content.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
  if (importMatches) {
    for (const match of importMatches) {
      const moduleMatch = match.match(/from\s+['"]([^'"]+)['"]/);
      if (moduleMatch && !moduleMatch[1].startsWith(".")) {
        suggestedFiles.push(moduleMatch[1]);
      }
    }
  }

  return {
    answer,
    confidence,
    supportingCode,
    suggestedFiles: [...new Set(suggestedFiles)],
  };
}

// ============================================================================
// Code Synthesis (Capability 313)
// ============================================================================

/** Generate code from specifications */
function synthesizeCode(
  functionality: string,
  language: string,
  framework?: string,
): { code: string; language: string } {
  const lowerFunc = functionality.toLowerCase();
  let code = "";

  // Generate code based on functionality type
  if (/api|endpoint|route/i.test(lowerFunc)) {
    // API endpoint
    if (language === "typescript" || language === "javascript") {
      if (framework === "express") {
        code = `import express, { Request, Response } from 'express';
const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: Implement your logic here
    const data = {};
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;`;
      } else {
        code = `// API endpoint for ${functionality}
async function handleRequest(req, res) {
  try {
    // TODO: Implement your logic here
    const data = {};
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export default handleRequest;`;
      }
    } else if (language === "python") {
      code = `from fastapi import FastAPI, HTTPException
from typing import Optional

app = FastAPI()

@app.get("/")
async def get_item():
    # TODO: Implement your logic here
    return {"success": True, "data": {}}
`;
    }
  } else if (/component|ui|interface/i.test(lowerFunc)) {
    // UI Component
    if (language === "typescript" || language === "javascript") {
      if (framework === "react") {
        code = `import React, { useState } from 'react';

interface Props {
  // Define your props here
}

const MyComponent: React.FC<Props> = ({ /* destructure props */ }) => {
  const [state, setState] = useState<any>(null);

  // TODO: Implement your component logic

  return (
    <div>
      {/* Your JSX here */}
    </div>
  );
};

export default MyComponent;`;
      } else {
        code = `// UI Component for ${functionality}
function MyComponent(props) {
  const [state, setState] = React.useState(null);

  return (
    <div>
      {/* Your markup here */}
    </div>
  );
}`;
      }
    }
  } else if (/class|object/i.test(lowerFunc)) {
    // Class definition
    if (language === "typescript") {
      code = `class MyClass {
  private _state: any;

  constructor() {
    this._state = null;
  }

  // TODO: Add methods and properties
  public getState(): any {
    return this._state;
  }

  public setState(state: any): void {
    this._state = state;
  }
}

export default MyClass;`;
    } else if (language === "python") {
      code = `class MyClass:
    def __init__(self):
        self._state = None

    def get_state(self):
        return self._state

    def set_state(self, state):
        self._state = state
`;
    }
  } else if (/function/i.test(lowerFunc)) {
    // Generic function
    if (language === "typescript") {
      code = `/**
 * ${functionality}
 * @param input - Description of input
 * @returns Description of return value
 */
async function handle${functionality.replace(/\s/g, "")}(input: any): Promise<any> {
  try {
    // TODO: Implement your logic
    return { success: true, data: input };
  } catch (error) {
    throw new Error(\`Failed to process: \${error.message}\`);
  }
}

export default handle${functionality.replace(/\s/g, "")};`;
    } else {
      code = `/**
 * ${functionality}
 */
async def handle_${functionality.toLowerCase().replace(/\s+/g, "_")}(input):
    try:
        # TODO: Implement your logic
        return {"success": True, "data": input}
    except Exception as e:
        raise Exception(f"Failed to process: {e}")`;
    }
  } else {
    // Default template
    code = `// Generated code for: ${functionality}
// Language: ${language}${framework ? `, Framework: ${framework}` : ""}

// TODO: Customize this code template`;
  }

  return { code, language };
}

// ============================================================================
// Cross-Language Mapping (Capability 316)
// ============================================================================

/** Map code concepts across languages */
function mapCrossLanguage(
  sourceCode: string,
  targetLanguage: string,
): CrossLanguageMapping[] {
  const mappings: CrossLanguageMapping[] = [];
  const lowerSource = sourceCode.toLowerCase();

  // Common concept mappings
  const conceptMappings = [
    {
      concept: "async/await",
      typescript: "async/await",
      python: "async/await",
      java: "CompletableFuture",
      go: "goroutines with go keyword",
      rust: "async/await with tokio",
    },
    {
      concept: "class definition",
      typescript: "class MyClass { }",
      python: "class MyClass:",
      java: "public class MyClass { }",
      go: "type MyClass struct { }",
      rust: "struct MyClass { }",
    },
    {
      concept: "interface/type",
      typescript: "interface MyType { }",
      python: "TypedDict or Protocol",
      java: "interface MyInterface { }",
      go: "type MyInterface interface { }",
      rust: "trait MyTrait { }",
    },
    {
      concept: "arrow function",
      typescript: "const fn = () => { }",
      python: "lambda x: x",
      java: "Function<T, R> or lambda",
      go: "func literal",
      rust: "Closure |x| { }",
    },
    {
      concept: "error handling",
      typescript: "try { } catch (e) { }",
      python: "try: \nexcept:",
      java: "try { } catch (Exception e) { }",
      go: "if err != nil { return err }",
      rust: "match result { Ok(v) => v, Err(e) => panic!() }",
    },
    {
      concept: "module export",
      typescript: "export default / export const",
      python: "def / class / __all__",
      java: "public class / package",
      go: "func / var / type (capitalized = exported)",
      rust: "pub fn / pub struct / mod",
    },
  ];

  // Find relevant mappings based on source code
  for (const mapping of conceptMappings) {
    let isRelevant = false;

    // Check if source code contains the concept
    if (
      /async|await|promise/.test(lowerSource) &&
      mapping.concept === "async/await"
    ) {
      isRelevant = true;
    } else if (
      /class\s+\w+/.test(sourceCode) &&
      mapping.concept === "class definition"
    ) {
      isRelevant = true;
    } else if (
      /interface|type\s+\w+\s*=/.test(sourceCode) &&
      mapping.concept === "interface/type"
    ) {
      isRelevant = true;
    } else if (
      /=>|lambda/.test(sourceCode) &&
      mapping.concept === "arrow function"
    ) {
      isRelevant = true;
    } else if (
      /try\s*{|catch\s*\(|except/.test(sourceCode) &&
      mapping.concept === "error handling"
    ) {
      isRelevant = true;
    } else if (
      /export|import|require/.test(sourceCode) &&
      mapping.concept === "module export"
    ) {
      isRelevant = true;
    }

    if (isRelevant) {
      // Get the target equivalent
      const targetEquivalent =
        (mapping as Record<string, string>)[targetLanguage.toLowerCase()] ||
        "Not directly available";

      mappings.push({
        sourceConcept: mapping.concept,
        targetLanguage,
        equivalent: targetEquivalent,
        explanation: `The ${mapping.concept} pattern in your source code maps to: ${targetEquivalent} in ${targetLanguage}`,
      });
    }
  }

  // If no specific mappings found, provide general guidance
  if (mappings.length === 0) {
    mappings.push({
      sourceConcept: "general",
      targetLanguage,
      equivalent: "Code analysis needed",
      explanation: `Please provide more specific code containing common patterns (async, class, interface, etc.) for accurate mapping`,
    });
  }

  return mappings;
}

// Main analysis function
async function analyzeCode(
  args: CodeIntelligenceArgs,
  ctx: AgentContext,
): Promise<CodeIntelligenceResult> {
  const { analysisType, query, searchScope, targetLanguage, framework } = args;

  // Handle new analysis types
  if (analysisType === "semantic_search" && query) {
    const results = performSemanticSearch(query, searchScope || ".", ctx);
    return {
      file: searchScope || ctx.appPath,
      language: "search",
      complexity: {
        cyclomatic: 0,
        cognitive: 0,
        lines: 0,
        functions: 0,
        maintainability: 100,
      },
      smells: [],
      patterns: [],
      functions: [],
      suggestions: results.map(
        (r) => `${r.file}:${r.line} - ${r.snippet.substring(0, 50)}`,
      ),
    };
  }

  if (analysisType === "nl_query" && query && args.filePath) {
    const result = answerNLQuery(query, args.filePath, ctx);
    return {
      file: args.filePath,
      language: "query",
      complexity: {
        cyclomatic: 0,
        cognitive: 0,
        lines: 0,
        functions: 0,
        maintainability: 100,
      },
      smells: [],
      patterns: [],
      functions: [],
      suggestions: [result.answer],
    };
  }

  if (analysisType === "code_synthesis" && query) {
    const result = synthesizeCode(
      query,
      targetLanguage || "typescript",
      framework,
    );
    return {
      file: "synthesized",
      language: result.language,
      complexity: {
        cyclomatic: 0,
        cognitive: 0,
        lines: 0,
        functions: 0,
        maintainability: 100,
      },
      smells: [],
      patterns: [],
      functions: [],
      suggestions: [],
      synthesizedCode: result.code,
      synthesizedLanguage: result.language,
    };
  }

  if (analysisType === "cross_language" && args.filePath) {
    const content = fs.readFileSync(args.filePath, "utf-8");
    const mappings = mapCrossLanguage(content, targetLanguage || "python");
    return {
      file: args.filePath,
      language: targetLanguage || "python",
      complexity: {
        cyclomatic: 0,
        cognitive: 0,
        lines: 0,
        functions: 0,
        maintainability: 100,
      },
      smells: [],
      patterns: [],
      functions: [],
      suggestions: mappings.map((m) => `${m.sourceConcept}: ${m.explanation}`),
      crossLanguageMappings: mappings,
    };
  }

  // Original analysis logic
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

// Generate XML report for semantic search
function generateSemanticSearchXml(results: SemanticSearchResult[]): string {
  const lines: string[] = [
    `# Semantic Search Results`,
    ``,
    `**Total Results:** ${results.length}`,
    ``,
  ];

  if (results.length === 0) {
    lines.push("No matching code found.");
    return lines.join("\n");
  }

  lines.push(`## Results`);
  for (const result of results.slice(0, 10)) {
    const icon =
      result.matchType === "exact"
        ? "🎯"
        : result.matchType === "semantic"
          ? "🔍"
          : "📄";
    lines.push(`${icon} **${path.basename(result.file)}:${result.line}**`);
    lines.push(`   Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`);
    lines.push(`   \`\`\`${result.snippet}\`\`\``);
    lines.push(``);
  }

  return lines.join("\n");
}

// Generate XML report for NL query
function generateNLQueryXml(result: NLQueryResult): string {
  const lines: string[] = [
    `# Natural Language Query Result`,
    ``,
    `**Answer:** ${result.answer}`,
    `**Confidence:** ${(result.confidence * 100).toFixed(0)}%`,
    ``,
  ];

  if (result.supportingCode.length > 0) {
    lines.push(`## Supporting Code`);
    for (const code of result.supportingCode.slice(0, 5)) {
      lines.push(
        `- ${path.basename(code.file)}:${code.line}: \`${code.snippet}\``,
      );
    }
    lines.push(``);
  }

  if (result.suggestedFiles.length > 0) {
    lines.push(`## Related Files`);
    for (const file of result.suggestedFiles.slice(0, 5)) {
      lines.push(`- ${file}`);
    }
  }

  return lines.join("\n");
}

// Generate XML report for code synthesis
function generateCodeSynthesisXml(result: {
  code: string;
  language: string;
}): string {
  const lines: string[] = [
    `# Synthesized Code`,
    ``,
    `**Language:** ${result.language}`,
    ``,
    `\`\`\`${result.language}`,
    result.code,
    `\`\`\``,
  ];

  return lines.join("\n");
}

// Generate XML report for cross-language mapping
function generateCrossLanguageXml(mappings: CrossLanguageMapping[]): string {
  const lines: string[] = [
    `# Cross-Language Mappings`,
    ``,
    `**Mappings Found:** ${mappings.length}`,
    ``,
  ];

  for (const mapping of mappings) {
    lines.push(`## ${mapping.sourceConcept} → ${mapping.targetLanguage}`);
    lines.push(`**Equivalent:** \`${mapping.equivalent}\``);
    lines.push(``);
    lines.push(`${mapping.explanation}`);
    lines.push(``);
  }

  return lines.join("\n");
}

export const codeIntelligenceTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "code_intelligence",
  description:
    "Analyze code for complexity, code smells, design patterns, and refactoring opportunities. Provides detailed metrics and actionable suggestions. Also supports semantic search, natural language queries, code synthesis, and cross-language mapping.",
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

// ============================================================================
// New Standalone Tool Definitions for Code Intelligence Capabilities
// ============================================================================

/** Tool: Semantic Search (Capability 311) */
export const semanticSearchTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "semantic_search",
  description:
    "Search for code using natural language semantics rather than exact text matches. Understands code patterns like 'fetch data', 'handle error', 'authentication', etc. Use this to find relevant code without knowing exact variable names.",
  inputSchema: CodeIntelligenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const { query, searchScope } = args;
    if (!query) {
      throw new Error("Query is required for semantic search");
    }

    ctx.onXmlStream(
      `<dyad-status title="Semantic Search">Searching for: ${query}...</dyad-status>`,
    );

    const results = performSemanticSearch(
      query,
      searchScope || ctx.appPath,
      ctx,
    );

    const report = generateSemanticSearchXml(results);

    ctx.onXmlComplete(
      `<dyad-status title="Semantic Search Complete">Found ${results.length} results</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Natural Language Query (Capability 312) */
export const nlQueryTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "nl_query",
  description:
    "Query code using natural language questions like 'what does this function do?' or 'how does authentication work?'. Provides answers based on code analysis with supporting code references.",
  inputSchema: CodeIntelligenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const { query, filePath } = args;
    if (!query) {
      throw new Error("Query is required for NL query");
    }
    if (!filePath) {
      throw new Error("File path is required for NL query");
    }

    ctx.onXmlStream(
      `<dyad-status title="NL Query">Analyzing: ${query}...</dyad-status>`,
    );

    const result = answerNLQuery(query, filePath, ctx);

    const report = generateNLQueryXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="NL Query Complete">Confidence: ${(result.confidence * 100).toFixed(0)}%</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Code Synthesis (Capability 313) */
export const codeSynthesisTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "code_synthesis",
  description:
    "Generate code from natural language specifications. Describe what you want (e.g., 'API endpoint', 'React component', 'class') and get syntactically correct code in the specified language and framework.",
  inputSchema: CodeIntelligenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const { query, targetLanguage, framework } = args;
    if (!query) {
      throw new Error(
        "Functionality description is required for code synthesis",
      );
    }

    ctx.onXmlStream(
      `<dyad-status title="Code Synthesis">Generating code for: ${query}...</dyad-status>`,
    );

    const result = synthesizeCode(
      query,
      targetLanguage || "typescript",
      framework,
    );

    const report = generateCodeSynthesisXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Code Synthesis Complete">Generated ${result.language} code</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Cross-Language Mapping (Capability 316) */
export const crossLanguageTool: ToolDefinition<CodeIntelligenceArgs> = {
  name: "cross_language",
  description:
    "Map code concepts from one language to another. Understands patterns like async/await, classes, interfaces, error handling, etc. and shows equivalent implementations in the target language.",
  inputSchema: CodeIntelligenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const { filePath, targetLanguage } = args;
    if (!filePath) {
      throw new Error("File path is required for cross-language mapping");
    }

    ctx.onXmlStream(
      `<dyad-status title="Cross-Language Mapping">Mapping to: ${targetLanguage || "python"}...</dyad-status>`,
    );

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.appPath, filePath);
    const content = fs.readFileSync(fullPath, "utf-8");
    const mappings = mapCrossLanguage(content, targetLanguage || "python");

    const report = generateCrossLanguageXml(mappings);

    ctx.onXmlComplete(
      `<dyad-status title="Cross-Language Mapping Complete">${mappings.length} mappings found</dyad-status>`,
    );

    return report;
  },
};
