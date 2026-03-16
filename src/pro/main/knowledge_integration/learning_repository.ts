/**
 * Learning Repository - Architecture Decision Storage and Learning
 *
 * Stores architecture decisions with outcomes, enables learning from past
 * decisions through similarity search and outcome analysis.
 *
 * Evolution Cycle 3: Wired to database persistence layer
 */

import { db as _db } from "@/db";
import type {
  ArchitectureDecisionRecord,
  ArchitectureDecisionType,
  DecisionContext,
  DecisionOutcome,
} from "./types";
import { randomUUID } from "crypto";
import { decisionPersistence } from "./decision_persistence";

/**
 * Learning Repository
 * 
 * Manages architecture decision records and enables learning from outcomes.
 */
export class LearningRepository {
  private decisionCache: Map<string, ArchitectureDecisionRecord> = new Map();
  private similarityIndex: Map<string, string[]> = new Map();

  /**
   * Record a new architecture decision
   */
  async recordDecision(decision: Omit<ArchitectureDecisionRecord, "id" | "createdAt" | "updatedAt">): Promise<ArchitectureDecisionRecord> {
    const id = `adr_${randomUUID()}`;
    const now = new Date();

    const record: ArchitectureDecisionRecord = {
      ...decision,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Store in database
    await this.persistDecision(record);

    // Update cache
    this.decisionCache.set(id, record);

    // Update similarity index
    await this.updateSimilarityIndex(record);

    return record;
  }

  /**
   * Update decision outcome
   */
  async updateOutcome(
    decisionId: string,
    outcome: Partial<DecisionOutcome>
  ): Promise<ArchitectureDecisionRecord | null> {
    const decision = this.decisionCache.get(decisionId);
    if (!decision) {
      return null;
    }

    const updatedOutcome: DecisionOutcome = {
      ...decision.outcome,
      ...outcome,
      determinedAt: outcome.determinedAt || new Date(),
    };

    const updated: ArchitectureDecisionRecord = {
      ...decision,
      outcome: updatedOutcome,
      updatedAt: new Date(),
    };

    await this.persistDecision(updated);
    this.decisionCache.set(decisionId, updated);

    // Trigger learning if outcome is complete
    if (updatedOutcome.status !== "pending") {
      await this.learnFromOutcome(updated);
    }

    return updated;
  }

  /**
   * Find similar decisions based on context
   */
  async findSimilarDecisions(
    context: DecisionContext,
    options?: {
      limit?: number;
      minSimilarity?: number;
      includeOutcomes?: boolean;
    }
  ): Promise<Array<{ decision: ArchitectureDecisionRecord; similarity: number }>> {
    const allDecisions = Array.from(this.decisionCache.values());
    const results: Array<{ decision: ArchitectureDecisionRecord; similarity: number }> = [];

    for (const decision of allDecisions) {
      const similarity = this.calculateContextSimilarity(context, decision.context);
      if (similarity >= (options?.minSimilarity || 0.3)) {
        results.push({ decision, similarity });
      }
    }

    // Sort by similarity and limit
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options?.limit || 10);
  }

  /**
   * Get decision by ID
   */
  async getDecision(id: string): Promise<ArchitectureDecisionRecord | null> {
    if (this.decisionCache.has(id)) {
      return this.decisionCache.get(id) || null;
    }

    // Try to load from database
    const decision = await this.loadDecision(id);
    if (decision) {
      this.decisionCache.set(id, decision);
    }
    return decision;
  }

  /**
   * Get decisions for an application
   */
  async getDecisionsForApp(
    appId: number,
    options?: {
      type?: ArchitectureDecisionType;
      status?: DecisionOutcome["status"];
      limit?: number;
    }
  ): Promise<ArchitectureDecisionRecord[]> {
    let decisions = Array.from(this.decisionCache.values())
      .filter(d => d.appId === appId);

    // Filter by type
    if (options?.type) {
      decisions = decisions.filter(d => d.type === options.type);
    }

    // Filter by status
    if (options?.status) {
      decisions = decisions.filter(d => d.outcome.status === options.status);
    }

    // Sort by date and limit
    return decisions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options?.limit || 50);
  }

  /**
   * Get learned patterns from successful decisions
   */
  async getLearnedPatterns(
    appId: number,
    context?: DecisionContext
  ): Promise<LearnedPattern[]> {
    const successfulDecisions = (await this.getDecisionsForApp(appId))
      .filter(d => d.outcome.status === "success");

    const patterns: LearnedPattern[] = [];

    // Extract patterns from successful decisions
    for (const decision of successfulDecisions) {
      const pattern = this.extractPattern(decision);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    // Score patterns by frequency and success rate
    const scoredPatterns = this.scorePatterns(patterns);

    // Filter by context relevance if provided
    if (context) {
      return scoredPatterns.filter(p => 
        this.isPatternApplicable(p, context)
      );
    }

    return scoredPatterns;
  }

  /**
   * Get recommendations based on learned patterns
   */
  async getRecommendations(
    appId: number,
    context: DecisionContext
  ): Promise<DecisionRecommendation[]> {
    const recommendations: DecisionRecommendation[] = [];

    // Find similar past decisions
    const similarDecisions = await this.findSimilarDecisions(context, { limit: 5 });

    for (const { decision, similarity } of similarDecisions) {
      if (decision.outcome.status === "success") {
        recommendations.push({
          type: "follow_pattern",
          text: `Based on similar past decision "${decision.title}", consider ${decision.selectedOption}`,
          confidence: similarity * decision.confidence,
          basedOn: decision,
          relevanceScore: similarity,
        });
      } else if (decision.outcome.status === "failure") {
        recommendations.push({
          type: "avoid_pattern",
          text: `Avoid ${decision.selectedOption} - it failed in a similar context: ${decision.title}`,
          confidence: similarity * 0.9,
          basedOn: decision,
          relevanceScore: similarity,
        });
      }
    }

    // Get learned patterns
    const patterns = await this.getLearnedPatterns(appId, context);
    for (const pattern of patterns.slice(0, 3)) {
      recommendations.push({
        type: "apply_pattern",
        text: `Apply pattern: ${pattern.description}`,
        confidence: pattern.confidence,
        patternId: pattern.id,
        relevanceScore: pattern.applicability,
      });
    }

    // Sort by confidence
    return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Analyze decision quality over time
   */
  async analyzeDecisionQuality(appId: number): Promise<DecisionQualityAnalysis> {
    const decisions = await this.getDecisionsForApp(appId);
    
    const withOutcomes = decisions.filter(d => d.outcome.status !== "pending");
    const successful = withOutcomes.filter(d => d.outcome.status === "success");
    const failed = withOutcomes.filter(d => d.outcome.status === "failure");
    const partial = withOutcomes.filter(d => d.outcome.status === "partial");

    const avgConfidence = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
      : 0;

    const successfulConfidence = successful.length > 0
      ? successful.reduce((sum, d) => sum + d.confidence, 0) / successful.length
      : 0;

    const failedConfidence = failed.length > 0
      ? failed.reduce((sum, d) => sum + d.confidence, 0) / failed.length
      : 0;

    return {
      totalDecisions: decisions.length,
      decisionsWithOutcomes: withOutcomes.length,
      successRate: withOutcomes.length > 0 ? successful.length / withOutcomes.length : 0,
      partialRate: withOutcomes.length > 0 ? partial.length / withOutcomes.length : 0,
      failureRate: withOutcomes.length > 0 ? failed.length / withOutcomes.length : 0,
      averageConfidence: avgConfidence,
      confidenceCalibration: {
        highConfidenceSuccess: successfulConfidence,
        lowConfidenceFailure: failedConfidence,
        calibrationScore: Math.abs(successfulConfidence - failedConfidence),
      },
      trendOverTime: this.calculateTrend(withOutcomes),
      typeDistribution: this.getTypeDistribution(decisions),
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.decisionCache.clear();
    this.similarityIndex.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async persistDecision(decision: ArchitectureDecisionRecord): Promise<void> {
    // Evolution Cycle 3: Wire to actual database persistence
    await decisionPersistence.persistDecision(decision);
  }

  private async loadDecision(id: string): Promise<ArchitectureDecisionRecord | null> {
    // Evolution Cycle 3: Load from actual database
    return await decisionPersistence.loadDecision(id);
  }

  private async updateSimilarityIndex(decision: ArchitectureDecisionRecord): Promise<void> {
    // Build similarity index from context keywords
    const keywords = this.extractContextKeywords(decision.context);
    for (const keyword of keywords) {
      const existing = this.similarityIndex.get(keyword) || [];
      existing.push(decision.id);
      this.similarityIndex.set(keyword, existing);
    }
  }

  private calculateContextSimilarity(
    context1: DecisionContext,
    context2: DecisionContext
  ): number {
    let score = 0;
    let totalWeight = 0;

    // Problem similarity (weight: 0.4)
    const problemSimilarity = this.textSimilarity(context1.problem, context2.problem);
    score += problemSimilarity * 0.4;
    totalWeight += 0.4;

    // Constraint overlap (weight: 0.3)
    const constraintOverlap = this.setOverlap(
      new Set(context1.constraints),
      new Set(context2.constraints)
    );
    score += constraintOverlap * 0.3;
    totalWeight += 0.3;

    // Goal overlap (weight: 0.2)
    const goalOverlap = this.setOverlap(
      new Set(context1.goals),
      new Set(context2.goals)
    );
    score += goalOverlap * 0.2;
    totalWeight += 0.2;

    // Path overlap (weight: 0.1)
    if (context1.relevantPaths.length > 0 || context2.relevantPaths.length > 0) {
      const pathOverlap = this.setOverlap(
        new Set(context1.relevantPaths),
        new Set(context2.relevantPaths)
      );
      score += pathOverlap * 0.1;
      totalWeight += 0.1;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    return this.setOverlap(words1, words2);
  }

  private setOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    if (set1.size === 0 || set2.size === 0) return 0;

    let intersection = 0;
    for (const item of set1) {
      if (set2.has(item)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private async learnFromOutcome(decision: ArchitectureDecisionRecord): Promise<void> {
    // Extract lessons learned
    this.extractLessons(decision);
    
    // Update related entities if needed
    if (decision.relatedEntities.length > 0) {
      // Could trigger re-indexing or confidence updates
    }

    // Could trigger pattern extraction
    const pattern = this.extractPattern(decision);
    if (pattern && decision.outcome.status === "success") {
      // Store successful pattern
    }
  }

  private extractLessons(decision: ArchitectureDecisionRecord): string[] {
    const lessons: string[] = [];

    // Extract from outcome
    if (decision.outcome.lessonsLearned) {
      lessons.push(...decision.outcome.lessonsLearned);
    }

    // Generate lessons based on outcome
    if (decision.outcome.status === "success") {
      lessons.push(`${decision.selectedOption} worked well for ${decision.context.problem}`);
    } else if (decision.outcome.status === "failure") {
      lessons.push(`${decision.selectedOption} did not work for ${decision.context.problem}`);
      if (decision.alternatives.length > 0) {
        const alternatives = decision.alternatives
          .filter(a => !a.selectionReason?.includes("selected"))
          .map(a => a.name);
        if (alternatives.length > 0) {
          lessons.push(`Consider alternatives: ${alternatives.join(", ")}`);
        }
      }
    }

    return lessons;
  }

  private extractPattern(decision: ArchitectureDecisionRecord): LearnedPattern | null {
    if (decision.outcome.status === "pending") {
      return null;
    }

    return {
      id: `pattern_${decision.id}`,
      type: decision.type,
      description: `For ${decision.context.problem}, ${decision.selectedOption} is effective`,
      condition: decision.context.constraints.join(", "),
      solution: decision.selectedOption,
      confidence: decision.confidence * (decision.outcome.status === "success" ? 1.0 : 0.5),
      applicability: decision.relatedEntities.length > 0 ? 0.8 : 0.5,
      basedOnDecision: decision.id,
    };
  }

  private scorePatterns(patterns: LearnedPattern[]): LearnedPattern[] {
    // Group by type and calculate frequency scores
    const typeCounts = new Map<string, number>();
    for (const pattern of patterns) {
      typeCounts.set(pattern.type, (typeCounts.get(pattern.type) || 0) + 1);
    }

    // Update confidence based on frequency
    return patterns.map(pattern => {
      const frequency = typeCounts.get(pattern.type) || 1;
      const frequencyBonus = Math.min(0.2, frequency * 0.05);
      return {
        ...pattern,
        confidence: Math.min(1, pattern.confidence + frequencyBonus),
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  private isPatternApplicable(pattern: LearnedPattern, context: DecisionContext): boolean {
    // Check if pattern constraints match context
    const patternConstraints = pattern.condition.split(", ").map(c => c.trim());
    const contextConstraints = new Set(context.constraints);
    
    // Pattern is applicable if at least half of its constraints match
    const matchingConstraints = patternConstraints.filter(c => contextConstraints.has(c));
    return matchingConstraints.length >= patternConstraints.length / 2;
  }

  private extractContextKeywords(context: DecisionContext): string[] {
    const keywords: string[] = [];
    
    // Extract from problem
    keywords.push(...context.problem.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    // Extract from constraints
    for (const constraint of context.constraints) {
      keywords.push(...constraint.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    }
    
    // Extract from goals
    for (const goal of context.goals) {
      keywords.push(...goal.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    }
    
    return [...new Set(keywords)];
  }

  private calculateTrend(decisions: ArchitectureDecisionRecord[]): "improving" | "stable" | "declining" {
    if (decisions.length < 3) return "stable";

    // Sort by date
    const sorted = [...decisions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    // Split into first and second half
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstSuccessRate = firstHalf.filter(d => d.outcome.status === "success").length / firstHalf.length;
    const secondSuccessRate = secondHalf.filter(d => d.outcome.status === "success").length / secondHalf.length;

    const diff = secondSuccessRate - firstSuccessRate;
    if (diff > 0.1) return "improving";
    if (diff < -0.1) return "declining";
    return "stable";
  }

  private getTypeDistribution(decisions: ArchitectureDecisionRecord[]): Record<ArchitectureDecisionType, number> {
    const distribution: Record<string, number> = {};
    for (const decision of decisions) {
      distribution[decision.type] = (distribution[decision.type] || 0) + 1;
    }
    return distribution as Record<ArchitectureDecisionType, number>;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface LearnedPattern {
  id: string;
  type: ArchitectureDecisionType;
  description: string;
  condition: string;
  solution: string;
  confidence: number;
  applicability: number;
  basedOnDecision: string;
}

interface DecisionRecommendation {
  type: "follow_pattern" | "avoid_pattern" | "apply_pattern";
  text: string;
  confidence: number;
  basedOn?: ArchitectureDecisionRecord;
  patternId?: string;
  relevanceScore: number;
}

interface DecisionQualityAnalysis {
  totalDecisions: number;
  decisionsWithOutcomes: number;
  successRate: number;
  partialRate: number;
  failureRate: number;
  averageConfidence: number;
  confidenceCalibration: {
    highConfidenceSuccess: number;
    lowConfidenceFailure: number;
    calibrationScore: number;
  };
  trendOverTime: "improving" | "stable" | "declining";
  typeDistribution: Record<ArchitectureDecisionType, number>;
}
