import React, { useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  isMissionControlPanelOpenAtom,
  agentThoughtsAtom,
  tscErrorsAtom,
  testResultsAtom,
  currentTaskAtom,
  type AgentThought,
  type TSCError,
} from "@/atoms/uiAtoms";
import { isStreamingByIdAtom, chatMessagesByIdAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import {
  X,
  ChevronRight,
  Brain,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Terminal,
  FileCode,
  ListTodo,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// Parse dyad-status tags from message content
function parseDyadStatusFromContent(content: string): AgentThought[] {
  const thoughts: AgentThought[] = [];
  const statusRegex =
    /<dyad-status\s+title="([^"]*)"(?:\s+state="([^"]*)")?>([\s\S]*?)<\/dyad-status>/gi;

  let match;
  let id = 0;
  while ((match = statusRegex.exec(content)) !== null) {
    const title = match[1];
    const state = match[2] || "pending";
    const content_text = match[3].trim();

    // Determine type based on title
    let type: AgentThought["type"] = "thought";
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("type check") || lowerTitle.includes("tsc")) {
      type = "typecheck";
    } else if (lowerTitle.includes("test")) {
      type = "test";
    } else if (lowerTitle.includes("error") || lowerTitle.includes("fix")) {
      type = "error";
    } else if (lowerTitle.includes("task")) {
      type = "task";
    }

    // Determine state
    let thoughtState: AgentThought["state"] = "pending";
    if (state === "finished") {
      thoughtState = "finished";
    } else if (state === "aborted") {
      thoughtState = "aborted";
    } else if (
      content_text.includes("Starting") ||
      content_text.includes("Running")
    ) {
      thoughtState = "in-progress";
    }

    thoughts.push({
      id: `thought-${id++}`,
      title,
      content: content_text,
      state: thoughtState,
      timestamp: Date.now(),
      type,
    });
  }

  return thoughts;
}

// Extract TSC errors from status content
function extractErrorsFromContent(content: string): TSCError[] {
  const errors: TSCError[] = [];
  const errorRegex = /(?:src\/|([^:]+)):(\d+):(\d+):\s*(.+)/g;

  let match;
  while ((match = errorRegex.exec(content)) !== null) {
    const file = match[1] || "unknown";
    const line = parseInt(match[2], 10);
    const column = parseInt(match[3], 10);
    const message = match[4];

    if (message && !message.includes("Found") && !message.includes("error")) {
      errors.push({ file, line, column, message });
    }
  }

  return errors;
}

// Get icon based on thought type
function getThoughtIcon(thought: AgentThought) {
  switch (thought.type) {
    case "typecheck":
      return <FileCode size={14} className="text-blue-400" />;
    case "test":
      return <Play size={14} className="text-purple-400" />;
    case "error":
      return <AlertTriangle size={14} className="text-red-400" />;
    case "task":
      return <ListTodo size={14} className="text-green-400" />;
    default:
      return <Brain size={14} className="text-cyan-400" />;
  }
}

// Get status color based on state
function getStateColor(state: AgentThought["state"]) {
  switch (state) {
    case "finished":
      return "text-green-400";
    case "aborted":
      return "text-red-400";
    case "in-progress":
      return "text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

// Get state icon based on state
function getStateIcon(state: AgentThought["state"]) {
  switch (state) {
    case "finished":
      return <CheckCircle2 size={12} className="text-green-400" />;
    case "aborted":
      return <XCircle size={12} className="text-red-400" />;
    case "in-progress":
      return <Loader2 size={12} className="text-amber-400 animate-spin" />;
    default:
      return (
        <Loader2 size={12} className="text-muted-foreground animate-pulse" />
      );
  }
}

interface MissionControlPanelProps {
  className?: string;
}

export function MissionControlPanel({ className }: MissionControlPanelProps) {
  const [isOpen, setIsOpen] = useAtom(isMissionControlPanelOpenAtom);
  const [thoughts, setThoughts] = useAtom(agentThoughtsAtom);
  const [tscErrors, setTscErrors] = useAtom(tscErrorsAtom);
  const [testResults] = useAtom(testResultsAtom);
  const [currentTask, setCurrentTask] = useAtom(currentTaskAtom);

  const chatId = useAtomValue(selectedChatIdAtom);
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);

  const messages = chatId ? (messagesById.get(chatId) ?? []) : [];
  const isStreaming = chatId ? (isStreamingById.get(chatId) ?? false) : false;

  

  // Parse messages for dyad-status content
  useEffect(() => {
    const allThoughts: AgentThought[] = [];
    const allErrors: TSCError[] = [];

    for (const message of messages) {
      if (message.role === "assistant") {
        const parsed = parseDyadStatusFromContent(message.content);
        allThoughts.push(...parsed);

        // Also extract errors from content
        for (const thought of parsed) {
          const errors = extractErrorsFromContent(thought.content);
          allErrors.push(...errors);
        }
      }
    }

    // Update thoughts (keep most recent)
    setThoughts(allThoughts.slice(-50)); // Keep last 50 thoughts

    // Update errors
    setTscErrors(allErrors);

    // Set current task from latest thought
    const latestThought = allThoughts[allThoughts.length - 1];
    if (latestThought) {
      setCurrentTask(latestThought.title);
    }
  }, [messages, setThoughts, setTscErrors, setCurrentTask]);

  if (!isOpen) {
    return null;
  }

  const pendingThoughts = thoughts.filter(
    (t) => t.state === "pending" || t.state === "in-progress",
  );
  const completedThoughts = thoughts.filter(
    (t) => t.state === "finished" || t.state === "aborted",
  );
  const errorCount = tscErrors.length;
  const passedTests = testResults.filter((t) => t.status === "passed").length;
  const failedTests = testResults.filter((t) => t.status === "failed").length;

  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-border bg-background/95 backdrop-blur-sm",
        className,
      )}
      style={{ width: "320px", minWidth: "320px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold">Mission Control</span>
          {isStreaming && (
            <Loader2 size={12} className="text-amber-400 animate-spin" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsOpen(false)}
        >
          <X size={14} />
        </Button>
      </div>

      {/* Current Task Banner */}
      {currentTask && (
        <div className="px-3 py-2 bg-muted/20 border-b border-border">
          <div className="flex items-center gap-2 text-xs">
            <ListTodo size={12} className="text-green-400" />
            <span className="font-medium truncate">{currentTask}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Status Summary Cards */}
          <div className="grid grid-cols-2 gap-2">
            {/* Active Tasks */}
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={12} className="text-cyan-400" />
                <span className="text-xs text-muted-foreground">Active</span>
              </div>
              <div className="text-lg font-semibold">
                {pendingThoughts.length}
              </div>
            </div>

            {/* Completed */}
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} className="text-green-400" />
                <span className="text-xs text-muted-foreground">Done</span>
              </div>
              <div className="text-lg font-semibold">
                {completedThoughts.length}
              </div>
            </div>

            {/* Errors */}
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle
                  size={12}
                  className={errorCount > 0 ? "text-red-400" : "text-green-400"}
                />
                <span className="text-xs text-muted-foreground">Errors</span>
              </div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  errorCount > 0 ? "text-red-400" : "",
                )}
              >
                {errorCount}
              </div>
            </div>

            {/* Tests */}
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Play size={12} className="text-purple-400" />
                <span className="text-xs text-muted-foreground">Tests</span>
              </div>
              <div className="text-lg font-semibold">
                {passedTests > 0 && (
                  <span className="text-green-400">{passedTests}</span>
                )}
                {passedTests > 0 && failedTests > 0 && (
                  <span className="text-muted">/</span>
                )}
                {failedTests > 0 && (
                  <span className="text-red-400">{failedTests}</span>
                )}
                {passedTests === 0 && failedTests === 0 && (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </div>
            </div>
          </div>

          {/* Agent Thought Stream */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Brain size={12} className="text-cyan-400" />
              Agent Thought Stream
            </h3>

            {thoughts.length === 0 ? (
              <div className="text-xs text-muted-foreground italic bg-muted/10 rounded-lg p-3 text-center">
                {isStreaming
                  ? "Waiting for agent thoughts..."
                  : "No agent activity yet"}
              </div>
            ) : (
              <div className="space-y-1.5">
                {thoughts.slice(-10).map((thought) => (
                  <div
                    key={thought.id}
                    className={cn(
                      "text-xs rounded-lg p-2 border transition-colors",
                      thought.state === "in-progress"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : thought.state === "finished"
                          ? "bg-green-500/5 border-green-500/20"
                          : thought.state === "aborted"
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-muted/20 border-border",
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {getThoughtIcon(thought)}
                      <span className="font-medium truncate flex-1">
                        {thought.title}
                      </span>
                      {getStateIcon(thought.state)}
                    </div>
                    {thought.content && (
                      <div
                        className={cn(
                          "text-[10px] mt-1 ml-5",
                          getStateColor(thought.state),
                        )}
                      >
                        {thought.content.length > 100
                          ? thought.content.substring(0, 100) + "..."
                          : thought.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TSC Errors Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileCode
                size={12}
                className={errorCount > 0 ? "text-red-400" : "text-blue-400"}
              />
              Type Errors {errorCount > 0 && `(${errorCount})`}
            </h3>

            {errorCount === 0 ? (
              <div className="text-xs text-green-400 bg-green-500/10 rounded-lg p-2 flex items-center gap-1.5">
                <CheckCircle2 size={12} />
                No type errors
              </div>
            ) : (
              <Accordion multiple className="space-y-1">
                {tscErrors.slice(0, 5).map((error, idx) => (
                  <AccordionItem
                    key={`${error.file}-${error.line}-${idx}`}
                    value={`error-${idx}`}
                    className="border border-border rounded-lg"
                  >
                    <AccordionTrigger className="px-2 py-1.5 text-xs hover:no-underline">
                      <div className="flex items-center gap-1.5 truncate">
                        <XCircle
                          size={10}
                          className="text-red-400 flex-shrink-0"
                        />
                        <span className="truncate">{error.file}</span>
                        <span className="text-muted-foreground text-[10px]">
                          :{error.line}:{error.column}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-2">
                      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">
                        {error.message}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                ))}
                {errorCount > 5 && (
                  <div className="text-xs text-muted-foreground text-center py-1">
                    +{errorCount - 5} more errors
                  </div>
                )}
              </Accordion>
            )}
          </div>

          {/* Test Results Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Play size={12} className="text-purple-400" />
              Test Results
            </h3>

            {testResults.length === 0 ? (
              <div className="text-xs text-muted-foreground italic bg-muted/10 rounded-lg p-3 text-center">
                No tests run yet
              </div>
            ) : (
              <div className="space-y-1">
                {testResults.slice(-5).map((result, idx) => (
                  <div
                    key={`test-${idx}`}
                    className={cn(
                      "text-xs rounded-lg p-2 border flex items-center gap-2",
                      result.status === "passed"
                        ? "bg-green-500/10 border-green-500/30"
                        : result.status === "failed"
                          ? "bg-red-500/10 border-red-500/30"
                          : result.status === "running"
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-muted/20 border-border",
                    )}
                  >
                    {result.status === "passed" && (
                      <CheckCircle2 size={12} className="text-green-400" />
                    )}
                    {result.status === "failed" && (
                      <XCircle size={12} className="text-red-400" />
                    )}
                    {result.status === "running" && (
                      <Loader2
                        size={12}
                        className="text-amber-400 animate-spin"
                      />
                    )}
                    {result.status === "skipped" && (
                      <span className="text-muted-foreground">-</span>
                    )}
                    <span className="truncate flex-1">{result.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Terminal Output Preview */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Terminal size={12} className="text-green-400" />
              Live Output
            </h3>
            <div className="bg-[#0d1117] rounded-lg p-2 font-mono text-[10px] text-green-400/80 h-24 overflow-hidden">
              {pendingThoughts.length > 0 ? (
                <div className="space-y-0.5">
                  {pendingThoughts.slice(-3).map((thought) => (
                    <div key={thought.id} className="flex items-center gap-1.5">
                      <span className="text-amber-400">{">"}</span>
                      <span className="truncate">{thought.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">
                  $ Waiting for agent...
                </span>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Collapsible toggle button for the panel
export function MissionControlToggle() {
  const [isOpen, setIsOpen] = useAtom(isMissionControlPanelOpenAtom);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 transition-all",
        isOpen ? "bg-muted" : "hover:bg-muted/50",
      )}
      onClick={() => setIsOpen(!isOpen)}
      title={isOpen ? "Close Mission Control" : "Open Mission Control"}
    >
      {isOpen ? (
        <ChevronRight size={16} />
      ) : (
        <Sparkles size={16} className="text-cyan-400" />
      )}
    </Button>
  );
}

export default MissionControlPanel;
