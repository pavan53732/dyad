import { Sparkles, Wrench, CheckCircle2, Zap, Star } from "lucide-react";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useAiSuggestions } from "@/hooks/useAiSuggestions";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import type { AiSuggestion } from "@/ipc/types";

const CATEGORY_CONFIG = {
  fix: {
    icon: Wrench,
    color: "text-red-500",
    border: "border-red-500/30 hover:border-red-500/60",
    bg: "hover:bg-red-500/10",
  },
  complete: {
    icon: CheckCircle2,
    color: "text-yellow-500",
    border: "border-yellow-500/30 hover:border-yellow-500/60",
    bg: "hover:bg-yellow-500/10",
  },
  improve: {
    icon: Zap,
    color: "text-green-500",
    border: "border-green-500/30 hover:border-green-500/60",
    bg: "hover:bg-green-500/10",
  },
  feature: {
    icon: Star,
    color: "text-blue-500",
    border: "border-blue-500/30 hover:border-blue-500/60",
    bg: "hover:bg-blue-500/10",
  },
} as const;

function SuggestionChip({
  suggestion,
  onSelect,
}: {
  suggestion: AiSuggestion;
  onSelect: (text: string) => void;
}) {
  const config = CATEGORY_CONFIG[suggestion.category] ?? CATEGORY_CONFIG.feature;
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(suggestion.text)}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium",
        "border bg-transparent transition-all duration-150 cursor-pointer",
        "text-muted-foreground hover:text-foreground",
        config.border,
        config.bg,
      ].join(" ")}
      title={`Category: ${suggestion.category}`}
    >
      <Icon size={11} className={config.color} />
      <span>{suggestion.text}</span>
    </button>
  );
}

function SkeletonChip() {
  return (
    <div className="h-7 w-36 rounded-full bg-muted/50 animate-pulse" />
  );
}

/**
 * Displays AI-generated, context-aware suggestion chips below the chat area.
 * Each chip is categorized (fix / complete / improve / feature) and clicking
 * it sends that text as the user's next message.
 */
export function AiSuggestionChips() {
  const chatId = useAtomValue(selectedChatIdAtom);
  const appId = useAtomValue(selectedAppIdAtom);
  const { isStreaming, streamMessage } = useStreamChat();
  const { suggestions, isLoading } = useAiSuggestions();

  // Hide when streaming or no chat/app context
  if (isStreaming || !chatId || !appId) return null;

  const handleSelect = (text: string) => {
    if (!chatId) return;
    streamMessage({ prompt: text, chatId, redo: false });
  };

  return (
    <div className="px-3 pb-2 pt-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Header sparkle */}
        <div className="flex items-center gap-1 mr-1 text-muted-foreground/60">
          <Sparkles size={11} />
          <span className="text-[10px] font-medium uppercase tracking-wide">
            Suggestions
          </span>
        </div>

        {/* Skeleton while loading */}
        {isLoading && (
          <>
            <SkeletonChip />
            <SkeletonChip />
            <SkeletonChip />
          </>
        )}

        {/* Actual suggestion chips */}
        {!isLoading &&
          suggestions.map((suggestion, i) => (
            <SuggestionChip
              key={i}
              suggestion={suggestion}
              onSelect={handleSelect}
            />
          ))}
      </div>
    </div>
  );
}
