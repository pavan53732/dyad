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
