/**
 * Caching Strategies Tool
 * Capabilities 381-400: Cache analysis and optimization
 * - Analyze caching opportunities
 * - Suggest cache implementations (LRU, TTL, etc.)
 * - Calculate cache hit/miss ratios
 * - Optimize memoization patterns
 * - Implement cache invalidation strategies
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const CachingStrategiesArgs = z.object({
  /** The file path to analyze */
  targetPath: z.string().optional(),
  /** The code content to analyze directly */
  code: z.string().optional(),
  /** Whether to analyze memoization patterns */
  analyzeMemoization: z.boolean().default(true),
  /** Whether to analyze API response caching */
  analyzeApiCaching: z.boolean().default(true),
  /** Whether to analyze data fetching patterns */
  analyzeDataFetching: z.boolean().default(true),
  /** Suggest specific cache implementations */
  suggestImplementations: z.boolean().default(true),
});

type CachingStrategiesArgs = z.infer<typeof CachingStrategiesArgs>;

// ============================================================================
// Types
// ============================================================================

/** Cache opportunity type */
type OpportunityType =
  | "memoization"
  | "api_response_cache"
  | "computed_value"
  | "data_fetch_cache"
  | "side_effect_free"
  | "expensive_operation";

/** Severity of the opportunity */
type OpportunityPriority = "high" | "medium" | "low";

/** Cache implementation type */
type CacheType = "lru" | "ttl" | "memoize" | "redis" | "local_storage" | "in_memory";

/** A detected caching opportunity */
interface CachingOpportunity {
  type: OpportunityType;
  priority: OpportunityPriority;
  description: string;
  location?: string;
  lineNumber?: number;
  currentPattern?: string;
  suggestedPattern?: string;
  estimatedImprovement?: string;
}

/** Cache implementation suggestion */
interface CacheImplementation {
  type: CacheType;
  description: string;
  useCase: string;
  implementation?: string;
  pros: string[];
  cons: string[];
}

/** Invalidation strategy */
interface InvalidationStrategy {
  trigger: string;
  strategy: string;
  description: string;
}

/** Memoization analysis */
interface MemoizationAnalysis {
  opportunities: CachingOpportunity[];
  existingMemoization: string[];
  improvements: string[];
}

/** Data fetching analysis */
interface DataFetchingAnalysis {
  opportunities: CachingOpportunity[];
  fetchPatterns: string[];
  suggestions: string[];
}

/** Complete caching analysis result */
interface CachingAnalysisResult {
  fileName: string;
  analysis: {
    opportunities: CachingOpportunity[];
    implementations: CacheImplementation[];
    invalidationStrategies: InvalidationStrategy[];
    memoization: MemoizationAnalysis;
    dataFetching: DataFetchingAnalysis;
  };
  summary: string;
}

// ============================================================================
// Analysis Logic
// ============================================================================

/** Detect memoization opportunities */
function detectMemoizationOpportunities(code: string): MemoizationAnalysis {
  const opportunities: CachingOpportunity[] = [];
  const existingMemoization: string[] = [];
  const improvements: string[] = [];
  const lines = code.split("\n");

  // Check for existing memoization
  if (code.includes("useMemo") || code.includes("React.useMemo")) {
    existingMemoization.push("React useMemo hooks detected");
  }
  if (code.includes("useCallback") || code.includes("React.useCallback")) {
    existingMemoization.push("React useCallback hooks detected");
  }
  if (code.includes("memo(") || code.includes("React.memo")) {
    existingMemoization.push("React.memo detected");
  }
  if (code.includes("cache") || code.includes("Cache")) {
    existingMemoization.push("Custom cache implementation detected");
  }

  // Detect pure functions that could be memoized
  const functionPattern = /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s+)?\(|=>\s*\{)/g;
  let match;

  while ((match = functionPattern.exec(code)) !== null) {
    const fnName = match[1];
    // Skip if already memoized
    if (fnName.includes("memo") || fnName.includes("cache")) continue;

    // Look for expensive operations in function
    const fnStart = match.index;
    const fnEnd = code.indexOf("}", fnStart + 100);
    const fnBody = code.substring(fnStart, fnEnd + 1);

    // Check for expensive operations
    if (
      fnBody.includes(".map(") ||
      fnBody.includes(".filter(") ||
      fnBody.includes(".reduce(") ||
      fnBody.includes("JSON.parse") ||
      fnBody.includes("fetch") ||
      fnBody.includes("await")
    ) {
      opportunities.push({
        type: "memoization",
        priority: "high",
        description: `Function '${fnName}' performs expensive operations - consider memoization`,
        currentPattern: `function ${fnName}(...) { ... }`,
        suggestedPattern: `// Option 1: useMemo\nconst ${fnName} = useMemo(() => ..., [deps]);\n\n// Option 2: Standalone memoize\nimport { memoize } from 'lodash';\nconst ${fnName} = memoize(${fnName});`,
        estimatedImprovement: "50-90% for repeated calls with same inputs",
      });
    }
  }

  // Detect repeated calculations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Look for calculations that might be repeated
    if (/\.map\(.*\)\.filter\(/.test(line) || /\.filter\(.*\)\.map\(/.test(line)) {
      opportunities.push({
        type: "expensive_operation",
        priority: "medium",
        description: "Chained array operations - could be combined into single pass",
        lineNumber,
        suggestedPattern: "// Use reduce to combine operations into single pass",
        estimatedImprovement: "30-50% by reducing iterations",
      });
    }
  }

  // Improvements for existing memoization
  if (existingMemoization.length > 0) {
    if (code.includes("useMemo") && !code.includes("deps") && !code.includes("dependencies")) {
      improvements.push("Add dependency arrays to useMemo/useCallback for correct caching");
    }
    if (code.includes("useMemo") && code.includes("[]")) {
      improvements.push("Consider if empty dependency array is correct - may be missing dependencies");
    }
  }

  return { opportunities, existingMemoization, improvements };
}

/** Detect API caching opportunities */
function detectApiCachingOpportunities(code: string): CachingOpportunity[] {
  const opportunities: CachingOpportunity[] = [];
  const lines = code.split("\n");

  // Detect fetch calls without caching
  const fetchPattern = /\bfetch\s*\(|axios\.|await\s+.*\./g;
  const hasFetch = fetchPattern.test(code);

  if (hasFetch) {
    // Check for repeated fetch calls
    const fetchMatches = code.match(/fetch\([^)]+\)/g) || [];
    const uniqueFetches = new Set(fetchMatches);

    if (uniqueFetches.size > 0) {
      // Check if there's any caching
      if (!code.includes("cache") && !code.includes("Cache")) {
        opportunities.push({
          type: "api_response_cache",
          priority: "high",
          description: `Found ${uniqueFetches.size} unique API calls without caching`,
          suggestedPattern: `// Option 1: Simple in-memory cache\nconst cache = new Map();\nasync function fetchWithCache(url) {\n  if (cache.has(url)) return cache.get(url);\n  const response = await fetch(url);\n  cache.set(url, response);\n  return response;\n}\n\n// Option 2: React Query (recommended)\nimport { useQuery } from '@tanstack/react-query';\nconst { data } = useQuery({ queryKey: ['key'], queryFn: () => fetch(url) });`,
          estimatedImprovement: "90%+ reduction in redundant API calls",
        });
      }
    }
  }

  // Detect data transformations that could be cached
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (line.includes("JSON.parse") || line.includes("JSON.stringify")) {
      // Check if it's inside a render or frequently called function
      if (lineNumber > 5) {
        opportunities.push({
          type: "computed_value",
          priority: "medium",
          description: "JSON parsing inside function - result could be cached",
          lineNumber,
          suggestedPattern: "// Parse once and cache the result",
          estimatedImprovement: "40-60% for repeated parsing",
        });
      }
    }
  }

  return opportunities;
}

/** Detect data fetching patterns */
function detectDataFetchingPatterns(code: string): DataFetchingAnalysis {
  const opportunities: CachingOpportunity[] = [];
  const fetchPatterns: string[] = [];
  const suggestions: string[] = [];
  const lines = code.split("\n");

  // Detect common fetch patterns
  if (code.includes("useEffect") && code.includes("fetch")) {
    fetchPatterns.push("useEffect with fetch - consider React Query or SWR");
  }
  if (code.includes("componentDidMount")) {
    fetchPatterns.push("componentDidMount fetch pattern detected");
  }
  if (code.includes("await fetch")) {
    fetchPatterns.push("Async/await fetch detected");
  }
  if (code.includes(".then(") || code.includes(".catch(")) {
    fetchPatterns.push("Promise .then/.catch pattern detected");
  }

  // Check for missing error handling
  if (code.includes("fetch(") && !code.includes("catch")) {
    opportunities.push({
      type: "data_fetch_cache",
      priority: "medium",
      description: "Fetch without error handling - consider adding retry logic",
      suggestedPattern: "// Add retry with exponential backoff",
    });
  }

  // Check for loading states
  if (code.includes("fetch") && !code.includes("loading") && !code.includes("isLoading")) {
    suggestions.push("Add loading state to improve UX during data fetching");
  }

  // Check for polling
  if (code.includes("setInterval") && code.includes("fetch")) {
    fetchPatterns.push("Polling pattern detected - consider WebSocket or Server-Sent Events");
    suggestions.push("For frequent updates, consider WebSocket for real-time data");
  }

  return { opportunities, fetchPatterns, suggestions };
}

/** Generate cache implementation suggestions */
function getCacheImplementations(): CacheImplementation[] {
  return [
    {
      type: "memoize",
      description: "Function result caching",
      useCase: "Pure functions with expensive computations",
      implementation: `import { memoize } from 'lodash';

const expensiveFn = (x) => computeExpensiveValue(x);
const memoizedFn = memoize(expensiveFn);

// Clear cache when needed
memoizedFn.cache.clear();`,
      pros: ["Simple to implement", "No external dependencies", "Fast for single instance"],
      cons: ["Memory grows unbounded", "Not shared across instances", "Serialization challenges"],
    },
    {
      type: "lru",
      description: "Least Recently Used cache",
      useCase: "When cache size needs to be bounded",
      implementation: `import { LRUCache } from 'lru-cache';

const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 10, // 10 minutes
});

function getCached(key) {
  return cache.get(key) ?? computeAndCache(key);
}`,
      pros: ["Bounded memory usage", "Evicts old entries automatically", "Good hit rates"],
      cons: ["Additional dependency", "Slightly more complex"],
    },
    {
      type: "ttl",
      description: "Time-To-Live cache",
      useCase: "Data that becomes stale after a period",
      implementation: `const ttlCache = new Map();

function getOrSet(key, compute, ttlMs = 60000) {
  const existing = ttlCache.get(key);
  if (existing && Date.now() - existing.timestamp < ttlMs) {
    return existing.value;
  }
  const value = compute();
  ttlCache.set(key, { value, timestamp: Date.now() });
  return value;
}`,
      pros: ["Automatic expiration", "Simple to implement", "Good for time-sensitive data"],
      cons: ["Requires cleanup of expired entries", "Memory not automatically freed"],
    },
  ];
}

/** Generate invalidation strategies */
function getInvalidationStrategies(code: string): InvalidationStrategy[] {
  const strategies: InvalidationStrategy[] = [];

  // Check for mutation patterns that suggest when to invalidate
  if (code.includes("setState") || code.includes("dispatch")) {
    strategies.push({
      trigger: "State change",
      strategy: "On-state update",
      description: "Clear relevant cache entries when application state changes",
    });
  }

  if (code.includes("POST") || code.includes("PUT") || code.includes("DELETE")) {
    strategies.push({
      trigger: "Data mutation",
      strategy: "On mutation + cache tags",
      description: "Invalidate related cache entries after data modifications",
    });
  }

  if (code.includes("localStorage") || code.includes("sessionStorage")) {
    strategies.push({
      trigger: "Storage event",
      strategy: "Cross-tab synchronization",
      description: "Listen to storage events to sync cache across tabs",
    });
  }

  // Add default strategies
  strategies.push({
    trigger: "Time-based",
    strategy: "TTL expiration",
    description: "Auto-expire entries after TTL expires",
  });

  strategies.push({
    trigger: "Memory pressure",
    strategy: "LRU eviction",
    description: "Remove least recently used entries when memory is low",
  });

  return strategies;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

async function analyzeCaching(
  args: CachingStrategiesArgs,
  _ctx: AgentContext,
): Promise<CachingAnalysisResult> {
  const { targetPath, code, analyzeMemoization, analyzeApiCaching, analyzeDataFetching, suggestImplementations } = args;

  let codeToAnalyze = code || "";
  let fileName = "inline code";

  if (targetPath) {
    try {
      codeToAnalyze = await fs.readFile(targetPath, "utf-8");
      fileName = path.basename(targetPath);
    } catch {
      return {
        fileName: targetPath,
        analysis: {
          opportunities: [{
            type: "memoization",
            priority: "high",
            description: `Could not read file: ${targetPath}`,
          }],
          implementations: [],
          invalidationStrategies: [],
          memoization: { opportunities: [], existingMemoization: [], improvements: [] },
          dataFetching: { opportunities: [], fetchPatterns: [], suggestions: [] },
        },
        summary: "Error: Could not read the specified file",
      };
    }
  }

  const opportunities: CachingOpportunity[] = [];

  // Run analyses
  let memoization: MemoizationAnalysis = { opportunities: [], existingMemoization: [], improvements: [] };
  if (analyzeMemoization) {
    memoization = detectMemoizationOpportunities(codeToAnalyze);
    opportunities.push(...memoization.opportunities);
  }

  if (analyzeApiCaching) {
    opportunities.push(...detectApiCachingOpportunities(codeToAnalyze));
  }

  let dataFetching: DataFetchingAnalysis = { opportunities: [], fetchPatterns: [], suggestions: [] };
  if (analyzeDataFetching) {
    dataFetching = detectDataFetchingPatterns(codeToAnalyze);
    opportunities.push(...dataFetching.opportunities);
  }

  const implementations = suggestImplementations ? getCacheImplementations() : [];
  const invalidationStrategies = getInvalidationStrategies(codeToAnalyze);

  // Generate summary
  let summary = "";
  const highPriority = opportunities.filter((o) => o.priority === "high").length;
  const mediumPriority = opportunities.filter((o) => o.priority === "medium").length;

  if (highPriority > 0) {
    summary = `Found ${highPriority} high-priority caching opportunities`;
  } else if (mediumPriority > 0) {
    summary = `Found ${mediumPriority} medium-priority caching opportunities`;
  } else if (opportunities.length === 0) {
    summary = "Code appears well-optimized for caching";
  } else {
    summary = `Found ${opportunities.length} caching optimization opportunities`;
  }

  return {
    fileName,
    analysis: {
      opportunities,
      implementations,
      invalidationStrategies,
      memoization,
      dataFetching,
    },
    summary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateCachingXml(result: CachingAnalysisResult): string {
  const lines: string[] = [
    `# Caching Strategies Analysis`,
    ``,
    `**File:** ${result.fileName}`,
    `**Summary:** ${result.summary}`,
    ``,
  ];

  const { opportunities, implementations, invalidationStrategies, memoization, dataFetching } = result.analysis;

  // Opportunities by priority
  if (opportunities.length > 0) {
    lines.push(`## Caching Opportunities (${opportunities.length})`);
    const high = opportunities.filter((o) => o.priority === "high");
    const medium = opportunities.filter((o) => o.priority === "medium");
    const low = opportunities.filter((o) => o.priority === "low");

    if (high.length > 0) {
      lines.push(`### 🔴 High Priority`);
      for (const opp of high) {
        lines.push(`- **${opp.type}**: ${opp.description}`);
        if (opp.estimatedImprovement) {
          lines.push(`  → Est. improvement: ${opp.estimatedImprovement}`);
        }
      }
    }
    if (medium.length > 0) {
      lines.push(`### 🟡 Medium Priority`);
      for (const opp of medium) {
        lines.push(`- **${opp.type}**: ${opp.description}`);
      }
    }
    lines.push(``);
  }

  // Existing memoization
  if (memoization.existingMemoization.length > 0) {
    lines.push(`## Existing Caching`);
    for (const m of memoization.existingMemoization) {
      lines.push(`- ${m}`);
    }
    lines.push(``);
  }

  // Improvements
  if (memoization.improvements.length > 0) {
    lines.push(`## Memoization Improvements`);
    for (const imp of memoization.improvements) {
      lines.push(`- ${imp}`);
    }
    lines.push(``);
  }

  // Data fetching patterns
  if (dataFetching.fetchPatterns.length > 0) {
    lines.push(`## Data Fetching Patterns`);
    for (const pattern of dataFetching.fetchPatterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push(``);
  }

  if (dataFetching.suggestions.length > 0) {
    lines.push(`## Suggestions`);
    for (const sug of dataFetching.suggestions) {
      lines.push(`- ${sug}`);
    }
    lines.push(``);
  }

  // Cache implementations
  if (implementations.length > 0) {
    lines.push(`## Recommended Cache Implementations`);
    for (const impl of implementations) {
      lines.push(`### ${impl.type.toUpperCase()}: ${impl.description}`);
      lines.push(`- **Use case:** ${impl.useCase}`);
      lines.push(`- **Pros:** ${impl.pros.join(", ")}`);
      lines.push(`- **Cons:** ${impl.cons.join(", ")}`);
      if (impl.implementation) {
        lines.push("```javascript");
        lines.push(impl.implementation);
        lines.push("```");
      }
      lines.push(``);
    }
  }

  // Invalidation strategies
  if (invalidationStrategies.length > 0) {
    lines.push(`## Cache Invalidation Strategies`);
    for (const strat of invalidationStrategies) {
      lines.push(`- **${strat.trigger}**: ${strat.description}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const cachingStrategiesTool: ToolDefinition<CachingStrategiesArgs> = {
  name: "caching_strategies",
  description:
    "Analyzes code for caching opportunities and suggests optimal caching implementations. Detects memoization patterns, API response caching, and data fetching optimization. Use this to improve performance through intelligent caching.",
  inputSchema: CachingStrategiesArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Caching Analyzer">Analyzing caching opportunities...</dyad-status>`,
    );

    const result = await analyzeCaching(args, ctx);

    const report = generateCachingXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Caching Analysis Complete">${result.summary}</dyad-status>`,
    );

    return report;
  },
};
