/**
 * Analogical & Case-Based Reasoning Tools
 * Capabilities 66-80: Analogical and Case-Based Reasoning
 */
import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const AnalogicalInputSchema = z.object({
  source: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  problem: z.string().min(1).optional(),
  caseDescription: z.string().optional(),
  solution: z.string().optional(),
  features: z.array(z.string()).optional(),
  targetFeatures: z.array(z.string()).optional(),
  similarityThreshold: z.number().min(0).max(1).default(0.5),
  maxCases: z.number().min(1).max(20).default(5),
  domain: z.string().optional(),
  transferType: z
    .enum(["structural", "relational", "surface"])
    .default("structural"),
  schemaSource: z.string().optional(),
  schemaTarget: z.string().optional(),
});

type AnalogicalInput = z.infer<typeof AnalogicalInputSchema>;

// ============================================================================
// Internal Case Library (simulated - in production would be database)
// ============================================================================

interface Case {
  id: string;
  problem: string;
  solution: string;
  features: string[];
  domain: string;
  success: number;
}

const caseLibrary: Case[] = [
  {
    id: "case_001",
    problem: "customer_complaint_about_slow_response",
    solution: "implement_caching_layer",
    features: ["performance", "latency", "user_complaint", "backend"],
    domain: "software_engineering",
    success: 0.9,
  },
  {
    id: "case_002",
    problem: "database_query_timeout",
    solution: "add_database_index",
    features: ["performance", "database", "timeout", "optimization"],
    domain: "software_engineering",
    success: 0.85,
  },
  {
    id: "case_003",
    problem: "memory_leak_in_application",
    solution: "implement_garbage_collection",
    features: ["memory", "leak", "resource", "optimization"],
    domain: "software_engineering",
    success: 0.8,
  },
  {
    id: "case_004",
    problem: "api_rate_limit_exceeded",
    solution: "implement_request_queue",
    features: ["api", "rate_limit", "throttling", "queue"],
    domain: "software_engineering",
    success: 0.75,
  },
  {
    id: "case_005",
    problem: "user authentication_failure",
    solution: "implement_oauth",
    features: ["authentication", "security", "oauth", "login"],
    domain: "security",
    success: 0.95,
  },
];

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Case Retrieval (Capability 66)
 * Retrieve similar cases from the case library
 */
export const caseRetrievalTool: ToolDefinition = {
  name: "case_retrieval",
  description:
    "Retrieve similar cases from the case library based on a problem description.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, maxCases = 5, similarityThreshold = 0.5, domain } = input;

    if (!problem) {
      return `<tool_result tool="case_retrieval" capability="66">
  <error>Problem description is required</error>
</tool_result>`;
    }

    // Simple feature matching
    const problemFeatures = problem.toLowerCase().split(/\s+/);

    // Score each case
    const scoredCases = caseLibrary
      .filter((c) => !domain || c.domain === domain)
      .map((c) => {
        const caseFeatures = c.features.map((f) => f.toLowerCase());
        const matches = problemFeatures.filter((pf) =>
          caseFeatures.some((cf) => cf.includes(pf) || pf.includes(cf)),
        ).length;
        const similarity = matches / Math.max(1, caseFeatures.length);
        return { ...c, similarity };
      })
      .filter((c) => c.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxCases);

    return `<tool_result tool="case_retrieval" capability="66">
  <retrieved_cases count="${scoredCases.length}">
    ${scoredCases
      .map(
        (c) => `
    <case id="${c.id}" similarity="${c.similarity.toFixed(3)}">
      <problem>${c.problem}</problem>
      <solution>${c.solution}</solution>
      <domain>${c.domain}</domain>
      <past_success>${c.success}</past_success>
    </case>`,
      )
      .join("")}
  </retrieved_cases>
  <search_parameters>
    <max_cases>${maxCases}</max_cases>
    <similarity_threshold>${similarityThreshold}</similarity_threshold>
    <domain_filter>${domain || "none"}</domain_filter>
  </search_parameters>
</tool_result>`;
  },
};

/**
 * Case Match (Capability 67)
 * Match retrieved cases to the current problem
 */
export const caseMatchTool: ToolDefinition = {
  name: "case_match",
  description:
    "Match retrieved cases to the current problem and assess relevance.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, caseDescription, features } = input;

    if (!problem || !caseDescription) {
      return `<tool_result tool="case_match" capability="67">
  <error>Both problem and case description are required</error>
</tool_result>`;
    }

    const problemWords = problem.toLowerCase().split(/\s+/);
    const caseWords = caseDescription.toLowerCase().split(/\s+/);

    // Calculate match score
    const matches = problemWords.filter((pw) =>
      caseWords.some((cw) => cw.includes(pw) || pw.includes(cw)),
    );

    const matchScore = matches.length / Math.max(1, problemWords.length);
    const featureMatch = features
      ? features.filter((f) =>
          caseDescription.toLowerCase().includes(f.toLowerCase()),
        ).length / features.length
      : null;

    const finalScore =
      featureMatch !== null ? (matchScore + featureMatch) / 2 : matchScore;

    const relevance =
      finalScore > 0.7 ? "high" : finalScore > 0.4 ? "moderate" : "low";

    return `<tool_result tool="case_match" capability="67">
  <match_score>${finalScore.toFixed(3)}</match_score>
  <relevance>${relevance}</relevance>
  <analysis>
    <text_similarity>${matchScore.toFixed(3)}</text_similarity>
    ${featureMatch !== null ? `<feature_similarity>${featureMatch.toFixed(3)}</feature_similarity>` : ""}
    <matching_terms count="${matches.length}">${matches.map((m) => `<term>${m}</term>`).join("")}</matching_terms>
  </analysis>
  <recommendation>
    ${
      relevance === "high"
        ? "Strong case match - adapt solution with confidence"
        : relevance === "moderate"
          ? "Moderate match - adapt with caution and verification"
          : "Weak match - consider other cases or fresh solution"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Adapt Solution (Capability 68)
 * Adapt a past solution to the current problem
 */
export const adaptSolutionTool: ToolDefinition = {
  name: "adapt_solution",
  description:
    "Adapt a solution from a similar case to fit the current problem.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, solution, targetFeatures } = input;

    if (!problem || !solution) {
      return `<tool_result tool="adapt_solution" capability="68">
  <error>Both problem and solution are required</error>
</tool_result>`;
    }

    // Analyze solution components
    const solutionComponents = solution.split(/_/).filter((c) => c.length > 2);

    // Adapt based on target features if provided
    const adaptedComponents = targetFeatures
      ? solutionComponents.map((comp, i) => {
          if (targetFeatures[i]) {
            return targetFeatures[i];
          }
          return comp;
        })
      : solutionComponents;

    // Generate adapted solution
    const adaptedSolution = adaptedComponents.join("_");

    // Identify what was changed
    const changes = targetFeatures
      ? solutionComponents.map((orig, i) => ({
          original: orig,
          adapted: adaptedComponents[i],
          changed: orig !== adaptedComponents[i],
        }))
      : [];

    return `<tool_result tool="adapt_solution" capability="68">
  <original_solution>${solution}</original_solution>
  <adapted_solution>${adaptedSolution}</adapted_solution>
  <confidence>0.75</confidence>
  <adaptations count="${changes.filter((c) => c.changed).length}">
    ${changes
      .filter((c) => c.changed)
      .map(
        (c) => `
    <change>
      <from>${c.original}</from>
      <to>${c.adapted}</to>
    </change>`,
      )
      .join("")}
  </adaptations>
  <recommendation>
    Review adapted solution for domain-specific considerations before implementation
  </recommendation>
</tool_result>`;
  },
};

/**
 * Similarity Metric (Capability 69)
 * Calculate similarity scores between two cases
 */
export const similarityMetricTool: ToolDefinition = {
  name: "similarity_metric",
  description:
    "Calculate similarity scores between source and target cases using various metrics.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { source, target, features, targetFeatures } = input;

    if (!source || !target) {
      return `<tool_result tool="similarity_metric" capability="69">
  <error>Both source and target are required</error>
</tool_result>`;
    }

    // Calculate different similarity metrics
    const sourceWords = source.toLowerCase().split(/\s+/);
    const targetWords = target.toLowerCase().split(/\s+/);

    // Jaccard similarity
    const intersection = sourceWords.filter((s) =>
      targetWords.some((t) => t.includes(s) || s.includes(t)),
    );
    const union = [...new Set([...sourceWords, ...targetWords])];
    const jaccard = intersection.length / Math.max(1, union.length);

    // Feature-based similarity
    let featureSimilarity = 0.5;
    if (features && targetFeatures) {
      const featureMatches = features.filter((f) =>
        targetFeatures.some(
          (tf) =>
            tf.toLowerCase().includes(f.toLowerCase()) ||
            f.toLowerCase().includes(tf.toLowerCase()),
        ),
      ).length;
      featureSimilarity =
        featureMatches /
        Math.max(1, Math.max(features.length, targetFeatures.length));
    }

    // Combined similarity (weighted)
    const combinedSimilarity = jaccard * 0.4 + featureSimilarity * 0.6;

    const similarityLevel =
      combinedSimilarity > 0.7
        ? "high"
        : combinedSimilarity > 0.4
          ? "moderate"
          : "low";

    return `<tool_result tool="similarity_metric" capability="69">
  <overall_similarity>${combinedSimilarity.toFixed(3)}</overall_similarity>
  <similarity_level>${similarityLevel}</similarity_level>
  <metrics>
    <jaccard_similarity>${jaccard.toFixed(3)}</jaccard_similarity>
    <feature_similarity>${featureSimilarity.toFixed(3)}</feature_similarity>
  </metrics>
  <analysis>
    <source_length>${sourceWords.length}</source_length>
    <target_length>${targetWords.length}</target_length>
    <shared_terms>${intersection.length}</shared_terms>
  </analysis>
</tool_result>`;
  },
};

/**
 * Feature Extraction (Capability 70)
 * Extract key features from a case for comparison
 */
export const featureExtractionTool: ToolDefinition = {
  name: "feature_extraction",
  description:
    "Extract key features and characteristics from a case description.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { caseDescription } = input;

    if (!caseDescription) {
      return `<tool_result tool="feature_extraction" capability="70">
  <error>Case description is required</error>
</tool_result>`;
    }

    // Extract features using pattern matching
    const featurePatterns = [
      {
        pattern: /\b(performance|latency|speed|optimization)\b/gi,
        category: "performance",
      },
      {
        pattern: /\b(security|authentication|authorization|encryption)\b/gi,
        category: "security",
      },
      { pattern: /\b(database|query|storage|index)\b/gi, category: "data" },
      { pattern: /\b(api|endpoint|request|response)\b/gi, category: "api" },
      {
        pattern: /\b(user|interface|ui|ux|display)\b/gi,
        category: "user_interface",
      },
      {
        pattern: /\b(error|fail|exception|bug|issue)\b/gi,
        category: "error_handling",
      },
      { pattern: /\b(test|testing|unit|integration)\b/gi, category: "testing" },
      {
        pattern: /\b(deploy|deployment|release|build)\b/gi,
        category: "deployment",
      },
    ];

    const extractedFeatures: string[] = [];
    const categoryCounts: Record<string, number> = {};

    for (const { pattern, category } of featurePatterns) {
      const matches = caseDescription.match(pattern);
      if (matches) {
        extractedFeatures.push(...matches.map((m) => m.toLowerCase()));
        categoryCounts[category] = matches.length;
      }
    }

    // Get top categories
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return `<tool_result tool="feature_extraction" capability="70">
  <extracted_features count="${extractedFeatures.length}">
    ${[...new Set(extractedFeatures)].map((f) => `<feature>${f}</feature>`).join("")}
  </extracted_features>
  <top_categories count="${topCategories.length}">
    ${topCategories.map(([cat, count]) => `<category name="${cat}" count="${count}"/>`).join("")}
  </top_categories>
  <feature_count>${new Set(extractedFeatures).size}</feature_count>
</tool_result>`;
  },
};

/**
 * Case Library (Capability 71)
 * Manage the case library (view, add, update cases)
 */
export const caseLibraryTool: ToolDefinition = {
  name: "case_library",
  description: "View and manage the case library for case-based reasoning.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { domain, maxCases } = input;

    const filteredCases = domain
      ? caseLibrary.filter((c) => c.domain === domain)
      : caseLibrary;

    const limitedCases = filteredCases.slice(0, maxCases || 10);

    return `<tool_result tool="case_library" capability="71">
  <total_cases>${caseLibrary.length}</total_cases>
  <filtered_cases count="${limitedCases.length}"${domain ? ` domain="${domain}"` : ""}>
    ${limitedCases
      .map(
        (c) => `
    <case id="${c.id}">
      <problem>${c.problem}</problem>
      <solution>${c.solution}</solution>
      <features>${c.features.join(", ")}</features>
      <domain>${c.domain}</domain>
      <success_rate>${c.success}</success_rate>
    </case>`,
      )
      .join("")}
  </filtered_cases>
  <available_domains>${[...new Set(caseLibrary.map((c) => c.domain))].join(", ")}</available_domains>
</tool_result>`;
  },
};

/**
 * Case Indexing (Capability 72)
 * Index cases for efficient retrieval
 */
export const caseIndexingTool: ToolDefinition = {
  name: "case_indexing",
  description: "Index cases using various strategies for efficient retrieval.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    // Build index structure
    const domainIndex: Record<string, string[]> = {};
    const featureIndex: Record<string, string[]> = {};

    for (const c of caseLibrary) {
      // Domain index
      if (!domainIndex[c.domain]) {
        domainIndex[c.domain] = [];
      }
      domainIndex[c.domain].push(c.id);

      // Feature index
      for (const f of c.features) {
        if (!featureIndex[f]) {
          featureIndex[f] = [];
        }
        featureIndex[f].push(c.id);
      }
    }

    return `<tool_result tool="case_indexing" capability="72">
  <indexing_strategy>feature_based</indexing_strategy>
  <domain_index>
    ${Object.entries(domainIndex)
      .map(
        ([d, ids]) => `
    <domain name="${d}" case_count="${ids.length}">
      ${ids.map((id) => `<case_id>${id}</case_id>`).join("")}
    </domain>`,
      )
      .join("")}
  </domain_index>
  <feature_index feature_count="${Object.keys(featureIndex).length}">
    ${Object.entries(featureIndex)
      .slice(0, 5)
      .map(
        ([f, ids]) => `
    <feature name="${f}" case_count="${ids.length}"/>`,
      )
      .join("")}
    ${Object.keys(featureIndex).length > 5 ? `<more>${Object.keys(featureIndex).length - 5} more features</more>` : ""}
  </feature_index>
  <index_stats>
    <total_cases_indexed>${caseLibrary.length}</total_cases_indexed>
    <total_features>${Object.keys(featureIndex).length}</total_features>
  </index_stats>
</tool_result>`;
  },
};

/**
 * Analogical Transfer (Capability 73)
 * Transfer knowledge between domains using analogy
 */
export const analogicalTransferTool: ToolDefinition = {
  name: "analogical_transfer",
  description:
    "Transfer knowledge or solutions from one domain to another using analogy.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { source, target, transferType } = input;

    if (!source || !target) {
      return `<tool_result tool="analogical_transfer" capability="73">
  <error>Both source and target domains/cases are required</error>
</tool_result>`;
    }

    // Analyze structural similarity based on transfer type
    const sourceWords = source.toLowerCase().split(/\s+/);
    const targetWords = target.toLowerCase().split(/\s+/);

    let transferStrength = 0.5;

    switch (transferType) {
      case "structural":
        // Focus on abstract structure
        transferStrength = 0.6;
        break;
      case "relational":
        // Focus on relationships
        transferStrength = 0.55;
        break;
      case "surface":
        // Focus on surface features
        transferStrength = 0.4;
        break;
    }

    // Calculate actual similarity
    const matches = sourceWords.filter((s) =>
      targetWords.some((t) => t.includes(s) || s.includes(t)),
    );
    const similarity =
      matches.length /
      Math.max(1, Math.min(sourceWords.length, targetWords.length));

    const adjustedStrength = transferStrength * similarity;

    return `<tool_result tool="analogical_transfer" capability="73">
  <transfer_type>${transferType}</transfer_type>
  <transfer_strength>${adjustedStrength.toFixed(3)}</transfer_strength>
  <source>${source}</source>
  <target>${target}</target>
  <analysis>
    <base_strength>${transferStrength}</base_strength>
    <similarity_factor>${similarity.toFixed(3)}</similarity_factor>
    <mapped_concepts>${matches.length}</mapped_concepts>
  </analysis>
  <recommendation>
    ${
      adjustedStrength > 0.5
        ? "Strong transfer potential - adapt with confidence"
        : adjustedStrength > 0.3
          ? "Moderate transfer - verify mapping carefully"
          : "Weak transfer - consider domain-specific solutions"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Schema Mapping (Capability 74)
 * Map problem schemas between different representations
 */
export const schemaMappingTool: ToolDefinition = {
  name: "schema_mapping",
  description:
    "Map problem schemas between different domains or representations.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { schemaSource, schemaTarget } = input;

    if (!schemaSource || !schemaTarget) {
      return `<tool_result tool="schema_mapping" capability="74">
  <error>Both source and target schemas are required</error>
</tool_result>`;
    }

    // Parse schemas (simple key:value format)
    const parseSchema = (s: string) => {
      const pairs = s.split(/[,;]/).filter((p) => p.includes(":"));
      return pairs.map((p) => {
        const [key, value] = p.split(":").map((k) => k.trim());
        return { key, value };
      });
    };

    const sourceSchema = parseSchema(schemaSource);
    const targetSchema = parseSchema(schemaTarget);

    // Map schemas
    const mappings: {
      sourceKey: string;
      targetKey: string;
      confidence: number;
    }[] = [];

    for (const src of sourceSchema) {
      for (const tgt of targetSchema) {
        // Simple name-based matching
        const srcKey = src.key.toLowerCase();
        const tgtKey = tgt.key.toLowerCase();

        if (srcKey.includes(tgtKey) || tgtKey.includes(srcKey)) {
          mappings.push({
            sourceKey: src.key,
            targetKey: tgt.key,
            confidence: 0.9,
          });
        } else if (src.value.toLowerCase() === tgt.value.toLowerCase()) {
          mappings.push({
            sourceKey: src.key,
            targetKey: tgt.key,
            confidence: 0.7,
          });
        }
      }
    }

    const mapConfidence =
      mappings.length > 0
        ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
        : 0;

    return `<tool_result tool="schema_mapping" capability="74">
  <mapping_confidence>${mapConfidence.toFixed(3)}</mapping_confidence>
  <mappings count="${mappings.length}">
    ${mappings
      .map(
        (m) => `
    <mapping source="${m.sourceKey}" target="${m.targetKey}" confidence="${m.confidence}"/>`,
      )
      .join("")}
  </mappings>
  <source_schema>${schemaSource}</source_schema>
  <target_schema>${schemaTarget}</target_schema>
  <recommendation>
    ${
      mapConfidence > 0.7
        ? "Schema mapping successful - proceed with transfer"
        : mapConfidence > 0.4
          ? "Partial mapping - verify unmapped fields"
          : "Weak mapping - consider schema redesign"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Case Revision (Capability 75)
 * Revise and improve case solutions based on feedback
 */
export const caseRevisionTool: ToolDefinition = {
  name: "case_revision",
  description:
    "Revise and improve a case solution based on feedback or new information.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { solution, targetFeatures } = input;

    if (!solution) {
      return `<tool_result tool="case_revision" capability="75">
  <error>Solution to revise is required</error>
</tool_result>`;
    }

    // Simple revision logic
    const revisions: string[] = [];
    let revisedSolution = solution;

    if (targetFeatures) {
      for (const feature of targetFeatures) {
        // Check if feature is an improvement directive
        if (feature.startsWith("add_") || feature.startsWith("include_")) {
          const addition = feature.replace(/^(add_|include_)/, "");
          revisions.push(`Added: ${addition}`);
        } else if (
          feature.startsWith("remove_") ||
          feature.startsWith("exclude_")
        ) {
          const removal = feature.replace(/^(remove_|exclude_)/, "");
          revisions.push(`Removed: ${removal}`);
        } else if (
          feature.startsWith("improve_") ||
          feature.startsWith("enhance_")
        ) {
          const improvement = feature.replace(/^(improve_|enhance_)/, "");
          revisions.push(`Improved: ${improvement}`);
        }
      }
    }

    const revisionQuality =
      revisions.length > 0
        ? Math.min(0.95, 0.5 + revisions.length * 0.15)
        : 0.5;

    return `<tool_result tool="case_revision" capability="75">
  <original_solution>${solution}</original_solution>
  <revised_solution>${revisedSolution}</revised_solution>
  <revisions count="${revisions.length}">
    ${revisions.map((r) => `<revision>${r}</revision>`).join("")}
  </revisions>
  <revision_quality>${revisionQuality.toFixed(3)}</revision_quality>
  <recommendation>
    Test revised solution against original problem requirements
  </recommendation>
</tool_result>`;
  },
};

/**
 * CBR Cycle (Capability 76)
 * Complete the full Case-Based Reasoning cycle
 */
export const cbrCycleTool: ToolDefinition = {
  name: "cbr_cycle",
  description:
    "Execute the complete Case-Based Reasoning cycle: retrieve, reuse, revise, retain.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, maxCases = 3 } = input;

    if (!problem) {
      return `<tool_result tool="cbr_cycle" capability="76">
  <error>Problem description is required</error>
</tool_result>`;
    }

    // Step 1: Retrieve
    const problemWords = problem.toLowerCase().split(/\s+/);
    const retrieved = caseLibrary
      .map((c) => {
        const matches = c.features.filter((f) =>
          problemWords.some((pw) => pw.includes(f) || f.includes(pw)),
        ).length;
        return { ...c, similarity: matches / c.features.length };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxCases);

    // Step 2: Reuse (adapt best match)
    const bestMatch = retrieved[0];
    const adaptedSolution = bestMatch
      ? bestMatch.solution.replace(/_/g, " ")
      : "No similar case found";

    // Step 3: Revise (simulated - would incorporate feedback in real system)
    const revisedSolution = adaptedSolution;
    const confidence = bestMatch ? bestMatch.success * bestMatch.similarity : 0;

    // Step 4: Retain (would save to library in real system)
    const retained = bestMatch && confidence > 0.5;

    return `<tool_result tool="cbr_cycle" capability="76">
  <cbr_cycle complete="true">
    <retrieve>
      <cases_found>${retrieved.length}</cases_found>
      <best_match>${bestMatch?.id || "none"}</best_match>
    </retrieve>
    <reuse>
      <adapted_solution>${adaptedSolution}</adapted_solution>
    </reuse>
    <revise>
      <revised_solution>${revisedSolution}</revised_solution>
    </revise>
    <retain>
      <retain_case>${retained}</retain_case>
      <reason>${retained ? "High confidence solution" : "Confidence too low"}</reason>
    </retain>
  </cbr_cycle>
  <confidence>${confidence.toFixed(3)}</confidence>
  <recommendation>
    ${
      confidence > 0.7
        ? "High confidence - proceed with solution"
        : confidence > 0.4
          ? "Moderate confidence - verify solution"
          : "Low confidence - consider alternative approaches"
    }
  </recommendation>
</tool_result>`;
  },
};

/**
 * Nearest Neighbor (Capability 77)
 * Find nearest neighbor cases using similarity metrics
 */
export const nearestNeighborTool: ToolDefinition = {
  name: "nearest_neighbor",
  description:
    "Find the nearest neighbor cases using k-nearest neighbor retrieval.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { features, maxCases = 3 } = input;

    if (!features || features.length === 0) {
      return `<tool_result tool="nearest_neighbor" capability="77">
  <error>Features for comparison are required</error>
</tool_result>`;
    }

    // Calculate distance to all cases
    const withDistances = caseLibrary.map((c) => {
      const matches = c.features.filter((f) =>
        features.some(
          (ef) =>
            ef.toLowerCase().includes(f.toLowerCase()) ||
            f.toLowerCase().includes(ef.toLowerCase()),
        ),
      ).length;
      const distance =
        1 - matches / Math.max(features.length, c.features.length);
      return { ...c, distance, similarity: 1 - distance };
    });

    // Sort by distance (nearest first)
    const neighbors = withDistances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxCases);

    return `<tool_result tool="nearest_neighbor" capability="77">
  <query_features>${features.join(", ")}</query_features>
  <neighbors count="${neighbors.length}">
    ${neighbors
      .map(
        (n, i) => `
    <neighbor rank="${i + 1}">
      <case_id>${n.id}</case_id>
      <distance>${n.distance.toFixed(3)}</distance>
      <similarity>${n.similarity.toFixed(3)}</similarity>
      <problem>${n.problem}</problem>
      <solution>${n.solution}</solution>
    </neighbor>`,
      )
      .join("")}
  </neighbors>
  <algorithm>k-nearest_neighbor</algorithm>
  <k>${maxCases}</k>
</tool_result>`;
  },
};

/**
 * Case Validation (Capability 78)
 * Validate a case solution against known criteria
 */
export const caseValidationTool: ToolDefinition = {
  name: "case_validation",
  description:
    "Validate a case solution against known criteria and constraints.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, solution, features } = input;

    if (!problem || !solution) {
      return `<tool_result tool="case_validation" capability="78">
  <error>Both problem and solution are required</error>
</tool_result>`;
    }

    // Check solution completeness
    const solutionComponents = solution.split("_").filter((c) => c.length > 2);
    const expectedComponents = 2; // Minimum expected

    const completeness = Math.min(
      1.0,
      solutionComponents.length / expectedComponents,
    );

    // Check relevance (solution addresses problem)
    const problemWords = problem.toLowerCase().split(/\s+/);
    const solutionWords = solution.toLowerCase().split(/_/);
    const relevance =
      problemWords.filter((pw) =>
        solutionWords.some((sw) => sw.includes(pw) || pw.includes(sw)),
      ).length / problemWords.length;

    // Check feature coverage
    const coverage = features
      ? features.filter((f) => solution.toLowerCase().includes(f.toLowerCase()))
          .length / features.length
      : 0.5;

    const validationScore =
      completeness * 0.3 + relevance * 0.5 + coverage * 0.2;

    const isValid = validationScore > 0.5;

    return `<tool_result tool="case_validation" capability="78">
  <validation_score>${validationScore.toFixed(3)}</validation_score>
  <is_valid>${isValid}</is_valid>
  <checks>
    <completeness score="${completeness.toFixed(3)}">${solutionComponents.length} components</completeness>
    <relevance score="${relevance.toFixed(3)}">${relevance > 0.3 ? "Addresses problem" : "May not address problem"}</relevance>
    <coverage score="${coverage.toFixed(3)}">${features ? `${features.length} features` : "No features to check"}</coverage>
  </checks>
  <recommendation>
    ${isValid ? "Solution passes validation criteria" : "Solution fails validation - review required"}
  </recommendation>
</tool_result>`;
  },
};

/**
 * Case Storage (Capability 79)
 * Store new cases in the case library
 */
export const caseStorageTool: ToolDefinition = {
  name: "case_storage",
  description: "Store new cases in the case library for future retrieval.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { problem, solution, features, domain } = input;

    if (!problem || !solution) {
      return `<tool_result tool="case_storage" capability="79">
  <error>Problem and solution are required</error>
</tool_result>`;
    }

    // In a real system, this would persist to a database
    // Here we simulate successful storage
    const newCase: Case = {
      id: `case_${Date.now()}`,
      problem,
      solution,
      features: features || [],
      domain: domain || "general",
      success: 0.7, // Default assumed success rate
    };

    // Note: In production, would actually add to database
    // caseLibrary.push(newCase);

    return `<tool_result tool="case_storage" capability="79">
  <stored_case>
    <id>${newCase.id}</id>
    <problem>${newCase.problem}</problem>
    <solution>${newCase.solution}</solution>
    <domain>${newCase.domain}</domain>
  </stored_case>
  <storage_status>simulated</storage_status>
  <note>In production, this would persist to the case library database</note>
  <recommendation>
    Track case success rate to update confidence over time
  </recommendation>
</tool_result>`;
  },
};

/**
 * Analogy Quality (Capability 80)
 * Assess the quality of an analogy
 */
export const analogyQualityTool: ToolDefinition = {
  name: "analogy_quality",
  description:
    "Assess the quality and strength of an analogy between two domains.",
  inputSchema: AnalogicalInputSchema,
  defaultConsent: "always",
  modifiesState: false,
  execute: async (
    input: AnalogicalInput,
    context: AgentContext,
  ): Promise<string> => {
    const { source, target, transferType } = input;

    if (!source || !target) {
      return `<tool_result tool="analogy_quality" capability="80">
  <error>Both source and target are required</error>
</tool_result>`;
    }

    // Assess various quality dimensions
    const sourceWords = source.toLowerCase().split(/\s+/);
    const targetWords = target.toLowerCase().split(/\s+/);

    // Surface similarity
    const surfaceMatches = sourceWords.filter((s) =>
      targetWords.some((t) => t.includes(s) || s.includes(t)),
    ).length;
    const surfaceSimilarity =
      surfaceMatches /
      Math.max(1, Math.min(sourceWords.length, targetWords.length));

    // Structural similarity (estimated based on length/complexity similarity)
    const lengthRatio =
      Math.min(sourceWords.length, targetWords.length) /
      Math.max(sourceWords.length, targetWords.length);
    const structuralSimilarity = lengthRatio;

    // Transfer potential based on type
    let transferPotential = 0.5;
    switch (transferType) {
      case "structural":
        transferPotential = structuralSimilarity;
        break;
      case "relational":
        transferPotential = (surfaceSimilarity + structuralSimilarity) / 2;
        break;
      case "surface":
        transferPotential = surfaceSimilarity;
        break;
    }

    // Combined quality score
    const qualityScore =
      surfaceSimilarity * 0.3 +
      structuralSimilarity * 0.3 +
      transferPotential * 0.4;

    const qualityLevel =
      qualityScore > 0.7 ? "strong" : qualityScore > 0.4 ? "moderate" : "weak";

    return `<tool_result tool="analogy_quality" capability="80">
  <quality_score>${qualityScore.toFixed(3)}</quality_score>
  <quality_level>${qualityLevel}</quality_level>
  <dimensions>
    <surface_similarity>${surfaceSimilarity.toFixed(3)}</surface_similarity>
    <structural_similarity>${structuralSimilarity.toFixed(3)}</structural_similarity>
    <transfer_potential>${transferPotential.toFixed(3)}</transfer_potential>
  </dimensions>
  <source>${source}</source>
  <target>${target}</target>
  <transfer_type>${transferType || "auto"}</transfer_type>
  <recommendation>
    ${
      qualityLevel === "strong"
        ? "Strong analogy - suitable for knowledge transfer"
        : qualityLevel === "moderate"
          ? "Moderate analogy - verify key mappings"
          : "Weak analogy - consider alternative comparisons"
    }
  </recommendation>
</tool_result>`;
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const analogicalTools = [
  caseRetrievalTool,
  caseMatchTool,
  adaptSolutionTool,
  similarityMetricTool,
  featureExtractionTool,
  caseLibraryTool,
  caseIndexingTool,
  analogicalTransferTool,
  schemaMappingTool,
  caseRevisionTool,
  cbrCycleTool,
  nearestNeighborTool,
  caseValidationTool,
  caseStorageTool,
  analogyQualityTool,
];

export default analogicalTools;
