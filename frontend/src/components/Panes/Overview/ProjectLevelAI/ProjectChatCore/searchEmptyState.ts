import { useEffect } from "react";

export function useProjectChatSearchEmptyMatchCountReset({
  onConversationSearchMatchCountChange,
  showConversationSearchEmptyState,
  showEmptyState,
}: {
  onConversationSearchMatchCountChange?: (count: number) => void;
  showConversationSearchEmptyState: boolean;
  showEmptyState: boolean;
}) {
  useEffect(() => {
    if (!showEmptyState && !showConversationSearchEmptyState) {
      return;
    }
    onConversationSearchMatchCountChange?.(0);
  }, [
    onConversationSearchMatchCountChange,
    showConversationSearchEmptyState,
    showEmptyState,
  ]);
}
