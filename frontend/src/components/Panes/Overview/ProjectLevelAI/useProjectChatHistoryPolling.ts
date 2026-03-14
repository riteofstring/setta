import { useEffect, useMemo } from "react";
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import { resolveProjectChatHistoryPollIntervalMs } from "./projectChatHistoryViewModel";

export function useProjectChatHistoryPolling({
  hasLoadError,
  hasRunningHistoryEntry,
  selectedChatMissingFromHistory,
}: {
  hasLoadError: boolean;
  hasRunningHistoryEntry: boolean;
  selectedChatMissingFromHistory: boolean;
}) {
  const historyPollIntervalMs = useMemo(() => {
    return resolveProjectChatHistoryPollIntervalMs({
      hasLoadError,
      hasRunningHistoryEntry,
      selectedChatMissingFromHistory,
    });
  }, [hasLoadError, hasRunningHistoryEntry, selectedChatMissingFromHistory]);

  useEffect(() => {
    void loadAgentRuns();
  }, []);

  useEffect(() => {
    if (historyPollIntervalMs === null) {
      return;
    }
    let intervalId: number | null = null;
    const clearPollingInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPollingIfVisible = () => {
      clearPollingInterval();
      if (document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        void loadAgentRuns();
      }, historyPollIntervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearPollingInterval();
        return;
      }
      void loadAgentRuns();
      startPollingIfVisible();
    };

    void loadAgentRuns();
    startPollingIfVisible();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [historyPollIntervalMs]);
}
