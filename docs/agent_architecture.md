# Agent Architecture

Previously, Dyad used a pseudo tool-calling strategy using custom XML instead of model's formal tool calling capabilities. Now that models have gotten much better with tool calling, particularly with parallel tool calling, it's beneficial to use a more standard tool calling approach which will also make it much easier to add new tools.

- The heart of the local agent is in `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts` which contains the core agent loop: which keeps calling the LLM until it chooses not to do a tool call or hits the maximum number of steps for the turn.
- `src/pro/main/ipc/handlers/local_agent/tool_definitions.ts` contains the list of all the tools available to the Dyad local agent.

## The Sovereign Execution Loop (Level 7.0)

For high-complexity tasks, Dyad uses the `autonomous_software_engineer.ts` meta-orchestrator. This isn't just a tool; it's a hardened development persona that implements a **Sovereign Execution Loop**:

1.  **Deterministic Dispatching**: Every state-changing tool call is intercepted by the `deterministic_dispatcher`. It verifies the call against the active mission plan in `TODO.md`. If the tool isn't sanctioned by the plan, the execution is blocked (Mechanism 171).
2.  **Simulation Branching**: Before execution, the system (via `metacognition.ts`) simulates the tool's intended effect. If the predicted outcome deviates from the goal, it triggers a `PREDICTIVE DRIFT` warning (Mechanism 151).
3.  **Recursive Healing**: The loop is closed via `autonomous_fix_loop` (fixing TS errors) and `autonomous_test_generator` (creating and running E2E tests).

## Institutional Memory (Mechanism 61)

To prevent regression and the repetition of historical engineering errors, Dyad maintains a persistent Failure Repository at `.dyad/failure_repository.json`.

- Agents consult this repository during the planning phase of complex tasks.
- Anti-patterns (e.g., "Mismatched IPC signatures") are logged by the `self_improver` tool.
- This memory is used to "hearth" the agent's strategy, ensuring it avoids known pitfalls recorded in past sessions.

## Unlimited Context Memory System

Dyad implements a multi-tier memory architecture that provides effectively unlimited context by combining in-context memory with semantic retrieval from long-term storage.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNLIMITED CONTEXT MEMORY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  L1: ACTIVE CONTEXT (In-Context)                                            │
│      Capacity: Context Window Size                                          │
│      Contents: Current turn + recent messages                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  L2: SEMANTIC RETRIEVAL CACHE (Vector Store)                                │
│      Capacity: Unlimited (disk-based)                                       │
│      Contents: Embeddings of all context                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  L3: LONG-TERM MEMORY (Knowledge Systems)                                   │
│      Capacity: Unlimited (file-based)                                       │
│      Contents: Knowledge base, patterns, learnings                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  L4: ARCHIVAL STORAGE (Database + Files)                                    │
│      Capacity: Unlimited (SQLite + files)                                   │
│      Contents: Full message history, backups                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

- `src/lib/unlimited_context_memory.ts` - Core memory system with vector store and context builder
- `src/pro/main/ipc/handlers/local_agent/tools/unlimited_context_memory.ts` - Agent tool for memory operations
- `docs/UNLIMITED_CONTEXT_MEMORY_DESIGN.md` - Full architecture documentation

### Memory Tool Actions

The `unlimited_context_memory` tool provides these actions:

1. **remember** - Store decisions, errors, learnings, messages in long-term memory
2. **recall** - Retrieve relevant memories using semantic search
3. **build_context** - Build optimized context for a query with token budget awareness
4. **get_stats** - Get memory statistics
5. **cleanup** - Remove old memories
6. **forget** - Remove specific memories by query

### Memory Types and Priorities

| Type | Importance | Description |
|------|------------|-------------|
| decision | 1.0 | Important decisions and their rationale |
| error | 0.9 | Errors encountered and their resolutions |
| current_task | 0.95 | Active task context |
| active_plan | 0.9 | Current execution plan |
| message | 0.7 | Conversation messages |
| code | 0.6 | Code snippets and patterns |
| learning | 0.5 | Patterns and learnings discovered |
| summary | 0.4 | Summarized content |

### Integration with Context Building

The context builder uses the following strategy:

1. **Always Include**: System prompt, current message, active todos
2. **High Priority**: Recent messages, active plan, current file context
3. **Medium Priority**: Earlier messages, related code files
4. **Low Priority**: Old messages, unrelated files

Retrieved memories are injected into the context with relevance markers, allowing the LLM to understand the source and relevance of each piece of context.

## Add a tool

If you want to add a new tool, you will want to create a new tool in the `src/pro/main/ipc/handlers/local_agent/tools` directory. You can look at the existing tools as examples.

Then, import the tool and include it in `src/pro/main/ipc/handlers/local_agent/tool_definitions.ts`

Finally, you will need to define how to render the custom XML tag (e.g. `<dyad-$foo-tool-name>`) inside `src/components/chat/DyadMarkdownParser.tsx` which will typically involve creating a new React component to render the custom XML tag.

## Testing

You can add an E2E test by looking at the existing local agent E2E tests which are named like `e2e-tests/local_agent*.spec.ts`

You can define a tool call testing fixture at `e2e-tests/fixtures/engine` which allows you to simulate a tool call.

---

## Autonomous Core Systems (Phase 3-5 Implementation)

As of Version 0.39.0, Dyad implements three core autonomous systems that transform it from a "Tool-Augmented LLM" into a "Fully Autonomous AI Builder":

### Phase 3: Autonomous Planning Engine

Located in `src/pro/main/planner/`, the Planning Engine provides autonomous task planning capabilities:

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | Goal, Task, Plan type definitions |
| Engine | `planning_engine.ts` | Plan generation, goal decomposition |
| Persistence | `plan_persistence.ts` | SQLite storage for plans |
| IPC | `ipc_handlers.ts` | Renderer communication |

**Key Features:**
- Goal decomposition based on intent analysis
- Task dependency resolution with topological ordering
- Execution strategy selection (sequential, parallel, adaptive)
- Plan confidence scoring and warning generation
- Success criteria and constraint management

**Database Tables:** `plans`, `goals`, `tasks`

### Phase 4: Agent Scheduler

Located in `src/pro/main/scheduler/`, the Scheduler provides priority-based task execution:

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | Schedule entry, queue, resource types |
| Engine | `scheduler_engine.ts` | Priority queuing, resource scheduling |
| IPC | `ipc_handlers.ts` | Renderer communication |

**Key Features:**
- Priority levels: critical, high, normal, low, background
- Resource-aware scheduling (CPU, memory, agents)
- Exponential backoff retry with configurable strategies
- Queue management per application with concurrency limits
- Timeout handling and retry management

**Database Tables:** `schedule_entries`, `schedule_queues`

### Phase 5: Distributed Agent Runtime

Located in `src/pro/main/distributed/`, the Distributed Runtime enables multi-agent coordination:

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | Agent, node, communication types |
| Engine | `runtime_engine.ts` | Agent lifecycle, messaging, fault tolerance |
| IPC | `ipc_handlers.ts` | Renderer communication |

**Key Features:**
- Agent lifecycle management (create, terminate, monitor)
- Node registry with heartbeat monitoring
- Inter-agent messaging with pub/sub channels
- Checkpoint/restore for fault tolerance
- Task distribution strategies (round-robin, least-loaded, capability-match)
- Distributed locks and coordination primitives

**Database Tables:** `distributed_agents`, `distributed_nodes`, `agent_checkpoints`

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTONOMOUS EXECUTION PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. USER REQUEST                                                             │
│      ↓                                                                       │
│  2. PLANNING ENGINE (Phase 3)                                                │
│      - Analyze intent                                                        │
│      - Generate goals and tasks                                              │
│      - Resolve dependencies                                                  │
│      ↓                                                                       │
│  3. AGENT SCHEDULER (Phase 4)                                                │
│      - Queue tasks by priority                                               │
│      - Allocate resources                                                    │
│      - Execute with retry logic                                              │
│      ↓                                                                       │
│  4. DISTRIBUTED RUNTIME (Phase 5)                                            │
│      - Distribute to agents                                                  │
│      - Monitor execution                                                     │
│      - Handle failures with checkpoints                                      │
│      ↓                                                                       │
│  5. RESULT                                                                   │
│      - Return to user                                                        │
│      - Update knowledge graph                                                │
│      - Store in memory systems                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### IPC Channels

**Planner IPC (`PLANNER_IPC_CHANNELS`):**
- `planner:generate-plan` - Generate a plan from user request
- `planner:get-plan` - Get plan by ID
- `planner:get-ready-tasks` - Get tasks ready for execution
- `planner:update-task-status` - Update task execution status

**Scheduler IPC (`SCHEDULER_IPC_CHANNELS`):**
- `scheduler:schedule-task` - Schedule a task for execution
- `scheduler:cancel-task` - Cancel a scheduled task
- `scheduler:get-resource-pool` - Get resource pool state
- `scheduler:start` / `scheduler:stop` - Lifecycle control

**Distributed IPC (`DISTRIBUTED_IPC_CHANNELS`):**
- `distributed:create-agent` - Create a new agent instance
- `distributed:distribute-task` - Distribute task to agents
- `distributed:send-message` - Send inter-agent message
- `distributed:get-stats` - Get runtime statistics

---

## Knowledge Integration Layer (Evolution Complete)

Located in `src/pro/main/knowledge_integration/`, the KIL provides unified knowledge access across all modules:

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | Unified type definitions for knowledge entities, queries, and decisions |
| Query Orchestrator | `query_orchestrator.ts` | Unified query interface across all knowledge sources |
| Knowledge Aggregator | `knowledge_aggregator.ts` | Cross-module data fusion and context enrichment |
| Learning Repository | `learning_repository.ts` | Architecture decision recording and pattern learning |
| Source Connectors | `source_connectors.ts` | Real connectors to actual modules |
| Entity Mappers | `entity_mappers.ts` | Type mapping utilities |
| Decision Persistence | `decision_persistence.ts` | Database operations for decisions |
| IPC | `ipc_handlers.ts` | Renderer communication |

**Evolution History:**
| Cycle | Improvement | Lines | Status |
|-------|-------------|-------|--------|
| 1 | Knowledge Integration Layer | 2,703 | ✅ Complete |
| 2 | Source Connector Wiring | 1,019 | ✅ Complete |
| 3 | Database Persistence | 664 | ✅ Complete |
| 4 | Runtime Integration | 518 | ✅ Complete |
| 5 | **Autonomous Execution Pipeline** | **1,957** | ✅ Complete |
| **TOTAL** | | **6,861** | **✅** |

**Key Features:**
- Unified query interface for Code Graph, Vector Memory, Dependency Graph, Architecture, and Reasoning
- Parallel source queries with configurable sources
- Multiple ranking strategies (relevance, confidence, recency, hybrid)
- Cross-source entity resolution and deduplication
- Architecture decision recording with outcome tracking
- Pattern extraction from successful decisions
- Recommendation generation based on past learnings

**Database Tables:** `architecture_decisions`, `knowledge_queries`, `learned_patterns`, `knowledge_entities`, `knowledge_relationships`

### KIL IPC Channels

**Knowledge Integration IPC (`KIL_IPC_CHANNELS`):**
- `kil:query` - Execute unified knowledge query
- `kil:query-similar` - Find similar entities across sources
- `kil:record-decision` - Record architecture decision with context
- `kil:get-recommendations` - Get learning-based recommendations
- `kil:build-context` - Build aggregated task context
- `kil:clear-cache` - Clear query cache
- `kil:get-stats` - Get cache statistics

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED KNOWLEDGE ACCESS PIPELINE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. USER/AI REQUEST                                                          │
│      ↓                                                                       │
│  2. KNOWLEDGE INTEGRATION LAYER                                              │
│      - Query orchestrator receives request                                   │
│      - Parallel queries to multiple sources                                  │
│      - Knowledge aggregator fuses results                                    │
│      ↓                                                                       │
│  3. LEARNING REPOSITORY                                                      │
│      - Record decisions with outcomes                                        │
│      - Extract patterns from successful decisions                            │
│      - Generate recommendations                                              │
│      ↓                                                                       │
│  4. RESULT                                                                   │
│      - Unified response with ranked results                                  │
│      - Context enrichment for AI tools                                       │
│      - Learning feedback for future queries                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### KIL Source Connectors

The KIL connects to the following knowledge sources:

| Source | Module | Data Types |
|--------|--------|------------|
| Code Graph | `knowledge_graph/` | Entities, relationships, code structure |
| Vector Memory | `vector_memory/` | Embeddings, semantic search results |
| Dependency Graph | `dependency_analyzer.ts` | Package dependencies, version info |
| Architecture | `architecture_knowledge_graph.ts` | Patterns, decisions, constraints |
| Reasoning | `reasoning_infrastructure.ts` | Traces, insights, learned patterns |

---

## Autonomous Execution Pipeline (Cycle 5)

Located in `src/pro/main/autonomous_pipeline/`, the Autonomous Execution Pipeline transforms the tool-based execution model into a proactive autonomous reasoning pipeline:

```
User Request → Planner → Task Graph → Scheduler → Agent Runtime → Tools → Knowledge Layer
```

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Pipeline Orchestrator | `pipeline_orchestrator.ts` | Coordinates all autonomous subsystems |
| Knowledge Context Injector | `knowledge_context_injector.ts` | Proactive knowledge gathering before execution |
| Module Index | `index.ts` | Clean exports for the pipeline |

### Pipeline Phases

1. **Proactive Knowledge Gathering**
   - Extract task intent from request (feature, bugfix, refactor, etc.)
   - Query all knowledge sources (code graph, vector memory, architecture)
   - Retrieve related architecture decisions
   - Get recommendations from learning repository
   - Build comprehensive knowledge context

2. **Planning** (for complex requests with complexity ≥ 5)
   - Enhance planning context with gathered knowledge
   - Generate task decomposition plan
   - Persist plan to database

3. **Scheduling**
   - Schedule all tasks from the plan
   - Resolve dependencies between tasks
   - Start the scheduler for execution

4. **Execution**
   - Scheduler dispatches ready tasks
   - Track execution results
   - Handle failures with retry logic

5. **Learning**
   - Record execution outcomes
   - Extract lessons learned
   - Update decision outcomes in repository

### Intent Classification System

The pipeline automatically classifies user requests:

| Intent Type | Keywords | Complexity Mod |
|-------------|----------|----------------|
| feature | implement, add, create, build, develop | +0 |
| bugfix | fix, bug, error, issue, broken | -1 |
| refactor | refactor, restructure, clean up | +1 |
| test | test, spec, coverage | -1 |
| deployment | deploy, release, ship | +1 |
| exploration | explore, understand, analyze | -1 |
| documentation | document, docs, readme | -2 |
| maintenance | update, upgrade, migrate | +0 |

### Configuration

```typescript
interface PipelineConfig {
  enableProactiveKnowledge: boolean;      // default: true
  enableAutoPlanning: boolean;            // default: true
  enableScheduledExecution: boolean;      // default: true
  enableLearningFeedback: boolean;        // default: true
  planningComplexityThreshold: number;    // default: 5
  maxKnowledgeContextEntities: number;    // default: 20
  maxParallelTasks: number;               // default: 4
}
```

### Knowledge Context Injection

Before agent execution, the pipeline injects a structured knowledge context:

```
╔════════════════════════════════════════════════════════════════╗
║           PROACTIVE KNOWLEDGE CONTEXT INJECTION                 ║
╚════════════════════════════════════════════════════════════════╝

## Task Intent Analysis
**Type:** FEATURE (confidence: 80%)
**Complexity:** 7/10
**Technologies:** react, typescript

## Relevant Code Entities
[CODE_GRAPH] UserProfile (component) in src/components/UserProfile.tsx

## Related Architecture Decisions
• Use React functional components with hooks

## Learning-Based Recommendations
1. Consider using React.memo for performance
2. Follow existing component structure patterns
```

### Pipeline Events

The pipeline emits events for monitoring:

| Event | Description |
|-------|-------------|
| `pipeline_started` | Pipeline execution begins |
| `knowledge_context_built` | Knowledge gathering complete |
| `plan_generated` | Task decomposition created |
| `task_scheduled` | Task added to scheduler |
| `task_started` | Task execution begins |
| `task_completed` | Task finished successfully |
| `task_failed` | Task execution failed |
| `learning_recorded` | Outcome recorded |
| `pipeline_completed` | All phases complete |
| `pipeline_failed` | Pipeline error occurred |
