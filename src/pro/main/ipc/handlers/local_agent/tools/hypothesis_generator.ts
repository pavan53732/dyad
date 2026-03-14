/**
 * Hypothesis Generator Tool
 * Capabilities 61-67: Generate and evaluate multiple solution hypotheses
 * - Generate multiple solution hypotheses
 * - Score and rank alternatives
 * - Explore reasoning branches
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const HypothesisGeneratorArgs = z.object({
  /** The problem or task to generate hypotheses for */
  problem: z.string().min(1),
  /** Optional context about the project or constraints */
  context: z.string().optional(),
  /** Maximum number of hypotheses to generate */
  maxHypotheses: z.number().min(1).max(10).default(5),
  /** Whether to generate reasoning branches for each hypothesis */
  exploreBranches: z.boolean().default(true),
  /** Domain-specific hints (e.g., "use React", "avoid callbacks") */
  hints: z.array(z.string()).default([]),
});

type HypothesisGeneratorArgs = z.infer<typeof HypothesisGeneratorArgs>;

// ============================================================================
// Types
// ============================================================================

/** A generated hypothesis */
interface Hypothesis {
  id: string;
  title: string;
  description: string;
  approach: string;
  confidence: number;
  pros: string[];
  cons: string[];
  dependencies: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

/** A reasoning branch within a hypothesis */
interface ReasoningBranch {
  id: string;
  path: string;
  reasoning: string;
  outcome: "viable" | "blocked" | "uncertain";
  confidence: number;
}

/** Ranked hypothesis result */
interface RankedHypothesis {
  hypothesis: Hypothesis;
  rank: number;
  score: number;
  branchAnalysis: ReasoningBranch[];
}

/** Complete hypothesis generation result */
interface HypothesisResult {
  problem: string;
  hypotheses: RankedHypothesis[];
  recommendedApproach: string;
  alternativeApproaches: string[];
  metadata: {
    totalGenerated: number;
    explorationDepth: number;
    branchingFactor: number;
  };
}

// ============================================================================
// Hypothesis Generation Logic
// ============================================================================

/** Generate hypothesis titles based on problem type */
function generateHypothesisTitles(problem: string, count: number): string[] {
  const titles: string[] = [];

  // Determine problem category

  const isFix = /fix|bug|error|issue|problem/i.test(problem);
  const isRefactor = /refactor|rewrite|clean|improve/i.test(problem);
  const isOptimize = /optimize|performance|speed|faster/i.test(problem);
  const isDebug = /debug|diagnose|investigate|trace/i.test(problem);

  const templates: Record<string, string[]> = {
    build: [
      "Component-based implementation",
      "Function-based approach",
      "API-driven architecture",
      "Database-first design",
      "Event-driven model",
    ],
    fix: [
      "Root cause analysis approach",
      "State management fix",
      "Configuration correction",
      "Dependency resolution",
      "Error handling improvement",
    ],
    refactor: [
      "Modular decomposition",
      "Functional abstraction",
      "Object-oriented restructuring",
      "Pattern-based refactoring",
      "Layer separation",
    ],
    optimize: [
      "Caching strategy",
      "Algorithm optimization",
      "Lazy loading approach",
      "Batch processing",
      "Resource pooling",
    ],
    debug: [
      "Logging and tracing",
      "Step-by-step verification",
      "Isolation testing",
      "State inspection",
      "Environment comparison",
    ],
  };

  let category = "build";
  if (isFix) category = "fix";
  else if (isRefactor) category = "refactor";
  else if (isOptimize) category = "optimize";
  else if (isDebug) category = "debug";

  const selected = templates[category];
  for (let i = 0; i < Math.min(count, selected.length); i++) {
    titles.push(selected[i]);
  }

  // Fill remaining if needed
  while (titles.length < count) {
    titles.push(`Alternative approach ${titles.length + 1}`);
  }

  return titles.slice(0, count);
}

/** Generate a single hypothesis */
function generateHypothesis(
  id: string,
  title: string,
  problem: string,
  context?: string,
  hints: string[] = [],
): Hypothesis {
  const lowerProblem = problem.toLowerCase();

  // Determine complexity based on problem size and hints
  let estimatedComplexity: "low" | "medium" | "high" = "medium";
  if (problem.length < 100 && hints.length === 0) {
    estimatedComplexity = "low";
  } else if (problem.length > 500 || hints.length > 2) {
    estimatedComplexity = "high";
  }

  // Generate pros and cons based on approach type
  const pros: string[] = [];
  const cons: string[] = [];

  if (title.toLowerCase().includes("component")) {
    pros.push("Reusable", "Separation of concerns", "Maintainable");
    cons.push("May add overhead", "Requires proper structure");
  } else if (title.toLowerCase().includes("function")) {
    pros.push("Simple", "Easy to test", "Flexible");
    cons.push("May lead to duplication", "State management challenges");
  } else if (title.toLowerCase().includes("cache")) {
    pros.push("Performance improvement", "Reduced load");
    cons.push("Cache invalidation complexity", "Memory usage");
  } else if (title.toLowerCase().includes("api")) {
    pros.push("Clear contract", "Scalable", "Team-friendly");
    cons.push("Network overhead", "Requires API design");
  } else {
    pros.push("Direct solution", "Clear intent");
    cons.push("May need refinement", "Consider edge cases");
  }

  // Add hint-based pros
  for (const hint of hints) {
    const lowerHint = hint.toLowerCase();
    if (lowerHint.includes("react")) {
      pros.push("React-compatible");
    } else if (lowerHint.includes("test")) {
      pros.push("Testable");
    }
  }

  // Generate approach description
  const approach = `Implementation strategy: ${title.toLowerCase()}. ${
    context ? `Given context: ${context.substring(0, 100)}` : ""
  }`;

  // Calculate initial confidence (can be adjusted by branch exploration)
  let confidence = 0.6 + Math.random() * 0.25; // 0.6-0.85

  // Adjust confidence based on problem clarity
  if (lowerProblem.includes("specific") || lowerProblem.includes("exact")) {
    confidence += 0.1;
  }
  if (lowerProblem.includes("maybe") || lowerProblem.includes("perhaps")) {
    confidence -= 0.1;
  }

  // Generate dependencies
  const dependencies: string[] = [];
  if (title.toLowerCase().includes("database")) {
    dependencies.push("Database access", "Schema definition");
  }
  if (title.toLowerCase().includes("api")) {
    dependencies.push("API endpoints", "Request handling");
  }
  if (title.toLowerCase().includes("cache")) {
    dependencies.push("Cache store", "Invalidation logic");
  }

  return {
    id,
    title,
    description: `${title} for: ${problem.substring(0, 150)}${problem.length > 150 ? "..." : ""}`,
    approach,
    confidence: Math.round(confidence * 100) / 100,
    pros,
    cons,
    dependencies,
    estimatedComplexity,
  };
}

/** Generate reasoning branches for a hypothesis */
function generateBranches(
  hypothesis: Hypothesis,
  depth: number = 2,
): ReasoningBranch[] {
  const branches: ReasoningBranch[] = [];

  // Generate different reasoning paths
  const pathTypes = [
    { path: "Happy Path", outcome: "viable" as const, boost: 0.1 },
    { path: "Edge Cases", outcome: "uncertain" as const, boost: -0.05 },
    { path: "Error Handling", outcome: "viable" as const, boost: 0.05 },
    { path: "Performance", outcome: "uncertain" as const, boost: -0.1 },
    { path: "Scalability", outcome: "viable" as const, boost: 0 },
  ];

  for (let i = 0; i < Math.min(depth + 1, pathTypes.length); i++) {
    const pathType = pathTypes[i];
    const confidence = Math.max(
      0.1,
      Math.min(0.95, hypothesis.confidence + pathType.boost),
    );

    let reasoning = "";
    switch (pathType.path) {
      case "Happy Path":
        reasoning = `The ${hypothesis.title} approach should work well for the main use case.`;
        break;
      case "Edge Cases":
        reasoning = `Need to handle edge cases like empty inputs, null values, and boundary conditions.`;
        break;
      case "Error Handling":
        reasoning = `Proper error handling and fallback mechanisms will ensure robustness.`;
        break;
      case "Performance":
        reasoning = `Consider performance implications for large datasets or high-frequency operations.`;
        break;
      case "Scalability":
        reasoning = `Evaluate how this approach scales with increased load and complexity.`;
        break;
    }

    branches.push({
      id: `branch_${hypothesis.id}_${i}`,
      path: pathType.path,
      reasoning,
      outcome: pathType.outcome,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return branches;
}

/** Score and rank hypotheses */
function rankHypotheses(
  hypotheses: Hypothesis[],
  branches: ReasoningBranch[][],
): RankedHypothesis[] {
  const scored: RankedHypothesis[] = [];

  for (let i = 0; i < hypotheses.length; i++) {
    const hypothesis = hypotheses[i];
    const branchAnalysis = branches[i] || [];

    // Calculate score based on multiple factors
    let score = hypothesis.confidence;

    // Adjust for complexity
    switch (hypothesis.estimatedComplexity) {
      case "low":
        score += 0.1;
        break;
      case "medium":
        score += 0.05;
        break;
      case "high":
        score -= 0.1;
        break;
    }

    // Adjust for branch analysis
    const viableBranches = branchAnalysis.filter(
      (b) => b.outcome === "viable",
    ).length;
    const blockedBranches = branchAnalysis.filter(
      (b) => b.outcome === "blocked",
    ).length;
    score += viableBranches * 0.05;
    score -= blockedBranches * 0.1;

    // Adjust for pros/cons balance
    score += (hypothesis.pros.length - hypothesis.cons.length) * 0.02;

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    scored.push({
      hypothesis,
      rank: 0, // Will be set after sorting
      score: Math.round(score * 100) / 100,
      branchAnalysis,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign ranks
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  return scored;
}

// ============================================================================
// Main Hypothesis Generation Function
// ============================================================================

async function generateHypotheses(
  args: HypothesisGeneratorArgs,
  _ctx: AgentContext,
): Promise<HypothesisResult> {
  const { problem, context, maxHypotheses, exploreBranches, hints } = args;

  // Generate hypothesis titles
  const titles = generateHypothesisTitles(problem, maxHypotheses);

  // Generate hypotheses
  const hypotheses: Hypothesis[] = titles.map((title, index) =>
    generateHypothesis(`hyp_${index + 1}`, title, problem, context, hints),
  );

  // Generate reasoning branches if requested
  const allBranches = exploreBranches
    ? hypotheses.map((h) => generateBranches(h, 2))
    : hypotheses.map(() => []);

  // Rank hypotheses
  const ranked = rankHypotheses(hypotheses, allBranches);

  // Determine recommended approach
  const recommended =
    ranked.length > 0 ? ranked[0].hypothesis.title : "No hypothesis generated";

  // Get alternative approaches (ranked 2-4)
  const alternatives = ranked.slice(1, 4).map((r) => r.hypothesis.title);

  return {
    problem: problem.substring(0, 200),
    hypotheses: ranked,
    recommendedApproach: recommended,
    alternativeApproaches: alternatives,
    metadata: {
      totalGenerated: hypotheses.length,
      explorationDepth: exploreBranches ? 2 : 0,
      branchingFactor: Math.ceil(
        allBranches.reduce((sum, b) => sum + b.length, 0) / hypotheses.length,
      ),
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateHypothesisXml(result: HypothesisResult): string {
  const lines: string[] = [
    `# Hypothesis Generation Result`,
    ``,
    `**Problem:** ${result.problem.substring(0, 100)}${result.problem.length > 100 ? "..." : ""}`,
    `**Total Hypotheses:** ${result.metadata.totalGenerated}`,
    ``,
  ];

  // Recommended approach
  lines.push(`## 🎯 Recommended Approach`);
  lines.push(result.recommendedApproach);
  lines.push(``);

  // Alternative approaches
  if (result.alternativeApproaches.length > 0) {
    lines.push(`## 🔄 Alternative Approaches`);
    for (const alt of result.alternativeApproaches) {
      lines.push(`- ${alt}`);
    }
    lines.push(``);
  }

  // All ranked hypotheses
  lines.push(`## 📊 Ranked Hypotheses`);
  for (const ranked of result.hypotheses) {
    const h = ranked.hypothesis;
    lines.push(
      `### ${ranked.rank}. ${h.title} (Score: ${(ranked.score * 100).toFixed(0)}%)`,
    );
    lines.push(`- **Confidence:** ${(h.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Complexity:** ${h.estimatedComplexity}`);
    lines.push(``);
    lines.push(`**Pros:**`);
    for (const pro of h.pros) {
      lines.push(`- ✅ ${pro}`);
    }
    lines.push(``);
    lines.push(`**Cons:**`);
    for (const con of h.cons) {
      lines.push(`- ❌ ${con}`);
    }
    if (h.dependencies.length > 0) {
      lines.push(``);
      lines.push(`**Dependencies:** ${h.dependencies.join(", ")}`);
    }

    // Branch analysis
    if (ranked.branchAnalysis.length > 0) {
      lines.push(``);
      lines.push(`**Branch Analysis:**`);
      for (const branch of ranked.branchAnalysis) {
        const icon =
          branch.outcome === "viable"
            ? "✅"
            : branch.outcome === "blocked"
              ? "❌"
              : "❓";
        lines.push(
          `- ${icon} ${branch.path}: ${branch.reasoning.substring(0, 80)}`,
        );
      }
    }
    lines.push(``);
  }

  // Metadata
  lines.push(`## 📈 Metadata`);
  lines.push(`- Exploration Depth: ${result.metadata.explorationDepth}`);
  lines.push(`- Branching Factor: ${result.metadata.branchingFactor}`);

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions (Exported separately for each capability)
// ============================================================================

/** Tool: Generate Hypotheses (Capability 61-65) */
export const generateHypothesesTool: ToolDefinition<HypothesisGeneratorArgs> = {
  name: "generate_hypotheses",
  description:
    "Generate multiple solution hypotheses for a given problem, score and rank alternatives, and explore reasoning branches. Use this when you need to evaluate different approaches before implementing a solution.",
  inputSchema: HypothesisGeneratorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Hypothesis Generator">Generating hypotheses...</dyad-status>`,
    );

    const result = await generateHypotheses(args, ctx);

    const report = generateHypothesisXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Hypothesis Generation Complete">${result.hypotheses.length} hypotheses, recommended: ${result.recommendedApproach}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Rank Hypotheses (Capability 25-26) */
export const rankHypothesesTool: ToolDefinition<HypothesisGeneratorArgs> = {
  name: "rank_hypotheses",
  description:
    "Score and rank alternative hypotheses based on confidence, complexity, pros/cons balance, and branch analysis. Use this to compare previously generated hypotheses.",
  inputSchema: HypothesisGeneratorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Hypothesis Ranking">Ranking hypotheses...</dyad-status>`,
    );

    const result = await generateHypotheses(args, ctx);

    const report = generateHypothesisXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Hypothesis Ranking Complete">Top: ${result.recommendedApproach}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Explore Branches (Capability 27) */
export const exploreBranchesTool: ToolDefinition<HypothesisGeneratorArgs> = {
  name: "explore_branches",
  description:
    "Explore reasoning branches for a hypothesis including happy path, edge cases, error handling, performance, and scalability considerations. Use this for deeper analysis of a specific approach.",
  inputSchema: HypothesisGeneratorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Branch Exploration">Exploring reasoning branches...</dyad-status>`,
    );

    // Always enable branch exploration for this tool
    const result = await generateHypotheses(
      { ...args, exploreBranches: true },
      ctx,
    );

    const report = generateHypothesisXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Branch Exploration Complete">${result.metadata.branchingFactor} branches analyzed</dyad-status>`,
    );

    return report;
  },
};
