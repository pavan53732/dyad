# Unlimited Context Memory Architecture Design

## Executive Summary

This document outlines a comprehensive solution to eliminate context window limitations in the Dyad AI application, ensuring the AI never forgets important information while efficiently managing token budgets.

---

## Problem Analysis

### Current Issues

1. **"Context Running Out" Bug**
   - Banner shows prematurely (after just "hi")
   - Root cause: `actualMaxTokens` from last AI response includes massive system context
   - Thresholds: 200k tokens for "long context" warning, 40k remaining for "running out"

2. **Token Consumers**
   | Component | Approximate Tokens | Growth |
   |-----------|-------------------|--------|
   | System Prompt | ~2,500 | Fixed |
   | AI Rules | ~625 | Fixed |
   | Tool Definitions (350+ tools) | ~15,000-25,000 | Fixed but large |
   | Codebase Context | 50,000-150,000+ | Variable |
   | Message History | Accumulating | Linear |
   | Supabase Context | 5,000-50,000 | Variable |
   | Tool Results | Variable | Per-turn |

3. **Memory Loss Points**
   - Compaction truncates tool results to 1000 chars
   - Pre-compaction messages removed from LLM context
   - No semantic retrieval of old context
   - Cross-session memory not integrated with context

---

## Solution Architecture: Multi-Tier Context Memory

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNLIMITED CONTEXT MEMORY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    L1: ACTIVE CONTEXT (In-Context)                   │   │
│  │                    Capacity: Context Window Size                     │   │
│  │                    Contents: Current turn + recent messages          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↑↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              L2: SEMANTIC RETRIEVAL CACHE (Vector Store)             │   │
│  │                    Capacity: Unlimited (disk-based)                  │   │
│  │                    Contents: Embeddings of all context               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↑↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              L3: LONG-TERM MEMORY (Knowledge Systems)                │   │
│  │                    Capacity: Unlimited (file-based)                  │   │
│  │                    Contents: Knowledge base, patterns, learnings     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↑↓                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              L4: ARCHIVAL STORAGE (Database + Files)                 │   │
│  │                    Capacity: Unlimited (SQLite + files)              │   │
│  │                    Contents: Full message history, backups           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Fix the Immediate Bug (Priority: Critical)

**Issue:** Context limit banner showing for simple "hi" messages

**Root Cause Analysis:**

1. The banner uses `actualMaxTokens` from last assistant message
2. This includes system prompt + codebase context + tool definitions
3. Even in a "new" chat, previous messages may have high token counts

**Fix:**

1. Add a "fresh chat" check - don't show banner for new chats with < 3 messages
2. Calculate tokens properly using tiktoken instead of 4-char approximation
3. Add "context age" factor - don't warn for context that was just built

### Phase 2: Intelligent Context Prioritization

**Implementation:**

1. **Context Scoring System**
   - Relevance score (semantic similarity to current query)
   - Recency score (timestamp-based decay)
   - Importance score (user-marked, contains decisions, errors, etc.)
   - Reference score (how often this context is referenced)

2. **Priority-Based Context Building**
   - Always include: System prompt, current message, active todos
   - High priority: Recent messages, active plan, current file context
   - Medium priority: Earlier messages, related code files
   - Low priority: Old messages, unrelated files

### Phase 3: Semantic Retrieval System

**Implementation:**

1. **Local Vector Store**
   - Use `vectra` or `sqlite-vss` for local vector storage
   - Embed all messages, code files, and tool results
   - Retrieve relevant context based on query embedding

2. **Embedding Strategy**
   - Use small, fast embedding model (e.g., all-MiniLM-L6-v2 via ONNX)
   - Chunk large documents into 500-token segments
   - Store embeddings with metadata (source, timestamp, type)

3. **Retrieval Pipeline**
   - Query embedding → similarity search → top-k retrieval
   - Hybrid search: keyword + semantic
   - Context injection: retrieved items added to context with relevance markers

### Phase 4: Hierarchical Memory Summarization

**Implementation:**

1. **Multi-Level Summarization**
   - Level 0: Raw messages (last N turns)
   - Level 1: Turn summaries (each conversation turn)
   - Level 2: Session summaries (every 10 turns)
   - Level 3: Project summaries (daily/weekly)

2. **Summarization Triggers**
   - On compaction (existing)
   - On session end (automatic)
   - On context threshold (proactive)

3. **Summary Retrieval**
   - Summaries stored in vector store
   - Retrieved when relevant to current query
   - Can "drill down" from summary to details

### Phase 5: Cross-Session Memory Integration

**Implementation:**

1. **Persistent Memory Store**
   - Enhance existing `.dyad/memory.json` with semantic search
   - Add embedding-based retrieval
   - Support memory expiration and importance decay

2. **Knowledge Base Integration**
   - Auto-populate from successful patterns
   - Link memories to knowledge entries
   - Support knowledge queries in context building

3. **Learning Integration**
   - Track what context was useful
   - Learn retrieval preferences
   - Adapt to user patterns

---

## Technical Implementation Details

### 1. Fix Context Limit Banner

**File:** `src/components/chat/ContextLimitBanner.tsx`

**Changes:**

```typescript
// Add minimum message threshold
const MIN_MESSAGES_FOR_WARNING = 3;

// Add context age check
const CONTEXT_AGE_THRESHOLD_MS = 60_000; // 1 minute

export function shouldShowContextLimitBanner({
  totalTokens,
  contextWindow,
  messageCount,
  contextBuiltAt,
}: ContextLimitBannerProps): boolean {
  if (!totalTokens || !contextWindow) {
    return false;
  }

  // Don't show for new chats with few messages
  if (messageCount < MIN_MESSAGES_FOR_WARNING) {
    return false;
  }

  // Don't show if context was just built (within 1 minute)
  if (
    contextBuiltAt &&
    Date.now() - contextBuiltAt < CONTEXT_AGE_THRESHOLD_MS
  ) {
    return false;
  }

  // Show if long context (costs extra)
  if (totalTokens > LONG_CONTEXT_THRESHOLD) {
    return true;
  }

  // Show if close to context limit
  const tokensRemaining = contextWindow - totalTokens;
  return tokensRemaining <= CONTEXT_LIMIT_THRESHOLD;
}
```

### 2. Implement Local Vector Store

**New Files:**

- `src/lib/vector_store.ts` - Vector store implementation
- `src/lib/embeddings.ts` - Embedding generation
- `src/lib/context_retrieval.ts` - Context retrieval pipeline

**Dependencies:**

- `vectra` or `sqlite-vss` for vector storage
- `@xenova/transformers` for local embeddings (ONNX runtime)

### 3. Enhanced Context Builder

**File:** `src/ipc/utils/context_builder.ts` (new)

**Functionality:**

- Build context with priority scoring
- Retrieve from vector store
- Compress and format for LLM

### 4. Memory Integration

**Enhanced Files:**

- `src/pro/main/ipc/handlers/local_agent/tools/memory_store.ts`
- `src/pro/main/ipc/handlers/local_agent/tools/knowledge_base.ts`

**New Capabilities:**

- Automatic embedding on store
- Semantic search support
- Cross-reference retrieval

---

## Configuration Options

### New Settings

```typescript
interface ContextMemorySettings {
  // Context limit banner
  showContextWarning: boolean;
  contextWarningThreshold: number; // tokens remaining

  // Vector store
  enableVectorStore: boolean;
  embeddingModel: string;
  vectorStorePath: string;

  // Retrieval
  maxRetrievedItems: number;
  retrievalThreshold: number; // similarity score

  // Summarization
  autoSummarize: boolean;
  summarizationThreshold: number; // turns

  // Memory
  memoryExpirationDays: number;
  maxMemorySize: number; // entries
}
```

---

## Migration Plan

### Step 1: Deploy Banner Fix

- Update `ContextLimitBanner.tsx`
- Update `useCountTokens.ts` to include message count
- Test with various scenarios

### Step 2: Add Vector Store

- Install dependencies
- Create vector store module
- Integrate with context builder

### Step 3: Enable Semantic Retrieval

- Create embedding pipeline
- Update context retrieval
- Add to agent tools

### Step 4: Integrate Memory Systems

- Connect memory store to vector store
- Enable semantic memory retrieval
- Add memory to context building

### Step 5: Enable Hierarchical Summarization

- Update compaction system
- Add summary levels
- Enable summary retrieval

---

## Expected Outcomes

### Immediate (Phase 1)

- No more false "context running out" warnings
- Accurate token counting

### Short-term (Phases 2-3)

- 50-70% reduction in context usage for large conversations
- Semantic retrieval of relevant context
- No more "forgotten" important information

### Long-term (Phases 4-5)

- Unlimited conversation length
- Cross-session memory persistence
- Self-improving context management

---

## Monitoring & Metrics

### Key Metrics

- Context utilization rate
- Retrieval relevance scores
- Memory hit rate
- User satisfaction (feedback)

### Logging

- Context decisions logged
- Retrieval queries logged
- Memory access patterns

---

## Conclusion

This architecture transforms Dyad from a context-limited system to one with effectively unlimited memory, ensuring the AI never forgets important information while maintaining efficient token usage.
