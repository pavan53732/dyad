/**
 * Tool definitions for Local Agent v2
 * Each tool includes a zod schema, description, and execute function
 */

import { IpcMainInvokeEvent } from "electron";
import crypto from "node:crypto";
import { readSettings, writeSettings } from "@/main/settings";
import { writeFileTool } from "./tools/write_file";
import { deleteFileTool } from "./tools/delete_file";
import { renameFileTool } from "./tools/rename_file";
import { copyFileTool } from "./tools/copy_file";
import { addDependencyTool } from "./tools/add_dependency";
import { executeCommandTool } from "./tools/execute_command";
import { writeEnvVarsTool } from "./tools/write_env_vars";
import { executeSqlTool } from "./tools/execute_sql";

import { readFileTool } from "./tools/read_file";
import { listFilesTool } from "./tools/list_files";
import { getSupabaseProjectInfoTool } from "./tools/get_supabase_project_info";
import { getSupabaseTableSchemaTool } from "./tools/get_supabase_table_schema";
import { setChatSummaryTool } from "./tools/set_chat_summary";
import { addIntegrationTool } from "./tools/add_integration";
import { readLogsTool } from "./tools/read_logs";
import { editFileTool } from "./tools/edit_file";
import { searchReplaceTool } from "./tools/search_replace";
import { webSearchTool } from "./tools/web_search";
import { webCrawlTool } from "./tools/web_crawl";
import { webFetchTool } from "./tools/web_fetch";
import { generateImageTool } from "./tools/generate_image";
import { updateTodosTool } from "./tools/update_todos";
import { runTypeChecksTool } from "./tools/run_type_checks";
import { grepTool } from "./tools/grep";
import { codeSearchTool } from "./tools/code_search";
import { planningQuestionnaireTool } from "./tools/planning_questionnaire";
import { writePlanTool } from "./tools/write_plan";
import { exitPlanTool } from "./tools/exit_plan";
import { gitCommitAndPushTool } from "./tools/git_commit_and_push";
import { autonomousPullRequestTool } from "./tools/autonomous_pull_request";
import { autonomousFixLoopTool } from "./tools/autonomous_fix_loop";
import { selfImproverTool } from "./tools/self_improver";
import { autonomousTestGeneratorTool } from "./tools/autonomous_test_generator";
import { autonomousSoftwareEngineerTool } from "./tools/autonomous_software_engineer";
import { autonomousCodeReviewTool } from "./tools/autonomous_code_review";
import { memoryStoreTool } from "./tools/memory_store";
import { agentNegotiationTools } from "./tools/agent_negotiation";
import { dynamicAgentTools } from "./tools/dynamic_agents";
import { multiAgentCoordinatorTool } from "./tools/multi_agent_coordinator";
import {
  messageBusTool,
  eventBroadcastTool,
  agentDiscoveryTool,
} from "./tools/multi_agent_coordinator";
import { executeProjectPlanTool } from "./tools/execute_project_plan";
import {
  dependencyAnalyzerTool,
  transitiveScanTool,
  transitiveVulnerabilitiesTool,
  transitiveOutdatedTool,
  deepDependencyTreeTool,
  detectCyclesTool,
  cyclePathTool,
  cycleImpactTool,
  licenseCheckTool,
  bundleImpactTool,
  duplicateDepsTool,
  orphanDepsTool,
  deprecatedCheckTool,
} from "./tools/dependency_analyzer";
import {
  dependencyGraphBuilderTool,
  dependencyNodeAnalyzerTool,
  dependencyEdgeAnalyzerTool,
  dependencyImpactCalculatorTool,
  dependencyConflictDetectorTool,
  dependencyVersionResolverTool,
  dependencyVulnerabilityMapperTool,
  dependencyEvolutionTrackerTool,
  dependencyRedundancyFinderTool,
  dependencyHealthMonitorTool as depKgHealthMonitorTool,
} from "./tools/dependency_knowledge_graph";
// Dependency Governance (Capabilities 491-520)
import {
  dependencyOptimizationTool,
  dependencyPolicyTool,
  dependencyGovernanceHealthMonitorTool,
  vulnerabilityScannerTool,
  dependencyComplianceCheckerTool,
  licenseManagerTool,
  updatePlannerTool,
  conflictResolverTool,
  environmentCompatibilityTool,
  platformValidationTool,
} from "./tools/dependency_governance";
import { dependencyUpgraderTool } from "./tools/dependency_upgrader";
import {
  architectureReasoningEngineTool,
  architectureDecisionScoringTool,
  architectureTradeoffAnalyzerTool,
  architectureConstraintSolverTool,
  architectureOptimizationSearchTool,
  architectureMultiObjectivePlannerTool,
  architectureHeuristicEngineTool,
  architectureReinforcementLearningTool,
  architectureSolutionRankingTool,
  architectureRecommendationEngineTool,
} from "./tools/architecture_knowledge_graph";
import {
  architectureRollbackPlannerTool,
  futureGrowthPlannerTool,
  scalingForecastEngineTool,
  costProjectionModelTool,
  sustainabilityAnalysisTool,
} from "./tools/architecture_planning";
import {
  detectPatternsTool,
  suggestRefactoringTool,
  detectAntiPatternsTool,
  patternLibraryTool,
} from "./tools/design_patterns";
import {
  analyzeDebtTool,
  prioritizeDebtTool,
  trackDebtTool,
} from "./tools/technical_debt";
import { architectureAnalyzerTool } from "./tools/architecture_analyzer";
import { architectureGraphBuilderTool } from "./tools/architecture_graph_builder";
import { architectureValidatorTool } from "./tools/architecture_validator";
import { architectureSimulatorTool } from "./tools/architecture_simulator";
import {
  evaluateHealthTool,
  benchmarkArchTool,
} from "./tools/architecture_validator";
import { patternDetectorTool } from "./tools/pattern_detector";
import { codeIntelligenceTool } from "./tools/code_intelligence";
import {
  intentClassifierTool,
  promptNormalizationTool,
  contextEnrichmentTool,
  domainVocabularyExpanderTool,
  entityExtractionTool,
  featureRequestExtractorTool,
  userGoalReconstructorTool,
} from "./tools/intent_classifier";
import { taskDecomposerTool } from "./tools/task_decomposer";
import { contextOrchestratorTool } from "./tools/context_orchestrator";
import { selfVerifierTool } from "./tools/self_verifier";
import { executionHistoryTool } from "./tools/execution_history";
import { feedbackLoopTool } from "./tools/feedback_loop";
import { adaptiveStrategyTool } from "./tools/adaptive_strategy";
import { knowledgeBaseTool } from "./tools/knowledge_base";
import { securityScannerTool } from "./tools/security_scanner";
import { vulnerabilityDetectorTool } from "./tools/vulnerability_detector";
import { complianceCheckerTool } from "./tools/compliance_checker";
import { securityRemediationTool } from "./tools/security_remediation";
import { runtimeProfilerTool } from "./tools/runtime_profiler";
import { cachingStrategiesTool } from "./tools/caching_strategies";
import { resourceOptimizerTool } from "./tools/resource_optimizer";
import { queryOptimizerTool } from "./tools/query_optimizer";
import { teamCoordinatorTool } from "./tools/team_coordinator";
import { agentRolesTools } from "./tools/agent_roles";
import { conflictResolutionTools } from "./tools/conflict_resolution";
import { hierarchicalTeamsTools } from "./tools/hierarchical_teams";
import { codeReviewerTool } from "./tools/code_reviewer";
import { knowledgeSharingTool } from "./tools/knowledge_sharing";
import { collaborationSessionTool } from "./tools/collaboration_session";
import {
  generateHypothesesTool,
  rankHypothesesTool,
  exploreBranchesTool,
} from "./tools/hypothesis_generator";
import {
  causalAnalysisTool,
  traceDependenciesTool,
  detectConflictsTool,
} from "./tools/causal_reasoning";
import {
  monitorReasoningTool,
  theoryOfMindTool,
  abstractReasoningTool,
} from "./tools/metacognition";
// Agent Governance & Sandbox (Capabilities 181-190)
import {
  agentPermissionSystemTool,
  agentActionAuditTool,
  agentTerminationControlTool,
  agentSandboxEnforcementTool,
} from "./tools/agent_sandbox_v2";
// Code Knowledge Infrastructure (Capabilities 321-330)
import {
  codeKnowledgeGraphBuilderTool,
  codeIndexingPipelineTool,
} from "./tools/code_knowledge_graph";
// Code Understanding Enhancements (Capabilities 221-340)
import {
  dependencyVisualizationTool,
  cyclomaticComplexityTool,
  codeDuplicationTool,
  deadCodeTool,
  lintRuleGeneratorTool,
  runtimeTraceAnalyzerTool,
  stackTraceInterpreterTool,
  threadBehaviorAnalyzerTool,
  monorepoAnalyzerTool,
  microserviceDetectionTool,
  codeOwnershipGraphTool,
  developerWorkflowAnalyzerTool,
  automaticRefactoringTool,
  codeMigrationEngineTool,
  legacyCodeUnderstandingTool,
  codeModernizationPlannerTool,
  crossRepositoryLinkingTool,
} from "./tools/code_understanding_enhancements";
import {
  semanticSearchTool,
  nlQueryTool,
  codeSynthesisTool,
  crossLanguageTool,
} from "./tools/code_intelligence";
// Retrieval Intelligence (Capabilities 41-50)
import {
  codeRetrievalTool,
  documentationRetrievalTool,
  patternRetrievalTool,
  architectureRetrievalTool,
  apiReferenceRetrievalTool,
  semanticSimilarityRankingTool,
  retrievalReRankingTool,
  queryRewritingTool,
  retrievalFallbackStrategyTool,
  knowledgeSourceValidatorTool,
} from "./tools/retrieval_intelligence";
// Specialized Agents (Capabilities 161-170)
import { specializedAgentsTools } from "./tools/specialized_agents";
// Basic Inference & Chain-of-Thought (Capabilities 1-22)
import {
  directInferenceTool,
  chainOfThoughtTool,
  deductiveReasoningTool,
  inductiveReasoningTool,
  abductiveReasoningTool,
  syllogismTool,
  modalReasoningTool,
  circularReasoningCheckTool,
  fallacyDetectionTool,
  argumentStructureTool,
  reasoningAuditTool,
} from "./tools/basic_inference";
// Uncertainty Quantification (Capabilities 41-60)
import {
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
} from "./tools/uncertainty_quantification";
// Analogical & Case-Based Reasoning (Capabilities 66-80)
import {
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
} from "./tools/analogical_reasoning";
// Program Slicing & Control Flow (Capabilities 221-227)
import {
  computeSliceTool,
  controlFlowGraphTool,
  dataFlowAnalysisTool,
  reachabilityTool,
  dependenceGraphTool,
  staticAnalysisTool,
  dynamicAnalysisTool,
} from "./tools/program_slicing";
// Formal Verification & Invariants (Capabilities 317-322)
import {
  verifyInvariantsTool,
  assertionCheckingTool,
  contractVerificationTool,
  modelCheckingTool,
  proofAssistantTool,
  propertyCheckingTool,
} from "./tools/formal_verification";
// Runtime Analysis & Memory Profiling (Capabilities 326-332)
import {
  memoryProfileTool,
  performanceTraceTool,
  bottleneckDetectTool,
  heapAnalysisTool,
  cpuProfileTool,
  leakDetectionTool,
  threadAnalysisTool,
} from "./tools/runtime_analysis";
// Self-Improving Reasoning (Capabilities 61-70)
import { selfImprovingReasoningTools } from "./tools/self_improving_reasoning";
// Iterative Reasoning Loops (Capabilities 81-90)
import {
  reflectionEngineTool,
  replanningEngineTool,
  goalDecompositionTool,
  progressTrackingTool,
  checkpointEvaluationTool,
  failureAnalysisTool,
  alternativeGenerationTool,
  convergenceCheckTool,
  backtrackingEngineTool,
  iterationOptimizerTool,
} from "./tools/iterative_reasoning_loops";
// Monitoring (Capabilities 171-180)
import {
  agentHealthCheckTool,
  performanceMetricsTool,
  resourceMonitorTool,
  errorRateTrackerTool,
  successRateMonitorTool,
  latencyTrackerTool,
  throughputMonitorTool,
  anomalyDetectorTool,
  alertGeneratorTool,
  dashboardMetricsTool,
} from "./tools/monitoring";
// Runtime Telemetry (Capabilities 421-430)
import {
  performanceTelemetryTool,
  errorTelemetryTool,
  usageTelemetryTool,
  latencyTelemetryTool,
  throughputTelemetryTool,
  resourceTelemetryTool,
  customTelemetryTool,
  telemetryAggregatorTool,
  telemetryExporterTool,
  telemetryDashboardTool,
} from "./tools/runtime_telemetry";
// Documentation Intelligence (Capabilities 261-270)
import { documentationIntelligenceTools } from "./tools/documentation_intelligence";
// Counterfactual Reasoning (Capabilities 101-110)
import {
  hypothesisGeneratorTool,
  counterfactualGeneratorTool,
  whatIfAnalyzerTool,
  causalInferenceTool,
  impactAnalysisTool,
  scenarioSimulatorTool,
  alternativeOutcomePredictorTool,
  decisionImpactEvaluatorTool,
  assumptionChallengerTool,
  rootCauseHypothesizerTool,
} from "./tools/counterfactual_reasoning";
// Reasoning Infrastructure (Capabilities 111-120)
import {
  reasoningGraphBuilderTool,
  reasoningNodeEvaluatorTool,
  reasoningEdgeDependencyTrackerTool,
  reasoningStatePersistenceTool,
  reasoningCacheEngineTool,
  reasoningTraceVisualizationTool,
  reasoningPerformanceProfilerTool,
  reasoningMemoryStorageTool,
  reasoningVersionTrackingTool,
  reasoningReproducibilityEngineTool,
} from "./tools/reasoning_infrastructure";
// Advanced Coordination (Capabilities 201-210)
import { advancedCoordinationTools } from "./tools/advanced_coordination";
// Code Representation (Capabilities 231-240)
import {
  codeEmbeddingGeneratorTool,
  functionEmbeddingSystemTool,
  classEmbeddingSystemTool,
  fileEmbeddingSystemTool,
  repositoryEmbeddingSystemTool,
  codeSimilaritySearchTool,
  codeClusteringEngineTool,
  codeIndexingSystemTool,
  codeMetadataExtractorTool,
  codeFingerprintGeneratorTool,
} from "./tools/code_representation";
import type { LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import {
  escapeXmlAttr,
  escapeXmlContent,
  type ToolDefinition,
  type AgentContext,
  type ToolResult,
  type FileEditToolName,
  FILE_EDIT_TOOL_NAMES,
} from "./tools/types";
import { AgentToolConsent } from "@/lib/schemas";
import { getSupabaseClientCode } from "@/supabase_admin/supabase_context";
// Combined tool definitions array
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  writeFileTool,
  editFileTool,
  searchReplaceTool,
  copyFileTool,
  deleteFileTool,
  renameFileTool,
  addDependencyTool,
  executeCommandTool,
  writeEnvVarsTool,
  executeSqlTool,
  readFileTool,
  listFilesTool,
  grepTool,
  codeSearchTool,
  getSupabaseProjectInfoTool,
  getSupabaseTableSchemaTool,
  setChatSummaryTool,
  addIntegrationTool,
  readLogsTool,
  webSearchTool,
  webCrawlTool,
  webFetchTool,
  generateImageTool,
  updateTodosTool,
  runTypeChecksTool,
  gitCommitAndPushTool,
  autonomousFixLoopTool,
  autonomousTestGeneratorTool,
  autonomousPullRequestTool,
  autonomousSoftwareEngineerTool,
  autonomousCodeReviewTool,
  memoryStoreTool,
  multiAgentCoordinatorTool,
  messageBusTool,
  eventBroadcastTool,
  agentDiscoveryTool,
  // Agent Negotiation & Trust Systems
  agentNegotiationTools.negotiateSolutionTool,
  agentNegotiationTools.buildConsensusTool,
  agentNegotiationTools.trustCalibrateTool,
  agentNegotiationTools.collaborativePlanningTool,
  // Dynamic Agent Systems
  dynamicAgentTools.spawnAgentTool,
  dynamicAgentTools.cloneAgentTool,
  dynamicAgentTools.swarmCoordinateTool,
  dynamicAgentTools.agentFailoverTool,
  executeProjectPlanTool,
  dependencyAnalyzerTool,
  dependencyUpgraderTool,
  transitiveScanTool,
  transitiveVulnerabilitiesTool,
  transitiveOutdatedTool,
  deepDependencyTreeTool,
  detectCyclesTool,
  cyclePathTool,
  cycleImpactTool,
  licenseCheckTool,
  bundleImpactTool,
  duplicateDepsTool,
  orphanDepsTool,
  deprecatedCheckTool,
  // Dependency Knowledge Graph (Capabilities 471-480)
  dependencyGraphBuilderTool,
  dependencyNodeAnalyzerTool,
  dependencyEdgeAnalyzerTool,
  dependencyImpactCalculatorTool,
  dependencyConflictDetectorTool,
  dependencyVersionResolverTool,
  dependencyVulnerabilityMapperTool,
  dependencyEvolutionTrackerTool,
  dependencyRedundancyFinderTool,
  depKgHealthMonitorTool,
  // Dependency Governance (Capabilities 491-520)
  dependencyOptimizationTool,
  dependencyPolicyTool,
  dependencyGovernanceHealthMonitorTool,
  vulnerabilityScannerTool,
  dependencyComplianceCheckerTool,
  licenseManagerTool,
  updatePlannerTool,
  conflictResolverTool,
  environmentCompatibilityTool,
  platformValidationTool,
  architectureAnalyzerTool,
  architectureGraphBuilderTool,
  architectureValidatorTool,
  architectureSimulatorTool,
  evaluateHealthTool,
  benchmarkArchTool,
  // Design Pattern tools
  detectPatternsTool,
  suggestRefactoringTool,
  detectAntiPatternsTool,
  patternLibraryTool,
  // Technical Debt tools
  analyzeDebtTool,
  prioritizeDebtTool,
  trackDebtTool,
  patternDetectorTool,
  codeIntelligenceTool,
  selfImproverTool,
  intentClassifierTool,
  promptNormalizationTool,
  contextEnrichmentTool,
  domainVocabularyExpanderTool,
  entityExtractionTool,
  featureRequestExtractorTool,
  userGoalReconstructorTool,
  taskDecomposerTool,
  contextOrchestratorTool,
  selfVerifierTool,
  executionHistoryTool,
  feedbackLoopTool,
  adaptiveStrategyTool,
  knowledgeBaseTool,
  securityScannerTool,
  vulnerabilityDetectorTool,
  complianceCheckerTool,
  securityRemediationTool,
  runtimeProfilerTool,
  cachingStrategiesTool,
  resourceOptimizerTool,
  queryOptimizerTool,
  teamCoordinatorTool,
  codeReviewerTool,
  knowledgeSharingTool,
  collaborationSessionTool,
  // AI Reasoning tools
  generateHypothesesTool,
  rankHypothesesTool,
  exploreBranchesTool,
  causalAnalysisTool,
  traceDependenciesTool,
  detectConflictsTool,
  monitorReasoningTool,
  theoryOfMindTool,
  abstractReasoningTool,
  // Basic Inference & Chain-of-Thought (Capabilities 1-22)
  directInferenceTool,
  chainOfThoughtTool,
  deductiveReasoningTool,
  inductiveReasoningTool,
  abductiveReasoningTool,
  syllogismTool,
  modalReasoningTool,
  circularReasoningCheckTool,
  fallacyDetectionTool,
  argumentStructureTool,
  reasoningAuditTool,
  // Uncertainty Quantification (Capabilities 41-60)
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
  // Analogical & Case-Based Reasoning (Capabilities 66-80)
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
  // Code Intelligence tools
  semanticSearchTool,
  nlQueryTool,
  codeSynthesisTool,
  crossLanguageTool,
  // Code Understanding Enhancements (Capabilities 221-340)
  dependencyVisualizationTool,
  cyclomaticComplexityTool,
  codeDuplicationTool,
  deadCodeTool,
  lintRuleGeneratorTool,
  runtimeTraceAnalyzerTool,
  stackTraceInterpreterTool,
  threadBehaviorAnalyzerTool,
  monorepoAnalyzerTool,
  microserviceDetectionTool,
  codeOwnershipGraphTool,
  developerWorkflowAnalyzerTool,
  automaticRefactoringTool,
  codeMigrationEngineTool,
  legacyCodeUnderstandingTool,
  codeModernizationPlannerTool,
  crossRepositoryLinkingTool,
  // Retrieval Intelligence (Capabilities 41-50)
  codeRetrievalTool,
  documentationRetrievalTool,
  patternRetrievalTool,
  architectureRetrievalTool,
  apiReferenceRetrievalTool,
  semanticSimilarityRankingTool,
  retrievalReRankingTool,
  queryRewritingTool,
  retrievalFallbackStrategyTool,
  knowledgeSourceValidatorTool,
  // Plan mode tools
  planningQuestionnaireTool,
  writePlanTool,
  exitPlanTool,
  // Role Specialization & Task Allocation (Capabilities 121-126)
  agentRolesTools.roleSpecializationTool,
  agentRolesTools.skillMatchingTool,
  agentRolesTools.taskDecompositionTool,
  agentRolesTools.workloadBalancingTool,
  agentRolesTools.capabilityMappingTool,
  agentRolesTools.roleEvolutionTool,
  // Conflict Resolution & Resource Allocation (Capabilities 161-166)
  conflictResolutionTools.detectConflictsTool,
  conflictResolutionTools.mediateDisputesTool,
  conflictResolutionTools.resourceArbitrationTool,
  conflictResolutionTools.priorityNegotiationTool,
  conflictResolutionTools.deadlockResolutionTool,
  conflictResolutionTools.fairnessOptimizationTool,
  // Hierarchical Teams & Role Evolution (Capabilities 171-178)
  hierarchicalTeamsTools.createTeamTool,
  hierarchicalTeamsTools.assignLeaderTool,
  hierarchicalTeamsTools.delegateAuthorityTool,
  hierarchicalTeamsTools.teamFormationTool,
  hierarchicalTeamsTools.rolePromotionTool,
  hierarchicalTeamsTools.teamDissolveTool,
  hierarchicalTeamsTools.knowledgeHierarchyTool,
  hierarchicalTeamsTools.escalationPathTool,
  // Specialized Agents (Capabilities 161-170)
  specializedAgentsTools.plannerAgentTool,
  specializedAgentsTools.architectAgentTool,
  specializedAgentsTools.backendGeneratorAgentTool,
  specializedAgentsTools.frontendGeneratorAgentTool,
  specializedAgentsTools.databaseArchitectAgentTool,
  specializedAgentsTools.securityAgentTool,
  specializedAgentsTools.testingAgentTool,
  specializedAgentsTools.deploymentAgentTool,
  specializedAgentsTools.debuggingAgentTool,
  specializedAgentsTools.refactoringAgentTool,
  // Program Slicing & Control Flow (Capabilities 221-227)
  computeSliceTool,
  controlFlowGraphTool,
  dataFlowAnalysisTool,
  reachabilityTool,
  dependenceGraphTool,
  staticAnalysisTool,
  dynamicAnalysisTool,
  // Formal Verification & Invariants (Capabilities 317-322)
  verifyInvariantsTool,
  assertionCheckingTool,
  contractVerificationTool,
  modelCheckingTool,
  proofAssistantTool,
  propertyCheckingTool,
  // Runtime Analysis & Memory Profiling (Capabilities 326-332)
  memoryProfileTool,
  performanceTraceTool,
  bottleneckDetectTool,
  heapAnalysisTool,
  cpuProfileTool,
  leakDetectionTool,
  threadAnalysisTool,
  // Self-Improving Reasoning (Capabilities 61-70)
  selfImprovingReasoningTools.learningFeedbackLoopTool,
  selfImprovingReasoningTools.performanceEvaluationTool,
  selfImprovingReasoningTools.strategyRefinementTool,
  selfImprovingReasoningTools.knowledgeUpdaterTool,
  selfImprovingReasoningTools.errorPatternLearnerTool,
  selfImprovingReasoningTools.successPatternExtractorTool,
  selfImprovingReasoningTools.adaptiveThresholdLearnerTool,
  selfImprovingReasoningTools.rewardCalculatorTool,
  selfImprovingReasoningTools.policyUpdaterTool,
  selfImprovingReasoningTools.selfCorrectionEngineTool,
  // Iterative Reasoning Loops (Capabilities 81-90)
  reflectionEngineTool,
  replanningEngineTool,
  goalDecompositionTool,
  progressTrackingTool,
  checkpointEvaluationTool,
  failureAnalysisTool,
  alternativeGenerationTool,
  convergenceCheckTool,
  backtrackingEngineTool,
  iterationOptimizerTool,
  // Code Representation (Capabilities 231-240)
  codeEmbeddingGeneratorTool,
  functionEmbeddingSystemTool,
  classEmbeddingSystemTool,
  fileEmbeddingSystemTool,
  repositoryEmbeddingSystemTool,
  codeSimilaritySearchTool,
  codeClusteringEngineTool,
  codeIndexingSystemTool,
  codeMetadataExtractorTool,
  codeFingerprintGeneratorTool,
  // Monitoring (Capabilities 171-180)
  agentHealthCheckTool,
  performanceMetricsTool,
  resourceMonitorTool,
  errorRateTrackerTool,
  successRateMonitorTool,
  latencyTrackerTool,
  throughputMonitorTool,
  anomalyDetectorTool,
  alertGeneratorTool,
  dashboardMetricsTool,
  // Runtime Telemetry (Capabilities 421-430)
  performanceTelemetryTool,
  errorTelemetryTool,
  usageTelemetryTool,
  latencyTelemetryTool,
  throughputTelemetryTool,
  resourceTelemetryTool,
  customTelemetryTool,
  telemetryAggregatorTool,
  telemetryExporterTool,
  telemetryDashboardTool,
  // Documentation Intelligence (Capabilities 261-270)
  documentationIntelligenceTools.autoDocGeneratorTool,
  documentationIntelligenceTools.apiDocGeneratorTool,
  documentationIntelligenceTools.readmeGeneratorTool,
  documentationIntelligenceTools.codeCommentGeneratorTool,
  documentationIntelligenceTools.changelogGeneratorTool,
  documentationIntelligenceTools.architectureDocGeneratorTool,
  documentationIntelligenceTools.docFormatterTool,
  documentationIntelligenceTools.docConsistencyCheckerTool,
  documentationIntelligenceTools.docCoverageAnalyzerTool,
  documentationIntelligenceTools.docUpdaterTool,
  // Counterfactual Reasoning (Capabilities 101-110)
  hypothesisGeneratorTool,
  counterfactualGeneratorTool,
  whatIfAnalyzerTool,
  causalInferenceTool,
  impactAnalysisTool,
  scenarioSimulatorTool,
  alternativeOutcomePredictorTool,
  decisionImpactEvaluatorTool,
  assumptionChallengerTool,
  rootCauseHypothesizerTool,
  // Reasoning Infrastructure (Capabilities 111-120)
  reasoningGraphBuilderTool,
  reasoningNodeEvaluatorTool,
  reasoningEdgeDependencyTrackerTool,
  reasoningStatePersistenceTool,
  reasoningCacheEngineTool,
  reasoningTraceVisualizationTool,
  reasoningPerformanceProfilerTool,
  reasoningMemoryStorageTool,
  reasoningVersionTrackingTool,
  reasoningReproducibilityEngineTool,
  // Advanced Coordination (Capabilities 201-210)
  advancedCoordinationTools.agentCloningTool,
  advancedCoordinationTools.swarmCoordinationTool,
  advancedCoordinationTools.distributedAgentClusterTool,
  advancedCoordinationTools.crossAgentReasoningTool,
  advancedCoordinationTools.agentDelegationTool,
  advancedCoordinationTools.agentRedundancyTool,
  advancedCoordinationTools.agentFailoverMechanismTool,
  advancedCoordinationTools.emergentCoordinationTool,
  advancedCoordinationTools.agentTopologyOptimizerTool,
  // Architecture Knowledge Graph (Capabilities 391-400)
  architectureReasoningEngineTool,
  architectureDecisionScoringTool,
  architectureTradeoffAnalyzerTool,
  architectureConstraintSolverTool,
  architectureOptimizationSearchTool,
  architectureMultiObjectivePlannerTool,
  architectureHeuristicEngineTool,
  architectureReinforcementLearningTool,
  architectureSolutionRankingTool,
  architectureRecommendationEngineTool,
  // Architecture Planning (Capabilities 401-405)
  architectureRollbackPlannerTool,
  futureGrowthPlannerTool,
  scalingForecastEngineTool,
  costProjectionModelTool,
  sustainabilityAnalysisTool,
  // Agent Governance & Sandbox (Capabilities 181-190)
  agentPermissionSystemTool,
  agentActionAuditTool,
  agentTerminationControlTool,
  agentSandboxEnforcementTool,
  // Code Knowledge Infrastructure (Capabilities 321-330)
  codeKnowledgeGraphBuilderTool,
  codeIndexingPipelineTool,
];
// ============================================================================
// Agent Tool Name Type (derived from TOOL_DEFINITIONS)
// ============================================================================

export type AgentToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// ============================================================================
// Agent Tool Consent Management
// ============================================================================

interface PendingConsentEntry {
  chatId: number;
  resolve: (d: "accept-once" | "accept-always" | "decline") => void;
}

const pendingConsentResolvers = new Map<string, PendingConsentEntry>();

export function waitForAgentToolConsent(
  requestId: string,
  chatId: number,
): Promise<"accept-once" | "accept-always" | "decline"> {
  return new Promise((resolve) => {
    pendingConsentResolvers.set(requestId, { chatId, resolve });
  });
}

export function resolveAgentToolConsent(
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
) {
  const entry = pendingConsentResolvers.get(requestId);
  if (entry) {
    pendingConsentResolvers.delete(requestId);
    entry.resolve(decision);
  }
}

/**
 * Clean up all pending consent requests for a given chat.
 * Called when a stream is cancelled/aborted to prevent orphaned promises
 * and stale UI banners.
 */
export function clearPendingConsentsForChat(chatId: number): void {
  for (const [requestId, entry] of pendingConsentResolvers) {
    if (entry.chatId === chatId) {
      pendingConsentResolvers.delete(requestId);
      // Resolve with decline so the tool execution fails gracefully
      entry.resolve("decline");
    }
  }
}

// ============================================================================
// Questionnaire Response Management
// ============================================================================

interface PendingQuestionnaireEntry {
  chatId: number;
  resolve: (answers: Record<string, string> | null) => void;
}

const pendingQuestionnaireResolvers = new Map<
  string,
  PendingQuestionnaireEntry
>();

const QUESTIONNAIRE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function waitForQuestionnaireResponse(
  requestId: string,
  chatId: number,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const entry = pendingQuestionnaireResolvers.get(requestId);
      if (entry) {
        pendingQuestionnaireResolvers.delete(requestId);
        entry.resolve(null);
      }
    }, QUESTIONNAIRE_TIMEOUT_MS);

    pendingQuestionnaireResolvers.set(requestId, {
      chatId,
      resolve: (answers) => {
        clearTimeout(timeout);
        resolve(answers);
      },
    });
  });
}

export function resolveQuestionnaireResponse(
  requestId: string,
  answers: Record<string, string> | null,
) {
  const entry = pendingQuestionnaireResolvers.get(requestId);
  if (entry) {
    pendingQuestionnaireResolvers.delete(requestId);
    entry.resolve(answers);
  }
}

/**
 * Clean up all pending questionnaire requests for a given chat.
 * Called when a stream is cancelled/aborted to prevent orphaned promises.
 */
export function clearPendingQuestionnairesForChat(chatId: number): void {
  for (const [requestId, entry] of pendingQuestionnaireResolvers) {
    if (entry.chatId === chatId) {
      pendingQuestionnaireResolvers.delete(requestId);
      entry.resolve(null);
    }
  }
}

export function getDefaultConsent(toolName: AgentToolName): AgentToolConsent {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  return tool?.defaultConsent ?? "ask";
}

export function getAgentToolConsent(toolName: AgentToolName): AgentToolConsent {
  const settings = readSettings();
  const stored = settings.agentToolConsents?.[toolName];
  if (stored) {
    return stored;
  }
  return getDefaultConsent(toolName);
}

export function setAgentToolConsent(
  toolName: AgentToolName,
  consent: AgentToolConsent,
): void {
  const settings = readSettings();
  writeSettings({
    agentToolConsents: {
      ...settings.agentToolConsents,
      [toolName]: consent,
    },
  });
}

export function getAllAgentToolConsents(): Record<
  AgentToolName,
  AgentToolConsent
> {
  const settings = readSettings();
  const stored = settings.agentToolConsents ?? {};
  const result: Record<string, AgentToolConsent> = {};

  // Start with defaults, override with stored values
  for (const tool of TOOL_DEFINITIONS) {
    const storedConsent = stored[tool.name];
    if (storedConsent) {
      result[tool.name] = storedConsent;
    } else {
      result[tool.name] = getDefaultConsent(tool.name as AgentToolName);
    }
  }

  return result as Record<AgentToolName, AgentToolConsent>;
}

export async function requireAgentToolConsent(
  event: IpcMainInvokeEvent,
  params: {
    chatId: number;
    toolName: AgentToolName;
    toolDescription?: string | null;
    inputPreview?: string | null;
  },
): Promise<boolean> {
  const current = getAgentToolConsent(params.toolName);

  if (current === "always") return true;
  if (current === "never")
    throw new Error("Should not ask for consent for a tool marked as 'never'");

  // Ask renderer for a decision via event bridge
  const requestId = `agent:${params.toolName}:${crypto.randomUUID()}`;
  (event.sender as any).send("agent-tool:consent-request", {
    requestId,
    ...params,
  });

  const response = await waitForAgentToolConsent(requestId, params.chatId);

  if (response === "accept-always") {
    setAgentToolConsent(params.toolName, "always");
    return true;
  }
  if (response === "decline") {
    return false;
  }
  return response === "accept-once";
}

// ============================================================================
// Build Agent Tool Set
// ============================================================================

/**
 * Process placeholders in tool args (e.g. $$SUPABASE_CLIENT_CODE$$)
 * Recursively processes all string values in the args object.
 */
async function processArgPlaceholders<T extends Record<string, any>>(
  args: T,
  ctx: AgentContext,
): Promise<T> {
  if (!ctx.supabaseProjectId) {
    return args;
  }

  // Check if any string values contain the placeholder
  const argsStr = JSON.stringify(args);
  if (!argsStr.includes("$$SUPABASE_CLIENT_CODE$$")) {
    return args;
  }

  // Fetch the replacement value once
  const supabaseClientCode = await getSupabaseClientCode({
    projectId: ctx.supabaseProjectId,
    organizationSlug: ctx.supabaseOrganizationSlug ?? null,
  });

  // Process all string values in args
  const processValue = (value: any): any => {
    if (typeof value === "string") {
      return value.replace(/\$\$SUPABASE_CLIENT_CODE\$\$/g, supabaseClientCode);
    }
    if (Array.isArray(value)) {
      return value.map(processValue);
    }
    if (value && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = processValue(v);
      }
      return result;
    }
    return value;
  };

  return processValue(args) as T;
}

/**
 * Convert our ToolResult to AI SDK format
 */
function convertToolResultForAiSdk(
  result: ToolResult,
): LanguageModelV3ToolResultOutput {
  if (typeof result === "string") {
    return { type: "text", value: result };
  }
  throw new Error(`Unsupported tool result type: ${typeof result}`);
}

export interface BuildAgentToolSetOptions {
  /**
   * If true, exclude tools that modify state (files, database, etc.).
   * Used for read-only modes like "ask" mode.
   */
  readOnly?: boolean;
  /**
   * If true, only include tools that are allowed in plan mode.
   * Plan mode has access to read-only tools plus planning-specific tools.
   */
  planModeOnly?: boolean;
  /**
   * If true, exclude Pro-only tools.
   * Used for basic agent mode where some tools may not be available.
   */
  basicAgentMode?: boolean;
}

const FILE_EDIT_TOOLS: Set<FileEditToolName> = new Set(FILE_EDIT_TOOL_NAMES);

/**
 * Track file edit tool usage for telemetry
 */
function trackFileEditTool(
  ctx: AgentContext,
  toolName: string,
  args: { file_path?: string; path?: string },
): void {
  if (!FILE_EDIT_TOOLS.has(toolName as FileEditToolName)) {
    return;
  }
  const filePath = args.file_path ?? args.path;
  if (!filePath) {
    return;
  }
  if (!ctx.fileEditTracker[filePath]) {
    ctx.fileEditTracker[filePath] = {
      write_file: 0,
      edit_file: 0,
      search_replace: 0,
    };
  }
  ctx.fileEditTracker[filePath][toolName as FileEditToolName]++;
}

/**
 * Tools that should ONLY be available in plan mode (excluded from normal agent mode).
 * Note: planning_questionnaire is intentionally omitted so it's available in pro agent mode too.
 */
const PLAN_MODE_ONLY_TOOLS = new Set(["write_plan", "exit_plan"]);

/**
 * Planning-specific tools that are allowed in plan mode despite modifying state.
 * Superset of PLAN_MODE_ONLY_TOOLS plus tools that participate in planning
 * but are also available in normal (pro) agent mode.
 */
const PLANNING_SPECIFIC_TOOLS = new Set([
  ...PLAN_MODE_ONLY_TOOLS,
  "planning_questionnaire",
]);

/**
 * Tools only available in Pro agent mode (excluded from basic agent mode).
 */
const PRO_AGENT_ONLY_TOOLS = new Set<string>();

/**
 * Build ToolSet for AI SDK from tool definitions
 */
export function buildAgentToolSet(
  ctx: AgentContext,
  options: BuildAgentToolSetOptions = {},
) {
  const toolSet: Record<string, any> = {};

  for (const tool of TOOL_DEFINITIONS) {
    const consent = getAgentToolConsent(tool.name);
    if (consent === "never") {
      continue;
    }

    // In plan mode, skip state-modifying tools unless they're planning-specific
    if (
      options.planModeOnly &&
      tool.modifiesState &&
      !PLANNING_SPECIFIC_TOOLS.has(tool.name)
    ) {
      continue;
    }

    // Skip plan-mode-only tools when NOT in plan mode
    if (!options.planModeOnly && PLAN_MODE_ONLY_TOOLS.has(tool.name)) {
      continue;
    }

    // Skip Pro-only tools in basic agent mode
    if (options.basicAgentMode && PRO_AGENT_ONLY_TOOLS.has(tool.name)) {
      continue;
    }

    // In read-only mode, skip tools that modify state
    if (options.readOnly && tool.modifiesState) {
      continue;
    }

    if (tool.isEnabled && !tool.isEnabled(ctx)) {
      continue;
    }

    toolSet[tool.name] = {
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (args: any) => {
        try {
          const processedArgs = await processArgPlaceholders(args, ctx);

          // Check consent before executing the tool
          const allowed = await ctx.requireConsent({
            toolName: tool.name,
            toolDescription: tool.description,
            inputPreview: tool.getConsentPreview?.(processedArgs) ?? null,
          });
          if (!allowed) {
            throw new Error(`User denied permission for ${tool.name}`);
          }

          // Track file edit tool usage before execution to capture all attempts
          // (including failures) for retry/fallback telemetry
          trackFileEditTool(ctx, tool.name, processedArgs);

          const result = await tool.execute(processedArgs, ctx);

          return convertToolResultForAiSdk(result);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          ctx.onXmlComplete(
            `<dyad-output type="error" message="Tool '${tool.name}' failed: ${escapeXmlAttr(errorMessage)}">${escapeXmlContent(errorMessage)}</dyad-output>`,
          );
          throw error;
        }
      },
    };
  }

  return toolSet;
}
