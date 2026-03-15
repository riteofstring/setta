import { useAIStore } from "state/stores/aiStores";
import { collectChatAppGenerationDetailsByChatId } from "state/utils/chatAppGenerationAgentRuns";
import { mergeChatAppGenerationDetailsByChatId } from "state/utils/chatAppGenerationDetails";
import { res200 } from "utils/endpointUtils";
import { route_get_agent_runs } from "utils/generatedEndpoints";
import { type AgentRun } from "utils/generatedTypes";

let agentRunsLoadPromise: Promise<void> | null = null;
let agentRunsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let agentRunsTransientFailureCount = 0;

const AGENT_RUNS_RETRY_DELAYS_MS = [300, 1000, 2500] as const;

export function refreshAgentRunsAfterSubmit(): void {
  void loadAgentRuns();
}

function clearScheduledAgentRunsRetry(): void {
  if (!agentRunsRetryTimer) {
    return;
  }
  clearTimeout(agentRunsRetryTimer);
  agentRunsRetryTimer = null;
}

function scheduleAgentRunsRetry(transientFailureCount: number): void {
  if (agentRunsRetryTimer) {
    return;
  }
  const delayIndex = Math.max(
    0,
    Math.min(transientFailureCount - 1, AGENT_RUNS_RETRY_DELAYS_MS.length - 1),
  );
  const delayMs = AGENT_RUNS_RETRY_DELAYS_MS[delayIndex] ?? 2500;
  agentRunsRetryTimer = setTimeout(() => {
    agentRunsRetryTimer = null;
    void loadAgentRuns();
  }, delayMs);
}

export async function loadAgentRuns(): Promise<void> {
  if (agentRunsLoadPromise) {
    await agentRunsLoadPromise;
    return;
  }
  const currentState = useAIStore.getState();
  if (
    currentState.agentRunsAuthorityState === "loading" &&
    !currentState.agentRunsInitialLoadComplete &&
    currentState.agentRunsLoadError === null
  ) {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  const currentAuthorityState = currentState.agentRunsAuthorityState;
  if (currentAuthorityState === "terminal_error") {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  if (currentAuthorityState !== "ready") {
    useAIStore.setState({
      agentRunsAuthorityState: "loading",
      agentRunsInitialLoadComplete: false,
    });
  }
  agentRunsLoadPromise = (async () => {
    const res = await route_get_agent_runs();
    if (res200(res)) {
      receiveAgentRunsUpdate(res.data);
      return;
    }
    agentRunsTransientFailureCount += 1;
    if (agentRunsTransientFailureCount <= AGENT_RUNS_RETRY_DELAYS_MS.length) {
      useAIStore.setState({
        agentRunsAuthorityState: "transient_error",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: "Failed to load agent runs",
      });
      scheduleAgentRunsRetry(agentRunsTransientFailureCount);
      return;
    }
    clearScheduledAgentRunsRetry();
    useAIStore.setState({
      agentRunsAuthorityState: "terminal_error",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
    });
  })();
  try {
    await agentRunsLoadPromise;
  } finally {
    agentRunsLoadPromise = null;
  }
}

export function receiveAgentRunUpdate(payload: AgentRun): void {
  useAIStore.setState((state) => {
    const existingIndex = state.agentRuns.findIndex(
      (candidate) => candidate.id === payload.id,
    );
    if (existingIndex === -1) {
      return {
        agentRuns: [payload, ...state.agentRuns],
      };
    }
    const nextRuns = state.agentRuns.slice();
    nextRuns[existingIndex] = payload;
    return {
      agentRuns: nextRuns,
    };
  });
}

function receiveAgentRunsUpdate(payload: AgentRun[]): void {
  clearScheduledAgentRunsRetry();
  agentRunsTransientFailureCount = 0;
  useAIStore.setState((state) => ({
    agentRuns: payload,
    chatAppGenerationDetailsByChatId: mergeChatAppGenerationDetailsByChatId(
      state.chatAppGenerationDetailsByChatId,
      collectChatAppGenerationDetailsByChatId(payload),
    ),
    agentRunsAuthorityState: "ready",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
  }));
}
