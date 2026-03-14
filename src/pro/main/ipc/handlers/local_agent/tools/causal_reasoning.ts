/**
 * Causal Reasoning Tool
 * Capabilities 23-24, 30: Analyze cause-effect relationships and detect conflicts
 * - Causal analysis
 * - Trace logical dependencies
 * - Detect reasoning conflicts
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const CausalReasoningArgs = z.object({
  /** The statement or code to analyze for causality */
  statement: z.string().min(1),
  /** Type of analysis to perform */
  analysisType: z
    .enum(["causal", "dependencies", "conflicts", "all"])
    .default("all"),
  /** Optional context for the analysis */
  context: z.string().optional(),
  /** Maximum depth for dependency tracing */
  maxDepth: z.number().min(1).max(10).default(3),
});

type CausalReasoningArgs = z.infer<typeof CausalReasoningArgs>;

// ============================================================================
// Types
// ============================================================================

/** A cause-effect relationship */
interface CausalLink {
  cause: string;
  effect: string;
  strength: "strong" | "medium" | "weak";
  type: "direct" | "indirect" | "conditional";
  explanation: string;
}

/** A traced dependency */
interface Dependency {
  id: string;
  name: string;
  type: "function" | "variable" | "module" | "import" | "data";
  dependsOn: string[];
  dependedBy: string[];
  location?: string;
  isExternal: boolean;
}

/** A detected conflict */
interface Conflict {
  id: string;
  type: "contradiction" | "circular" | "inconsistency" | "deadlock";
  description: string;
  conflictingElements: string[];
  severity: "critical" | "major" | "minor";
  resolution?: string;
}

/** Causal analysis result */
interface CausalAnalysis {
  links: CausalLink[];
  rootCauses: string[];
  effects: string[];
  chain: string[];
}

/** Dependency trace result */
interface DependencyTrace {
  dependencies: Dependency[];
  graph: Record<string, string[]>;
  criticalPath: string[];
  externalDeps: string[];
}

/** Conflict detection result */
interface ConflictDetection {
  conflicts: Conflict[];
  summary: string;
  resolvedCount: number;
}

/** Complete causal reasoning result */
interface CausalReasoningResult {
  statement: string;
  causalAnalysis: CausalAnalysis | null;
  dependencyTrace: DependencyTrace | null;
  conflictDetection: ConflictDetection | null;
  metadata: {
    analysisType: string;
    depth: number;
  };
}

// ============================================================================
// Causal Analysis Logic
// ============================================================================

/** Identify cause-effect relationships in a statement */
function analyzeCausality(
  statement: string,
  _context?: string,
): CausalAnalysis {
  const links: CausalLink[] = [];
  const rootCauses: string[] = [];
  const effects: string[] = [];
  const chain: string[] = [];

  const lowerStatement = statement.toLowerCase();

  // Common cause-effect patterns
  const causalPatterns = [
    { cause: "error", effect: "crash", type: "direct" as const },
    { cause: "null", effect: "exception", type: "direct" as const },
    { cause: "async", effect: "await", type: "conditional" as const },
    { cause: "import", effect: "dependency", type: "direct" as const },
    { cause: "state", effect: "render", type: "indirect" as const },
    { cause: "props", effect: "component", type: "direct" as const },
    { cause: "api", effect: "request", type: "direct" as const },
    { cause: "database", effect: "query", type: "direct" as const },
    {
      cause: "authentication",
      effect: "authorization",
      type: "indirect" as const,
    },
    { cause: "cache", effect: "performance", type: "indirect" as const },
  ];

  // Check each pattern
  for (const pattern of causalPatterns) {
    if (lowerStatement.includes(pattern.cause)) {
      // Determine strength based on context
      let strength: "strong" | "medium" | "weak" = "medium";
      if (
        lowerStatement.includes("always") ||
        lowerStatement.includes("always causes")
      ) {
        strength = "strong";
      } else if (
        lowerStatement.includes("might") ||
        lowerStatement.includes("sometimes")
      ) {
        strength = "weak";
      }

      links.push({
        cause: pattern.cause,
        effect: pattern.effect,
        strength,
        type: pattern.type,
        explanation: `${pattern.cause} leads to ${pattern.effect}`,
      });

      if (!rootCauses.includes(pattern.cause)) {
        rootCauses.push(pattern.cause);
      }
      if (!effects.includes(pattern.effect)) {
        effects.push(pattern.effect);
      }
    }
  }

  // Build chain if multiple links found
  if (links.length > 1) {
    chain.push(links[0].cause);
    for (let i = 0; i < links.length; i++) {
      chain.push(links[i].effect);
    }
  }

  // Extract causes and effects from keywords
  const causeKeywords = [
    "because",
    "due to",
    "caused by",
    "since",
    "therefore",
    "leads to",
    "results in",
  ];

  for (const keyword of causeKeywords) {
    if (lowerStatement.includes(keyword)) {
      const idx = lowerStatement.indexOf(keyword);
      const before = statement.substring(Math.max(0, idx - 50), idx);

      if (before.trim() && !rootCauses.includes(before.trim())) {
        rootCauses.push(before.trim().split(" ").pop() || before.trim());
      }
    }
  }

  return { links, rootCauses, effects, chain };
}

// ============================================================================
// Dependency Tracing Logic
// ============================================================================

/** Trace dependencies in code or logical statements */
function traceDependencies(
  statement: string,
  _context?: string,
  _maxDepth: number = 3,
): DependencyTrace {
  const dependencies: Dependency[] = [];
  const graph: Record<string, string[]> = {};
  const externalDeps: string[] = [];

  // Parse imports/dependencies from code
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;

  const functionCallRegex = /(\w+)\s*\(/g;
  const variableRegex = /(?:const|let|var)\s+(\w+)\s*=/g;

  let match;

  // Extract imports
  while ((match = importRegex.exec(statement)) !== null) {
    const moduleName = match[1];
    const dep: Dependency = {
      id: `dep_${dependencies.length + 1}`,
      name: moduleName,
      type: "import",
      dependsOn: [],
      dependedBy: [],
      isExternal: !moduleName.startsWith(".") && !moduleName.startsWith("/"),
    };

    if (dep.isExternal) {
      externalDeps.push(moduleName);
    }

    dependencies.push(dep);
    graph[moduleName] = [];
  }

  // Extract function calls
  const functionCalls = new Set<string>();
  while ((match = functionCallRegex.exec(statement)) !== null) {
    const funcName = match[1];
    if (
      funcName !== "console" &&
      funcName !== "Math" &&
      funcName !== "JSON" &&
      funcName !== "Array" &&
      funcName !== "Object"
    ) {
      functionCalls.add(funcName);
    }
  }

  // Create function dependencies
  for (const funcName of functionCalls) {
    const dep: Dependency = {
      id: `dep_${dependencies.length + 1}`,
      name: funcName,
      type: "function",
      dependsOn: [],
      dependedBy: [],
      isExternal: false,
    };
    dependencies.push(dep);
    graph[funcName] = [];
  }

  // Extract variables
  while ((match = variableRegex.exec(statement)) !== null) {
    const varName = match[1];
    const dep: Dependency = {
      id: `dep_${dependencies.length + 1}`,
      name: varName,
      type: "variable",
      dependsOn: [],
      dependedBy: [],
      isExternal: false,
    };
    dependencies.push(dep);
    graph[varName] = [];
  }

  // Build dependency graph (simplified)
  for (let i = 0; i < dependencies.length; i++) {
    for (let j = i + 1; j < dependencies.length; j++) {
      // Check if dep[i] might depend on dep[j]
      const depI = dependencies[i];
      const depJ = dependencies[j];

      // Functions often depend on their imports
      if (depI.type === "function" && depJ.type === "import") {
        depI.dependsOn.push(depJ.name);
        graph[depI.name].push(depJ.name);
      }
    }
  }

  // Determine critical path (simplified - longest chain)
  const criticalPath: string[] = [];
  const visited = new Set<string>();

  function findLongestPath(node: string, path: string[]): void {
    if (visited.has(node)) return;
    visited.add(node);

    const deps = graph[node] || [];
    if (deps.length === 0) {
      if (path.length > criticalPath.length) {
        criticalPath.length = 0;
        criticalPath.push(...path);
      }
    } else {
      for (const dep of deps) {
        findLongestPath(dep, [...path, dep]);
      }
    }
  }

  // Start from external dependencies
  for (const extDep of externalDeps) {
    findLongestPath(extDep, [extDep]);
  }

  return {
    dependencies,
    graph,
    criticalPath: criticalPath.length > 0 ? criticalPath : externalDeps,
    externalDeps,
  };
}

// ============================================================================
// Conflict Detection Logic
// ============================================================================

/** Detect conflicts in reasoning or code */
function detectConflicts(
  statement: string,
  _context?: string,
): ConflictDetection {
  const conflicts: ConflictDetection["conflicts"] = [];

  const lowerStatement = statement.toLowerCase();

  // Detect circular dependencies
  const importMatches =
    statement.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || [];
  const requireMatches =
    statement.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];

  // Check for self-referential imports
  const allImports = [...importMatches, ...requireMatches];
  const moduleNames = allImports.map((m) => {
    const match =
      m.match(/from\s+['"]([^'"]+)['"]/) ||
      m.match(/require\s*\(\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  });

  for (const name of moduleNames) {
    if (name && statement.includes(name) && name.startsWith("./")) {
      // Check if file imports itself indirectly
      conflicts.push({
        id: `conflict_${conflicts.length + 1}`,
        type: "circular",
        description: `Potential circular dependency detected with module: ${name}`,
        conflictingElements: [name],
        severity: "major",
        resolution: "Review import structure and consider dependency injection",
      });
    }
  }

  // Detect contradictions in statements
  const contradictions = [
    { positive: "always", negative: "never", context: "mutually exclusive" },
    {
      positive: "required",
      negative: "optional",
      context: "conflicting requirements",
    },
    {
      positive: "synchronous",
      negative: "asynchronous",
      context: "different execution models",
    },
    { positive: "public", negative: "private", context: "access control" },
    { positive: "mutable", negative: "immutable", context: "state management" },
  ];

  for (const contra of contradictions) {
    if (
      lowerStatement.includes(contra.positive) &&
      lowerStatement.includes(contra.negative)
    ) {
      conflicts.push({
        id: `conflict_${conflicts.length + 1}`,
        type: "contradiction",
        description: `Contradiction detected: "${contra.positive}" and "${contra.negative}" are ${contra.context}`,
        conflictingElements: [contra.positive, contra.negative],
        severity: "critical",
        resolution: `Clarify whether ${contra.positive} or ${contra.negative} is correct`,
      });
    }
  }

  // Detect inconsistencies
  const hasAwaitWithoutAsync =
    /await\s+/.test(statement) && !/\basync\s+/.test(statement);
  const hasReturnWithoutFunction =
    /return\s+/.test(statement) && !/(function|=>)/.test(statement);

  if (hasAwaitWithoutAsync) {
    conflicts.push({
      id: `conflict_${conflicts.length + 1}`,
      type: "inconsistency",
      description: "'await' used without 'async' function",
      conflictingElements: ["await", "async"],
      severity: "major",
      resolution: "Add 'async' keyword to the containing function",
    });
  }

  if (hasReturnWithoutFunction) {
    conflicts.push({
      id: `conflict_${conflicts.length + 1}`,
      type: "inconsistency",
      description: "'return' statement outside of a function",
      conflictingElements: ["return", "function"],
      severity: "major",
      resolution: "Ensure return is inside a function body",
    });
  }

  // Detect potential deadlocks (async waiting patterns)
  if (/Promise\.all.*await.*Promise\.race/.test(statement)) {
    conflicts.push({
      id: `conflict_${conflicts.length + 1}`,
      type: "deadlock",
      description:
        "Potential deadlock pattern detected with Promise.all and Promise.race",
      conflictingElements: ["Promise.all", "Promise.race"],
      severity: "minor",
      resolution: "Review async execution order",
    });
  }

  // Summary
  const criticalCount = conflicts.filter(
    (c) => c.severity === "critical",
  ).length;
  const majorCount = conflicts.filter((c) => c.severity === "major").length;

  let summary = "No conflicts detected";
  if (conflicts.length > 0) {
    summary = `Found ${conflicts.length} conflict(s)`;
    if (criticalCount > 0) summary += ` (${criticalCount} critical)`;
    else if (majorCount > 0) summary += ` (${majorCount} major)`;
  }

  return {
    conflicts,
    summary,
    resolvedCount: 0,
  };
}

// ============================================================================
// Main Causal Reasoning Function
// ============================================================================

async function analyzeCausalReasoning(
  args: CausalReasoningArgs,
  _ctx: AgentContext,
): Promise<CausalReasoningResult> {
  const { statement, analysisType, context, maxDepth } = args;

  let causalAnalysis: CausalAnalysis | null = null;
  let dependencyTrace: DependencyTrace | null = null;
  let conflictDetection: ConflictDetection | null = null;

  // Run requested analyses
  if (analysisType === "causal" || analysisType === "all") {
    causalAnalysis = analyzeCausality(statement, context);
  }

  if (analysisType === "dependencies" || analysisType === "all") {
    dependencyTrace = traceDependencies(statement, context, maxDepth);
  }

  if (analysisType === "conflicts" || analysisType === "all") {
    conflictDetection = detectConflicts(statement, context);
  }

  return {
    statement: statement.substring(0, 200),
    causalAnalysis,
    dependencyTrace,
    conflictDetection,
    metadata: {
      analysisType,
      depth: maxDepth,
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateCausalReasoningXml(result: CausalReasoningResult): string {
  const lines: string[] = [
    `# Causal Reasoning Analysis`,
    ``,
    `**Statement:** ${result.statement.substring(0, 100)}${result.statement.length > 100 ? "..." : ""}`,
    `**Analysis Type:** ${result.metadata.analysisType}`,
    ``,
  ];

  // Causal Analysis
  if (result.causalAnalysis) {
    const ca = result.causalAnalysis;
    lines.push(`## 🔗 Causal Links`);

    if (ca.links.length === 0) {
      lines.push("No explicit causal links detected.");
    } else {
      for (const link of ca.links) {
        const strengthIcon =
          link.strength === "strong"
            ? "🔴"
            : link.strength === "medium"
              ? "🟡"
              : "🟢";
        lines.push(
          `- ${strengthIcon} **${link.cause}** → **${link.effect}** (${link.type})`,
        );
        lines.push(`  - ${link.explanation}`);
      }
    }
    lines.push(``);

    if (ca.rootCauses.length > 0) {
      lines.push(`## 🌱 Root Causes`);
      for (const cause of ca.rootCauses) {
        lines.push(`- ${cause}`);
      }
      lines.push(``);
    }

    if (ca.effects.length > 0) {
      lines.push(`## 💥 Effects`);
      for (const effect of ca.effects) {
        lines.push(`- ${effect}`);
      }
      lines.push(``);
    }

    if (ca.chain.length > 1) {
      lines.push(`## ⛓️ Causal Chain`);
      lines.push(ca.chain.join(" → "));
      lines.push(``);
    }
  }

  // Dependency Trace
  if (result.dependencyTrace) {
    const dt = result.dependencyTrace;
    lines.push(`## 📦 Dependencies`);

    if (dt.dependencies.length === 0) {
      lines.push("No dependencies detected.");
    } else {
      lines.push(`**Total:** ${dt.dependencies.length} dependencies`);
      lines.push(``);

      const byType = new Map<string, string[]>();
      for (const dep of dt.dependencies) {
        const list = byType.get(dep.type) || [];
        list.push(dep.name);
        byType.set(dep.type, list);
      }

      for (const [type, names] of byType) {
        lines.push(`### ${type}s`);
        for (const name of names) {
          const extBadge =
            name.startsWith("@") || name.includes("/") ? " [external]" : "";
          lines.push(`- ${name}${extBadge}`);
        }
        lines.push(``);
      }
    }

    if (dt.criticalPath.length > 0) {
      lines.push(`## 🎯 Critical Path`);
      lines.push(dt.criticalPath.join(" → "));
      lines.push(``);
    }

    if (dt.externalDeps.length > 0) {
      lines.push(`**External Dependencies:** ${dt.externalDeps.join(", ")}`);
      lines.push(``);
    }
  }

  // Conflict Detection
  if (result.conflictDetection) {
    const cd = result.conflictDetection;
    lines.push(`## ⚠️ Conflict Detection`);
    lines.push(`**Summary:** ${cd.summary}`);
    lines.push(``);

    if (cd.conflicts.length === 0) {
      lines.push("✅ No conflicts detected in the statement.");
    } else {
      const critical = cd.conflicts.filter((c) => c.severity === "critical");
      const major = cd.conflicts.filter((c) => c.severity === "major");
      const minor = cd.conflicts.filter((c) => c.severity === "minor");

      if (critical.length > 0) {
        lines.push(`### Critical (${critical.length})`);
        for (const conflict of critical) {
          lines.push(`- ❌ **${conflict.type}:** ${conflict.description}`);
          if (conflict.resolution) {
            lines.push(`  - Resolution: ${conflict.resolution}`);
          }
        }
        lines.push(``);
      }

      if (major.length > 0) {
        lines.push(`### Major (${major.length})`);
        for (const conflict of major) {
          lines.push(`- ⚠️ **${conflict.type}:** ${conflict.description}`);
          if (conflict.resolution) {
            lines.push(`  - Resolution: ${conflict.resolution}`);
          }
        }
        lines.push(``);
      }

      if (minor.length > 0) {
        lines.push(`### Minor (${minor.length})`);
        for (const conflict of minor) {
          lines.push(`- ℹ️ **${conflict.type}:** ${conflict.description}`);
        }
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions (Exported separately for each capability)
// ============================================================================

/** Tool: Causal Analysis (Capability 23) */
export const causalAnalysisTool: ToolDefinition<CausalReasoningArgs> = {
  name: "causal_analysis",
  description:
    "Analyze cause-effect relationships in code or statements. Identifies root causes, effects, and causal chains. Use this to understand why issues occur or how changes propagate.",
  inputSchema: CausalReasoningArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Causal Analysis">Analyzing causes and effects...</dyad-status>`,
    );

    const result = await analyzeCausalReasoning(
      { ...args, analysisType: "causal" },
      ctx,
    );

    const report = generateCausalReasoningXml(result);

    const causalLinks = result.causalAnalysis?.links.length || 0;
    ctx.onXmlComplete(
      `<dyad-status title="Causal Analysis Complete">${causalLinks} causal links found</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Trace Dependencies (Capability 24) */
export const traceDependenciesTool: ToolDefinition<CausalReasoningArgs> = {
  name: "trace_dependencies",
  description:
    "Trace logical dependencies in code including imports, functions, variables, and modules. Builds a dependency graph and identifies critical paths. Use this to understand code relationships.",
  inputSchema: CausalReasoningArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Dependency Tracing">Tracing dependencies...</dyad-status>`,
    );

    const result = await analyzeCausalReasoning(
      { ...args, analysisType: "dependencies" },
      ctx,
    );

    const report = generateCausalReasoningXml(result);

    const deps = result.dependencyTrace?.dependencies.length || 0;
    ctx.onXmlComplete(
      `<dyad-status title="Dependency Tracing Complete">${deps} dependencies traced</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Detect Conflicts (Capability 30) */
export const detectConflictsTool: ToolDefinition<CausalReasoningArgs> = {
  name: "detect_conflicts",
  description:
    "Detect reasoning conflicts in code or statements including contradictions, circular dependencies, inconsistencies, and potential deadlocks. Use this to find issues before they cause problems.",
  inputSchema: CausalReasoningArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Conflict Detection">Detecting conflicts...</dyad-status>`,
    );

    const result = await analyzeCausalReasoning(
      { ...args, analysisType: "conflicts" },
      ctx,
    );

    const report = generateCausalReasoningXml(result);

    const summary = result.conflictDetection?.summary || "No conflicts";
    ctx.onXmlComplete(
      `<dyad-status title="Conflict Detection Complete">${summary}</dyad-status>`,
    );

    return report;
  },
};
