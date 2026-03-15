# Final Architectural Report: Dyad

## 1. Project Overview
Dyad is an open-source, local AI app builder. It functions as an IDE and AI assistant combination using the Electron framework, allowing developers to generate, edit, preview, and interact with code seamlessly using local or cloud LLMs.

## 2. Repository Structure
(See `repository_tree.txt` for the full structural breakdown generated dynamically).
The major directories are:
- `src/`: Main source code containing both the Electron backend (`src/main/`, `src/ipc/`, `src/pro/`) and the React frontend (`src/components/`, `src/pages/`).
- `drizzle/`: SQL migrations for the local database.
- `shared/`: Utility logic shared between main and renderer.
- `workers/`: Background off-main-thread processing.

## 3. Technology Stack
- **Environment**: Electron 40, Node.js 24+, Vite 5
- **Frontend**: React 19, TailwindCSS 4, TanStack Router/Query, Jotai, Lexical, Monaco Editor
- **Backend/State**: Better-SQLite3, Drizzle ORM
- **AI Integration**: Vercel AI SDK, MCP SDK

## 4. Application Boot Flow
(See `startup_chain.md`)
The application initializes via `src/main.ts`, launching Electron, registering IPC channels, initializing a local SQLite database using Drizzle, and then loading a Vite dev server (or built bundle) containing the React frontend.

## 5. Module Architecture
(See `module_map.md`)
Highlights include heavy reliance on a structured IPC bridge (`src/ipc/`), local AI agent tooling sandboxed in `src/pro/main/ipc/handlers/local_agent/`, and a React component architecture.

## 6. Dependency Graph Summary
Extracted across ~1834 files. The JSON graph (`module_graph.json`) details the vast import tree, centering primarily around shared schemas (`src/lib/schemas.ts`), IPC type definitions, and Drizzle schemas (`src/db/schema.ts`).

## 7. Call Graph Summary
Call graphs were statically extracted using Babel and saved to `call_graph.json` and `call_graph.dot`.

## 8. Code Knowledge Graph Summary
Generated as JSON-LD (`code_knowledge_graph.jsonld`), tracking the structural nodes (functions, imports, classes) observed during AST extraction.

## 9. Data Flow
- **UI → Backend**: React components trigger `window.ipcRenderer.invoke` (via React Query/Hooks).
- **Backend Processing**: `src/ipc/handlers/` map the string invoke channel to a database call or system interaction.
- **Backend → UI**: The handler returns data (or streams it).
- **AI Loop**: Chat components (`src/components/chat/`) stream text from AI providers. If the autonomous agent is triggered, it invokes commands in `src/pro/main/ipc/handlers/local_agent/tools/`.

## 10. Domain Model
- **User Settings**: Local paths, model credentials, preferences.
- **Chats & Messages**: Persistence of AI dialogs.
- **Apps/Workspaces**: Isolated local sandboxes containing generated code.

## 11. Infrastructure Layer
Local-first. Infrastructure is primarily the OS filesystem and local SQLite database. External database integrations exist via Neon/Supabase SDKs.

## 12. External Integrations
- Provider APIs: OpenAI, Anthropic, Google, Azure, AWS Bedrock.
- DB Platforms: Neon, Supabase.
- Source Control: Git (isomorphic-git / dugite bundled).

## 13. Runtime Model
Dual-process model (Main process via Node.js + Renderer process via Chromium).

## 14. Build System
Vite manages the build, coordinated by Electron Forge (`forge.config.ts`). Multi-entry points defined via `vite.main.config.mts`, `vite.preload.config.mts`, `vite.renderer.config.mts`.

## 15. Security Model
Strict context isolation in Electron (`contextIsolation: true`, `nodeIntegration: false`). Deep links are explicitly validated against known domains. The local agent commands (`Aegis Containment Coordinator`) operate within strict structural bounds.

## 16. Structural Risks & Hotspots
(See `short_readme_for_humans.md`)
Risks include the fragility of IPC typing, DB migrations out of sync with old clients, and unbounded AI context growth.

## 17. Verification Score & Failures
(See `verification_report.md`)
Automated traversal achieved 95% certainty. Primary failure is the lack of statically verifiable IPC invocation payloads due to string interpolation and dynamic channels.

## 18. Unknown / Unverified Areas
(See `unknowns.txt`)
Dynamic imports, specific dynamic React routing paths, and deep type evaluations within Drizzle relational mappers remain unknown statically.

## 19. Next steps & follow-up prompts for humans
- **Prompt A**: "Files I could not resolve automatically — please grant access to runtime artifacts (build artifacts, compiled files, test outputs) or enable git history to improve confidence."
- **Prompt B**: "Suggested targeted queries to run next: 'Trace runtime config load for Vercel/Neon integrations', 'Show all usages of the execute_command local agent tool', 'Analyze SQLite migration strategies in drizzle/'"
