import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  normalizeSlashCommandToken,
} from "components/Chat/chatComposerControls";
import {
  useAppSubsystemCustomSlashCommandModeOptions,
  useAppSubsystemDefaultCustomSlashCommandMode,
  useAppSubsystemSlashCommands,
} from "plugins/appSubsystem";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAgentRuns } from "state/actions/ai";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore, useLocalStorage } from "state/definitions";
import { parseAppGenerationMode } from "state/types/appGenerationMode";
import { EngineTypeEnum } from "utils/generatedTypes";
import {
  buildReservedSlashCommandTokens,
  buildSlashCommandsByEngine,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveVisibleAgentNativeSlashCommandsByEngineId,
} from "../projectChatSkillsMcpViewerUtils";
import {
  type CustomSlashCommandDraft,
  EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
  type ProjectChatSkillsMcpViewerProps,
  isCustomSlashNamespaceAuthorityReady,
  resolveCanAddCustomSlashCommand,
  resolveCurrentCustomSlashDraft,
  resolveCustomSlashDraftByProjectConfigIdUpdate,
  resolveNextSelectedSlashEngineId,
  resolveSelectedAgentNativeSlashCommands,
  resolveSelectedAgentNativeSlashStatus,
  resolveSelectedSlashEngine,
  shouldLoadSlashCommandAgentRuns,
} from "./skillState";

type AIStoreState = ReturnType<typeof useAIStore.getState>;

type UseSlashCommandStateArgs = {
  agentRuns: AIStoreState["agentRuns"];
  agentRunsAuthorityState: AIStoreState["agentRunsAuthorityState"];
  agentRunsInitialLoadComplete: boolean;
  allLLMConfigs: AIStoreState["allLLMConfigs"];
  apiKeys: AIStoreState["apiKeys"];
  customProjectChatSlashCommands: AIStoreState["customProjectChatSlashCommandsByProjectConfigId"][string];
  engineConfigs: AIStoreState["engineConfigs"];
  engineConfigsInitialLoadComplete: boolean;
  externalAgentHealth: AIStoreState["externalAgentHealth"];
  externalAgentHealthInitialLoadComplete: boolean;
  projectConfigId: string;
  viewMode: ProjectChatSkillsMcpViewerProps["viewMode"];
};

export function useProjectChatSlashCommandState({
  agentRuns,
  agentRunsAuthorityState,
  agentRunsInitialLoadComplete,
  allLLMConfigs,
  apiKeys,
  customProjectChatSlashCommands,
  engineConfigs,
  engineConfigsInitialLoadComplete,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
  projectConfigId,
  viewMode,
}: UseSlashCommandStateArgs) {
  const [selectedSlashEngineId, setSelectedSlashEngineId] = useState<
    string | null
  >(null);
  const [
    customSlashDraftByProjectConfigId,
    setCustomSlashDraftByProjectConfigId,
  ] = useState<Record<string, CustomSlashCommandDraft>>({});
  const appGenerationSlashCommands = useAppSubsystemSlashCommands();
  const customSlashCommandModeItems =
    useAppSubsystemCustomSlashCommandModeOptions();
  const defaultCustomSlashCommandMode =
    useAppSubsystemDefaultCustomSlashCommandMode();
  const slashCommandsByEngine = useMemo(() => {
    return buildSlashCommandsByEngine({
      engineConfigs,
      appGenerationSlashCommands,
      allLLMConfigs,
      apiKeys,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    });
  }, [
    allLLMConfigs,
    appGenerationSlashCommands,
    apiKeys,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  ]);
  const slashCommandEngineIds = useMemo(() => {
    return slashCommandsByEngine.map((entry) => entry.engineId);
  }, [slashCommandsByEngine]);
  const runtimeAgentNativeSlashCommandsByEngineId = useMemo(() => {
    return resolveAgentNativeSlashCommandsByEngineId({
      runs: agentRuns,
      projectConfigId,
      engineConfigIds: slashCommandEngineIds,
    });
  }, [agentRuns, projectConfigId, slashCommandEngineIds]);
  const visibleAgentNativeSlashCommandsByEngineId = useMemo(() => {
    return resolveVisibleAgentNativeSlashCommandsByEngineId({
      agentRunsAuthorityState,
      runtimeEntries: runtimeAgentNativeSlashCommandsByEngineId,
    });
  }, [agentRunsAuthorityState, runtimeAgentNativeSlashCommandsByEngineId]);
  const selectedSlashEngine = useMemo(() => {
    return resolveSelectedSlashEngine({
      selectedSlashEngineId,
      slashCommandsByEngine,
    });
  }, [selectedSlashEngineId, slashCommandsByEngine]);
  const hasExternalAgentSlashEngine = useMemo(() => {
    return slashCommandsByEngine.some(
      (entry) => entry.engineType === EngineTypeEnum.external_agent,
    );
  }, [slashCommandsByEngine]);
  const shouldLoadSlashRuns = useMemo(() => {
    return shouldLoadSlashCommandAgentRuns({
      viewMode,
      hasExternalAgentEngine: hasExternalAgentSlashEngine,
    });
  }, [hasExternalAgentSlashEngine, viewMode]);
  const selectedAgentNativeSlashCommands = useMemo(() => {
    return resolveSelectedAgentNativeSlashCommands({
      selectedSlashEngine,
      visibleAgentNativeSlashCommandsByEngineId,
    });
  }, [selectedSlashEngine, visibleAgentNativeSlashCommandsByEngineId]);
  const selectedAgentNativeSlashStatus = useMemo(() => {
    return resolveSelectedAgentNativeSlashStatus({
      agentRunsAuthorityState,
      selectedSlashEngine,
      visibleAgentNativeSlashCommandsByEngineId,
    });
  }, [
    agentRunsAuthorityState,
    selectedSlashEngine,
    visibleAgentNativeSlashCommandsByEngineId,
  ]);
  const managedSlashCommandDefinitions = useMemo(() => {
    return buildChatSlashCommands({
      model: true,
      permissions: true,
      search: true,
      appGenerationCommands: appGenerationSlashCommands,
    });
  }, [appGenerationSlashCommands]);
  const customSlashCommandDefinitions = useMemo(() => {
    return buildCustomPromptSlashCommandDefinitions(
      customProjectChatSlashCommands,
    );
  }, [customProjectChatSlashCommands]);
  const customSlashCommandTokens = useMemo(() => {
    return new Set(customSlashCommandDefinitions.map((entry) => entry.command));
  }, [customSlashCommandDefinitions]);
  const discoveredAgentNativeSlashCommands = useMemo(() => {
    return Object.values(visibleAgentNativeSlashCommandsByEngineId).flatMap(
      (entry) => entry.commands,
    );
  }, [visibleAgentNativeSlashCommandsByEngineId]);
  const reservedSlashCommandTokens = useMemo(() => {
    return buildReservedSlashCommandTokens({
      managedCommands: managedSlashCommandDefinitions,
      engineCommandGroups: slashCommandsByEngine,
      discoveredNativeSlashCommands: discoveredAgentNativeSlashCommands,
    });
  }, [
    discoveredAgentNativeSlashCommands,
    managedSlashCommandDefinitions,
    slashCommandsByEngine,
  ]);
  const { conflictingCommandTokens: conflictingCustomSlashCommandTokens } =
    useMemo(() => {
      return reconcileCustomSlashCommands({
        customCommands: customSlashCommandDefinitions,
        reservedTokens: reservedSlashCommandTokens,
      });
    }, [customSlashCommandDefinitions, reservedSlashCommandTokens]);
  useEffect(() => {
    const nextSelectedSlashEngineId = resolveNextSelectedSlashEngineId({
      selectedSlashEngineId,
      slashCommandsByEngine,
    });
    setSelectedSlashEngineId(nextSelectedSlashEngineId);
  }, [selectedSlashEngineId, slashCommandsByEngine]);
  useEffect(() => {
    if (shouldLoadSlashRuns && !agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete, shouldLoadSlashRuns]);
  const currentCustomSlashDraft = resolveCurrentCustomSlashDraft({
    customSlashDraftByProjectConfigId,
    projectConfigId,
  });
  const newCustomSlashCommand = currentCustomSlashDraft.command;
  const newCustomSlashPrompt = currentCustomSlashDraft.prompt;
  const newCustomSlashAppGenerationMode =
    currentCustomSlashDraft.appGenerationMode;
  const setNewCustomSlashCommand = useCallback(
    (nextCommand: string) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            command: nextCommand,
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const setNewCustomSlashPrompt = useCallback(
    (nextPrompt: string) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            prompt: nextPrompt,
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const setNewCustomSlashAppGenerationMode = useCallback(
    (nextMode: string | null) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            appGenerationMode: parseAppGenerationMode(nextMode),
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const normalizedNewCustomSlashCommand = useMemo(() => {
    return normalizeSlashCommandToken(newCustomSlashCommand);
  }, [newCustomSlashCommand]);
  const customSlashNamespaceAuthorityReady = useMemo(() => {
    return isCustomSlashNamespaceAuthorityReady({
      agentRunsAuthorityState,
      engineConfigsInitialLoadComplete,
      slashCommandsByEngine,
    });
  }, [
    agentRunsAuthorityState,
    engineConfigsInitialLoadComplete,
    slashCommandsByEngine,
  ]);
  const canAddCustomSlashCommand = useMemo(() => {
    return resolveCanAddCustomSlashCommand({
      customSlashCommandTokens,
      namespaceAuthorityReady: customSlashNamespaceAuthorityReady,
      newCustomSlashPrompt,
      normalizedNewCustomSlashCommand,
      reservedSlashCommandTokens,
    });
  }, [
    customSlashNamespaceAuthorityReady,
    customSlashCommandTokens,
    newCustomSlashPrompt,
    normalizedNewCustomSlashCommand,
    reservedSlashCommandTokens,
  ]);
  const addCustomProjectChatSlashCommand = useCallback(
    function addCustomProjectChatSlashCommandImpl() {
      const normalizedCommand = normalizeSlashCommandToken(
        newCustomSlashCommand,
      );
      if (!normalizedCommand) {
        addTemporaryNotification(
          "Provide a valid slash command (example: /triage-bugs).",
        );
        return;
      }
      const trimmedPrompt = newCustomSlashPrompt.trim();
      if (!trimmedPrompt) {
        addTemporaryNotification("Provide prompt text for the custom command.");
        return;
      }
      if (
        reservedSlashCommandTokens.has(normalizedCommand) ||
        customSlashCommandTokens.has(normalizedCommand)
      ) {
        addTemporaryNotification(
          `${normalizedCommand} collides with an existing slash command.`,
        );
        return;
      }
      useLocalStorage.setState((state) => {
        const currentByProject =
          state.customProjectChatSlashCommandsByProjectConfigId;
        const currentCommands = currentByProject[projectConfigId] ?? [];
        if (
          currentCommands.some(
            (entry) =>
              normalizeSlashCommandToken(entry.command) === normalizedCommand,
          )
        ) {
          return state;
        }
        return {
          customProjectChatSlashCommandsByProjectConfigId: {
            ...currentByProject,
            [projectConfigId]: [
              ...currentCommands,
              {
                command: normalizedCommand,
                prompt: trimmedPrompt,
                appGenerationMode: newCustomSlashAppGenerationMode,
              },
            ],
          },
        };
      });
      setCustomSlashDraftByProjectConfigId((current) => {
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
        });
        return next ?? current;
      });
      addTemporaryNotification(`Added ${normalizedCommand}.`);
    },
    [
      customSlashCommandTokens,
      newCustomSlashAppGenerationMode,
      newCustomSlashCommand,
      newCustomSlashPrompt,
      projectConfigId,
      reservedSlashCommandTokens,
    ],
  );
  const removeCustomProjectChatSlashCommand = useCallback(
    function removeCustomProjectChatSlashCommandImpl(commandToken: string) {
      const normalizedCommand = normalizeSlashCommandToken(commandToken);
      if (!normalizedCommand) {
        return;
      }
      useLocalStorage.setState((state) => {
        const currentByProject =
          state.customProjectChatSlashCommandsByProjectConfigId;
        const currentCommands = currentByProject[projectConfigId] ?? [];
        const nextCommands = currentCommands.filter(
          (entry) =>
            normalizeSlashCommandToken(entry.command) !== normalizedCommand,
        );
        if (nextCommands.length === currentCommands.length) {
          return state;
        }
        const nextByProject = { ...currentByProject };
        if (nextCommands.length === 0) {
          delete nextByProject[projectConfigId];
        } else {
          nextByProject[projectConfigId] = nextCommands;
        }
        return {
          customProjectChatSlashCommandsByProjectConfigId: nextByProject,
        };
      });
      addTemporaryNotification(`Removed ${normalizedCommand}.`);
    },
    [projectConfigId],
  );

  return {
    addCustomProjectChatSlashCommand,
    canAddCustomSlashCommand,
    conflictingCustomSlashCommandTokens,
    customSlashCommandDefinitions,
    customSlashCommandModeItems,
    customSlashNamespaceAuthorityReady,
    defaultCustomSlashCommandMode,
    newCustomSlashAppGenerationMode,
    newCustomSlashCommand,
    newCustomSlashPrompt,
    removeCustomProjectChatSlashCommand,
    selectedAgentNativeSlashCommands,
    selectedAgentNativeSlashStatus,
    selectedSlashEngine,
    setNewCustomSlashAppGenerationMode,
    setNewCustomSlashCommand,
    setNewCustomSlashPrompt,
    setSelectedSlashEngineId,
    slashCommandsByEngine,
  };
}
