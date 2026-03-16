import { registerAppHandlers } from "./handlers/app_handlers";
import { registerChatHandlers } from "./handlers/chat_handlers";
import { registerChatStreamHandlers } from "./handlers/chat_stream_handlers";
import { registerSettingsHandlers } from "./handlers/settings_handlers";
import { registerShellHandlers } from "./handlers/shell_handler";
import { registerDependencyHandlers } from "./handlers/dependency_handlers";
import { registerGithubHandlers } from "./handlers/github_handlers";
import { registerGithubBranchHandlers } from "./handlers/git_branch_handlers";
import { registerVercelHandlers } from "./handlers/vercel_handlers";
import { registerNodeHandlers } from "./handlers/node_handlers";
import { registerProposalHandlers } from "./handlers/proposal_handlers";
import { registerDebugHandlers } from "./handlers/debug_handlers";
import { registerSupabaseHandlers } from "./handlers/supabase_handlers";
import { registerNeonHandlers } from "./handlers/neon_handlers";
import { registerLocalModelHandlers } from "./handlers/local_model_handlers";
import { registerTokenCountHandlers } from "./handlers/token_count_handlers";
import { registerWindowHandlers } from "./handlers/window_handlers";
import { registerUploadHandlers } from "./handlers/upload_handlers";
import { registerVersionHandlers } from "./handlers/version_handlers";
import { registerLanguageModelHandlers } from "./handlers/language_model_handlers";
import { registerReleaseNoteHandlers } from "./handlers/release_note_handlers";
import { registerImportHandlers } from "./handlers/import_handlers";
import { registerSessionHandlers } from "./handlers/session_handlers";
import { registerProHandlers } from "./handlers/pro_handlers";
import { registerContextPathsHandlers } from "./handlers/context_paths_handlers";
import { registerAppUpgradeHandlers } from "./handlers/app_upgrade_handlers";
import { registerCapacitorHandlers } from "./handlers/capacitor_handlers";
import { registerProblemsHandlers } from "./handlers/problems_handlers";
import { registerAppEnvVarsHandlers } from "./handlers/app_env_vars_handlers";
import { registerTemplateHandlers } from "./handlers/template_handlers";
import { registerThemesHandlers } from "../pro/main/ipc/handlers/themes_handlers";
import { registerPortalHandlers } from "./handlers/portal_handlers";
import { registerPromptHandlers } from "./handlers/prompt_handlers";
import { registerHelpBotHandlers } from "./handlers/help_bot_handlers";
import { registerMcpHandlers } from "./handlers/mcp_handlers";
import { registerSecurityHandlers } from "./handlers/security_handlers";
import { registerVisualEditingHandlers } from "../pro/main/ipc/handlers/visual_editing_handlers";
import { registerAgentToolHandlers } from "../pro/main/ipc/handlers/local_agent/agent_tool_handlers";
import { registerFreeAgentQuotaHandlers } from "./handlers/free_agent_quota_handlers";
import { registerPlanHandlers } from "./handlers/plan_handlers";
import { registerAiSuggestionsHandlers } from "./handlers/ai_suggestions_handler";

// ============================================================================
// AUTONOMOUS SYSTEMS INTEGRATION (Phase 1-5 + Evolution Cycles 1-3)
// These handlers connect the Knowledge Integration Layer, Planning Engine,
// Agent Scheduler, Distributed Runtime, and Knowledge Graph to the IPC bus.
// ============================================================================

import { initKnowledgeIntegrationIpcHandlers } from "../pro/main/knowledge_integration";
import { initPlannerIpcHandlers } from "../pro/main/planner";
import { initSchedulerIpcHandlers } from "../pro/main/scheduler";
import { initDistributedIpcHandlers } from "../pro/main/distributed";
import { registerKnowledgeGraphHandlers } from "../pro/main/knowledge_graph/ipc_handlers";

export function registerIpcHandlers() {
  // Register all IPC handlers by category
  registerAppHandlers();
  registerChatHandlers();
  registerChatStreamHandlers();
  registerSettingsHandlers();
  registerShellHandlers();
  registerDependencyHandlers();
  registerGithubHandlers();
  registerGithubBranchHandlers();
  registerVercelHandlers();
  registerNodeHandlers();
  registerProblemsHandlers();
  registerProposalHandlers();
  registerDebugHandlers();
  registerSupabaseHandlers();
  registerNeonHandlers();
  registerLocalModelHandlers();
  registerTokenCountHandlers();
  registerWindowHandlers();
  registerUploadHandlers();
  registerVersionHandlers();
  registerLanguageModelHandlers();
  registerReleaseNoteHandlers();
  registerImportHandlers();
  registerSessionHandlers();
  registerProHandlers();
  registerContextPathsHandlers();
  registerAppUpgradeHandlers();
  registerCapacitorHandlers();
  registerAppEnvVarsHandlers();
  registerTemplateHandlers();
  registerThemesHandlers();
  registerPortalHandlers();
  registerPromptHandlers();
  registerHelpBotHandlers();
  registerMcpHandlers();
  registerSecurityHandlers();
  registerVisualEditingHandlers();
  registerAgentToolHandlers();
  registerFreeAgentQuotaHandlers();
  registerPlanHandlers();
  registerAiSuggestionsHandlers();

  // ============================================================================
  // AUTONOMOUS SYSTEMS REGISTRATION (Runtime Integration Phase)
  // These calls connect the isolated autonomous subsystems to the IPC bus,
  // making them reachable from the renderer process and agent runtime.
  // ============================================================================

  // Knowledge Integration Layer (KIL) - Unified knowledge queries
  initKnowledgeIntegrationIpcHandlers();

  // Planning Engine - Task decomposition and execution planning
  initPlannerIpcHandlers();

  // Agent Scheduler - Priority-based task execution
  initSchedulerIpcHandlers();

  // Distributed Runtime - Multi-agent coordination
  initDistributedIpcHandlers();

  // Knowledge Graph - Code entity relationships
  registerKnowledgeGraphHandlers();
}
