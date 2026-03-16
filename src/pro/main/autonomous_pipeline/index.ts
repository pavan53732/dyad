/**
 * Autonomous Execution Pipeline Module
 *
 * Transforms the tool-based execution model into an autonomous reasoning pipeline:
 *
 * User Request → Planner → Task Graph → Scheduler → Agent Runtime → Tools → Knowledge Layer
 *
 * This module provides:
 * - Proactive Knowledge Context (KIL injection before reasoning)
 * - Automatic Task Planning
 * - Scheduled Execution
 * - Learning Feedback Loop
 *
 * Evolution Phase: Autonomous Execution Pipeline
 */

// Core orchestrator
export {
  PipelineOrchestrator,
  DEFAULT_PIPELINE_CONFIG,
} from "./pipeline_orchestrator";

// Knowledge context injector
export {
  KnowledgeContextInjector,
  DEFAULT_KNOWLEDGE_INJECTION_CONFIG,
  getKnowledgeContextInjector,
  resetKnowledgeContextInjector,
} from "./knowledge_context_injector";

// Types from pipeline orchestrator
export type {
  PipelineConfig,
  PipelineState,
  ProactiveKnowledgeContext,
  TaskIntent,
  TaskExecutionResult,
  LearningOutcome,
  PipelineError,
  PipelineEvent,
  PipelineEventCallback,
  ArchitectureDecisionSummary,
  PatternSummary,
  DependencyInsight,
  RecommendationSummary,
} from "./pipeline_orchestrator";

// Types from knowledge context injector
export type {
  KnowledgeInjectionConfig,
  KnowledgeInjectionResult,
  IntentAnalysis,
  IntentType,
  DecisionSummary as KnowledgeDecisionSummary,
  PatternSummary as KnowledgePatternSummary,
} from "./knowledge_context_injector";
