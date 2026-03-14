/**
 * Design Patterns Tool
 * Detects design patterns, provides refactoring suggestions, and identifies anti-patterns:
 * - detect_patterns (351) - Design pattern detection
 * - suggest_refactoring (352) - Refactoring suggestions
 * - anti_patterns (353) - Anti-pattern detection
 * - pattern_library (354) - Pattern knowledge base
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

const DetectPatternsArgs = z.object({
  /** Path to analyze (defaults to app root) */
  projectPath: z.string().optional(),
  /** Specific patterns to look for */
  patterns: z
    .enum([
      "all",
      "singleton",
      "factory",
      "observer",
      "strategy",
      "decorator",
      "adapter",
      "facade",
      "repository",
      "mvc",
      "mvvm",
      "clean-architecture",
    ])
    .array()
    .default(["all"]),
  /** Include code examples in output */
  includeExamples: z.boolean().default(true),
});

type DetectPatternsArgs = z.infer<typeof DetectPatternsArgs>;

const SuggestRefactoringArgs = z.object({
  /** Path to the file or directory to refactor */
  targetPath: z.string(),
  /** Type of refactoring to suggest */
  refactoringType: z
    .enum([
      "extract-method",
      "move-method",
      "rename",
      "simplify-condition",
      "remove-dead-code",
      "improve-naming",
      "reduce-complexity",
      " SOLID",
    ])
    .default("reduce-complexity"),
  /** Focus area for refactoring */
  focusArea: z.string().optional(),
});

type SuggestRefactoringArgs = z.infer<typeof SuggestRefactoringArgs>;

const DetectAntiPatternsArgs = z.object({
  /** Path to analyze */
  projectPath: z.string().optional(),
  /** Specific anti-patterns to detect */
  antiPatternTypes: z
    .enum([
      "all",
      "god-object",
      "spaghetti-code",
      "magic-numbers",
      "copy-paste",
      "dead-code",
      "circular-dependency",
      "feature-envy",
      "data-clump",
      "primitive-obsession",
    ])
    .array()
    .default(["all"]),
  /** Minimum severity to report */
  minSeverity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
});

type DetectAntiPatternsArgs = z.infer<typeof DetectAntiPatternsArgs>;

const PatternLibraryArgs = z.object({
  /** Search for patterns by keyword */
  searchTerm: z.string().optional(),
  /** Get detailed info on a specific pattern */
  patternName: z.string().optional(),
  /** Category of patterns to list */
  category: z
    .enum(["creational", "structural", "behavioral", "architectural", "all"])
    .default("all"),
});

type PatternLibraryArgs = z.infer<typeof PatternLibraryArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface DetectedPattern {
  name: string;
  category: string;
  confidence: number;
  location: string;
  description: string;
  benefits: string[];
  example?: string;
}

interface RefactoringSuggestion {
  type: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  location: string;
  currentCode?: string;
  suggestedCode?: string;
  effort: "low" | "medium" | "high";
}

interface AntiPatternIssue {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  description: string;
  suggestion: string;
}

interface PatternInfo {
  name: string;
  category: string;
  intent: string;
  problemAddressed: string;
  solution: string;
  codeExample: string;
  pros: string[];
  cons: string[];
  relatedPatterns: string[];
}

// ============================================================================
// Pattern Library Database
// ============================================================================

const PATTERN_LIBRARY: PatternInfo[] = [
  {
    name: "Singleton",
    category: "creational",
    intent: "Ensure a class only has one instance",
    problemAddressed: "Need exactly one instance of a class (e.g., configuration, logger)",
    solution: "Make the constructor private, add a static method to get the instance",
    codeExample: `class Singleton {
  private static instance: Singleton;
  private constructor() {}
  static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }
    return Singleton.instance;
  }
}`,
    pros: ["Controlled access to single instance", "Reduced namespace pollution", "Lazy initialization possible"],
    cons: ["Hard to test", "Creates global state", "Can mask bad design"],
    relatedPatterns: ["Factory Method", "Prototype"],
  },
  {
    name: "Factory Method",
    category: "creational",
    intent: "Define an interface for creating objects, let subclasses decide the class",
    problemAddressed: "Need to create objects without specifying exact class",
    solution: "Define a method in base class that subclasses override",
    codeExample: `abstract class Creator {
  abstract createProduct(): Product;
  operation() {
    const product = this.createProduct();
    return product.operation();
  }
}`,
    pros: ["Loose coupling", "Single Responsibility", "Extensible"],
    cons: ["May require many subclasses", "Can add complexity"],
    relatedPatterns: ["Abstract Factory", "Template Method", "Prototype"],
  },
  {
    name: "Observer",
    category: "behavioral",
    intent: "Define one-to-many dependency, notify observers of state changes",
    problemAddressed: "Need to notify multiple objects about state changes",
    solution: "Subject maintains list of observers, notifies them on change",
    codeExample: `class Subject {
  private observers: Observer[] = [];
  attach(o: Observer) { this.observers.push(o); }
  notify() { this.observers.forEach(o => o.update(this)); }
}`,
    pros: ["Loose coupling", "Dynamic relationships", "Event handling"],
    cons: ["Memory leaks if not detached", "Order of notification uncertain"],
    relatedPatterns: ["Mediator", "Singleton"],
  },
  {
    name: "Strategy",
    category: "behavioral",
    intent: "Define family of algorithms, make them interchangeable",
    problemAddressed: "Need different algorithms for a task at runtime",
    solution: "Define interface for algorithms, implement multiple versions",
    codeExample: `interface Strategy {
  execute(data: Data): Result;
}
class Context {
  constructor(private strategy: Strategy) {}
  doSomething() { return this.strategy.execute(this.data); }
}`,
    pros: ["Open/Closed Principle", "Runtime switching", "Isolated logic"],
    cons: ["More objects", "Client must know differences"],
    relatedPatterns: ["State", "Template Method", "Bridge"],
  },
  {
    name: "Decorator",
    category: "structural",
    intent: "Attach additional responsibilities dynamically",
    problemAddressed: "Need to add behaviors without subclassing",
    solution: "Wrap object in decorator that adds behavior",
    codeExample: `class Decorator implements Component {
  constructor(protected component: Component) {}
  operation() { return this.component.operation(); }
}
class ConcreteDecorator extends Decorator {
  operation() { return \`Decorated(\${super.operation()})\`; }
}`,
    pros: ["Flexible than inheritance", "Add/remove at runtime", "Combine behaviors"],
    cons: ["Hard to remove specific wrapper", "Order matters"],
    relatedPatterns: ["Composite", "Strategy"],
  },
  {
    name: "Repository",
    category: "architectural",
    intent: "Mediate between domain and data mapping layers",
    problemAddressed: "Need consistent API for data access",
    solution: "Create repository interface with collection-like methods",
    codeExample: `interface Repository<T> {
  findById(id: string): Promise<T>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}`,
    pros: ["Testable", "Abstraction over data source", "Centralized logic"],
    cons: ["Extra layer", "May be overkill for simple apps"],
    relatedPatterns: ["Unit of Work", "Factory"],
  },
  {
    name: "Clean Architecture",
    category: "architectural",
    intent: "Separate code into layers with strict dependency rules",
    problemAddressed: "Need maintainable, testable, independent code",
    solution: "Layers: Domain, Use Cases, Interface Adapters, Frameworks",
    codeExample: `// Domain (innermost) - no dependencies
// Use Cases - depend only on Domain
// Interface Adapters - convert data between layers
// Frameworks/Drivers (outermost) - DB, UI, etc.`,
    pros: ["Testable", "Independent of frameworks", "Independent of UI", "Independent of DB"],
    cons: ["Learning curve", "May be overkill for simple apps", "More boilerplate"],
    relatedPatterns: ["Hexagonal Architecture", "Onion Architecture"],
  },
];

// ============================================================================
// Pattern Detection Logic
// ============================================================================

function detectDesignPatterns(
  files: string[],
  content: Map<string, string>,
  patterns: string[],
): DetectedPattern[] {
  const detected: DetectedPattern[] = [];

  // Singleton detection
  if (patterns.includes("all") || patterns.includes("singleton")) {
    for (const [file, fileContent] of content) {
      // Check for static instance field and private constructor
      if (
        /static\s+(?:instance|_instance)/.test(fileContent) &&
        /private\s+constructor/.test(fileContent)
      ) {
        detected.push({
          name: "Singleton",
          category: "creational",
          confidence: 0.85,
          location: file,
          description: "Class ensures only one instance exists",
          benefits: ["Single point of control", "Reduced memory footprint"],
          example: "Configuration manager, Logger, Connection pool",
        });
      }
    }
  }

  // Factory detection
  if (patterns.includes("all") || patterns.includes("factory")) {
    for (const [file, fileContent] of content) {
      if (
        /(?:static\s+)?create[A-Z]\w*\s*\([^)]*\)\s*[:{]/.test(fileContent) &&
        /class\s+\w+Factory/.test(fileContent)
      ) {
        detected.push({
          name: "Factory Method",
          category: "creational",
          confidence: 0.75,
          location: file,
          description: "Method creates objects without specifying exact class",
          benefits: ["Loose coupling", "Extensibility"],
        });
      }
    }
  }

  // Observer detection (event handling patterns)
  if (patterns.includes("all") || patterns.includes("observer")) {
    for (const [file, fileContent] of content) {
      const hasEventEmitting = /addEventListener|on\(|subscribe|emit|notify/.test(fileContent);
      const hasCallback = /callbacks|listeners|observers/.test(fileContent);
      if (hasEventEmitting || hasCallback) {
        detected.push({
          name: "Observer",
          category: "behavioral",
          confidence: 0.7,
          location: file,
          description: "Implements event/listener pattern for state changes",
          benefits: ["Loose coupling", "Event-driven communication"],
        });
      }
    }
  }

  // MVC/MVVM detection
  if (patterns.includes("all") || patterns.includes("mvc") || patterns.includes("mvvm")) {
    const hasController = files.some((f) => f.includes("/controller") || f.includes("/Controller"));
    const hasModel = files.some((f) => f.includes("/model") || f.includes("/Model"));
    const hasView = files.some((f) => f.includes("/view") || f.includes("/View"));

    if (hasController && hasModel && hasView) {
      detected.push({
        name: "MVC",
        category: "architectural",
        confidence: 0.9,
        location: "Project structure",
        description: "Model-View-Controller pattern for UI separation",
        benefits: ["Separation of concerns", "Testability", "Maintainability"],
      });
    }
  }

  // Repository detection
  if (patterns.includes("all") || patterns.includes("repository")) {
    for (const [file, fileContent] of content) {
      if (
        /interface\s+\w*[Rr]epository/.test(fileContent) ||
        (/findById|findAll|save|delete/.test(fileContent) &&
          /async\s+/.test(fileContent))
      ) {
        detected.push({
          name: "Repository",
          category: "architectural",
          confidence: 0.8,
          location: file,
          description: "Collection-like interface for data access",
          benefits: ["Abstraction", "Testability", "Consistent API"],
        });
      }
    }
  }

  return detected;
}

// ============================================================================
// Refactoring Suggestion Logic
// ============================================================================

function suggestRefactoring(
  targetPath: string,
  refactoringType: string,
  content: Map<string, string>,
): RefactoringSuggestion[] {
  const suggestions: RefactoringSuggestion[] = [];

  const fileContent = content.get(targetPath);
  if (!fileContent) {
    return suggestions;
  }

  // Extract method suggestions
  if (refactoringType === "extract-method" || refactoringType === "SOLID") {
    const longFunctions = fileContent.match(
      /(?:function|const|let|var)\s+(\w+)\s*[=\(][^{]{100,}/g,
    );
    if (longFunctions) {
      suggestions.push({
        type: "extract-method",
        priority: "high",
        title: "Extract long method",
        description:
          "This function is too long. Consider extracting parts into smaller, focused methods.",
        location: targetPath,
        effort: "medium",
      });
    }
  }

  // Simplify condition suggestions
  if (refactoringType === "simplify-condition" || refactoringType === "SOLID") {
    const deepNesting = fileContent.match(/(\n\s{4,}){5,}/g);
    if (deepNesting && deepNesting.length > 2) {
      suggestions.push({
        type: "simplify-condition",
        priority: "medium",
        title: "Reduce nested conditions",
        description:
          "Deeply nested conditions found. Consider using early returns or guard clauses.",
        location: targetPath,
        effort: "medium",
      });
    }
  }

  // Remove dead code
  if (refactoringType === "remove-dead-code") {
    const unusedVars = fileContent.match(/const\s+(\w+)\s*=\s*[^;]+;(?!\s*\1)/g);
    if (unusedVars) {
      suggestions.push({
        type: "remove-dead-code",
        priority: "low",
        title: "Remove unused variables",
        description: "Found potentially unused variables",
        location: targetPath,
        effort: "low",
      });
    }
  }

  // Naming improvements
  if (refactoringType === "improve-naming" || refactoringType === "SOLID") {
    const singleCharVars = fileContent.match(/\b[a-z]\b(?!\s*[\(\{])/g);
    if (singleCharVars && singleCharVars.length > 3) {
      suggestions.push({
        type: "improve-naming",
        priority: "low",
        title: "Use more descriptive variable names",
        description: "Found single-letter variables that could be more descriptive",
        location: targetPath,
        effort: "low",
      });
    }
  }

  // Reduce complexity (SOLID)
  if (refactoringType === "reduce-complexity" || refactoringType === "SOLID") {
    const fileLength = fileContent.split("\n").length;
    if (fileLength > 500) {
      suggestions.push({
        type: "reduce-complexity",
        priority: "high",
        title: "Split large file",
        description: `File has ${fileLength} lines. Consider splitting into smaller modules.`,
        location: targetPath,
        effort: "high",
      });
    }

    const manyParams = fileContent.match(/\([^)]*,\s*[^)]+\)/g);
    if (manyParams) {
      suggestions.push({
        type: "reduce-complexity",
        priority: "medium",
        title: "Too many function parameters",
        description: "Functions have many parameters. Consider using an options object.",
        location: targetPath,
        effort: "medium",
      });
    }
  }

  return suggestions;
}

// ============================================================================
// Anti-Pattern Detection Logic
// ============================================================================

function detectAntiPatterns(
  files: string[],
  content: Map<string, string>,
  types: string[],
  minSeverity: string,
): AntiPatternIssue[] {
  const issues: AntiPatternIssue[] = [];
  const severityOrder = ["low", "medium", "high", "critical"];
  const minIdx = severityOrder.indexOf(minSeverity);

  // God Object detection
  if (types.includes("all") || types.includes("god-object")) {
    for (const [file, fileContent] of content) {
      if (fileContent.length > 5000) {
        issues.push({
          id: "god-001",
          name: "God Object",
          category: "Complexity",
          severity: "high",
          location: file,
          description: `File is very large (${Math.round(fileContent.length / 1000)}KB)`,
          suggestion: "Split into smaller, focused modules following Single Responsibility Principle",
        });
      }
    }
  }

  // Spaghetti Code detection
  if (types.includes("all") || types.includes("spaghetti-code")) {
    for (const [file, fileContent] of content) {
      const lines = fileContent.split("\n");
      let maxDepth = 0;
      for (const line of lines) {
        const match = line.match(/^(\s*)/);
        if (match) {
          const depth = Math.floor(match[1].length / 2);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
      if (maxDepth > 15) {
        issues.push({
          id: "spaghetti-001",
          name: "Spaghetti Code",
          category: "Structure",
          severity: "critical",
          location: file,
          description: `Excessive indentation depth: ${maxDepth} levels`,
          suggestion: "Refactor using early returns, guard clauses, or extract methods",
        });
      }
    }
  }

  // Magic Numbers detection
  if (types.includes("all") || types.includes("magic-numbers")) {
    for (const [file, fileContent] of content) {
      const magicNumbers = fileContent.match(/(?<!\w)\d{3,}(?!\w)/g);
      if (magicNumbers && magicNumbers.length > 5) {
        issues.push({
          id: "magic-001",
          name: "Magic Numbers",
          category: "Readability",
          severity: "low",
          location: file,
          description: `Found ${magicNumbers.length} numeric literals without named constants`,
          suggestion: "Define named constants for magic numbers",
        });
      }
    }
  }

  // Copy-Paste detection
  if (types.includes("all") || types.includes("copy-paste")) {
    const codeBlocks = new Map<string, { count: number; locations: string[] }>();
    for (const [file, fileContent] of content) {
      const funcRegex = /(?:function|const|let|var)\s+(\w+)\s*[=:]/g;
      let match;
      while ((match = funcRegex.exec(fileContent)) !== null) {
        const block = match[0].slice(0, 60);
        const existing = codeBlocks.get(block) || { count: 0, locations: [] };
        existing.count++;
        existing.locations.push(file);
        codeBlocks.set(block, existing);
      }
    }
    for (const [block, info] of codeBlocks) {
      if (info.count > 3) {
        issues.push({
          id: "copy-paste-001",
          name: "Copy-Paste Code",
          category: "Duplication",
          severity: "medium",
          location: info.locations.slice(0, 3).join(", "),
          description: `Similar code block appears ${info.count} times`,
          suggestion: "Extract to shared utility function",
        });
      }
    }
  }

  // Circular dependency detection
  if (types.includes("all") || types.includes("circular-dependency")) {
    for (const [file, fileContent] of content) {
      const imports = fileContent.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const match = imp.match(/['"]([^'"]+)['"]/);
        if (match) {
          const impPath = match[1];
          if (impPath.includes("..")) {
            const reversePath = impPath.replace(/\.\.\//g, "").replace(/\\/g, "/");
            if (file.includes(reversePath)) {
              issues.push({
                id: "circular-001",
                name: "Circular Dependency",
                category: "Dependencies",
                severity: "high",
                location: file,
                description: "File imports from parent that imports it back",
                suggestion: "Refactor to remove circular imports using dependency injection",
              });
            }
          }
        }
      }
    }
  }

  return issues.filter((i) => severityOrder.indexOf(i.severity) >= minIdx);
}

// ============================================================================
// Execute Functions
// ============================================================================

async function detectPatternsExecute(
  args: DetectPatternsArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Design Pattern Detection">Scanning for patterns...</dyad-status>`,
  );

  const { files, content } = await scanProject(projectPath);
  const detected = detectDesignPatterns(files, content, args.patterns);

  // Generate output
  const lines: string[] = [
    "# Design Pattern Detection Report",
    "",
    `**Total patterns detected:** ${detected.length}`,
    "",
  ];

  if (detected.length === 0) {
    lines.push("No specific design patterns detected.");
    lines.push("");
    lines.push("Consider implementing patterns like:");
    lines.push("- Repository for data access abstraction");
    lines.push("- Observer for event handling");
    lines.push("- Strategy for interchangeable algorithms");
  } else {
    for (const pattern of detected) {
      lines.push(`## ${pattern.name} (${pattern.category})`);
      lines.push(`- **Confidence:** ${Math.round(pattern.confidence * 100)}%`);
      lines.push(`- **Location:** ${pattern.location}`);
      lines.push(`- **Description:** ${pattern.description}`);
      if (pattern.benefits.length > 0) {
        lines.push(`- **Benefits:** ${pattern.benefits.join(", ")}`);
      }
      if (pattern.example && args.includeExamples) {
        lines.push(`- **Example use case:** ${pattern.example}`);
      }
      lines.push("");
    }
  }

  ctx.onXmlComplete(
    `<dyad-status title="Pattern Detection Complete">Found ${detected.length} patterns</dyad-status>`,
  );

  return lines.join("\n");
}

async function suggestRefactoringExecute(
  args: SuggestRefactoringArgs,
  ctx: AgentContext,
): Promise<string> {
  const targetPath = path.isAbsolute(args.targetPath)
    ? args.targetPath
    : path.join(ctx.appPath, args.targetPath);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Refactoring Suggestions">Analyzing code...</dyad-status>`,
  );

  const content = new Map<string, string>();

  if (fs.statSync(targetPath).isFile()) {
    content.set(targetPath, fs.readFileSync(targetPath, "utf-8"));
  }

  const suggestions = suggestRefactoring(
    targetPath,
    args.refactoringType,
    content,
  );

  const lines: string[] = [
    "# Refactoring Suggestions",
    "",
    `**Target:** ${args.targetPath}`,
    `**Refactoring type:** ${args.refactoringType}`,
    "",
  ];

  if (suggestions.length === 0) {
    lines.push("No refactoring suggestions for this code.");
  } else {
    for (const s of suggestions) {
      const priorityEmoji = s.priority === "high" ? "🔴" : s.priority === "medium" ? "🟡" : "🟢";
      lines.push(`## ${priorityEmoji} ${s.title} [${s.priority}]`);
      lines.push(`- **Type:** ${s.type}`);
      lines.push(`- **Location:** ${s.location}`);
      lines.push(`- **Effort:** ${s.effort}`);
      lines.push(`- **Description:** ${s.description}`);
      if (s.suggestedCode) {
        lines.push(`- **Suggested Code:**`);
        lines.push("```typescript");
        lines.push(s.suggestedCode);
        lines.push("```");
      }
      lines.push("");
    }
  }

  ctx.onXmlComplete(
    `<dyad-status title="Refactoring Complete">${suggestions.length} suggestions</dyad-status>`,
  );

  return lines.join("\n");
}

async function detectAntiPatternsExecute(
  args: DetectAntiPatternsArgs,
  ctx: AgentContext,
): Promise<string> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Anti-Pattern Detection">Analyzing code...</dyad-status>`,
  );

  const { files, content } = await scanProject(projectPath);
  const issues = detectAntiPatterns(
    files,
    content,
    args.antiPatternTypes,
    args.minSeverity,
  );

  const lines: string[] = [
    "# Anti-Pattern Detection Report",
    "",
    `**Total issues found:** ${issues.length}`,
    "",
  ];

  const critical = issues.filter((i) => i.severity === "critical");
  const high = issues.filter((i) => i.severity === "high");
  const medium = issues.filter((i) => i.severity === "medium");
  const low = issues.filter((i) => i.severity === "low");

  if (critical.length > 0) {
    lines.push("## 🔴 Critical Issues");
    for (const issue of critical) {
      lines.push(`### ${issue.name}`);
      lines.push(`- **Location:** ${issue.location}`);
      lines.push(`- **Description:** ${issue.description}`);
      lines.push(`- **Fix:** ${issue.suggestion}`);
      lines.push("");
    }
  }

  if (high.length > 0) {
    lines.push("## 🟠 High Priority Issues");
    for (const issue of high) {
      lines.push(`### ${issue.name}`);
      lines.push(`- **Location:** ${issue.location}`);
      lines.push(`- **Description:** ${issue.description}`);
      lines.push(`- **Fix:** ${issue.suggestion}`);
      lines.push("");
    }
  }

  if (medium.length > 0) {
    lines.push("## 🟡 Medium Priority Issues");
    for (const issue of medium.slice(0, 10)) {
      lines.push(`### ${issue.name}`);
      lines.push(`- **Location:** ${issue.location}`);
      lines.push(`- **Description:** ${issue.description}`);
      lines.push("");
    }
  }

  if (issues.length === 0) {
    lines.push("✅ No anti-patterns detected!");
  }

  ctx.onXmlComplete(
    `<dyad-status title="Anti-Pattern Detection Complete">${issues.length} issues found</dyad-status>`,
  );

  return lines.join("\n");
}

async function patternLibraryExecute(
  args: PatternLibraryArgs,
  ctx: AgentContext,
): Promise<string> {
  let patterns = PATTERN_LIBRARY;

  // Filter by category
  if (args.category && args.category !== "all") {
    patterns = patterns.filter((p) => p.category === args.category);
  }

  // Filter by search term
  if (args.searchTerm) {
    const term = args.searchTerm.toLowerCase();
    patterns = patterns.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.intent.toLowerCase().includes(term) ||
        p.problemAddressed.toLowerCase().includes(term),
    );
  }

  // Get specific pattern
  if (args.patternName) {
    const specific = PATTERN_LIBRARY.find(
      (p) => p.name.toLowerCase() === args.patternName!.toLowerCase(),
    );
    if (specific) {
      const lines: string[] = [
        `# ${specific.name} Pattern`,
        "",
        `**Category:** ${specific.category}`,
        "",
        `## Intent`,
        specific.intent,
        "",
        `## Problem Addressed`,
        specific.problemAddressed,
        "",
        `## Solution`,
        specific.solution,
        "",
        `## Code Example`,
        "```typescript",
        specific.codeExample,
        "```",
        "",
        `## Pros`,
        ...specific.pros.map((p) => `- ${p}`),
        "",
        `## Cons`,
        ...specific.cons.map((c) => `- ${c}`),
        "",
        `## Related Patterns`,
        ...specific.relatedPatterns.map((p) => `- ${p}`),
      ];

      ctx.onXmlComplete(
        `<dyad-status title="Pattern Library">${specific.name} details</dyad-status>`,
      );

      return lines.join("\n");
    }
  }

  // List patterns
  const lines: string[] = [
    "# Design Pattern Library",
    "",
    `**Total patterns:** ${patterns.length}`,
    "",
  ];

  for (const p of patterns) {
    lines.push(`## ${p.name}`);
    lines.push(`- **Category:** ${p.category}`);
    lines.push(`- **Intent:** ${p.intent}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("Use `patternName` to get detailed information on a specific pattern.");

  ctx.onXmlComplete(
    `<dyad-status title="Pattern Library">${patterns.length} patterns</dyad-status>`,
  );

  return lines.join("\n");
}

// ============================================================================
// Helper Functions
// ============================================================================

async function scanProject(projectPath: string): Promise<{
  files: string[];
  content: Map<string, string>;
}> {
  const files: string[] = [];
  const content = new Map<string, string>();

  const skipDirs = new Set([
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
    "venv",
    "coverage",
    ".git",
    "target",
  ]);

  async function scan(dirPath: string, depth: number = 0): Promise<void> {
    if (depth > 5) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || skipDirs.has(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (entry.isDirectory()) {
          await scan(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
            files.push(relativePath);
            try {
              content.set(relativePath, fs.readFileSync(fullPath, "utf-8"));
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scan(projectPath);
  return { files, content };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const detectPatternsTool: ToolDefinition<DetectPatternsArgs> = {
  name: "detect_patterns",
  description:
    "Detect design patterns in code (Singleton, Factory, Observer, Strategy, Decorator, Adapter, Facade, Repository, MVC, Clean Architecture).",
  inputSchema: DetectPatternsArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => detectPatternsExecute(args, ctx),
};

export const suggestRefactoringTool: ToolDefinition<SuggestRefactoringArgs> = {
  name: "suggest_refactoring",
  description:
    "Suggest refactoring improvements for code (extract method, simplify conditions, remove dead code, improve naming, reduce complexity, SOLID principles).",
  inputSchema: SuggestRefactoringArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => suggestRefactoringExecute(args, ctx),
};

export const detectAntiPatternsTool: ToolDefinition<DetectAntiPatternsArgs> = {
  name: "anti_patterns",
  description:
    "Detect anti-patterns in code (God Object, Spaghetti Code, Magic Numbers, Copy-Paste, Dead Code, Circular Dependencies, Feature Envy).",
  inputSchema: DetectAntiPatternsArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => detectAntiPatternsExecute(args, ctx),
};

export const patternLibraryTool: ToolDefinition<PatternLibraryArgs> = {
  name: "pattern_library",
  description:
    "Access design pattern knowledge base. Search patterns by category or keyword, get detailed information including code examples.",
  inputSchema: PatternLibraryArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => patternLibraryExecute(args, ctx),
};
