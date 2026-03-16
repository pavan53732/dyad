# Evolution Cycle 3 Plan: Database Persistence for Learning Decisions

## Executive Summary

**Improvement:** Implement database persistence for the Learning Repository, enabling architecture decisions to persist across sessions and enabling continuous learning.

**Goal:** Complete the learning loop by persisting decisions, outcomes, and patterns to the database.

---

## Problem Statement

Current state:

- `LearningRepository.persistDecision()` is a stub that only updates cache
- `LearningRepository.loadDecision()` returns null
- Decisions are lost when the application restarts
- Patterns are extracted but not stored
- Learning cannot accumulate over time

Impact:

- No persistent knowledge from past decisions
- Each session starts with no learning history
- Recommendations cannot improve over time
- Valuable lessons learned are lost

---

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEARNING REPOSITORY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐ │
│  │ recordDecision() │───▶│ persistDecision()│───▶│ architecture_        │ │
│  │                  │    │ (REAL)           │    │ decisions TABLE      │ │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘ │
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐ │
│  │ learnFromOutcome │───▶│ persistPattern() │───▶│ learned_patterns     │ │
│  │                  │    │ (NEW)            │    │ TABLE                │ │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘ │
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐ │
│  │ getDecision()    │───▶│ loadDecision()   │◀───│ SELECT FROM          │ │
│  │                  │    │ (REAL)           │    │ architecture_decisions│ │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components to Create/Modify

1. **New File: `decision_persistence.ts`** (estimated ~400 lines)
   - Database operations for decisions
   - Pattern persistence
   - Query helpers

2. **Modify: `learning_repository.ts`**
   - Wire `persistDecision()` to database
   - Wire `loadDecision()` to database
   - Add pattern persistence
   - Load decisions on initialization

---

## Implementation Details

### Database Operations

#### persistDecision

```typescript
async persistDecision(decision: ArchitectureDecisionRecord): Promise<void> {
  await db.insert(architectureDecisions).values({
    id: decision.id,
    appId: decision.appId,
    title: decision.title,
    description: decision.description,
    type: decision.type,
    status: decision.outcome.status,
    context: decision.context,
    alternatives: decision.alternatives,
    selectedOption: decision.selectedOption,
    rationale: decision.rationale,
    outcome: decision.outcome,
    confidence: decision.confidence,
    tags: decision.tags,
    relatedEntities: decision.relatedEntities,
    lessonsLearned: decision.outcome.lessonsLearned || [],
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
    outcomeDeterminedAt: decision.outcome.determinedAt,
  }).onConflictDoUpdate({
    target: architectureDecisions.id,
    set: { /* update fields */ },
  });
}
```

#### loadDecision

```typescript
async loadDecision(id: string): Promise<ArchitectureDecisionRecord | null> {
  const [row] = await db.select()
    .from(architectureDecisions)
    .where(eq(architectureDecisions.id, id))
    .limit(1);

  if (!row) return null;

  return mapRowToDecision(row);
}
```

#### loadDecisionsForApp

```typescript
async loadDecisionsForApp(appId: number, options?: { limit?: number }): Promise<ArchitectureDecisionRecord[]> {
  const rows = await db.select()
    .from(architectureDecisions)
    .where(eq(architectureDecisions.appId, appId))
    .orderBy(desc(architectureDecisions.createdAt))
    .limit(options?.limit || 50);

  return rows.map(mapRowToDecision);
}
```

### Pattern Persistence

```typescript
async persistPattern(pattern: LearnedPattern): Promise<void> {
  await db.insert(learnedPatterns).values({
    id: pattern.id,
    type: pattern.type,
    description: pattern.description,
    condition: pattern.condition,
    solution: pattern.solution,
    confidence: pattern.confidence,
    applicability: pattern.applicability,
    basedOnDecision: pattern.basedOnDecision,
    successCount: 1,
    failureCount: 0,
  }).onConflictDoUpdate({
    target: learnedPatterns.id,
    set: {
      confidence: pattern.confidence,
      successCount: sql`success_count + 1`,
    },
  });
}
```

### Type Mappings

```typescript
function mapRowToDecision(
  row: ArchitectureDecisionRow,
): ArchitectureDecisionRecord {
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
  };
}
```

---

## Database Schema Used

### architecture_decisions

```sql
CREATE TABLE architecture_decisions (
  id TEXT PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'pending',
  context TEXT NOT NULL,          -- JSON
  alternatives TEXT NOT NULL,      -- JSON array
  selected_option TEXT NOT NULL,
  rationale TEXT NOT NULL,
  outcome TEXT NOT NULL,           -- JSON
  confidence INTEGER NOT NULL DEFAULT 50,
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array
  related_entities TEXT NOT NULL DEFAULT '[]', -- JSON array
  lessons_learned TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  outcome_determined_at TIMESTAMP,
  created_by TEXT,
  metadata TEXT
);
```

### learned_patterns

```sql
CREATE TABLE learned_patterns (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  condition TEXT NOT NULL,
  solution TEXT NOT NULL,
  confidence REAL NOT NULL,
  applicability REAL NOT NULL,
  based_on_decision TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

---

## Success Criteria

1. ✅ `recordDecision()` persists to database
2. ✅ `getDecision()` loads from database when not in cache
3. ✅ `getDecisionsForApp()` queries database
4. ✅ Patterns are persisted on successful outcomes
5. ✅ Patterns can be loaded and used for recommendations
6. ✅ No breaking changes to existing APIs
7. ✅ All lint checks pass

---

## Estimated Effort

- Implementation: ~400 lines of code
- Testing: Manual verification via IPC calls
- Documentation: Update cycle 3 report

---

## Risk Mitigation

| Risk            | Mitigation                                 |
| --------------- | ------------------------------------------ |
| Data migration  | Schema already exists, no migration needed |
| Type mismatches | Comprehensive type mapping layer           |
| Performance     | Cache layer already implemented            |

---

_Plan created for Evolution Cycle 3_
