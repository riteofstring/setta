import { useAIStore } from "state/stores/aiStores";
import type { AgentRun } from "utils/generatedTypes";

import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";
import { loadAgentRuns } from "./aiAgentRuns";

function resolveEngineConfigIdFromRuns(
  chatId: string,
  runs: AgentRun[],
): string | null {
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
}

export async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }

  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }

  let resolved = resolveEngineConfigIdFromRuns(chatId, agentRuns);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveEngineConfigIdFromRuns(chatId, agentRuns);
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
