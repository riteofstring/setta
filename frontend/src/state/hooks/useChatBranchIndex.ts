import { useEffect, useMemo } from "react";
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import {
  buildChatBranchIndex,
  ChatBranchIndex,
} from "state/actions/aiBranches";
import { useAIStore } from "state/definitions";
import { shallow } from "zustand/shallow";

export function useChatBranchIndex(enabled: boolean): ChatBranchIndex {
  const { agentRuns, agentRunsInitialLoadComplete } = useAIStore(
    (state) => ({
      agentRuns: state.agentRuns,
      agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
    }),
    shallow,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete, enabled]);

  return useMemo(() => buildChatBranchIndex(agentRuns), [agentRuns]);
}
