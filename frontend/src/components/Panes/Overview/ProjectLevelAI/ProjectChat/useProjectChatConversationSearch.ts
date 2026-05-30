import { useCallback, useEffect, useMemo, useState } from "react";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";

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

  useEffect(() => {
    if (!hasConversationSearchTerms) {
      setConversationSearchMatchCount(0);
      setConversationSearchMatchIndex(null);
      return;
    }
    if (conversationSearchMatchCount === 0) {
      setConversationSearchMatchIndex(null);
      return;
    }
    setConversationSearchMatchIndex((current) =>
      current === null ? 0 : current,
    );
  }, [
    conversationSearchMatchCount,
    conversationSearchQueryKey,
    hasConversationSearchTerms,
  ]);

  useEffect(() => {
    if (conversationSearchMatchCount === 0) {
      setConversationSearchMatchIndex(null);
      return;
    }
    setConversationSearchMatchIndex((current) => {
      if (current === null) {
        return 0;
      }
      if (current >= conversationSearchMatchCount) {
        return conversationSearchMatchCount - 1;
      }
      return current;
    });
  }, [conversationSearchMatchCount]);

  const conversationSearchCounterText =
    conversationSearchMatchCount > 0 && conversationSearchMatchIndex !== null
      ? `${conversationSearchMatchIndex + 1}/${conversationSearchMatchCount}`
      : `0/${conversationSearchMatchCount}`;

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

  useEffect(() => {
    setConversationFilterText("");
  }, [chatId]);

  return {
    conversationFilterText,
    setConversationFilterText,
    conversationSearchMatchCount,
    conversationSearchMatchIndex,
    normalizedConversationSearchTerms,
    hasConversationSearchTerms,
    conversationSearchCounterText,
    handleStepConversationSearch,
    handleConversationSearchMatchCountChange,
  };
}
