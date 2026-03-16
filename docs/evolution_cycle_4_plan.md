# Evolution Cycle 4 Plan: Runtime Integration Phase

## Executive Summary

**Improvement:** Connect the isolated autonomous subsystems to the agent runtime pipeline, enabling the agent to actually use the Knowledge Integration Layer, Planning Engine, Agent Scheduler, and related systems.

**Goal:** Transform ~15,000 lines of "dead code" into active, runtime-connected infrastructure.

---

## Problem Statement

### Verification Finding

A comprehensive architectural verification revealed:

| Module                      | Path                                  | Lines       | Status       |
| --------------------------- | ------------------------------------- | ----------- | ------------ |
| Knowledge Integration Layer | `src/pro/main/knowledge_integration/` | 4,386       | 🔴 DEAD      |
| Planning Engine             | `src/pro/main/planner/`               | 2,855       | 🔴 DEAD      |
| Agent Scheduler             | `src/pro/main/scheduler/`             | 1,965       | 🔴 DEAD      |
| Distributed Runtime         | `src/pro/main/distributed/`           | 2,156       | 🔴 DEAD      |
| Knowledge Graph             | `src/pro/main/knowledge_graph/`       | 2,798       | 🔴 DEAD      |
| Vector Memory               | `src/pro/main/vector_memory/`         | 1,286       | 🔴 DEAD      |
| **Total**                   |                                       | **~15,446** | **ISOLATED** |

### Root Cause

1. **IPC Handlers Never Registered:**
   - `initKnowledgeIntegrationIpcHandlers()` — defined but never called
   - `initPlannerIpcHandlers()` — defined but never called
   - `initSchedulerIpcHandlers()` — defined but never called
   - `initDistributedIpcHandlers()` — defined but never called
   - `registerKnowledgeGraphHandlers()` — defined but never called

2. **No Imports in Runtime:**
   - `src/ipc/ipc_host.ts` does NOT import any of these modules
   - `src/pro/main/ipc/handlers/local_agent/tool_definitions.ts` does NOT use KIL

3. **No Tool Integration:**
   - No tools query the Knowledge Integration Layer
   - No tools use the Learning Repository

---

## Proposed Solution

### Architecture Target

```
UI
 → IPC host (ipc_host.ts)
 → Planner (pre-execution stage)
 → Scheduler (task management)
 → Agent Runtime (local_agent_handler.ts)
 → Tool Registry (TOOL_DEFINITIONS)
 → Knowledge Integration Layer
 → Learning Repository
 → Database
```

### Implementation Tasks

#### Task 1: Register IPC Handlers

**File:** `src/ipc/ipc_host.ts`

**Changes:**

```typescript
// Add imports
import { initKnowledgeIntegrationIpcHandlers } from "../pro/main/knowledge_integration";
import { initPlannerIpcHandlers } from "../pro/main/planner";
import { initSchedulerIpcHandlers } from "../pro/main/scheduler";
import { initDistributedIpcHandlers } from "../pro/main/distributed";
import { registerKnowledgeGraphHandlers } from "../pro/main/knowledge_graph/ipc_handlers";

// Add registrations in registerIpcHandlers()
initKnowledgeIntegrationIpcHandlers();
initPlannerIpcHandlers();
initSchedulerIpcHandlers();
initDistributedIpcHandlers();
registerKnowledgeGraphHandlers();
```

**Expected Result:** 20+ IPC channels become callable from renderer.

#### Task 2: Extend AgentContext

**File:** `src/pro/main/ipc/handlers/local_agent/tools/types.ts`

**Changes:**

```typescript
export interface AgentContext {
  // ... existing fields ...

  knowledgeOrchestrator?: {
    query: (
      query: string,
      sources?: string[],
      limit?: number,
    ) => Promise<QueryResult>;
    findSimilar: (
      entityId: string,
      options?: SimilarOptions,
    ) => Promise<SimilarResult[]>;
    buildContext: (
      task: string,
      options?: ContextOptions,
    ) => Promise<BuildContext>;
  };

  learningRepository?: {
    recordDecision: (decision: DecisionInput) => Promise<{ id: string }>;
    getRecommendations: (
      context: RecommendationContext,
    ) => Promise<Recommendation[]>;
    updateOutcome: (decisionId: string, outcome: Outcome) => Promise<void>;
  };
}
```

**Expected Result:** Tools can access KIL capabilities via context.

#### Task 3: Create KIL Query Tools

**File:** `src/pro/main/ipc/handlers/local_agent/tools/kil_query_tool.ts` (NEW)

**Tools to Create:**

| Tool                      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `kil_query`               | Unified knowledge queries across sources |
| `kil_query_similar`       | Find similar entities                    |
| `kil_get_recommendations` | Learning-based recommendations           |
| `kil_record_decision`     | Record architecture decisions            |
| `kil_build_context`       | Build task context                       |

**Expected Result:** Agent can call KIL through tools.

#### Task 4: Register Tools

**File:** `src/pro/main/ipc/handlers/local_agent/tool_definitions.ts`

**Changes:**

```typescript
import {
  kilQueryTool,
  kilQuerySimilarTool,
  kilGetRecommendationsTool,
  kilRecordDecisionTool,
  kilBuildContextTool,
} from "./tools/kil_query_tool";

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  // ... existing tools ...
  kilQueryTool,
  kilQuerySimilarTool,
  kilGetRecommendationsTool,
  kilRecordDecisionTool,
  kilBuildContextTool,
];
```

**Expected Result:** Agent discovers KIL tools automatically.

#### Task 5: Context Instantiation

**File:** `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts`

**Changes:**

```typescript
import { QueryOrchestrator, LearningRepository } from "@/pro/main/knowledge_integration";

// In handleLocalAgentStream:
const queryOrchestrator = new QueryOrchestrator();
const learningRepository = new LearningRepository();

const ctx: AgentContext = {
  // ... existing fields ...
  knowledgeOrchestrator: isDyadProEnabled(settings) ? { ... } : undefined,
  learningRepository: isDyadProEnabled(settings) ? { ... } : undefined,
};
```

**Expected Result:** KIL instances created per agent session.

---

## Integration Points

### IPC Channels to Activate

| Channel                   | Purpose                        |
| ------------------------- | ------------------------------ |
| `kil:query`               | Unified knowledge queries      |
| `kil:query-similar`       | Similarity search              |
| `kil:record-decision`     | Decision persistence           |
| `kil:get-recommendations` | Learning-based recommendations |
| `planner:generate-plan`   | Task decomposition             |
| `scheduler:schedule-task` | Task scheduling                |
| `distributed:spawn-agent` | Agent spawning                 |

### Tool-to-KIL Flow

```
Tool Call (kil_query)
    ↓
AgentContext.knowledgeOrchestrator.query()
    ↓
QueryOrchestrator.query()
    ↓
SourceConnectors (CodeGraph, VectorMemory, etc.)
    ↓
Aggregated Results
    ↓
Tool Result
```

---

## Success Criteria

| Criteria                            | Verification Method                                 |
| ----------------------------------- | --------------------------------------------------- |
| KIL modules imported by runtime     | `grep -r "knowledge_integration" src/pro/main/ipc/` |
| IPC channels registered             | Check `ipc_host.ts` for registration calls          |
| Tools appear in TOOL_DEFINITIONS    | Check `tool_definitions.ts` for new entries         |
| Agent can call KIL during execution | Run agent with KIL query task                       |
| Decisions persist to database       | Query `architecture_decisions` table                |
| TypeScript compiles                 | `npx tsc --noEmit`                                  |
| Lint passes                         | `bun run lint`                                      |

---

## Risk Mitigation

| Risk                      | Mitigation                                               |
| ------------------------- | -------------------------------------------------------- |
| Breaking existing runtime | Only additive changes; no modifications to existing flow |
| Type mismatches           | Comprehensive type definitions in types.ts               |
| Performance overhead      | KIL instances are lazy-loaded and cached                 |
| Dyad Pro gating           | KIL context only created when `isDyadPro` is true        |

---

## Estimated Effort

| Task                   | Lines    | Complexity |
| ---------------------- | -------- | ---------- |
| IPC Registration       | ~30      | Low        |
| AgentContext Extension | ~70      | Medium     |
| KIL Query Tools        | ~250     | Medium     |
| Tool Registration      | ~20      | Low        |
| Context Integration    | ~70      | Medium     |
| **Total**              | **~440** | **Medium** |

---

_Plan created for Evolution Cycle 4: Runtime Integration Phase_
