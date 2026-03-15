import type {
  ChatHistoryCompatibility,
  ChatRunProvenance,
  ChatRunType,
} from "state/actions/chatHistoryTypes";
import type { EngineConfig } from "utils/generatedTypes";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";

// Owns ProjectChat history compatibility and hydration metadata selection helpers
// so ProjectChat.tsx can stay focused on surface coordination.

export function resolveProjectChatHistoryCompatibility(
  projectHistoryRunType: ChatRunType | null,
  effectiveEngineId: string | null,
): ChatHistoryCompatibility | null {
  if (!projectHistoryRunType) {
    return null;
  }
  return {
    runType: projectHistoryRunType,
    engineConfigId: effectiveEngineId,
  };
}

export function buildProjectChatEngineConfigByChatId(
  chatProvenanceByChatIdMap: Map<string, ChatRunProvenance>,
): Map<string, string | null> {
  const nextByChatId = new Map<string, string | null>();
  for (const [runChatId, provenance] of chatProvenanceByChatIdMap.entries()) {
    nextByChatId.set(runChatId, provenance.engineConfigId);
  }
  return nextByChatId;
}

export function buildProjectChatHydrationMetadataRevision({
  chatId,
  chatProvenanceByChatIdMap,
  engineConfigById,
  selectedChatHydrationAuthority,
  selectedChatRunWatermark,
  agentRunsAuthorityState,
  agentRunsLoadError,
  engineConfigsInitialLoadComplete,
  engineConfigsLoadError,
}: {
  agentRunsAuthorityState: string;
  agentRunsLoadError: string | null;
  chatId: string | null | undefined;
  chatProvenanceByChatIdMap: Map<string, ChatRunProvenance>;
  engineConfigById: Map<string, EngineConfig>;
  engineConfigsInitialLoadComplete: boolean;
  engineConfigsLoadError: string | null;
  selectedChatHydrationAuthority: ReturnType<
    typeof resolveProjectChatHydrationAuthority
  >;
  selectedChatRunWatermark: number;
}): string {
  if (typeof chatId !== "string") {
    return "no-selected-chat";
  }
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return "no-selected-chat";
  }
  const selectedProvenance =
    chatProvenanceByChatIdMap.get(normalizedChatId) ?? null;
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
    selectedChatHydrationAuthority.status,
    selectedChatHydrationAuthority.hydrationRunType ?? "missing_run_type",
    selectedChatHydrationAuthority.blockedErrorCode ?? "not_blocked",
    selectedProvenanceEngineConfigId ?? "missing_engine_config_id",
    selectedEngineRevision,
    selectedChatRunWatermark,
    `runs_${agentRunsAuthorityState}`,
    agentRunsLoadError ?? "runs_ok",
    engineConfigsInitialLoadComplete ? "engines_ready" : "engines_loading",
    engineConfigsLoadError ?? "engines_ok",
  ].join("|");
}
