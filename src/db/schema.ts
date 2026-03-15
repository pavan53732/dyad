import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { ModelMessage } from "ai";

export const AI_MESSAGES_SDK_VERSION = "ai@v6" as const;

export type AiMessagesJsonV6 = {
  messages: ModelMessage[];
  sdkVersion: typeof AI_MESSAGES_SDK_VERSION;
};

export const prompts = sqliteTable(
  "prompts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    slug: text("slug"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [unique("prompts_slug_unique").on(table.slug)],
);

export const apps = sqliteTable("apps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  githubOrg: text("github_org"),
  githubRepo: text("github_repo"),
  githubBranch: text("github_branch"),
  supabaseProjectId: text("supabase_project_id"),
  // If supabaseProjectId is a branch, then the parent project id set.
  // This is because there's no way to retrieve ALL the branches for ALL projects
  // in a single API call
  // This is only used for display purposes but is NOT used for any actual
  // supabase management logic.
  supabaseParentProjectId: text("supabase_parent_project_id"),
  // Supabase organization slug for credential lookup
  supabaseOrganizationSlug: text("supabase_organization_slug"),
  neonProjectId: text("neon_project_id"),
  neonDevelopmentBranchId: text("neon_development_branch_id"),
  neonPreviewBranchId: text("neon_preview_branch_id"),
  vercelProjectId: text("vercel_project_id"),
  vercelProjectName: text("vercel_project_name"),
  vercelTeamId: text("vercel_team_id"),
  vercelDeploymentUrl: text("vercel_deployment_url"),
  installCommand: text("install_command"),
  startCommand: text("start_command"),
  chatContext: text("chat_context", { mode: "json" }),
  isFavorite: integer("is_favorite", { mode: "boolean" })
    .notNull()
    .default(sql`0`),
  // Theme ID for design system theming (null means "no theme")
  themeId: text("theme_id"),
});

export const chats = sqliteTable("chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  title: text("title"),
  initialCommitHash: text("initial_commit_hash"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  // Context compaction fields
  compactedAt: integer("compacted_at", { mode: "timestamp" }),
  compactionBackupPath: text("compaction_backup_path"),
  pendingCompaction: integer("pending_compaction", { mode: "boolean" }),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  approvalState: text("approval_state", {
    enum: ["approved", "rejected"],
  }),
  // The commit hash of the codebase at the time the message was created
  sourceCommitHash: text("source_commit_hash"),
  // The commit hash of the codebase at the time the message was sent
  commitHash: text("commit_hash"),
  requestId: text("request_id"),
  // Max tokens used for this message (only for assistant messages)
  maxTokensUsed: integer("max_tokens_used"),
  // Model name used for this message (only for assistant messages)
  model: text("model"),
  // AI SDK messages (v5 envelope) for preserving tool calls/results in agent mode
  aiMessagesJson: text("ai_messages_json", {
    mode: "json",
  }).$type<AiMessagesJsonV6 | null>(),
  // Track if this message used the free agent quota (for non-Pro users)
  usingFreeAgentModeQuota: integer("using_free_agent_mode_quota", {
    mode: "boolean",
  }),
  // Indicates this message is a compaction summary
  isCompactionSummary: integer("is_compaction_summary", { mode: "boolean" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const versions = sqliteTable(
  "versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    commitHash: text("commit_hash").notNull(),
    neonDbTimestamp: text("neon_db_timestamp"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    // Unique constraint to prevent duplicate versions
    unique("versions_app_commit_unique").on(table.appId, table.commitHash),
  ],
);

// Define relations
export const appsRelations = relations(apps, ({ many }) => ({
  chats: many(chats),
  versions: many(versions),
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  messages: many(messages),
  app: one(apps, {
    fields: [chats.appId],
    references: [apps.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));

export const language_model_providers = sqliteTable(
  "language_model_providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    api_base_url: text("api_base_url").notNull(),
    env_var_name: text("env_var_name"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

export const language_models = sqliteTable("language_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  displayName: text("display_name").notNull(),
  apiName: text("api_name").notNull(),
  builtinProviderId: text("builtin_provider_id"),
  customProviderId: text("custom_provider_id").references(
    () => language_model_providers.id,
    {
      onDelete: "cascade",
    },
  ),
  description: text("description"),
  max_output_tokens: integer("max_output_tokens"),
  context_window: integer("context_window"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Define relations for new tables
export const languageModelProvidersRelations = relations(
  language_model_providers,
  ({ many }) => ({
    languageModels: many(language_models),
  }),
);

export const languageModelsRelations = relations(
  language_models,
  ({ one }) => ({
    provider: one(language_model_providers, {
      fields: [language_models.customProviderId],
      references: [language_model_providers.id],
    }),
  }),
);

export const versionsRelations = relations(versions, ({ one }) => ({
  app: one(apps, {
    fields: [versions.appId],
    references: [apps.id],
  }),
}));

// --- MCP (Model Context Protocol) tables ---
export const mcpServers = sqliteTable("mcp_servers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  transport: text("transport").notNull(),
  command: text("command"),
  // Store typed JSON for args and environment variables
  args: text("args", { mode: "json" }).$type<string[] | null>(),
  envJson: text("env_json", { mode: "json" }).$type<Record<
    string,
    string
  > | null>(),
  headersJson: text("headers_json", { mode: "json" }).$type<Record<
    string,
    string
  > | null>(),
  url: text("url"),
  enabled: integer("enabled", { mode: "boolean" })
    .notNull()
    .default(sql`0`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const mcpToolConsents = sqliteTable(
  "mcp_tool_consents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serverId: integer("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    consent: text("consent").notNull().default("ask"), // ask | always | denied
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [unique("uniq_mcp_consent").on(table.serverId, table.toolName)],
);

// --- Custom Themes table ---
export const customThemes = sqliteTable("custom_themes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================================
// KNOWLEDGE GRAPH TABLES
// ============================================================================

/**
 * Knowledge Graph Nodes - stores all code entities (files, functions, classes, etc.)
 */
export const knowledgeNodes = sqliteTable(
  "knowledge_nodes",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // file, function, class, interface, etc.
    name: text("name").notNull(),
    filePath: text("file_path"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    columnStart: integer("column_start"),
    columnEnd: integer("column_end"),
    language: text("language"),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    properties: text("properties", { mode: "json" }).$type<Record<string, unknown>>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    contentHash: text("content_hash"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    unique("uniq_knowledge_node_app_name_type").on(table.appId, table.name, table.type, table.filePath),
  ],
);

/**
 * Knowledge Graph Edges - stores relationships between nodes
 */
export const knowledgeEdges = sqliteTable(
  "knowledge_edges",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // imports, calls, extends, implements, etc.
    weight: integer("weight").default(1),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    unique("uniq_knowledge_edge").on(table.sourceId, table.targetId, table.type),
  ],
);

/**
 * Knowledge Graph Snapshots - for versioning and rollback
 */
export const knowledgeGraphSnapshots = sqliteTable(
  "knowledge_graph_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name"),
    snapshotType: text("snapshot_type").notNull().default("manual"),
    nodeCount: integer("node_count").notNull(),
    edgeCount: integer("edge_count").notNull(),
    graphData: text("graph_data", { mode: "json" }).$type<{
      nodes: string[];
      edges: string[];
    }>(),
    commitHash: text("commit_hash"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

// Knowledge Graph Relations
export const knowledgeNodesRelations = relations(knowledgeNodes, ({ one, many }) => ({
  app: one(apps, {
    fields: [knowledgeNodes.appId],
    references: [apps.id],
  }),
  outgoingEdges: many(knowledgeEdges, { relationName: "source" }),
  incomingEdges: many(knowledgeEdges, { relationName: "target" }),
}));

export const knowledgeEdgesRelations = relations(knowledgeEdges, ({ one }) => ({
  source: one(knowledgeNodes, {
    fields: [knowledgeEdges.sourceId],
    references: [knowledgeNodes.id],
    relationName: "source",
  }),
  target: one(knowledgeNodes, {
    fields: [knowledgeEdges.targetId],
    references: [knowledgeNodes.id],
    relationName: "target",
  }),
  app: one(apps, {
    fields: [knowledgeEdges.appId],
    references: [apps.id],
  }),
}));

// ============================================================================
// SEMANTIC MEMORY TABLES (Vector Embeddings)
// ============================================================================

/**
 * Semantic Memory - stores code embeddings for semantic search
 */
export const semanticMemory = sqliteTable(
  "semantic_memory",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(), // code_snippet, function, class, etc.
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: text("embedding").notNull(), // JSON array of floats
    embeddingModel: text("embedding_model").notNull(),
    dimensions: integer("dimensions").notNull(),
    filePath: text("file_path"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    knowledgeGraphNodeId: text("knowledge_graph_node_id"),
    importance: integer("importance").notNull().default(0.5), // 0-1 scale
    accessCount: integer("access_count").notNull().default(0),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
);

// Semantic Memory Relations
export const semanticMemoryRelations = relations(semanticMemory, ({ one }) => ({
  app: one(apps, {
    fields: [semanticMemory.appId],
    references: [apps.id],
  }),
}));

// ============================================================================
// AUTONOMOUS PLANNING ENGINE TABLES
// ============================================================================

/**
 * Plans - stores autonomous execution plans
 */
export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull().default("custom"), // development, bugfix, refactoring, deployment, testing, migration, exploration, custom
    status: text("status").notNull().default("pending"), // pending, queued, running, paused, completed, failed, cancelled
    goalIds: text("goal_ids", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    strategy: text("strategy", { mode: "json" }).$type<{
      mode: string;
      maxParallelTasks: number;
      autoRetry: boolean;
      autoRollback: boolean;
      globalTimeout?: number;
      taskTimeout?: number;
      notifications: Record<string, boolean>;
      checkpointFrequency: string;
    }>(),
    constraints: text("constraints", { mode: "json" }).$type<Array<{
      type: string;
      value: string | number | boolean;
      description?: string;
      isHard: boolean;
    }>>(),
    progress: text("progress", { mode: "json" }).$type<{
      totalGoals: number;
      completedGoals: number;
      failedGoals: number;
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      runningTasks: number;
      percentage: number;
      estimatedTimeRemaining?: number;
      lastUpdated: string;
    }>(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    createdBy: text("created_by"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
);

/**
 * Goals - stores goals within plans
 */
export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull().default("custom"), // feature, bugfix, refactor, optimize, test, documentation, deployment, maintenance, exploration, custom
    priority: text("priority").notNull().default("medium"), // critical, high, medium, low
    status: text("status").notNull().default("pending"),
    successCriteria: text("success_criteria", { mode: "json" }).$type<Array<{
      id: string;
      description: string;
      verificationType: string;
      verificationCommand?: string;
      expectedResult?: string;
      isMet: boolean;
      verifiedAt?: string;
      verificationOutput?: string;
    }>>(),
    constraints: text("constraints", { mode: "json" }),
    parentGoalId: text("parent_goal_id"),
    taskIds: text("task_ids", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    dependsOn: text("depends_on", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    estimatedComplexity: integer("estimated_complexity"),
    estimatedDuration: integer("estimated_duration"), // minutes
    actualDuration: integer("actual_duration"), // minutes
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    error: text("error"),
    createdBy: text("created_by"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
);

/**
 * Tasks - stores tasks within goals
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id").notNull(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(), // code_generation, code_modification, code_analysis, file_operation, command_execution, testing, git_operation, dependency_mgmt, api_call, user_interaction, planning, verification, rollback, notification, custom
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("pending"),
    order: integer("order").notNull().default(0),
    dependsOn: text("depends_on", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    requiredTools: text("required_tools", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    input: text("input", { mode: "json" }).notNull(), // TaskInput
    expectedOutput: text("expected_output", { mode: "json" }), // OutputSchema
    output: text("output", { mode: "json" }), // TaskOutput
    rollbackAction: text("rollback_action", { mode: "json" }), // RollbackAction
    estimatedDuration: integer("estimated_duration"), // minutes
    actualDuration: integer("actual_duration"), // minutes
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    assignedAgentId: text("assigned_agent_id"),
    attempts: text("attempts", { mode: "json" }).$type<Array<{
      attemptNumber: number;
      startedAt: string;
      endedAt?: string;
      status: string;
      error?: string;
      output?: unknown;
    }>>().notNull().default("[]"),
    error: text("error"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
);

// Planning Relations
export const plansRelations = relations(plans, ({ one, many }) => ({
  app: one(apps, {
    fields: [plans.appId],
    references: [apps.id],
  }),
  goals: many(goals),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  app: one(apps, {
    fields: [goals.appId],
    references: [apps.id],
  }),
  parentGoal: one(goals, {
    fields: [goals.parentGoalId],
    references: [goals.id],
    relationName: "subgoals",
  }),
  subgoals: many(goals, { relationName: "subgoals" }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  app: one(apps, {
    fields: [tasks.appId],
    references: [apps.id],
  }),
  goal: one(goals, {
    fields: [tasks.goalId],
    references: [goals.id],
  }),
}));

// ============================================================================
// AGENT SCHEDULER TABLES
// ============================================================================

/**
 * Schedule Entries - stores scheduled task executions
 */
export const scheduleEntries = sqliteTable(
  "schedule_entries",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    planId: text("plan_id").notNull(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("scheduled"), // scheduled, queued, running, completed, failed, cancelled, paused, retrying, timeout, skipped
    priority: text("priority").notNull().default("normal"), // critical, high, normal, low, background
    triggerType: text("trigger_type").notNull().default("immediate"), // immediate, scheduled, on_event, on_condition, on_dependency
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
    dependsOn: text("depends_on", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    requiredResources: text("required_resources", { mode: "json" }).$type<Array<{
      type: string;
      amount: number;
      hardRequirement: boolean;
      customName?: string;
    }>>(),
    timeout: integer("timeout").notNull().default(300), // seconds
    retryConfig: text("retry_config", { mode: "json" }).$type<{
      strategy: string;
      maxRetries: number;
      baseDelay: number;
      maxDelay: number;
      multiplier?: number;
      retryableErrors?: string[];
      retryOnTimeout: boolean;
    }>(),
    retryCount: integer("retry_count").notNull().default(0),
    estimatedDuration: integer("estimated_duration"), // seconds
    actualDuration: integer("actual_duration"), // seconds
    assignedAgentId: text("assigned_agent_id"),
    result: text("result", { mode: "json" }), // ScheduleResult
    error: text("error"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
);

/**
 * Schedule Queues - stores execution queues per app
 */
export const scheduleQueues = sqliteTable(
  "schedule_queues",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    maxConcurrency: integer("max_concurrency").notNull().default(4),
    runningCount: integer("running_count").notNull().default(0),
    pendingEntries: text("pending_entries", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    priorityOrder: text("priority_order", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    isPaused: integer("is_paused", { mode: "boolean" }).notNull().default(0),
    totalProcessed: integer("total_processed").notNull().default(0),
    totalSuccess: integer("total_success").notNull().default(0),
    totalFailed: integer("total_failed").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

// Schedule Relations
export const scheduleEntriesRelations = relations(scheduleEntries, ({ one }) => ({
  app: one(apps, {
    fields: [scheduleEntries.appId],
    references: [apps.id],
  }),
}));

export const scheduleQueuesRelations = relations(scheduleQueues, ({ one }) => ({
  app: one(apps, {
    fields: [scheduleQueues.appId],
    references: [apps.id],
  }),
}));

// ============================================================================
// DISTRIBUTED AGENT RUNTIME TABLES
// ============================================================================

/**
 * Distributed Agents - stores agent instances
 */
export const distributedAgents = sqliteTable(
  "distributed_agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull().default("worker"), // worker, coordinator, specialist, supervisor, monitor
    status: text("status").notNull().default("initializing"), // initializing, ready, busy, paused, error, terminated, migrating, recovering
    capabilities: text("capabilities", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    nodeId: text("node_id").notNull(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    childIds: text("child_ids", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    currentTaskId: text("current_task_id"),
    completedTasks: integer("completed_tasks").notNull().default(0),
    failedTasks: integer("failed_tasks").notNull().default(0),
    config: text("config", { mode: "json" }).$type<{
      maxConcurrentTasks: number;
      taskTimeout: number;
      heartbeatInterval: number;
      maxRetries: number;
      autoRecovery: boolean;
      enableCheckpointing: boolean;
      checkpointInterval: number;
      priority: number;
      tags: string[];
    }>(),
    resourceLimits: text("resource_limits", { mode: "json" }).$type<{
      maxMemory: number;
      maxCpuCores: number;
      maxExecutionTime: number;
      maxFileDescriptors: number;
      maxNetworkConnections: number;
    }>(),
    resourceUsage: text("resource_usage", { mode: "json" }).$type<{
      memory: number;
      cpu: number;
      fileDescriptors: number;
      networkConnections: number;
      totalExecutionTime: number;
    }>(),
    health: text("health", { mode: "json" }).$type<{
      status: string;
      score: number;
      issues: Array<{
        type: string;
        severity: string;
        description: string;
        firstSeen: string;
        lastSeen: string;
        count: number;
      }>;
      uptimePercentage: number;
    }>(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastHeartbeat: integer("last_heartbeat", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

/**
 * Distributed Nodes - stores node instances
 */
export const distributedNodes = sqliteTable(
  "distributed_nodes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("joining"), // joining, active, draining, leaving, offline, error
    address: text("address").notNull(),
    capabilities: text("capabilities", { mode: "json" }).$type<{
      agentTypes: string[];
      capabilities: string[];
      maxAgents: number;
      maxConcurrentTasks: number;
      canAcceptAgents: boolean;
      regions: string[];
    }>(),
    capacity: text("capacity", { mode: "json" }).$type<{
      cpuCores: number;
      memory: number;
      diskSpace: number;
      networkBandwidth: number;
      maxProcesses: number;
    }>(),
    usage: text("usage", { mode: "json" }).$type<{
      cpuPercent: number;
      memoryUsed: number;
      diskUsed: number;
      networkUsed: number;
      runningProcesses: number;
      activeAgents: number;
    }>(),
    metadata: text("metadata", { mode: "json" }).$type<{
      os: string;
      arch: string;
      runtimeVersion: string;
      region?: string;
      availabilityZone?: string;
      labels: Record<string, string>;
      version: string;
    }>(),
    agentIds: text("agent_ids", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastHeartbeat: integer("last_heartbeat", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

/**
 * Agent Checkpoints - stores agent checkpoint data
 */
export const agentCheckpoints = sqliteTable(
  "agent_checkpoints",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    taskId: text("task_id").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    sequence: integer("sequence").notNull(),
    size: integer("size").notNull(), // bytes
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

// Distributed Relations
export const distributedAgentsRelations = relations(distributedAgents, ({ one }) => ({
  app: one(apps, {
    fields: [distributedAgents.appId],
    references: [apps.id],
  }),
  parent: one(distributedAgents, {
    fields: [distributedAgents.parentId],
    references: [distributedAgents.id],
    relationName: "agent_hierarchy",
  }),
}));

export const agentCheckpointsRelations = relations(agentCheckpoints, ({ one }) => ({
  agent: one(distributedAgents, {
    fields: [agentCheckpoints.agentId],
    references: [distributedAgents.id],
  }),
}));

// ============================================================================
// KNOWLEDGE INTEGRATION LAYER TABLES
// ============================================================================

/**
 * Architecture Decision Records - stores architecture decisions for learning
 */
export const architectureDecisions = sqliteTable(
  "architecture_decisions",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull().default("custom"), // pattern_selection, technology_choice, structure_change, etc.
    status: text("status").notNull().default("pending"), // pending, success, partial, failure, reverted
    context: text("context", { mode: "json" }).notNull(), // DecisionContext
    alternatives: text("alternatives", { mode: "json" }).notNull().default("[]"), // DecisionAlternative[]
    selectedOption: text("selected_option").notNull(),
    rationale: text("rationale").notNull(),
    outcome: text("outcome", { mode: "json" }).notNull(), // DecisionOutcome
    confidence: integer("confidence").notNull().default(50), // 0-100 scale
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    relatedEntities: text("related_entities", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    lessonsLearned: text("lessons_learned", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    createdBy: text("created_by"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
    outcomeDeterminedAt: integer("outcome_determined_at", { mode: "timestamp" }),
  },
);

/**
 * Knowledge Queries - stores query history for learning
 */
export const knowledgeQueries = sqliteTable(
  "knowledge_queries",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    sources: text("sources", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    entityTypes: text("entity_types", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    resultCount: integer("result_count").notNull().default(0),
    relevanceScore: integer("relevance_score").notNull().default(0), // 0-100
    queryTimeMs: integer("query_time_ms").notNull().default(0),
    feedback: text("feedback"), // positive, negative, neutral
    feedbackDetails: text("feedback_details"),
    context: text("context", { mode: "json" }), // QueryContext
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

/**
 * Learned Patterns - stores patterns extracted from successful decisions
 */
export const learnedPatterns = sqliteTable(
  "learned_patterns",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // ArchitectureDecisionType
    description: text("description").notNull(),
    condition: text("condition").notNull(), // When this pattern applies
    solution: text("solution").notNull(), // Recommended approach
    confidence: integer("confidence").notNull().default(50), // 0-100
    applicability: integer("applicability").notNull().default(50), // 0-100
    basedOnDecisionId: text("based_on_decision_id")
      .references(() => architectureDecisions.id, { onDelete: "set null" }),
    usageCount: integer("usage_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default("[]"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastAppliedAt: integer("last_applied_at", { mode: "timestamp" }),
  },
);

/**
 * Knowledge Entities - unified entity cache from all sources
 */
export const knowledgeEntities = sqliteTable(
  "knowledge_entities",
  {
    id: text("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // KnowledgeEntityType
    name: text("name").notNull(),
    source: text("source").notNull(), // KnowledgeSource
    sourceId: text("source_id").notNull(), // Original ID from source
    filePath: text("file_path"),
    locationStartLine: integer("location_start_line"),
    locationEndLine: integer("location_end_line"),
    properties: text("properties", { mode: "json" }).notNull().default("{}"),
    confidence: integer("confidence").notNull().default(50), // 0-100
    accessCount: integer("access_count").notNull().default(0),
    sourceSpecific: text("source_specific", { mode: "json" }).default("{}"),
    embedding: text("embedding", { mode: "json" }).$type<number[]>(), // Optional embedding vector
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
  },
);

/**
 * Knowledge Relationships - relationships between entities
 */
export const knowledgeRelationships = sqliteTable(
  "knowledge_relationships",
  {
    id: text("id").primaryKey(),
    sourceEntityId: text("source_entity_id")
      .notNull()
      .references(() => knowledgeEntities.id, { onDelete: "cascade" }),
    targetEntityId: text("target_entity_id")
      .notNull()
      .references(() => knowledgeEntities.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // KnowledgeRelationType
    weight: integer("weight").notNull().default(50), // 0-100
    source: text("source").notNull(), // KnowledgeSource
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    unique("uniq_knowledge_relationship").on(table.sourceEntityId, table.targetEntityId, table.type),
  ],
);

// Knowledge Integration Relations
export const architectureDecisionsRelations = relations(architectureDecisions, ({ one }) => ({
  app: one(apps, {
    fields: [architectureDecisions.appId],
    references: [apps.id],
  }),
}));

export const knowledgeQueriesRelations = relations(knowledgeQueries, ({ one }) => ({
  app: one(apps, {
    fields: [knowledgeQueries.appId],
    references: [apps.id],
  }),
}));

export const learnedPatternsRelations = relations(learnedPatterns, ({ one }) => ({
  app: one(apps, {
    fields: [learnedPatterns.appId],
    references: [apps.id],
  }),
  basedOnDecision: one(architectureDecisions, {
    fields: [learnedPatterns.basedOnDecisionId],
    references: [architectureDecisions.id],
  }),
}));

export const knowledgeEntitiesRelations = relations(knowledgeEntities, ({ one, many }) => ({
  app: one(apps, {
    fields: [knowledgeEntities.appId],
    references: [apps.id],
  }),
  outgoingRelationships: many(knowledgeRelationships, { relationName: "source" }),
  incomingRelationships: many(knowledgeRelationships, { relationName: "target" }),
}));

export const knowledgeRelationshipsRelations = relations(knowledgeRelationships, ({ one }) => ({
  sourceEntity: one(knowledgeEntities, {
    fields: [knowledgeRelationships.sourceEntityId],
    references: [knowledgeEntities.id],
    relationName: "source",
  }),
  targetEntity: one(knowledgeEntities, {
    fields: [knowledgeRelationships.targetEntityId],
    references: [knowledgeEntities.id],
    relationName: "target",
  }),
}));
