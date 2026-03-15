/**
 * Metacognition Tool
 * Capabilities 31-40: Higher-order reasoning and self-awareness
 * - Context orchestration
 * - Theory of mind (model user intentions)
 * - Abstract reasoning (handle abstract concepts)
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const MetacognitionArgs = z.object({
  /** The task or question to analyze metacognitively */
  task: z.string().min(1),
  /** Type of metacognitive analysis */
  analysisType: z
    .enum(["orchestration", "theory_of_mind", "abstract_reasoning", "all"])
    .default("all"),
  /** Conversation history for context */
  conversationHistory: z.string().optional(),
  /** The original intent/goal of the entire session */
  originalIntent: z.string().optional(),
  /** User's apparent skill level (auto-detected if not provided) */
  userSkillLevel: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .optional(),
  /** Current reasoning steps (for monitoring) */
  reasoningSteps: z.array(z.string()).default([]),
  /** Intended tool call (for predictive drift) */
  intendedToolCall: z.string().optional(),
  /** Expected outcome of the tool call */
  expectedOutcome: z.string().optional(),
});

type MetacognitionArgs = z.infer<typeof MetacognitionArgs>;

// ============================================================================
// Types
// ============================================================================

/** Context orchestration result */
interface ContextOrchestration {
  relevantContext: string[];
  discardedContext: string[];
  contextPriority: string[];
  strategy: string;
  estimatedTokens: number;
}

/** Theory of mind analysis */
interface TheoryOfMindAnalysis {
  inferredIntent: string;
  confidence: number;
  userModel: {
    skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
    domainKnowledge: string[];
    likelyGoals: string[];
    potentialConcerns: string[];
  };
  communicationStyle: {
    verbosity: "terse" | "moderate" | "detailed";
    technicalLevel: "casual" | "professional" | "highly_technical";
    preferredFormat: "code" | "explanation" | "mixed";
  };
  suggestedResponses: string[];
}

/** Abstract reasoning result */
interface AbstractReasoningResult {
  abstractionLevel: number;
  concepts: {
    name: string;
    concreteExamples: string[];
    abstractPrinciples: string[];
    relationships: string[];
  }[];
  analogies: {
    source: string;
    target: string;
    mapping: string[];
    validity: number;
  }[];
  generalizations: string[];
}

/** Reasoning monitoring result */
export interface ReasoningMonitorResult {
  currentStep: number;
  totalSteps: number;
  progress: number;
  confidence: number;
  potentialIssues: string[];
  recommendations: string[];
  isOnTrack: boolean;
  /** Semantic drift score (0.0 to 1.0) - Mechanism 131 */
  driftScore: number;
  /** Explanation of any detected drift */
  driftExplanation?: string;
  /** Predictive drift score (Mechanism 151) */
  predictiveDriftScore?: number;
  /** Warning if predictive drift is high */
  predictiveDriftWarning?: string;
}

/** Complete metacognition result */
interface MetacognitionResult {
  task: string;
  contextOrchestration: ContextOrchestration | null;
  theoryOfMind: TheoryOfMindAnalysis | null;
  abstractReasoning: AbstractReasoningResult | null;
  reasoningMonitor: ReasoningMonitorResult | null;
  metadata: {
    analysisType: string;
    processingTime: number;
  };
}

// ============================================================================
// Context Orchestration Logic (Capabilities 31-35)
// ============================================================================

/** Orchestrate relevant context for a task */
function orchestrateContext(
  task: string,
  conversationHistory?: string,
): ContextOrchestration {
  const relevantContext: string[] = [];
  const discardedContext: string[] = [];
  const contextPriority: string[] = [];

  const lowerTask = task.toLowerCase();
  const historyLines = conversationHistory?.split("\n") || [];

  // Determine task domain
  let domain = "general";
  if (/code|function|class|import|export/i.test(task)) domain = "programming";
  else if (/bug|error|fix|issue/i.test(task)) domain = "debugging";
  else if (/test|spec|verify/i.test(task)) domain = "testing";
  else if (/deploy|build|run/i.test(task)) domain = "deployment";
  else if (/design|architecture|structure/i.test(task)) domain = "architecture";

  // Score each history line for relevance
  const scoredLines: { line: string; score: number; reason: string }[] = [];

  for (const line of historyLines) {
    if (!line.trim()) continue;

    let score = 0;
    const reasons: string[] = [];

    // Recent lines are more relevant
    const recency =
      historyLines.indexOf(line) / Math.max(historyLines.length, 1);
    score += recency * 0.3;

    // Keyword matching
    if (domain === "programming") {
      if (/function|class|const|let|var|import|export/i.test(line)) {
        score += 0.5;
        reasons.push("code-related");
      }
    } else if (domain === "debugging") {
      if (/error|bug|exception|stack|issue/i.test(line)) {
        score += 0.5;
        reasons.push("debug-related");
      }
    }

    // Task-specific keywords
    const taskWords = lowerTask.split(/\s+/);
    for (const word of taskWords) {
      if (word.length > 3 && line.toLowerCase().includes(word)) {
        score += 0.2;
        reasons.push(`contains "${word}"`);
      }
    }

    scoredLines.push({ line, score, reason: reasons.join(", ") });
  }

  // Sort by score and select relevant context
  scoredLines.sort((a, b) => b.score - a.score);

  // Take top relevant lines (up to ~2000 tokens worth)
  let tokenEstimate = 0;
  const maxTokens = 2000;

  for (const scored of scoredLines) {
    const lineTokens = scored.line.split(/\s+/).length * 1.3;

    if (tokenEstimate + lineTokens <= maxTokens && scored.score > 0.1) {
      relevantContext.push(scored.line);
      contextPriority.push(scored.reason || "relevant");
      tokenEstimate += lineTokens;
    } else {
      discardedContext.push(scored.line.substring(0, 50) + "...");
    }
  }

  // Determine strategy
  let strategy = "balanced";
  if (domain === "debugging") {
    strategy = "focused";
  } else if (domain === "architecture") {
    strategy = "comprehensive";
  }

  return {
    relevantContext,
    discardedContext,
    contextPriority,
    strategy,
    estimatedTokens: Math.round(tokenEstimate),
  };
}

/** Monitor reasoning progress */
export function monitorReasoning(
  task: string,
  reasoningSteps: string[] = [],
  originalIntent?: string,
  intendedToolCall?: string,
  expectedOutcome?: string,
): ReasoningMonitorResult {
  const currentStep = reasoningSteps.length;
  const totalSteps = Math.max(3, Math.ceil(task.length / 200));
  const progress = Math.min(1, currentStep / totalSteps);

  // Calculate confidence based on reasoning progress
  let confidence = 0.5;
  if (currentStep > 0) confidence += 0.1;
  if (currentStep > totalSteps / 2) confidence += 0.15;
  if (currentStep >= totalSteps) confidence = Math.min(0.95, confidence + 0.1);

  // Detect potential issues
  const potentialIssues: string[] = [];

  // Check for repetitive reasoning
  const stepSet = new Set(reasoningSteps.map((s) => s.toLowerCase()));
  if (stepSet.size < currentStep * 0.5 && currentStep > 2) {
    potentialIssues.push(
      "Reasoning appears circular - consider alternative approaches",
    );
  }

  // Check for very short steps
  const shortSteps = reasoningSteps.filter((s) => s.length < 20);
  if (shortSteps.length > currentStep * 0.5 && currentStep > 3) {
    potentialIssues.push(
      "Some reasoning steps are too brief - add more detail",
    );
  }

  // Check for task complexity vs progress
  if (task.length > 500 && currentStep < 3) {
    potentialIssues.push(
      "Complex task - consider breaking down into smaller steps",
    );
  }

  // Mechanism 131: Semantic Goal Alignment Monitor
  let driftScore = 0;
  let driftExplanation = "Trajectory remains aligned with original intent.";

  if (originalIntent) {
    const intentKeywords = new Set(
      originalIntent
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4),
    );
    const taskKeywords = new Set(
      task
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4),
    );

    if (intentKeywords.size > 0) {
      let matches = 0;
      for (const word of intentKeywords) {
        if (taskKeywords.has(word)) matches++;
      }

      const overlap = matches / intentKeywords.size;
      // Drift is the inverse of overlap, capped at 1.0
      driftScore = Math.max(0, 1 - overlap);

      if (driftScore > 0.5) {
        driftExplanation = `High semantic drift detected (${(driftScore * 100).toFixed(0)}%). The current task trajectory has significantly diverged from the original mission goal.`;
        potentialIssues.push(
          "MISSION DRIFT: Current task deviates from original intent.",
        );
      } else if (driftScore > 0.3) {
        driftExplanation = `Moderate drift detected (${(driftScore * 100).toFixed(0)}%). Trajectory is softening.`;
      }
    }
  }

  // Mechanism 151: Predictive Drift (Early Warning)
  let predictiveDriftScore = 0;
  let predictiveDriftWarning = "";

  if (intendedToolCall && expectedOutcome && originalIntent) {
    const intentLower = originalIntent.toLowerCase();
    const outcomeLower = expectedOutcome.toLowerCase();

    // Check if expected outcome aligns with original intent keywords
    const keywords = intentLower.split(/\W+/).filter((w) => w.length > 5);
    let matches = 0;
    for (const kw of keywords) {
      if (outcomeLower.includes(kw)) matches++;
    }

    if (keywords.length > 0) {
      const alignment = matches / keywords.length;
      predictiveDriftScore = Math.max(0, 1 - alignment);

      if (predictiveDriftScore > 0.4) {
        predictiveDriftWarning = `PREDICTIVE DRIFT DETECTED: The intended tool call (${intendedToolCall}) has an expected outcome that only aligns ${(alignment * 100).toFixed(0)}% with the original mission.`;
        potentialIssues.push(
          `PREDICTIVE DRIFT: High risk of deviation in next step.`,
        );
      }
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (progress < 0.3) {
    recommendations.push("Focus on understanding the core problem first");
  } else if (progress < 0.7) {
    recommendations.push(
      "Consider multiple approaches before committing to one",
    );
  } else {
    recommendations.push("Verify the solution covers edge cases");
  }

  // If drift is too high, recommendation is to re-align
  if (driftScore > 0.4 || predictiveDriftScore > 0.4) {
    recommendations.push(
      "EMERGENCY: Re-read original user intent and pivot back to original goals.",
    );
  }

  const isOnTrack = potentialIssues.length === 0 || progress > 0.5;

  return {
    currentStep,
    totalSteps,
    progress: Math.round(progress * 100),
    confidence: Math.round(confidence * 100) / 100,
    potentialIssues,
    recommendations,
    isOnTrack,
    driftScore: Math.round(driftScore * 100) / 100,
    driftExplanation,
    predictiveDriftScore: Math.round(predictiveDriftScore * 100) / 100,
    predictiveDriftWarning,
  };
}

// ============================================================================
// Theory of Mind Logic (Capability 36)
// ============================================================================

/** Analyze user intent and model their perspective */
function analyzeTheoryOfMind(
  task: string,
  conversationHistory?: string,
  userSkillLevel?: "beginner" | "intermediate" | "advanced" | "expert",
): TheoryOfMindAnalysis {
  // Infer skill level if not provided
  let inferredSkillLevel: "beginner" | "intermediate" | "advanced" | "expert" =
    "intermediate";

  if (userSkillLevel) {
    inferredSkillLevel = userSkillLevel;
  } else {
    // Infer from task complexity
    const technicalTerms = task.match(
      /\b(api|async|interface|abstract|generic|recursive)\b/gi,
    );
    const complexPatterns =
      task.length > 300 || /\b(architecture|system design)\b/i.test(task);

    if (technicalTerms && technicalTerms.length > 3) {
      inferredSkillLevel = "advanced";
    } else if (complexPatterns) {
      inferredSkillLevel = "expert";
    } else if (/\b(simple|basic|beginner)\b/i.test(task)) {
      inferredSkillLevel = "beginner";
    }
  }

  // Infer intent
  let inferredIntent = "get help with a task";

  if (/create|build|add|implement|make/i.test(task)) {
    inferredIntent = "build or create something new";
  } else if (/fix|debug|error|bug/i.test(task)) {
    inferredIntent = "fix an existing problem";
  } else if (/explain|what is|how does/i.test(task)) {
    inferredIntent = "understand something";
  } else if (/refactor|improve|optimize/i.test(task)) {
    inferredIntent = "improve existing code";
  } else if (/test|verify|check/i.test(task)) {
    inferredIntent = "validate something";
  }

  // Domain knowledge inference
  const domainKnowledge: string[] = [];
  if (/react|component|hook|props/i.test(task)) domainKnowledge.push("React");
  if (/node|express|api/i.test(task)) domainKnowledge.push("Backend");
  if (/database|query|sql/i.test(task)) domainKnowledge.push("Database");
  if (/docker|kubernetes|cloud/i.test(task)) domainKnowledge.push("DevOps");
  if (/test|jest|cypress/i.test(task)) domainKnowledge.push("Testing");

  // Likely goals
  const likelyGoals: string[] = [inferredIntent];
  if (/error|bug|fix/i.test(task))
    likelyGoals.push("resolve the issue quickly");
  if (/new|create|build/i.test(task)) likelyGoals.push("get working code");
  if (/refactor|improve/i.test(task)) likelyGoals.push("maintain code quality");

  // Potential concerns
  const potentialConcerns: string[] = [];
  if (/production|live|deployed/i.test(task)) {
    potentialConcerns.push("avoiding downtime");
  }
  if (/security|safe|private/i.test(task)) {
    potentialConcerns.push("security and privacy");
  }
  if (/performance|speed|fast/i.test(task)) {
    potentialConcerns.push("performance optimization");
  }

  // Communication style
  let verbosity: "terse" | "moderate" | "detailed" = "moderate";
  let technicalLevel: "casual" | "professional" | "highly_technical" =
    "professional";
  let preferredFormat: "code" | "explanation" | "mixed" = "mixed";

  if (task.includes("```") || /show me the code/i.test(task)) {
    preferredFormat = "code";
  } else if (/explain|describe|what is/i.test(task)) {
    preferredFormat = "explanation";
  }

  if (inferredSkillLevel === "beginner") {
    verbosity = "detailed";
    technicalLevel = "casual";
  } else if (inferredSkillLevel === "expert") {
    verbosity = "terse";
    technicalLevel = "highly_technical";
  }

  // Suggested responses based on model
  const suggestedResponses: string[] = [];
  if (inferredSkillLevel === "beginner") {
    suggestedResponses.push(
      "Provide step-by-step explanations with simple examples",
    );
    suggestedResponses.push("Include common pitfalls to avoid");
  } else if (inferredSkillLevel === "expert") {
    suggestedResponses.push("Focus on best practices and edge cases");
    suggestedResponses.push("Reference relevant design patterns");
  }

  // Calculate confidence
  const confidence = Math.min(
    0.9,
    0.5 +
      (domainKnowledge.length > 0 ? 0.15 : 0) +
      (conversationHistory ? 0.15 : 0),
  );

  return {
    inferredIntent,
    confidence: Math.round(confidence * 100) / 100,
    userModel: {
      skillLevel: inferredSkillLevel,
      domainKnowledge,
      likelyGoals,
      potentialConcerns,
    },
    communicationStyle: {
      verbosity,
      technicalLevel,
      preferredFormat,
    },
    suggestedResponses,
  };
}

// ============================================================================
// Abstract Reasoning Logic (Capabilities 37-40)
// ============================================================================

/** Perform abstract reasoning on concepts */
function performAbstractReasoning(task: string): AbstractReasoningResult {
  // Identify concepts in the task
  const concepts: AbstractReasoningResult["concepts"] = [];

  // Pattern-based concept extraction
  const patterns = [
    {
      name: "State Management",
      keywords: ["state", "store", "redux", "context", "reactive"],
      examples: ["React useState", "Redux store", "Vuex"],
      principles: ["Single source of truth", "Unidirectional data flow"],
    },
    {
      name: "Modularity",
      keywords: ["module", "component", "function", "class", "service"],
      examples: ["ES modules", "React components", "Microservices"],
      principles: ["Separation of concerns", "Single responsibility"],
    },
    {
      name: "Abstraction",
      keywords: ["abstract", "interface", "generic", "polymorphism"],
      examples: ["TypeScript interfaces", "Abstract classes", "Generics"],
      principles: ["Hide implementation details", "Define contracts"],
    },
    {
      name: "Asynchrony",
      keywords: ["async", "await", "promise", "callback", "event"],
      examples: ["Promise.all", "async/await", "Event listeners"],
      principles: ["Non-blocking operations", "Event-driven architecture"],
    },
    {
      name: "Testing",
      keywords: ["test", "mock", "stub", "assert", "verify"],
      examples: ["Unit tests", "Integration tests", "E2E tests"],
      principles: ["Verify behavior", "Isolate dependencies"],
    },
  ];

  const lowerTask = task.toLowerCase();
  for (const pattern of patterns) {
    const matchedKeywords = pattern.keywords.filter((k) =>
      lowerTask.includes(k.toLowerCase()),
    );

    if (matchedKeywords.length > 0) {
      concepts.push({
        name: pattern.name,
        concreteExamples: pattern.examples,
        abstractPrinciples: pattern.principles,
        relationships: matchedKeywords.map((k) => `related to: ${k}`),
      });
    }
  }

  // If no concepts matched, add a general one
  if (concepts.length === 0) {
    concepts.push({
      name: "General Problem-Solving",
      concreteExamples: ["Break down the problem", "Identify constraints"],
      abstractPrinciples: ["Define the goal", "Find the simplest solution"],
      relationships: [],
    });
  }

  // Generate analogies
  const analogies: AbstractReasoningResult["analogies"] = [];

  // Common programming analogies
  const analogyPairs = [
    {
      source: "Building a house",
      target: "Software architecture",
      mapping: [
        "blueprint → design",
        "foundation → core logic",
        "rooms → modules",
      ],
    },
    {
      source: "Cooking a recipe",
      target: "Algorithm",
      mapping: ["ingredients → inputs", "recipe → steps", "dish → output"],
    },
    {
      source: "Driving directions",
      target: "Control flow",
      mapping: [
        "GPS → function",
        "traffic → conditions",
        "destination → return value",
      ],
    },
  ];

  // Select relevant analogies based on task content
  for (const analogy of analogyPairs) {
    let validity = 0.3; // Base validity

    if (/architecture|design|structure/i.test(task)) {
      if (analogy.source === "Building a house") validity = 0.85;
    } else if (/algorithm|step|process/i.test(task)) {
      if (analogy.source === "Cooking a recipe") validity = 0.8;
    } else if (/flow|condition|branch/i.test(task)) {
      if (analogy.source === "Driving directions") validity = 0.75;
    }

    if (validity > 0.3) {
      analogies.push({
        source: analogy.source,
        target: analogy.target,
        mapping: analogy.mapping,
        validity,
      });
    }
  }

  // Limit to top 2 analogies
  analogies.sort((a, b) => b.validity - a.validity);

  // Generate generalizations
  const generalizations: string[] = [];

  if (concepts.some((c) => c.name === "State Management")) {
    generalizations.push("State changes should be predictable and traceable");
  }
  if (concepts.some((c) => c.name === "Modularity")) {
    generalizations.push(
      "Well-designed modules are easier to test and maintain",
    );
  }
  if (concepts.some((c) => c.name === "Asynchrony")) {
    generalizations.push(
      "Async operations require careful handling of timing and errors",
    );
  }

  // Default generalization
  if (generalizations.length === 0) {
    generalizations.push(
      "Breaking complex problems into smaller parts makes them more manageable",
    );
  }

  // Calculate abstraction level (0-1)
  const abstractionLevel = Math.min(
    1,
    concepts.length * 0.15 +
      analogies.length * 0.1 +
      generalizations.length * 0.1,
  );

  return {
    abstractionLevel: Math.round(abstractionLevel * 100) / 100,
    concepts,
    analogies: analogies.slice(0, 2),
    generalizations,
  };
}

// ============================================================================
// Main Metacognition Function
// ============================================================================

async function performMetacognition(
  args: MetacognitionArgs,
  _ctx: AgentContext,
): Promise<MetacognitionResult> {
  const startTime = Date.now();
  const {
    task,
    analysisType,
    conversationHistory,
    originalIntent,
    userSkillLevel,
    reasoningSteps,
    intendedToolCall,
    expectedOutcome,
  } = args;

  let contextOrchestration: ContextOrchestration | null = null;
  let theoryOfMind: TheoryOfMindAnalysis | null = null;
  let abstractReasoning: AbstractReasoningResult | null = null;
  let reasoningMonitor: ReasoningMonitorResult | null = null;

  // Run requested analyses
  if (analysisType === "orchestration" || analysisType === "all") {
    contextOrchestration = orchestrateContext(task, conversationHistory);
  }

  if (analysisType === "theory_of_mind" || analysisType === "all") {
    theoryOfMind = analyzeTheoryOfMind(
      task,
      conversationHistory,
      userSkillLevel,
    );
  }

  if (analysisType === "abstract_reasoning" || analysisType === "all") {
    abstractReasoning = performAbstractReasoning(task);
  }

  // Always run reasoning monitoring
  reasoningMonitor = monitorReasoning(
    task,
    reasoningSteps,
    originalIntent,
    intendedToolCall,
    expectedOutcome,
  );

  const processingTime = Date.now() - startTime;

  return {
    task: task.substring(0, 200),
    contextOrchestration,
    theoryOfMind,
    abstractReasoning,
    reasoningMonitor,
    metadata: {
      analysisType,
      processingTime,
    },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateMetacognitionXml(result: MetacognitionResult): string {
  const lines: string[] = [
    `# Metacognition Analysis`,
    ``,
    `**Task:** ${result.task.substring(0, 100)}${result.task.length > 100 ? "..." : ""}`,
    `**Analysis Type:** ${result.metadata.analysisType}`,
    `**Processing Time:** ${result.metadata.processingTime}ms`,
    ``,
  ];

  // Context Orchestration
  if (result.contextOrchestration) {
    const co = result.contextOrchestration;
    lines.push(`## 🎯 Context Orchestration`);
    lines.push(`**Strategy:** ${co.strategy}`);
    lines.push(`**Estimated Tokens:** ${co.estimatedTokens}`);
    lines.push(``);

    if (co.relevantContext.length > 0) {
      lines.push(`**Relevant Context:**`);
      for (let i = 0; i < Math.min(3, co.relevantContext.length); i++) {
        const preview = co.relevantContext[i].substring(0, 80);
        lines.push(
          `- ${preview}${co.relevantContext[i].length > 80 ? "..." : ""}`,
        );
      }
      lines.push(``);
    }

    if (co.discardedContext.length > 0) {
      lines.push(`**Discarded:** ${co.discardedContext.length} items`);
      lines.push(``);
    }
  }

  // Theory of Mind
  if (result.theoryOfMind) {
    const tom = result.theoryOfMind;
    lines.push(`## 🧠 Theory of Mind`);
    lines.push(`**Inferred Intent:** ${tom.inferredIntent}`);
    lines.push(`**Confidence:** ${(tom.confidence * 100).toFixed(0)}%`);
    lines.push(``);

    lines.push(`### User Model`);
    lines.push(`- **Skill Level:** ${tom.userModel.skillLevel}`);
    lines.push(
      `- **Domain Knowledge:** ${tom.userModel.domainKnowledge.join(", ") || "general"}`,
    );
    lines.push(``);

    lines.push(`### Communication Style`);
    lines.push(`- **Verbosity:** ${tom.communicationStyle.verbosity}`);
    lines.push(
      `- **Technical Level:** ${tom.communicationStyle.technicalLevel}`,
    );
    lines.push(
      `- **Preferred Format:** ${tom.communicationStyle.preferredFormat}`,
    );
    lines.push(``);

    if (tom.suggestedResponses.length > 0) {
      lines.push(`### Suggested Responses`);
      for (const response of tom.suggestedResponses) {
        lines.push(`- ${response}`);
      }
      lines.push(``);
    }
  }

  // Abstract Reasoning
  if (result.abstractReasoning) {
    const ar = result.abstractReasoning;
    lines.push(`## 🔮 Abstract Reasoning`);
    lines.push(
      `**Abstraction Level:** ${(ar.abstractionLevel * 100).toFixed(0)}%`,
    );
    lines.push(``);

    lines.push(`### Identified Concepts`);
    for (const concept of ar.concepts) {
      lines.push(`#### ${concept.name}`);
      lines.push(`**Examples:** ${concept.concreteExamples.join(", ")}`);
      lines.push(`**Principles:**`);
      for (const principle of concept.abstractPrinciples) {
        lines.push(`- ${principle}`);
      }
      lines.push(``);
    }

    if (ar.analogies.length > 0) {
      lines.push(`### Analogies`);
      for (const analogy of ar.analogies) {
        lines.push(`**${analogy.source}** → **${analogy.target}**`);
        lines.push(`Validity: ${(analogy.validity * 100).toFixed(0)}%`);
        for (const map of analogy.mapping) {
          lines.push(`- ${map}`);
        }
        lines.push(``);
      }
    }

    if (ar.generalizations.length > 0) {
      lines.push(`### Generalizations`);
      for (const gen of ar.generalizations) {
        lines.push(`- ${gen}`);
      }
      lines.push(``);
    }
  }

  // Reasoning Monitor
  if (result.reasoningMonitor) {
    const rm = result.reasoningMonitor;
    lines.push(`## 📊 Reasoning Monitor`);
    lines.push(
      `**Progress:** ${rm.currentStep}/${rm.totalSteps} steps (${rm.progress}%)`,
    );
    lines.push(`**Confidence:** ${(rm.confidence * 100).toFixed(0)}%`);
    lines.push(
      `**Status:** ${rm.isOnTrack ? "✅ On Track" : "⚠️ Potential Issues"}`,
    );
    lines.push(`**Mission Drift:** ${(rm.driftScore * 100).toFixed(0)}%`);
    if (rm.driftScore > 0) {
      lines.push(`> ${rm.driftExplanation}`);
    }
    lines.push(``);

    if (rm.potentialIssues.length > 0) {
      lines.push(`### Potential Issues`);
      for (const issue of rm.potentialIssues) {
        lines.push(`- ⚠️ ${issue}`);
      }
      lines.push(``);
    }

    if (rm.recommendations.length > 0) {
      lines.push(`### Recommendations`);
      for (const rec of rm.recommendations) {
        lines.push(`- 💡 ${rec}`);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions (Exported separately for each capability)
// ============================================================================

/** Tool: Monitor Reasoning (Capabilities 31-35) */
export const monitorReasoningTool: ToolDefinition<MetacognitionArgs> = {
  name: "monitor_reasoning",
  description:
    "Monitor and orchestrate context during reasoning. Tracks progress, identifies potential issues, and provides recommendations. Use this to stay on track during complex tasks.",
  inputSchema: MetacognitionArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Reasoning Monitor">Analyzing reasoning progress...</dyad-status>`,
    );

    const result = await performMetacognition(
      { ...args, analysisType: "orchestration" },
      ctx,
    );

    const report = generateMetacognitionXml(result);

    const monitor = result.reasoningMonitor;
    ctx.onXmlComplete(
      `<dyad-status title="Reasoning Monitor Complete">Progress: ${monitor?.progress}%, Confidence: ${(monitor?.confidence || 0) * 100}%</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Theory of Mind (Capability 36) */
export const theoryOfMindTool: ToolDefinition<MetacognitionArgs> = {
  name: "theory_of_mind",
  description:
    "Model user intentions and preferences based on their queries and conversation history. Infers skill level, communication style, and likely goals. Use this to tailor responses to the user.",
  inputSchema: MetacognitionArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Theory of Mind">Analyzing user intent...</dyad-status>`,
    );

    const result = await performMetacognition(
      { ...args, analysisType: "theory_of_mind" },
      ctx,
    );

    const report = generateMetacognitionXml(result);

    const tom = result.theoryOfMind;
    ctx.onXmlComplete(
      `<dyad-status title="Theory of Mind Complete">Intent: ${tom?.inferredIntent}, Skill: ${tom?.userModel.skillLevel}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Abstract Reasoning (Capabilities 37-40) */
export const abstractReasoningTool: ToolDefinition<MetacognitionArgs> = {
  name: "abstract_reasoning",
  description:
    "Perform abstract reasoning on concepts, identify patterns, and generate analogies. Handles abstract concepts and generalizes principles. Use this to understand underlying patterns in problems.",
  inputSchema: MetacognitionArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Abstract Reasoning">Performing abstract analysis...</dyad-status>`,
    );

    const result = await performMetacognition(
      { ...args, analysisType: "abstract_reasoning" },
      ctx,
    );

    const report = generateMetacognitionXml(result);

    const ar = result.abstractReasoning;
    ctx.onXmlComplete(
      `<dyad-status title="Abstract Reasoning Complete">${ar?.concepts.length} concepts, ${(ar?.abstractionLevel || 0) * 100}% abstraction</dyad-status>`,
    );

    return report;
  },
};
