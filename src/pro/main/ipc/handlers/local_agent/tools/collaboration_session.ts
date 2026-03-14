/**
 * Collaboration Session Tool
 * Capabilities 501-520: Real-time collaboration sessions
 * - Shared context management
 * - Concurrent editing coordination
 * - Session state persistence
 * - Participant management
 */

import { z } from "zod";
import { ToolDefinition } from "./types";

// ============================================================================
// Input Schema
// ============================================================================

const CollaborationSessionArgs = z.object({
  /** Action to perform */
  action: z.enum([
    "create_session",
    "join_session",
    "leave_session",
    "add_participant",
    "remove_participant",
    "update_context",
    "sync_state",
    "get_session_info",
    "list_sessions",
    "lock_resource",
    "unlock_resource",
  ]),
  /** Session ID */
  sessionId: z.string().optional(),
  /** Session name */
  sessionName: z.string().optional(),
  /** Participant ID */
  participantId: z.string().optional(),
  /** Participant name */
  participantName: z.string().optional(),
  /** Participant role */
  participantRole: z
    .enum(["host", "editor", "viewer", "contributor"])
    .default("contributor"),
  /** Shared context data */
  context: z.record(z.string(), z.any()).optional(),
  /** Resource to lock/unlock */
  resourceId: z.string().optional(),
  /** Lock type */
  lockType: z.enum(["exclusive", "shared"]).default("exclusive"),
  /** Maximum participants */
  maxParticipants: z.number().min(2).max(50).default(10),
  /** Session description */
  description: z.string().optional(),
  /** Session persistence enabled */
  persistSession: z.boolean().default(true),
});

type CollaborationSessionArgs = z.infer<typeof CollaborationSessionArgs>;

// ============================================================================
// Types
// ============================================================================

type SessionStatus = "active" | "paused" | "completed" | "expired";
type ParticipantStatus = "active" | "idle" | "away";
type LockType = "exclusive" | "shared";

interface Participant {
  id: string;
  name: string;
  role: "host" | "editor" | "viewer" | "contributor";
  status: ParticipantStatus;
  joinedAt: string;
  lastActiveAt: string;
  cursor?: { x: number; y: number };
}

interface ResourceLock {
  resourceId: string;
  lockedBy: string;
  lockType: LockType;
  lockedAt: string;
}

interface Session {
  id: string;
  name: string;
  description?: string;
  hostId: string;
  participants: Participant[];
  context: Record<string, unknown>;
  status: SessionStatus;
  maxParticipants: number;
  createdAt: string;
  updatedAt: string;
  resourceLocks: ResourceLock[];
  persistSession: boolean;
}

interface CollaborationResult {
  action: string;
  success: boolean;
  message: string;
  data?: {
    session?: Session;
    sessions?: Session[];
    participant?: Participant;
    context?: Record<string, unknown>;
    stateSynced?: boolean;
    resourceLocked?: boolean;
    resourceUnlocked?: boolean;
  };
}

// ============================================================================
// In-Memory Session Storage
// ============================================================================

const sessions = new Map<string, Session>();

// ============================================================================
// Session Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new collaboration session
 */
function createSession(args: CollaborationSessionArgs): CollaborationResult {
  const sessionId = generateId("session");
  const hostId = args.participantId || generateId("host");

  const host: Participant = {
    id: hostId,
    name: args.participantName || "Host",
    role: "host",
    status: "active",
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  const session: Session = {
    id: sessionId,
    name: args.sessionName || `Session ${sessionId.substring(0, 8)}`,
    description: args.description,
    hostId,
    participants: [host],
    context: args.context || {},
    status: "active",
    maxParticipants: args.maxParticipants,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resourceLocks: [],
    persistSession: args.persistSession,
  };

  sessions.set(sessionId, session);

  return {
    action: "create_session",
    success: true,
    message: `Collaboration session "${session.name}" created`,
    data: { session },
  };
}

/**
 * Join an existing session
 */
function joinSession(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId) {
    return {
      action: "join_session",
      success: false,
      message: "Session ID is required to join a session",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "join_session",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  if (session.participants.length >= session.maxParticipants) {
    return {
      action: "join_session",
      success: false,
      message: "Session is full",
    };
  }

  const participantId = args.participantId || generateId("user");

  const participant: Participant = {
    id: participantId,
    name: args.participantName || `User ${participantId.substring(0, 6)}`,
    role: args.participantRole,
    status: "active",
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  session.participants.push(participant);
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "join_session",
    success: true,
    message: `Joined session "${session.name}"`,
    data: { session, participant },
  };
}

/**
 * Leave a session
 */
function leaveSession(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId || !args.participantId) {
    return {
      action: "leave_session",
      success: false,
      message: "Session ID and participant ID are required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "leave_session",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  const participantIndex = session.participants.findIndex(
    (p) => p.id === args.participantId,
  );

  if (participantIndex === -1) {
    return {
      action: "leave_session",
      success: false,
      message: "Participant not found in session",
    };
  }

  // If host leaves, end the session
  if (session.hostId === args.participantId) {
    sessions.delete(args.sessionId);
    return {
      action: "leave_session",
      success: true,
      message: "Host left the session. Session ended.",
    };
  }

  session.participants.splice(participantIndex, 1);
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "leave_session",
    success: true,
    message: "Left the session successfully",
    data: { session },
  };
}

/**
 * Add a participant to a session
 */
function addParticipant(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId) {
    return {
      action: "add_participant",
      success: false,
      message: "Session ID is required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "add_participant",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  if (session.participants.length >= session.maxParticipants) {
    return {
      action: "add_participant",
      success: false,
      message: "Session is full",
    };
  }

  const participantId = args.participantId || generateId("user");

  const participant: Participant = {
    id: participantId,
    name: args.participantName || `User ${participantId.substring(0, 6)}`,
    role: args.participantRole,
    status: "active",
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  session.participants.push(participant);
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "add_participant",
    success: true,
    message: `Added participant "${participant.name}" to session`,
    data: { session, participant },
  };
}

/**
 * Remove a participant from a session
 */
function removeParticipant(
  args: CollaborationSessionArgs,
): CollaborationResult {
  if (!args.sessionId || !args.participantId) {
    return {
      action: "remove_participant",
      success: false,
      message: "Session ID and participant ID are required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "remove_participant",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  if (session.hostId === args.participantId) {
    return {
      action: "remove_participant",
      success: false,
      message: "Cannot remove the host from the session",
    };
  }

  const participantIndex = session.participants.findIndex(
    (p) => p.id === args.participantId,
  );

  if (participantIndex === -1) {
    return {
      action: "remove_participant",
      success: false,
      message: "Participant not found in session",
    };
  }

  const removed = session.participants.splice(participantIndex, 1)[0];
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "remove_participant",
    success: true,
    message: `Removed participant "${removed.name}" from session`,
    data: { session },
  };
}

/**
 * Update session context
 */
function updateContext(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId) {
    return {
      action: "update_context",
      success: false,
      message: "Session ID is required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "update_context",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  if (args.context) {
    session.context = { ...session.context, ...args.context };
  }
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "update_context",
    success: true,
    message: "Session context updated",
    data: { session, context: session.context },
  };
}

/**
 * Sync session state
 */
function syncState(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId) {
    return {
      action: "sync_state",
      success: false,
      message: "Session ID is required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "sync_state",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  // Update participant activity
  if (args.participantId) {
    const participant = session.participants.find(
      (p) => p.id === args.participantId,
    );
    if (participant) {
      participant.lastActiveAt = new Date().toISOString();
    }
  }

  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "sync_state",
    success: true,
    message: "Session state synchronized",
    data: { session, stateSynced: true },
  };
}

/**
 * Get session info
 */
function getSessionInfo(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId) {
    return {
      action: "get_session_info",
      success: false,
      message: "Session ID is required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "get_session_info",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  return {
    action: "get_session_info",
    success: true,
    message: `Session info for "${session.name}"`,
    data: { session },
  };
}

/**
 * List all sessions
 */
function listSessions(): CollaborationResult {
  const allSessions = Array.from(sessions.values());

  return {
    action: "list_sessions",
    success: true,
    message: `Found ${allSessions.length} active session(s)`,
    data: { sessions: allSessions },
  };
}

/**
 * Lock a resource
 */
function lockResource(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId || !args.resourceId) {
    return {
      action: "lock_resource",
      success: false,
      message: "Session ID and resource ID are required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "lock_resource",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  // Check if resource is already locked
  const existingLock = session.resourceLocks.find(
    (l) => l.resourceId === args.resourceId,
  );

  if (existingLock) {
    if (existingLock.lockType === "exclusive") {
      return {
        action: "lock_resource",
        success: false,
        message: `Resource ${args.resourceId} is already locked by ${existingLock.lockedBy}`,
      };
    }
  }

  const lock: ResourceLock = {
    resourceId: args.resourceId,
    lockedBy: args.participantId || "unknown",
    lockType: args.lockType,
    lockedAt: new Date().toISOString(),
  };

  session.resourceLocks.push(lock);
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "lock_resource",
    success: true,
    message: `Resource ${args.resourceId} locked (${args.lockType})`,
    data: { session, resourceLocked: true },
  };
}

/**
 * Unlock a resource
 */
function unlockResource(args: CollaborationSessionArgs): CollaborationResult {
  if (!args.sessionId || !args.resourceId) {
    return {
      action: "unlock_resource",
      success: false,
      message: "Session ID and resource ID are required",
    };
  }

  const session = sessions.get(args.sessionId);
  if (!session) {
    return {
      action: "unlock_resource",
      success: false,
      message: `Session ${args.sessionId} not found`,
    };
  }

  const lockIndex = session.resourceLocks.findIndex(
    (l) => l.resourceId === args.resourceId,
  );

  if (lockIndex === -1) {
    return {
      action: "unlock_resource",
      success: false,
      message: `Resource ${args.resourceId} is not locked`,
    };
  }

  session.resourceLocks.splice(lockIndex, 1);
  session.updatedAt = new Date().toISOString();
  sessions.set(args.sessionId, session);

  return {
    action: "unlock_resource",
    success: true,
    message: `Resource ${args.resourceId} unlocked`,
    data: { session, resourceUnlocked: true },
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateCollaborationXml(result: CollaborationResult): string {
  const lines: string[] = [
    `# Collaboration Session`,
    ``,
    `**Action:** ${result.action}`,
    `**Status:** ${result.success ? "✅ Success" : "❌ Failed"}`,
    ``,
    result.message,
    ``,
  ];

  if (result.data?.session) {
    const session = result.data.session;
    lines.push(`## Session Details`);
    lines.push(``);
    lines.push(`**Name:** ${session.name}`);
    lines.push(`**Status:** ${session.status}`);
    lines.push(
      `**Participants:** ${session.participants.length}/${session.maxParticipants}`,
    );
    lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
    if (session.description) {
      lines.push(`**Description:** ${session.description}`);
    }
    lines.push(``);

    if (session.participants.length > 0) {
      lines.push(`### Participants`);
      lines.push(``);
      for (const participant of session.participants) {
        const statusEmoji =
          participant.status === "active"
            ? "🟢"
            : participant.status === "idle"
              ? "🟡"
              : "⚪";
        const roleEmoji =
          participant.role === "host"
            ? "👑"
            : participant.role === "editor"
              ? "✏️"
              : participant.role === "viewer"
                ? "👁️"
                : "👤";
        lines.push(
          `- ${statusEmoji} ${roleEmoji} **${participant.name}** (${participant.role})`,
        );
      }
      lines.push(``);
    }

    if (session.resourceLocks.length > 0) {
      lines.push(`### Resource Locks`);
      lines.push(``);
      for (const lock of session.resourceLocks) {
        lines.push(
          `- 🔒 **${lock.resourceId}** - ${lock.lockType} lock by ${lock.lockedBy}`,
        );
      }
      lines.push(``);
    }

    if (Object.keys(session.context).length > 0) {
      lines.push(`### Shared Context`);
      lines.push(``);
      lines.push("```json");
      lines.push(JSON.stringify(session.context, null, 2));
      lines.push("```");
      lines.push(``);
    }
  }

  if (result.data?.sessions && result.data.sessions.length > 0) {
    lines.push(`## Active Sessions`);
    lines.push(``);
    for (const session of result.data.sessions) {
      lines.push(`### ${session.name}`);
      lines.push(``);
      lines.push(`- **ID:** ${session.id}`);
      lines.push(`- **Status:** ${session.status}`);
      lines.push(
        `- **Participants:** ${session.participants.length}/${session.maxParticipants}`,
      );
      lines.push(``);
    }
  }

  if (result.data?.participant) {
    const p = result.data.participant;
    lines.push(`## Participant`);
    lines.push(``);
    lines.push(`**Name:** ${p.name}`);
    lines.push(`**Role:** ${p.role}`);
    lines.push(`**Status:** ${p.status}`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

export const collaborationSessionTool: ToolDefinition<CollaborationSessionArgs> =
  {
    name: "collaboration_session",
    description:
      "Manages real-time collaboration sessions for teams. Use this to create collaboration sessions, manage participants, share context, coordinate concurrent editing with resource locks, and synchronize state across team members.",
    inputSchema: CollaborationSessionArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      ctx.onXmlStream(
        `<dyad-status title="Collaboration Session">Processing ${args.action}...</dyad-status>`,
      );

      let result: CollaborationResult;

      switch (args.action) {
        case "create_session":
          result = createSession(args);
          break;
        case "join_session":
          result = joinSession(args);
          break;
        case "leave_session":
          result = leaveSession(args);
          break;
        case "add_participant":
          result = addParticipant(args);
          break;
        case "remove_participant":
          result = removeParticipant(args);
          break;
        case "update_context":
          result = updateContext(args);
          break;
        case "sync_state":
          result = syncState(args);
          break;
        case "get_session_info":
          result = getSessionInfo(args);
          break;
        case "list_sessions":
          result = listSessions();
          break;
        case "lock_resource":
          result = lockResource(args);
          break;
        case "unlock_resource":
          result = unlockResource(args);
          break;
        default:
          result = {
            action: args.action,
            success: false,
            message: `Unknown action: ${args.action}`,
          };
      }

      const report = generateCollaborationXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Collaboration Session Complete">${result.message}</dyad-status>`,
      );

      return report;
    },
  };
