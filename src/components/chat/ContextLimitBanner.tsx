import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSummarizeInNewChat } from "./SummarizeInNewChatButton";

const CONTEXT_LIMIT_THRESHOLD = 40_000;
const LONG_CONTEXT_THRESHOLD = 200_000;

// Minimum number of messages before showing context warnings
// This prevents false warnings for new chats with large system context
const MIN_MESSAGES_FOR_WARNING = 10;

// Minimum percentage of context window used before showing warnings
// This prevents warnings when context usage is low
// Set to 80% to make warnings appear only when truly critical
const MIN_CONTEXT_USAGE_PERCENT = 0.8; // 80%

interface ContextLimitBannerProps {
  totalTokens?: number | null;
  contextWindow?: number;
  messageCount?: number;
}

/** Check if the context limit banner should be shown */
export function shouldShowContextLimitBanner({
  totalTokens,
  contextWindow,
  messageCount = 0,
}: ContextLimitBannerProps): boolean {
  if (!totalTokens || !contextWindow) {
    return false;
  }

  // Don't show warning for new chats with few messages
  // The initial system context (prompts, tool definitions, codebase) is expected to be large
  // We need at least 10 messages before we start worrying about context
  if (messageCount < MIN_MESSAGES_FOR_WARNING) {
    return false;
  }

  // Calculate context usage percentage
  const contextUsagePercent = totalTokens / contextWindow;

  // Only show warning if context usage is VERY high (80%+)
  // This matches how Lovable handles it - no warnings until truly critical
  if (contextUsagePercent < MIN_CONTEXT_USAGE_PERCENT) {
    return false;
  }

  // Show if long context (costs extra) - only after minimum messages
  if (totalTokens > LONG_CONTEXT_THRESHOLD) {
    return true;
  }

  // Show if close to context limit - only after minimum messages
  const tokensRemaining = contextWindow - totalTokens;
  return tokensRemaining <= CONTEXT_LIMIT_THRESHOLD;
}

export function ContextLimitBanner({
  totalTokens,
  contextWindow,
  messageCount = 0,
}: ContextLimitBannerProps) {
  const { handleSummarize } = useSummarizeInNewChat();

  if (
    !shouldShowContextLimitBanner({ totalTokens, contextWindow, messageCount })
  ) {
    return null;
  }

  const tokensRemaining = contextWindow! - totalTokens!;
  const isNearLimit = tokensRemaining <= CONTEXT_LIMIT_THRESHOLD;
  const message = isNearLimit
    ? "This chat context is running out"
    : "Long chat context costs extra";

  return (
    <div
      className="mx-auto max-w-3xl px-3 py-1.5 rounded-t-2xl border-t border-l border-r border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-xs text-amber-600 dark:text-amber-500"
      data-testid="context-limit-banner"
    >
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{message}</span>
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              onClick={handleSummarize}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/60"
            />
          }
        >
          Summarize
          <ArrowRight className="h-3 w-3 ml-1" />
        </TooltipTrigger>
        <TooltipContent>Summarize to new chat</TooltipContent>
      </Tooltip>
    </div>
  );
}
