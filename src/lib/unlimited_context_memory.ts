/**
 * Unlimited Context Memory System
 * 
 * A multi-tier memory architecture that provides effectively unlimited context
 * by combining in-context memory with semantic retrieval from long-term storage.
 * 
 * Architecture:
 * - L1: Active Context (current conversation, in LLM context window)
 * - L2: Semantic Retrieval Cache (vector store for quick retrieval)
 * - L3: Long-term Memory (knowledge base, learned patterns)
 * - L4: Archival Storage (full conversation history)
 */

import * as fs from "fs";
import * as path from "path";
import log from "electron-log";

const logger = log.scope("unlimited-context-memory");

// ============================================================================
// Types
// ============================================================================

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: "message" | "code" | "decision" | "error" | "learning" | "summary";
    timestamp: number;
    importance: number; // 0-1 score
    accessCount: number;
    lastAccessed: number;
    source: string; // chat ID, file path, etc.
    tags: string[];
  };
}

export interface RetrievalResult {
  entry: MemoryEntry;
  score: number;
  highlights?: string[];
}

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  reservedTokens: number;
  availableTokens: number;
}

export interface ContextPriority {
  type: string;
  priority: number; // 0-1, higher = more important
  maxTokens?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const MEMORY_CONFIG = {
  // Storage paths
  memoryDir: ".dyad/memory",
  vectorStoreFile: "vector_store.json",
  indexFile: "index.json",

  // Token budgets
  defaultContextWindow: 128_000,
  systemPromptReserve: 20_000,
  toolDefinitionsReserve: 25_000,
  codebaseReserve: 50_000,
  messageHistoryBudget: 0.5, // 50% of remaining after reserves

  // Retrieval settings
  maxRetrievedItems: 10,
  minRelevanceScore: 0.3,
  recencyWeight: 0.2,
  importanceWeight: 0.3,
  relevanceWeight: 0.5,

  // Memory limits
  maxEntries: 100_000,
  maxEntryAge: 365 * 24 * 60 * 60 * 1000, // 1 year in ms
  cleanupInterval: 24 * 60 * 60 * 1000, // 1 day in ms

  // Embedding dimensions (for similarity calculation)
  embeddingDimensions: 384, // Small, fast embeddings

  // Priority weights for different content types
  priorities: {
    decision: 1.0,
    error: 0.9,
    current_task: 0.95,
    active_plan: 0.9,
    message: 0.7,
    code: 0.6,
    learning: 0.5,
    summary: 0.4,
  } as Record<string, number>,
};

// ============================================================================
// Vector Store Implementation
// ============================================================================

/**
 * Simple vector store using cosine similarity
 * For production, consider using sqlite-vss or a dedicated vector DB
 */
class VectorStore {
  private entries: Map<string, MemoryEntry> = new Map();
  private indexPath: string | null = null;
  private isDirty = false;

  constructor() {}

  async initialize(storePath: string): Promise<void> {
    this.indexPath = storePath;
    await this.load();
  }

  private async load(): Promise<void> {
    if (!this.indexPath || !fs.existsSync(this.indexPath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
      if (data.entries && Array.isArray(data.entries)) {
        this.entries = new Map(data.entries.map((e: MemoryEntry) => [e.id, e]));
      }
      logger.info(`Loaded ${this.entries.size} memory entries`);
    } catch (error) {
      logger.error("Failed to load vector store:", error);
    }
  }

  async save(): Promise<void> {
    if (!this.indexPath || !this.isDirty) return;

    try {
      const data = {
        version: 1,
        lastUpdated: Date.now(),
        entries: Array.from(this.entries.values()),
      };
      fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2));
      this.isDirty = false;
      logger.debug(`Saved ${this.entries.size} memory entries`);
    } catch (error) {
      logger.error("Failed to save vector store:", error);
    }
  }

  async add(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    this.isDirty = true;
  }

  async addMany(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
    this.isDirty = true;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    return this.entries.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.entries.delete(id);
    if (result) this.isDirty = true;
    return result;
  }

  async search(
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      types?: string[];
      tags?: string[];
    } = {}
  ): Promise<RetrievalResult[]> {
    const {
      limit = MEMORY_CONFIG.maxRetrievedItems,
      minScore = MEMORY_CONFIG.minRelevanceScore,
      types,
      tags,
    } = options;

    const queryEmbedding = this.generateSimpleEmbedding(query);
    const results: RetrievalResult[] = [];

    for (const entry of this.entries.values()) {
      // Filter by type
      if (types && !types.includes(entry.metadata.type)) continue;

      // Filter by tags
      if (tags && !tags.some((t) => entry.metadata.tags.includes(t))) continue;

      // Calculate relevance score
      let score = 0;

      // Semantic similarity (if embedding exists)
      if (entry.embedding) {
        score += MEMORY_CONFIG.relevanceWeight * this.cosineSimilarity(queryEmbedding, entry.embedding);
      } else {
        // Fallback to keyword matching
        score += MEMORY_CONFIG.relevanceWeight * this.keywordMatch(query, entry.content);
      }

      // Importance boost
      score += MEMORY_CONFIG.importanceWeight * entry.metadata.importance;

      // Recency boost (exponential decay)
      const age = Date.now() - entry.metadata.timestamp;
      const recencyScore = Math.exp(-age / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life
      score += MEMORY_CONFIG.recencyWeight * recencyScore;

      if (score >= minScore) {
        results.push({ entry, score });
      }
    }

    // Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async getStats(): Promise<{
    totalEntries: number;
    byType: Record<string, number>;
    oldestEntry: number | null;
    newestEntry: number | null;
    totalSize: number;
  }> {
    const byType: Record<string, number> = {};
    let oldest: number | null = null;
    let newest: number | null = null;
    let totalSize = 0;

    for (const entry of this.entries.values()) {
      byType[entry.metadata.type] = (byType[entry.metadata.type] || 0) + 1;
      if (oldest === null || entry.metadata.timestamp < oldest) {
        oldest = entry.metadata.timestamp;
      }
      if (newest === null || entry.metadata.timestamp > newest) {
        newest = entry.metadata.timestamp;
      }
      totalSize += entry.content.length;
    }

    return {
      totalEntries: this.entries.size,
      byType,
      oldestEntry: oldest,
      newestEntry: newest,
      totalSize,
    };
  }

  /**
   * Generate a simple embedding using character n-grams
   * For production, use a proper embedding model (e.g., via ONNX)
   */
  private generateSimpleEmbedding(text: string): number[] {
    const embedding = Array.from({ length: MEMORY_CONFIG.embeddingDimensions }, () => 0);
    const normalized = text.toLowerCase().trim();

    // Use trigram hashing
    for (let i = 0; i < normalized.length - 2; i++) {
      const trigram = normalized.slice(i, i + 3);
      const hash = this.hashString(trigram);
      const index = Math.abs(hash) % MEMORY_CONFIG.embeddingDimensions;
      embedding[index] += 1;
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private keywordMatch(query: string, content: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(content.toLowerCase().split(/\s+/));

    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) matches++;
    }

    return queryWords.size > 0 ? matches / queryWords.size : 0;
  }

  async cleanup(maxAge: number = MEMORY_CONFIG.maxEntryAge): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.entries) {
      if (now - entry.metadata.timestamp > maxAge) {
        this.entries.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.isDirty = true;
      logger.info(`Cleaned up ${removed} old memory entries`);
    }

    return removed;
  }
}

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Builds optimized context for the LLM using semantic retrieval
 */
class ContextBuilder {
  private vectorStore: VectorStore;
  private budget: ContextBudget;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
    this.budget = {
      maxTokens: MEMORY_CONFIG.defaultContextWindow,
      usedTokens: 0,
      reservedTokens: 0,
      availableTokens: MEMORY_CONFIG.defaultContextWindow,
    };
  }

  setContextWindow(windowSize: number): void {
    this.budget.maxTokens = windowSize;
    this.recalculateBudget();
  }

  private recalculateBudget(): void {
    this.budget.reservedTokens =
      MEMORY_CONFIG.systemPromptReserve +
      MEMORY_CONFIG.toolDefinitionsReserve +
      MEMORY_CONFIG.codebaseReserve;

    this.budget.availableTokens =
      this.budget.maxTokens - this.budget.reservedTokens - this.budget.usedTokens;
  }

  /**
   * Build context for a query, retrieving relevant memories
   */
  async buildContext(
    query: string,
    options: {
      currentMessages?: Array<{ role: string; content: string }>;
      currentPlan?: string;
      activeTodos?: string[];
      maxTokens?: number;
    } = {}
  ): Promise<{
    context: string;
    retrievedMemories: RetrievalResult[];
    tokenCount: number;
    budget: ContextBudget;
  }> {
    const { currentMessages = [], currentPlan, activeTodos = [], maxTokens } = options;

    if (maxTokens) {
      this.setContextWindow(maxTokens);
    }

    const contextParts: string[] = [];
    let tokenCount = 0;

    // 1. Always include active plan (if exists)
    if (currentPlan) {
      const planContext = `<active-plan>\n${currentPlan}\n</active-plan>`;
      contextParts.push(planContext);
      tokenCount += this.estimateTokens(planContext);
    }

    // 2. Always include active todos (if exist)
    if (activeTodos.length > 0) {
      const todosContext = `<active-todos>\n${activeTodos.map((t) => `- ${t}`).join("\n")}\n</active-todos>`;
      contextParts.push(todosContext);
      tokenCount += this.estimateTokens(todosContext);
    }

    // 3. Retrieve relevant memories from vector store
    const messageBudget = this.budget.availableTokens * MEMORY_CONFIG.messageHistoryBudget;
    const retrievalBudget = messageBudget * 0.3; // 30% for retrieved memories

    const retrievedMemories = await this.vectorStore.search(query, {
      limit: MEMORY_CONFIG.maxRetrievedItems,
      minScore: MEMORY_CONFIG.minRelevanceScore,
    });

    // Filter memories to fit budget
    const memoryContext: string[] = [];
    let memoryTokens = 0;

    for (const result of retrievedMemories) {
      const memoryText = this.formatMemoryForContext(result.entry);
      const tokens = this.estimateTokens(memoryText);

      if (memoryTokens + tokens <= retrievalBudget) {
        memoryContext.push(memoryText);
        memoryTokens += tokens;
      }
    }

    if (memoryContext.length > 0) {
      contextParts.push(`<relevant-context>\n${memoryContext.join("\n\n")}\n</relevant-context>`);
      tokenCount += memoryTokens;
    }

    // 4. Add recent messages (within budget)
    const messageContext: string[] = [];
    let messageTokens = 0;
    const remainingBudget = messageBudget - memoryTokens;

    // Add messages from most recent, backwards
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      const msgText = `<${msg.role}>\n${msg.content}\n</${msg.role}>`;
      const tokens = this.estimateTokens(msgText);

      if (messageTokens + tokens <= remainingBudget) {
        messageContext.unshift(msgText);
        messageTokens += tokens;
      } else {
        break;
      }
    }

    if (messageContext.length > 0) {
      contextParts.push(`<conversation>\n${messageContext.join("\n")}\n</conversation>`);
      tokenCount += messageTokens;
    }

    this.budget.usedTokens = tokenCount;
    this.recalculateBudget();

    return {
      context: contextParts.join("\n\n"),
      retrievedMemories,
      tokenCount,
      budget: this.budget,
    };
  }

  private formatMemoryForContext(entry: MemoryEntry): string {
    const timestamp = new Date(entry.metadata.timestamp).toISOString();
    return `[${entry.metadata.type.toUpperCase()}] (${timestamp})\n${entry.content}`;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// Memory Manager
// ============================================================================

/**
 * Main class for managing unlimited context memory
 */
export class UnlimitedContextMemory {
  private vectorStore: VectorStore;
  private contextBuilder: ContextBuilder;
  private appPath: string;
  private initialized = false;

  constructor(appPath: string) {
    this.appPath = appPath;
    this.vectorStore = new VectorStore();
    this.contextBuilder = new ContextBuilder(this.vectorStore);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const memoryDir = path.join(this.appPath, MEMORY_CONFIG.memoryDir);

    // Ensure memory directory exists
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // Initialize vector store
    const storePath = path.join(memoryDir, MEMORY_CONFIG.vectorStoreFile);
    await this.vectorStore.initialize(storePath);

    this.initialized = true;
    logger.info("Unlimited context memory initialized");
  }

  /**
   * Store a memory entry
   */
  async remember(
    content: string,
    type: MemoryEntry["metadata"]["type"],
    options: {
      importance?: number;
      source?: string;
      tags?: string[];
    } = {}
  ): Promise<string> {
    await this.ensureInitialized();

    const id = this.generateId();
    const entry: MemoryEntry = {
      id,
      content,
      metadata: {
        type,
        timestamp: Date.now(),
        importance: options.importance ?? MEMORY_CONFIG.priorities[type] ?? 0.5,
        accessCount: 0,
        lastAccessed: Date.now(),
        source: options.source ?? "",
        tags: options.tags ?? [],
      },
    };

    await this.vectorStore.add(entry);
    await this.vectorStore.save();

    logger.debug(`Remembered: ${type} - ${content.slice(0, 50)}...`);
    return id;
  }

  /**
   * Store a decision that was made
   */
  async rememberDecision(
    decision: string,
    rationale: string,
    options: { source?: string; tags?: string[] } = {}
  ): Promise<string> {
    const content = `Decision: ${decision}\n\nRationale: ${rationale}`;
    return this.remember(content, "decision", {
      importance: 1.0,
      ...options,
      tags: ["decision", ...(options.tags ?? [])],
    });
  }

  /**
   * Store an error and its resolution
   */
  async rememberError(
    error: string,
    resolution: string,
    options: { source?: string; tags?: string[] } = {}
  ): Promise<string> {
    const content = `Error: ${error}\n\nResolution: ${resolution}`;
    return this.remember(content, "error", {
      importance: 0.9,
      ...options,
      tags: ["error", "resolution", ...(options.tags ?? [])],
    });
  }

  /**
   * Store something learned
   */
  async rememberLearning(
    learning: string,
    options: { source?: string; tags?: string[] } = {}
  ): Promise<string> {
    return this.remember(learning, "learning", {
      importance: 0.7,
      ...options,
      tags: ["learning", ...(options.tags ?? [])],
    });
  }

  /**
   * Store a message from conversation
   */
  async rememberMessage(
    role: string,
    content: string,
    options: { source?: string; tags?: string[] } = {}
  ): Promise<string> {
    const messageContent = `[${role.toUpperCase()}] ${content}`;
    return this.remember(messageContent, "message", {
      importance: 0.6,
      ...options,
      tags: ["message", role, ...(options.tags ?? [])],
    });
  }

  /**
   * Recall relevant memories for a query
   */
  async recall(
    query: string,
    options: {
      limit?: number;
      types?: string[];
      tags?: string[];
    } = {}
  ): Promise<RetrievalResult[]> {
    await this.ensureInitialized();

    const results = await this.vectorStore.search(query, options);

    // Update access counts
    for (const result of results) {
      result.entry.metadata.accessCount++;
      result.entry.metadata.lastAccessed = Date.now();
    }

    await this.vectorStore.save();
    return results;
  }

  /**
   * Build optimized context for a query
   */
  async buildContext(
    query: string,
    options: Parameters<ContextBuilder["buildContext"]>[1] = {}
  ): Promise<ReturnType<ContextBuilder["buildContext"]>> {
    await this.ensureInitialized();
    return this.contextBuilder.buildContext(query, options);
  }

  /**
   * Create a summary of old memories
   */
  async summarizeOldMemories(
    olderThan: number = 30 * 24 * 60 * 60 * 1000 // 30 days
  ): Promise<string> {
    await this.ensureInitialized();

    const _cutoff = Date.now() - olderThan;
    // Collect old memories for summarization
    // In a full implementation, this would iterate through entries
    // and create a summary using an LLM
    return `Summary of memories older than ${new Date(Date.now() - olderThan).toISOString()}`;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<ReturnType<VectorStore["getStats"]>> {
    await this.ensureInitialized();
    return this.vectorStore.getStats();
  }

  /**
   * Clean up old memories
   */
  async cleanup(): Promise<number> {
    await this.ensureInitialized();
    const removed = await this.vectorStore.cleanup();
    await this.vectorStore.save();
    return removed;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: UnlimitedContextMemory | null = null;

export function getUnlimitedContextMemory(appPath: string): UnlimitedContextMemory {
  if (!instance) {
    instance = new UnlimitedContextMemory(appPath);
  }
  return instance;
}

export function resetUnlimitedContextMemory(): void {
  instance = null;
}
