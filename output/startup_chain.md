# Application Boot Flow (Startup Chain)

1. **Electron Main Process Entry** (`src/main.ts`)
   - `dotenv.config()` loads environment variables (`src/main.ts:32`).
   - `registerIpcHandlers()` registers communication channels before app ready (`src/main.ts:35`).
   - Resolves local git directory path (`src/main.ts:43`).
   - `app.whenReady().then(onReady)` waits for Electron readiness (`src/main.ts:303`).

2. **Initialization Sequence** (`src/main.ts -> onReady`)
   - `BackupManager.initialize()` starts the backup routine (`src/main.ts:71`).
   - `initializeDatabase()` prepares the Drizzle local SQLite DB (`src/main.ts:75`).
   - Runs database cleanup routines for `ai_messages_json` and old media (`src/main.ts:78-81`).
   - Settings are read, handles force-close recovery (`src/main.ts:94`).
   - `startPerformanceMonitoring()` starts internal telemetry (`src/main.ts:108`).
   - Custom `dyad-media://` protocol handler is registered to serve secure media blobs (`src/main.ts:111`).
   
3. **Window Creation** (`src/main.ts -> createWindow`)
   - Initializes a new `BrowserWindow` (`src/main.ts:182`).
   - Attaches preload script `preload.js` (`src/main.ts:197`).
   - Loads Vite dev server URL (in dev) or local `index.html` (in prod) (`src/main.ts:205`).

4. **Renderer / Frontend Initialization** (`src/renderer.tsx`)
   - Imports global styles (`src/styles/globals.css`).
   - Initializes React root and injects TanStack Router (`src/router.ts`).
   - Sets up Jotai providers, React Query client.
   - Bootstraps i18n (`src/i18n/index.ts`).
   - Renders application shell (`src/routes/root.tsx`).

5. **Deep Linking and URL Handling**
   - Handles `dyad://` schemes like `supabase-oauth-return`, `add-mcp-server` via the app singleton instance (`src/main.ts:320-410`).