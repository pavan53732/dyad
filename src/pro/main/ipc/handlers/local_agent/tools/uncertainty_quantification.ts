/**
 * Uncertainty Quantification Tools
 * Capabilities 41-60: Uncertainty & Confidence reasoning
 */
import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const UncertaintyInputSchema = z.object({
  statement: z.string().min(1),
  analysisType: z
    .enum([
      "uncertainty",
      "confidence",
      "evidence",
      "bayesian",
      "entropy",
      "sensitivity",
      "risk",
      "ambiguity",
      "calibration",
      "all",
    ])
    .default("all"),
  priorProbability: z.number().min(0).max(1).optional(),
  likelihood: z.number().min(0).max(1).optional(),
  evidence: z.string().optional(),
  context: z.string().optional(),
});

type UncertaintyInput = z.infer<typeof UncertaintyInputSchema>;

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Quantify Uncertainty (Capability 41)
 * Measure uncertainty levels in a given statement or reasoning
 */
export const quantifyUncertaintyTool: ToolDefinition = {
  name: "quantify_uncertainty",
  description:
    "Measure uncertainty levels in a given statement or reasoning. Provides quantitative uncertainty metrics based on available information.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement, context: ctx } = input;

    // Analyze uncertainty based on linguistic markers and content
    const uncertaintyIndicators = [
      "might",
      "may",
      "could",
      "possibly",
      "probably",
      "perhaps",
      "likely",
      "unlikely",
      "uncertain",
      "unclear",
      "depends",
      "variable",
      "variable",
      "unknown",
      "ambiguous",
    ];

    const lowerStatement = statement.toLowerCase();
    const foundIndicators = uncertaintyIndicators.filter((ind) =>
      lowerStatement.includes(ind),
    );
    const indicatorRatio =
      (foundIndicators.length / Math.max(1, statement.split(" ").length)) * 100;

    // Calculate base uncertainty score
    let uncertaintyScore = 0.3 + indicatorRatio * 0.1;
    uncertaintyScore = Math.min(0.95, Math.max(0.05, uncertaintyScore));

    // Add context-based adjustments
    if (ctx?.includes("prediction")) uncertaintyScore += 0.1;
    if (ctx?.includes("future")) uncertaintyScore += 0.15;
    if (ctx?.includes("fact")) uncertaintyScore -= 0.2;

    const uncertaintyLevel =
      uncertaintyScore < 0.3
        ? "low"
        : uncertaintyScore < 0.6
          ? "medium"
          : "high";

    return `<tool_result tool="quantify_uncertainty" capability="41">
  <uncertainty_score>${uncertaintyScore.toFixed(2)}</uncertainty_score>
  <uncertainty_level>${uncertaintyLevel}</uncertainty_level>
  <indicators_found count="${foundIndicators.length}">${foundIndicators.map((i) => `<indicator>${i}</indicator>`).join("")}</indicators_found>
  <analysis>
    <base_uncertainty>${(uncertaintyScore * 100).toFixed(1)}%</base_uncertainty>
    <context_adjustments>${ctx ? "applied" : "none"}</context_adjustments>
  </analysis>
</tool_result>`;
  },
};

/**
 * Confidence Score (Capability 42)
 * Calculate confidence in a given answer or reasoning
 */
export const confidenceScoreTool: ToolDefinition = {
  name: "confidence_score",
  description:
    "Calculate the confidence level in a given answer or reasoning based on evidence quality and reasoning soundness.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement, evidence } = input;

    // Base confidence starts at 0.5
    let confidence = 0.5;

    // Evidence-based adjustments
    if (evidence) {
      const evidenceStrength =
        evidence.length > 100 ? 0.3 : evidence.length > 50 ? 0.2 : 0.1;
      confidence += evidenceStrength;
    }

    // Statement-based adjustments
    const factualIndicators = [
      "fact",
      "known",
      "proven",
      "established",
      "certain",
      "definite",
    ];
    const hasFactual = factualIndicators.some((ind) =>
      statement.toLowerCase().includes(ind),
    );
    if (hasFactual) confidence += 0.2;

    // Reasoning complexity adjustments
    const complexityPenalty = statement.length > 500 ? -0.1 : 0;
    confidence += complexityPenalty;

    confidence = Math.min(0.99, Math.max(0.01, confidence));

    const confidenceLevel =
      confidence < 0.3 ? "low" : confidence < 0.7 ? "medium" : "high";

    return `<tool_result tool="confidence_score" capability="42">
  <confidence>${confidence.toFixed(2)}</confidence>
  <confidence_level>${confidenceLevel}</confidence_level>
  <factors>
    <base_confidence>0.50</base_confidence>
    <evidence_contribution>${evidence ? (evidence.length > 100 ? 0.3 : 0.2).toFixed(2) : "0.00"}</evidence_contribution>
    <factual_indicator>${hasFactual ? "0.20" : "0.00"}</factual_indicator>
    <complexity_penalty>${complexityPenalty.toFixed(2)}</complexity_penalty>
  </factors>
</tool_result>`;
  },
};

/**
 * Evidence Strength (Capability 43)
 * Assess the quality and strength of evidence
 */
export const evidenceStrengthTool: ToolDefinition = {
  name: "evidence_strength",
  description:
    "Assess the quality, reliability, and strength of evidence provided for a claim or conclusion.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { evidence } = input;

    let strength = 0.3; // Base strength

    if (evidence) {
      // Length-based strength
      strength +=
        evidence.length > 200 ? 0.3 : evidence.length > 100 ? 0.2 : 0.1;

      // Source indicators
      const reliableSources = [
        "study",
        "research",
        "data",
        "experiment",
        "survey",
        "analysis",
      ];
      const hasReliable = reliableSources.some((s) =>
        evidence.toLowerCase().includes(s),
      );
      if (hasReliable) strength += 0.2;

      // Quantitative indicators
      const hasNumbers = /\d+/.test(evidence);
      if (hasNumbers) strength += 0.1;
    }

    strength = Math.min(1.0, Math.max(0.0, strength));

    const strengthLevel =
      strength < 0.3 ? "weak" : strength < 0.6 ? "moderate" : "strong";

    return `<tool_result tool="evidence_strength" capability="43">
  <strength>${strength.toFixed(2)}</strength>
  <strength_level>${strengthLevel}</strength_level>
  <assessment>
    <evidence_provided>${evidence ? "yes" : "no"}</evidence_provided>
    <evidence_length>${evidence?.length || 0}</evidence_length>
    <reliable_sources>${evidence && reliableSources.some((s) => evidence.toLowerCase().includes(s)) ? "detected" : "none"}</reliable_sources>
    <quantitative_data>${evidence && /\d+/.test(evidence) ? "present" : "absent"}</quantitative_data>
  </assessment>
</tool_result>`;
  },
};

/**
 * Bayesian Update (Capability 45)
 * Update beliefs using Bayesian inference
 */
export const bayesianUpdateTool: ToolDefinition = {
  name: "bayesian_update",
  description:
    "Update probability beliefs based on new evidence using Bayesian inference.",
  inputSchema: UncertaintyInputSchema.extend({
    priorProbability: z.number().min(0).max(1),
    likelihood: z.number().min(0).max(1),
  }),
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { priorProbability = 0.5, likelihood = 0.5, evidence } = input;

    // Bayes' theorem: P(H|E) = P(E|H) * P(H) / P(E)
    // P(E) = P(E|H) * P(H) + P(E|~H) * P(~H)
    // Assuming P(E|~H) = 1 - likelihood for simplicity
    const prior = priorProbability;
    const likelihoodGivenH = likelihood;
    const likelihoodGivenNotH = 1 - likelihood;

    const probabilityOfEvidence =
      likelihoodGivenH * prior + likelihoodGivenNotH * (1 - prior);
    const posterior = (likelihoodGivenH * prior) / probabilityOfEvidence;

    const normalizedPosterior = Math.min(0.9999, Math.max(0.0001, posterior));

    const beliefChange = normalizedPosterior - prior;
    const direction =
      beliefChange > 0
        ? "increased"
        : beliefChange < 0
          ? "decreased"
          : "unchanged";

    return `<tool_result tool="bayesian_update" capability="45">
  <prior>${prior.toFixed(4)}</prior>
  <likelihood>${likelihoodGivenH.toFixed(4)}</likelihood>
  <posterior>${normalizedPosterior.toFixed(4)}</posterior>
  <belief_change>
    <direction>${direction}</direction>
    <magnitude>${Math.abs(beliefChange).toFixed(4)}</magnitude>
  </belief_change>
  <bayes_calculation>
    <p_evidence>${probabilityOfEvidence.toFixed(4)}</p_evidence>
  </bayes_calculation>
  <interpretation>
    ${evidence ? `<evidence>${evidence}</evidence>` : ""}
    <conclusion>Given the evidence, the probability ${direction} from ${(prior * 100).toFixed(1)}% to ${(normalizedPosterior * 100).toFixed(1)}%</conclusion>
  </interpretation>
</tool_result>`;
  },
};

/**
 * Entropy Measure (Capability 46)
 * Measure information entropy
 */
export const entropyMeasureTool: ToolDefinition = {
  name: "entropy_measure",
  description:
    "Calculate the Shannon entropy of a probability distribution to measure uncertainty/information content.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement } = input;

    // Estimate probability distribution from statement characteristics
    // In a real implementation, this would analyze actual probability distributions
    const wordCount = statement.split(/\s+/).length;
    const uniqueWords = new Set(statement.toLowerCase().split(/\s+/)).size;
    const vocabularyRichness = uniqueWords / Math.max(1, wordCount);

    // Estimate entropy based on vocabulary richness (proxy for distributional uncertainty)
    // Higher richness = more uncertainty about the "true" distribution
    const estimatedEntropy =
      -vocabularyRichness * Math.log2(Math.max(0.01, vocabularyRichness));
    const normalizedEntropy = Math.min(1.0, estimatedEntropy / 4.5); // Max entropy for English ~4.5 bits

    const entropyLevel =
      normalizedEntropy < 0.3
        ? "low"
        : normalizedEntropy < 0.6
          ? "medium"
          : "high";

    return `<tool_result tool="entropy_measure" capability="46">
  <entropy_bits>${estimatedEntropy.toFixed(3)}</entropy_bits>
  <normalized_entropy>${normalizedEntropy.toFixed(3)}</normalized_entropy>
  <entropy_level>${entropyLevel}</entropy_level>
  <analysis>
    <word_count>${wordCount}</word_count>
    <unique_words>${uniqueWords}</unique_words>
    <vocabulary_richness>${vocabularyRichness.toFixed(3)}</vocabulary_richness>
  </analysis>
  <interpretation>
    <information_content>${entropyLevel === "high" ? "High information diversity" : entropyLevel === "medium" ? "Moderate information diversity" : "Low information diversity"}</information_content>
  </interpretation>
</tool_result>`;
  },
};

/**
 * Sensitivity Analysis (Capability 48)
 * Analyze how changes in parameters affect outcomes
 */
export const sensitivityAnalysisTool: ToolDefinition = {
  name: "sensitivity_analysis",
  description:
    "Analyze how sensitive a result is to changes in input parameters.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement } = input;

    // Estimate sensitivity based on statement complexity and conditional language
    const hasConditionals = /\b(if|when|unless|depending|provided)\b/i.test(
      statement,
    );
    const hasComparisons =
      /\b(more|less|greater|smaller|better|worse|increase|decrease)\b/i.test(
        statement,
      );
    const hasUncertainty = /\b(might|could|may|possibly|probably)\b/i.test(
      statement,
    );

    let sensitivityScore = 0.3;
    if (hasConditionals) sensitivityScore += 0.25;
    if (hasComparisons) sensitivityScore += 0.2;
    if (hasUncertainty) sensitivityScore += 0.15;

    sensitivityScore = Math.min(0.95, Math.max(0.05, sensitivityScore));

    const sensitivityLevel =
      sensitivityScore < 0.3
        ? "low"
        : sensitivityScore < 0.6
          ? "medium"
          : "high";

    // Identify key sensitive factors
    const factors = [];
    if (hasConditionals) factors.push("conditional_dependencies");
    if (hasComparisons) factors.push("comparative_parameters");
    if (hasUncertainty) factors.push("uncertain_inputs");

    return `<tool_result tool="sensitivity_analysis" capability="48">
  <sensitivity_score>${sensitivityScore.toFixed(2)}</sensitivity_score>
  <sensitivity_level>${sensitivityLevel}</sensitivity_level>
  <sensitive_factors count="${factors.length}">
    ${factors.map((f) => `<factor type="${f}">detected</factor>`).join("")}
  </sensitive_factors>
  <recommendation>
    ${
      sensitivityLevel === "high"
        ? "High sensitivity to parameter changes - verify all assumptions"
        : sensitivityLevel === "medium"
          ? "Moderate sensitivity - review key parameters"
          : "Low sensitivity - results relatively stable"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Confidence Interval (Capability 49)
 * Calculate confidence intervals for estimates
 */
export const confidenceIntervalTool: ToolDefinition = {
  name: "confidence_interval",
  description:
    "Calculate confidence intervals for a given estimate or prediction.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement, evidence } = input;

    // Estimate point and interval based on statement characteristics
    // This is a simplified estimation - real implementation would use actual data
    const hasNumbers = statement.match(/\d+/g) || [];
    const baseEstimate = hasNumbers.length > 0 ? parseFloat(hasNumbers[0]) : 50;

    // Base uncertainty from evidence
    const evidenceLength = evidence?.length || 0;
    const baseUncertainty =
      evidenceLength > 100 ? 0.1 : evidenceLength > 50 ? 0.2 : 0.3;

    // Calculate 95% confidence interval (approximation)
    const margin = baseEstimate * baseUncertainty;
    const lowerBound = Math.max(
      0,
      baseEstimate - (1.96 * margin) / Math.sqrt(100),
    ); // Approximate SE
    const upperBound = baseEstimate + (1.96 * margin) / Math.sqrt(100);

    const intervalWidth = upperBound - lowerBound;
    const relativeWidth = intervalWidth / Math.max(1, baseEstimate);

    const precision =
      relativeWidth < 0.1 ? "high" : relativeWidth < 0.3 ? "medium" : "low";

    return `<tool_result tool="confidence_interval" capability="49">
  <point_estimate>${baseEstimate.toFixed(2)}</point_estimate>
  <confidence_level>95%</confidence_level>
  <interval>
    <lower>${lowerBound.toFixed(2)}</lower>
    <upper>${upperBound.toFixed(2)}</upper>
  </interval>
  <precision>${precision}</precision>
  <width>
    <absolute>${intervalWidth.toFixed(2)}</absolute>
    <relative>${(relativeWidth * 100).toFixed(1)}%</relative>
  </width>
</tool_result>`;
  },
};

/**
 * Risk Assessment (Capability 52)
 * Assess risk probability and impact
 */
export const riskAssessmentTool: ToolDefinition = {
  name: "risk_assessment",
  description:
    "Assess the probability and potential impact of risks identified in a statement or plan.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement } = input;

    // Identify risk indicators
    const riskWords = [
      "risk",
      "danger",
      "threat",
      "problem",
      "issue",
      "failure",
      "loss",
      "damage",
      "negative",
      "concern",
    ];
    const mitigationWords = [
      "prevent",
      "mitigate",
      "avoid",
      "handle",
      "manage",
      "address",
      "solve",
      "fix",
    ];

    const lowerStatement = statement.toLowerCase();
    const riskCount = riskWords.filter((w) =>
      lowerStatement.includes(w),
    ).length;
    const mitigationCount = mitigationWords.filter((w) =>
      lowerStatement.includes(w),
    ).length;

    // Calculate risk probability (higher risk words = higher probability)
    const riskProbability = Math.min(
      0.95,
      0.2 + riskCount * 0.15 - mitigationCount * 0.05,
    );

    // Estimate impact based on severity words
    const severityWords = [
      "critical",
      "severe",
      "major",
      "significant",
      "serious",
      "minor",
      "low",
      "high",
    ];
    const severityCount = severityWords.filter((w) =>
      lowerStatement.includes(w),
    ).length;
    const impact = Math.min(1.0, 0.3 + severityCount * 0.1);

    // Risk score = probability * impact
    const riskScore = riskProbability * impact;

    const riskLevel =
      riskScore < 0.2
        ? "low"
        : riskScore < 0.5
          ? "medium"
          : riskScore < 0.8
            ? "high"
            : "critical";

    return `<tool_result tool="risk_assessment" capability="52">
  <risk_score>${riskScore.toFixed(3)}</risk_score>
  <risk_level>${riskLevel}</risk_level>
  <components>
    <probability>${riskProbability.toFixed(3)}</probability>
    <impact>${impact.toFixed(3)}</impact>
  </components>
  <analysis>
    <risk_indicators>${riskCount}</risk_indicators>
    <mitigation_indicators>${mitigationCount}</mitigation_indicators>
    <severity_indicators>${severityCount}</severity_indicators>
  </analysis>
  <recommendation>
    ${
      riskLevel === "critical" || riskLevel === "high"
        ? "Immediate attention required - develop mitigation strategies"
        : riskLevel === "medium"
          ? "Monitor and prepare contingency plans"
          : "Continue with standard monitoring"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Ambiguity Detection (Capability 53)
 * Detect ambiguous statements and language
 */
export const ambiguityDetectionTool: ToolDefinition = {
  name: "ambiguity_detection",
  description:
    "Identify and analyze ambiguous language or statements that could have multiple interpretations.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement } = input;

    // Detect various types of ambiguity
    const pronounAmbig = /\b(it|they|this|that|he|she|them)\b/i.test(statement);
    const scopeAmbig = /\b(always|never|all|none|every|any)\b/i.test(statement);
    const temporalAmbig = /\b(soon|later|before|after|then|now)\b/i.test(
      statement,
    );
    const vagueAmbig =
      /\b(somewhat|fairly|quite|rather|pretty|sort of|kinda)\b/i.test(
        statement,
      );

    const ambiguityTypes = [];
    if (pronounAmbig) ambiguityTypes.push("pronoun_reference");
    if (scopeAmbig) ambiguityTypes.push("scope");
    if (temporalAmbig) ambiguityTypes.push("temporal");
    if (vagueAmbig) ambiguityTypes.push("vague_modifier");

    const ambiguityScore = Math.min(1.0, ambiguityTypes.length * 0.25);

    const ambiguityLevel =
      ambiguityScore < 0.2 ? "low" : ambiguityScore < 0.5 ? "moderate" : "high";

    return `<tool_result tool="ambiguity_detection" capability="53">
  <ambiguity_score>${ambiguityScore.toFixed(2)}</ambiguity_score>
  <ambiguity_level>${ambiguityLevel}</ambiguity_level>
  <ambiguity_types count="${ambiguityTypes.length}">
    ${ambiguityTypes.map((t) => `<type>${t}</type>`).join("")}
  </ambiguity_types>
  <recommendation>
    ${
      ambiguityLevel === "high"
        ? "Statement requires clarification - multiple interpretations possible"
        : ambiguityLevel === "moderate"
          ? "Some ambiguity present - consider specifying"
          : "Statement is relatively clear"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Calibration Check (Capability 55)
 * Check probability calibration
 */
export const calibrationCheckTool: ToolDefinition = {
  name: "calibration_check",
  description:
    "Verify if stated confidence levels are well-calibrated with actual outcomes.",
  inputSchema: UncertaintyInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  handler: async (
    input: UncertaintyInput,
    context: AgentContext,
  ): Promise<string> => {
    const { statement, priorProbability } = input;

    // Estimate calibration based on statement characteristics
    // In practice, this would compare predicted vs actual probabilities
    const hasHedging = /\b(might|could|may|possibly|probably)\b/i.test(
      statement,
    );
    const hasCertainty =
      /\b(definitely|certainly|absolutely|clearly|obviously)\b/i.test(
        statement,
      );

    // Estimate how well the confidence is calibrated
    let calibrationScore = 0.7; // Default reasonable calibration

    if (hasHedging && !hasCertainty) {
      // Hedged statements tend to be underconfident
      calibrationScore = 0.8;
    } else if (hasCertainty && !hasHedging) {
      // Certain statements tend to be overconfident
      calibrationScore = 0.6;
    }

    // Adjust based on prior probability if provided
    if (priorProbability !== undefined) {
      if (priorProbability < 0.1 || priorProbability > 0.9) {
        calibrationScore -= 0.1; // Extreme probabilities often overconfident
      }
    }

    const calibrationLevel =
      calibrationScore < 0.5
        ? "poor"
        : calibrationScore < 0.7
          ? "fair"
          : calibrationScore < 0.85
            ? "good"
            : "excellent";

    return `<tool_result tool="calibration_check" capability="55">
  <calibration_score>${calibrationScore.toFixed(2)}</calibration_score>
  <calibration_level>${calibrationLevel}</calibration_level>
  <analysis>
    <hedging_detected>${hasHedging}</hedging_detected>
    <certainty_detected>${hasCertainty}</certainty_detected>
    ${priorProbability !== undefined ? `<provided_probability>${priorProbability.toFixed(2)}</provided_probability>` : ""}
  </analysis>
  <recommendation>
    ${
      calibrationLevel === "poor" || calibrationLevel === "fair"
        ? "Confidence statements may be over/under-confident - review evidence"
        : "Confidence levels appear reasonably calibrated"
    }
  </recommendation>
</tool_result>`;
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const uncertaintyTools = [
  quantifyUncertaintyTool,
  confidenceScoreTool,
  evidenceStrengthTool,
  bayesianUpdateTool,
  entropyMeasureTool,
  sensitivityAnalysisTool,
  confidenceIntervalTool,
  riskAssessmentTool,
  ambiguityDetectionTool,
  calibrationCheckTool,
];

export default uncertaintyTools;
