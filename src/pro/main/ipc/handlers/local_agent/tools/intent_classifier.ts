/**
 * Intent Classifier Tool
 * Capabilities 1-5: Classifies user prompt intent
 * - Intent classification (build, debug, refactor, explain, etc.)
 * - Ambiguity detection
 * - Confidence scoring
 * - Multi-intent request identification
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const IntentClassifierArgs = z.object({
  /** The user prompt to classify */
  prompt: z.string().min(1),
  /** Optional context about the project or conversation */
  context: z.string().optional(),
  /** Whether to detect ambiguity in the prompt */
  detectAmbiguity: z.boolean().default(true),
  /** Whether to identify multiple intents */
  detectMultiIntent: z.boolean().default(true),
});

type IntentClassifierArgs = z.infer<typeof IntentClassifierArgs>;

// ============================================================================
// Types
// ============================================================================

/** Primary intent categories for software development tasks */
type IntentCategory =
  | "build"
  | "debug"
  | "refactor"
  | "explain"
  | "test"
  | "review"
  | "optimize"
  | "document"
  | "deploy"
  | "query"
  | "plan"
  | "modify"
  | "unknown";

/** Sub-intent for more granular classification */
interface SubIntent {
  category: IntentCategory;
  confidence: number;
  reasoning: string;
}

/** Ambiguity detection result */
interface AmbiguityResult {
  isAmbiguous: boolean;
  ambiguousAspects: string[];
  suggestions: string[];
}

/** Multi-intent detection result */
interface MultiIntentResult {
  hasMultipleIntents: boolean;
  intents: SubIntent[];
  primaryIntent: IntentCategory;
  intentHierarchy: string[];
}

/** Complete classification result */
interface ClassificationResult {
  primaryIntent: IntentCategory;
  confidence: number;
  subIntents: SubIntent[];
  ambiguity: AmbiguityResult;
  multiIntent: MultiIntentResult;
  metadata: {
    promptLength: number;
    complexityScore: number;
    requiredCapabilities: string[];
  };
}

// ============================================================================
// Intent Classification Logic
// ============================================================================

/** Keywords and patterns for intent classification */
const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  build: [
    "build",
    "create",
    "make",
    "implement",
    "add",
    "new",
    "generate",
    "develop",
  ],
  debug: [
    "debug",
    "fix",
    "error",
    "bug",
    "issue",
    "problem",
    "crash",
    "broken",
    "not working",
    "fails",
  ],
  refactor: [
    "refactor",
    "rewrite",
    "restructure",
    "clean",
    "improve code",
    "reorganize",
  ],
  explain: [
    "explain",
    "what is",
    "how does",
    "describe",
    "understand",
    "tell me about",
    "clarify",
  ],
  test: [
    "test",
    "testing",
    "spec",
    "verify",
    "check",
    "coverage",
    "unit test",
    "e2e",
  ],
  review: ["review", "audit", "assess", "evaluate", "analyze", "check code"],
  optimize: [
    "optimize",
    "performance",
    "speed",
    "efficient",
    "improve",
    "faster",
    "reduce",
  ],
  document: [
    "document",
    "docs",
    "readme",
    "comment",
    "explain code",
    "specification",
  ],
  deploy: ["deploy", "release", "publish", "push to", "ship", "production"],
  query: ["find", "search", "list", "show", "get", "display", "query"],
  plan: ["plan", "design", "architecture", "structure", "roadmap", "approach"],
  modify: ["update", "change", "modify", "edit", "alter", "adjust", "tweak"],
  unknown: [],
};

/** Calculate intent confidence based on keyword matching */
function calculateIntentConfidence(
  prompt: string,
  category: IntentCategory,
): number {
  const keywords = INTENT_KEYWORDS[category];
  const lowerPrompt = prompt.toLowerCase();

  let matchCount = 0;
  let totalWeight = 0;

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerPrompt.includes(lowerKeyword)) {
      matchCount++;
      // Weight longer keywords more heavily (more specific)
      totalWeight += keyword.length;
    }
  }

  if (matchCount === 0) return 0;

  // Normalize confidence based on prompt length and match density
  const maxPossibleMatches = Math.min(keywords.length, 5);
  const normalizedMatches = Math.min(matchCount, maxPossibleMatches);
  const densityBonus = totalWeight / (prompt.length || 1);

  return Math.min(
    0.95,
    (normalizedMatches / maxPossibleMatches) * 0.7 + densityBonus * 0.3,
  );
}

/** Detect ambiguity in the prompt */
function detectAmbiguity(prompt: string, context?: string): AmbiguityResult {
  const ambiguousAspects: string[] = [];
  const suggestions: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  // Check for vague references
  const vagueTerms = [
    {
      term: "it",
      suggestion: "Specify the exact file, function, or component",
    },
    { term: "that", suggestion: "Clarify what 'that' refers to" },
    { term: "this", suggestion: "Specify what 'this' refers to" },
    { term: "the code", suggestion: "Identify specific files or functions" },
    { term: "something", suggestion: "Be more specific about what you need" },
  ];

  for (const { term, suggestion } of vagueTerms) {
    if (lowerPrompt.includes(` ${term} `) || lowerPrompt.startsWith(term)) {
      ambiguousAspects.push(`Vague reference to '${term}'`);
      suggestions.push(suggestion);
    }
  }

  // Check for missing context
  if (
    (lowerPrompt.includes("fix") || lowerPrompt.includes("error")) &&
    !lowerPrompt.includes("file") &&
    !lowerPrompt.includes("line") &&
    !lowerPrompt.includes("error message")
  ) {
    ambiguousAspects.push("No specific error or location mentioned");
    suggestions.push("Include the error message or file path");
  }

  // Check for multiple interpretations
  if (
    (lowerPrompt.includes("update") || lowerPrompt.includes("change")) &&
    !lowerPrompt.includes("from") &&
    !lowerPrompt.includes("to")
  ) {
    ambiguousAspects.push("Unclear what to change");
    suggestions.push("Specify the current and desired state");
  }

  // Check for missing project context
  if (!context && lowerPrompt.length > 100) {
    ambiguousAspects.push("No project context provided");
    suggestions.push("Consider providing relevant project files or structure");
  }

  return {
    isAmbiguous: ambiguousAspects.length > 0,
    ambiguousAspects,
    suggestions,
  };
}

/** Detect multiple intents in the prompt */
function detectMultiIntents(prompt: string): MultiIntentResult {
  const intents: SubIntent[] = [];
  const lowerPrompt = prompt.toLowerCase();

  // Check for conjunction-based multi-intent
  const conjunctions = [
    " and ",
    " also ",
    " plus ",
    " and then ",
    " after that ",
    " meanwhile ",
  ];

  const hasConjunction = conjunctions.some((c) => lowerPrompt.includes(c));

  // Calculate confidence for each intent category
  const categories: IntentCategory[] = [
    "build",
    "debug",
    "refactor",
    "explain",
    "test",
    "review",
    "optimize",
    "document",
    "deploy",
    "query",
    "plan",
    "modify",
  ];

  for (const category of categories) {
    const confidence = calculateIntentConfidence(prompt, category);
    if (confidence > 0.1) {
      intents.push({
        category,
        confidence,
        reasoning: getIntentReasoning(prompt, category),
      });
    }
  }

  // Sort by confidence
  intents.sort((a, b) => b.confidence - a.confidence);

  // Determine if multiple intents detected
  const significantIntents = intents.filter((i) => i.confidence > 0.2);
  const hasMultiple =
    hasConjunction ||
    significantIntents.length > 1 ||
    intents.filter((i) => i.confidence > 0.15).length > 2;

  return {
    hasMultipleIntents: hasMultiple,
    intents: significantIntents.slice(0, 5),
    primaryIntent: intents[0]?.category || "unknown",
    intentHierarchy: intents.slice(0, 3).map((i) => i.category),
  };
}

/** Get reasoning for intent classification */
function getIntentReasoning(prompt: string, category: IntentCategory): string {
  const keywords = INTENT_KEYWORDS[category];
  const lowerPrompt = prompt.toLowerCase();

  const matchedKeywords = keywords.filter((k) =>
    lowerPrompt.includes(k.toLowerCase()),
  );

  if (matchedKeywords.length === 0) {
    return `No specific ${category} keywords detected`;
  }

  return `Matched keywords: ${matchedKeywords.join(", ")}`;
}

/** Calculate complexity score based on prompt characteristics */
function calculateComplexityScore(prompt: string): number {
  let score = 0;

  // Length-based complexity
  if (prompt.length > 200) score += 0.2;
  if (prompt.length > 500) score += 0.2;

  // Multiple questions/issues
  const questionCount = (prompt.match(/\?/g) || []).length;
  const issueCount = (prompt.match(/,|;|\n/g) || []).length;

  if (questionCount > 1) score += 0.15;
  if (issueCount > 3) score += 0.15;

  // Technical terms complexity
  const technicalTerms = [
    "api",
    "database",
    "async",
    "middleware",
    "authentication",
    "authorization",
    "optimization",
    "architecture",
    "refactoring",
    "migration",
  ];

  const technicalCount = technicalTerms.filter((t) =>
    prompt.toLowerCase().includes(t),
  ).length;

  score += Math.min(0.3, technicalCount * 0.1);

  return Math.min(1, score);
}

/** Determine required capabilities based on intent */
function determineRequiredCapabilities(
  primaryIntent: IntentCategory,
  multiIntent: MultiIntentResult,
): string[] {
  const capabilityMap: Record<IntentCategory, string[]> = {
    build: ["code_generation", "file_operations", "dependency_management"],
    debug: ["code_analysis", "error_diagnosis", "search_and_replace"],
    refactor: ["code_analysis", "search_and_replace", "code_review"],
    explain: ["code_search", "code_analysis"],
    test: ["test_generation", "code_analysis"],
    review: ["code_analysis", "code_search"],
    optimize: ["code_analysis", "performance_profiling"],
    document: ["code_analysis", "read_file"],
    deploy: ["execute_command", "environment_config"],
    query: ["code_search", "file_operations"],
    plan: ["code_analysis", "architecture_analysis"],
    modify: ["search_and_replace", "file_operations"],
    unknown: ["code_analysis"],
  };

  const capabilities = new Set<string>(
    capabilityMap[primaryIntent] || capabilityMap.unknown,
  );

  // Add capabilities from secondary intents
  for (const intent of multiIntent.intents.slice(1)) {
    for (const cap of capabilityMap[intent.category] || []) {
      capabilities.add(cap);
    }
  }

  return Array.from(capabilities);
}

// ============================================================================
// Main Classification Function
// ============================================================================

async function classifyIntent(
  args: IntentClassifierArgs,
  _ctx: AgentContext,
): Promise<ClassificationResult> {
  const {
    prompt,
    context,
    detectAmbiguity: doDetectAmbiguity,
    detectMultiIntent: doDetectMultiIntent,
  } = args;

  // Calculate primary intent
  const categories: IntentCategory[] = [
    "build",
    "debug",
    "refactor",
    "explain",
    "test",
    "review",
    "optimize",
    "document",
    "deploy",
    "query",
    "plan",
    "modify",
  ];

  let bestIntent: IntentCategory = "unknown";
  let bestConfidence = 0;
  const subIntents: SubIntent[] = [];

  for (const category of categories) {
    const confidence = calculateIntentConfidence(prompt, category);
    if (confidence > 0.1) {
      subIntents.push({
        category,
        confidence,
        reasoning: getIntentReasoning(prompt, category),
      });
    }
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestIntent = category;
    }
  }

  // Sort sub-intents by confidence
  subIntents.sort((a, b) => b.confidence - a.confidence);

  // Detect ambiguity
  const ambiguity = doDetectAmbiguity
    ? detectAmbiguity(prompt, context)
    : { isAmbiguous: false, ambiguousAspects: [], suggestions: [] };

  // Detect multi-intent
  const multiIntent = doDetectMultiIntent
    ? detectMultiIntents(prompt)
    : {
        hasMultipleIntents: false,
        intents: [],
        primaryIntent: bestIntent,
        intentHierarchy: [bestIntent],
      };

  // Calculate complexity
  const complexityScore = calculateComplexityScore(prompt);

  // Determine required capabilities
  const requiredCapabilities = determineRequiredCapabilities(
    multiIntent.hasMultipleIntents ? multiIntent.primaryIntent : bestIntent,
    multiIntent,
  );

  // Calculate overall confidence
  let overallConfidence = bestConfidence;
  if (ambiguity.isAmbiguous) {
    overallConfidence *= 0.7; // Reduce confidence if ambiguous
  }
  if (multiIntent.hasMultipleIntents && multiIntent.intents.length > 1) {
    // Boost confidence when multiple clear intents detected
    overallConfidence = Math.min(0.95, overallConfidence + 0.1);
  }

  return {
    primaryIntent: multiIntent.hasMultipleIntents
      ? multiIntent.primaryIntent
      : bestIntent,
    confidence: Math.round(overallConfidence * 100) / 100,
    subIntents: subIntents.slice(0, 5),
    ambiguity,
    multiIntent,
    metadata: {
      promptLength: prompt.length,
      complexityScore: Math.round(complexityScore * 100) / 100,
      requiredCapabilities,
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateClassificationXml(result: ClassificationResult): string {
  const lines: string[] = [
    `# Intent Classification Result`,
    ``,
    `**Primary Intent:** ${result.primaryIntent}`,
    `**Confidence:** ${(result.confidence * 100).toFixed(0)}%`,
    `**Complexity:** ${(result.metadata.complexityScore * 100).toFixed(0)}%`,
    ``,
  ];

  // Multi-intent detection
  if (result.multiIntent.hasMultipleIntents) {
    lines.push(`## Multiple Intents Detected`);
    lines.push(
      `Primary: **${result.multiIntent.primaryIntent}** (${result.multiIntent.intentHierarchy.join(" → ")})`,
    );
    lines.push(``);
  }

  // Sub-intents with confidence
  if (result.subIntents.length > 0) {
    lines.push(`## Intent Analysis`);
    for (const intent of result.subIntents.slice(0, 3)) {
      lines.push(
        `- ${intent.category}: ${(intent.confidence * 100).toFixed(0)}%`,
      );
    }
    lines.push(``);
  }

  // Ambiguity warnings
  if (result.ambiguity.isAmbiguous) {
    lines.push(`## ⚠️ Ambiguity Detected`);
    for (const aspect of result.ambiguity.ambiguousAspects) {
      lines.push(`- ${aspect}`);
    }
    lines.push(``);
    lines.push(`**Suggestions:**`);
    for (const suggestion of result.ambiguity.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push(``);
  }

  // Required capabilities
  lines.push(`## Required Capabilities`);
  lines.push(result.metadata.requiredCapabilities.join(", "));

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const intentClassifierTool: ToolDefinition<IntentClassifierArgs> = {
  name: "intent_classifier",
  description:
    "Classifies user prompt intent (build, debug, refactor, explain, etc.), detects ambiguity, returns confidence scores, and identifies multi-intent requests. Use this to understand what the user wants before executing tasks.",
  inputSchema: IntentClassifierArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Intent Classifier">Analyzing prompt intent...</dyad-status>`,
    );

    const result = await classifyIntent(args, ctx);

    const report = generateClassificationXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Intent Classification Complete">Primary: ${result.primaryIntent} (${(result.confidence * 100).toFixed(0)}%)</dyad-status>`,
    );

    return report;
  },
};
