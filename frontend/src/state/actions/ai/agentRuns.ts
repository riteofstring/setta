import { useAIStore } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_agent_runs } from "utils/generatedEndpoints";
import { type AgentRun, AgentRunStatusEnum } from "utils/generatedTypes";
import { getRunInputString, getRunLastUpdatedMs } from "../agentRunUtils";

let agentRunsLoadPromise: Promise<void> | null = null;
let agentRunsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let agentRunsTransientFailureCount = 0;
const AGENT_RUNS_RETRY_DELAYS_MS = [300, 1000, 2500] as const;

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

function receiveAgentRunsUpdate(payload: Array<AgentRun>) {
  clearScheduledAgentRunsRetry();
  agentRunsTransientFailureCount = 0;
  useAIStore.setState({
    agentRuns: payload,
    agentRunsAuthorityState: "ready",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
  });
}

export async function loadAgentRuns() {
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

export async function findLatestRunningExternalRunId(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  const runs = agentRuns.filter((run) => {
    if (run.status !== AgentRunStatusEnum.running) {
      return false;
    }
    const inputs = run.inputs ?? {};
    const runType = typeof inputs.runType === "string" ? inputs.runType : null;
    if (runType !== "external_agent") {
      return false;
    }
    const runChatId = typeof inputs.chatId === "string" ? inputs.chatId : null;
    if (runChatId !== chatId) {
      return false;
    }
    const runProjectConfigId =
      typeof inputs.projectConfigId === "string"
        ? inputs.projectConfigId
        : null;
    if (projectConfigId && runProjectConfigId !== projectConfigId) {
      return false;
    }
    return true;
  });
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a));
  return runs[0]?.id ?? null;
}

export async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }
  const resolveFromRuns = (runs: AgentRun[]): string | null => {
    const matchingRuns = runs.filter(
      (run) => getRunInputString(run, "chatId") === chatId,
    );
    const runsWithEngine = matchingRuns.filter((run) =>
      getRunInputString(run, "engineConfigId"),
    );
    if (runsWithEngine.length === 0) {
      return null;
    }
    const [latestRun] = [...runsWithEngine].sort(
      (a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a),
    );
    return latestRun ? getRunInputString(latestRun, "engineConfigId") : null;
  };

  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  let resolved = resolveFromRuns(agentRuns);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveFromRuns(agentRuns);
  }
  if (resolved) {
    return resolved;
  }
  const { chatDetails, engineConfigs } = useAIStore.getState();
  const llmConfigId = chatDetails[chatId]?.llmConfig?.id ?? null;
  if (!llmConfigId) {
    return null;
  }
  const matchingEngine = engineConfigs.find(
    (config) => config.settaLlmConfigId === llmConfigId,
  );
  return matchingEngine?.id ?? null;
}
