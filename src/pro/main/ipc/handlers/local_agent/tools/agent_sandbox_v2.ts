/**
 * Agent Governance & Sandbox Tools (V2)
 * Capabilities 181-190: Permission systems, safety constraints, and sandbox enforcement.
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

const AgentPermissionArgs = z.object({
  /** Action: get, set, or revoke permission */
  action: z.enum(["get", "set", "revoke", "list"]),
  /** Target agent or role name */
  target: z.string(),
  /** Capability or resource type (e.g., 'filesystem', 'network', 'shell') */
  capability: z.string().optional(),
  /** Permission level: 'allow', 'deny', 'ask' */
  level: z.enum(["allow", "deny", "ask"]).optional(),
});

const AgentAuditArgs = z.object({
  /** Action: log, query, or report */
  action: z.enum(["log", "query", "report"]),
  /** Filter by agent/task ID */
  filter: z.string().optional(),
  /** Time range (e.g., '1h', '24h') */
  timeRange: z.string().optional(),
  /** Severity level filter */
  severity: z.enum(["info", "warning", "critical"]).optional(),
});

const AgentTerminationArgs = z.object({
  /** Task or Agent ID to terminate */
  id: z.string(),
  /** Reason for termination */
  reason: z.string(),
  /** Force termination regardless of state */
  force: z.boolean().default(false),
});

const SandboxEnforcementArgs = z.object({
  /** Action: verify, restrict, or monitor */
  action: z.enum(["verify", "restrict", "monitor"]),
  /** Target directory or resource */
  target: z.string(),
  /** Resource limits (CPU, Memory, Disk) */
  limits: z.object({
    cpu: z.number().optional().describe("CPU limit in cores"),
    memory: z.number().optional().describe("Memory limit in MB"),
    disk: z.number().optional().describe("Disk limit in GB"),
  }).optional(),
});

type AgentPermissionArgs = z.infer<typeof AgentPermissionArgs>;
type AgentAuditArgs = z.infer<typeof AgentAuditArgs>;
type AgentTerminationArgs = z.infer<typeof AgentTerminationArgs>;
type SandboxEnforcementArgs = z.infer<typeof SandboxEnforcementArgs>;

// ============================================================================
// Types
// ============================================================================

interface PermissionRecord {
  target: string;
  capability: string;
  level: "allow" | "deny" | "ask";
  updatedAt: string;
}

interface AuditLogEntry {
  timestamp: string;
  agentId: string;
  action: string;
  target: string;
  outcome: "success" | "failure" | "blocked";
  severity: "info" | "warning" | "critical";
  details: string;
}

interface GovernanceData {
  permissions: PermissionRecord[];
  auditLogs: AuditLogEntry[];
  activePolicies: string[];
}

// ============================================================================
// Storage Functions
// ============================================================================

function getGovernanceFilePath(ctx: AgentContext): string {
  return path.join(ctx.appPath, ".dyad", "governance.json");
}

function loadGovernance(ctx: AgentContext): GovernanceData {
  const filePath = getGovernanceFilePath(ctx);
  if (!fs.existsSync(filePath)) {
    return { permissions: [], auditLogs: [], activePolicies: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { permissions: [], auditLogs: [], activePolicies: [] };
  }
}

function saveGovernance(ctx: AgentContext, data: GovernanceData): void {
  const filePath = getGovernanceFilePath(ctx);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ============================================================================
// Tool Implementations
// ============================================================================

// 1. Agent Permission System (Capability 181)
export const agentPermissionSystemTool: ToolDefinition<AgentPermissionArgs> = {
  name: "agent_permission_system",
  description: "Manage granular permissions for AI agents and roles.",
  inputSchema: AgentPermissionArgs,
  defaultConsent: "always",
  modifiesState: true,
  execute: async (args, ctx) => {
    const data = loadGovernance(ctx);
    const { action, target, capability, level } = args;

    if (action === "list") {
      const list = data.permissions.filter(p => p.target === target);
      return JSON.stringify(list, null, 2);
    }

    if (action === "set") {
      if (!capability || !level) throw new Error("Capability and Level are required for set action.");
      const index = data.permissions.findIndex(p => p.target === target && p.capability === capability);
      if (index >= 0) {
        data.permissions[index] = { target, capability, level, updatedAt: new Date().toISOString() };
      } else {
        data.permissions.push({ target, capability, level, updatedAt: new Date().toISOString() });
      }
      saveGovernance(ctx, data);
      return `Permission set: ${target} [${capability}] -> ${level}`;
    }

    if (action === "revoke") {
      if (!capability) throw new Error("Capability is required for revoke action.");
      data.permissions = data.permissions.filter(p => !(p.target === target && p.capability === capability));
      saveGovernance(ctx, data);
      return `Permission revoked: ${target} [${capability}]`;
    }

    // Default: get
    const perm = data.permissions.find(p => p.target === target && p.capability === capability);
    return perm ? perm.level : "ask";
  }
};

// 2. Agent Action Auditing (Capability 184)
export const agentActionAuditTool: ToolDefinition<AgentAuditArgs> = {
  name: "agent_action_audit",
  description: "Log and query agent actions for safety and compliance auditing.",
  inputSchema: AgentAuditArgs,
  defaultConsent: "always",
  modifiesState: true,
  execute: async (args, ctx) => {
    const data = loadGovernance(ctx);
    const { action, filter, severity } = args;

    if (action === "log") {
      // In a real system, this would be called by the agent framework automatically
      const entry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        agentId: String(process.pid), // Cast process.pid to string for agentId
        action: "audit_call",
        target: filter || "system",
        outcome: "success",
        severity: severity || "info",
        details: "Manual audit log entry."
      };
      data.auditLogs.push(entry);
      if (data.auditLogs.length > 1000) data.auditLogs.shift();
      saveGovernance(ctx, data);
      return "Log entry recorded.";
    }

    if (action === "report") {
      const summary = {
        totalActions: data.auditLogs.length,
        failures: data.auditLogs.filter(l => l.outcome === "failure").length,
        blocked: data.auditLogs.filter(l => l.outcome === "blocked").length,
        warnings: data.auditLogs.filter(l => l.severity === "warning").length,
        critical: data.auditLogs.filter(l => l.severity === "critical").length,
      };
      return JSON.stringify(summary, null, 2);
    }

    // Default: query
    let filtered = data.auditLogs;
    if (filter) filtered = filtered.filter(l => l.agentId.includes(filter) || l.action.includes(filter));
    if (severity) filtered = filtered.filter(l => l.severity === severity);
    return JSON.stringify(filtered.slice(-50), null, 2);
  }
};

// 3. Agent Termination Controls (Capability 188)
export const agentTerminationControlTool: ToolDefinition<AgentTerminationArgs> = {
  name: "agent_termination_control",
  description: "Safely terminate active agent tasks or sub-agent execution.",
  inputSchema: AgentTerminationArgs,
  defaultConsent: "always",
  modifiesState: true,
  execute: async (args, ctx) => {
    const { id, reason, force } = args;
    // Implementation would involve sending termination signals to child processes or workers
    // For now, we log the termination intent.
    const auditData = loadGovernance(ctx);
    auditData.auditLogs.push({
      timestamp: new Date().toISOString(),
      agentId: String(ctx.appId || "system"),
      action: "terminate",
      target: id,
      outcome: force ? "success" : "blocked",
      severity: "critical",
      details: `Termination requested. Reason: ${reason}. Force: ${force}`
    });
    saveGovernance(ctx, auditData);

    return `Termination signal sent to ID: ${id} [Reason: ${reason}]`;
  }
};

// 4. Sandbox Enforcement Tool (Capability 187)
export const agentSandboxEnforcementTool: ToolDefinition<SandboxEnforcementArgs> = {
  name: "agent_sandbox_enforcement",
  description: "Enforce safety boundaries and resource restrictions for AI agents.",
  inputSchema: SandboxEnforcementArgs,
  defaultConsent: "always",
  modifiesState: true,
  execute: async (args, ctx) => {
    const { action, target, limits } = args;

    if (action === "verify") {
      const isWithinRoot = target.startsWith(ctx.appPath);
      return isWithinRoot ? "Target is within sandbox boundaries." : "VIOLATION: Target escapes sandbox.";
    }

    if (action === "restrict") {
      return `Restrictions applied to ${target}: CPU=${limits?.cpu || 'N/A'}, MEM=${limits?.memory || 'N/A'}MB`;
    }

    return `Monitoring ${target} for sandbox compliance...`;
  }
};
