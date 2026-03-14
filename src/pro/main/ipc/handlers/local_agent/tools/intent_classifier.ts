/**
 * Intent Classifier Tool
 * Capabilities 1-10: Classifies user prompt intent
 * - Intent classification (build, debug, refactor, explain, etc.)
 * - Ambiguity detection
 * - Confidence scoring
 * - Multi-intent request identification
 * - Prompt normalization
 * - Context enrichment
 * - Domain vocabulary expansion
 * - Entity extraction
 * - Feature request extraction
 * - User goal reconstruction
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
// Additional Intent Understanding Tools (Capabilities 5-10)
// ============================================================================

// ============================================================================
// Input Schema - Prompt Normalization
// ============================================================================

const PromptNormalizationArgs = z.object({
  /** The raw user prompt to normalize */
  prompt: z.string().min(1),
  /** Optional context about the conversation or project */
  context: z.string().optional(),
  /** Normalization options */
  options: z
    .object({
      /** Remove extra whitespace and normalize punctuation */
      cleanFormatting: z.boolean().default(true),
      /** Expand contractions (e.g., "don't" → "do not") */
      expandContractions: z.boolean().default(true),
      /** Standardize technical terms */
      standardizeTerms: z.boolean().default(true),
      /** Remove redundant phrases */
      removeRedundancy: z.boolean().default(true),
    })
    .default({
      cleanFormatting: true,
      expandContractions: true,
      standardizeTerms: true,
      removeRedundancy: true,
    }),
});

type PromptNormalizationArgs = z.infer<typeof PromptNormalizationArgs>;

// ============================================================================
// Input Schema - Context Enrichment
// ============================================================================

const ContextEnrichmentArgs = z.object({
  /** The prompt to enrich with context */
  prompt: z.string().min(1),
  /** Available context sources */
  contextSources: z.array(
    z.object({
      type: z.enum([
        "project_files",
        "conversation_history",
        "user_preferences",
        "technical_docs",
      ]),
      content: z.string(),
      relevance: z.number().min(0).max(1),
    }),
  ),
  /** Enrichment options */
  options: z
    .object({
      /** Maximum context length to add */
      maxContextLength: z.number().default(1000),
      /** Focus on specific domains */
      domainFocus: z.array(z.string()).default([]),
      /** Include technical details */
      includeTechnicalDetails: z.boolean().default(true),
    })
    .default({
      maxContextLength: 1000,
      domainFocus: [],
      includeTechnicalDetails: true,
    }),
});

type ContextEnrichmentArgs = z.infer<typeof ContextEnrichmentArgs>;

// ============================================================================
// Input Schema - Domain Vocabulary Expander
// ============================================================================

const DomainVocabularyExpanderArgs = z.object({
  /** The prompt containing domain-specific terms */
  prompt: z.string().min(1),
  /** Target domains to expand vocabulary for */
  domains: z
    .array(
      z.enum([
        "javascript",
        "typescript",
        "react",
        "node",
        "database",
        "api",
        "testing",
        "security",
        "performance",
        "architecture",
        "deployment",
        "git",
      ]),
    )
    .min(1),
  /** Expansion options */
  options: z
    .object({
      /** Include synonyms and related terms */
      includeSynonyms: z.boolean().default(true),
      /** Include technical definitions */
      includeDefinitions: z.boolean().default(true),
      /** Expand acronyms and abbreviations */
      expandAcronyms: z.boolean().default(true),
    })
    .default({
      includeSynonyms: true,
      includeDefinitions: true,
      expandAcronyms: true,
    }),
});

type DomainVocabularyExpanderArgs = z.infer<
  typeof DomainVocabularyExpanderArgs
>;

// ============================================================================
// Input Schema - Entity Extraction
// ============================================================================

const EntityExtractionArgs = z.object({
  /** The prompt to extract entities from */
  prompt: z.string().min(1),
  /** Types of entities to extract */
  entityTypes: z
    .array(
      z.enum([
        "file_path",
        "function_name",
        "class_name",
        "variable_name",
        "api_endpoint",
        "database_table",
        "error_message",
        "version_number",
        "technology_name",
        "command_name",
        "config_key",
      ]),
    )
    .min(1),
  /** Extraction options */
  options: z
    .object({
      /** Include confidence scores for each entity */
      includeConfidence: z.boolean().default(true),
      /** Group related entities */
      groupRelated: z.boolean().default(true),
      /** Validate extracted entities */
      validateEntities: z.boolean().default(true),
    })
    .default({
      includeConfidence: true,
      groupRelated: true,
      validateEntities: true,
    }),
});

type EntityExtractionArgs = z.infer<typeof EntityExtractionArgs>;

// ============================================================================
// Input Schema - Feature Request Extractor
// ============================================================================

const FeatureRequestExtractorArgs = z.object({
  /** The prompt containing potential feature requests */
  prompt: z.string().min(1),
  /** Context about the current system */
  systemContext: z.string().optional(),
  /** Extraction options */
  options: z
    .object({
      /** Analyze feasibility */
      analyzeFeasibility: z.boolean().default(true),
      /** Suggest implementation approaches */
      suggestImplementation: z.boolean().default(true),
      /** Identify dependencies */
      identifyDependencies: z.boolean().default(true),
    })
    .default({
      analyzeFeasibility: true,
      suggestImplementation: true,
      identifyDependencies: true,
    }),
});

type FeatureRequestExtractorArgs = z.infer<typeof FeatureRequestExtractorArgs>;

// ============================================================================
// Input Schema - User Goal Reconstructor
// ============================================================================

const UserGoalReconstructorArgs = z.object({
  /** The user's prompt or request */
  prompt: z.string().min(1),
  /** Conversation history for context */
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.string().optional(),
      }),
    )
    .optional(),
  /** Reconstruction options */
  options: z
    .object({
      /** Identify implicit goals */
      identifyImplicit: z.boolean().default(true),
      /** Break down into sub-goals */
      breakDownGoals: z.boolean().default(true),
      /** Prioritize goals */
      prioritizeGoals: z.boolean().default(true),
    })
    .default({
      identifyImplicit: true,
      breakDownGoals: true,
      prioritizeGoals: true,
    }),
});

type UserGoalReconstructorArgs = z.infer<typeof UserGoalReconstructorArgs>;

// ============================================================================
// Types for Additional Tools
// ============================================================================

interface NormalizedPrompt {
  original: string;
  normalized: string;
  changes: string[];
  confidence: number;
}

interface EnrichedPrompt {
  original: string;
  enriched: string;
  addedContext: string[];
  relevanceScore: number;
  sourcesUsed: string[];
}

interface ExpandedVocabulary {
  originalTerm: string;
  expandedTerms: string[];
  definitions: Record<string, string>;
  domain: string;
  confidence: number;
}

interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  position: { start: number; end: number };
  context: string;
  relatedEntities?: string[];
}

interface FeatureRequest {
  description: string;
  category: string;
  priority: "low" | "medium" | "high";
  feasibility: number;
  implementation: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
}

interface ReconstructedGoal {
  primaryGoal: string;
  subGoals: string[];
  implicitGoals: string[];
  priority: "low" | "medium" | "high";
  dependencies: string[];
  successCriteria: string[];
  reasoning: string;
}

// ============================================================================
// Implementation Functions
// ============================================================================

/** Normalize prompt for processing */
function normalizePrompt(args: PromptNormalizationArgs): NormalizedPrompt {
  const { prompt, options } = args;
  let normalized = prompt;
  const changes: string[] = [];

  if (options.cleanFormatting) {
    // Remove extra whitespace and normalize punctuation
    const original = normalized;
    normalized = normalized
      .replace(/\s+/g, " ")
      .replace(/\s*([.!?])\s*/g, "$1 ")
      .trim();
    if (original !== normalized) changes.push("Cleaned formatting");
  }

  if (options.expandContractions) {
    const contractions: Record<string, string> = {
      "don't": "do not",
      "can't": "cannot",
      "won't": "will not",
      "isn't": "is not",
      "aren't": "are not",
      "doesn't": "does not",
      "didn't": "did not",
      "haven't": "have not",
      "hasn't": "has not",
      "wasn't": "was not",
      "weren't": "were not",
    };

    for (const [contraction, expansion] of Object.entries(contractions)) {
      const regex = new RegExp(`\\b${contraction}\\b`, "gi");
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, expansion);
        changes.push(`Expanded "${contraction}" to "${expansion}"`);
      }
    }
  }

  if (options.standardizeTerms) {
    const termMappings: Record<string, string> = {
      javascript: "JavaScript",
      typescript: "TypeScript",
      nodejs: "Node.js",
      reactjs: "React",
      github: "GitHub",
      api: "API",
    };

    for (const [term, standard] of Object.entries(termMappings)) {
      const regex = new RegExp(`\\b${term}\\b`, "gi");
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, standard);
        changes.push(`Standardized "${term}" to "${standard}"`);
      }
    }
  }

  if (options.removeRedundancy) {
    // Remove repeated phrases
    const words = normalized.split(" ");
    const uniqueWords: string[] = [];
    const seen = new Set<string>();

    for (const word of words) {
      const lower = word.toLowerCase();
      if (!seen.has(lower) || lower.length <= 2) {
        // Allow short words to repeat
        uniqueWords.push(word);
        seen.add(lower);
      }
    }

    const deduplicated = uniqueWords.join(" ");
    if (deduplicated !== normalized) {
      normalized = deduplicated;
      changes.push("Removed redundant phrases");
    }
  }

  const confidence = changes.length > 0 ? 0.9 : 0.95;

  return {
    original: prompt,
    normalized,
    changes,
    confidence,
  };
}

/** Enrich prompt with context */
function enrichPrompt(args: ContextEnrichmentArgs): EnrichedPrompt {
  const { prompt, contextSources, options } = args;

  // Sort context sources by relevance
  const sortedSources = contextSources
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5); // Limit to top 5 sources

  const addedContext: string[] = [];
  let enrichedPrompt = prompt;
  let totalRelevance = 0;

  for (const source of sortedSources) {
    if (
      enrichedPrompt.length + source.content.length >
      options.maxContextLength
    ) {
      break;
    }

    // Check if this context is relevant to the prompt
    const relevanceScore = calculateRelevance(prompt, source.content);
    if (relevanceScore > 0.3) {
      enrichedPrompt += `\n\nContext (${source.type}): ${source.content}`;
      addedContext.push(source.type);
      totalRelevance += relevanceScore;
    }
  }

  const averageRelevance = totalRelevance / Math.max(addedContext.length, 1);

  return {
    original: prompt,
    enriched: enrichedPrompt,
    addedContext,
    relevanceScore: Math.round(averageRelevance * 100) / 100,
    sourcesUsed: sortedSources.map((s) => s.type),
  };
}

/** Calculate relevance between prompt and context */
function calculateRelevance(prompt: string, context: string): number {
  const promptWords = new Set(prompt.toLowerCase().split(/\W+/));
  const contextWords = new Set(context.toLowerCase().split(/\W+/));

  const intersection = new Set(
    [...promptWords].filter((x) => contextWords.has(x)),
  );
  const union = new Set([...promptWords, ...contextWords]);

  return intersection.size / union.size;
}

/** Expand domain vocabulary */
function expandVocabulary(
  args: DomainVocabularyExpanderArgs,
): ExpandedVocabulary[] {
  const { prompt, domains, options } = args;

  const vocabulary: ExpandedVocabulary[] = [];

  for (const domain of domains) {
    const domainTerms = getDomainVocabulary(domain);
    const promptWords = prompt.toLowerCase().split(/\W+/);

    for (const term of domainTerms) {
      if (promptWords.includes(term.term.toLowerCase())) {
        const expanded: ExpandedVocabulary = {
          originalTerm: term.term,
          expandedTerms: options.includeSynonyms ? term.synonyms : [],
          definitions: options.includeDefinitions
            ? { [term.term]: term.definition }
            : {},
          domain,
          confidence: 0.8,
        };

        if (options.expandAcronyms && term.acronym) {
          expanded.expandedTerms.push(term.acronym);
        }

        vocabulary.push(expanded);
      }
    }
  }

  return vocabulary;
}

/** Get vocabulary for a specific domain */
function getDomainVocabulary(domain: string): Array<{
  term: string;
  synonyms: string[];
  definition: string;
  acronym?: string;
}> {
  const vocabularies: Record<
    string,
    Array<{
      term: string;
      synonyms: string[];
      definition: string;
      acronym?: string;
    }>
  > = {
    javascript: [
      {
        term: "function",
        synonyms: ["method", "procedure", "subroutine"],
        definition: "A reusable block of code that performs a specific task",
      },
      {
        term: "variable",
        synonyms: ["identifier", "storage"],
        definition: "A named storage location for data",
      },
    ],
    typescript: [
      {
        term: "interface",
        synonyms: ["contract", "type definition"],
        definition:
          "A TypeScript construct that defines the structure of an object",
      },
      {
        term: "type",
        synonyms: ["data type", "classification"],
        definition: "A TypeScript annotation that specifies the kind of value",
      },
    ],
    react: [
      {
        term: "component",
        synonyms: ["element", "building block"],
        definition: "A reusable piece of UI in React",
      },
      {
        term: "props",
        synonyms: ["properties", "arguments"],
        definition: "Data passed from parent to child components",
      },
    ],
    // Add more domains as needed...
  };

  return vocabularies[domain] || [];
}

/** Extract entities from prompt */
function extractEntities(args: EntityExtractionArgs): ExtractedEntity[] {
  const { prompt, entityTypes, options } = args;
  const entities: ExtractedEntity[] = [];

  for (const entityType of entityTypes) {
    const extractor = getEntityExtractor(entityType);
    const foundEntities = extractor(prompt);

    for (const entity of foundEntities) {
      entities.push({
        type: entityType,
        value: entity.value,
        confidence: options.includeConfidence
          ? calculateEntityConfidence(entity, prompt)
          : 0.8,
        position: entity.position,
        context: entity.context,
      });
    }
  }

  // Group related entities if requested
  if (options.groupRelated) {
    return groupRelatedEntities(entities);
  }

  // Validate entities if requested
  if (options.validateEntities) {
    return validateEntities(entities, prompt);
  }

  return entities;
}

/** Get entity extractor function for a specific type */
function getEntityExtractor(
  entityType: string,
): (prompt: string) => Array<Omit<ExtractedEntity, "type" | "confidence">> {
  const extractors: Record<
    string,
    (prompt: string) => Array<Omit<ExtractedEntity, "type" | "confidence">>
  > = {
    file_path: (prompt) => {
      const filePathRegex = /\b[\w./-]+(?:\.\w+)+\b/g;
      const matches = prompt.match(filePathRegex) || [];
      return matches.map((match) => ({
        value: match,
        position: {
          start: prompt.indexOf(match),
          end: prompt.indexOf(match) + match.length,
        },
        context: getContextAround(prompt, prompt.indexOf(match), 20),
      }));
    },
    function_name: (prompt) => {
      const functionRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g;
      const matches = prompt.match(functionRegex) || [];
      return matches.map((match) => {
        const funcName = match.replace(/\s*\($/, "");
        return {
          value: funcName,
          position: {
            start: prompt.indexOf(match),
            end: prompt.indexOf(match) + funcName.length,
          },
          context: getContextAround(prompt, prompt.indexOf(match), 15),
        };
      });
    },
    // Add more extractors for other entity types...
  };

  return extractors[entityType] || (() => []);
}

/** Get context around a position in text */
function getContextAround(
  text: string,
  position: number,
  contextLength: number,
): string {
  const start = Math.max(0, position - contextLength);
  const end = Math.min(text.length, position + contextLength);
  return text.slice(start, end);
}

/** Calculate confidence for extracted entity */
function calculateEntityConfidence(
  entity: Omit<ExtractedEntity, "confidence" | "type">,
  prompt: string,
): number {
  let confidence = 0.7;

  // Higher confidence for entities with clear boundaries
  if (
    /\s/.test(entity.context[0]) &&
    /\s/.test(entity.context[entity.context.length - 1])
  ) {
    confidence += 0.1;
  }

  // Higher confidence for longer entities
  if (entity.value.length > 5) {
    confidence += 0.1;
  }

  return Math.min(0.95, confidence);
}

/** Group related entities */
function groupRelatedEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const groups: ExtractedEntity[] = [];

  for (const entity of entities) {
    const related = entities.filter(
      (e) =>
        e !== entity &&
        e.type === entity.type &&
        Math.abs(e.position.start - entity.position.start) < 100,
    );

    if (related.length > 0) {
      entity.relatedEntities = related.map((e) => e.value);
    }

    groups.push(entity);
  }

  return groups;
}

/** Validate extracted entities */
function validateEntities(
  entities: ExtractedEntity[],
  prompt: string,
): ExtractedEntity[] {
  return entities.filter((entity) => {
    // Basic validation: entity should exist in the prompt
    return prompt.includes(entity.value);
  });
}

/** Extract feature requests */
function extractFeatureRequests(
  args: FeatureRequestExtractorArgs,
): FeatureRequest[] {
  const { prompt, systemContext, options } = args;
  const requests: FeatureRequest[] = [];

  const featureIndicators = [
    "add",
    "implement",
    "create",
    "build",
    "need",
    "want",
    "should have",
    "would be nice",
    "feature request",
    "enhancement",
    "improvement",
  ];

  const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    const hasFeatureIndicator = featureIndicators.some((indicator) =>
      lowerSentence.includes(indicator),
    );

    if (hasFeatureIndicator) {
      const request: FeatureRequest = {
        description: sentence.trim(),
        category: categorizeFeatureRequest(sentence),
        priority: estimatePriority(sentence),
        feasibility: options.analyzeFeasibility
          ? calculateFeasibility(sentence, systemContext)
          : 0.5,
        implementation: options.suggestImplementation
          ? suggestImplementation(sentence)
          : [],
        dependencies: options.identifyDependencies
          ? identifyDependencies(sentence, systemContext)
          : [],
        acceptanceCriteria: generateAcceptanceCriteria(sentence),
      };

      requests.push(request);
    }
  }

  return requests;
}

/** Categorize feature request */
function categorizeFeatureRequest(description: string): string {
  const categories = {
    "UI/UX": ["interface", "ui", "ux", "design", "layout", "component"],
    API: ["api", "endpoint", "integration", "service"],
    Database: ["database", "data", "storage", "query"],
    Security: ["security", "auth", "permission", "access"],
    Performance: ["performance", "speed", "optimization", "efficiency"],
    Testing: ["test", "testing", "coverage", "qa"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (
      keywords.some((keyword) => description.toLowerCase().includes(keyword))
    ) {
      return category;
    }
  }

  return "General";
}

/** Estimate priority */
function estimatePriority(description: string): "low" | "medium" | "high" {
  const highPriorityWords = [
    "critical",
    "urgent",
    "important",
    "must",
    "essential",
  ];
  const lowPriorityWords = [
    "nice to have",
    "would be nice",
    "optional",
    "minor",
  ];

  if (
    highPriorityWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return "high";
  }
  if (
    lowPriorityWords.some((word) => description.toLowerCase().includes(word))
  ) {
    return "low";
  }

  return "medium";
}

/** Calculate feasibility */
function calculateFeasibility(
  description: string,
  systemContext?: string,
): number {
  let feasibility = 0.5;

  // Increase feasibility if similar features exist
  if (systemContext && description.toLowerCase().includes("similar to")) {
    feasibility += 0.2;
  }

  // Decrease feasibility for complex features
  const complexTerms = ["machine learning", "ai", "blockchain", "real-time"];
  if (complexTerms.some((term) => description.toLowerCase().includes(term))) {
    feasibility -= 0.2;
  }

  return Math.max(0.1, Math.min(0.9, feasibility));
}

/** Suggest implementation */
function suggestImplementation(description: string): string[] {
  const suggestions: string[] = [];

  if (description.toLowerCase().includes("add")) {
    suggestions.push("Create new component/function");
    suggestions.push("Add to existing module");
  }

  if (description.toLowerCase().includes("integrate")) {
    suggestions.push("Add API client");
    suggestions.push("Implement authentication");
  }

  return suggestions;
}

/** Identify dependencies */
function identifyDependencies(
  description: string,
  systemContext?: string,
): string[] {
  const dependencies: string[] = [];

  if (description.toLowerCase().includes("database")) {
    dependencies.push("Database schema changes");
  }

  if (description.toLowerCase().includes("api")) {
    dependencies.push("API design");
    dependencies.push("Backend implementation");
  }

  return dependencies;
}

/** Generate acceptance criteria */
function generateAcceptanceCriteria(description: string): string[] {
  return [
    `Feature ${description.toLowerCase().includes("should") ? "should" : "must"} work as described`,
    "No regressions in existing functionality",
    "Code follows project standards",
  ];
}

/** Reconstruct user goals */
function reconstructUserGoals(
  args: UserGoalReconstructorArgs,
): ReconstructedGoal {
  const { prompt, conversationHistory, options } = args;

  const primaryGoal = extractPrimaryGoal(prompt);

  const subGoals = options.breakDownGoals ? breakDownGoals(prompt) : [];
  const implicitGoals = options.identifyImplicit
    ? identifyImplicitGoals(prompt, conversationHistory)
    : [];
  const priority = estimateGoalPriority(prompt);
  const dependencies = identifyGoalDependencies(prompt);
  const successCriteria = generateSuccessCriteria(primaryGoal);

  return {
    primaryGoal,
    subGoals,
    implicitGoals,
    priority,
    dependencies,
    successCriteria,
    reasoning: `Reconstructed from prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}"`,
  };
}

/** Extract primary goal */
function extractPrimaryGoal(prompt: string): string {
  // Remove auxiliary phrases to get to the core goal
  const cleaned = prompt
    .replace(/^(I want|I need|Please|Can you|Could you|Would you)\s+/i, "")
    .replace(/\s+(please|thanks?|thank you).*$/i, "")
    .trim();

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Break down goals into sub-goals */
function breakDownGoals(prompt: string): string[] {
  const subGoals: string[] = [];

  if (prompt.toLowerCase().includes("and")) {
    const parts = prompt.split(/\s+and\s+/i);
    subGoals.push(...parts.map((p) => p.trim()));
  }

  if (prompt.includes(",")) {
    const parts = prompt.split(",").map((p) => p.trim());
    if (parts.length > 1) {
      subGoals.push(...parts);
    }
  }

  return subGoals.slice(0, 3); // Limit to 3 sub-goals
}

/** Identify implicit goals */
function identifyImplicitGoals(
  prompt: string,
  conversationHistory?: any[],
): string[] {
  const implicit: string[] = [];

  if (prompt.toLowerCase().includes("fix")) {
    implicit.push("Ensure no regressions");
    implicit.push("Maintain code quality");
  }

  if (prompt.toLowerCase().includes("add")) {
    implicit.push("Integrate with existing code");
    implicit.push("Follow project conventions");
  }

  if (conversationHistory && conversationHistory.length > 0) {
    // Look for patterns in conversation history
    const recentMessages = conversationHistory.slice(-3);
    if (recentMessages.some((m) => m.content.toLowerCase().includes("error"))) {
      implicit.push("Resolve existing issues");
    }
  }

  return implicit;
}

/** Estimate goal priority */
function estimateGoalPriority(prompt: string): "low" | "medium" | "high" {
  const urgentWords = ["urgent", "immediately", "asap", "critical", "blocking"];
  const lowPriorityWords = ["someday", "eventually", "nice to have"];

  if (urgentWords.some((word) => prompt.toLowerCase().includes(word))) {
    return "high";
  }
  if (lowPriorityWords.some((word) => prompt.toLowerCase().includes(word))) {
    return "low";
  }

  return "medium";
}

/** Identify goal dependencies */
function identifyGoalDependencies(prompt: string): string[] {
  const dependencies: string[] = [];

  if (prompt.toLowerCase().includes("database")) {
    dependencies.push("Database access");
  }

  if (prompt.toLowerCase().includes("api")) {
    dependencies.push("API connectivity");
  }

  if (prompt.toLowerCase().includes("file")) {
    dependencies.push("File system access");
  }

  return dependencies;
}

/** Generate success criteria */
function generateSuccessCriteria(primaryGoal: string): string[] {
  return [
    `Successfully ${primaryGoal.toLowerCase()}`,
    "No errors or warnings",
    "Code is maintainable and documented",
    "Functionality works as expected",
  ];
}

// ============================================================================
// Tool Definitions (Capabilities 5-10)
// ============================================================================

export const promptNormalizationTool: ToolDefinition<PromptNormalizationArgs> =
  {
    name: "prompt_normalization",
    description:
      "Normalize user prompts for better processing by cleaning formatting, expanding contractions, and standardizing terms.",
    inputSchema: PromptNormalizationArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Prompt Normalization">Normalizing prompt...</dyad-status>`,
      );

      const result = normalizePrompt(args);

      const report = `# Prompt Normalization Result

**Original:** ${result.original}
**Normalized:** ${result.normalized}
**Confidence:** ${(result.confidence * 100).toFixed(0)}%

${
  result.changes.length > 0
    ? `**Changes Made:**
${result.changes.map((change) => `- ${change}`).join("\n")}`
    : "**No changes needed**"
}`;

      ctx.onXmlComplete(
        `<dyad-status title="Prompt Normalization Complete">Normalized with ${(result.confidence * 100).toFixed(0)}% confidence</dyad-status>`,
      );

      return report;
    },
  };

export const contextEnrichmentTool: ToolDefinition<ContextEnrichmentArgs> = {
  name: "context_enrichment",
  description:
    "Enrich user prompts with relevant context from project files, conversation history, and technical documentation.",
  inputSchema: ContextEnrichmentArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Context Enrichment">Enriching prompt with context...</dyad-status>`,
    );

    const result = enrichPrompt(args);

    const report = `# Context Enrichment Result

**Original Prompt:** ${result.original.slice(0, 100)}${result.original.length > 100 ? "..." : ""}

**Relevance Score:** ${(result.relevanceScore * 100).toFixed(0)}%
**Sources Used:** ${result.sourcesUsed.join(", ")}

${
  result.addedContext.length > 0
    ? `**Added Context:**
${result.addedContext.map((context) => `- ${context}`).join("\n")}`
    : "**No additional context added**"
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Context Enrichment Complete">Enriched with ${(result.relevanceScore * 100).toFixed(0)}% relevance</dyad-status>`,
    );

    return report;
  },
};

export const domainVocabularyExpanderTool: ToolDefinition<DomainVocabularyExpanderArgs> =
  {
    name: "domain_vocabulary_expander",
    description:
      "Expand domain-specific vocabulary in prompts, providing synonyms, definitions, and technical context.",
    inputSchema: DomainVocabularyExpanderArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Vocabulary Expansion">Expanding domain vocabulary...</dyad-status>`,
      );

      const result = expandVocabulary(args);

      const report = `# Domain Vocabulary Expansion

**Prompt:** ${args.prompt.slice(0, 100)}${args.prompt.length > 100 ? "..." : ""}
**Domains:** ${args.domains.join(", ")}

${
  result.length > 0
    ? result
        .map(
          (vocab) => `
**Term:** ${vocab.originalTerm} (${vocab.domain})
**Expanded Terms:** ${vocab.expandedTerms.join(", ") || "None"}
**Definitions:** ${
            Object.entries(vocab.definitions)
              .map(([term, def]) => `${term}: ${def}`)
              .join("; ") || "None"
          }
**Confidence:** ${(vocab.confidence * 100).toFixed(0)}%`,
        )
        .join("\n")
    : "**No domain-specific terms found**"
}`;

      ctx.onXmlComplete(
        `<dyad-status title="Vocabulary Expansion Complete">Expanded ${result.length} terms</dyad-status>`,
      );

      return report;
    },
  };

export const entityExtractionTool: ToolDefinition<EntityExtractionArgs> = {
  name: "entity_extraction",
  description:
    "Extract entities like file paths, function names, API endpoints, and technical terms from user prompts.",
  inputSchema: EntityExtractionArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Entity Extraction">Extracting entities...</dyad-status>`,
    );

    const result = extractEntities(args);

    const report = `# Entity Extraction Result

**Prompt:** ${args.prompt.slice(0, 100)}${args.prompt.length > 100 ? "..." : ""}
**Entity Types:** ${args.entityTypes.join(", ")}

${
  result.length > 0
    ? result
        .map(
          (entity) => `
**${entity.type}:** ${entity.value}
  - Confidence: ${(entity.confidence * 100).toFixed(0)}%
  - Context: "${entity.context}"
  ${entity.relatedEntities ? `- Related: ${entity.relatedEntities.join(", ")}` : ""}`,
        )
        .join("\n")
    : "**No entities found**"
}`;

    ctx.onXmlComplete(
      `<dyad-status title="Entity Extraction Complete">Found ${result.length} entities</dyad-status>`,
    );

    return report;
  },
};

export const featureRequestExtractorTool: ToolDefinition<FeatureRequestExtractorArgs> =
  {
    name: "feature_request_extractor",
    description:
      "Extract and analyze feature requests from user prompts, including feasibility analysis and implementation suggestions.",
    inputSchema: FeatureRequestExtractorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Feature Request Extraction">Analyzing feature requests...</dyad-status>`,
      );

      const result = extractFeatureRequests(args);

      const report = `# Feature Request Analysis

${
  result.length > 0
    ? result
        .map(
          (request) => `
## Feature Request
**Description:** ${request.description}
**Category:** ${request.category}
**Priority:** ${request.priority}
**Feasibility:** ${(request.feasibility * 100).toFixed(0)}%

**Implementation Suggestions:**
${request.implementation.map((impl) => `- ${impl}`).join("\n")}

**Dependencies:**
${request.dependencies.map((dep) => `- ${dep}`).join("\n")}

**Acceptance Criteria:**
${request.acceptanceCriteria.map((criteria) => `- ${criteria}`).join("\n")}`,
        )
        .join("\n\n")
    : "**No feature requests identified**"
}`;

      ctx.onXmlComplete(
        `<dyad-status title="Feature Request Analysis Complete">Found ${result.length} feature requests</dyad-status>`,
      );

      return report;
    },
  };

export const userGoalReconstructorTool: ToolDefinition<UserGoalReconstructorArgs> =
  {
    name: "user_goal_reconstructor",
    description:
      "Reconstruct user goals from prompts, identifying primary goals, sub-goals, implicit goals, and success criteria.",
    inputSchema: UserGoalReconstructorArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Goal Reconstruction">Reconstructing user goals...</dyad-status>`,
      );

      const result = reconstructUserGoals(args);

      const report = `# User Goal Reconstruction

**Primary Goal:** ${result.primaryGoal}
**Priority:** ${result.priority}

**Sub-goals:**
${result.subGoals.map((goal) => `- ${goal}`).join("\n") || "*None identified*"}

**Implicit Goals:**
${result.implicitGoals.map((goal) => `- ${goal}`).join("\n") || "*None identified*"}

**Dependencies:**
${result.dependencies.map((dep) => `- ${dep}`).join("\n") || "*None identified*"}

**Success Criteria:**
${result.successCriteria.map((criteria) => `- ${criteria}`).join("\n")}

**Reasoning:** ${result.reasoning}`;

      ctx.onXmlComplete(
        `<dyad-status title="Goal Reconstruction Complete">Primary goal: ${result.primaryGoal.slice(0, 50)}${result.primaryGoal.length > 50 ? "..." : ""}</dyad-status>`,
      );

      return report;
    },
  };

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
