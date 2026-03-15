# Local Agent Tool Definitions

Agent tool definitions live in `src/pro/main/ipc/handlers/local_agent/tools/`. Each tool has a `ToolDefinition` with optional flags.

## Read-only / plan-only mode

- **`modifiesState: true`** must be set on any tool that writes to disk or modifies external state (files, database, etc.). This flag controls whether the tool is available in read-only (ask) mode and plan-only mode — see `buildAgentToolSet` in `tool_definitions.ts`.
- Similarly, code in the `handleLocalAgentStream` handler that writes to the workspace (e.g., `ensureDyadGitignored`, injecting synthetic todo reminders) should be guarded with `if (!readOnly && !planModeOnly)` checks. Injecting instructions that reference state-changing tools into non-writable runs will confuse the model since those tools are filtered out.

## Async I/O

- Use `fs.promises` (not sync `fs` methods) in any code running on the Electron main process (e.g., `todo_persistence.ts`) to avoid blocking the event loop.

## Unlimited Context Memory Tool

The `unlimited_context_memory` tool provides persistent memory that survives across sessions and context limits.

### Actions

| Action | Description | modifiesState |
|--------|-------------|---------------|
| `remember` | Store content in long-term memory | Yes |
| `recall` | Retrieve relevant memories using semantic search | No |
| `build_context` | Build optimized context for a query | No |
| `get_stats` | Get memory statistics | No |
| `cleanup` | Remove old memories | Yes |
| `forget` | Remove specific memories by query | Yes |

### Memory Types

- **decision** - Important decisions and their rationale (importance: 1.0)
- **error** - Errors encountered and their resolutions (importance: 0.9)
- **learning** - Patterns and learnings discovered (importance: 0.7)
- **message** - Conversation messages (importance: 0.6)
- **code** - Code snippets and patterns (importance: 0.6)
- **summary** - Summarized content (importance: 0.4)

### Files

- `src/lib/unlimited_context_memory.ts` - Core memory system implementation
- `src/pro/main/ipc/handlers/local_agent/tools/unlimited_context_memory.ts` - Tool definition
- `docs/UNLIMITED_CONTEXT_MEMORY_DESIGN.md` - Full architecture documentation

### Usage Example

```typescript
// Remember a decision
{
  action: "remember",
  content: "Use SQLite for local storage instead of IndexedDB",
  type: "decision",
  importance: 1.0,
  tags: ["architecture", "storage"]
}

// Recall relevant memories
{
  action: "recall",
  query: "database storage decisions",
  limit: 5,
  types: ["decision", "learning"]
}
```
