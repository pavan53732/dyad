/**
 * Runtime Telemetry Tools
 * Capabilities 421-430: Advanced runtime monitoring and telemetry
 *
 * - performance_telemetry (421) - Collect performance telemetry data
 * - error_telemetry (422) - Track and report errors with context
 * - usage_telemetry (423) - Monitor usage patterns and trends
 * - latency_telemetry (424) - Track latency metrics with percentiles
 * - throughput_telemetry (425) - Monitor throughput and rate metrics
 * - resource_telemetry (426) - Track resource usage over time
 * - custom_telemetry (427) - Custom telemetry events with flexible schema
 * - telemetry_aggregator (428) - Aggregate telemetry data with time windows
 * - telemetry_exporter (429) - Export telemetry data in various formats
 * - telemetry_dashboard (430) - Generate comprehensive telemetry dashboard
 */

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const TelemetryAction = z.enum([
  "collect_performance",
  "track_error",
  "track_usage",
  "track_latency",
  "track_throughput",
  "track_resource",
  "track_custom",
  "aggregate",
  "export",
  "get_dashboard",
  "clear_telemetry",
  "configure_retention",
]);

const TelemetryArgs = z.object({
  /** Action to perform */
  action: TelemetryAction.describe("Telemetry action to perform"),
  /** Metric/event name */
  name: z.string().optional().describe("Name of the metric or event"),
  /** Numeric value */
  value: z.number().optional().describe("Numeric value to record"),
  /** String value for custom events */
  stringValue: z.string().optional().describe("String value for custom events"),
  /** JSON object for custom properties */
  properties: z
    .record(z.string(), z.any())
    .optional()
    .describe("Custom properties as JSON object"),
  /** Labels/tags for the metric */
  labels: z
    .record(z.string(), z.string())
    .optional()
    .describe("Labels or tags for the metric"),
  /** Timestamp (ISO string) */
  timestamp: z.string().optional().describe("ISO timestamp for the event"),
  /** Time range for queries (e.g., "1h", "24h", "7d") */
  timeRange: z
    .string()
    .optional()
    .describe("Time range for queries (1h, 24h, 7d, 30d, all)"),
  /** Aggregation window (e.g., "1m", "5m", "1h") */
  window: z
    .string()
    .optional()
    .describe("Aggregation window (1m, 5m, 15m, 1h, 24h)"),
  /** Export format (json, csv, prometheus) */
  format: z
    .enum(["json", "csv", "prometheus"])
    .optional()
    .describe("Export format"),
  /** Export file path */
  exportPath: z.string().optional().describe("Path to export file"),
  /** Retention period in days */
  retentionDays: z.number().optional().describe("Retention period in days"),
  /** Whether to include raw data */
  includeRawData: z
    .boolean()
    .optional()
    .describe("Include raw data in response"),
  /** Number of results to return */
  limit: z.number().optional().describe("Number of results to return"),
  /** Error message for error tracking */
  errorMessage: z
    .string()
    .optional()
    .describe("Error message for error tracking"),
  /** Error stack trace */
  errorStack: z.string().optional().describe("Error stack trace"),
  /** Error severity */
  errorSeverity: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .describe("Error severity"),
  /** Component that generated the error */
  component: z
    .string()
    .optional()
    .describe("Component that generated the error"),
  /** User ID for usage tracking */
  userId: z.string().optional().describe("User ID for usage tracking"),
  /** Session ID */
  sessionId: z.string().optional().describe("Session ID"),
  /** Operation name for latency tracking */
  operation: z
    .string()
    .optional()
    .describe("Operation name for latency tracking"),
  /** Request count for throughput */
  requestCount: z.number().optional().describe("Request count for throughput"),
  /** Resource type (cpu, memory, disk, network) */
  resourceType: z
    .enum(["cpu", "memory", "disk", "network"])
    .optional()
    .describe("Resource type"),
});

type TelemetryArgs = z.infer<typeof TelemetryArgs>;

// ============================================================================
// Types
// ============================================================================

interface PerformanceTelemetry {
  id: string;
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

interface ErrorTelemetry {
  id: string;
  name: string;
  message: string;
  stack?: string;
  severity: "low" | "medium" | "high" | "critical";
  component: string;
  timestamp: string;
  labels?: Record<string, unknown>;
  count: number;
}

interface UsageTelemetry {
  id: string;
  name: string;
  userId?: string;
  sessionId?: string;
  timestamp: string;
  labels?: Record<string, unknown>;
  count: number;
}

interface LatencyTelemetry {
  id: string;
  operation: string;
  value: number;
  timestamp: string;
  labels?: Record<string, unknown>;
}

interface ThroughputTelemetry {
  id: string;
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, unknown>;
}

interface ResourceTelemetry {
  id: string;
  resourceType: "cpu" | "memory" | "disk" | "network";
  value: number;
  timestamp: string;
  labels?: Record<string, unknown>;
}

interface CustomTelemetry {
  id: string;
  name: string;
  value?: number;
  stringValue?: string;
  timestamp: string;
  properties?: Record<string, unknown>;
  labels?: Record<string, unknown>;
}

interface TelemetryConfig {
  retentionDays: number;
  maxEventsPerType: number;
}

interface TelemetryData {
  performance: PerformanceTelemetry[];
  errors: ErrorTelemetry[];
  usage: UsageTelemetry[];
  latency: LatencyTelemetry[];
  throughput: ThroughputTelemetry[];
  resources: ResourceTelemetry[];
  custom: CustomTelemetry[];
  config: TelemetryConfig;
}

interface AggregationResult {
  window: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rate?: number;
}

// ============================================================================
// Storage Functions
// ============================================================================

function getTelemetryFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "runtime_telemetry.json");
}

function loadTelemetryData(ctx: AgentContext): TelemetryData {
  const filePath = getTelemetryFilePath(ctx);
  if (!fs.existsSync(filePath)) {
    return {
      performance: [],
      errors: [],
      usage: [],
      latency: [],
      throughput: [],
      resources: [],
      custom: [],
      config: {
        retentionDays: 30,
        maxEventsPerType: 10000,
      },
    };
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      performance: [],
      errors: [],
      usage: [],
      latency: [],
      throughput: [],
      resources: [],
      custom: [],
      config: {
        retentionDays: 30,
        maxEventsPerType: 10000,
      },
    };
  }
}

function saveTelemetryData(ctx: AgentContext, data: TelemetryData): void {
  const filePath = getTelemetryFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function pruneOldData(data: TelemetryData): TelemetryData {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - data.config.retentionDays * 24 * 60 * 60 * 1000,
  );
  const cutoffTime = cutoff.toISOString();

  const prune = <T extends { timestamp: string }>(arr: T[]): T[] =>
    arr
      .filter((item: T) => item.timestamp >= cutoffTime)
      .slice(-data.config.maxEventsPerType);

  return {
    performance: prune(data.performance),
    errors: prune(data.errors),
    usage: prune(data.usage),
    latency: prune(data.latency),
    throughput: prune(data.throughput),
    resources: prune(data.resources),
    custom: prune(data.custom),
    config: data.config,
  };
}

// ============================================================================
// Statistical Functions
// ============================================================================

function calculateStats(values: number[]): AggregationResult {
  if (values.length === 0) {
    return {
      window: "0",
      count: 0,
      sum: 0,
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;

  return {
    window: "0",
    count: sorted.length,
    sum,
    avg: Math.round(avg * 100) / 100,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
  };
}

function filterByTimeRange(
  data: TelemetryData,
  timeRange?: string,
): TelemetryData {
  if (!timeRange || timeRange === "all") {
    return data;
  }

  const now = new Date();
  let cutoffTime: Date;

  switch (timeRange) {
    case "1h":
      cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case "24h":
      cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return data;
  }

  const cutoff = cutoffTime.toISOString();
  const filter = <T extends { timestamp: string }>(arr: T[]) =>
    arr.filter((item: T) => item.timestamp >= cutoff);

  return {
    performance: filter(data.performance),
    errors: filter(data.errors),
    usage: filter(data.usage),
    latency: filter(data.latency),
    throughput: filter(data.throughput),
    resources: filter(data.resources),
    custom: filter(data.custom),
    config: data.config,
  };
}

// ============================================================================
// Main Execution Function
// ============================================================================

async function executeTelemetryAction(
  args: TelemetryArgs,
  ctx: AgentContext,
): Promise<string> {
  const {
    action,
    name,
    value,
    stringValue,
    properties,
    labels,
    timestamp,
    timeRange,
    window: aggregationWindow,
    format,
    exportPath,
    retentionDays,
    includeRawData,
    limit,
    errorMessage,
    errorStack,
    errorSeverity,
    component,
    userId,
    sessionId,
    operation,
    requestCount,
    resourceType,
  } = args;

  let data = loadTelemetryData(ctx);

  switch (action) {
    case "collect_performance": {
      if (!name) {
        throw new Error("name is required for collect_performance action");
      }
      if (value === undefined) {
        throw new Error("value is required for collect_performance action");
      }

      const record: PerformanceTelemetry = {
        id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        value,
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
        properties,
      };

      data.performance.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Performance telemetry collected: ${name} = ${value}`;
      ctx.onXmlComplete(
        `<dyad-status title="Performance Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_error": {
      if (!name) {
        throw new Error("name is required for track_error action");
      }

      const record: ErrorTelemetry = {
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        message: errorMessage ?? "Unknown error",
        stack: errorStack,
        severity: errorSeverity ?? "medium",
        component: component ?? "unknown",
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
        count: 1,
      };

      // Check for existing similar errors to aggregate
      const existingIdx = data.errors.findIndex(
        (e) => e.name === record.name && e.component === record.component,
      );
      if (existingIdx >= 0) {
        data.errors[existingIdx].count += 1;
        data.errors[existingIdx].timestamp = record.timestamp;
        if (errorMessage && !data.errors[existingIdx].message) {
          data.errors[existingIdx].message = errorMessage;
        }
      } else {
        data.errors.push(record);
      }

      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Error tracked: ${name} (${record.severity}) - count: ${record.count}`;
      ctx.onXmlComplete(
        `<dyad-status title="Error Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_usage": {
      if (!name) {
        throw new Error("name is required for track_usage action");
      }

      const record: UsageTelemetry = {
        id: `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        userId,
        sessionId,
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
        count: value ?? 1,
      };

      data.usage.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Usage tracked: ${name} (count: ${record.count})`;
      ctx.onXmlComplete(
        `<dyad-status title="Usage Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_latency": {
      if (!operation) {
        throw new Error("operation is required for track_latency action");
      }
      if (value === undefined) {
        throw new Error("value is required for track_latency action");
      }

      const record: LatencyTelemetry = {
        id: `lat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        operation,
        value,
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
      };

      data.latency.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Latency tracked: ${operation} = ${value}ms`;
      ctx.onXmlComplete(
        `<dyad-status title="Latency Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_throughput": {
      if (!name) {
        throw new Error("name is required for track_throughput action");
      }
      if (value === undefined && requestCount === undefined) {
        throw new Error(
          "value or requestCount is required for track_throughput action",
        );
      }

      const record: ThroughputTelemetry = {
        id: `tp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        value: value ?? requestCount ?? 0,
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
      };

      data.throughput.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Throughput tracked: ${name} = ${record.value}/s`;
      ctx.onXmlComplete(
        `<dyad-status title="Throughput Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_resource": {
      if (!resourceType) {
        throw new Error("resourceType is required for track_resource action");
      }
      if (value === undefined) {
        throw new Error("value is required for track_resource action");
      }

      const record: ResourceTelemetry = {
        id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceType,
        value,
        timestamp: timestamp ?? new Date().toISOString(),
        labels,
      };

      data.resources.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Resource tracked: ${resourceType} = ${value}`;
      ctx.onXmlComplete(
        `<dyad-status title="Resource Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "track_custom": {
      if (!name) {
        throw new Error("name is required for track_custom action");
      }

      const record: CustomTelemetry = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        value,
        stringValue,
        timestamp: timestamp ?? new Date().toISOString(),
        properties,
        labels,
      };

      data.custom.push(record);
      data = pruneOldData(data);
      saveTelemetryData(ctx, data);

      const resultMsg = `Custom telemetry tracked: ${name}`;
      ctx.onXmlComplete(
        `<dyad-status title="Custom Telemetry">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "aggregate": {
      const filteredData = filterByTimeRange(data, timeRange);
      const targetArray = name
        ? (filteredData[name as keyof TelemetryData] as any[])
        : null;

      if (!targetArray || targetArray.length === 0) {
        const resultMsg = `No data found for aggregation: ${name || "all types"}`;
        ctx.onXmlComplete(
          `<dyad-status title="Telemetry Aggregation">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      const values = targetArray
        .map((item) => item.value ?? item.count ?? 0)
        .filter((v) => typeof v === "number");
      const stats = calculateStats(values);

      let resultMsg = `# Telemetry Aggregation: ${name || "all"}\n\n`;
      resultMsg += `**Time Range:** ${timeRange || "all"}\n`;
      resultMsg += `**Window:** ${aggregationWindow || "N/A"}\n\n`;
      resultMsg += `## Statistics\n`;
      resultMsg += `- **Count:** ${stats.count}\n`;
      resultMsg += `- **Sum:** ${stats.sum}\n`;
      resultMsg += `- **Average:** ${stats.avg}\n`;
      resultMsg += `- **Min:** ${stats.min}\n`;
      resultMsg += `- **Max:** ${stats.max}\n`;
      resultMsg += `- **P50:** ${stats.p50}\n`;
      resultMsg += `- **P95:** ${stats.p95}\n`;
      resultMsg += `- **P99:** ${stats.p99}`;

      if (includeRawData && values.length > 0) {
        resultMsg += "\n\n## Raw Values\n";
        resultMsg += values.slice(0, limit ?? 20).join(", ");
      }

      ctx.onXmlComplete(
        `<dyad-status title="Telemetry Aggregation">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "export": {
      const filteredData = filterByTimeRange(data, timeRange);

      let exportContent: string;
      const exportFormat = format ?? "json";

      switch (exportFormat) {
        case "json":
          exportContent = JSON.stringify(filteredData, null, 2);
          break;
        case "csv": {
          const rows = ["type,name,value,timestamp"];

          for (const perf of filteredData.performance) {
            rows.push(
              `performance,${perf.name},${perf.value},${perf.timestamp}`,
            );
          }
          for (const err of filteredData.errors) {
            rows.push(`error,${err.name},${err.count},${err.timestamp}`);
          }
          for (const lat of filteredData.latency) {
            rows.push(`latency,${lat.operation},${lat.value},${lat.timestamp}`);
          }
          for (const tp of filteredData.throughput) {
            rows.push(`throughput,${tp.name},${tp.value},${tp.timestamp}`);
          }
          for (const res of filteredData.resources) {
            rows.push(
              `resource,${res.resourceType},${res.value},${res.timestamp}`,
            );
          }
          for (const custom of filteredData.custom) {
            rows.push(
              `custom,${custom.name},${custom.value ?? ""},${custom.timestamp}`,
            );
          }

          exportContent = rows.join("\n");
          break;
        }
        case "prometheus": {
          const lines: string[] = [];

          for (const perf of filteredData.performance) {
            lines.push(
              `telemetry_performance{name="${perf.name}"} ${perf.value}`,
            );
          }
          for (const err of filteredData.errors) {
            lines.push(
              `telemetry_errors{name="${err.name}",severity="${err.severity}"} ${err.count}`,
            );
          }
          for (const lat of filteredData.latency) {
            lines.push(
              `telemetry_latency{operation="${lat.operation}"} ${lat.value}`,
            );
          }
          for (const tp of filteredData.throughput) {
            lines.push(`telemetry_throughput{name="${tp.name}"} ${tp.value}`);
          }
          for (const res of filteredData.resources) {
            lines.push(
              `telemetry_resource{type="${res.resourceType}"} ${res.value}`,
            );
          }

          exportContent = lines.join("\n");
          break;
        }
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      if (exportPath) {
        const dir = path.dirname(exportPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(exportPath, exportContent, "utf-8");

        const resultMsg = `Telemetry exported to ${exportPath} (${exportContent.length} bytes)`;
        ctx.onXmlComplete(
          `<dyad-status title="Telemetry Export">${escapeXmlContent(resultMsg)}</dyad-status>`,
        );
        return resultMsg;
      }

      // Return content directly if no path specified
      ctx.onXmlComplete(
        `<dyad-status title="Telemetry Export">${escapeXmlContent(exportContent.slice(0, 1000))}</dyad-status>`,
      );
      return exportContent;
    }

    case "get_dashboard": {
      const filteredData = filterByTimeRange(data, timeRange);

      // Calculate summary stats
      const latencyValues = filteredData.latency.map((l) => l.value);
      const latencyStats = calculateStats(latencyValues);

      const throughputValues = filteredData.throughput.map((t) => t.value);
      const avgThroughput =
        throughputValues.length > 0
          ? throughputValues.reduce((a, b) => a + b, 0) /
            throughputValues.length
          : 0;

      const cpuResources = filteredData.resources.filter(
        (r) => r.resourceType === "cpu",
      );
      const avgCpu =
        cpuResources.length > 0
          ? cpuResources.reduce((a, b) => a + b.value, 0) / cpuResources.length
          : 0;

      const memResources = filteredData.resources.filter(
        (r) => r.resourceType === "memory",
      );
      const avgMem =
        memResources.length > 0
          ? memResources.reduce((a, b) => a + b.value, 0) / memResources.length
          : 0;

      const uniqueUsers = new Set(
        filteredData.usage.map((u) => u.userId).filter(Boolean),
      ).size;
      const uniqueSessions = new Set(
        filteredData.usage.map((u) => u.sessionId).filter(Boolean),
      ).size;
      const totalErrors = filteredData.errors.reduce(
        (sum, e) => sum + e.count,
        0,
      );
      const totalEvents =
        filteredData.performance.length +
        filteredData.errors.length +
        filteredData.usage.length +
        filteredData.latency.length +
        filteredData.throughput.length +
        filteredData.resources.length +
        filteredData.custom.length;
      const errorRate = totalEvents > 0 ? (totalErrors / totalEvents) * 100 : 0;

      let resultMsg = `# Runtime Telemetry Dashboard\n\n`;
      resultMsg += `## Summary (${timeRange || "all time"})\n\n`;
      resultMsg += `- **Total Events:** ${totalEvents}\n`;
      resultMsg += `- **Error Count:** ${totalErrors} (${errorRate.toFixed(2)}%)\n`;
      resultMsg += `- **Active Users:** ${uniqueUsers}\n`;
      resultMsg += `- **Sessions:** ${uniqueSessions}\n\n`;

      resultMsg += `## Performance\n\n`;
      resultMsg += `- **Avg Latency:** ${latencyStats.avg.toFixed(2)}ms\n`;
      resultMsg += `- **P50 Latency:** ${latencyStats.p50}ms\n`;
      resultMsg += `- **P95 Latency:** ${latencyStats.p95}ms\n`;
      resultMsg += `- **P99 Latency:** ${latencyStats.p99}ms\n`;
      resultMsg += `- **Avg Throughput:** ${avgThroughput.toFixed(2)}/s\n\n`;

      resultMsg += `## Resources\n\n`;
      resultMsg += `- **Avg CPU:** ${avgCpu.toFixed(1)}%\n`;
      resultMsg += `- **Avg Memory:** ${avgMem.toFixed(1)}%\n\n`;

      resultMsg += `## Data Points\n\n`;
      resultMsg += `- **Performance Events:** ${filteredData.performance.length}\n`;
      resultMsg += `- **Error Events:** ${filteredData.errors.length}\n`;
      resultMsg += `- **Usage Events:** ${filteredData.usage.length}\n`;
      resultMsg += `- **Latency Events:** ${filteredData.latency.length}\n`;
      resultMsg += `- **Throughput Events:** ${filteredData.throughput.length}\n`;
      resultMsg += `- **Resource Events:** ${filteredData.resources.length}\n`;
      resultMsg += `- **Custom Events:** ${filteredData.custom.length}`;

      // Add top errors if any
      if (filteredData.errors.length > 0) {
        const topErrors = [...filteredData.errors]
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        resultMsg += "\n\n## Top Errors\n";
        for (const err of topErrors) {
          const severityEmoji =
            err.severity === "critical"
              ? "🔴"
              : err.severity === "high"
                ? "🟠"
                : err.severity === "medium"
                  ? "🟡"
                  : "🔵";
          resultMsg += `\n- ${severityEmoji} ${err.name}: ${err.count} occurrences`;
        }
      }

      ctx.onXmlComplete(
        `<dyad-status title="Telemetry Dashboard">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "clear_telemetry": {
      data = {
        performance: [],
        errors: [],
        usage: [],
        latency: [],
        throughput: [],
        resources: [],
        custom: [],
        config: data.config,
      };
      saveTelemetryData(ctx, data);

      const resultMsg = "All telemetry data cleared";
      ctx.onXmlComplete(
        `<dyad-status title="Telemetry Cleared">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    case "configure_retention": {
      if (retentionDays !== undefined) {
        data.config.retentionDays = retentionDays;
      }
      saveTelemetryData(ctx, data);

      const resultMsg = `Telemetry retention configured: ${data.config.retentionDays} days`;
      ctx.onXmlComplete(
        `<dyad-status title="Retention Configured">${escapeXmlContent(resultMsg)}</dyad-status>`,
      );
      return resultMsg;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const performanceTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "performance_telemetry",
  description:
    "Collect performance telemetry data. Record timing, throughput, and other performance metrics. Use aggregate action to analyze collected data.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Collect performance: ${args.name} = ${args.value}`;
  },

  buildXml: (args, isComplete) => {
    if (!args.action) return undefined;

    let xml = `<dyad-telemetry action="${escapeXmlAttr(args.action)}">`;
    if (args.name) {
      xml += escapeXmlContent(args.name);
    }
    if (isComplete) {
      xml += "</dyad-telemetry>";
    }
    return xml;
  },

  execute: async (args, ctx) => {
    ctx.onXmlStream(
      `<dyad-status title="Performance Telemetry">Collecting ${args.name || "performance data"}...</dyad-status>`,
    );

    const result = await executeTelemetryAction(args, ctx);
    return result;
  },
};

export const errorTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "error_telemetry",
  description:
    "Track and report errors with context. Records error messages, stack traces, severity levels, and component information. Aggregates similar errors automatically.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track error: ${args.name} (${args.errorSeverity || "medium"})`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const usageTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "usage_telemetry",
  description:
    "Monitor usage patterns and trends. Track user actions, feature usage, session data, and engagement metrics. Supports user and session tracking.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track usage: ${args.name}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const latencyTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "latency_telemetry",
  description:
    "Track latency metrics for operations. Records response times in milliseconds. Use aggregate action to calculate percentiles (p50, p95, p99).",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track latency: ${args.operation} = ${args.value}ms`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const throughputTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "throughput_telemetry",
  description:
    "Monitor throughput and rate metrics. Track requests per second, operations per minute, and other rate-based metrics for capacity planning.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track throughput: ${args.name} = ${args.value ?? args.requestCount}/s`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const resourceTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "resource_telemetry",
  description:
    "Track resource usage over time. Monitor CPU, memory, disk, and network usage patterns. Use for capacity planning and anomaly detection.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track resource: ${args.resourceType} = ${args.value}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const customTelemetryTool: ToolDefinition<TelemetryArgs> = {
  name: "custom_telemetry",
  description:
    "Track custom telemetry events with flexible schema. Record arbitrary events with numeric values, string values, and custom properties for domain-specific monitoring.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Track custom event: ${args.name}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const telemetryAggregatorTool: ToolDefinition<TelemetryArgs> = {
  name: "telemetry_aggregator",
  description:
    "Aggregate telemetry data with configurable time windows. Calculate statistics including count, sum, average, min, max, and percentiles (p50, p95, p99).",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) => {
    return `Aggregate telemetry: ${args.name || "all data"}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const telemetryExporterTool: ToolDefinition<TelemetryArgs> = {
  name: "telemetry_exporter",
  description:
    "Export telemetry data in various formats. Supports JSON (full data), CSV (tabular), and Prometheus (metrics format). Can export to file or return content directly.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    return `Export telemetry: ${args.format || "json"} to ${args.exportPath || "stdout"}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};

export const telemetryDashboardTool: ToolDefinition<TelemetryArgs> = {
  name: "telemetry_dashboard",
  description:
    "Generate comprehensive telemetry dashboard. Shows summary statistics, error rates, latency percentiles, resource usage, usage patterns, and top errors.",
  inputSchema: TelemetryArgs,
  defaultConsent: "always",
  modifiesState: false,

  getConsentPreview: (args) => {
    return `Get telemetry dashboard for ${args.timeRange || "all time"}`;
  },

  execute: async (args, ctx) => {
    return executeTelemetryAction(args, ctx);
  },
};
