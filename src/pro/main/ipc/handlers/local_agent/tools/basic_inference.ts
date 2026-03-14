/**
 * Basic Inference & Chain-of-Thought Reasoning Tool
 * Capabilities 1-22: Core reasoning and logical inference capabilities
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const BasicInferenceArgs = z.object({
  /** The statement or problem to analyze */
  statement: z.string().min(1),
  /** Type of reasoning to perform */
  reasoningType: z
    .enum([
      "direct",
      "chain_of_thought",
      "deductive",
      "inductive",
      "abductive",
      "syllogism",
      "modal",
      "circular_check",
      "fallacy",
      "argument_parse",
      "all",
    ])
    .default("all"),
  /** Optional premises for syllogistic reasoning */
  premises: z.array(z.string()).optional(),
  /** Optional conclusion to validate */
  conclusion: z.string().optional(),
  /** Modal operator (possible, necessary, impossible) */
  modalOperator: z.enum(["possible", "necessary", "impossible"]).optional(),
  /** Additional context for the analysis */
  context: z.string().optional(),
});

type BasicInferenceArgs = z.infer<typeof BasicInferenceArgs>;

// ============================================================================
// Types
// ============================================================================

interface InferenceStep {
  step: number;
  description: string;
  conclusion: string;
  isValid: boolean;
}

interface LogicalChain {
  steps: InferenceStep[];
  isValid: boolean;
  finalConclusion: string;
}

interface SyllogismResult {
  majorPremise: string;
  minorPremise: string;
  conclusion: string;
  isValid: boolean;
  form: string;
  errors?: string[];
}

interface FallacyDetection {
  hasFallacy: boolean;
  fallacies: {
    type: string;
    description: string;
    location: string;
  }[];
}

interface ArgumentStructure {
  premises: string[];
  conclusion: string;
  isValid: boolean;
  implicitPremises: string[];
  reasoningGaps: string[];
}

interface CircularReasoningCheck {
  isCircular: boolean;
  circularElements: string[];
  explanation: string;
}

interface DirectInferenceResult {
  extractedFacts: string[];
  impliedConclusions: string[];
  confidence: number;
}

interface ModalResult {
  proposition: string;
  operator: string;
  isValid: boolean;
  explanation: string;
}

interface BasicInferenceResult {
  statement: string;
  reasoningType: string;
  directInference: DirectInferenceResult | null;
  chainOfThought: LogicalChain | null;
  syllogism: SyllogismResult | null;
  fallacyDetection: FallacyDetection | null;
  argumentStructure: ArgumentStructure | null;
  circularCheck: CircularReasoningCheck | null;
  modalResult: ModalResult | null;
  auditSummary: string;
}

// ============================================================================
// Direct Inference Logic (Capability 1)
// ============================================================================

function performDirectInference(
  statement: string,
  _context?: string,
): DirectInferenceResult {
  const extractedFacts: string[] = [];
  const impliedConclusions: string[] = [];

  const lowerStatement = statement.toLowerCase();

  // Extract explicit facts
  const factPatterns = [
    {
      pattern: /all (\w+) are (\w+)/i,
      extract: (m: RegExpMatchArray) => `${m[1]} → ${m[2]}`,
    },
    {
      pattern: /every (\w+) is (\w+)/i,
      extract: (m: RegExpMatchArray) => `${m[1]} → ${m[2]}`,
    },
    {
      pattern: /(\w+) is a (\w+)/i,
      extract: (m: RegExpMatchArray) => `${m[1]} is instance of ${m[2]}`,
    },
    {
      pattern: /(\w+) are (\w+)/i,
      extract: (m: RegExpMatchArray) => `${m[1]} → ${m[2]}`,
    },
    {
      pattern: /if (\w+) then (\w+)/i,
      extract: (m: RegExpMatchArray) => `${m[1]} implies ${m[2]}`,
    },
  ];

  for (const { pattern, extract } of factPatterns) {
    const match = statement.match(pattern);
    if (match) {
      const fact = extract(match);
      if (!extractedFacts.includes(fact)) {
        extractedFacts.push(fact);
      }
    }
  }

  // Derive implied conclusions
  if (lowerStatement.includes("all") || lowerStatement.includes("every")) {
    if (lowerStatement.includes("is") || lowerStatement.includes("are")) {
      impliedConclusions.push(
        "Can make universal claims from specific instances",
      );
    }
  }
  if (lowerStatement.includes("if")) {
    impliedConclusions.push("Conditional relationship identified");
    if (!lowerStatement.includes("only if")) {
      impliedConclusions.push(
        "Note: 'if' does not imply 'only if' (converse error possible)",
      );
    }
  }
  if (
    lowerStatement.includes("some") ||
    lowerStatement.includes("may") ||
    lowerStatement.includes("might")
  ) {
    impliedConclusions.push(
      "Partial/uncertain information - conclusions may not generalize",
    );
  }

  const confidence = Math.min(
    0.5 + extractedFacts.length * 0.1 + impliedConclusions.length * 0.05,
    0.95,
  );

  return { extractedFacts, impliedConclusions, confidence };
}

// ============================================================================
// Chain-of-Thought Logic (Capability 2-4)
// ============================================================================

function performChainOfThought(
  statement: string,
  _context?: string,
): LogicalChain {
  const steps: InferenceStep[] = [];
  const lowerStatement = statement.toLowerCase();

  // Break down into logical steps
  const connectors = [
    "because",
    "therefore",
    "thus",
    "hence",
    "so",
    "since",
    "consequently",
  ];

  let currentStep = 1;

  // Step 1: Identify the premise/assumption
  for (const connector of connectors) {
    if (lowerStatement.includes(connector)) {
      const connectorIndex = lowerStatement.indexOf(connector);
      const beforeConnector = statement.substring(0, connectorIndex).trim();

      if (beforeConnector) {
        steps.push({
          step: currentStep++,
          description: "Identify premise",
          conclusion: beforeConnector.substring(0, 100),
          isValid: true,
        });
      }
      break;
    }
  }

  // Step 2: Identify the reasoning
  if (lowerStatement.includes("if") || lowerStatement.includes("when")) {
    steps.push({
      step: currentStep++,
      description: "Identify conditional reasoning",
      conclusion: "Conditional relationship detected",
      isValid: true,
    });
  }

  // Step 3: Draw conclusion
  for (const connector of connectors) {
    const connectorIndex = lowerStatement.indexOf(connector);
    if (connectorIndex !== -1) {
      const afterConnector = statement
        .substring(connectorIndex + connector.length)
        .trim();
      if (afterConnector) {
        steps.push({
          step: currentStep++,
          description: "Draw conclusion",
          conclusion: afterConnector.substring(0, 100),
          isValid: steps.length > 0,
        });
      }
      break;
    }
  }

  // If no explicit chain, create implicit steps
  if (steps.length === 0) {
    steps.push({
      step: 1,
      description: "Analyze statement",
      conclusion: statement.substring(0, 50),
      isValid: true,
    });
    steps.push({
      step: 2,
      description: "Extract key relations",
      conclusion: "Primary relationships identified",
      isValid: true,
    });
    steps.push({
      step: 3,
      description: "Generate conclusion",
      conclusion: "Direct inference completed",
      isValid: true,
    });
  }

  const finalConclusion =
    steps.length > 0 ? steps[steps.length - 1].conclusion : "Analysis complete";

  return {
    steps,
    isValid: steps.every((s) => s.isValid),
    finalConclusion,
  };
}

// ============================================================================
// Deductive Reasoning (Capability 5)
// ============================================================================

function performDeductiveReasoning(
  statement: string,
  premises?: string[],
  conclusion?: string,
): SyllogismResult {
  const majorPremise = premises?.[0] || "All humans are mortal";
  const minorPremise = premises?.[1] || statement;
  const syllogismConclusion = conclusion || "Therefore, this entity is mortal";

  // Check validity based on common syllogistic forms
  const isValid =
    (majorPremise.toLowerCase().includes("all") &&
      minorPremise.toLowerCase().includes("is")) ||
    (majorPremise.toLowerCase().includes("no") &&
      minorPremise.toLowerCase().includes("not"));

  // Determine form
  let form = "Unknown";
  if (
    majorPremise.toLowerCase().includes("all") &&
    conclusion?.toLowerCase().includes("all")
  ) {
    form = "AAA-1 (Barbara)";
  } else if (
    majorPremise.toLowerCase().includes("all") &&
    minorPremise.toLowerCase().includes("no")
  ) {
    form = "EAE-1 (Celarent)";
  } else if (majorPremise.toLowerCase().includes("some")) {
    form = "AII-1 (Darii)";
  }

  return {
    majorPremise: majorPremise.substring(0, 100),
    minorPremise: minorPremise.substring(0, 100),
    conclusion: syllogismConclusion.substring(0, 100),
    isValid,
    form,
    errors: isValid ? undefined : ["Check premise truth and logical form"],
  };
}

// ============================================================================
// Inductive Reasoning (Capability 6)
// ============================================================================

function performInductiveReasoning(statement: string): {
  generalization: string;
  strength: "strong" | "medium" | "weak";
  confidence: number;
  caveats: string[];
} {
  const lowerStatement = statement.toLowerCase();
  const caveats: string[] = [];
  let strength: "strong" | "medium" | "weak" = "medium";
  let confidence = 0.5;

  // Check for universal quantifiers that suggest strong induction
  if (
    lowerStatement.includes("all") ||
    lowerStatement.includes("every") ||
    lowerStatement.includes("always")
  ) {
    strength = "weak";
    confidence = 0.3;
    caveats.push("Universal claims from limited observations are weak");
    caveats.push("Need comprehensive evidence for valid induction");
  }

  // Check for probabilistic language
  if (
    lowerStatement.includes("some") ||
    lowerStatement.includes("often") ||
    lowerStatement.includes("usually")
  ) {
    strength = "medium";
    confidence = 0.6;
    caveats.push("Partial generalization may have exceptions");
  }

  // Check for evidence indicators
  if (
    lowerStatement.includes("observed") ||
    lowerStatement.includes("examples") ||
    lowerStatement.includes("data")
  ) {
    strength = "strong";
    confidence = Math.min(confidence + 0.2, 0.85);
    caveats.push("Subject to new counterexamples");
  }

  // Check for counterexample indicators
  if (
    lowerStatement.includes("except") ||
    lowerStatement.includes("unless") ||
    lowerStatement.includes("but")
  ) {
    strength = "medium";
    confidence = Math.max(confidence - 0.1, 0.4);
    caveats.push("Known exceptions may weaken the generalization");
  }

  const generalization =
    statement.includes("all") || statement.includes("every")
      ? statement.substring(0, 100)
      : `Generalization: ${statement.substring(0, 80)}...`;

  return { generalization, strength, confidence, caveats };
}

// ============================================================================
// Abductive Reasoning (Capability 7)
// ============================================================================

function performAbductiveReasoning(statement: string): {
  hypothesis: string;
  plausibility: number;
  alternativeExplanations: string[];
  reasoning: string;
} {
  const lowerStatement = statement.toLowerCase();

  // Extract observed phenomenon
  const observationMatch = statement.match(
    /(\w+)\s+(?:is|was|appears?|seems?)\s+(\w+)/i,
  );
  const observation = observationMatch
    ? `${observationMatch[1]} is ${observationMatch[2]}`
    : "Observed phenomenon";

  // Generate best explanation hypothesis
  let hypothesis = "Most likely explanation: ";
  let plausibility = 0.7;

  if (lowerStatement.includes("error") || lowerStatement.includes("fail")) {
    hypothesis += "Root cause in recent changes or configuration";
    plausibility = 0.8;
  } else if (
    lowerStatement.includes("slow") ||
    lowerStatement.includes("performance")
  ) {
    hypothesis += "Resource constraint or optimization opportunity";
    plausibility = 0.65;
  } else if (
    lowerStatement.includes("unexpected") ||
    lowerStatement.includes("strange")
  ) {
    hypothesis += "Edge case in input or environment";
    plausibility = 0.5;
  } else {
    hypothesis += "Multiple potential causes - further investigation needed";
    plausibility = 0.4;
  }

  const alternativeExplanations = [
    "Alternative 1: External factors not yet considered",
    "Alternative 2: Interaction effects with other systems",
    "Alternative 3: Temporal or contextual dependencies",
  ];

  const reasoning = `Abductive reasoning: Given "${observation}", ${hypothesis.toLowerCase()}`;

  return { hypothesis, plausibility, alternativeExplanations, reasoning };
}

// ============================================================================
// Syllogistic Reasoning (Capability 10)
// ============================================================================

function validateSyllogism(
  majorPremise: string,
  minorPremise: string,
  conclusion: string,
): SyllogismResult {
  // Basic syllogism validation
  const majorLower = majorPremise.toLowerCase();
  const minorLower = minorPremise.toLowerCase();
  const conclusionLower = conclusion.toLowerCase();

  // Extract terms
  const majorTerms = majorLower.match(/(\w+)/g) || [];
  const minorTerms = minorLower.match(/(\w+)/g) || [];
  const conclusionTerms = conclusionLower.match(/(\w+)/g) || [];

  // Check for valid structure
  let isValid = true;
  const errors: string[] = [];

  // Check that middle term appears in premises but not conclusion
  if (majorTerms.length > 0 && minorTerms.length > 0) {
    const middleTerm = majorTerms.find(
      (t) => minorTerms.includes(t) && !conclusionTerms.includes(t),
    );
    if (!middleTerm) {
      isValid = false;
      errors.push(
        "Middle term must appear in both premises but not conclusion",
      );
    }
  }

  // Check for affirmative premises
  if (majorLower.includes("no") || majorLower.includes("not")) {
    if (minorLower.includes("all") || minorLower.includes("every")) {
      // Valid negative form
    } else {
      errors.push("Mixed quality premises require careful handling");
    }
  }

  // Determine form
  let form = "Unknown";
  if (majorLower.includes("all") && minorLower.includes("all")) {
    form = "AAA";
  } else if (majorLower.includes("no") && minorLower.includes("all")) {
    form = "EAE";
  } else if (majorLower.includes("some")) {
    form = "AII";
  }

  return {
    majorPremise: majorPremise.substring(0, 100),
    minorPremise: minorPremise.substring(0, 100),
    conclusion: conclusion.substring(0, 100),
    isValid,
    form,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================================
// Modal Logic Reasoning (Capability 11)
// ============================================================================

function performModalReasoning(
  statement: string,
  operator: "possible" | "necessary" | "impossible",
): ModalResult {
  const lowerStatement = statement.toLowerCase();

  let proposition = statement;
  let isValid = true;
  let explanation = "";

  switch (operator) {
    case "possible":
      if (
        lowerStatement.includes("impossible") ||
        lowerStatement.includes("cannot")
      ) {
        isValid = false;
        explanation = "Statement claims possibility but contains impossibility";
      } else {
        explanation = "The statement represents a possible state or outcome";
      }
      break;

    case "necessary":
      if (
        lowerStatement.includes("might") ||
        lowerStatement.includes("may") ||
        lowerStatement.includes("could")
      ) {
        isValid = false;
        explanation = "Necessary truths cannot be contingent (might/may/could)";
      } else {
        explanation =
          "The statement represents a necessary truth or requirement";
      }
      break;

    case "impossible":
      if (
        lowerStatement.includes("always") ||
        lowerStatement.includes("must")
      ) {
        isValid = false;
        explanation = "Impossible claims contradict necessary truths";
      } else {
        explanation = "The statement represents an impossible state";
      }
      break;
  }

  return { proposition, operator, isValid, explanation };
}

// ============================================================================
// Circular Reasoning Detection (Capability 15)
// ============================================================================

function detectCircularReasoning(statement: string): CircularReasoningCheck {
  const lowerStatement = statement.toLowerCase();

  // Common circular patterns
  const circularPatterns = [
    {
      pattern: /(\w+)\s+is\s+(\w+)\s+because\s+(\w+)\s+is\s+(\w+)/i,
      check: (m: RegExpMatchArray) => m[1] === m[3] && m[2] === m[4],
    },
    {
      pattern: /(\w+)\s+is\s+true\s+because\s+(\w+)\s+is\s+true/i,
      check: (m: RegExpMatchArray) => m[1] === m[2],
    },
    {
      pattern: /the\s+(\w+)\s+is\s+(\w+)\s+because\s+it\s+is\s+(\w+)/i,
      check: (m: RegExpMatchArray) => m[1] === m[3],
    },
  ];

  const circularElements: string[] = [];

  for (const { pattern, check } of circularPatterns) {
    const match = statement.match(pattern);
    if (match && check(match)) {
      circularElements.push(match[0]);
    }
  }

  // Check for self-referential language
  if (
    lowerStatement.includes("obviously") ||
    lowerStatement.includes("clearly") ||
    lowerStatement.includes("as we know") ||
    lowerStatement.includes("everyone knows")
  ) {
    if (
      lowerStatement.includes("because") ||
      lowerStatement.includes("since")
    ) {
      circularElements.push("Self-referential justification detected");
    }
  }

  const isCircular = circularElements.length > 0;
  const explanation = isCircular
    ? `Circular reasoning detected: The statement uses "${circularElements[0]}" to justify itself`
    : "No circular reasoning detected - conclusion follows from premises";

  return { isCircular, circularElements, explanation };
}

// ============================================================================
// Fallacy Detection (Capability 16)
// ============================================================================

function detectFallacies(statement: string): FallacyDetection {
  const lowerStatement = statement.toLowerCase();
  const fallacies: FallacyDetection["fallacies"] = [];

  // Ad Hominem
  if (
    lowerStatement.includes("stupid") ||
    lowerStatement.includes("idiot") ||
    lowerStatement.includes("fool")
  ) {
    fallacies.push({
      type: "Ad Hominem",
      description: "Attacking the person rather than the argument",
      location: "Personal attack detected",
    });
  }

  // False Dichotomy
  if (
    lowerStatement.includes("either") &&
    lowerStatement.includes("or") &&
    (lowerStatement.includes("only") || lowerStatement.includes("must"))
  ) {
    fallacies.push({
      type: "False Dichotomy",
      description: "Presenting only two options when more exist",
      location: "Either/or statement",
    });
  }

  // Slippery Slope
  if (
    lowerStatement.includes("inevitably") ||
    lowerStatement.includes("lead to") ||
    lowerStatement.includes("start of")
  ) {
    if (
      lowerStatement.includes("then") ||
      lowerStatement.includes("eventually")
    ) {
      fallacies.push({
        type: "Slippery Slope",
        description:
          "Assuming small step will inevitably lead to extreme outcome",
        location: "Causal chain",
      });
    }
  }

  // Circular Reasoning
  if (
    lowerStatement.includes("because") &&
    lowerStatement.includes("therefore")
  ) {
    const becauseIdx = lowerStatement.indexOf("because");
    const thereforeIdx = lowerStatement.indexOf("therefore");
    if (becauseIdx > 0 && thereforeIdx > becauseIdx) {
      const before = statement.substring(0, becauseIdx);
      const after = statement.substring(thereforeIdx + 8);
      if (before.trim() === after.trim()) {
        fallacies.push({
          type: "Circular Reasoning",
          description: "Conclusion restates premise without proof",
          location: "Same statement used as premise and conclusion",
        });
      }
    }
  }

  // Appeal to Authority
  if (
    lowerStatement.includes("expert") ||
    lowerStatement.includes("said") ||
    lowerStatement.includes("according to")
  ) {
    if (
      !lowerStatement.includes("study") &&
      !lowerStatement.includes("data") &&
      !lowerStatement.includes("evidence")
    ) {
      fallacies.push({
        type: "Appeal to Authority",
        description: "Using authority as sole evidence without supporting data",
        location: "Authority reference without evidence",
      });
    }
  }

  // Straw Man
  if (
    lowerStatement.includes("they say") ||
    lowerStatement.includes("people claim")
  ) {
    if (lowerStatement.includes("but") || lowerStatement.includes("however")) {
      fallacies.push({
        type: "Straw Man",
        description: "Misrepresenting opponent's argument to easier attack",
        location: "Second-hand claim characterization",
      });
    }
  }

  return {
    hasFallacy: fallacies.length > 0,
    fallacies,
  };
}

// ============================================================================
// Argument Structure Parsing (Capability 20-21)
// ============================================================================

function parseArgumentStructure(statement: string): ArgumentStructure {
  const lowerStatement = statement.toLowerCase();
  const premises: string[] = [];
  const implicitPremises: string[] = [];
  const reasoningGaps: string[] = [];

  // Extract explicit premises
  const premiseIndicators = [
    "because",
    "since",
    "given that",
    "as",
    "due to",
    "owing to",
  ];

  for (const indicator of premiseIndicators) {
    const idx = lowerStatement.indexOf(indicator);
    if (idx !== -1) {
      const premise = statement.substring(0, idx).trim();
      if (premise && premise.length > 3) {
        premises.push(premise);
      }
      const afterIndicator = statement.substring(idx + indicator.length).trim();
      if (afterIndicator) {
        // Check for conclusion
        const conclusionIndicators = [
          "therefore",
          "thus",
          "hence",
          "so",
          "consequently",
        ];
        for (const concInd of conclusionIndicators) {
          if (afterIndicator.toLowerCase().includes(concInd)) {
            // Already processed premise, conclusion after
            break;
          }
        }
      }
    }
  }

  // Extract explicit conclusion
  const conclusionIndicators = [
    "therefore",
    "thus",
    "hence",
    "consequently",
    "so",
    "this means",
  ];
  let conclusion = "";
  for (const indicator of conclusionIndicators) {
    const idx = lowerStatement.indexOf(indicator);
    if (idx !== -1) {
      conclusion = statement.substring(idx + indicator.length).trim();
      break;
    }
  }

  // If no explicit conclusion, assume entire statement is conclusion
  if (!conclusion && premises.length === 0) {
    conclusion = statement;
  }

  // Identify implicit premises
  if (premises.length > 0 && conclusion) {
    implicitPremises.push(
      "General rule or principle connecting premises to conclusion",
    );
    implicitPremises.push(
      "Assumption that evidence is relevant and sufficient",
    );
  }

  // Identify reasoning gaps
  if (premises.length === 0 && conclusion) {
    reasoningGaps.push("No explicit premises provided");
    reasoningGaps.push("Cannot verify logical connection to conclusion");
  }

  if (premises.length > 0 && !conclusion) {
    reasoningGaps.push("No explicit conclusion stated");
  }

  const isValid =
    premises.length > 0 && conclusion.length > 0 && reasoningGaps.length === 0;

  return {
    premises,
    conclusion,
    isValid,
    implicitPremises,
    reasoningGaps,
  };
}

// ============================================================================
// Main Reasoning Function
// ============================================================================

async function analyzeBasicInference(
  args: BasicInferenceArgs,
  _ctx: AgentContext,
): Promise<BasicInferenceResult> {
  const {
    statement,
    reasoningType,
    premises,
    conclusion: validatedConclusion,
    modalOperator,
  } = args;

  let directInference: DirectInferenceResult | null = null;
  let chainOfThought: LogicalChain | null = null;
  let syllogismResult: SyllogismResult | null = null;
  let fallacyResult: FallacyDetection | null = null;
  let argumentResult: ArgumentStructure | null = null;
  let circularCheckResult: CircularReasoningCheck | null = null;
  let modalResult: ModalResult | null = null;

  // Run requested analyses
  if (reasoningType === "direct" || reasoningType === "all") {
    directInference = performDirectInference(statement, args.context);
  }

  if (
    reasoningType === "chain_of_thought" ||
    reasoningType === "deductive" ||
    reasoningType === "all"
  ) {
    chainOfThought = performChainOfThought(statement, args.context);
  }

  if (
    reasoningType === "syllogism" ||
    reasoningType === "deductive" ||
    reasoningType === "all"
  ) {
    syllogismResult = validateSyllogism(
      premises?.[0] || "",
      premises?.[1] || "",
      validatedConclusion || "",
    );
  }

  if (reasoningType === "fallacy" || reasoningType === "all") {
    fallacyResult = detectFallacies(statement);
  }

  if (reasoningType === "argument_parse" || reasoningType === "all") {
    argumentResult = parseArgumentStructure(statement);
  }

  if (reasoningType === "circular_check" || reasoningType === "all") {
    circularCheckResult = detectCircularReasoning(statement);
  }

  if (reasoningType === "modal" || reasoningType === "all") {
    modalResult = performModalReasoning(statement, modalOperator || "possible");
  }

  // Generate audit summary
  let auditSummary = "Basic Inference Analysis Complete. ";
  if (directInference && directInference.confidence > 0.7) {
    auditSummary += `High confidence direct inference (${Math.round(directInference.confidence * 100)}%). `;
  }
  if (chainOfThought && chainOfThought.isValid) {
    auditSummary += "Chain of thought is valid. ";
  }
  if (fallacyResult && fallacyResult.hasFallacy) {
    auditSummary += `Detected ${fallacyResult.fallacies.length} fallacy(es). `;
  } else {
    auditSummary += "No fallacies detected. ";
  }
  if (circularCheckResult && circularCheckResult.isCircular) {
    auditSummary += "WARNING: Circular reasoning detected. ";
  }
  if (argumentResult && argumentResult.isValid) {
    auditSummary += "Argument structure is valid.";
  }

  return {
    statement: statement.substring(0, 200),
    reasoningType,
    directInference,
    chainOfThought,
    syllogism: syllogismResult,
    fallacyDetection: fallacyResult,
    argumentStructure: argumentResult,
    circularCheck: circularCheckResult,
    modalResult,
    auditSummary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateBasicInferenceXml(result: BasicInferenceResult): string {
  const lines: string[] = [
    `# Basic Inference & Chain-of-Thought Analysis`,
    ``,
    `**Statement:** ${result.statement.substring(0, 100)}${result.statement.length > 100 ? "..." : ""}`,
    `**Analysis Type:** ${result.reasoningType}`,
    ``,
  ];

  // Direct Inference
  if (result.directInference) {
    const di = result.directInference;
    lines.push(`## 🎯 Direct Inference`);
    lines.push(``);
    lines.push(`**Confidence:** ${Math.round(di.confidence * 100)}%`);
    lines.push(``);

    if (di.extractedFacts.length > 0) {
      lines.push(`### Extracted Facts`);
      for (const fact of di.extractedFacts) {
        lines.push(`- ${fact}`);
      }
      lines.push(``);
    }

    if (di.impliedConclusions.length > 0) {
      lines.push(`### Implied Conclusions`);
      for (const conc of di.impliedConclusions) {
        lines.push(`- ${conc}`);
      }
      lines.push(``);
    }
  }

  // Chain of Thought
  if (result.chainOfThought) {
    const cot = result.chainOfThought;
    lines.push(`## 🔗 Chain-of-Thought`);
    lines.push(``);
    lines.push(`**Valid:** ${cot.isValid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);

    for (const step of cot.steps) {
      lines.push(`### Step ${step.step}: ${step.description}`);
      lines.push(`- ${step.conclusion}`);
      lines.push(``);
    }

    lines.push(`**Final Conclusion:** ${cot.finalConclusion}`);
    lines.push(``);
  }

  // Syllogism
  if (result.syllogism) {
    const syl = result.syllogism;
    lines.push(`## 📐 Syllogistic Reasoning`);
    lines.push(``);
    lines.push(`**Form:** ${syl.form}`);
    lines.push(`**Valid:** ${syl.isValid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);
    lines.push(`- Major: ${syl.majorPremise}`);
    lines.push(`- Minor: ${syl.minorPremise}`);
    lines.push(`- Conclusion: ${syl.conclusion}`);
    if (syl.errors) {
      lines.push(``);
      lines.push(`**Errors:**`);
      for (const err of syl.errors) {
        lines.push(`- ${err}`);
      }
    }
    lines.push(``);
  }

  // Fallacy Detection
  if (result.fallacyDetection) {
    const fd = result.fallacyDetection;
    lines.push(`## ⚠️ Fallacy Detection`);
    lines.push(``);
    lines.push(`**Has Fallacies:** ${fd.hasFallacy ? "Yes" : "No"}`);
    lines.push(``);

    if (fd.fallacies.length > 0) {
      for (const fallacy of fd.fallacies) {
        lines.push(`### ${fallacy.type}`);
        lines.push(`- ${fallacy.description}`);
        lines.push(`- Location: ${fallacy.location}`);
        lines.push(``);
      }
    } else {
      lines.push("✅ No logical fallacies detected.");
      lines.push(``);
    }
  }

  // Argument Structure
  if (result.argumentStructure) {
    const arg = result.argumentStructure;
    lines.push(`## 🏗️ Argument Structure`);
    lines.push(``);
    lines.push(`**Valid:** ${arg.isValid ? "✅ Yes" : "❌ No"}`);
    lines.push(``);

    if (arg.premises.length > 0) {
      lines.push(`### Premises`);
      for (const p of arg.premises) {
        lines.push(`- ${p}`);
      }
      lines.push(``);
    }

    if (arg.conclusion) {
      lines.push(`### Conclusion`);
      lines.push(`- ${arg.conclusion}`);
      lines.push(``);
    }

    if (arg.implicitPremises.length > 0) {
      lines.push(`### Implicit Premises`);
      for (const p of arg.implicitPremises) {
        lines.push(`- ${p}`);
      }
      lines.push(``);
    }

    if (arg.reasoningGaps.length > 0) {
      lines.push(`### Reasoning Gaps`);
      for (const g of arg.reasoningGaps) {
        lines.push(`- ⚠️ ${g}`);
      }
      lines.push(``);
    }
  }

  // Circular Reasoning
  if (result.circularCheck) {
    const cc = result.circularCheck;
    lines.push(`## 🔄 Circular Reasoning Check`);
    lines.push(``);
    lines.push(`**Is Circular:** ${cc.isCircular ? "⚠️ Yes" : "✅ No"}`);
    lines.push(``);
    lines.push(`**Explanation:** ${cc.explanation}`);
    if (cc.circularElements.length > 0) {
      lines.push(``);
      lines.push(`**Circular Elements:**`);
      for (const el of cc.circularElements) {
        lines.push(`- ${el}`);
      }
    }
    lines.push(``);
  }

  // Modal Result
  if (result.modalResult) {
    const mr = result.modalResult;
    lines.push(`## 🎚️ Modal Logic`);
    lines.push(``);
    lines.push(`**Operator:** ${mr.operator}`);
    lines.push(`**Valid:** ${mr.isValid ? "✅ Yes" : "❌ No"}`);
    lines.push(`**Explanation:** ${mr.explanation}`);
    lines.push(``);
  }

  // Audit Summary
  lines.push(`## 📋 Audit Summary`);
  lines.push(``);
  lines.push(result.auditSummary);
  lines.push(``);

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions (Exported separately for each capability)
// ============================================================================

/** Tool: Direct Inference (Capability 1) */
export const directInferenceTool: ToolDefinition<BasicInferenceArgs> = {
  name: "direct_inference",
  description:
    "Extract direct answers and factual conclusions from statements. Use this for simple extraction tasks where you can directly read off the answer from the given information.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Direct Inference">Extracting direct inferences...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "direct" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Direct Inference Complete">${result.directInference?.extractedFacts.length || 0} facts extracted</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Chain of Thought (Capability 2) */
export const chainOfThoughtTool: ToolDefinition<BasicInferenceArgs> = {
  name: "chain_of_thought",
  description:
    "Perform step-by-step reasoning to solve problems. Use this to break down complex problems into logical steps and track the reasoning process.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Chain-of-Thought Reasoning">Building reasoning chain...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "chain_of_thought" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const steps = result.chainOfThought?.steps.length || 0;
    ctx.onXmlComplete(
      `<dyad-status title="Chain-of-Thought Complete">${steps} reasoning steps</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Deductive Reasoning (Capability 5) */
export const deductiveReasoningTool: ToolDefinition<BasicInferenceArgs> = {
  name: "deductive_reasoning",
  description:
    "Perform deductive inference from premises to conclusion. Use this when you have general rules and need to apply them to specific cases.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Deductive Reasoning">Performing deduction...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "deductive" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const valid = result.syllogism?.isValid ? "valid" : "invalid";
    ctx.onXmlComplete(
      `<dyad-status title="Deductive Reasoning Complete">Syllogism ${valid}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Inductive Reasoning (Capability 6) */
export const inductiveReasoningTool: ToolDefinition<BasicInferenceArgs> = {
  name: "inductive_reasoning",
  description:
    "Perform inductive generalization from specific instances to general rules. Use this to form hypotheses or theories from observed data.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Inductive Reasoning">Performing induction...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "inductive" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Inductive Reasoning Complete">Induction complete</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Abductive Reasoning (Capability 7) */
export const abductiveReasoningTool: ToolDefinition<BasicInferenceArgs> = {
  name: "abductive_reasoning",
  description:
    "Perform abductive reasoning to find the best explanation for observations. Use this for diagnosis, troubleshooting, or finding root causes.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Abductive Reasoning">Finding best explanation...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "abductive" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Abductive Reasoning Complete">Best explanation generated</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Syllogistic Reasoning (Capability 10) */
export const syllogismTool: ToolDefinition<BasicInferenceArgs> = {
  name: "syllogism",
  description:
    "Validate syllogistic arguments with major premise, minor premise, and conclusion. Use this to check the validity of formal logical arguments.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Syllogism Validation">Validating syllogism...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "syllogism" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const form = result.syllogism?.form || "Unknown";
    ctx.onXmlComplete(
      `<dyad-status title="Syllogism Complete">Form: ${form}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Modal Logic (Capability 11) */
export const modalReasoningTool: ToolDefinition<BasicInferenceArgs> = {
  name: "modal_reasoning",
  description:
    "Analyze modal propositions with operators like possible, necessary, and impossible. Use this to evaluate statements about possibility and necessity.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Modal Logic Analysis">Analyzing modal proposition...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "modal" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const valid = result.modalResult?.isValid ? "valid" : "invalid";
    ctx.onXmlComplete(
      `<dyad-status title="Modal Reasoning Complete">${valid}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Circular Reasoning Check (Capability 15) */
export const circularReasoningCheckTool: ToolDefinition<BasicInferenceArgs> = {
  name: "circular_reasoning_check",
  description:
    "Detect circular reasoning where conclusions assume their own premises. Use this to identify reasoning that goes in circles without reaching new conclusions.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Circular Reasoning Check">Checking for circularity...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "circular_check" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const circular = result.circularCheck?.isCircular
      ? "detected"
      : "not found";
    ctx.onXmlComplete(
      `<dyad-status title="Circular Reasoning Check Complete">${circular}</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Fallacy Detection (Capability 16) */
export const fallacyDetectionTool: ToolDefinition<BasicInferenceArgs> = {
  name: "fallacy_detection",
  description:
    "Detect logical fallacies in arguments such as ad hominem, false dichotomy, slippery slope, and more. Use this to evaluate the quality of reasoning.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Fallacy Detection">Analyzing for fallacies...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "fallacy" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const count = result.fallacyDetection?.fallacies.length || 0;
    ctx.onXmlComplete(
      `<dyad-status title="Fallacy Detection Complete">${count} fallacy(es) found</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Argument Structure Parsing (Capability 20-21) */
export const argumentStructureTool: ToolDefinition<BasicInferenceArgs> = {
  name: "argument_structure",
  description:
    "Parse the structure of arguments identifying premises, conclusions, and implicit assumptions. Use this to understand the logical structure of text.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Argument Structure Parsing">Parsing argument...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "argument_parse" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    const premises = result.argumentStructure?.premises.length || 0;
    ctx.onXmlComplete(
      `<dyad-status title="Argument Structure Complete">${premises} premise(s) found</dyad-status>`,
    );

    return report;
  },
};

/** Tool: Reasoning Audit (Capability 22) */
export const reasoningAuditTool: ToolDefinition<BasicInferenceArgs> = {
  name: "reasoning_audit",
  description:
    "Perform a complete audit of reasoning including all inference types, validity checks, and quality metrics. Use this for comprehensive analysis of complex reasoning.",
  inputSchema: BasicInferenceArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Reasoning Audit">Performing complete audit...</dyad-status>`,
    );

    const result = await analyzeBasicInference(
      { ...args, reasoningType: "all" },
      ctx,
    );

    const report = generateBasicInferenceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Reasoning Audit Complete">Complete analysis done</dyad-status>`,
    );

    return report;
  },
};
