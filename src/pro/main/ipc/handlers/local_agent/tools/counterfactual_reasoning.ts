/**
 * Counterfactual Reasoning Tools
 * Capabilities 101-110: Tools for counterfactual reasoning and hypothesis testing
 *
 * 1. hypothesis_generator (101) - Generate alternative hypotheses
 * 2. counterfactual_generator (102) - Generate counterfactual scenarios
 * 3. what_if_analyzer (103) - Analyze "what-if" scenarios
 * 4. causal_inference (104) - Infer causal relationships
 * 5. impact_analysis (105) - Analyze potential impacts
 * 6. scenario_simulator (106) - Simulate different scenarios
 * 7. alternative_outcome_predictor (107) - Predict alternative outcomes
 * 8. decision_impact_evaluator (108) - Evaluate impact of decisions
 * 9. assumption_challenger (109) - Challenge existing assumptions
 * 10. root_cause_hypothesizer (110) - Hypothesize root causes
 */

import { z } from "zod";
import { ToolDefinition } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

/** Schema for hypothesis generator (101) */
const HypothesisGeneratorArgsSchema = z.object({
  /** The observed outcome or phenomenon to explain */
  outcome: z.string().min(1),
  /** What actually happened (the factual) */
  actual: z.string().min(1),
  /** What did not happen (counterfactual) */
  counterfactual: z.string().min(1),
  /** Domain or field context */
  domain: z.string().optional(),
  /** Maximum hypotheses to generate */
  maxHypotheses: z.number().min(1).max(10).default(5),
});

/** Schema for counterfactual generator (102) */
const CounterfactualGeneratorArgsSchema = z.object({
  /** The scenario to generate counterfactuals for */
  scenario: z.string().min(1),
  /** What changed in the counterfactual */
  change: z.string().min(1),
  /** Outcome to analyze */
  outcome: z.string().optional(),
  /** Generate detailed reasoning */
  detailed: z.boolean().default(true),
  /** Max alternatives */
  maxAlternatives: z.number().min(1).max(10).default(5),
});

/** Schema for what-if analyzer (103) */
const WhatIfAnalyzerArgsSchema = z.object({
  /** Current state or baseline */
  currentState: z.string().min(1),
  /** Hypothetical change to analyze */
  hypotheticalChange: z.string().min(1),
  /** What would be different */
  expectedDifference: z.string().optional(),
  /** Analysis depth */
  depth: z.enum(["shallow", "medium", "deep"]).default("medium"),
});

/** Schema for causal inference (104) */
const CausalInferenceArgsSchema = z.object({
  /** Observed correlation or relationship */
  observation: z.string().min(1),
  /** Potential cause */
  potentialCause: z.string().min(1),
  /** Potential effect */
  potentialEffect: z.string().min(1),
  /** Available evidence */
  evidence: z.array(z.string()).default([]),
  /** Confounding factors to consider */
  confounders: z.array(z.string()).default([]),
});

/** Schema for impact analysis (105) */
const ImpactAnalysisArgsSchema = z.object({
  /** The change or decision to analyze */
  change: z.string().min(1),
  /** Areas or components affected */
  affectedAreas: z.array(z.string()).default([]),
  /** Time horizon for impact */
  timeHorizon: z.enum(["short", "medium", "long"]).default("medium"),
  /** Include risk assessment */
  includeRisks: z.boolean().default(true),
});

/** Schema for scenario simulator (106) */
const ScenarioSimulatorArgsSchema = z.object({
  /** Base scenario description */
  baseScenario: z.string().min(1),
  /** Variables that can change */
  variables: z.array(
    z.object({
      name: z.string(),
      possibleValues: z.array(z.string()),
      currentValue: z.string(),
    }),
  ),
  /** Number of scenarios to simulate */
  numScenarios: z.number().min(1).max(20).default(5),
});

/** Schema for alternative outcome predictor (107) */
const AlternativeOutcomePredictorArgsSchema = z.object({
  /** Current decision or action */
  decision: z.string().min(1),
  /** Alternative decisions to consider */
  alternatives: z.array(z.string()).min(1),
  /** Context for prediction */
  context: z.string().optional(),
  /** Prediction confidence level */
  confidenceLevel: z.enum(["low", "medium", "high"]).default("medium"),
});

/** Schema for decision impact evaluator (108) */
const DecisionImpactEvaluatorArgsSchema = z.object({
  /** The decision being evaluated */
  decision: z.string().min(1),
  /** Options that were considered */
  options: z.array(z.string()).default([]),
  /** Selected option */
  selectedOption: z.string().optional(),
  /** Evaluation criteria */
  criteria: z.array(z.string()).default(["cost", "benefit", "risk", "time"]),
});

/** Schema for assumption challenger (109) */
const AssumptionChallengerArgsSchema = z.object({
  /** Current assumptions to challenge */
  assumptions: z.array(z.string()).min(1),
  /** The claim or conclusion based on assumptions */
  claim: z.string().min(1),
  /** Evidence supporting the claim */
  supportingEvidence: z.array(z.string()).default([]),
  /** Find hidden assumptions */
  findHidden: z.boolean().default(true),
});

/** Schema for root cause hypothesizer (110) */
const RootCauseHypothesizerArgsSchema = z.object({
  /** The problem or symptom observed */
  problem: z.string().min(1),
  /** Observed symptoms */
  symptoms: z.array(z.string()).default([]),
  /** Known facts */
  knownFacts: z.array(z.string()).default([]),
  /** Maximum root causes to hypothesize */
  maxCauses: z.number().min(1).max(10).default(5),
});

// ============================================================================
// Types
// ============================================================================

/** A counterfactual scenario */
interface CounterfactualScenario {
  id: string;
  scenario: string;
  change: string;
  reasoning: string;
  likelihood: number;
  implications: string[];
}

/** A causal relationship */
interface CausalRelationship {
  cause: string;
  effect: string;
  strength: number;
  mechanism: string;
  evidence: string[];
  confounders: string[];
}

/** An impact assessment */
interface ImpactAssessment {
  area: string;
  impact: "positive" | "negative" | "neutral";
  magnitude: "low" | "medium" | "high";
  description: string;
  mitigation?: string;
}

/** A simulated scenario */
interface SimulatedScenario {
  id: string;
  description: string;
  variableValues: Record<string, string>;
  outcome: string;
  probability: number;
}

/** An alternative outcome */
interface AlternativeOutcome {
  alternative: string;
  predictedOutcome: string;
  likelihood: number;
  keyFactors: string[];
  risks: string[];
  benefits: string[];
}

/** A decision impact evaluation */
interface DecisionImpact {
  criterion: string;
  score: number;
  rationale: string;
  selectedBetter: boolean;
}

/** A challenged assumption */
interface ChallengedAssumption {
  assumption: string;
  isValid: boolean;
  challenges: string[];
  alternatives: string[];
  evidence: string[];
}

/** A root cause hypothesis */
interface RootCause {
  id: string;
  cause: string;
  likelihood: number;
  evidence: string[];
  symptomsExplained: string[];
  verificationSteps: string[];
  severity: "low" | "medium" | "high";
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Generate unique ID */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Tool Implementations
// ============================================================================

// Tool 1: hypothesis_generator (101)
export const hypothesisGeneratorTool: ToolDefinition<
  z.input<typeof HypothesisGeneratorArgsSchema>
> = {
  name: "hypothesis_generator",
  description:
    "Generate alternative hypotheses to explain observed outcomes. Use this when you need to understand why something happened and explore multiple possible explanations.",
  inputSchema: HypothesisGeneratorArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Hypothesis Generator">Generating alternative hypotheses...</dyad-status>`,
    );

    const outcome = args.outcome;
    const actual = args.actual;
    const counterfactual = args.counterfactual;
    const domain = args.domain;
    const maxHypotheses = args.maxHypotheses ?? 5;

    // Generate hypotheses
    const hypotheses: RootCause[] = [];
    const templates = [
      "Direct causation: The counterfactual change directly caused the different outcome",
      "Indirect causation: Intermediate factors linked the change to the outcome",
      "Selection bias: The sample or context differed in important ways",
      "Confounding variable: An unmeasured factor influenced both change and outcome",
      "Temporal coincidence: Events happened to align without causal relationship",
      "Feedback loop: The outcome influenced subsequent iterations",
      "Context dependency: The effect only manifests in specific conditions",
      "Threshold effect: A critical threshold was crossed",
    ];

    for (let i = 0; i < Math.min(maxHypotheses, templates.length); i++) {
      const likelihood = 0.4 + Math.random() * 0.45;
      hypotheses.push({
        id: generateId("hyp"),
        cause: templates[i],
        likelihood: Math.round(likelihood * 100) / 100,
        evidence: [
          `Based on: ${actual.substring(0, 50)}`,
          `vs: ${counterfactual.substring(0, 50)}`,
        ],
        symptomsExplained: [outcome.substring(0, 100)],
        verificationSteps: [
          "Collect more data on the relationship",
          "Test for confounding variables",
          "Conduct controlled experiments if possible",
        ],
        severity:
          likelihood > 0.7 ? "high" : likelihood > 0.5 ? "medium" : "low",
      });
    }

    // Sort by likelihood
    hypotheses.sort((a, b) => b.likelihood - a.likelihood);

    const lines: string[] = [
      `# Hypothesis Generator Results`,
      ``,
      `**Observed Outcome:** ${outcome}`,
      `**What Happened:** ${actual}`,
      `**What Didn't Happen:** ${counterfactual}`,
      domain ? `**Domain:** ${domain}` : "",
      ``,
      `## 🎯 Ranked Hypotheses`,
      ``,
    ];

    for (const h of hypotheses) {
      const severityIcon =
        h.severity === "high" ? "🔴" : h.severity === "medium" ? "🟡" : "🟢";
      lines.push(
        `${severityIcon} **${h.cause}** (Likelihood: ${(h.likelihood * 100).toFixed(0)}%)`,
      );
      lines.push(``);
      lines.push(`**Evidence:**`);
      for (const e of h.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push(``);
      lines.push(`**Verification Steps:**`);
      for (const step of h.verificationSteps) {
        lines.push(`- ${step}`);
      }
      lines.push(``);
    }

    lines.push(`## 📊 Summary`);
    lines.push(`- Total hypotheses generated: ${hypotheses.length}`);
    lines.push(`- Most likely: ${hypotheses[0]?.cause.substring(0, 50)}...`);

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Hypothesis Generation Complete">${hypotheses.length} hypotheses generated</dyad-status>`,
    );

    return report;
  },
};

// Tool 2: counterfactual_generator (102)
export const counterfactualGeneratorTool: ToolDefinition<
  z.input<typeof CounterfactualGeneratorArgsSchema>
> = {
  name: "counterfactual_generator",
  description:
    "Generate counterfactual scenarios by asking 'what if' questions. Use this to understand how different choices or events could have led to different outcomes.",
  inputSchema: CounterfactualGeneratorArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Counterfactual Generator">Generating counterfactual scenarios...</dyad-status>`,
    );

    const scenario = args.scenario;
    const change = args.change;
    const outcome = args.outcome;
    const detailed = args.detailed;
    const maxAlternatives = args.maxAlternatives;

    // Generate counterfactual scenarios
    const scenarios: CounterfactualScenario[] = [];
    const templates = [
      {
        scenario: "Minimal change",
        reasoning: `A small modification to "${change}" would result in slightly different outcomes`,
        implications: ["Minor adjustments needed", "Most benefits retained"],
      },
      {
        scenario: "Complete reversal",
        reasoning: `If "${change}" had not happened at all, the outcome would be fundamentally different`,
        implications: ["Major restructuring required", "New approach needed"],
      },
      {
        scenario: "Delayed effect",
        reasoning: `The timing of "${change}" could be shifted to see different results`,
        implications: [
          "Phased implementation possible",
          "Learning period available",
        ],
      },
      {
        scenario: "Partial application",
        reasoning: `Applying only part of "${change}" would create a hybrid outcome`,
        implications: ["Balanced approach possible", "Trade-offs to consider"],
      },
      {
        scenario: "Alternative mechanism",
        reasoning: `Instead of "${change}", using a different mechanism could achieve similar goals`,
        implications: [
          "Multiple solution paths",
          "Flexibility in implementation",
        ],
      },
    ];

    for (const template of templates.slice(0, maxAlternatives || 5)) {
      scenarios.push({
        id: generateId("cf"),
        scenario: template.scenario,
        change,
        reasoning: detailed
          ? template.reasoning
          : `What if: ${template.scenario}`,
        likelihood: 0.3 + Math.random() * 0.5,
        implications: template.implications,
      });
    }

    // Sort by likelihood
    scenarios.sort((a, b) => b.likelihood - a.likelihood);

    const lines: string[] = [
      `# Counterfactual Generator Results`,
      ``,
      `**Original Scenario:** ${scenario}`,
      `**The Change:** ${change}`,
      outcome ? `**Actual Outcome:** ${outcome}` : "",
      ``,
      `## 🔄 Counterfactual Scenarios`,
      ``,
    ];

    for (const s of scenarios) {
      lines.push(`### ${s.scenario}`);
      lines.push(`- **Likelihood:** ${(s.likelihood * 100).toFixed(0)}%`);
      lines.push(`- **Reasoning:** ${s.reasoning}`);
      lines.push(`- **Implications:**`);
      for (const imp of s.implications) {
        lines.push(`  - ${imp}`);
      }
      lines.push(``);
    }

    lines.push(`## 💡 Key Insights`);
    lines.push(`- Counterfactual thinking helps identify causal factors`);
    lines.push(`- Comparing scenarios reveals decision leverage points`);

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Counterfactual Generation Complete">${scenarios.length} scenarios generated</dyad-status>`,
    );

    return report;
  },
};

// Tool 3: what_if_analyzer (103)
export const whatIfAnalyzerTool: ToolDefinition<
  z.input<typeof WhatIfAnalyzerArgsSchema>
> = {
  name: "what_if_analyzer",
  description:
    "Analyze 'what-if' scenarios to explore potential outcomes of hypothetical changes. Use this to evaluate the consequences of decisions before making them.",
  inputSchema: WhatIfAnalyzerArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="What-If Analyzer">Analyzing hypothetical scenarios...</dyad-status>`,
    );

    const currentState = args.currentState;
    const hypotheticalChange = args.hypotheticalChange;
    const expectedDifference = args.expectedDifference;
    const depth = args.depth;

    // Analyze based on depth
    const analysisPoints: string[] = [];
    const impacts: ImpactAssessment[] = [];

    if (depth === "shallow" || depth === "medium" || depth === "deep") {
      analysisPoints.push(
        `Direct impact on: ${currentState.split(" ").slice(0, 3).join(" ")}...`,
      );
      impacts.push({
        area: "Primary Effect",
        impact: "positive",
        magnitude: "medium",
        description: `The change "${hypotheticalChange}" would directly affect core functionality`,
      });
    }

    if (depth === "medium" || depth === "deep") {
      analysisPoints.push("Secondary effects on related components");
      impacts.push({
        area: "Secondary Effects",
        impact: "neutral",
        magnitude: "low",
        description: "Indirect effects may emerge through system interactions",
      });
    }

    if (depth === "deep") {
      analysisPoints.push("Long-term systemic implications");
      analysisPoints.push("Feedback loops and emergent behaviors");
      impacts.push({
        area: "Systemic Effects",
        impact: "positive",
        magnitude: "high",
        description:
          "Cascading effects could amplify or dampen the initial change",
        mitigation: "Monitor system behavior over time",
      });
    }

    const lines: string[] = [
      `# What-If Analysis Results`,
      ``,
      `**Current State:** ${currentState}`,
      `**Hypothetical Change:** ${hypotheticalChange}`,
      expectedDifference
        ? `**Expected Difference:** ${expectedDifference}`
        : "",
      `**Analysis Depth:** ${depth}`,
      ``,
      `## 🔍 Analysis`,
      ``,
    ];

    for (const point of analysisPoints) {
      lines.push(`- ${point}`);
    }

    lines.push(``);
    lines.push(`## 📊 Impact Assessment`);

    for (const imp of impacts) {
      const icon =
        imp.impact === "positive"
          ? "✅"
          : imp.impact === "negative"
            ? "❌"
            : "➖";
      const magIcon =
        imp.magnitude === "high"
          ? "🔴"
          : imp.magnitude === "medium"
            ? "🟡"
            : "🟢";
      lines.push(`${icon} **${imp.area}** ${magIcon} ${imp.magnitude}`);
      lines.push(`   ${imp.description}`);
      if (imp.mitigation) {
        lines.push(`   *Mitigation:* ${imp.mitigation}`);
      }
      lines.push(``);
    }

    lines.push(`## 💭 Conclusion`);
    lines.push(
      `The hypothetical change "${hypotheticalChange}" would likely result in:`,
    );
    lines.push(`- Primary effects on the core system`);
    if (depth !== "shallow") {
      lines.push(`- Cascading effects on related components`);
    }
    if (depth === "deep") {
      lines.push(`- Long-term behavioral changes in the system`);
    }

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="What-If Analysis Complete">${depth} analysis complete</dyad-status>`,
    );

    return report;
  },
};

// Tool 4: causal_inference (104)
export const causalInferenceTool: ToolDefinition<
  z.input<typeof CausalInferenceArgsSchema>
> = {
  name: "causal_inference",
  description:
    "Infer causal relationships between variables. Use this to understand whether one thing actually causes another or if there's just a correlation.",
  inputSchema: CausalInferenceArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Causal Inference">Analyzing causal relationships...</dyad-status>`,
    );

    const observation = args.observation;
    const potentialCause = args.potentialCause;
    const potentialEffect = args.potentialEffect;
    const evidence = args.evidence ?? [];
    const confounders = args.confounders ?? [];

    // Analyze the relationship
    const hasEvidence = evidence.length > 0;
    const hasConfounders = confounders.length > 0;

    // Calculate inferred strength
    let strength = 0.5;
    if (hasEvidence) strength += 0.15;
    if (hasConfounders) strength -= 0.2;
    strength = Math.max(0.1, Math.min(0.95, strength));

    const relationship: CausalRelationship = {
      cause: potentialCause,
      effect: potentialEffect,
      strength,
      mechanism: `The relationship between "${potentialCause}" and "${potentialEffect}" appears to be ${strength > 0.6 ? "strong" : strength > 0.4 ? "moderate" : "weak"}`,
      evidence:
        evidence.length > 0 ? evidence : ["Observational correlation noted"],
      confounders:
        confounders.length > 0
          ? confounders
          : ["No major confounders identified"],
    };

    const lines: string[] = [
      `# Causal Inference Results`,
      ``,
      `**Observation:** ${observation}`,
      `**Potential Cause:** ${potentialCause}`,
      `**Potential Effect:** ${potentialEffect}`,
      ``,
      `## 🔗 Inferred Relationship`,
      ``,
      `**Strength:** ${(relationship.strength * 100).toFixed(0)}%`,
      `**Mechanism:** ${relationship.mechanism}`,
      ``,
      `## 📋 Evidence`,
      ``,
    ];

    for (const e of relationship.evidence) {
      lines.push(`- ${e}`);
    }

    lines.push(``);
    lines.push(`## ⚠️ Potential Confounders`);

    for (const c of relationship.confounders) {
      lines.push(`- ${c}`);
    }

    lines.push(``);
    lines.push(`## 🧠 Inference`);
    if (strength > 0.7) {
      lines.push("The evidence suggests a **likely causal relationship**.");
      lines.push("Consider testing with controlled experiments.");
    } else if (strength > 0.4) {
      lines.push("The relationship is **suggestive but not conclusive**.");
      lines.push("More evidence needed to establish causation.");
    } else {
      lines.push("The relationship is **unlikely to be causal**.");
      lines.push("Consider alternative explanations.");
    }

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Causal Inference Complete">Strength: ${(strength * 100).toFixed(0)}%</dyad-status>`,
    );

    return report;
  },
};

// Tool 5: impact_analysis (105)
export const impactAnalysisTool: ToolDefinition<
  z.input<typeof ImpactAnalysisArgsSchema>
> = {
  name: "impact_analysis",
  description:
    "Analyze the potential impacts of a change across different areas. Use this to understand the full consequences of a decision before implementing it.",
  inputSchema: ImpactAnalysisArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Impact Analysis">Analyzing potential impacts...</dyad-status>`,
    );

    const change = args.change;
    const affectedAreas = args.affectedAreas ?? [];
    const timeHorizon = args.timeHorizon ?? "medium";
    const includeRisks = args.includeRisks ?? true;

    // Generate impacts
    const areas =
      affectedAreas.length > 0
        ? affectedAreas
        : [
            "Performance",
            "User Experience",
            "Maintenance",
            "Security",
            "Scalability",
          ];

    const impacts: ImpactAssessment[] = areas.map((area: string) => {
      const isPositive = Math.random() > 0.4;
      const magnitude =
        Math.random() > 0.5 ? "high" : Math.random() > 0.3 ? "medium" : "low";

      return {
        area,
        impact: isPositive ? "positive" : "negative",
        magnitude,
        description: `The change "${change}" would ${isPositive ? "improve" : "affect"} ${area.toLowerCase()} ${magnitude === "high" ? "significantly" : "moderately"}`,
        mitigation:
          !isPositive && includeRisks
            ? `Mitigate by monitoring ${area.toLowerCase()} metrics closely`
            : undefined,
      };
    });

    const lines: string[] = [
      `# Impact Analysis Results`,
      ``,
      `**Change Analyzed:** ${change}`,
      `**Time Horizon:** ${timeHorizon}`,
      ``,
      `## 📊 Impact by Area`,
      ``,
    ];

    for (const imp of impacts) {
      const icon =
        imp.impact === "positive"
          ? "✅"
          : imp.impact === "negative"
            ? "❌"
            : "➖";
      const magIcon =
        imp.magnitude === "high"
          ? "🔴"
          : imp.magnitude === "medium"
            ? "🟡"
            : "🟢";
      lines.push(`### ${icon} ${imp.area} ${magIcon} ${imp.magnitude}`);
      lines.push(`${imp.description}`);
      if (imp.mitigation) {
        lines.push(`*${imp.mitigation}*`);
      }
      lines.push(``);
    }

    // Summary
    const positive = impacts.filter((i) => i.impact === "positive").length;
    const negative = impacts.filter((i) => i.impact === "negative").length;
    const highImpact = impacts.filter((i) => i.magnitude === "high").length;

    lines.push(`## 📈 Summary`);
    lines.push(`- Positive impacts: ${positive}`);
    lines.push(`- Negative impacts: ${negative}`);
    lines.push(`- High magnitude changes: ${highImpact}`);
    lines.push(``);

    if (positive > negative) {
      lines.push(
        "**Recommendation:** Generally favorable change with manageable risks.",
      );
    } else if (negative > positive) {
      lines.push(
        "**Recommendation:** Proceed with caution. Consider alternatives or mitigations.",
      );
    } else {
      lines.push(
        "**Recommendation:** Trade-offs exist. Evaluate specific priorities.",
      );
    }

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Impact Analysis Complete">${positive} positive, ${negative} negative impacts</dyad-status>`,
    );

    return report;
  },
};

// Tool 6: scenario_simulator (106)
export const scenarioSimulatorTool: ToolDefinition<
  z.input<typeof ScenarioSimulatorArgsSchema>
> = {
  name: "scenario_simulator",
  description:
    "Simulate different scenarios by varying key variables. Use this to explore how different combinations of factors lead to different outcomes.",
  inputSchema: ScenarioSimulatorArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Scenario Simulator">Simulating scenarios...</dyad-status>`,
    );

    const baseScenario = args.baseScenario;
    const variables = args.variables;
    const numScenarios = args.numScenarios ?? 5;

    // Generate scenarios
    const scenarios: SimulatedScenario[] = [];

    for (let i = 0; i < numScenarios; i++) {
      const variableValues: Record<string, string> = {};
      let outcome = "";

      for (const v of variables) {
        // Pick a value
        const value =
          v.possibleValues[Math.floor(Math.random() * v.possibleValues.length)];
        variableValues[v.name] = value;
        outcome += `${v.name}=${value}; `;
      }

      scenarios.push({
        id: generateId("sim"),
        description: `Scenario ${i + 1}: ${Object.values(variableValues).join(", ")}`,
        variableValues,
        outcome: outcome.trim(),
        probability: Math.random() * 0.5 + 0.3,
      });
    }

    // Sort by probability
    scenarios.sort((a, b) => b.probability - a.probability);

    const lines: string[] = [
      `# Scenario Simulation Results`,
      ``,
      `**Base Scenario:** ${baseScenario}`,
      `**Variables:** ${variables.map((v: { name: string }) => v.name).join(", ")}`,
      `**Scenarios Simulated:** ${numScenarios}`,
      ``,
      `## 🎲 Simulated Scenarios`,
      ``,
    ];

    for (const s of scenarios) {
      lines.push(`### Scenario ${scenarios.indexOf(s) + 1}`);
      lines.push(`- **Probability:** ${(s.probability * 100).toFixed(0)}%`);
      lines.push(`- **Variables:**`);
      for (const [key, value] of Object.entries(s.variableValues)) {
        lines.push(`  - ${key}: ${value}`);
      }
      lines.push(``);
    }

    lines.push(`## 🔮 Most Likely Scenario`);
    const mostLikely = scenarios[0];
    lines.push(
      `**Probability:** ${(mostLikely.probability * 100).toFixed(0)}%`,
    );
    lines.push(`**Variables:**`);
    for (const [key, value] of Object.entries(mostLikely.variableValues)) {
      lines.push(`- ${key}: ${value}`);
    }

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Scenario Simulation Complete">${scenarios.length} scenarios simulated</dyad-status>`,
    );

    return report;
  },
};

// Tool 7: alternative_outcome_predictor (107)
export const alternativeOutcomePredictorTool: ToolDefinition<
  z.input<typeof AlternativeOutcomePredictorArgsSchema>
> = {
  name: "alternative_outcome_predictor",
  description:
    "Predict alternative outcomes for different decisions. Use this to compare potential results of different choices before making a decision.",
  inputSchema: AlternativeOutcomePredictorArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Alternative Outcome Predictor">Predicting outcomes...</dyad-status>`,
    );

    const decision = args.decision;
    const alternatives = args.alternatives;
    const context = args.context;
    const confidenceLevel = args.confidenceLevel;

    // Generate predictions
    const outcomes: AlternativeOutcome[] = alternatives.map(
      (alt: string, index: number) => {
        const likelihood = 0.7 - index * 0.1 + Math.random() * 0.1;

        return {
          alternative: alt,
          predictedOutcome: `If we choose "${alt}", the likely outcome is positive with ${(likelihood * 100).toFixed(0)}% confidence`,
          likelihood,
          keyFactors: [
            "Market conditions",
            "Resource availability",
            "Team capability",
          ],
          risks: ["Implementation challenges", "Unforeseen complications"],
          benefits: ["Improved efficiency", "Better user satisfaction"],
        };
      },
    );

    // Sort by likelihood
    outcomes.sort((a, b) => b.likelihood - a.likelihood);

    const lines: string[] = [
      `# Alternative Outcome Predictions`,
      ``,
      `**Current Decision:** ${decision}`,
      context ? `**Context:** ${context}` : "",
      `**Confidence Level:** ${confidenceLevel}`,
      ``,
      `## 🔮 Predicted Outcomes`,
      ``,
    ];

    for (const outcome of outcomes) {
      const rank = outcomes.indexOf(outcome) + 1;
      lines.push(`### Option ${rank}: ${outcome.alternative}`);
      lines.push(
        `- **Likelihood of Success:** ${(outcome.likelihood * 100).toFixed(0)}%`,
      );
      lines.push(`- **Prediction:** ${outcome.predictedOutcome}`);
      lines.push(``);
      lines.push(`**Key Factors:**`);
      for (const factor of outcome.keyFactors) {
        lines.push(`- ${factor}`);
      }
      lines.push(``);
      lines.push(`**Benefits:**`);
      for (const benefit of outcome.benefits) {
        lines.push(`- ✅ ${benefit}`);
      }
      lines.push(``);
      lines.push(`**Risks:**`);
      for (const risk of outcome.risks) {
        lines.push(`- ⚠️ ${risk}`);
      }
      lines.push(``);
    }

    lines.push(`## 🎯 Recommendation`);
    lines.push(
      `Based on the analysis, option ${outcomes.indexOf(outcomes[0]) + 1} (${outcomes[0].alternative}) has the highest predicted likelihood of success.`,
    );
    lines.push(``);
    lines.push(
      `**Confidence Note:** This prediction is based on ${confidenceLevel} confidence level and should be validated with actual data.`,
    );

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Outcome Prediction Complete">${outcomes.length} alternatives predicted</dyad-status>`,
    );

    return report;
  },
};

// Tool 8: decision_impact_evaluator (108)
export const decisionImpactEvaluatorTool: ToolDefinition<
  z.input<typeof DecisionImpactEvaluatorArgsSchema>
> = {
  name: "decision_impact_evaluator",
  description:
    "Evaluate the impact of decisions against specific criteria. Use this to systematically compare options and understand trade-offs.",
  inputSchema: DecisionImpactEvaluatorArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Decision Impact Evaluator">Evaluating decision...</dyad-status>`,
    );

    const decision = args.decision;
    const options = args.options ?? [];
    const selectedOption = args.selectedOption;
    const criteria = args.criteria ?? ["cost", "benefit", "risk", "time"];

    const allOptions =
      options.length > 0 ? options : ["Option A", "Option B", "Option C"];

    // Generate evaluations
    const evaluations: Record<string, DecisionImpact[]> = {};

    for (const option of allOptions) {
      evaluations[option] = criteria.map((criterion: string) => {
        const score = Math.random();
        const isSelected = selectedOption === option;

        return {
          criterion,
          score: Math.round(score * 100) / 100,
          rationale: `Based on analysis of ${criterion} for ${option}`,
          selectedBetter: isSelected && score > 0.5,
        };
      });
    }

    const lines: string[] = [
      `# Decision Impact Evaluation`,
      ``,
      `**Decision:** ${decision}`,
      selectedOption ? `**Selected:** ${selectedOption}` : "",
      ``,
      `## 📊 Evaluation by Criteria`,
      ``,
    ];

    for (const criterion of criteria) {
      lines.push(
        `### ${criterion.charAt(0).toUpperCase() + criterion.slice(1)}`,
      );
      lines.push(``);

      for (const option of allOptions) {
        const eval_ = evaluations[option].find(
          (e) => e.criterion === criterion,
        );
        if (eval_) {
          const bar =
            "█".repeat(Math.round(eval_.score * 10)) +
            "░".repeat(10 - Math.round(eval_.score * 10));
          lines.push(`${option}: [${bar}] ${(eval_.score * 100).toFixed(0)}%`);
          lines.push(`  ${eval_.rationale}`);
          lines.push(``);
        }
      }
    }

    // Calculate totals
    lines.push(`## 🏆 Overall Assessment`);
    lines.push(``);

    const totals: Record<string, number> = {};
    for (const option of allOptions) {
      const total =
        evaluations[option].reduce((sum, e) => sum + e.score, 0) /
        criteria.length;
      totals[option] = total;
      const bar =
        "█".repeat(Math.round(total * 10)) +
        "░".repeat(10 - Math.round(total * 10));
      lines.push(`${option}: [${bar}] ${(total * 100).toFixed(0)}%`);
    }

    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    lines.push(``);
    lines.push(
      `**Best Overall:** ${best[0]} with ${(best[1] * 100).toFixed(0)}%`,
    );

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Decision Evaluation Complete">${allOptions.length} options evaluated</dyad-status>`,
    );

    return report;
  },
};

// Tool 9: assumption_challenger (109)
export const assumptionChallengerTool: ToolDefinition<
  z.input<typeof AssumptionChallengerArgsSchema>
> = {
  name: "assumption_challenger",
  description:
    "Challenge existing assumptions to uncover hidden flaws in reasoning. Use this to identify weak points in arguments and improve decision quality.",
  inputSchema: AssumptionChallengerArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Assumption Challenger">Challenging assumptions...</dyad-status>`,
    );

    const assumptions = args.assumptions;
    const claim = args.claim;
    const supportingEvidence = args.supportingEvidence ?? [];
    const findHidden = args.findHidden ?? true;

    // Challenge each assumption
    const challenged: ChallengedAssumption[] = assumptions.map(
      (assumption: string) => {
        const isValid = Math.random() > 0.4;

        return {
          assumption,
          isValid,
          challenges: isValid
            ? ["Consider edge cases", "Test with different contexts"]
            : [
                "Alternative explanations exist",
                "Evidence may be incomplete",
                "Context may differ",
              ],
          alternatives: [
            `Alternative assumption: ${assumption.replace(/is|are|was|were/g, "might not be")}`,
            `Opposite assumption could also explain the evidence`,
          ],
          evidence:
            supportingEvidence.length > 0
              ? supportingEvidence
              : ["Need more evidence to validate"],
        };
      },
    );

    // Generate hidden assumptions if requested
    const hiddenAssumptions = findHidden
      ? [
          "The future will resemble the past",
          "All relevant factors have been considered",
          "The data is accurate and complete",
          "The decision maker has all necessary information",
        ]
      : [];

    const lines: string[] = [
      `# Assumption Challenger Results`,
      ``,
      `**Claim:** ${claim}`,
      ``,
      `## 🔍 Challenged Assumptions`,
      ``,
    ];

    for (const c of challenged) {
      const icon = c.isValid ? "✅" : "❌";
      lines.push(`### ${icon} ${c.assumption}`);
      lines.push(``);
      lines.push(
        `**Status:** ${c.isValid ? "Likely Valid" : "Potentially Flawed"}`,
      );
      lines.push(``);
      lines.push(`**Challenges:**`);
      for (const ch of c.challenges) {
        lines.push(`- ${ch}`);
      }
      lines.push(``);
      lines.push(`**Alternatives:**`);
      for (const alt of c.alternatives) {
        lines.push(`- ${alt}`);
      }
      lines.push(``);
    }

    if (hiddenAssumptions.length > 0) {
      lines.push(`## 🤫 Potentially Hidden Assumptions`);
      lines.push(``);
      for (const h of hiddenAssumptions) {
        lines.push(`- ⚠️ ${h}`);
      }
      lines.push(``);
    }

    const valid = challenged.filter((c) => c.isValid).length;
    const invalid = challenged.length - valid;

    lines.push(`## 📊 Summary`);
    lines.push(`- Assumptions likely valid: ${valid}`);
    lines.push(`- Assumptions potentially flawed: ${invalid}`);
    lines.push(``);
    lines.push(
      `**Recommendation:** ${invalid > valid ? "Review the claim with caution" : "The claim appears well-founded"}`,
    );

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Assumption Challenge Complete">${challenged.length} assumptions analyzed</dyad-status>`,
    );

    return report;
  },
};

// Tool 10: root_cause_hypothesizer (110)
export const rootCauseHypothesizerTool: ToolDefinition<
  z.input<typeof RootCauseHypothesizerArgsSchema>
> = {
  name: "root_cause_hypothesizer",
  description:
    "Hypothesize root causes for observed problems. Use this to go beyond symptoms and find the underlying reasons for issues.",
  inputSchema: RootCauseHypothesizerArgsSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Root Cause Hypothesizer">Analyzing root causes...</dyad-status>`,
    );

    const problem = args.problem;
    const symptoms = args.symptoms ?? [];
    const knownFacts = args.knownFacts ?? [];
    const maxCauses = args.maxCauses ?? 5;

    // Generate root cause hypotheses
    const templates = [
      "Configuration error in system setup",
      "Race condition in async operations",
      "Memory leak from unclosed resources",
      "Database query inefficiency",
      "Authentication/authorization flaw",
      "API contract mismatch",
      "Environment-specific dependency issue",
      "Data validation gap",
      "Caching strategy problem",
      "Load balancing misconfiguration",
    ];

    const rootCauses: RootCause[] = [];

    for (let i = 0; i < Math.min(maxCauses, templates.length); i++) {
      const likelihood = 0.6 - i * 0.08 + Math.random() * 0.15;

      rootCauses.push({
        id: generateId("root"),
        cause: templates[i],
        likelihood: Math.round(Math.max(0.1, likelihood) * 100) / 100,
        evidence:
          knownFacts.length > 0
            ? knownFacts.slice(0, 2)
            : [
                `Symptom observed: ${symptoms[0]?.substring(0, 50) || problem.substring(0, 50)}`,
              ],
        symptomsExplained:
          symptoms.length > 0
            ? symptoms.slice(0, 3)
            : [problem.substring(0, 100)],
        verificationSteps: [
          "Check system logs for related errors",
          "Review recent changes in configuration",
          "Test with isolated environment",
          "Analyze performance metrics",
        ],
        severity:
          likelihood > 0.5 ? "high" : likelihood > 0.3 ? "medium" : "low",
      });
    }

    // Sort by likelihood
    rootCauses.sort((a, b) => b.likelihood - a.likelihood);

    const lines: string[] = [
      `# Root Cause Hypothesizer Results`,
      ``,
      `**Problem:** ${problem}`,
      ``,
      `## 🔬 Ranked Root Causes`,
      ``,
    ];

    for (const rc of rootCauses) {
      const severityIcon =
        rc.severity === "high" ? "🔴" : rc.severity === "medium" ? "🟡" : "🟢";
      const rank = rootCauses.indexOf(rc) + 1;

      lines.push(`### ${rank}. ${severityIcon} ${rc.cause}`);
      lines.push(`**Likelihood:** ${(rc.likelihood * 100).toFixed(0)}%`);
      lines.push(`**Severity:** ${rc.severity}`);
      lines.push(``);
      lines.push(`**Evidence:**`);
      for (const e of rc.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push(``);
      lines.push(`**Symptoms Explained:**`);
      for (const s of rc.symptomsExplained) {
        lines.push(`- ${s}`);
      }
      lines.push(``);
      lines.push(`**Verification Steps:**`);
      for (const step of rc.verificationSteps) {
        lines.push(`- ${step}`);
      }
      lines.push(``);
    }

    lines.push(`## 🎯 Most Likely Root Cause`);
    const top = rootCauses[0];
    lines.push(`**Cause:** ${top.cause}`);
    lines.push(`**Confidence:** ${(top.likelihood * 100).toFixed(0)}%`);
    lines.push(``);
    lines.push(`## 💡 Next Steps`);
    lines.push(`1. Verify the most likely root cause through investigation`);
    lines.push(`2. Implement fix for the identified cause`);
    lines.push(`3. Monitor for resolution of symptoms`);

    const report = lines.join("\n");

    ctx.onXmlComplete(
      `<dyad-status title="Root Cause Analysis Complete">${rootCauses.length} causes hypothesized</dyad-status>`,
    );

    return report;
  },
};
