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
} from "components/Chat/llmConfigUtils";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateEngineConfig } from "state/actions/aiConfigurationCatalogMutations";
import { saveLLMConfig } from "state/actions/aiLLMConfiguration";
import { addPersistentNotification } from "state/actions/notifications";
import { useAIStore } from "state/definitions";
import {
  EngineTypeEnum,
  SettaNotificationTypeEnum,
  type EngineConfig,
} from "utils/generatedTypes";
import {
  findPreferredProjectChatEngineId,
  resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad,
  resolveProjectChatSelectedLLMUnavailableReason,
} from "./projectChatEngineSelection";
import { getDefaultProjectChatPermissionMode } from "./projectChatExecutionSettings";
import { type ProjectDictationMode } from "./projectChatSettingsPopover";

// Owns ProjectChat engine/configuration state, provider-dictation readiness,
// and settings-popover mutations so ProjectChat.tsx can focus on chat routing.

function buildTranscriptionProfileGroups(
  transcriptionProfiles: Array<{ id: string; name: string | null }>,
): AllItemsType<string> {
  return [
    {
      group: "Transcription Profiles",
      items: transcriptionProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name || profile.id,
      })),
    },
  ];
}

export function resolveProjectChatHistoryRunType(
  engineType: EngineTypeEnum | null,
): "external_agent" | "llm_chat" | null {
  if (engineType === EngineTypeEnum.external_agent) {
    return "external_agent";
  }
  if (engineType === EngineTypeEnum.setta_llm) {
    return "llm_chat";
  }
  return null;
}

export function useProjectChatEngineSettings() {
  const {
    apiKeys,
    apiKeysAuthoritative,
    apiKeysInitialLoadComplete,
    allLLMConfigs,
    allLLMConfigsInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectChatActivityAccordionOpenByDefault,
    projectChatActivityChildrenOpenByDefault,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      apiKeysAuthoritative: state.apiKeysAuthoritative,
      apiKeysInitialLoadComplete: state.apiKeysInitialLoadComplete,
      allLLMConfigs: state.allLLMConfigs,
      allLLMConfigsInitialLoadComplete: state.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: state.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        state.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: state.externalAgentConfigs,
      engineConfigs: state.engineConfigs,
      engineConfigsInitialLoadComplete: state.engineConfigsInitialLoadComplete,
      engineConfigsLoadError: state.engineConfigsLoadError,
      transcriptionProfiles: state.transcriptionProfiles,
      transcriptionProfilesInitialLoadComplete:
        state.transcriptionProfilesInitialLoadComplete,
      projectChatDictationMode: state.projectChatDictationMode,
      projectChatTranscriptionProfileId:
        state.projectChatTranscriptionProfileId,
      projectChatActivityAccordionOpenByDefault:
        state.projectChatActivityAccordionOpenByDefault,
      projectChatActivityChildrenOpenByDefault:
        state.projectChatActivityChildrenOpenByDefault,
    }),
    _.isEqual,
  );
  const defaultSelectedEngineId = useAIStore(
    (state) => state.projectChatSelectedEngineId,
  );
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(
    defaultSelectedEngineId,
  );
  const [runtimePermissionMode, setRuntimePermissionMode] =
    useState<ChatPermissionModeValue>("minimal");
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
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
  const transcriptionProfileGroups = useMemo(
    () => buildTranscriptionProfileGroups(transcriptionProfiles),
    [transcriptionProfiles],
  );
  const preferredEngineId = useMemo(
    () =>
      findPreferredProjectChatEngineId({
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
  const availableEngineConfigIds = useMemo(
    () => new Set(engineConfigs.map((config) => config.id)),
    [engineConfigs],
  );
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
  }, [effectiveEngineConfig, externalAgentConfigs]);
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode: runtimePermissionMode,
  });
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig: Boolean(effectiveEngineConfig),
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const projectHistoryRunType = resolveProjectChatHistoryRunType(engineType);
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
      SettaNotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);

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
    if (projectChatDictationMode !== "provider") {
      return;
    }
    if (providerDictationAvailable) {
      return;
    }
    useAIStore.setState({ projectChatDictationMode: "auto" });
  }, [projectChatDictationMode, providerDictationAvailable]);
  useEffect(() => {
    setRuntimePermissionMode(getDefaultProjectChatPermissionMode(engineType));
  }, [engineType]);

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
  const handleDictationModeChange = useCallback(
    (value: ProjectDictationMode) => {
      useAIStore.setState({ projectChatDictationMode: value });
    },
    [],
  );
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

  return {
    apiKeysInitialLoadComplete,
    availableEngineConfigIds,
    defaultLLMConfigId,
    effectiveEngineId,
    engineConfigById,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    engineType,
    externalAgentConfig,
    externalEngineAvailable,
    hasLLMConfig,
    llmConfigInitialLoadComplete: allLLMConfigsInitialLoadComplete,
    noConfigsAvailable,
    placeholderText,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectHistoryRunType,
    providerDictationAvailable,
    providerDictationLikelySupported,
    runtimePermissionMode,
    selectedEngineId,
    setRuntimePermissionMode,
    setSelectedEngineId,
    settingsPopoverProps: {
      engineGroups,
      transcriptionProfileGroups,
      availableConfigGroups,
      selectedEngineId: effectiveEngineId,
      selectedLLMConfigId,
      llmSelectionUnavailableReason,
      selectedTranscriptionProfileId: projectChatTranscriptionProfileId,
      defaultLLMConfigId,
      engineType,
      noConfigsAvailable,
      dictationMode: projectChatDictationMode,
      activityAccordionOpenByDefault: projectChatActivityAccordionOpenByDefault,
      activityChildrenOpenByDefault: projectChatActivityChildrenOpenByDefault,
      providerDictationLikelySupported,
      providerDictationUnavailableReason,
      onLLMConfigChange: handleLLMConfigChange,
      onTranscriptionProfileChange: handleTranscriptionProfileChange,
      onPinDefaultModel: handlePinDefaultModel,
      onDictationModeChange: handleDictationModeChange,
      onActivityAccordionOpenByDefaultChange:
        handleActivityAccordionOpenByDefaultChange,
      onActivityChildrenOpenByDefaultChange:
        handleActivityChildrenOpenByDefaultChange,
    },
    showPlanModeBadge,
  };
}
