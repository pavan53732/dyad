# Short Readme (Architectural Overview)

**Dyad** is an open-source, local AI app builder built on a modern Electron/React stack.

### Top 5 Structural Risks & Hotspots
1. **IPC Complexity**: The system relies heavily on Electron's IPC mechanism (in `src/ipc/`) for everything from database calls to local agent execution. Mismatches in IPC contracts between the frontend renderer and backend main process are highly prone to breaking features.
2. **Local Agent Sandbox (`src/pro/main/ipc/handlers/local_agent/`)**: Modifying the autonomous agent's capabilities directly affects how code generation behaves on user machines. The system's "Aegis Containment Coordinator" and local command execution capabilities represent high-value security domains. Avoid unvetted system-level modifications.
3. **Database Migrations (`drizzle/` and `src/db/`)**: Because this uses a local SQLite database (`better-sqlite3`), schema changes require extremely careful migrations (`drizzle-kit`). Dropping or incorrectly mutating tables will permanently corrupt local user workspaces.
4. **Context Window & Token Counting**: The codebase introduces multiple AI model providers (@ai-sdk/*) and integrates token management (`src/hooks/useCountTokens.ts`, `src/lib/unlimited_context_memory.ts`). The cost structures and context truncation logic dictate the app's stability when handling massive text streams.
5. **State Management Synchronization**: The frontend uses a complex mix of React Query (for async external/db data) and Jotai atoms (for local state like `appAtoms.ts`, `chatAtoms.ts`). Inconsistent mutation in one side can lead to the preview panel or chat interface de-syncing.

### Immediate Hotspots to Inspect Before Coding
- **`src/main.ts`**: To understand how the entire native app spins up and what privileges it requests.
- **`src/ipc/handlers/`**: Whenever you need to expose new native functionality or node APIs to the frontend.
- **`src/pro/main/ipc/handlers/local_agent/tools/`**: To inspect the custom tools (e.g. `write_file`, `grep`, `execute_command`) that the autonomous agent can invoke inside the builder.
- **`src/db/schema.ts`**: The single source of truth for all structured local data storage.