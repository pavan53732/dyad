/**
 * Distributed Agent Runtime - Module Entry Point
 * 
 * Provides distributed agent execution capabilities for Dyad.
 * 
 * ## Features
 * 
 * - Multi-agent coordination
 * - Distributed task execution
 * - Fault tolerance and recovery
 * - Inter-agent communication
 * - Checkpoint and restore
 * 
 * ## Usage
 * 
 * ```typescript
 * import { DistributedRuntime, DEFAULT_RUNTIME_CONFIG } from '@/pro/main/distributed';
 * 
 * // Create runtime
 * const runtime = new DistributedRuntime({
 *   nodeId: 'node-1',
 *   maxAgentsPerNode: 10,
 * });
 * 
 * // Create agents
 * const agent = runtime.createAgent({
 *   name: 'Code Agent',
 *   role: 'worker',
 *   capabilities: ['code_generation'],
 *   appId: 1,
 * });
 * 
 * // Distribute tasks
 * const result = runtime.distributeTask({
 *   taskId: 'task-123',
 *   strategy: 'capability_match',
 * });
 * 
 * // Start the runtime
 * runtime.start();
 * ```
 */

// Core engine
export { DistributedRuntime, DEFAULT_RUNTIME_CONFIG } from "./runtime_engine";
export type { DistributedRuntimeConfig } from "./runtime_engine";

// IPC handlers
export {
  DistributedIpcHandlers,
  initDistributedIpcHandlers,
  getDistributedIpcHandlers,
  DISTRIBUTED_IPC_CHANNELS,
} from "./ipc_handlers";
export type {
  CreateAgentRequest,
  CreateAgentResponse,
  SendMessageRequest,
  DistributeTaskRequest,
} from "./ipc_handlers";

// Types
export type {
  // Agent types
  AgentStatus,
  AgentCapability,
  AgentRole,
  DistributedAgent,
  AgentConfig,
  ResourceLimits,
  ResourceUsage,
  AgentHealth,
  HealthIssue,
  
  // Node types
  NodeStatus,
  DistributedNode,
  NodeCapabilities,
  NodeCapacity,
  NodeUsage,
  NodeMetadata,
  
  // Communication types
  MessageType,
  DistributedMessage,
  CommunicationChannel,
  
  // Coordination types
  CoordinationType,
  CoordinationRequest,
  CoordinationResponse,
  DistributedLock,
  
  // Fault tolerance types
  FailureType,
  FailureEvent,
  RecoveryAction,
  Checkpoint,
  
  // Distribution types
  DistributionStrategy,
  DistributionResult,
  AffinityRule,
  
  // Statistics types
  RuntimeStats,
  
  // Callback types
  DistributedCallbacks,
} from "./types";
