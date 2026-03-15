import { useCallback, useEffect, useMemo, useState } from "react";

import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import {
  buildProjectChatConversationSearchCounterText,
  resolveProjectChatConversationSearchIndexAfterCountChange,
  resolveProjectChatConversationSearchIndexAfterQueryChange,
} from "./projectChatSurfaceViewModel";

export function useProjectChatConversationSearch({
  chatId,
}: {
  chatId: string | null | undefined;
}) {
  const [conversationFilterText, setConversationFilterText] = useState("");
  const [conversationSearchMatchCount, setConversationSearchMatchCount] =
    useState(0);
  const [conversationSearchMatchIndex, setConversationSearchMatchIndex] =
    useState<number | null>(null);

  const normalizedConversationSearchTerms = useMemo(
    () => tokenizeConversationSearchQuery(conversationFilterText),
    [conversationFilterText],
  );
  const hasConversationSearchTerms =
    normalizedConversationSearchTerms.length > 0;
  const conversationSearchQueryKey = useMemo(
    () => normalizedConversationSearchTerms.join("\u0000"),
    [normalizedConversationSearchTerms],
  );
  const conversationSearchCounterText = useMemo(
    () =>
      buildProjectChatConversationSearchCounterText({
        conversationSearchMatchCount,
        conversationSearchMatchIndex,
      }),
    [conversationSearchMatchCount, conversationSearchMatchIndex],
  );

  useEffect(() => {
    setConversationFilterText("");
  }, [chatId]);

  useEffect(() => {
    setConversationSearchMatchIndex((currentIndex) =>
      resolveProjectChatConversationSearchIndexAfterQueryChange({
        hasConversationSearchTerms,
        conversationSearchMatchCount,
        currentIndex,
      }),
    );
  }, [
    conversationSearchMatchCount,
    conversationSearchQueryKey,
    hasConversationSearchTerms,
  ]);

  useEffect(() => {
    setConversationSearchMatchIndex((currentIndex) =>
      resolveProjectChatConversationSearchIndexAfterCountChange({
        conversationSearchMatchCount,
        currentIndex,
      }),
    );
  }, [conversationSearchMatchCount]);

  const handleStepConversationSearch = useCallback(
    (direction: "previous" | "next") => {
      if (conversationSearchMatchCount === 0) {
        return;
      }
      setConversationSearchMatchIndex((current) => {
        const baseIndex = current ?? 0;
        if (direction === "next") {
          return (baseIndex + 1) % conversationSearchMatchCount;
        }
        return (
          (baseIndex - 1 + conversationSearchMatchCount) %
          conversationSearchMatchCount
        );
      });
    },
    [conversationSearchMatchCount],
  );

  const handleConversationSearchMatchCountChange = useCallback(
    (nextCount: number) => {
      setConversationSearchMatchCount((currentCount) =>
        currentCount === nextCount ? currentCount : nextCount,
      );
    },
    [],
  );

  return {
    conversationFilterText,
    setConversationFilterText,
    conversationSearchCounterText,
    conversationSearchMatchCount,
    conversationSearchMatchIndex,
    hasConversationSearchTerms,
    handleConversationSearchMatchCountChange,
    handleStepConversationSearch,
  };
}
