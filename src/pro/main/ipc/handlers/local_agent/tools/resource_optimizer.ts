/**
 * Resource Optimizer Tool
 * Capabilities 401-420: System resource utilization analysis
 * - Analyze resource utilization (CPU, memory, network)
 * - Identify resource-intensive operations
 * - Suggest lazy loading opportunities
 * - Optimize bundle sizes
 * - Detect memory leaks
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Input Schema
// ============================================================================

const ResourceOptimizerArgs = z.object({
  /** The file path to analyze */
  targetPath: z.string().optional(),
  /** The code content to analyze directly */
  code: z.string().optional(),
  /** Whether to analyze lazy loading opportunities */
  analyzeLazyLoading: z.boolean().default(true),
  /** Whether to analyze bundle size */
  analyzeBundleSize: z.boolean().default(true),
  /** Whether to detect memory leaks */
  detectMemoryLeaks: z.boolean().default(true),
  /** Whether to analyze network requests */
  analyzeNetwork: z.boolean().default(true),
});

type ResourceOptimizerArgs = z.infer<typeof ResourceOptimizerArgs>;

// ============================================================================
// Types
// ============================================================================

/** Resource issue type */
type ResourceIssueType =
  | "eager_import"
  | "large_bundle"
  | "memory_leak"
  | "unoptimized_image"
  | "redundant_request"
  | "heavy_component"
  | "unused_code"
  | "large_dependency";

/** Severity of the issue */
type IssueSeverity = "critical" | "high" | "medium" | "low";

/** A detected resource issue */
interface ResourceIssue {
  type: ResourceIssueType;
  severity: IssueSeverity;
  description: string;
  location?: string;
  lineNumber?: number;
  suggestion?: string;
  estimatedImpact?: string;
}

/** Lazy loading opportunity */
interface LazyLoadingOpportunity {
  type: string;
  description: string;
  currentPattern: string;
  suggestedPattern: string;
  estimatedSavings: string;
}

/** Bundle analysis */
interface BundleAnalysis {
  largeImports: string[];
  suggestions: string[];
  optimizations: string[];
}

/** Memory leak detection */
interface MemoryLeakDetection {
  potentialLeaks: string[];
  patterns: string[];
  fixes: string[];
}

/** Network optimization */
interface NetworkOptimization {
  issues: string[];
  suggestions: string[];
  bestPractices: string[];
}

/** Complete resource optimization result */
interface ResourceOptimizationResult {
  fileName: string;
  analysis: {
    issues: ResourceIssue[];
    lazyLoading: LazyLoadingOpportunity[];
    bundle: BundleAnalysis;
    memoryLeaks: MemoryLeakDetection;
    network: NetworkOptimization;
  };
  summary: string;
}

// ============================================================================
// Analysis Logic
// ============================================================================

/** Detect eager imports that could be lazy loaded */
function detectLazyLoadingOpportunities(
  code: string,
): LazyLoadingOpportunity[] {
  const opportunities: LazyLoadingOpportunity[] = [];

  // Detect React component imports that could be lazy loaded
  const componentImportPattern =
    /import\s+.*\s+from\s+['"](.*components?\/.*)['"]/g;
  let match;

  while ((match = componentImportPattern.exec(code)) !== null) {
    const importPath = match[1];

    // Skip already lazy imports
    if (code.includes("lazy(") && code.includes(importPath)) continue;

    // Check if it's used in a route or conditional
    const isUsedConditionally = /(\?|&&|\|\||switch)\s*\(/.test(
      code.substring(match.index, match.index + 500),
    );

    if (!isUsedConditionally) {
      opportunities.push({
        type: "React.lazy",
        description: `Component '${importPath}' could be lazy loaded`,
        currentPattern: `import { Component } from '${importPath}'`,
        suggestedPattern: `import { lazy, Suspense } from 'react';\nconst Component = lazy(() => import('${importPath}'));\n// Wrap in <Suspense>`,
        estimatedSavings: "30-50% initial bundle size reduction",
      });
    }
  }

  // Detect heavy module imports at top level
  const heavyModules = [
    "moment",
    "lodash",
    "chart.js",
    "d3",
    "three",
    "ffmpeg",
    "pdfjs",
    "xlsx",
    "stripe",
  ];

  for (const module of heavyModules) {
    if (
      code.includes(`from '${module}'`) ||
      code.includes(`from "${module}"`)
    ) {
      // Check if it's used immediately
      const moduleImportIdx =
        code.indexOf(`'${module}'`) || code.indexOf(`"${module}"`);
      const usageInFirstKB = code.substring(0, moduleImportIdx + 100);

      if (
        !usageInFirstKB.includes("if (") &&
        !usageInFirstKB.includes("switch")
      ) {
        opportunities.push({
          type: "Dynamic Import",
          description: `Heavy module '${module}' imported eagerly - use dynamic import`,
          currentPattern: `import { heavy } from '${module}'`,
          suggestedPattern: `// Use dynamic import\nconst heavyModule = await import('${module}');`,
          estimatedSavings: `Move ${module} loading off initial bundle`,
        });
      }
    }
  }

  // Check for route-based code splitting opportunities
  if (code.includes("Route") || code.includes("Routes")) {
    const hasLazyRoutes = code.includes("lazy(");
    if (!hasLazyRoutes) {
      opportunities.push({
        type: "Route-based splitting",
        description: "Routes could be code-split for better initial load",
        currentPattern: "<Route component={Page} />",
        suggestedPattern: `const Page = lazy(() => import('./Page'));
<Route path="/page" element={<Suspense fallback={...}><Page /></Suspense>} />`,
        estimatedSavings: "20-40% faster initial page load",
      });
    }
  }

  return opportunities;
}

/** Analyze bundle size issues */
function performBundleAnalysis(code: string): BundleAnalysis {
  const largeImports: string[] = [];
  const suggestions: string[] = [];
  const optimizations: string[] = [];

  // Detect full library imports vs specific imports
  const fullLibraryImports =
    code.match(/import\s+.*\s+from\s+['"](?!.*\/)([a-z-]+)['"]/g) || [];

  for (const imp of fullLibraryImports) {
    // Check for large libraries imported in full
    if (
      (imp.includes("lodash") && !imp.includes("/")) ||
      (imp.includes("moment") && !imp.includes("/")) ||
      (imp.includes("antd") && !imp.includes("/")) ||
      (imp.includes("material-ui") && !imp.includes("/")) ||
      (imp.includes("@mui/material") && imp.includes("from '@mui/material'"))
    ) {
      largeImports.push(imp);
      suggestions.push(
        `Use specific imports from ${imp.match(/['"]([^'"]+)['"]/)?.[1]}`,
      );
    }
  }

  // Suggest optimizations
  if (largeImports.length > 0) {
    optimizations.push(
      "Replace full library imports with tree-shakeable specific imports",
    );
    optimizations.push(
      "Consider lighter alternatives (e.g., date-fns instead of moment)",
    );
    optimizations.push(
      "Use barrel exports carefully - import only what's needed",
    );
  }

  return { largeImports, suggestions, optimizations };
}

/** Detect memory leaks */
function performMemoryLeakDetection(code: string): MemoryLeakDetection {
  const potentialLeaks: string[] = [];
  const patterns: string[] = [];
  const fixes: string[] = [];

  // Check for event listeners without cleanup
  if (code.includes("addEventListener")) {
    if (!code.includes("removeEventListener")) {
      potentialLeaks.push("Event listeners added without removal");
      patterns.push("addEventListener found without removeEventListener");
      fixes.push(
        "Use useEffect cleanup or AbortController to remove listeners",
      );
    }
  }

  // Check for subscriptions without cleanup
  if (code.includes("subscribe") || code.includes("Subscription")) {
    if (!code.includes("unsubscribe") && !code.includes("cleanup")) {
      potentialLeaks.push("Subscriptions without cleanup");
      patterns.push("Subscription created without unsubscribe call");
      fixes.push("Store subscription and call unsubscribe in cleanup function");
    }
  }

  // Check for setInterval without clearInterval
  if (code.includes("setInterval")) {
    if (!code.includes("clearInterval")) {
      potentialLeaks.push("setInterval without clearInterval");
      patterns.push("Timer created without cleanup");
      fixes.push("Use clearInterval in useEffect cleanup return");
    }
  }

  // Check for setTimeout that could accumulate
  if ((code.match(/setTimeout/g) || []).length > 5) {
    potentialLeaks.push("Multiple setTimeout calls - ensure cleanup");
    fixes.push("Track and clear timeouts when component unmounts");
  }

  // Check for global variables or closures
  if (code.includes("window.") || code.includes("global.")) {
    const hasCleanup = code.includes("delete") || code.includes("null");
    if (!hasCleanup) {
      potentialLeaks.push("Global variable assignment without cleanup");
      fixes.push("Ensure global references are cleaned up on unmount");
    }
  }

  // Check for useEffect missing cleanup return
  const useEffectMatches = code.match(/useEffect\s*\(\s*\(\s*\)\s*=>/g) || [];
  for (const _ of useEffectMatches) {
    const effectStart = code.indexOf("useEffect");
    const effectBody = code.substring(effectStart, effectStart + 300);
    if (
      effectBody.includes("addEventListener") ||
      effectBody.includes("setInterval")
    ) {
      if (
        !effectBody.includes("return") &&
        !effectBody.includes("clearInterval")
      ) {
        potentialLeaks.push(
          "useEffect with subscriptions/timers missing cleanup",
        );
        fixes.push("Return cleanup function from useEffect");
      }
    }
  }

  return { potentialLeaks, patterns, fixes };
}

/** Analyze network optimization opportunities */
function analyzeNetworkOptimization(code: string): NetworkOptimization {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const bestPractices: string[] = [];

  // Check for multiple API calls in parallel
  if (code.includes("Promise.all")) {
    suggestions.push("Using Promise.all for parallel requests - good practice");
  }

  // Check for sequential awaits that could be parallel
  if (code.includes("await fetch") && code.includes("\nawait fetch")) {
    issues.push("Sequential fetches could be parallelized");
    suggestions.push(
      "Use Promise.all() or Promise.allSettled() for parallel requests",
    );
  }

  // Check for missing request caching
  if (code.includes("fetch(") || code.includes("axios")) {
    if (!code.includes("cache") && !code.includes("Cache")) {
      issues.push("API requests without caching");
      suggestions.push("Implement caching to reduce redundant network calls");
    }
  }

  // Check for missing request deduplication
  if (
    code.includes("fetch(") &&
    !code.includes("dedupe") &&
    !code.includes("AbortController")
  ) {
    issues.push("No request deduplication - rapid calls could cause issues");
    suggestions.push("Use request deduplication or abort pending requests");
  }

  // Check for missing error handling on network calls
  if (code.includes("fetch(") && !code.includes("catch")) {
    issues.push("Network request without error handling");
    suggestions.push("Add try/catch and handle network errors gracefully");
  }

  // Best practices
  bestPractices.push("Use request batching for multiple related API calls");
  bestPractices.push("Implement exponential backoff for retries");
  bestPractices.push(
    "Use webhooks or websockets instead of polling when possible",
  );
  bestPractices.push("Compress request/response data when possible");

  return { issues, suggestions, bestPractices };
}

// ============================================================================
// Main Analysis Function
// ============================================================================

async function analyzeResources(
  args: ResourceOptimizerArgs,
  _ctx: AgentContext,
): Promise<ResourceOptimizationResult> {
  const {
    targetPath,
    code,
    analyzeLazyLoading,
    analyzeBundleSize,
    detectMemoryLeaks,
    analyzeNetwork,
  } = args;

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
          issues: [
            {
              type: "large_bundle",
              severity: "critical",
              description: `Could not read file: ${targetPath}`,
            },
          ],
          lazyLoading: [],
          bundle: { largeImports: [], suggestions: [], optimizations: [] },
          memoryLeaks: { potentialLeaks: [], patterns: [], fixes: [] },
          network: { issues: [], suggestions: [], bestPractices: [] },
        },
        summary: "Error: Could not read the specified file",
      };
    }
  }

  const issues: ResourceIssue[] = [];

  // Run analyses
  let lazyLoading: LazyLoadingOpportunity[] = [];
  if (analyzeLazyLoading) {
    lazyLoading = detectLazyLoadingOpportunities(codeToAnalyze);

    for (const opp of lazyLoading) {
      issues.push({
        type: "eager_import",
        severity: "medium",
        description: opp.description,
        suggestion: opp.suggestedPattern,
        estimatedImpact: opp.estimatedSavings,
      });
    }
  }

  let bundle: BundleAnalysis = {
    largeImports: [],
    suggestions: [],
    optimizations: [],
  };
  if (analyzeBundleSize) {
    bundle = performBundleAnalysis(codeToAnalyze);

    for (const imp of bundle.largeImports) {
      issues.push({
        type: "large_dependency",
        severity: "high",
        description: `Full library import: ${imp}`,
        suggestion: "Use specific imports for tree-shaking",
      });
    }
  }

  let memoryLeaks: MemoryLeakDetection = {
    potentialLeaks: [],
    patterns: [],
    fixes: [],
  };
  if (detectMemoryLeaks) {
    memoryLeaks = performMemoryLeakDetection(codeToAnalyze);

    for (const leak of memoryLeaks.potentialLeaks) {
      issues.push({
        type: "memory_leak",
        severity: "high",
        description: leak,
        suggestion: memoryLeaks.fixes[memoryLeaks.potentialLeaks.indexOf(leak)],
      });
    }
  }

  let network: NetworkOptimization = {
    issues: [],
    suggestions: [],
    bestPractices: [],
  };
  if (analyzeNetwork) {
    network = analyzeNetworkOptimization(codeToAnalyze);

    for (const issue of network.issues) {
      issues.push({
        type: "redundant_request",
        severity: "medium",
        description: issue,
        suggestion: network.suggestions[network.issues.indexOf(issue)],
      });
    }
  }

  // Generate summary
  let summary = "";
  const critical = issues.filter((i) => i.severity === "critical").length;
  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;

  if (critical > 0 || high > 0) {
    summary = `Found ${critical + high} critical/high resource issues`;
  } else if (medium > 0) {
    summary = `Found ${medium} optimization opportunities`;
  } else if (issues.length === 0) {
    summary = "Code appears well-optimized for resource usage";
  } else {
    summary = `Found ${issues.length} resource optimization opportunities`;
  }

  return {
    fileName,
    analysis: {
      issues,
      lazyLoading,
      bundle,
      memoryLeaks,
      network,
    },
    summary,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateResourceXml(result: ResourceOptimizationResult): string {
  const lines: string[] = [
    `# Resource Optimizer Report`,
    ``,
    `**File:** ${result.fileName}`,
    `**Summary:** ${result.summary}`,
    ``,
  ];

  const { issues, lazyLoading, bundle, memoryLeaks, network } = result.analysis;

  // Issues by severity
  if (issues.length > 0) {
    lines.push(`## Resource Issues (${issues.length})`);
    const critical = issues.filter((i) => i.severity === "critical");
    const high = issues.filter((i) => i.severity === "high");
    const medium = issues.filter((i) => i.severity === "medium");

    if (critical.length > 0) {
      lines.push(`### 🔴 Critical`);
      for (const issue of critical) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.suggestion) lines.push(`  → ${issue.suggestion}`);
      }
    }
    if (high.length > 0) {
      lines.push(`### 🟠 High`);
      for (const issue of high) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.estimatedImpact)
          lines.push(`  → Impact: ${issue.estimatedImpact}`);
        if (issue.suggestion) lines.push(`  → ${issue.suggestion}`);
      }
    }
    if (medium.length > 0) {
      lines.push(`### 🟡 Medium`);
      for (const issue of medium) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
      }
    }
    lines.push(``);
  }

  // Lazy loading opportunities
  if (lazyLoading.length > 0) {
    lines.push(`## Lazy Loading Opportunities`);
    for (const opp of lazyLoading) {
      lines.push(`### ${opp.type}`);
      lines.push(`- **Description:** ${opp.description}`);
      lines.push(`- **Current:** \`${opp.currentPattern}\``);
      lines.push(
        `- **Suggested:** ${opp.suggestedPattern.replace(/\n/g, "\n  ")}`,
      );
      lines.push(`- **Est. Savings:** ${opp.estimatedSavings}`);
      lines.push(``);
    }
  }

  // Bundle analysis
  if (bundle.optimizations.length > 0) {
    lines.push(`## Bundle Size Optimizations`);
    for (const opt of bundle.optimizations) {
      lines.push(`- ${opt}`);
    }
    lines.push(``);
  }

  // Memory leaks
  if (memoryLeaks.potentialLeaks.length > 0) {
    lines.push(`## Memory Leak Detection`);
    lines.push(`### Potential Leaks`);
    for (const leak of memoryLeaks.potentialLeaks) {
      lines.push(`- ${leak}`);
    }
    lines.push(`### Fixes`);
    for (const fix of memoryLeaks.fixes) {
      lines.push(`- ${fix}`);
    }
    lines.push(``);
  }

  // Network optimization
  if (network.suggestions.length > 0) {
    lines.push(`## Network Optimization`);
    if (network.suggestions.length > 0) {
      lines.push(`### Suggestions`);
      for (const sug of network.suggestions) {
        lines.push(`- ${sug}`);
      }
    }
    if (network.bestPractices.length > 0) {
      lines.push(`### Best Practices`);
      for (const bp of network.bestPractices) {
        lines.push(`- ${bp}`);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const resourceOptimizerTool: ToolDefinition<ResourceOptimizerArgs> = {
  name: "resource_optimizer",
  description:
    "Analyzes code for resource utilization optimization opportunities. Detects eager imports, memory leaks, bundle size issues, and network inefficiencies. Use this to improve application performance and reduce resource consumption.",
  inputSchema: ResourceOptimizerArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Resource Optimizer">Analyzing resource utilization...</dyad-status>`,
    );

    const result = await analyzeResources(args, ctx);

    const report = generateResourceXml(result);

    ctx.onXmlComplete(
      `<dyad-status title="Resource Analysis Complete">${result.summary}</dyad-status>`,
    );

    return report;
  },
};
