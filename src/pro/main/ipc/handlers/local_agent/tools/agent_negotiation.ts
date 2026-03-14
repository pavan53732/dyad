import { z } from "zod";
import { generateText } from "ai";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

// ============================================================================
// Tool 1: negotiate_solution (156)
// ============================================================================

const negotiateSolutionSchema = z.object({
  problem: z
    .string()
    .describe("The problem statement that requires agent negotiation"),
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        role: z.string().describe("Agent role or specialty"),
        initialPosition: z
          .string()
          .describe("Agent's initial position or solution approach"),
      }),
    )
    .describe("List of agents participating in negotiation"),
  maxRounds: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum negotiation rounds"),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe("Specific aspects to focus on during negotiation"),
});

export const negotiateSolutionTool: ToolDefinition<
  z.infer<typeof negotiateSolutionSchema>
> = {
  name: "negotiate_solution",
  description: `Facilitate negotiation between multiple AI agents to find a mutually agreed solution. Agents propose their solutions, argue their merits, and work toward consensus. Useful for resolving design trade-offs, architectural decisions, or competing requirements.`,
  inputSchema: negotiateSolutionSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.problem) return undefined;
    let xml = `<dyad-negotiation problem="${escapeXmlAttr(args.problem.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-negotiation>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { problem, agents, maxRounds = 5, focusAreas = [] } = args;

    ctx.onXmlStream(
      `<dyad-status title="Agent Negotiation">Starting negotiation with ${agents.length} agents...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    let currentRound = 0;
    let allProposals = agents.map((a) => a.initialPosition);
    let negotiationComplete = false;
    let finalAgreement: string | null = null;

    while (currentRound < maxRounds && !negotiationComplete) {
      currentRound++;

      ctx.onXmlStream(
        `<dyad-status title="Negotiation Round ${currentRound}/${maxRounds}">Agents presenting positions...</dyad-status>`,
      );

      // Each agent presents/revises their proposal
      const roundPromises = agents.map(async (agent) => {
        const prompt = `You are Agent ${agent.id} (${agent.role}) in a multi-agent negotiation.
        
Original Problem: ${problem}
${focusAreas.length > 0 ? `Focus Areas: ${focusAreas.join(", ")}` : ""}

Current Round: ${currentRound}/${maxRounds}

Other Agents' Positions:
${agents
  .filter((a) => a.id !== agent.id)
  .map(
    (a, i) =>
      `Agent ${a.id} (${a.role}): ${allProposals[i] || a.initialPosition}`,
  )
  .join("\n")}

Your original position: ${agent.initialPosition}

${
  currentRound > 1
    ? "Consider the feedback from other agents and revise your proposal if needed."
    : "Present your initial solution proposal."
}

Provide your revised or initial proposal (max 200 words).`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.4,
        });

        return { agentId: agent.id, proposal: text };
      });

      const results = await Promise.all(roundPromises);
      allProposals = results.map((r) => r.proposal);

      // Check for convergence
      if (currentRound >= 2) {
        const convergencePrompt = `Given these proposals from ${agents.length} agents for the problem: ${problem}

Proposals:
${results.map((r) => `Agent ${r.agentId}: ${r.proposal}`).join("\n\n")}

Are these proposals converging to a similar solution? Reply with "YES" if they are essentially saying the same thing, or "NO" if they remain distinct approaches.`;

        const { text: convergenceResult } = await generateText({
          model: modelClient.model,
          prompt: convergencePrompt,
          temperature: 0.1,
        });

        if (convergenceResult.trim().toUpperCase().startsWith("YES")) {
          negotiationComplete = true;
        }
      }

      // If not converged yet, have agents evaluate each other
      if (!negotiationComplete && currentRound < maxRounds) {
        const evaluationPrompt = `You are a neutral mediator. Evaluate these proposals for the problem: ${problem}

Proposals:
${results.map((r) => `Agent ${r.agentId}: ${r.proposal}`).join("\n\n")}

${focusAreas.length > 0 ? `Evaluation Focus: ${focusAreas.join(", ")}` : ""}

Provide brief feedback (2-3 sentences) on each proposal's strengths and weaknesses.`;

        await generateText({
          model: modelClient.model,
          prompt: evaluationPrompt,
          temperature: 0.3,
        });
      }
    }

    // Generate final agreement
    if (!negotiationComplete) {
      ctx.onXmlStream(
        `<dyad-status title="Negotiation Concluding">Generating final synthesis...</dyad-status>`,
      );
    }

    const finalPrompt = `As a mediator, synthesize these proposals into a final agreed solution for: ${problem}

Proposals considered:
${allProposals.map((p, i) => `Agent ${agents[i].id}: ${p}`).join("\n\n")}

Provide a final synthesized solution that incorporates the best aspects of all proposals.`;

    const { text: finalResult } = await generateText({
      model: modelClient.model,
      prompt: finalPrompt,
      temperature: 0.3,
    });

    finalAgreement = finalResult;

    const summary = `## Negotiation Complete

**Problem:** ${problem}

**Rounds:** ${currentRound}/${maxRounds}

**Agents:** ${agents.map((a) => a.id).join(", ")}

---

### Final Agreed Solution

${finalAgreement}

---

${negotiationComplete ? "✅ Agents reached consensus" : "⚠️ Time limit reached, synthesis provided"}`;

    ctx.onXmlComplete(
      `<dyad-status title="Negotiation Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 2: build_consensus (157)
// ============================================================================

const buildConsensusSchema = z.object({
  task: z.string().describe("The task or decision requiring consensus"),
  participants: z
    .array(
      z.object({
        id: z.string().describe("Participant identifier"),
        perspective: z.string().describe("Participant's perspective or vote"),
        weight: z
          .number()
          .optional()
          .default(1)
          .describe("Voting weight (higher = more influence)"),
      }),
    )
    .describe("Participants in the consensus building"),
  decisionType: z
    .enum(["unanimous", "majority", "weighted", "delphi"])
    .optional()
    .default("majority")
    .describe("Consensus method to use"),
});

export const buildConsensusTool: ToolDefinition<
  z.infer<typeof buildConsensusSchema>
> = {
  name: "build_consensus",
  description: `Build consensus among multiple agents using various voting and deliberation methods. Supports unanimous, majority, weighted, and Delphi-style consensus building. Useful for team decisions, code reviews, or architectural choices.`,
  inputSchema: buildConsensusSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.task) return undefined;
    let xml = `<dyad-consensus task="${escapeXmlAttr(args.task.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-consensus>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { task, participants, decisionType = "majority" } = args;

    ctx.onXmlStream(
      `<dyad-status title="Building Consensus">Using ${decisionType} method with ${participants.length} participants...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    let result: string;

    if (decisionType === "unanimous") {
      // All must agree
      const unanimousPrompt = `Build unanimous consensus for the following decision:

**Task:** ${task}

**Participants and their positions:**
${participants.map((p) => `- ${p.id}: ${p.perspective}`).join("\n")}

Find common ground. If consensus is impossible, explain why and propose a compromise.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: unanimousPrompt,
        temperature: 0.3,
      });
      result = text;
    } else if (decisionType === "majority") {
      // Simple majority vote
      const majorityPrompt = `Build majority consensus for the following decision:

**Task:** ${task}

**Votes:**
${participants.map((p) => `- ${p.id}: ${p.perspective}`).join("\n")}

Count the votes, identify the winning position, and summarize the consensus.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: majorityPrompt,
        temperature: 0.3,
      });
      result = text;
    } else if (decisionType === "weighted") {
      // Weighted voting
      const totalWeight = participants.reduce((sum, p) => sum + p.weight, 0);
      const weightedPrompt = `Build weighted consensus for the following decision:

**Task:** ${task}

**Weighted Votes:**
${participants
  .map((p) => `- ${p.id} (weight: ${p.weight}): ${p.perspective}`)
  .join("\n")}

**Total Weight:** ${totalWeight}

Calculate the weighted outcome and provide the consensus decision.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: weightedPrompt,
        temperature: 0.3,
      });
      result = text;
    } else {
      // Delphi method - iterative refinement
      ctx.onXmlStream(
        `<dyad-status title="Delphi Method">Running iterative consensus rounds...</dyad-status>`,
      );

      let currentOpinions = participants.map((p) => ({
        ...p,
        opinion: p.perspective,
      }));

      // Run 2 rounds of Delphi
      for (let round = 1; round <= 2; round++) {
        const delphiPrompt = `Round ${round} of Delphi method for: ${task}

Current Opinions:
${currentOpinions.map((p) => `- ${p.id}: ${p.opinion}`).join("\n")}

As a neutral facilitator, summarize the range of opinions and provide anonymous feedback to help converge.`;

        const { text: feedback } = await generateText({
          model: modelClient.model,
          prompt: delphiPrompt,
          temperature: 0.3,
        });

        // Update opinions based on feedback
        const updatePrompt = `Given this feedback from the facilitator:

${feedback}

Revise your original position if the feedback raises important points:

Your original: ${currentOpinions[0].opinion}

Provide your revised opinion (or keep the same if you disagree with feedback).`;

        const { text: revised } = await generateText({
          model: modelClient.model,
          prompt: updatePrompt,
          temperature: 0.3,
        });

        currentOpinions[0].opinion = revised;
      }

      const finalPrompt = `Final Delphi consensus for: ${task}

All refined opinions:
${currentOpinions.map((p) => `- ${p.id}: ${p.opinion}`).join("\n")}

Provide the final consensus statement.`;

      const { text } = await generateText({
        model: modelClient.model,
        prompt: finalPrompt,
        temperature: 0.2,
      });
      result = text;
    }

    const summary = `## Consensus Building Complete

**Task:** ${task}
**Method:** ${decisionType}
**Participants:** ${participants.map((p) => p.id).join(", ")}

---

### Consensus Result

${result}`;

    ctx.onXmlComplete(
      `<dyad-status title="Consensus Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// ============================================================================
// Tool 3: trust_calibrate (197)
// ============================================================================

const trustCalibrateSchema = z.object({
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        reliability: z
          .number()
          .min(0)
          .max(1)
          .describe("Current reliability score (0-1)"),
        accuracy: z
          .number()
          .min(0)
          .max(1)
          .describe("Historical accuracy score (0-1)"),
        responseTime: z.number().describe("Average response time in ms"),
        lastInteraction: z
          .string()
          .optional()
          .describe("Last interaction timestamp"),
      }),
    )
    .describe("Agents to calibrate trust for"),
  calibrationFactor: z
    .number()
    .optional()
    .default(0.1)
    .describe("How much to adjust trust based on new data"),
});

export const trustCalibrateTool: ToolDefinition<
  z.infer<typeof trustCalibrateSchema>
> = {
  name: "trust_calibrate",
  description: `Calibrate trust levels between agents based on historical performance metrics. Updates reliability, accuracy, and responsiveness scores to inform future agent selection and delegation decisions.`,
  inputSchema: trustCalibrateSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Calibrate trust for ${args.agents?.length || 0} agents`,

  buildXml: (args, isComplete) => {
    if (!args.agents?.length) return undefined;
    let xml = `<dyad-trust-calibration agents="${args.agents.length}">`;
    if (isComplete) {
      xml += "</dyad-trust-calibration>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const { agents, calibrationFactor = 0.1 } = args;

    ctx.onXmlStream(
      `<dyad-status title="Trust Calibration">Calibrating trust for ${agents.length} agents...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Calculate calibrated trust scores using Bayesian-style updating
    const calibratedAgents = agents.map((agent) => {
      // Combine reliability and accuracy with recency weighting
      const recencyWeight = agent.lastInteraction
        ? Math.max(
            0,
            1 -
              (Date.now() - new Date(agent.lastInteraction).getTime()) /
                (7 * 24 * 60 * 60 * 1000),
          )
        : 0.5;

      // Base trust from reliability and accuracy
      const baseTrust = agent.reliability * 0.6 + agent.accuracy * 0.4;

      // Adjust for recency
      const recencyAdjusted = baseTrust * (0.5 + recencyWeight * 0.5);

      // Response time penalty (normalized: <500ms = no penalty, >5000ms = max penalty)
      const responsePenalty = Math.min(
        1,
        Math.max(0, (agent.responseTime - 500) / 4500),
      );
      const finalTrust = recencyAdjusted * (1 - responsePenalty * 0.2);

      // Calculate new trust with calibration factor
      const calibratedTrust =
        agent.reliability +
        (finalTrust - agent.reliability) * calibrationFactor;

      return {
        id: agent.id,
        originalTrust: agent.reliability,
        calibratedTrust: Math.round(calibratedTrust * 100) / 100,
        factors: {
          reliability: agent.reliability,
          accuracy: agent.accuracy,
          recency: Math.round(recencyWeight * 100) / 100,
          responseTime: agent.responseTime,
        },
      };
    });

    // Generate analysis
    const analysisPrompt = `Analyze trust calibration results for ${agents.length} agents:

${calibratedAgents
  .map(
    (a) =>
      `Agent ${a.id}: Original=${a.originalTrust}, Calibrated=${a.calibratedTrust}, Factors=${JSON.stringify(a.factors)}`,
  )
  .join("\n")}

Provide recommendations for agent selection based on these trust scores.`;

    const { text: analysis } = await generateText({
      model: modelClient.model,
      prompt: analysisPrompt,
      temperature: 0.3,
    });

    const summary = `## Trust Calibration Complete

### Agent Trust Scores

${calibratedAgents
  .map(
    (a) =>
      `| ${a.id} | ${a.originalTrust} | ${a.calibratedTrust} | ${
        a.calibratedTrust >= a.originalTrust ? "⬆️" : "⬇️"
      } |`,
  )
  .join("\n")}

### Analysis

${analysis}

---

**Calibration Factor:** ${calibrationFactor} (how much trust adjusts based on new data)`;

    ctx.onXmlComplete(
      `<dyad-status title="Trust Calibration Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    // Return structured data for potential storage
    return JSON.stringify(
      {
        calibratedAt: new Date().toISOString(),
        agents: calibratedAgents,
        analysis,
      },
      null,
      2,
    );
  },
};

// ============================================================================
// Tool 4: collaborative_planning (152)
// ============================================================================

const collaborativePlanningSchema = z.object({
  goal: z.string().describe("The high-level goal to plan for"),
  participants: z
    .array(
      z.object({
        id: z.string().describe("Participant agent identifier"),
        expertise: z.array(z.string()).describe("Areas of expertise"),
        constraints: z
          .array(z.string())
          .optional()
          .describe("Constraints this agent must consider"),
      }),
    )
    .describe("Agents participating in planning"),
  planningHorizon: z
    .enum(["short", "medium", "long"])
    .optional()
    .default("medium")
    .describe("Planning time horizon"),
  includeRiskAnalysis: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include risk analysis in the plan"),
});

export const collaborativePlanningTool: ToolDefinition<
  z.infer<typeof collaborativePlanningSchema>
> = {
  name: "collaborative_planning",
  description: `Create a shared plan involving multiple specialized agents. Each agent contributes expertise to develop a comprehensive plan with clear milestones, dependencies, and risk assessment. Useful for complex projects requiring multiple domains.`,
  inputSchema: collaborativePlanningSchema,
  defaultConsent: "always",
  modifiesState: false,

  buildXml: (args, isComplete) => {
    if (!args.goal) return undefined;
    let xml = `<dyad-collab-planning goal="${escapeXmlAttr(args.goal.substring(0, 30))}...">`;
    if (isComplete) {
      xml += "</dyad-collab-planning>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const {
      goal,
      participants,
      planningHorizon = "medium",
      includeRiskAnalysis = true,
    } = args;

    ctx.onXmlStream(
      `<dyad-status title="Collaborative Planning">Planning with ${participants.length} specialist agents...</dyad-status>`,
    );

    const settings = readSettings();
    const { modelClient } = await getModelClient(
      settings.selectedModel || "gpt-4o",
      settings,
    );

    // Phase 1: Each agent contributes their domain-specific planning
    ctx.onXmlStream(
      `<dyad-status title="Gathering Expert Input">Each agent contributes domain expertise...</dyad-status>`,
    );

    const expertInputs = await Promise.all(
      participants.map(async (participant) => {
        const prompt = `You are a ${participant.expertise.join(
          "/",
        )} expert contributing to a collaborative plan.

**Goal:** ${goal}
**Planning Horizon:** ${planningHorizon}
${participant.constraints ? `**Constraints:** ${participant.constraints.join(", ")}` : ""}

Provide your domain-specific plan component:
1. Key milestones relevant to your expertise
2. Dependencies on other domains
3. Potential risks and mitigations
4. Success criteria

Keep it concise (max 200 words).`;

        const { text } = await generateText({
          model: modelClient.model,
          prompt,
          temperature: 0.4,
        });

        return {
          agentId: participant.id,
          expertise: participant.expertise,
          input: text,
        };
      }),
    );

    // Phase 2: Synthesize into unified plan
    ctx.onXmlStream(
      `<dyad-status title="Synthesizing Plan">Integrating expert inputs into unified plan...</dyad-status>`,
    );

    const synthesisPrompt = `Synthesize these expert inputs into a unified collaborative plan:

**Goal:** ${goal}
**Planning Horizon:** ${planningHorizon}
${includeRiskAnalysis ? "**Include comprehensive risk analysis**" : ""}

---

### Expert Inputs

${expertInputs
  .map((e) => `## ${e.agentId} (${e.expertise.join(", ")})\n\n${e.input}`)
  .join("\n\n---\n\n")}

---

Create a unified plan with:
1. **Executive Summary** - One paragraph overview
2. **Phased Milestones** - Clear phases with timelines
3. **Dependencies** - Cross-agent dependencies
4. **Resource Allocation** - Who does what
${
  includeRiskAnalysis
    ? "5. **Risk Analysis** - Key risks and mitigation strategies"
    : ""
}
6. **Success Metrics** - How to measure progress`;

    const { text: unifiedPlan } = await generateText({
      model: modelClient.model,
      prompt: synthesisPrompt,
      temperature: 0.3,
    });

    // Phase 3: Validate plan
    ctx.onXmlStream(
      `<dyad-status title="Validating Plan">Checking plan coherence and completeness...</dyad-status>`,
    );

    const validationPrompt = `Validate this collaborative plan for: ${goal}

**Plan:**
${unifiedPlan}

Check for:
1. Logical coherence - do the phases make sense?
2. Missing dependencies
3. Unrealistic timelines
4. Gaps in expertise coverage

Provide validation verdict: APPROVED, NEEDS_REVISION, or REJECTED with specific feedback.`;

    const { text: validation } = await generateText({
      model: modelClient.model,
      prompt: validationPrompt,
      temperature: 0.2,
    });

    const summary = `## Collaborative Planning Complete

**Goal:** ${goal}
**Planning Horizon:** ${planningHorizon}
**Participants:** ${participants.map((p) => p.id).join(", ")}

---

### Unified Plan

${unifiedPlan}

---

### Validation

${validation}`;

    ctx.onXmlComplete(
      `<dyad-status title="Planning Complete">${escapeXmlContent(summary)}</dyad-status>`,
    );

    return summary;
  },
};

// Export all tools from this file
export const agentNegotiationTools = {
  negotiateSolutionTool,
  buildConsensusTool,
  trustCalibrateTool,
  collaborativePlanningTool,
};
