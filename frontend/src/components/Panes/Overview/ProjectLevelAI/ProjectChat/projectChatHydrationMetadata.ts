import { type EngineConfig } from "utils/generatedTypes";

type BuildProjectChatHydrationMetadataRevisionInput = {
  chatId: string | null | undefined;
  chatProvenanceByChatIdMap: Map<string, { engineConfigId: string | null }>;
  engineConfigById: Map<string, EngineConfig>;
  selectedChatHydrationAuthorityStatus: string;
  selectedChatHydrationRunType: string | null;
  selectedChatBlockedErrorCode: string | null;
  selectedChatRunWatermark: number;
  agentRunsAuthorityState: string;
  agentRunsLoadError: string | null;
  engineConfigsInitialLoadComplete: boolean;
  engineConfigsLoadError: string | null;
};

// eslint-disable-next-line complexity
export function buildProjectChatHydrationMetadataRevision({
  chatId,
  chatProvenanceByChatIdMap,
  engineConfigById,
  selectedChatHydrationAuthorityStatus,
  selectedChatHydrationRunType,
  selectedChatBlockedErrorCode,
  selectedChatRunWatermark,
  agentRunsAuthorityState,
  agentRunsLoadError,
  engineConfigsInitialLoadComplete,
  engineConfigsLoadError,
}: BuildProjectChatHydrationMetadataRevisionInput): string {
  const normalizedChatId =
    typeof chatId === "string" && chatId.trim() ? chatId.trim() : null;
  const selectedProvenance =
    normalizedChatId !== null
      ? chatProvenanceByChatIdMap.get(normalizedChatId) ?? null
      : null;
  const selectedProvenanceEngineConfigId =
    selectedProvenance?.engineConfigId ?? null;
  const selectedProvenanceEngineConfig = selectedProvenanceEngineConfigId
    ? engineConfigById.get(selectedProvenanceEngineConfigId) ?? null
    : null;
  const selectedEngineRevision = selectedProvenanceEngineConfig
    ? [
        selectedProvenanceEngineConfig.id,
        selectedProvenanceEngineConfig.engineType,
        selectedProvenanceEngineConfig.settaLlmConfigId ?? "",
        selectedProvenanceEngineConfig.externalAgentConfigId ?? "",
      ].join(":")
    : "missing_engine_config";
  return [
    selectedChatHydrationAuthorityStatus,
    selectedChatHydrationRunType ?? "missing_run_type",
    selectedChatBlockedErrorCode ?? "not_blocked",
    selectedProvenanceEngineConfigId ?? "missing_engine_config_id",
    selectedEngineRevision,
    selectedChatRunWatermark,
    `runs_${agentRunsAuthorityState}`,
    agentRunsLoadError ?? "runs_ok",
    engineConfigsInitialLoadComplete ? "engines_ready" : "engines_loading",
    engineConfigsLoadError ?? "engines_ok",
  ].join("|");
}
