/**
 * Decision Persistence Layer
 *
 * Provides database operations for architecture decisions and learned patterns.
 * Enables persistent learning across sessions.
 *
 * Evolution Cycle 3: Database Persistence for Learning Decisions
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  architectureDecisions,
  learnedPatterns,
  type ArchitectureDecisionRow,
  type LearnedPatternRow,
} from "@/db/schema";
import type {
  ArchitectureDecisionRecord,
  ArchitectureDecisionType,
  DecisionContext,
  DecisionAlternative,
  DecisionOutcome,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for loading decisions
 */
export interface LoadDecisionsOptions {
  appId?: number;
  type?: ArchitectureDecisionType;
  status?: DecisionOutcome["status"];
  limit?: number;
  offset?: number;
  minConfidence?: number;
  includeLessons?: boolean;
}

/**
 * Pattern extracted from successful decisions
 */
export interface PersistedPattern {
  id: string;
  type: ArchitectureDecisionType;
  description: string;
  condition: string;
  solution: string;
  confidence: number;
  applicability: number;
  basedOnDecision: string;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Statistics about decisions
 */
export interface DecisionStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  averageConfidence: number;
  successRate: number;
}

// ============================================================================
// Persistence Class
// ============================================================================

/**
 * DecisionPersistence handles all database operations for architecture decisions
 */
export class DecisionPersistence {
  // -------------------------------------------------------------------------
  // Decision Operations
  // -------------------------------------------------------------------------

  /**
   * Persist an architecture decision to the database
   */
  async persistDecision(decision: ArchitectureDecisionRecord): Promise<void> {
    try {
      await db
        .insert(architectureDecisions)
        .values({
          id: decision.id,
          appId: decision.appId,
          title: decision.title,
          description: decision.description,
          type: decision.type,
          status: decision.outcome.status,
          context: decision.context as unknown as Record<string, unknown>,
          alternatives: decision.alternatives as unknown as Record<string, unknown>[],
          selectedOption: decision.selectedOption,
          rationale: decision.rationale,
          outcome: decision.outcome as unknown as Record<string, unknown>,
          confidence: decision.confidence,
          tags: decision.tags,
          relatedEntities: decision.relatedEntities,
          lessonsLearned: decision.outcome.lessonsLearned || [],
          createdAt: decision.createdAt,
          updatedAt: decision.updatedAt,
          outcomeDeterminedAt: decision.outcome.determinedAt,
          createdBy: decision.createdBy,
          metadata: decision.metadata,
        })
        .onConflictDoUpdate({
          target: architectureDecisions.id,
          set: {
            title: decision.title,
            description: decision.description,
            status: decision.outcome.status,
            outcome: decision.outcome as unknown as Record<string, unknown>,
            confidence: decision.confidence,
            lessonsLearned: decision.outcome.lessonsLearned || [],
            updatedAt: decision.updatedAt,
            outcomeDeterminedAt: decision.outcome.determinedAt,
          },
        });
    } catch (error) {
      console.error("[DecisionPersistence] Failed to persist decision:", error);
      throw error;
    }
  }

  /**
   * Load a decision by ID from the database
   */
  async loadDecision(id: string): Promise<ArchitectureDecisionRecord | null> {
    try {
      const [row] = await db
        .select()
        .from(architectureDecisions)
        .where(eq(architectureDecisions.id, id))
        .limit(1);

      return row ? this.mapRowToDecision(row) : null;
    } catch (error) {
      console.error("[DecisionPersistence] Failed to load decision:", error);
      return null;
    }
  }

  /**
   * Load decisions for an application
   */
  async loadDecisionsForApp(
    appId: number,
    options?: LoadDecisionsOptions
  ): Promise<ArchitectureDecisionRecord[]> {
    try {
      const conditions = [eq(architectureDecisions.appId, appId)];

      if (options?.type) {
        conditions.push(eq(architectureDecisions.type, options.type));
      }

      if (options?.status) {
        conditions.push(eq(architectureDecisions.status, options.status));
      }

      const rows = await db
        .select()
        .from(architectureDecisions)
        .where(and(...conditions))
        .orderBy(desc(architectureDecisions.createdAt))
        .limit(options?.limit || 50)
        .offset(options?.offset || 0);

      return rows.map(row => this.mapRowToDecision(row));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to load decisions for app:", error);
      return [];
    }
  }

  /**
   * Load all decisions matching options
   */
  async loadDecisions(options?: LoadDecisionsOptions): Promise<ArchitectureDecisionRecord[]> {
    try {
      const conditions = [];

      if (options?.appId) {
        conditions.push(eq(architectureDecisions.appId, options.appId));
      }

      if (options?.type) {
        conditions.push(eq(architectureDecisions.type, options.type));
      }

      if (options?.status) {
        conditions.push(eq(architectureDecisions.status, options.status));
      }

      if (options?.minConfidence) {
        conditions.push(sql`${architectureDecisions.confidence} >= ${options.minConfidence}`);
      }

      const rows = await db
        .select()
        .from(architectureDecisions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(architectureDecisions.createdAt))
        .limit(options?.limit || 100)
        .offset(options?.offset || 0);

      return rows.map(row => this.mapRowToDecision(row));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to load decisions:", error);
      return [];
    }
  }

  /**
   * Update decision outcome
   */
  async updateOutcome(
    decisionId: string,
    outcome: Partial<DecisionOutcome>
  ): Promise<ArchitectureDecisionRecord | null> {
    try {
      const [existing] = await db
        .select()
        .from(architectureDecisions)
        .where(eq(architectureDecisions.id, decisionId))
        .limit(1);

      if (!existing) return null;

      const currentOutcome = existing.outcome as DecisionOutcome;
      const updatedOutcome: DecisionOutcome = {
        ...currentOutcome,
        ...outcome,
        determinedAt: outcome.determinedAt || new Date(),
      };

      const [updated] = await db
        .update(architectureDecisions)
        .set({
          status: updatedOutcome.status,
          outcome: updatedOutcome as unknown as Record<string, unknown>,
          lessonsLearned: updatedOutcome.lessonsLearned || existing.lessonsLearned,
          updatedAt: new Date(),
          outcomeDeterminedAt: updatedOutcome.determinedAt,
        })
        .where(eq(architectureDecisions.id, decisionId))
        .returning();

      return updated ? this.mapRowToDecision(updated) : null;
    } catch (error) {
      console.error("[DecisionPersistence] Failed to update outcome:", error);
      return null;
    }
  }

  /**
   * Delete a decision
   */
  async deleteDecision(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(architectureDecisions)
        .where(eq(architectureDecisions.id, id))
        .returning({ id: architectureDecisions.id });

      return result.length > 0;
    } catch (error) {
      console.error("[DecisionPersistence] Failed to delete decision:", error);
      return false;
    }
  }

  /**
   * Get decision statistics
   */
  async getStats(appId?: number): Promise<DecisionStats> {
    try {
      const conditions = appId
        ? [eq(architectureDecisions.appId, appId)]
        : [];

      const rows = await db
        .select()
        .from(architectureDecisions)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const byStatus: Record<string, number> = {};
      const byType: Record<string, number> = {};
      let totalConfidence = 0;
      let successCount = 0;
      let completedCount = 0;

      for (const row of rows) {
        // Count by status
        byStatus[row.status] = (byStatus[row.status] || 0) + 1;

        // Count by type
        byType[row.type] = (byType[row.type] || 0) + 1;

        // Accumulate confidence
        totalConfidence += row.confidence;

        // Count success rate
        if (row.status !== "pending") {
          completedCount++;
          if (row.status === "success") {
            successCount++;
          }
        }
      }

      return {
        total: rows.length,
        byStatus,
        byType,
        averageConfidence: rows.length > 0 ? totalConfidence / rows.length : 0,
        successRate: completedCount > 0 ? successCount / completedCount : 0,
      };
    } catch (error) {
      console.error("[DecisionPersistence] Failed to get stats:", error);
      return {
        total: 0,
        byStatus: {},
        byType: {},
        averageConfidence: 0,
        successRate: 0,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Pattern Operations
  // -------------------------------------------------------------------------

  /**
   * Persist a learned pattern
   */
  async persistPattern(pattern: PersistedPattern): Promise<void> {
    try {
      await db
        .insert(learnedPatterns)
        .values({
          id: pattern.id,
          type: pattern.type,
          description: pattern.description,
          condition: pattern.condition,
          solution: pattern.solution,
          confidence: pattern.confidence,
          applicability: pattern.applicability,
          basedOnDecision: pattern.basedOnDecision,
          successCount: pattern.successCount,
          failureCount: pattern.failureCount,
          createdAt: pattern.createdAt,
          updatedAt: pattern.updatedAt,
        })
        .onConflictDoUpdate({
          target: learnedPatterns.id,
          set: {
            confidence: pattern.confidence,
            successCount: sql`${learnedPatterns.successCount} + 1`,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error("[DecisionPersistence] Failed to persist pattern:", error);
      throw error;
    }
  }

  /**
   * Load patterns by type
   */
  async loadPatternsByType(
    type: ArchitectureDecisionType
  ): Promise<PersistedPattern[]> {
    try {
      const rows = await db
        .select()
        .from(learnedPatterns)
        .where(eq(learnedPatterns.type, type))
        .orderBy(desc(learnedPatterns.confidence));

      return rows.map(row => this.mapRowToPattern(row));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to load patterns:", error);
      return [];
    }
  }

  /**
   * Load all patterns
   */
  async loadAllPatterns(limit: number = 100): Promise<PersistedPattern[]> {
    try {
      const rows = await db
        .select()
        .from(learnedPatterns)
        .orderBy(desc(learnedPatterns.confidence))
        .limit(limit);

      return rows.map(row => this.mapRowToPattern(row));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to load all patterns:", error);
      return [];
    }
  }

  /**
   * Record pattern success
   */
  async recordPatternSuccess(patternId: string): Promise<void> {
    try {
      await db
        .update(learnedPatterns)
        .set({
          successCount: sql`${learnedPatterns.successCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(learnedPatterns.id, patternId));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to record pattern success:", error);
    }
  }

  /**
   * Record pattern failure
   */
  async recordPatternFailure(patternId: string): Promise<void> {
    try {
      await db
        .update(learnedPatterns)
        .set({
          failureCount: sql`${learnedPatterns.failureCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(learnedPatterns.id, patternId));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to record pattern failure:", error);
    }
  }

  // -------------------------------------------------------------------------
  // Search Operations
  // -------------------------------------------------------------------------

  /**
   * Search decisions by context similarity
   */
  async searchByContext(
    appId: number,
    context: DecisionContext,
    options?: { limit?: number; minSimilarity?: number }
  ): Promise<Array<{ decision: ArchitectureDecisionRecord; similarity: number }>> {
    const decisions = await this.loadDecisionsForApp(appId, { limit: 100 });

    const results: Array<{ decision: ArchitectureDecisionRecord; similarity: number }> = [];

    for (const decision of decisions) {
      const similarity = this.calculateContextSimilarity(context, decision.context);
      if (similarity >= (options?.minSimilarity || 0.3)) {
        results.push({ decision, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options?.limit || 10);
  }

  /**
   * Find decisions by tags
   */
  async findByTags(
    appId: number,
    tags: string[]
  ): Promise<ArchitectureDecisionRecord[]> {
    try {
      // SQLite JSON array containment
      const rows = await db
        .select()
        .from(architectureDecisions)
        .where(eq(architectureDecisions.appId, appId))
        .limit(50);

      return rows
        .filter(row => {
          const decisionTags = row.tags as string[];
          return tags.some(t => decisionTags.includes(t));
        })
        .map(row => this.mapRowToDecision(row));
    } catch (error) {
      console.error("[DecisionPersistence] Failed to find by tags:", error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private mapRowToDecision(row: ArchitectureDecisionRow): ArchitectureDecisionRecord {
    return {
      id: row.id,
      appId: row.appId,
      title: row.title,
      description: row.description,
      type: row.type as ArchitectureDecisionType,
      context: row.context as DecisionContext,
      alternatives: row.alternatives as DecisionAlternative[],
      selectedOption: row.selectedOption,
      rationale: row.rationale,
      outcome: row.outcome as DecisionOutcome,
      confidence: row.confidence,
      tags: row.tags || [],
      relatedEntities: row.relatedEntities || [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy || undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  private mapRowToPattern(row: LearnedPatternRow): PersistedPattern {
    return {
      id: row.id,
      type: row.type as ArchitectureDecisionType,
      description: row.description,
      condition: row.condition,
      solution: row.solution,
      confidence: row.confidence,
      applicability: row.applicability,
      basedOnDecision: row.basedOnDecision,
      successCount: row.successCount,
      failureCount: row.failureCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
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
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const decisionPersistence = new DecisionPersistence();
