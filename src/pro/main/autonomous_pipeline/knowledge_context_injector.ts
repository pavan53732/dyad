/**
 * Proactive Knowledge Context Injector
 * 
 * Injects Knowledge Integration Layer context BEFORE agent execution.
 * This transforms KIL from tool-invoked knowledge to automatic reasoning context.
 * 
 * Integration Point: local_agent_handler.ts (before streamText call)
 * 
 * Evolution Phase: Autonomous Execution Pipeline - Task 1
 */

import log from "electron-log";
import {
  QueryOrchestrator,
  LearningRepository,
  type UnifiedKnowledgeEntity,
  type KnowledgeSource,
} from "../knowledge_integration";

const logger = log.scope("proactive_knowledge");

// ============================================================================
// Configuration
// ============================================================================

export interface KnowledgeInjectionConfig {
  /** Enable proactive knowledge injection */
  enabled: boolean;
  /** Maximum entities to inject into context */
  maxEntities: number;
  /** Maximum context string length */
  maxContextLength: number;
  /** Knowledge sources to query */
  sources: KnowledgeSource[];
  /** Minimum confidence for inclusion */
  minConfidence: number;
  /** Enable related decisions */
  includeDecisions: boolean;
  /** Enable recommendations */
  includeRecommendations: boolean;
  /** Enable similar patterns */
  includePatterns: boolean;
}

export const DEFAULT_KNOWLEDGE_INJECTION_CONFIG: KnowledgeInjectionConfig = {
  enabled: true,
  maxEntities: 15,
  maxContextLength: 8000,
  sources: ["code_graph", "vector_memory", "architecture"],
  minConfidence: 0.5,
  includeDecisions: true,
  includeRecommendations: true,
  includePatterns: true,
};

// ============================================================================
// Types
// ============================================================================

export interface IntentAnalysis {
  /** Detected intent type */
  type: IntentType;
  /** Confidence in classification */
  confidence: number;
  /** Key entities mentioned */
  entities: string[];
  /** Files likely involved */
  files: string[];
  /** Technologies detected */
  technologies: string[];
  /** Estimated complexity (1-10) */
  complexity: number;
  /** Keywords that triggered classification */
  triggers: string[];
}

export type IntentType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "documentation"
  | "deployment"
  | "exploration"
  | "maintenance"
  | "custom";

export interface KnowledgeInjectionResult {
  /** Original request */
  request: string;
  /** Analyzed intent */
  intent: IntentAnalysis;
  /** Injected context string */
  contextString: string;
  /** Entities included */
  entities: UnifiedKnowledgeEntity[];
  /** Related decisions */
  decisions: DecisionSummary[];
  /** Recommendations */
  recommendations: string[];
  /** Patterns applied */
  patterns: PatternSummary[];
  /** Time to build context (ms) */
  buildTimeMs: number;
  /** Token estimate */
  tokenEstimate: number;
}

export interface DecisionSummary {
  id: string;
  title: string;
  type: string;
  selectedOption: string;
  relevance: number;
}

export interface PatternSummary {
  condition: string;
  solution: string;
  applicability: number;
}

// ============================================================================
// Intent Classification Patterns
// ============================================================================

const INTENT_PATTERNS: Record<IntentType, {
  keywords: string[];
  weight: number;
  complexityMod: number;
}> = {
  feature: {
    keywords: ["implement", "add", "create", "build", "develop", "introduce", "new feature"],
    weight: 1.0,
    complexityMod: 0,
  },
  bugfix: {
    keywords: ["fix", "bug", "error", "issue", "problem", "not working", "broken", "crash", "exception"],
    weight: 1.2,
    complexityMod: -1,
  },
  refactor: {
    keywords: ["refactor", "restructure", "clean up", "improve", "optimize", "simplify", "reorganize"],
    weight: 0.9,
    complexityMod: 1,
  },
  test: {
    keywords: ["test", "spec", "testing", "coverage", "unit test", "integration test"],
    weight: 0.8,
    complexityMod: -1,
  },
  documentation: {
    keywords: ["document", "docs", "readme", "comment", "explain", "describe"],
    weight: 0.7,
    complexityMod: -2,
  },
  deployment: {
    keywords: ["deploy", "release", "ship", "publish", "production", "staging"],
    weight: 1.1,
    complexityMod: 1,
  },
  exploration: {
    keywords: ["explore", "understand", "analyze", "investigate", "review", "explain how"],
    weight: 0.6,
    complexityMod: -1,
  },
  maintenance: {
    keywords: ["update", "upgrade", "migrate", "maintain", "dependency", "version"],
    weight: 0.8,
    complexityMod: 0,
  },
  custom: {
    keywords: [],
    weight: 0.5,
    complexityMod: 0,
  },
};

const TECHNOLOGY_PATTERNS: Record<string, RegExp> = {
  typescript: /\btypescript\b|\bts\b|\.ts\b/i,
  javascript: /\bjavascript\b|\bjs\b|\.js\b/i,
  react: /\breact\b|\.tsx\b|\.jsx\b/i,
  node: /\bnode\.?js?\b/i,
  python: /\bpython\b|\.py\b/i,
  postgresql: /\bpostgres|postgresql|pg\b/i,
  mongodb: /\bmongodb|mongo\b/i,
  redis: /\bredis\b/i,
  graphql: /\bgraphql\b/i,
  docker: /\bdocker\b/i,
  kubernetes: /\bkubernetes|k8s\b/i,
  aws: /\baws\b|\bs3\b|\bec2\b|\blambda\b/i,
  vercel: /\bvercel\b/i,
  nextjs: /\bnext\.?js\b|\bnext\b/i,
  tailwind: /\btailwind\b/i,
  prisma: /\bprisma\b/i,
};

// ============================================================================
// Knowledge Context Injector
// ============================================================================

/**
 * Proactive Knowledge Context Injector
 * 
 * Builds and injects knowledge context before agent execution.
 */
export class KnowledgeContextInjector {
  private config: KnowledgeInjectionConfig;
  private queryOrchestrator: QueryOrchestrator;
  private learningRepository: LearningRepository;

  constructor(config: Partial<KnowledgeInjectionConfig> = {}) {
    this.config = { ...DEFAULT_KNOWLEDGE_INJECTION_CONFIG, ...config };
    this.queryOrchestrator = new QueryOrchestrator();
    this.learningRepository = new LearningRepository();

    logger.info("Knowledge Context Injector initialized", {
      enabled: this.config.enabled,
      maxEntities: this.config.maxEntities,
      sources: this.config.sources,
    });
  }

  /**
   * Build knowledge context for a request
   */
  async buildContext(
    request: string,
    appId: number,
    options?: {
      additionalFiles?: string[];
      previousContext?: string;
    }
  ): Promise<KnowledgeInjectionResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return this.emptyResult(request, startTime);
    }

    // 1. Analyze intent
    const intent = this.analyzeIntent(request, options?.additionalFiles);

    // 2. Query knowledge sources
    const entities = await this.queryKnowledgeSources(request, appId, intent);

    // 3. Get related decisions
    const decisions = this.config.includeDecisions
      ? await this.getRelatedDecisions(request, appId)
      : [];

    // 4. Get recommendations
    const recommendations = this.config.includeRecommendations
      ? await this.getRecommendations(request, appId)
      : [];

    // 5. Get similar patterns
    const patterns = this.config.includePatterns
      ? await this.getSimilarPatterns(request, appId)
      : [];

    // 6. Build context string
    const contextString = this.buildContextString(
      request,
      intent,
      entities,
      decisions,
      recommendations,
      patterns
    );

    const buildTimeMs = Date.now() - startTime;
    const tokenEstimate = Math.ceil(contextString.length / 4);

    logger.info("Knowledge context built", {
      intent: intent.type,
      entityCount: entities.length,
      decisionCount: decisions.length,
      buildTimeMs,
      tokenEstimate,
    });

    return {
      request,
      intent,
      contextString,
      entities,
      decisions,
      recommendations,
      patterns,
      buildTimeMs,
      tokenEstimate,
    };
  }

  /**
   * Analyze request intent
   */
  private analyzeIntent(
    request: string,
    additionalFiles?: string[]
  ): IntentAnalysis {
    const lower = request.toLowerCase();
    const words = lower.split(/\s+/);

    // Score each intent type
    const scores: Map<IntentType, number> = new Map();
    const triggers: string[] = [];

    for (const [type, pattern] of Object.entries(INTENT_PATTERNS)) {
      let score = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of pattern.keywords) {
        if (lower.includes(keyword)) {
          score += pattern.weight;
          matchedKeywords.push(keyword);
        }
      }

      scores.set(type as IntentType, score);
      triggers.push(...matchedKeywords);
    }

    // Find best intent
    let bestType: IntentType = "custom";
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Calculate confidence
    const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;

    // Extract entities (file paths, identifiers)
    const entities: string[] = [];
    const filePattern = /[\w/.-]+\.(ts|tsx|js|jsx|py|go|rs|java|json|yaml|yml|md)/gi;
    const fileMatches = request.match(filePattern);
    if (fileMatches) {
      entities.push(...fileMatches);
    }
    if (additionalFiles) {
      entities.push(...additionalFiles);
    }

    // Detect technologies
    const technologies: string[] = [];
    for (const [tech, pattern] of Object.entries(TECHNOLOGY_PATTERNS)) {
      if (pattern.test(request)) {
        technologies.push(tech);
      }
    }

    // Estimate complexity
    const baseComplexity = INTENT_PATTERNS[bestType]?.complexityMod || 0;
    let complexity = 5 + baseComplexity;

    // Adjust for request length
    if (words.length > 30) complexity += 1;
    if (words.length > 60) complexity += 1;

    // Adjust for multi-step keywords
    if (lower.includes("and") || lower.includes("then") || lower.includes("also")) {
      complexity += 1;
    }

    // Adjust for complexity keywords
    if (lower.includes("simple") || lower.includes("quick")) complexity -= 2;
    if (lower.includes("complex") || lower.includes("comprehensive")) complexity += 2;
    if (lower.includes("architecture")) complexity += 2;

    complexity = Math.max(1, Math.min(10, complexity));

    return {
      type: bestType,
      confidence: Math.min(1, confidence),
      entities: [...new Set(entities)],
      files: entities.filter(e => e.includes(".")),
      technologies,
      complexity,
      triggers: [...new Set(triggers)],
    };
  }

  /**
   * Query knowledge sources for relevant entities
   */
  private async queryKnowledgeSources(
    request: string,
    appId: number,
    intent: IntentAnalysis
  ): Promise<UnifiedKnowledgeEntity[]> {
    try {
      // Build query from request and intent
      const query = this.buildQuery(request, intent);

      const result = await this.queryOrchestrator.query({
        id: `proactive_${appId}_${Date.now()}`,
        appId,
        query,
        sources: this.config.sources,
        limit: this.config.maxEntities,
      });

      // Filter by confidence
      return result.entities.filter(
        e => (e.metadata?.confidence || 0) >= this.config.minConfidence
      );
    } catch (error) {
      logger.warn("Failed to query knowledge sources:", error);
      return [];
    }
  }

  /**
   * Build optimized query from request and intent
   */
  private buildQuery(request: string, intent: IntentAnalysis): string {
    // Extract key terms from request
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just"]);

    const words = request.toLowerCase()
      .replace(/[^\w\s.-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Add intent entities
    const allTerms = [...new Set([...words, ...intent.entities, ...intent.technologies])];

    // Take most relevant terms
    return allTerms.slice(0, 20).join(" ");
  }

  /**
   * Get related architecture decisions
   */
  private async getRelatedDecisions(
    request: string,
    _appId: number
  ): Promise<DecisionSummary[]> {
    try {
      const decisions = await this.learningRepository.findSimilarDecisions(
        {
          problem: request,
          constraints: [],
          goals: [],
          relevantPaths: [],
        },
        { limit: 5 }
      );

      return decisions.map(({ decision, similarity }) => ({
        id: decision.id,
        title: decision.title,
        type: decision.type,
        selectedOption: decision.selectedOption,
        relevance: similarity,
      }));
    } catch (error) {
      logger.warn("Failed to get related decisions:", error);
      return [];
    }
  }

  /**
   * Get recommendations from learning repository
   */
  private async getRecommendations(
    request: string,
    appId: number
  ): Promise<string[]> {
    try {
      const recommendations = await this.learningRepository.getRecommendations(
        appId,
        {
          problem: request,
          constraints: [],
          goals: [],
          relevantPaths: [],
        }
      );

      return recommendations.slice(0, 5).map(rec => {
        if (typeof rec === "string") return rec;
        if (rec.text) return rec.text;
        return JSON.stringify(rec);
      });
    } catch (error) {
      logger.warn("Failed to get recommendations:", error);
      return [];
    }
  }

  /**
   * Get similar patterns
   */
  private async getSimilarPatterns(
    request: string,
    appId: number
  ): Promise<PatternSummary[]> {
    try {
      const patterns = await this.learningRepository.getLearnedPatterns(
        appId,
        {
          problem: request,
          constraints: [],
          goals: [],
          relevantPaths: [],
        }
      );

      return patterns.slice(0, 3).map(pattern => ({
        condition: pattern.condition,
        solution: pattern.solution,
        applicability: pattern.applicability,
      }));
    } catch (error) {
      logger.warn("Failed to get similar patterns:", error);
      return [];
    }
  }

  /**
   * Build context string for injection
   */
  private buildContextString(
    request: string,
    intent: IntentAnalysis,
    entities: UnifiedKnowledgeEntity[],
    decisions: DecisionSummary[],
    recommendations: string[],
    patterns: PatternSummary[]
  ): string {
    const sections: string[] = [];

    // Header
    sections.push("╔════════════════════════════════════════════════════════════════╗");
    sections.push("║           PROACTIVE KNOWLEDGE CONTEXT INJECTION                 ║");
    sections.push("╚════════════════════════════════════════════════════════════════╝");
    sections.push("");

    // Intent Analysis
    sections.push("## Task Intent Analysis");
    sections.push(`**Type:** ${intent.type.toUpperCase()} (confidence: ${(intent.confidence * 100).toFixed(0)}%)`);
    sections.push(`**Complexity:** ${intent.complexity}/10`);
    if (intent.technologies.length > 0) {
      sections.push(`**Technologies:** ${intent.technologies.join(", ")}`);
    }
    if (intent.files.length > 0) {
      sections.push(`**Relevant Files:** ${intent.files.slice(0, 5).join(", ")}`);
    }
    sections.push("");

    // Relevant Entities
    if (entities.length > 0) {
      sections.push("## Relevant Code Entities");
      sections.push("```");
      for (const entity of entities.slice(0, 10)) {
        const source = entity.source?.toUpperCase() || "UNKNOWN";
        const type = entity.type || "unknown";
        const path = entity.filePath || "N/A";
        const desc = entity.description?.substring(0, 80) || "";
        
        sections.push(`[${source}] ${entity.name} (${type})`);
        if (path !== "N/A") {
          sections.push(`  📁 ${path}`);
        }
        if (desc) {
          sections.push(`  ℹ️  ${desc}${desc.length >= 80 ? "..." : ""}`);
        }
      }
      sections.push("```");
      sections.push("");
    }

    // Related Decisions
    if (decisions.length > 0) {
      sections.push("## Related Architecture Decisions");
      sections.push("```");
      for (const decision of decisions) {
        sections.push(`• ${decision.title}`);
        sections.push(`  → Chose: "${decision.selectedOption}" (${decision.type})`);
        sections.push(`  Relevance: ${(decision.relevance * 100).toFixed(0)}%`);
      }
      sections.push("```");
      sections.push("");
    }

    // Recommendations
    if (recommendations.length > 0) {
      sections.push("## Learning-Based Recommendations");
      sections.push("```");
      for (let i = 0; i < recommendations.length; i++) {
        sections.push(`${i + 1}. ${recommendations[i]}`);
      }
      sections.push("```");
      sections.push("");
    }

    // Similar Patterns
    if (patterns.length > 0) {
      sections.push("## Similar Patterns From Past Executions");
      sections.push("```");
      for (const pattern of patterns) {
        sections.push(`WHEN: ${pattern.condition}`);
        sections.push(`THEN: ${pattern.solution}`);
        sections.push(`Applicability: ${(pattern.applicability * 100).toFixed(0)}%`);
        sections.push("");
      }
      sections.push("```");
    }

    // Footer
    sections.push("═══════════════════════════════════════════════════════════════════");
    sections.push("> Context injected proactively before agent execution.");
    sections.push("> Use this context to inform your reasoning and tool selection.");
    sections.push("═══════════════════════════════════════════════════════════════════");

    let result = sections.join("\n");

    // Truncate if too long
    if (result.length > this.config.maxContextLength) {
      result = result.substring(0, this.config.maxContextLength);
      result += "\n\n[Context truncated for length]";
    }

    return result;
  }

  /**
   * Get empty result for disabled injection
   */
  private emptyResult(request: string, startTime: number): KnowledgeInjectionResult {
    return {
      request,
      intent: {
        type: "custom",
        confidence: 0,
        entities: [],
        files: [],
        technologies: [],
        complexity: 5,
        triggers: [],
      },
      contextString: "",
      entities: [],
      decisions: [],
      recommendations: [],
      patterns: [],
      buildTimeMs: Date.now() - startTime,
      tokenEstimate: 0,
    };
  }

  /**
   * Inject context into system prompt
   */
  injectIntoSystemPrompt(
    systemPrompt: string,
    knowledgeContext: KnowledgeInjectionResult
  ): string {
    if (!knowledgeContext.contextString) {
      return systemPrompt;
    }

    // Find insertion point (before the main instructions)
    const insertionPoint = systemPrompt.indexOf("\n\n## ");
    if (insertionPoint > 0) {
      return (
        systemPrompt.substring(0, insertionPoint) +
        "\n\n" +
        knowledgeContext.contextString +
        "\n" +
        systemPrompt.substring(insertionPoint)
      );
    }

    // Append to end if no good insertion point
    return systemPrompt + "\n\n" + knowledgeContext.contextString;
  }

  /**
   * Get context as XML for structured injection
   */
  getContextAsXml(knowledgeContext: KnowledgeInjectionResult): string {
    const parts: string[] = [];

    parts.push(`<proactive-knowledge-context>`);

    // Intent
    parts.push(`  <intent type="${knowledgeContext.intent.type}" confidence="${knowledgeContext.intent.confidence.toFixed(2)}" complexity="${knowledgeContext.intent.complexity}">`);
    if (knowledgeContext.intent.technologies.length > 0) {
      parts.push(`    <technologies>${knowledgeContext.intent.technologies.join(", ")}</technologies>`);
    }
    if (knowledgeContext.intent.files.length > 0) {
      parts.push(`    <files>${knowledgeContext.intent.files.slice(0, 5).join(", ")}</files>`);
    }
    parts.push(`  </intent>`);

    // Entities
    if (knowledgeContext.entities.length > 0) {
      parts.push(`  <entities count="${knowledgeContext.entities.length}">`);
      for (const entity of knowledgeContext.entities.slice(0, 10)) {
        parts.push(`    <entity name="${entity.name}" type="${entity.type}" source="${entity.source}">`);
        if (entity.filePath) {
          parts.push(`      <path>${entity.filePath}</path>`);
        }
        if (entity.description) {
          parts.push(`      <description>${entity.description.substring(0, 100)}</description>`);
        }
        parts.push(`    </entity>`);
      }
      parts.push(`  </entities>`);
    }

    // Decisions
    if (knowledgeContext.decisions.length > 0) {
      parts.push(`  <decisions count="${knowledgeContext.decisions.length}">`);
      for (const decision of knowledgeContext.decisions) {
        parts.push(`    <decision title="${decision.title}" chosen="${decision.selectedOption}" relevance="${decision.relevance.toFixed(2)}" />`);
      }
      parts.push(`  </decisions>`);
    }

    // Recommendations
    if (knowledgeContext.recommendations.length > 0) {
      parts.push(`  <recommendations count="${knowledgeContext.recommendations.length}">`);
      for (const rec of knowledgeContext.recommendations) {
        parts.push(`    <recommendation>${rec}</recommendation>`);
      }
      parts.push(`  </recommendations>`);
    }

    // Patterns
    if (knowledgeContext.patterns.length > 0) {
      parts.push(`  <patterns count="${knowledgeContext.patterns.length}">`);
      for (const pattern of knowledgeContext.patterns) {
        parts.push(`    <pattern applicability="${pattern.applicability.toFixed(2)}">`);
        parts.push(`      <condition>${pattern.condition}</condition>`);
        parts.push(`      <solution>${pattern.solution}</solution>`);
        parts.push(`    </pattern>`);
      }
      parts.push(`  </patterns>`);
    }

    parts.push(`  <metadata buildTimeMs="${knowledgeContext.buildTimeMs}" tokenEstimate="${knowledgeContext.tokenEstimate}" />`);
    parts.push(`</proactive-knowledge-context>`);

    return parts.join("\n");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let injectorInstance: KnowledgeContextInjector | null = null;

export function getKnowledgeContextInjector(
  config?: Partial<KnowledgeInjectionConfig>
): KnowledgeContextInjector {
  if (!injectorInstance) {
    injectorInstance = new KnowledgeContextInjector(config);
  }
  return injectorInstance;
}

export function resetKnowledgeContextInjector(): void {
  injectorInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export {
  KnowledgeContextInjector,
  DEFAULT_KNOWLEDGE_INJECTION_CONFIG,
};

export type {
  KnowledgeInjectionConfig,
  KnowledgeInjectionResult,
  IntentAnalysis,
  IntentType,
  DecisionSummary,
  PatternSummary,
};
