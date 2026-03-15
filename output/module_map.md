# Module Architecture Map

### Backend (Electron Main Process)
- **`src/main.ts` & `src/main/`**: Core Electron bootstrapping, window management, and native system integration.
- **`src/ipc/`**: Central nervous system bridging React and Electron. Contains type definitions (`src/ipc/types/`), handlers (`src/ipc/handlers/`), and utilities (`src/ipc/utils/`).
- **`src/db/`**: Local persistence layer using Drizzle ORM and Better-SQLite3. Contains schemas (`src/db/schema.ts`) and migrations.
- **`src/pro/main/`**: Specialized backend logic for Dyad Pro features, such as the local AI agent handler, AST-based search/replace operations, and complex multi-file manipulation logic.

### Frontend (React Renderer)
- **`src/components/`**: Broadest collection of reusable React UI components. Heavily relies on Tailwind CSS and base-ui/shadcn primitives (`src/components/ui/`). Includes specific sub-domains like `/chat/` for the conversation interface and `/preview_panel/` for application preview views.
- **`src/pages/` & `src/routes/`**: Page-level components managed by TanStack React Router, including `/chat`, `/home`, `/hub`, and `/settings`.
- **`src/hooks/`**: Custom React hooks encompassing data fetching (via React Query), IPC communication, global state access (via Jotai), and workspace logic.
- **`src/atoms/` & `src/store/`**: Global state definitions using Jotai (e.g., `appAtoms.ts`, `chatAtoms.ts`).
- **`src/lib/`**: Frontend utilities, constant definitions, schemas, and toast notifications.

### Pro & Agent Features
- **`src/pro/`**: Core intelligence and advanced editing features. Contains autonomous agent tool definitions (`src/pro/main/ipc/handlers/local_agent/tools/`), visual editing parsers, and prompt templates.
- **`src/prompts/`**: Stores system prompts and templates for LLM communication (e.g., `local_agent_prompt.ts`, `system_prompt.ts`).
- **`workers/`**: Background worker processes, primarily containing TypeScript compiler workers (`workers/tsc/`) for off-main-thread syntax checking and build validation.

### Shared
- **`shared/`**: Contains code used by both the main process, workers, and renderer, such as virtual filesystem structures and path normalization utils.
