/**
 * Architecture Validator Tool
 * Validates architecture against best practices and detects issues:
 * - Architecture best practice checker
 * - Architecture anti-pattern detector
 * - Architecture conflict resolver
 * - Architecture change impact analyzer
 * - Architecture drift detection
 * - Architecture decision record generator
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const ArchitectureValidatorArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Validation types to run */
  validationTypes: z
    .enum([
      "all",
      "best-practices",
      "anti-patterns",
      "conflicts",
      "impact",
      "drift",
      "adr",
    ])
    .array()
    .default(["all"]),
  /** Generate architecture decision records if true */
  generateAdr: z.boolean().default(false),
  /** Include file locations in output */
  includeLocations: z.boolean().default(true),
});

type ArchitectureValidatorArgs = z.infer<typeof ArchitectureValidatorArgs>;

// Result types
interface BestPractice {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  passed: boolean;
  location?: string;
  suggestion?: string;
}

interface AntiPattern {
  id: string;
  name: string;
  category: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  suggestion: string;
  refactoring?: string;
}

interface Conflict {
  id: string;
  type: "dependency" | "layer" | "naming" | "pattern";
  description: string;
  affectedFiles: string[];
  resolution?: string;
}

interface ImpactAnalysis {
  file: string;
  impactLevel: "high" | "medium" | "low";
  dependents: number;
  cascadeRisk: string[];
}

interface ArchitectureDrift {
  pattern: string;
  expected: string;
  actual: string;
  driftSeverity: "critical" | "high" | "medium" | "low";
  affectedAreas: string[];
}

interface ArchitectureDecision {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "deprecated" | "superseded";
  date: string;
  context: string;
  decision: string;
  consequences: string[];
}

interface ValidationReport {
  bestPractices: BestPractice[];
  antiPatterns: AntiPattern[];
  conflicts: Conflict[];
  impactAnalysis: ImpactAnalysis[];
  architectureDrift: ArchitectureDrift[];
  architectureDecisions: ArchitectureDecision[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    criticalIssues: number;
    overallHealth: number;
  };
}

// Best practices checklist
const BEST_PRACTICES: Array<{
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  check: (
    files: string[],
    content: Map<string, string>,
  ) => { passed: boolean; location?: string; suggestion?: string };
}> = [
  {
    id: "bp-001",
    category: "Structure",
    title: "Consistent directory structure",
    description: "Project should follow consistent directory organization",
    severity: "medium",
    check: (files) => {
      const hasSrc = files.some(
        (f) => f.includes("/src/") || f.includes("\\src\\"),
      );
      const hasComponents = files.some(
        (f) => f.includes("/components/") || f.includes("/src/"),
      );
      return {
        passed: hasSrc && hasComponents,
        suggestion: "Organize code in consistent directories",
      };
    },
  },
  {
    id: "bp-002",
    category: "Dependencies",
    title: "No circular dependencies",
    description: "Circular dependencies indicate poor architecture",
    severity: "critical",
    check: (files, content) => {
      // Simplified check - look for import patterns
      let hasCircular = false;
      for (const [_file, fileContent] of content) {
        const imports = extractImports(fileContent);
        for (const imp of imports) {
          if (
            imp.includes("..") &&
            fileContent.includes(imp.replace("..", "").replace("./", ""))
          ) {
            hasCircular = true;
          }
        }
      }
      return {
        passed: !hasCircular,
        suggestion: "Refactor to remove circular imports",
      };
    },
  },
  {
    id: "bp-003",
    category: "Configuration",
    title: "Environment configuration separation",
    description: "Environment variables should be properly configured",
    severity: "high",
    check: (files) => {
      const hasEnv = files.some(
        (f) => f.includes(".env") || f.includes("/env/"),
      );
      const hasEnvExample = files.some((f) => f.includes(".env.example"));
      return {
        passed: hasEnv && hasEnvExample,
        suggestion: "Add .env and .env.example files",
      };
    },
  },
  {
    id: "bp-004",
    category: "Error Handling",
    title: "Consistent error handling",
    description: "Project should have consistent error handling patterns",
    severity: "high",
    check: (files, content) => {
      let hasTryCatch = false;
      let hasErrorTypes = false;
      for (const [, fileContent] of content) {
        if (fileContent.includes("try") && fileContent.includes("catch"))
          hasTryCatch = true;
        if (fileContent.includes("Error") || fileContent.includes("Exception"))
          hasErrorTypes = true;
      }
      return {
        passed: hasTryCatch && hasErrorTypes,
        suggestion: "Implement consistent error handling",
      };
    },
  },
  {
    id: "bp-005",
    category: "Testing",
    title: "Test coverage structure",
    description: "Project should have test directories",
    severity: "medium",
    check: (files) => {
      const hasTests = files.some(
        (f) =>
          f.includes("/__tests__/") ||
          f.includes("/test/") ||
          f.includes(".spec.") ||
          f.includes(".test."),
      );
      return {
        passed: hasTests,
        suggestion: "Add test directories and test files",
      };
    },
  },
  {
    id: "bp-006",
    category: "Documentation",
    title: "README documentation",
    description: "Project should have a README file",
    severity: "medium",
    check: (files) => {
      const hasReadme = files.some((f) => f.toLowerCase().includes("readme"));
      return { passed: hasReadme, suggestion: "Add a comprehensive README.md" };
    },
  },
  {
    id: "bp-007",
    category: "Type Safety",
    title: "TypeScript usage",
    description: "Project should use TypeScript for type safety",
    severity: "high",
    check: (files) => {
      const hasTs = files.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
      return { passed: hasTs, suggestion: "Consider migrating to TypeScript" };
    },
  },
  {
    id: "bp-008",
    category: "Security",
    title: "No secrets in code",
    description: "No hardcoded secrets or credentials",
    severity: "critical",
    check: (files, content) => {
      let hasSecrets = false;
      for (const [, fileContent] of content) {
        if (/api[_-]?key|password|secret|token/i.test(fileContent)) {
          // Check if it's a placeholder
          if (
            !/example|your_[a-z_]+|replace|xxx|placeholder/i.test(fileContent)
          ) {
            hasSecrets = true;
          }
        }
      }
      return {
        passed: !hasSecrets,
        suggestion: "Move secrets to environment variables",
      };
    },
  },
];

// Anti-patterns to detect
const ANTI_PATTERNS: Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  detect: (files: string[], content: Map<string, string>) => AntiPattern[];
}> = [
  {
    id: "ap-001",
    name: "God Object",
    category: "Complexity",
    description: "A class/module that does too much",
    severity: "high",
    detect: (files, content) => {
      const patterns: AntiPattern[] = [];
      for (const [file, fileContent] of content) {
        if (fileContent.length > 5000) {
          patterns.push({
            id: "ap-001",
            name: "God Object",
            category: "Complexity",
            description: `File is very large (${Math.round(fileContent.length / 1000)}KB)`,
            severity: "high",
            location: file,
            suggestion: "Split into smaller, focused modules",
            refactoring: "Extract related functionality into separate modules",
          });
        }
      }
      return patterns;
    },
  },
  {
    id: "ap-002",
    name: "Spaghetti Code",
    category: "Structure",
    description: "Code with poor structure and tangled dependencies",
    severity: "critical",
    detect: (files, content) => {
      const patterns: AntiPattern[] = [];
      for (const [file, fileContent] of content) {
        // Check for deep nesting
        const nestedDepth = Math.max(
          ...fileContent.split("\n").map((line) => {
            const match = line.match(/^(\s*)/);
            return match ? match[1].length : 0;
          }),
        );
        if (nestedDepth > 20) {
          patterns.push({
            id: "ap-002",
            name: "Spaghetti Code",
            category: "Structure",
            description: "Excessive indentation suggests deeply nested logic",
            severity: "critical",
            location: file,
            suggestion: "Refactor to reduce nesting depth",
            refactoring: "Use early returns, guard clauses, or extract methods",
          });
        }
      }
      return patterns;
    },
  },
  {
    id: "ap-003",
    name: "Copy-Paste Code",
    category: "Duplication",
    description: "Repeated code that should be extracted",
    severity: "medium",
    detect: (files, content) => {
      const patterns: AntiPattern[] = [];
      const codeBlocks = new Map<string, number>();
      for (const [_file, fileContent] of content) {
        // Extract function-like blocks (simplified)
        const funcRegex = /(?:function|const|let|var)\s+(\w+)\s*=/g;
        let match;
        while ((match = funcRegex.exec(fileContent)) !== null) {
          const block = match[0].slice(0, 50);
          codeBlocks.set(block, (codeBlocks.get(block) || 0) + 1);
        }
      }
      for (const [_block, count] of codeBlocks) {
        if (count > 3) {
          patterns.push({
            id: "ap-003",
            name: "Copy-Paste Code",
            category: "Duplication",
            description: `Similar code block appears ${count} times`,
            severity: "medium",
            location: "Multiple files",
            suggestion: "Extract to shared utility function",
          });
          break;
        }
      }
      return patterns;
    },
  },
  {
    id: "ap-004",
    name: "Magic Numbers",
    category: "Readability",
    description: "Hardcoded numbers without named constants",
    severity: "low",
    detect: (files, content) => {
      const patterns: AntiPattern[] = [];
      for (const [file, fileContent] of content) {
        const magicNumbers = fileContent.match(/(?<!\w)\d{3,}(?!\w)/g);
        if (magicNumbers && magicNumbers.length > 5) {
          patterns.push({
            id: "ap-004",
            name: "Magic Numbers",
            category: "Readability",
            description: `Found ${magicNumbers.length} numeric literals`,
            severity: "low",
            location: file,
            suggestion: "Define named constants for magic numbers",
          });
        }
      }
      return patterns;
    },
  },
  {
    id: "ap-005",
    name: "Feature Envy",
    category: "Coupling",
    description:
      "A function that uses more data from other classes than its own",
    severity: "medium",
    detect: () => {
      // This would require deeper AST analysis - simplified placeholder
      return [];
    },
  },
];

// Helper: Extract imports from content
function extractImports(content: string): string[] {
  const imports: string[] = [];
  const es6ImportRegex = /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

// Analyze project structure
async function analyzeProject(projectPath: string): Promise<{
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
          if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go"].includes(ext)) {
            files.push(relativePath);
            try {
              content.set(relativePath, fs.readFileSync(fullPath, "utf-8"));
            } catch {
              // Skip unreadable
            }
          }
        }
      }
    } catch {
      // Skip inaccessible
    }
  }

  await scan(projectPath);
  return { files, content };
}

// Detect conflicts in architecture
function detectConflicts(
  files: string[],
  content: Map<string, string>,
): Conflict[] {
  const conflicts: Conflict[] = [];

  // Layer violation detection
  const uiFiles = files.filter(
    (f) => f.includes("/ui/") || f.includes("/components/"),
  );

  for (const uiFile of uiFiles) {
    const fileContent = content.get(uiFile);
    if (fileContent) {
      const imports = extractImports(fileContent);
      for (const imp of imports) {
        if (
          imp.includes("/db/") ||
          imp.includes("/database/") ||
          imp.includes("/models/")
        ) {
          conflicts.push({
            id: "conflict-001",
            type: "layer",
            description: `UI component directly imports from database layer: ${path.basename(uiFile)} imports ${imp}`,
            affectedFiles: [uiFile],
            resolution: "Use API/service layer between UI and database",
          });
        }
      }
    }
  }

  // Pattern conflict detection
  const componentFiles = files.filter((f) => f.includes("/components/"));
  const hasMixedPatterns =
    componentFiles.length > 0 &&
    files.some((f) => f.includes("/hooks/") || f.includes("/store/"));

  if (hasMixedPatterns) {
    conflicts.push({
      id: "conflict-002",
      type: "pattern",
      description:
        "Mixed state management patterns detected (components + hooks + store)",
      affectedFiles: componentFiles.slice(0, 5),
      resolution: "Standardize on a single state management approach",
    });
  }

  return conflicts;
}

// Analyze change impact
function analyzeImpact(
  files: string[],
  content: Map<string, string>,
): ImpactAnalysis[] {
  const analysis: ImpactAnalysis[] = [];
  const dependencyMap = new Map<string, Set<string>>();

  // Build dependency map
  for (const [file, fileContent] of content) {
    const imports = extractImports(fileContent);
    for (const imp of imports) {
      if (!dependencyMap.has(file)) {
        dependencyMap.set(file, new Set());
      }
      // Find matching file
      for (const f of files) {
        if (
          f.includes(imp.replace("@", "")) ||
          f.includes(imp.replace("./", "").replace("../", ""))
        ) {
          dependencyMap.get(file)!.add(f);
        }
      }
    }
  }

  // Analyze each file's impact
  for (const [file, deps] of dependencyMap) {
    const dependentCount = deps.size;
    let impactLevel: "high" | "medium" | "low" = "low";

    if (dependentCount > 10) impactLevel = "high";
    else if (dependentCount > 5) impactLevel = "medium";

    const cascadeRisk: string[] = [];
    if (dependentCount > 5) {
      cascadeRisk.push(`Changes may affect ${dependentCount} dependent files`);
    }

    // Check for critical dependencies
    const fileContent = content.get(file) || "";
    if (fileContent.includes("export") && dependentCount > 3) {
      cascadeRisk.push("Exported functions/classes may require version bumps");
    }

    analysis.push({
      file,
      impactLevel,
      dependents: dependentCount,
      cascadeRisk,
    });
  }

  // Sort by impact and return top results
  return analysis
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.impactLevel] - order[b.impactLevel];
    })
    .slice(0, 20);
}

// Detect architecture drift
function detectDrift(
  files: string[],
  _content: Map<string, string>,
): ArchitectureDrift[] {
  const drifts: ArchitectureDrift[] = [];

  // Check for inconsistent structure

  // Detect mixed patterns
  const hasLayered = files.some(
    (f) => f.includes("/layers/") || f.includes("/presentation/"),
  );
  const hasDDD = files.some(
    (f) => f.includes("/domain/") || f.includes("/features/"),
  );

  if (hasLayered && hasDDD) {
    drifts.push({
      pattern: "Architecture Pattern",
      expected: "Single consistent pattern (layered OR DDD)",
      actual: "Mixed layered and domain-driven patterns",
      driftSeverity: "high",
      affectedAreas: ["Directory structure"],
    });
  }

  // Check for inconsistent naming
  const componentFiles = files.filter((f) => f.includes("/components/"));
  const namingStyles = new Set<string>();
  for (const f of componentFiles) {
    const base = path.basename(f);
    if (/^[A-Z]/.test(base)) namingStyles.add("PascalCase");
    if (/^[a-z]/.test(base)) namingStyles.add("camelCase");
    if (/-/.test(base)) namingStyles.add("kebab-case");
  }

  if (namingStyles.size > 1) {
    drifts.push({
      pattern: "Naming Convention",
      expected: "Consistent naming within component directories",
      actual: `Multiple naming styles: ${[...namingStyles].join(", ")}`,
      driftSeverity: "medium",
      affectedAreas: componentFiles.slice(0, 10),
    });
  }

  // Check for unorganized utils
  const utilFiles = files.filter(
    (f) => f.includes("/utils/") || f.includes("/helpers/"),
  );
  if (utilFiles.length > 20) {
    drifts.push({
      pattern: "Code Organization",
      expected: "Utils organized by domain/purpose",
      actual: `Large number of utility files: ${utilFiles.length}`,
      driftSeverity: "medium",
      affectedAreas: utilFiles.slice(0, 10),
    });
  }

  return drifts;
}

// Generate Architecture Decision Records
function generateAdr(
  files: string[],
  _content: Map<string, string>,
): ArchitectureDecision[] {
  const decisions: ArchitectureDecision[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Detect key architectural decisions
  const hasTs = files.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  if (hasTs) {
    decisions.push({
      id: "ADR-001",
      title: "Use TypeScript for type safety",
      status: "accepted",
      date: today,
      context: "Project requires type safety and better developer experience",
      decision: "Adopt TypeScript as the primary language for all source files",
      consequences: [
        "Improved type checking at compile time",
        "Better IDE support and autocompletion",
        "Slightly longer initial development time",
      ],
    });
  }

  const hasReact = files.some((f) => f.includes("react") || f.includes("next"));
  if (hasReact) {
    decisions.push({
      id: "ADR-002",
      title: "Use React for UI development",
      status: "accepted",
      date: today,
      context: "Need a component-based UI framework",
      decision: "Use React (or Next.js) as the primary UI framework",
      consequences: [
        "Component reusability",
        "Large ecosystem of libraries",
        "Strong community support",
      ],
    });
  }

  const hasDatabase = files.some(
    (f) =>
      f.includes("/db/") || f.includes("/database/") || f.includes("/models/"),
  );
  if (hasDatabase) {
    decisions.push({
      id: "ADR-003",
      title: "Database layer architecture",
      status: "accepted",
      date: today,
      context: "Project requires data persistence",
      decision: "Implement database layer with ORM patterns",
      consequences: [
        "Centralized data access",
        "Migration support",
        "Type-safe database queries",
      ],
    });
  }

  return decisions;
}

// Main validation function
async function validateArchitecture(
  args: ArchitectureValidatorArgs,
  ctx: AgentContext,
): Promise<ValidationReport> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Architecture Validator">Analyzing project structure...</dyad-status>`,
  );

  const { files, content } = await analyzeProject(projectPath);

  ctx.onXmlStream(
    `<dyad-status title="Architecture Validator">Running ${files.length} validation checks...</dyad-status>`,
  );

  const validationTypes =
    args.validationTypes.includes("all") || args.validationTypes.length === 0
      ? ["best-practices", "anti-patterns", "conflicts", "impact", "drift"]
      : args.validationTypes;

  const bestPractices: BestPractice[] = [];
  const antiPatterns: AntiPattern[] = [];
  const conflicts: Conflict[] = [];
  const impactAnalysis: ImpactAnalysis[] = [];
  const architectureDrift: ArchitectureDrift[] = [];
  const architectureDecisions: ArchitectureDecision[] = [];

  // Run selected validations
  if (validationTypes.includes("best-practices")) {
    for (const bp of BEST_PRACTICES) {
      const result = bp.check(files, content);
      bestPractices.push({
        ...bp,
        passed: result.passed,
        location: result.location,
        suggestion: result.suggestion,
      });
    }
  }

  if (validationTypes.includes("anti-patterns")) {
    for (const ap of ANTI_PATTERNS) {
      const patterns = ap.detect(files, content);
      antiPatterns.push(...patterns);
    }
  }

  if (validationTypes.includes("conflicts")) {
    conflicts.push(...detectConflicts(files, content));
  }

  if (validationTypes.includes("impact")) {
    impactAnalysis.push(...analyzeImpact(files, content));
  }

  if (validationTypes.includes("drift")) {
    architectureDrift.push(...detectDrift(files, content));
  }

  if (args.generateAdr || validationTypes.includes("adr")) {
    architectureDecisions.push(...generateAdr(files, content));
  }

  // Calculate summary
  const totalChecks = bestPractices.length;
  const passedChecks = bestPractices.filter((bp) => bp.passed).length;
  const failedChecks = totalChecks - passedChecks;
  const criticalIssues =
    antiPatterns.filter((ap) => ap.severity === "critical").length +
    bestPractices.filter((bp) => !bp.passed && bp.severity === "critical")
      .length;

  const healthScore =
    Math.round((passedChecks / totalChecks) * 100) -
    Math.min(20, criticalIssues * 5);

  return {
    bestPractices,
    antiPatterns,
    conflicts,
    impactAnalysis,
    architectureDrift,
    architectureDecisions,
    summary: {
      totalChecks,
      passedChecks,
      failedChecks,
      criticalIssues,
      overallHealth: Math.max(0, Math.min(100, healthScore)),
    },
  };
}

// Generate XML report
function generateValidationXml(report: ValidationReport): string {
  const lines: string[] = [
    `# Architecture Validation Report`,
    ``,
    `## Summary`,
    `- **Overall Health**: ${report.summary.overallHealth}/100`,
    `- **Checks Passed**: ${report.summary.passedChecks}/${report.summary.totalChecks}`,
    `- **Critical Issues**: ${report.summary.criticalIssues}`,
    ``,
  ];

  // Best Practices Results
  if (report.bestPractices.length > 0) {
    lines.push(`## ✅ Best Practices`);
    for (const bp of report.bestPractices) {
      const status = bp.passed ? "✓" : "✗";
      const severity = bp.passed ? "" : `[${bp.severity.toUpperCase()}]`;
      lines.push(`- ${status} ${bp.title} ${severity}`);
      if (!bp.passed && bp.suggestion) {
        lines.push(`  💡 ${bp.suggestion}`);
      }
    }
    lines.push(``);
  }

  // Anti-Patterns
  if (report.antiPatterns.length > 0) {
    lines.push(`## ⚠️ Anti-Patterns Detected`);
    const critical = report.antiPatterns.filter(
      (ap) => ap.severity === "critical",
    );
    const high = report.antiPatterns.filter((ap) => ap.severity === "high");

    for (const ap of [...critical, ...high].slice(0, 10)) {
      lines.push(`- **${ap.name}** [${ap.severity}]`);
      lines.push(`  ${ap.description}`);
      lines.push(`  📍 ${ap.location}`);
      lines.push(`  💡 ${ap.suggestion}`);
    }
    lines.push(``);
  }

  // Conflicts
  if (report.conflicts.length > 0) {
    lines.push(`## 🔄 Architecture Conflicts`);
    for (const conflict of report.conflicts.slice(0, 5)) {
      lines.push(`- **${conflict.type}**: ${conflict.description}`);
      if (conflict.resolution) {
        lines.push(`  💡 Resolution: ${conflict.resolution}`);
      }
    }
    lines.push(``);
  }

  // Impact Analysis
  if (report.impactAnalysis.length > 0) {
    lines.push(`## 📊 Change Impact Analysis`);
    const highImpact = report.impactAnalysis.filter(
      (ia) => ia.impactLevel === "high",
    );
    for (const ia of highImpact.slice(0, 5)) {
      lines.push(
        `- **${path.basename(ia.file)}** [${ia.impactLevel.toUpperCase()}]`,
      );
      lines.push(`  ${ia.dependents} dependent files`);
      for (const risk of ia.cascadeRisk) {
        lines.push(`  ⚠️ ${risk}`);
      }
    }
    lines.push(``);
  }

  // Architecture Drift
  if (report.architectureDrift.length > 0) {
    lines.push(`## 📉 Architecture Drift`);
    for (const drift of report.architectureDrift) {
      lines.push(`- **${drift.pattern}**: ${drift.actual}`);
      lines.push(`  Expected: ${drift.expected}`);
      lines.push(`  Severity: ${drift.driftSeverity}`);
    }
    lines.push(``);
  }

  // Architecture Decision Records
  if (report.architectureDecisions.length > 0) {
    lines.push(`## 📋 Architecture Decision Records`);
    for (const adr of report.architectureDecisions) {
      lines.push(`### ${adr.id}: ${adr.title}`);
      lines.push(`- **Status**: ${adr.status}`);
      lines.push(`- **Date**: ${adr.date}`);
      lines.push(`- **Context**: ${adr.context}`);
      lines.push(`- **Decision**: ${adr.decision}`);
    }
  }

  return lines.join("\n");
}

export const architectureValidatorTool: ToolDefinition<ArchitectureValidatorArgs> =
  {
    name: "architecture_validator",
    description:
      "Validate architecture against best practices, detect anti-patterns, analyze change impact, detect architecture drift, and generate Architecture Decision Records (ADRs).",
    inputSchema: ArchitectureValidatorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const report = await validateArchitecture(args, ctx);

      const reportXml = generateValidationXml(report);

      ctx.onXmlComplete(
        `<dyad-status title="Architecture Validation Complete">Health: ${report.summary.overallHealth}/100</dyad-status>`,
      );

      return reportXml;
    },
  };

// ============================================================================
// Architecture Health Evaluation Tool (Capability 371)
// ============================================================================

const EvaluateHealthArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Evaluation dimensions */
  dimensions: z
    .enum(["all", "modularity", "testability", "maintainability", "scalability", "security", "performance"])
    .array()
    .default(["all"]),
  /** Include recommendations */
  includeRecommendations: z.boolean().default(true),
});

type EvaluateHealthArgs = z.infer<typeof EvaluateHealthArgs>;

interface HealthDimension {
  name: string;
  score: number;
  factors: { name: string; score: number; weight: number }[];
  recommendations: string[];
}

interface HealthReport {
  overallScore: number;
  grade: string;
  dimensions: HealthDimension[];
  summary: {
    strengths: string[];
    weaknesses: string[];
    nextSteps: string[];
  };
}

function evaluateArchitectureHealth(
  files: string[],
  content: Map<string, string>,
  dimensions: string[],
): HealthReport {
  const healthDimensions: HealthDimension[] = [];

  // Modularity score
  if (dimensions.includes("all") || dimensions.includes("modularity")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    // File organization
    const hasSrc = files.some((f) => f.includes("/src/"));
    const hasComponents = files.some((f) => f.includes("/components/") || f.includes("/ui/"));
    const hasUtils = files.some((f) => f.includes("/utils/") || f.includes("/helpers/"));
    const modularity = (hasSrc ? 25 : 0) + (hasComponents ? 25 : 0) + (hasUtils ? 25 : 0) + (files.length > 20 ? 25 : 0);
    factors.push({ name: "File Organization", score: modularity, weight: 0.4 });

    // Directory depth
    const maxDepth = Math.max(...files.map((f) => f.split("/").length));
    const depthScore = maxDepth <= 4 ? 100 : maxDepth <= 6 ? 70 : 40;
    factors.push({ name: "Directory Depth", score: depthScore, weight: 0.3 });

    // Module cohesion (files per directory)
    const dirs = new Set(files.map((f) => path.dirname(f)));
    const avgFilesPerDir = files.length / Math.max(dirs.size, 1);
    const cohesionScore = avgFilesPerDir <= 10 ? 100 : avgFilesPerDir <= 20 ? 70 : 40;
    factors.push({ name: "Module Cohesion", score: cohesionScore, weight: 0.3 });

    const modularityScore = Math.round(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0),
    );

    healthDimensions.push({
      name: "Modularity",
      score: modularityScore,
      factors,
      recommendations: modularityScore < 70 ? ["Consider restructuring into clearer module boundaries", "Reduce directory nesting depth"] : [],
    });
  }

  // Testability score
  if (dimensions.includes("all") || dimensions.includes("testability")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    const testFiles = files.filter(
      (f) => f.includes("/__tests__/") || f.includes("/test/") || f.includes(".spec.") || f.includes(".test."),
    );
    const sourceFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const testCoverage = sourceFiles.length > 0 ? (testFiles.length / sourceFiles.length) * 100 : 0;
    factors.push({ name: "Test File Coverage", score: Math.min(testCoverage, 100), weight: 0.5 });

    // Check for test utilities
    const hasTestUtils = files.some((f) => f.includes("test") && (f.includes("utils") || f.includes("setup")));
    factors.push({ name: "Test Utilities", score: hasTestUtils ? 100 : 30, weight: 0.2 });

    // Mock usage
    let hasMocks = false;
    for (const [, fileContent] of content) {
      if (fileContent.includes("mock") || fileContent.includes("jest.fn")) {
        hasMocks = true;
        break;
      }
    }
    factors.push({ name: "Mock Usage", score: hasMocks ? 100 : 50, weight: 0.3 });

    const testabilityScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));

    healthDimensions.push({
      name: "Testability",
      score: testabilityScore,
      factors,
      recommendations: testabilityScore < 60 ? ["Add more test files", "Create test utilities and setup"] : [],
    });
  }

  // Maintainability score
  if (dimensions.includes("all") || dimensions.includes("maintainability")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    // Average file size
    const avgSize = Array.from(content.values()).reduce((sum, c) => sum + c.length, 0) / Math.max(content.size, 1);
    const sizeScore = avgSize < 3000 ? 100 : avgSize < 5000 ? 70 : 40;
    factors.push({ name: "Average File Size", score: sizeScore, weight: 0.3 });

    // Documentation
    const hasReadme = files.some((f) => f.toLowerCase().includes("readme"));
    const hasDocs = files.some((f) => f.includes("/docs/") || f.includes("/.doc"));
    const docScore = hasReadme ? 50 : 20 + (hasDocs ? 30 : 0);
    factors.push({ name: "Documentation", score: docScore, weight: 0.3 });

    // Code complexity (simplified)
    let totalComplexity = 0;
    for (const [, fileContent] of content) {
      totalComplexity += (fileContent.match(/\bif\b|\bfor\b|\bwhile\b|\bswitch\b/g) || []).length;
    }
    const complexityScore = totalComplexity / Math.max(content.size, 1) < 20 ? 100 : totalComplexity / Math.max(content.size, 1) < 40 ? 70 : 40;
    factors.push({ name: "Code Complexity", score: complexityScore, weight: 0.4 });

    const maintainabilityScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));

    healthDimensions.push({
      name: "Maintainability",
      score: maintainabilityScore,
      factors,
      recommendations: maintainabilityScore < 60 ? ["Reduce file sizes by splitting modules", "Add README and documentation"] : [],
    });
  }

  // Scalability score
  if (dimensions.includes("all") || dimensions.includes("scalability")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    // Dependency management
    let hasPackageJson = false;
    let depsCount = 0;
    for (const file of files) {
      if (file.includes("package.json")) {
        hasPackageJson = true;
        try {
          const pkg = JSON.parse(content.get(file) || "{}");
          depsCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
        } catch {
          // Ignore parse errors
        }
        break;
      }
    }
    const depScore = hasPackageJson ? (depsCount < 50 ? 100 : depsCount < 100 ? 70 : 40) : 50;
    factors.push({ name: "Dependency Management", score: depScore, weight: 0.4 });

    // Configuration patterns
    const hasEnvConfig = files.some((f) => f.includes(".env") || f.includes("/config/"));
    factors.push({ name: "Configuration", score: hasEnvConfig ? 100 : 40, weight: 0.3 });

    // Feature flags support (simplified check)
    let hasFeatureFlags = false;
    for (const [, fileContent] of content) {
      if (/feature[_-]?flag|feature[_-]?toggle/i.test(fileContent)) {
        hasFeatureFlags = true;
        break;
      }
    }
    factors.push({ name: "Feature Flags", score: hasFeatureFlags ? 100 : 30, weight: 0.3 });

    const scalabilityScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));

    healthDimensions.push({
      name: "Scalability",
      score: scalabilityScore,
      factors,
      recommendations: scalabilityScore < 60 ? ["Consider implementing feature flags", "Review dependency count"] : [],
    });
  }

  // Security score
  if (dimensions.includes("all") || dimensions.includes("security")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    // Secrets detection
    let hasHardcodedSecrets = false;
    for (const [, fileContent] of content) {
      if (/api[_-]?key|password|secret|token/i.test(fileContent)) {
        if (!/example|your_[a-z_]+|replace|xxx|placeholder/i.test(fileContent)) {
          hasHardcodedSecrets = true;
          break;
        }
      }
    }
    factors.push({ name: "No Hardcoded Secrets", score: hasHardcodedSecrets ? 20 : 100, weight: 0.5 });

    // Input validation
    let hasValidation = false;
    for (const [, fileContent] of content) {
      if (/validate|sanitize|escape|encode/i.test(fileContent)) {
        hasValidation = true;
        break;
      }
    }
    factors.push({ name: "Input Validation", score: hasValidation ? 100 : 40, weight: 0.3 });

    // TypeScript usage
    const tsFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")).length;
    const tsScore = tsFiles / Math.max(files.length, 1) > 0.7 ? 100 : tsFiles / Math.max(files.length, 1) > 0.4 ? 70 : 40;
    factors.push({ name: "Type Safety", score: tsScore, weight: 0.2 });

    const securityScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));

    healthDimensions.push({
      name: "Security",
      score: securityScore,
      factors,
      recommendations: securityScore < 60 ? ["Remove hardcoded secrets", "Add input validation"] : [],
    });
  }

  // Performance score
  if (dimensions.includes("all") || dimensions.includes("performance")) {
    const factors: { name: string; score: number; weight: number }[] = [];

    // Bundle size indicators
    const bundleFiles = files.filter((f) => f.includes("bundle") || f.includes("dist"));
    factors.push({ name: "Bundle Configuration", score: bundleFiles.length > 0 ? 100 : 50, weight: 0.4 });

    // Code optimization patterns
    let hasOptimization = false;
    for (const [, fileContent] of content) {
      if (/memo|lazy|code-splitting|cache/i.test(fileContent)) {
        hasOptimization = true;
        break;
      }
    }
    factors.push({ name: "Optimization Patterns", score: hasOptimization ? 100 : 40, weight: 0.3 });

    // Async patterns
    let hasAsync = false;
    for (const [, fileContent] of content) {
      if (/async|await|Promise/i.test(fileContent)) {
        hasAsync = true;
        break;
      }
    }
    factors.push({ name: "Async/Await Usage", score: hasAsync ? 100 : 50, weight: 0.3 });

    const performanceScore = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0));

    healthDimensions.push({
      name: "Performance",
      score: performanceScore,
      factors,
      recommendations: performanceScore < 60 ? ["Add code splitting and lazy loading", "Implement caching strategies"] : [],
    });
  }

  // Calculate overall score
  const overallScore = Math.round(
    healthDimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(healthDimensions.length, 1),
  );

  // Determine grade
  let grade: string;
  if (overallScore >= 90) grade = "A";
  else if (overallScore >= 80) grade = "B";
  else if (overallScore >= 70) grade = "C";
  else if (overallScore >= 60) grade = "D";
  else grade = "F";

  // Generate summary
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const nextSteps: string[] = [];

  for (const dim of healthDimensions) {
    if (dim.score >= 80) {
      strengths.push(`${dim.name}: ${dim.score}%`);
    } else if (dim.score < 60) {
      weaknesses.push(`${dim.name}: ${dim.score}%`);
      nextSteps.push(...dim.recommendations);
    }
  }

  return {
    overallScore,
    grade,
    dimensions: healthDimensions,
    summary: {
      strengths,
      weaknesses,
      nextSteps: [...new Set(nextSteps)].slice(0, 5),
    },
  };
}

function generateHealthXml(report: HealthReport): string {
  const lines: string[] = [
    `# Architecture Health Report`,
    "",
    `## Overall Score: **${report.overallScore}/100** (Grade: ${report.grade})`,
    "",
  ];

  lines.push("## Dimension Scores");
  for (const dim of report.dimensions) {
    const bar = "█".repeat(Math.round(dim.score / 10)) + "░".repeat(10 - Math.round(dim.score / 10));
    lines.push(`- **${dim.name}**: ${bar} ${dim.score}%`);
  }
  lines.push("");

  if (report.summary.strengths.length > 0) {
    lines.push("## ✅ Strengths");
    for (const s of report.summary.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (report.summary.weaknesses.length > 0) {
    lines.push("## ⚠️ Areas for Improvement");
    for (const w of report.summary.weaknesses) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  if (report.summary.nextSteps.length > 0) {
    lines.push("## 🎯 Recommended Next Steps");
    for (const step of report.summary.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join("\n");
}

async function evaluateHealthExecute(args: EvaluateHealthArgs, ctx: AgentContext): Promise<string> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Architecture Health Evaluation">Analyzing architecture...</dyad-status>`,
  );

  const { files, content } = await analyzeProject(projectPath);
  const healthReport = evaluateArchitectureHealth(files, content, args.dimensions);

  const reportXml = generateHealthXml(healthReport);

  ctx.onXmlComplete(
    `<dyad-status title="Health Evaluation Complete">Score: ${healthReport.overallScore}/100 (${healthReport.grade})</dyad-status>`,
  );

  return reportXml;
}

export const evaluateHealthTool: ToolDefinition<EvaluateHealthArgs> = {
  name: "evaluate_health",
  description:
    "Evaluate overall architecture health across multiple dimensions: modularity, testability, maintainability, scalability, security, and performance.",
  inputSchema: EvaluateHealthArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => evaluateHealthExecute(args, ctx),
};

// ============================================================================
// Architecture Benchmarking Tool (Capability 372)
// ============================================================================

const BenchmarkArchArgs = z.object({
  /** Path to the project to benchmark */
  projectPath: z.string().optional(),
  /** Comparison type */
  comparisonType: z.enum(["standards", "best-practices", "similar-projects"]).default("standards"),
  /** Metrics to benchmark */
  metrics: z
    .enum(["all", "size", "complexity", "coupling", "cohesion", "documentation"])
    .array()
    .default(["all"]),
});

type BenchmarkArchArgs = z.infer<typeof BenchmarkArchArgs>;

interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
  rating: "excellent" | "good" | "average" | "poor";
  comparison: string;
}

interface BenchmarkReport {
  projectName: string;
  metrics: BenchmarkMetric[];
  summary: string;
  recommendationsText: string;
}

// Industry benchmarks (simplified)
const BENCHMARKS = {
  avgFileSize: { excellent: 1500, good: 3000, average: 5000 },
  maxFileSize: { excellent: 3000, good: 5000, average: 8000 },
  complexity: { excellent: 10, good: 20, average: 35 },
  coupling: { excellent: 5, good: 10, average: 15 },
  cohesion: { excellent: 80, good: 60, average: 40 },
  docCoverage: { excellent: 70, good: 50, average: 30 },
  testCoverage: { excellent: 80, good: 60, average: 40 },
};

function benchmarkArchitecture(
  projectPath: string,
  files: string[],
  content: Map<string, string>,
  metrics: string[],
): BenchmarkReport {
  const benchmarkMetrics: BenchmarkMetric[] = [];

  const projectName = path.basename(projectPath);

  // Size metrics
  if (metrics.includes("all") || metrics.includes("size")) {
    const avgSize = Array.from(content.values()).reduce((sum, c) => sum + c.length, 0) / Math.max(content.size, 1);
    const maxSize = Math.max(...Array.from(content.values()).map((c) => c.length));

    benchmarkMetrics.push({
      name: "Average File Size",
      value: Math.round(avgSize),
      unit: "bytes",
      rating: avgSize < BENCHMARKS.avgFileSize.excellent ? "excellent" : avgSize < BENCHMARKS.avgFileSize.good ? "good" : avgSize < BENCHMARKS.avgFileSize.average ? "average" : "poor",
      comparison: `Industry avg: ${BENCHMARKS.avgFileSize.good} bytes`,
    });

    benchmarkMetrics.push({
      name: "Max File Size",
      value: maxSize,
      unit: "bytes",
      rating: maxSize < BENCHMARKS.maxFileSize.excellent ? "excellent" : maxSize < BENCHMARKS.maxFileSize.good ? "good" : maxSize < BENCHMARKS.maxFileSize.average ? "average" : "poor",
      comparison: `Industry max: ${BENCHMARKS.maxFileSize.good} bytes`,
    });

    benchmarkMetrics.push({
      name: "Total Files",
      value: files.length,
      unit: "files",
      rating: files.length < 100 ? "excellent" : files.length < 300 ? "good" : files.length < 500 ? "average" : "poor",
      comparison: "Similar projects: 50-200 files",
    });
  }

  // Complexity metrics
  if (metrics.includes("all") || metrics.includes("complexity")) {
    let totalComplexity = 0;
    let maxComplexity = 0;
    for (const [, fileContent] of content) {
      const complexity = (fileContent.match(/\bif\b|\bfor\b|\bwhile\b|\bswitch\b|\bcatch\b/g) || []).length;
      totalComplexity += complexity;
      maxComplexity = Math.max(maxComplexity, complexity);
    }
    const avgComplexity = totalComplexity / Math.max(content.size, 1);

    benchmarkMetrics.push({
      name: "Average Complexity",
      value: Math.round(avgComplexity * 10) / 10,
      unit: "statements",
      rating: avgComplexity < BENCHMARKS.complexity.excellent ? "excellent" : avgComplexity < BENCHMARKS.complexity.good ? "good" : avgComplexity < BENCHMARKS.complexity.average ? "average" : "poor",
      comparison: `Industry avg: ${BENCHMARKS.complexity.good}`,
    });

    benchmarkMetrics.push({
      name: "Max Complexity",
      value: maxComplexity,
      unit: "statements",
      rating: maxComplexity < 20 ? "excellent" : maxComplexity < 40 ? "good" : maxComplexity < 60 ? "average" : "poor",
      comparison: "Best practice: < 20",
    });
  }

  // Coupling metrics
  if (metrics.includes("all") || metrics.includes("coupling")) {
    let totalImports = 0;
    for (const [, fileContent] of content) {
      const imports = fileContent.match(/import\s+.*from/g);
      totalImports += imports ? imports.length : 0;
    }
    const avgImports = totalImports / Math.max(content.size, 1);

    benchmarkMetrics.push({
      name: "Average Imports",
      value: Math.round(avgImports * 10) / 10,
      unit: "imports/file",
      rating: avgImports < BENCHMARKS.coupling.excellent ? "excellent" : avgImports < BENCHMARKS.coupling.good ? "good" : avgImports < BENCHMARKS.coupling.average ? "average" : "poor",
      comparison: `Best practice: < ${BENCHMARKS.coupling.excellent}`,
    });
  }

  // Cohesion metrics
  if (metrics.includes("all") || metrics.includes("cohesion")) {
    const dirs = new Set(files.map((f) => path.dirname(f)));
    const avgFilesPerDir = files.length / Math.max(dirs.size, 1);
    const cohesionScore = Math.max(0, Math.min(100, 100 - avgFilesPerDir * 2));

    benchmarkMetrics.push({
      name: "Module Cohesion",
      value: Math.round(cohesionScore),
      unit: "%",
      rating: cohesionScore >= BENCHMARKS.cohesion.excellent ? "excellent" : cohesionScore >= BENCHMARKS.cohesion.good ? "good" : cohesionScore >= BENCHMARKS.cohesion.average ? "average" : "poor",
      comparison: `Best practice: > ${BENCHMARKS.cohesion.excellent}%`,
    });
  }

  // Documentation metrics
  if (metrics.includes("all") || metrics.includes("documentation")) {
    let documentedExports = 0;
    let totalExports = 0;
    for (const [, fileContent] of content) {
      const exports = fileContent.match(/export\s+(?:function|class|const|interface|type)/g) || [];
      const jsdocs = fileContent.match(/\/\*\*[\s\S]*?\*\//g) || [];
      totalExports += exports.length;
      documentedExports += Math.min(exports.length, jsdocs.length);
    }
    const docCoverage = totalExports > 0 ? (documentedExports / totalExports) * 100 : 0;

    benchmarkMetrics.push({
      name: "Documentation Coverage",
      value: Math.round(docCoverage),
      unit: "%",
      rating: docCoverage >= BENCHMARKS.docCoverage.excellent ? "excellent" : docCoverage >= BENCHMARKS.docCoverage.good ? "good" : docCoverage >= BENCHMARKS.docCoverage.average ? "average" : "poor",
      comparison: `Best practice: > ${BENCHMARKS.docCoverage.excellent}%`,
    });

    // Test coverage estimate
    const testFiles = files.filter((f) => f.includes("test") || f.includes("spec"));
    const testCoverage = files.length > 0 ? (testFiles.length / files.length) * 100 : 0;

    benchmarkMetrics.push({
      name: "Test Coverage",
      value: Math.round(testCoverage),
      unit: "%",
      rating: testCoverage >= BENCHMARKS.testCoverage.excellent ? "excellent" : testCoverage >= BENCHMARKS.testCoverage.good ? "good" : testCoverage >= BENCHMARKS.testCoverage.average ? "average" : "poor",
      comparison: `Best practice: > ${BENCHMARKS.testCoverage.excellent}%`,
    });
  }

  // Generate summary
  const excellent = benchmarkMetrics.filter((m) => m.rating === "excellent").length;
  const good = benchmarkMetrics.filter((m) => m.rating === "good").length;
  const average = benchmarkMetrics.filter((m) => m.rating === "average").length;
  const poor = benchmarkMetrics.filter((m) => m.rating === "poor").length;

  let summary: string;
  if (poor > 2) {
    summary = "This project needs significant architectural improvements.";
  } else if (average > good) {
    summary = "This project is on par with industry standards but has room for improvement.";
  } else if (good > average) {
    summary = "This project exceeds typical industry standards.";
  } else {
    summary = "This project is well-structured and follows best practices.";
  }

  // Generate recommendations
  const recommendations: string[] = [];
  for (const metric of benchmarkMetrics) {
    if (metric.rating === "poor") {
      recommendations.push(`Improve ${metric.name.toLowerCase()} (currently ${metric.rating})`);
    }
  }

  return {
    projectName,
    metrics: benchmarkMetrics,
    summary,
    recommendationsText: recommendations
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n"),
  };
}

function generateBenchmarkXml(report: BenchmarkReport): string {
  const ratingEmoji: Record<string, string> = {
    excellent: "🟢",
    good: "🟡",
    average: "🟠",
    poor: "🔴",
  };

  const lines: string[] = [
    `# Architecture Benchmark Report`,
    "",
    `**Project:** ${report.projectName}`,
    "",
    report.summary,
    "",
  ];

  lines.push("## Metrics Comparison");
  for (const metric of report.metrics) {
    lines.push(`### ${metric.name}`);
    lines.push(`- **Value:** ${metric.value} ${metric.unit}`);
    lines.push(`- **Rating:** ${ratingEmoji[metric.rating]} ${metric.rating.charAt(0).toUpperCase() + metric.rating.slice(1)}`);
    lines.push(`- **Comparison:** ${metric.comparison}`);
    lines.push("");
  }

  if (report.recommendationsText) {
    lines.push("## Recommendations");
    lines.push(report.recommendationsText);
  }

  return lines.join("\n");
}

async function benchmarkArchExecute(args: BenchmarkArchArgs, ctx: AgentContext): Promise<string> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Architecture Benchmarking">Comparing against benchmarks...</dyad-status>`,
  );

  const { files, content } = await analyzeProject(projectPath);
  const benchmarkReport = benchmarkArchitecture(projectPath, files, content, args.metrics);

  const reportXml = generateBenchmarkXml(benchmarkReport);

  ctx.onXmlComplete(
    `<dyad-status title="Benchmarking Complete">${benchmarkReport.metrics.length} metrics analyzed</dyad-status>`,
  );

  return reportXml;
}

export const benchmarkArchTool: ToolDefinition<BenchmarkArchArgs> = {
  name: "benchmark_arch",
  description:
    "Benchmark architecture against industry standards and best practices. Compare metrics like file size, complexity, coupling, cohesion, and documentation coverage.",
  inputSchema: BenchmarkArchArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => benchmarkArchExecute(args, ctx),
};
