# Evolution Cycle 2 Plan: Source Connector Integration

## Executive Summary

**Improvement:** Wire the Knowledge Integration Layer source connectors to actual modules (Knowledge Graph, Vector Memory, etc.)

**Goal:** Enable real cross-source queries that return actual data from the existing modules.

---

## Problem Statement

Current state:
- KIL Query Orchestrator has stub connectors that return empty arrays
- Knowledge Graph module exists with full functionality (`GraphStorage`, `GraphQueryEngine`)
- Vector Memory module exists with full functionality (`VectorStorage`, `EmbeddingService`)
- No integration between KIL and actual modules

Impact:
- KIL queries always return empty results
- Cross-source queries don't work
- Learning repository cannot store real decision contexts
- The integration layer is non-functional

---

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE INTEGRATION LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Query        │  │ Knowledge    │  │ Learning                 │ │
│  │ Orchestrator │──▶ Aggregator   │◀──▶ Repository               │ │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │
│         │                                                            │
│         │ WIRED CONNECTORS (New)                                     │
│         │                                                            │
│  ┌──────┴────────────────────────────────────────────────────────┐ │
│  │                    SourceConnectors                            │ │
│  │                                                                │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐│ │
│  │  │ CodeGraph       │  │ VectorMemory    │  │ Dependency     ││ │
│  │  │ Connector       │  │ Connector       │  │ Connector      ││ │
│  │  │ (REAL)          │  │ (REAL)          │  │ (REAL)         ││ │
│  │  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘│ │
│  └───────────┼────────────────────┼──────────────────┼─────────┘ │
│              │                    │                  │            │
└──────────────┼────────────────────┼──────────────────┼────────────┘
               │                    │                  │
               ▼                    ▼                  ▼
      ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
      │ knowledge_     │  │ vector_memory/ │  │ dependency_    │
      │ graph/         │  │                │  │ analyzer.ts    │
      │ (Storage,      │  │ (VectorStorage,│  │ (existing)     │
      │ QueryEngine)   │  │ EmbeddingSvc)  │  │                │
      └────────────────┘  └────────────────┘  └────────────────┘
```

### Components to Create/Modify

1. **New File: `source_connectors.ts`** (estimated ~600 lines)
   - CodeGraphSourceConnector - wires to `graphStorage` and `graphQueryEngine`
   - VectorMemorySourceConnector - wires to `vectorStorage` and `embeddingService`
   - DependencySourceConnector - wires to dependency analyzer tools
   - ArchitectureSourceConnector - wires to architecture tools
   - ReasoningSourceConnector - wires to reasoning infrastructure

2. **Modify: `query_orchestrator.ts`**
   - Replace stub connectors with real connectors
   - Add connector initialization with dependency injection

3. **Modify: `knowledge_aggregator.ts`**
   - Add proper entity mapping from source-specific types

4. **Modify: `types.ts`**
   - Add type mapping utilities

---

## Implementation Details

### File Structure

```
src/pro/main/knowledge_integration/
├── index.ts                    # Module entry point (existing)
├── types.ts                    # Integration types (existing, minor updates)
├── query_orchestrator.ts       # Unified query interface (modify)
├── knowledge_aggregator.ts     # Cross-module data fusion (modify)
├── learning_repository.ts      # Decision learning storage (existing)
├── ipc_handlers.ts             # IPC interface (existing)
├── source_connectors.ts        # NEW: Real source connector implementations
└── entity_mappers.ts           # NEW: Type mapping utilities
```

### Connector Implementations

#### CodeGraphSourceConnector

```typescript
class CodeGraphSourceConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    // Use graphStorage.queryNodes() and graphQueryEngine.findNodesByName()
    const results = await graphStorage.queryNodes(query.appId, {
      name: query.query,
      type: mapEntityTypes(query.entityTypes),
    });
    return results.items.map(node => mapNodeToEntity(node));
  }

  async getById(id: string): Promise<UnifiedKnowledgeEntity | null> {
    const node = await graphStorage.getNode(id);
    return node ? mapNodeToEntity(node) : null;
  }

  async getByPath(appId: number, path: string): Promise<UnifiedKnowledgeEntity[]> {
    const nodes = await graphQueryEngine.findNodesInFile(appId, path);
    return nodes.map(mapNodeToEntity);
  }

  async findSimilar(entity: UnifiedKnowledgeEntity, options): Promise<UnifiedKnowledgeEntity[]> {
    // Find related entities via graph traversal
    const related = await graphStorage.traverseFrom(entity.id, {
      maxDepth: 2,
      direction: "both",
      limit: options?.limit || 10,
    });
    return related.map(mapNodeToEntity);
  }
}
```

#### VectorMemorySourceConnector

```typescript
class VectorMemorySourceConnector implements SourceConnector {
  async query(query: KnowledgeQuery): Promise<UnifiedKnowledgeEntity[]> {
    const searchResult = await vectorStorage.search({
      appId: query.appId,
      query: query.query,
      limit: query.limit || 20,
      minSimilarity: 0.5,
    });
    return searchResult.results.map(r => mapMemoryEntryToEntity(r.entry));
  }

  async findSimilar(entity: UnifiedKnowledgeEntity, options): Promise<UnifiedKnowledgeEntity[]> {
    if (!entity.sourceId) return [];
    const similar = await vectorStorage.findSimilar(entity.sourceId, {
      limit: options?.limit || 10,
      minSimilarity: options?.minSimilarity || 0.7,
    });
    return similar.map(r => mapMemoryEntryToEntity(r.entry));
  }
}
```

### Entity Mapping

```typescript
// entity_mappers.ts

function mapNodeToEntity(node: KnowledgeNodeRow): UnifiedKnowledgeEntity {
  return {
    id: `kg:${node.id}`,
    sourceId: node.id,
    source: "code_graph",
    type: mapNodeType(node.type),
    name: node.name,
    filePath: node.filePath || undefined,
    description: node.documentation || undefined,
    data: {
      signature: node.signature,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
    },
    relationships: [], // Loaded separately
    metadata: {
      confidence: 1.0,
      lastUpdated: node.updatedAt,
      accessCount: 0,
    },
  };
}

function mapMemoryEntryToEntity(entry: MemoryEntry): UnifiedKnowledgeEntity {
  return {
    id: `vm:${entry.id}`,
    sourceId: entry.id,
    source: "vector_memory",
    type: mapContentType(entry.contentType),
    name: extractName(entry.content),
    filePath: entry.filePath,
    description: truncateContent(entry.content),
    data: {
      embedding: entry.embedding,
      importance: entry.importance,
    },
    relationships: [],
    metadata: {
      confidence: entry.importance,
      lastUpdated: entry.updatedAt,
      accessCount: entry.accessCount,
    },
  };
}
```

---

## Integration Points

| Module | Import Path | Used Classes/Functions |
|--------|-------------|------------------------|
| Knowledge Graph | `../knowledge_graph/storage` | `graphStorage` |
| Knowledge Graph | `../knowledge_graph/query_engine` | `graphQueryEngine` |
| Vector Memory | `../vector_memory/vector_storage` | `vectorStorage` |
| Vector Memory | `../vector_memory/embedding_service` | `embeddingService` |

---

## Success Criteria

1. ✅ `kil:query` returns real results from Knowledge Graph
2. ✅ `kil:query` returns real results from Vector Memory
3. ✅ `kil:query-similar` finds related entities
4. ✅ Cross-source queries aggregate real data
5. ✅ No breaking changes to existing module APIs
6. ✅ All lint checks pass

---

## Estimated Effort

- Implementation: ~800 lines of code
- Testing: Manual verification via IPC calls
- Documentation: Update cycle 2 report

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing modules | Only read operations, no writes to source modules |
| Type mismatches | Comprehensive type mapping layer |
| Performance | Existing modules already optimized |

---

*Plan created for Evolution Cycle 2*
