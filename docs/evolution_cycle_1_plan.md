# Evolution Cycle 1 Plan: Knowledge Integration Layer

## Executive Summary

**Improvement:** Create a unified Knowledge Integration Layer (KIL) that connects the Knowledge Graph, Vector Memory, and Architecture Reasoning modules.

**Goal:** Enable cross-module queries and provide a foundation for persistent learning from architecture decisions.

---

## Problem Statement

Current state:
- Knowledge Graph stores code entities but is isolated
- Vector Memory stores embeddings but doesn't feed into reasoning
- Architecture Tools use hardcoded heuristics without data-driven learning
- No unified query interface for cross-cutting concerns

Impact:
- Tools cannot leverage each other's knowledge
- Recommendations are not informed by actual code patterns
- No learning from past decisions

---

## Proposed Solution

### Knowledge Integration Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE INTEGRATION LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Query        │  │ Knowledge    │  │ Learning                 │ │
│  │ Orchestrator │  │ Aggregator   │  │ Repository               │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                        │                │
│         └─────────────────┼────────────────────────┘                │
│                           │                                         │
│         ┌─────────────────┼─────────────────┐                       │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Knowledge    │  │ Vector       │  │ Dependency   │              │
│  │ Graph        │  │ Memory       │  │ Graph        │              │
│  │ (Phase 1)    │  │ (Phase 2)    │  │ (Existing)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Components to Create

1. **Query Orchestrator** (`query_orchestrator.ts`)
   - Unified query interface for all knowledge sources
   - Query planning and optimization
   - Result aggregation and ranking

2. **Knowledge Aggregator** (`knowledge_aggregator.ts`)
   - Cross-module data fusion
   - Entity resolution and deduplication
   - Context enrichment

3. **Learning Repository** (`learning_repository.ts`)
   - Store architecture decisions with outcomes
   - Similarity search for past decisions
   - Confidence scoring based on outcomes

4. **Integration Types** (`integration_types.ts`)
   - Unified type definitions
   - Query and result schemas
   - Cross-module interfaces

---

## Implementation Details

### File Structure

```
src/pro/main/knowledge_integration/
├── index.ts                    # Module entry point
├── types.ts                    # Integration types
├── query_orchestrator.ts       # Unified query interface
├── knowledge_aggregator.ts     # Cross-module data fusion
├── learning_repository.ts      # Decision learning storage
├── ipc_handlers.ts             # IPC interface for renderer
└── README.md                   # Module documentation
```

### Integration Points

1. **Knowledge Graph Integration**
   - Import existing query engine
   - Map graph entities to unified schema
   - Enable graph queries through KIL

2. **Vector Memory Integration**
   - Import embedding service
   - Add semantic search to query results
   - Enable similarity-based context retrieval

3. **Architecture Tools Integration**
   - Provide knowledge context to architecture tools
   - Store decision outcomes for learning
   - Enable recommendation refinement

### Database Schema Additions

```typescript
// Architecture Decision Records
architecture_decisions {
  id: text (PK)
  appId: integer (FK)
  decision: text
  context: json
  alternatives: json
  selectedOption: text
  rationale: text
  outcome: text // success, partial, failure
  outcomeMetrics: json
  learnedPatterns: json
  confidence: real
  createdAt: timestamp
  updatedAt: timestamp
}

// Knowledge Queries (for learning)
knowledge_queries {
  id: text (PK)
  query: text
  sources: json
  resultCount: integer
  relevanceScore: real
  feedback: text
  createdAt: timestamp
}
```

---

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `knowledge_integration/` | NEW | Core KIL implementation |
| `db/schema.ts` | MODIFY | Add decision tables |
| `knowledge_graph/` | REFERENCE | Import query engine |
| `vector_memory/` | REFERENCE | Import embedding service |
| `architecture_knowledge_graph.ts` | INTEGRATE | Use KIL for context |

---

## Dependencies

- `src/pro/main/knowledge_graph/` - For code graph queries
- `src/pro/main/vector_memory/` - For semantic search
- `src/db/` - For decision persistence
- `src/pro/main/ipc/handlers/local_agent/tools/` - Tool integration

---

## Success Criteria

1. ✅ Unified query interface accessible from tools
2. ✅ Cross-module queries return aggregated results
3. ✅ Architecture decisions stored with outcomes
4. ✅ Similarity search for past decisions working
5. ✅ IPC handlers registered and functional
6. ✅ No breaking changes to existing modules

---

## Future Improvements Enabled

1. **Cycle 2:** Learning from decision outcomes
2. **Cycle 3:** Incremental knowledge updates
3. **Future:** Multi-project knowledge sharing
4. **Future:** Feedback loop from runtime metrics

---

## Estimated Effort

- Implementation: ~1500 lines of code
- Integration: ~200 lines of changes
- Testing: Manual verification of queries

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing tools | KIL is additive, no changes to existing APIs |
| Performance degradation | Query caching and result optimization |
| Data inconsistency | Single source of truth per entity type |

---

*Plan created for Evolution Cycle 1*
