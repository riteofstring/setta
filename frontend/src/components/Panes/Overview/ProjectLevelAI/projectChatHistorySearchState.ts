import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { type AgentRun } from "utils/generatedTypes";
import {
  buildProjectChatHistorySearchState,
  type ProjectChatHistoryEntry,
} from "./projectChatHistoryViewModel";

export function useProjectChatHistorySearchQueryState({
  agentRuns,
  displayEntries,
  syntheticDraftThreadEntry,
}: {
  agentRuns: Array<AgentRun>;
  displayEntries: Array<ProjectChatHistoryEntry>;
  syntheticDraftThreadEntry: ProjectChatHistoryEntry | null;
}) {
  const [masterSearchInput, setMasterSearchInput] = useState("");
  const {
    normalizedMasterSearchTerms,
    hasMasterSearch,
    masterSearchMatchCountByChatId,
    sortedEntries,
  } = useMemo(() => {
    return buildProjectChatHistorySearchState({
      agentRuns,
      displayEntries,
      syntheticDraftThreadEntry,
      masterSearchInput,
    });
  }, [agentRuns, displayEntries, masterSearchInput, syntheticDraftThreadEntry]);

  return {
    masterSearchInput,
    setMasterSearchInput,
    normalizedMasterSearchTerms,
    hasMasterSearch,
    masterSearchMatchCountByChatId,
    sortedEntries,
  };
}

export function useProjectChatHistorySearchNavigation({
  hasMasterSearch,
  normalizedMasterSearchTerms,
  orderedVisibleThreadIds,
  threadListScrollRef,
}: {
  hasMasterSearch: boolean;
  normalizedMasterSearchTerms: Array<string>;
  orderedVisibleThreadIds: Array<string>;
  threadListScrollRef: RefObject<HTMLDivElement | null>;
}) {
  const [activeMasterSearchMatchIndex, setActiveMasterSearchMatchIndex] =
    useState<number | null>(null);
  const masterSearchMatchCount = hasMasterSearch
    ? orderedVisibleThreadIds.length
    : 0;
  const masterSearchQueryKey = useMemo(
    () => normalizedMasterSearchTerms.join("\u0000"),
    [normalizedMasterSearchTerms],
  );

  useEffect(() => {
    if (!hasMasterSearch || masterSearchMatchCount === 0) {
      setActiveMasterSearchMatchIndex(null);
      return;
    }
    setActiveMasterSearchMatchIndex(0);
  }, [hasMasterSearch, masterSearchMatchCount, masterSearchQueryKey]);

  useEffect(() => {
    if (masterSearchMatchCount === 0) {
      setActiveMasterSearchMatchIndex(null);
      return;
    }
    setActiveMasterSearchMatchIndex((current) => {
      if (current === null) {
        return 0;
      }
      if (current >= masterSearchMatchCount) {
        return masterSearchMatchCount - 1;
      }
      return current;
    });
  }, [masterSearchMatchCount]);

  const activeMasterSearchMatchThreadId = useMemo(() => {
    if (activeMasterSearchMatchIndex === null) {
      return null;
    }
    return orderedVisibleThreadIds[activeMasterSearchMatchIndex] ?? null;
  }, [activeMasterSearchMatchIndex, orderedVisibleThreadIds]);
  const masterSearchCounterText =
    masterSearchMatchCount > 0 && activeMasterSearchMatchIndex !== null
      ? `${activeMasterSearchMatchIndex + 1}/${masterSearchMatchCount}`
      : `0/${masterSearchMatchCount}`;

  const handleStepMasterSearch = useCallback(
    (direction: "previous" | "next") => {
      if (masterSearchMatchCount === 0) {
        return;
      }
      setActiveMasterSearchMatchIndex((current) => {
        const baseIndex = current ?? 0;
        if (direction === "next") {
          return (baseIndex + 1) % masterSearchMatchCount;
        }
        return (
          (baseIndex - 1 + masterSearchMatchCount) % masterSearchMatchCount
        );
      });
    },
    [masterSearchMatchCount],
  );

  useEffect(() => {
    if (!activeMasterSearchMatchThreadId) {
      return;
    }
    const scrollContainer = threadListScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const target = scrollContainer.querySelector<HTMLElement>(
      `[data-thread-id="${activeMasterSearchMatchThreadId}"]`,
    );
    if (!target) {
      return;
    }
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeMasterSearchMatchThreadId, threadListScrollRef]);

  return {
    activeMasterSearchMatchThreadId,
    masterSearchCounterText,
    masterSearchMatchCount,
    handleStepMasterSearch,
  };
}
