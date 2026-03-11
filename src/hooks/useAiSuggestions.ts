import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import type { AiSuggestionsResult } from "@/ipc/types/proposals";

/**
 * Fetches AI-generated suggestions for the current chat.
 * Keyed by [chatId, lastMessageId] so it refetches after each new AI response.
 */
export function useAiSuggestions() {
  const chatId = useAtomValue(selectedChatIdAtom);
  const appId = useAtomValue(selectedAppIdAtom);
  const messagesByChat = useAtomValue(chatMessagesByIdAtom);

  // Get the ID of the latest message in this chat (used as cache key)
  const messages = chatId ? (messagesByChat[chatId] ?? []) : [];
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id;

  const { data, isLoading, error } = useQuery<AiSuggestionsResult | null, Error>(
    {
      queryKey: queryKeys.aiSuggestions.forChat({ chatId: chatId ?? undefined, lastMessageId: lastMessageId }),
      queryFn: async (): Promise<AiSuggestionsResult | null> => {
        if (!chatId || !appId) return null;
        // Only generate suggestions if there's at least one AI message
        const hasAssistantMessage = messages.some((m) => m.role === "assistant");
        if (!hasAssistantMessage) return null;
        return ipc.proposal.generateAiSuggestions({ chatId, appId });
      },
      enabled: !!chatId && !!appId && !!lastMessageId,
      staleTime: 60_000, // Cache for 1 min (don't refetch too aggressively)
      meta: { suppressErrorToast: true },
    },
  );

  return {
    suggestions: data?.suggestions ?? [],
    isLoading,
    error,
  };
}
