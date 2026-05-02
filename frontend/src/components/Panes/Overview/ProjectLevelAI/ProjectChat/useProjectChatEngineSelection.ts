import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
import {
  buildEngineGroups,
  getChatPlaceholderText,
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
  resolveSelectableLLMConfigId,
} from "components/Chat/llmConfigUtils";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import type { HttpapiExternalAgentPreflightStatus } from "openapi/http";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { saveLLMConfig, updateEngineConfig } from "state/actions/ai";
import { type ChatRunType } from "state/actions/chatHistory";
import { addPersistentNotification } from "state/actions/notifications";
import {
  useAIStore,
  type APIKeys,
  type ProjectChatAuxView,
} from "state/definitions";
import {
  AllConfigs,
  ChatDictationModeEnum,
  EngineTypeEnum,
  NotificationTypeEnum,
  type ChatDictationMode,
  type EngineConfig,
  type ExternalAgentConfig,
  type TranscriptionProfile,
} from "utils/generatedTypes";
import {
  resolveProjectChatEngineConfigIdForSelectedChat,
  resolveProjectChatEngineSwitchContinuationAfterContextChange,
  resolveProjectChatEngineSwitchContinuationOnEngineChange,
  resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad,
  resolveProjectChatSelectedLLMUnavailableReason,
  shouldProjectChatSkipEngineSyncForContinuation,
  type ProjectChatEngineSwitchContinuation,
} from "../projectChatConversationState";
import { getDefaultProjectChatPermissionMode } from "../projectChatCoreUtils";

type UseProjectChatEngineSelectionInput = {
  apiKeys: APIKeys;
  apiKeysAuthoritative: boolean;
  allLLMConfigs: AllConfigs | null;
  externalAgentConfigs: ExternalAgentConfig[];
  externalAgentHealth: HttpapiExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
  engineConfigs: EngineConfig[];
  engineConfigsInitialLoadComplete: boolean;
  transcriptionProfiles: TranscriptionProfile[];
  transcriptionProfilesInitialLoadComplete: boolean;
  projectChatDictationMode: ChatDictationMode;
  projectChatTranscriptionProfileId: string | null;
  defaultSelectedEngineId: string | null;
  runtimePermissionMode: ChatPermissionModeValue;
  setRuntimePermissionMode: (value: ChatPermissionModeValue) => void;
  chatId: string | null | undefined;
  setChatId: (next: SetStateAction<string | null | undefined>) => void;
  chatEngineConfigByChatId: Map<string, string | null>;
  engineSwitchContinuation: ProjectChatEngineSwitchContinuation | null;
  setEngineSwitchContinuation: Dispatch<
    SetStateAction<ProjectChatEngineSwitchContinuation | null>
  >;
  setProjectChatAuxView: (nextAuxView: ProjectChatAuxView) => void;
  setDraftThreadStateToNone: () => void;
  setDraftThreadTargetGroupId: (groupId: string | null) => void;
  setSelectedThreadGroupId: (groupId: string | null) => void;
};

// eslint-disable-next-line complexity
export function useProjectChatEngineSelection({
  apiKeys,
  apiKeysAuthoritative,
  allLLMConfigs,
  externalAgentConfigs,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
  engineConfigs,
  engineConfigsInitialLoadComplete,
  transcriptionProfiles,
  transcriptionProfilesInitialLoadComplete,
  projectChatDictationMode,
  projectChatTranscriptionProfileId,
  defaultSelectedEngineId,
  runtimePermissionMode,
  setRuntimePermissionMode,
  chatId,
  setChatId,
  chatEngineConfigByChatId,
  engineSwitchContinuation,
  setEngineSwitchContinuation,
  setProjectChatAuxView,
  setDraftThreadStateToNone,
  setDraftThreadTargetGroupId,
  setSelectedThreadGroupId,
}: UseProjectChatEngineSelectionInput) {
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(
    defaultSelectedEngineId,
  );
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);
  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [apiKeys, allLLMConfigs],
  );
  const availableConfigIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of availableConfigGroups) {
      for (const item of group.items) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [availableConfigGroups]);
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
  );
  const engineConfigById = useMemo(() => {
    const nextById = new Map<string, EngineConfig>();
    for (const config of engineConfigs) {
      nextById.set(config.id, config);
    }
    return nextById;
  }, [engineConfigs]);
  const transcriptionProfileGroups = useMemo<AllItemsType<string>>(
    () => [
      {
        group: "Transcription Profiles",
        items: transcriptionProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name || profile.id,
        })),
      },
    ],
    [transcriptionProfiles],
  );
  const preferredEngineId = useMemo(
    () =>
      findPreferredEngineId({
        engineConfigs,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      }),
    [
      allLLMConfigs,
      availableConfigIds,
      engineConfigs,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );

  const availableConfigCount = countLLMConfigs(availableConfigGroups);
  const noConfigsAvailable = availableConfigCount === 0;
  const selectedEngineConfig = useMemo(() => {
    if (!selectedEngineId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === selectedEngineId) ?? null
    );
  }, [engineConfigs, selectedEngineId]);
  const effectiveEngineConfig = useMemo(() => {
    if (selectedEngineConfig) {
      return selectedEngineConfig;
    }
    if (preferredEngineId) {
      return (
        engineConfigs.find((config) => config.id === preferredEngineId) ?? null
      );
    }
    return engineConfigs[0] ?? null;
  }, [engineConfigs, preferredEngineId, selectedEngineConfig]);
  const effectiveEngineId = effectiveEngineConfig?.id ?? null;
  const engineType = effectiveEngineConfig?.engineType ?? null;
  const selectedLLMConfigId = useMemo(() => {
    if (!effectiveEngineConfig) {
      return null;
    }
    if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      effectiveEngineConfig.settaLlmConfigId ??
      pickDefaultConfigId(allLLMConfigs)
    );
  }, [allLLMConfigs, effectiveEngineConfig]);
  const selectedTranscriptionProfile = useMemo(() => {
    if (!projectChatTranscriptionProfileId) {
      return null;
    }
    return (
      transcriptionProfiles.find(
        (profile) => profile.id === projectChatTranscriptionProfileId,
      ) ?? null
    );
  }, [projectChatTranscriptionProfileId, transcriptionProfiles]);
  const { providerDictationAvailable, providerDictationUnavailableReason } =
    useMemo(
      () =>
        resolveProviderDictationAvailability({
          selectedTranscriptionProfile,
          allLLMConfigs,
          apiKeys,
          apiKeysAuthoritative,
        }),
      [
        allLLMConfigs,
        apiKeys,
        apiKeysAuthoritative,
        selectedTranscriptionProfile,
      ],
    );
  const defaultLLMConfigId = allLLMConfigs?.default_config_id ?? null;
  const providerDictationLikelySupported = providerDictationAvailable;
  const hasLLMConfig = Boolean(
    selectedLLMConfigId && availableConfigIds.has(selectedLLMConfigId),
  );
  const selectableLLMConfigId = useMemo(
    () =>
      resolveSelectableLLMConfigId(availableConfigGroups, selectedLLMConfigId),
    [availableConfigGroups, selectedLLMConfigId],
  );
  const llmSelectionUnavailableReason = useMemo(
    () =>
      resolveProjectChatSelectedLLMUnavailableReason({
        engineType,
        selectedLLMConfigId,
        allLLMConfigs,
        availableConfigIds,
      }),
    [allLLMConfigs, availableConfigIds, engineType, selectedLLMConfigId],
  );
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        effectiveEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      effectiveEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalEngineAvailable = externalEngineStatus
    ? externalEngineStatus.status === "available"
    : true;
  const externalAgentConfig = useMemo(() => {
    if (!effectiveEngineConfig?.externalAgentConfigId) {
      return null;
    }
    return (
      externalAgentConfigs.find(
        (config) => config.id === effectiveEngineConfig.externalAgentConfigId,
      ) ?? null
    );
  }, [externalAgentConfigs, effectiveEngineConfig]);
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode: runtimePermissionMode,
  });
  const engineSwitchContinuationBannerText = useMemo(() => {
    if (!engineSwitchContinuation) {
      return null;
    }
    const sourceEngineName =
      engineConfigById.get(engineSwitchContinuation.sourceEngineConfigId)
        ?.name ?? "the previous engine";
    const targetEngineName = engineSwitchContinuation.targetEngineConfigId
      ? engineConfigById.get(engineSwitchContinuation.targetEngineConfigId)
          ?.name ?? "the selected engine"
      : "the selected engine";
    return `Engine changed from ${sourceEngineName} to ${targetEngineName}. Continue in a new thread to keep engine provenance consistent.`;
  }, [engineConfigById, engineSwitchContinuation]);
  const requiresNewThreadForEngineSwitch = engineSwitchContinuation !== null;
  const newThreadContinuationRequiredReason = requiresNewThreadForEngineSwitch
    ? "Switching engines on an existing thread requires continuing in a new thread."
    : null;
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig: Boolean(effectiveEngineConfig),
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const projectHistoryRunType = useMemo<ChatRunType | null>(() => {
    if (engineType === EngineTypeEnum.external_agent) {
      return "external_agent";
    }
    if (engineType === EngineTypeEnum.setta_llm) {
      return "llm_chat";
    }
    return null;
  }, [engineType]);
  const availableEngineConfigIds = useMemo(
    () => new Set(engineConfigs.map((config) => config.id)),
    [engineConfigs],
  );

  useEffect(() => {
    setEngineSwitchContinuation((current) =>
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: current,
        chatId,
        selectedEngineId: effectiveEngineId,
      }),
    );
  }, [chatId, effectiveEngineId, setEngineSwitchContinuation]);
  useEffect(() => {
    if (
      shouldProjectChatSkipEngineSyncForContinuation({
        continuation: engineSwitchContinuation,
        chatId,
      })
    ) {
      return;
    }
    const nextEngineConfigId = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId,
      selectedEngineId,
      availableEngineConfigIds,
      chatEngineConfigByChatId,
    });
    if (!nextEngineConfigId) {
      return;
    }
    setSelectedEngineId(nextEngineConfigId);
  }, [
    availableEngineConfigIds,
    chatEngineConfigByChatId,
    chatId,
    engineSwitchContinuation,
    selectedEngineId,
  ]);
  const externalEngineIssueMessage = useMemo(
    () => getExternalEngineIssueMessage(externalEngineStatus),
    [externalEngineStatus],
  );
  useEffect(() => {
    if (!externalEngineIssueMessage) {
      notifiedExternalEngineIssueRef.current = null;
      return;
    }
    if (notifiedExternalEngineIssueRef.current === externalEngineIssueMessage) {
      return;
    }
    notifiedExternalEngineIssueRef.current = externalEngineIssueMessage;
    addPersistentNotification(
      externalEngineIssueMessage,
      NotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      if (nextEngineId === selectedEngineId) {
        return;
      }
      const nextContinuation =
        resolveProjectChatEngineSwitchContinuationOnEngineChange({
          chatId,
          nextEngineId,
          chatEngineConfigByChatId,
        });
      setSelectedEngineId(nextEngineId);
      useAIStore.setState({ projectChatSelectedEngineId: nextEngineId });
      setProjectChatAuxView("none");
      setEngineSwitchContinuation(nextContinuation);
      if (nextContinuation) {
        return;
      }
      setChatId(undefined);
      setDraftThreadStateToNone();
      setDraftThreadTargetGroupId(null);
      setSelectedThreadGroupId(null);
    },
    [
      chatEngineConfigByChatId,
      chatId,
      selectedEngineId,
      setChatId,
      setDraftThreadStateToNone,
      setDraftThreadTargetGroupId,
      setEngineSwitchContinuation,
      setProjectChatAuxView,
      setSelectedThreadGroupId,
    ],
  );
  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (!effectiveEngineConfig) {
        return;
      }
      if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      const nextConfig = {
        ...effectiveEngineConfig,
        settaLlmConfigId: value,
      };
      void updateEngineConfig({ config: nextConfig });
    },
    [effectiveEngineConfig],
  );
  const handlePinDefaultModel = useCallback(() => {
    if (!allLLMConfigs || !selectedLLMConfigId) {
      return;
    }
    if (allLLMConfigs.default_config_id === selectedLLMConfigId) {
      return;
    }
    void saveLLMConfig({
      ...allLLMConfigs,
      default_config_id: selectedLLMConfigId,
    });
  }, [allLLMConfigs, selectedLLMConfigId]);
  const handleTranscriptionProfileChange = useCallback(
    (value: string | null) => {
      useAIStore.setState({ projectChatTranscriptionProfileId: value });
    },
    [],
  );
  const handleDictationModeChange = useCallback((value: ChatDictationMode) => {
    useAIStore.setState({ projectChatDictationMode: value });
  }, []);
  const handleActivityAccordionOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityAccordionOpenByDefault: value,
      });
    },
    [],
  );
  const handleActivityChildrenOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityChildrenOpenByDefault: value,
      });
    },
    [],
  );

  useEffect(() => {
    const resolvedSelectedEngineId =
      resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
        engineConfigsInitialLoadComplete,
        engineConfigs,
        selectedEngineId,
        preferredEngineId,
      });
    if (resolvedSelectedEngineId === selectedEngineId) {
      return;
    }
    setSelectedEngineId(resolvedSelectedEngineId);
  }, [
    engineConfigs,
    engineConfigsInitialLoadComplete,
    preferredEngineId,
    selectedEngineId,
  ]);
  useEffect(() => {
    if (!transcriptionProfilesInitialLoadComplete) {
      return;
    }
    if (!projectChatTranscriptionProfileId) {
      return;
    }
    const selectedProfile = transcriptionProfiles.find(
      (profile) => profile.id === projectChatTranscriptionProfileId,
    );
    if (!selectedProfile) {
      useAIStore.setState({ projectChatTranscriptionProfileId: null });
    }
  }, [
    projectChatTranscriptionProfileId,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
  ]);
  useEffect(() => {
    if (projectChatDictationMode !== ChatDictationModeEnum.provider) {
      return;
    }
    if (providerDictationAvailable) {
      return;
    }
    useAIStore.setState({
      projectChatDictationMode: ChatDictationModeEnum.auto,
    });
  }, [projectChatDictationMode, providerDictationAvailable]);
  useEffect(() => {
    setRuntimePermissionMode(getDefaultProjectChatPermissionMode(engineType));
  }, [engineType, setRuntimePermissionMode]);

  return {
    availableConfigGroups,
    engineGroups,
    engineConfigById,
    transcriptionProfileGroups,
    noConfigsAvailable,
    selectedEngineConfig,
    effectiveEngineId,
    engineType,
    defaultLLMConfigId,
    providerDictationAvailable,
    providerDictationUnavailableReason,
    providerDictationLikelySupported,
    hasLLMConfig,
    selectableLLMConfigId,
    llmSelectionUnavailableReason,
    externalEngineAvailable,
    externalAgentConfig,
    showPlanModeBadge,
    engineSwitchContinuationBannerText,
    requiresNewThreadForEngineSwitch,
    newThreadContinuationRequiredReason,
    placeholderText,
    projectHistoryRunType,
    handleEngineChange,
    handleLLMConfigChange,
    handlePinDefaultModel,
    handleTranscriptionProfileChange,
    handleDictationModeChange,
    handleActivityAccordionOpenByDefaultChange,
    handleActivityChildrenOpenByDefaultChange,
  };
}

function findPreferredEngineId({
  engineConfigs,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfigs: EngineConfig[];
  allLLMConfigs: AllConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: HttpapiExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): string | null {
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.setta_llm) {
      continue;
    }
    if (
      isEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.external_agent) {
      continue;
    }
    if (
      isEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  return engineConfigs[0]?.id ?? null;
}

function isEngineUsable({
  config,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  config: EngineConfig;
  allLLMConfigs: AllConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: HttpapiExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): boolean {
  if (config.engineType === EngineTypeEnum.setta_llm) {
    const fallbackConfigId = pickDefaultConfigId(allLLMConfigs);
    const configId = config.settaLlmConfigId ?? fallbackConfigId;
    return Boolean(configId && availableConfigIds.has(configId));
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    if (!externalAgentHealthInitialLoadComplete) {
      return true;
    }
    const configId = config.externalAgentConfigId;
    const status = externalAgentHealth.find(
      (entry) => entry.configId === configId,
    );
    return Boolean(status?.available && status.supported);
  }
  return false;
}
