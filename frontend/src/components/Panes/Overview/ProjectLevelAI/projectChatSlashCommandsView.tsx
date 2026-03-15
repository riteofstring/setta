import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  normalizeSlashCommandToken,
} from "components/Chat/chatComposerControls";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { parseAppGenerationMode } from "state/types/appGenerationMode";
import { EngineTypeEnum } from "utils/generatedTypes";

import {
  buildReservedSlashCommandTokens,
  buildSlashCommandsByEngine,
  DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
  EMPTY_AGENT_NATIVE_COMMANDS,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveVisibleAgentNativeSlashCommandsByEngineId,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
import {
  CUSTOM_SLASH_COMMAND_MODE_ITEMS,
  EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
  getCustomSlashCommandModeLabel,
  isCustomSlashNamespaceAuthorityReady,
  resolveAgentNativeSlashAuthorityDetail,
  resolveAgentNativeSlashCommandsMessage,
  resolveCanAddCustomSlashCommand,
  resolveCustomSlashDraftByProjectConfigIdUpdate,
  type CustomSlashCommandDraft,
} from "./projectChatSlashCommandsViewState";

type ProjectChatSlashCommandsViewProps = {
  isVisible: boolean;
  projectConfigId: string;
};

export function ProjectChatSlashCommandsView({
  isVisible,
  projectConfigId,
}: ProjectChatSlashCommandsViewProps) {
  const apiKeys = useAIStore((state) => state.apiKeys);
  const engineConfigs = useAIStore((state) => state.engineConfigs);
  const engineConfigsInitialLoadComplete = useAIStore(
    (state) => state.engineConfigsInitialLoadComplete,
  );
  const externalAgentHealth = useAIStore((state) => state.externalAgentHealth);
  const externalAgentHealthInitialLoadComplete = useAIStore(
    (state) => state.externalAgentHealthInitialLoadComplete,
  );
  const agentRuns = useAIStore((state) => state.agentRuns);
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
  const [selectedSlashEngineId, setSelectedSlashEngineId] = useState<
    string | null
  >(null);
  const [
    customSlashDraftByProjectConfigId,
    setCustomSlashDraftByProjectConfigId,
  ] = useState<Record<string, CustomSlashCommandDraft>>({});

  const slashCommandsByEngine = useMemo(() => {
    if (!isVisible) {
      return [];
    }
    return buildSlashCommandsByEngine({
      engineConfigs,
      allLLMConfigs,
      apiKeys,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    });
  }, [
    allLLMConfigs,
    apiKeys,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    isVisible,
  ]);
  const slashCommandEngineIds = useMemo(() => {
    return slashCommandsByEngine.map((entry) => entry.engineId);
  }, [slashCommandsByEngine]);
  const runtimeAgentNativeSlashCommandsByEngineId = useMemo(() => {
    if (!isVisible || slashCommandEngineIds.length === 0) {
      return {};
    }
    return resolveAgentNativeSlashCommandsByEngineId({
      runs: agentRuns,
      projectConfigId,
      engineConfigIds: slashCommandEngineIds,
    });
  }, [agentRuns, isVisible, projectConfigId, slashCommandEngineIds]);
  const visibleAgentNativeSlashCommandsByEngineId = useMemo(() => {
    if (!isVisible) {
      return {};
    }
    return resolveVisibleAgentNativeSlashCommandsByEngineId({
      agentRunsAuthorityState,
      runtimeEntries: runtimeAgentNativeSlashCommandsByEngineId,
    });
  }, [
    agentRunsAuthorityState,
    isVisible,
    runtimeAgentNativeSlashCommandsByEngineId,
  ]);
  const selectedSlashEngine = useMemo(() => {
    if (!selectedSlashEngineId) {
      return slashCommandsByEngine[0] ?? null;
    }
    return (
      slashCommandsByEngine.find(
        (entry) => entry.engineId === selectedSlashEngineId,
      ) ??
      slashCommandsByEngine[0] ??
      null
    );
  }, [selectedSlashEngineId, slashCommandsByEngine]);
  const hasExternalAgentSlashEngine = useMemo(() => {
    return slashCommandsByEngine.some(
      (entry) => entry.engineType === EngineTypeEnum.external_agent,
    );
  }, [slashCommandsByEngine]);
  const selectedAgentNativeSlashCommands = useMemo(() => {
    if (
      !selectedSlashEngine ||
      selectedSlashEngine.engineType !== EngineTypeEnum.external_agent
    ) {
      return EMPTY_AGENT_NATIVE_COMMANDS;
    }
    return (
      visibleAgentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId]
        ?.commands ?? EMPTY_AGENT_NATIVE_COMMANDS
    );
  }, [selectedSlashEngine, visibleAgentNativeSlashCommandsByEngineId]);
  const selectedAgentNativeSlashStatus = useMemo(() => {
    if (
      !selectedSlashEngine ||
      selectedSlashEngine.engineType !== EngineTypeEnum.external_agent
    ) {
      return DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY;
    }
    const authorityDetail = resolveAgentNativeSlashAuthorityDetail(
      agentRunsAuthorityState,
    );
    if (authorityDetail) {
      return {
        ...DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
        statusDetail: authorityDetail,
      };
    }
    return (
      visibleAgentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId] ??
      DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY
    );
  }, [
    agentRunsAuthorityState,
    selectedSlashEngine,
    visibleAgentNativeSlashCommandsByEngineId,
  ]);
  const managedSlashCommandDefinitions = useMemo(() => {
    if (!isVisible) {
      return [];
    }
    return buildChatSlashCommands({
      model: true,
      permissions: true,
      search: true,
      appGenerationModes: true,
    });
  }, [isVisible]);
  const customSlashCommandDefinitions = useMemo(() => {
    if (!isVisible) {
      return [];
    }
    return buildCustomPromptSlashCommandDefinitions(
      customProjectChatSlashCommands,
    );
  }, [customProjectChatSlashCommands, isVisible]);
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
    if (!isVisible) {
      return;
    }
    if (slashCommandsByEngine.length === 0) {
      if (selectedSlashEngineId !== null) {
        setSelectedSlashEngineId(null);
      }
      return;
    }
    if (
      selectedSlashEngineId &&
      slashCommandsByEngine.some(
        (entry) => entry.engineId === selectedSlashEngineId,
      )
    ) {
      return;
    }
    setSelectedSlashEngineId(slashCommandsByEngine[0]?.engineId ?? null);
  }, [isVisible, selectedSlashEngineId, slashCommandsByEngine]);

  useEffect(() => {
    if (!isVisible || !hasExternalAgentSlashEngine) {
      return;
    }
    void loadAgentRuns();
    const refreshIntervalMs = 15_000;
    const intervalId = window.setInterval(() => {
      void loadAgentRuns();
    }, refreshIntervalMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasExternalAgentSlashEngine, isVisible]);

  const currentCustomSlashDraft =
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
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
    customSlashCommandTokens,
    customSlashNamespaceAuthorityReady,
    newCustomSlashPrompt,
    normalizedNewCustomSlashCommand,
    reservedSlashCommandTokens,
  ]);

  const addCustomProjectChatSlashCommand = useCallback(() => {
    const normalizedCommand = normalizeSlashCommandToken(newCustomSlashCommand);
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
  }, [
    customSlashCommandTokens,
    newCustomSlashAppGenerationMode,
    newCustomSlashCommand,
    newCustomSlashPrompt,
    projectConfigId,
    reservedSlashCommandTokens,
  ]);

  const removeCustomProjectChatSlashCommand = useCallback(
    (commandToken: string) => {
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

  if (!isVisible) {
    return null;
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="skills-mcp-slash-commands-content"
    >
      <div className="grid min-w-0 gap-2 rounded bg-setta-50/60 p-2 dark:bg-setta-950/40">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Custom Commands
        </div>
        <div className="grid min-w-0 gap-2 px-1">
          <input
            type="text"
            value={newCustomSlashCommand}
            onChange={(event) => setNewCustomSlashCommand(event.target.value)}
            placeholder="/my-command"
            className="w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
            data-testid="project-chat-custom-slash-command-input"
          />
          <IdNameCombobox
            allItems={[
              {
                groupName: "Submission mode",
                items: CUSTOM_SLASH_COMMAND_MODE_ITEMS.map((item) => ({
                  id: item.id,
                  name: item.name,
                })),
              },
            ]}
            value={newCustomSlashAppGenerationMode ?? "plain_chat"}
            small={false}
            onSelectedItemChange={setNewCustomSlashAppGenerationMode}
            placeholder="Select a submission mode"
            outerDivClasses="w-full"
            inputDivId="project-chat-custom-slash-mode-input"
          />
          <textarea
            value={newCustomSlashPrompt}
            onChange={(event) => setNewCustomSlashPrompt(event.target.value)}
            placeholder="Prompt text to send when this command runs."
            className="min-h-20 w-full resize-y rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
            data-testid="project-chat-custom-slash-prompt-input"
          />
          <button
            type="button"
            className="inline-flex w-fit cursor-pointer items-center rounded border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
            data-testid="project-chat-custom-slash-add"
            onClick={addCustomProjectChatSlashCommand}
            disabled={!canAddCustomSlashCommand}
          >
            Add slash command
          </button>
          <div className="text-[10px] text-setta-500 dark:text-setta-400">
            {customSlashNamespaceAuthorityReady
              ? "Command names must be unique and cannot collide with built-in or discovered agent-native commands."
              : "Command names stay disabled until native command authority is loaded for this project."}
          </div>
        </div>
        {customSlashCommandDefinitions.length > 0 ? (
          <div className="grid min-w-0 gap-1">
            {customSlashCommandDefinitions.map((command) => {
              const hasCollision = conflictingCustomSlashCommandTokens.has(
                command.command,
              );
              const modeLabel = getCustomSlashCommandModeLabel(
                command.appGenerationMode ?? null,
              );
              return (
                <div
                  key={command.command}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                >
                  <div className="min-w-0">
                    <div
                      className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                      data-testid="project-chat-custom-slash-command"
                    >
                      {command.command}
                    </div>
                    <div className="min-w-0 break-words text-[10px] text-setta-600 dark:text-setta-300">
                      {command.promptTemplate}
                    </div>
                    {modeLabel ? (
                      <div className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
                        Submits as {modeLabel}.
                      </div>
                    ) : null}
                    {hasCollision ? (
                      <div
                        className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300"
                        data-testid="project-chat-custom-slash-command-conflict"
                      >
                        Disabled due to command collision.
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-6 cursor-pointer items-center rounded border border-setta-300 px-2 text-[10px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                    data-testid="project-chat-custom-slash-remove"
                    onClick={() =>
                      removeCustomProjectChatSlashCommand(command.command)
                    }
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-1 text-[10px] text-setta-500 dark:text-setta-400">
            No custom slash commands yet.
          </div>
        )}
      </div>
      {!engineConfigsInitialLoadComplete ? (
        <div className="p-1 text-[11px] text-setta-500 dark:text-setta-400">
          Loading engine commands...
        </div>
      ) : slashCommandsByEngine.length === 0 ? (
        <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
          No engines configured.
        </div>
      ) : (
        <>
          <div className="flex min-w-0 gap-1 overflow-x-auto">
            {slashCommandsByEngine.map((engine) => {
              const selected =
                selectedSlashEngine?.engineId === engine.engineId;
              return (
                <button
                  key={engine.engineId}
                  type="button"
                  data-testid="skills-mcp-slash-tab"
                  className={`box-border min-w-0 cursor-pointer rounded px-2 py-1 text-left transition-colors ${
                    selected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
                      : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
                  }`}
                  title={engine.engineName}
                  onClick={() => setSelectedSlashEngineId(engine.engineId)}
                >
                  <span className="block truncate font-semibold">
                    {engine.engineName}
                  </span>
                  <span className="block truncate text-[10px] uppercase tracking-wide opacity-80">
                    {engine.engineType === EngineTypeEnum.external_agent
                      ? "External Agent"
                      : "Setta LLM"}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-auto p-1 text-[11px]"
            data-testid="skills-mcp-slash-list-pane"
          >
            <div className="grid min-w-0 gap-3">
              <div className="grid min-w-0 gap-1">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                  Setta Chat Commands
                </div>
                {selectedSlashEngine?.commands.map((command) => (
                  <div
                    key={`${selectedSlashEngine.engineId}:${command.command}`}
                    className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                  >
                    <div
                      className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                      data-testid="skills-mcp-slash-command"
                    >
                      {command.command}
                    </div>
                    <div className="min-w-0 text-setta-600 dark:text-setta-300">
                      {command.summary}
                    </div>
                  </div>
                ))}
              </div>
              {selectedSlashEngine?.engineType ===
              EngineTypeEnum.external_agent ? (
                <div className="grid min-w-0 gap-2">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                    Agent-Native Commands
                  </div>
                  {selectedAgentNativeSlashCommands.length > 0 ? (
                    <div className="grid min-w-0 gap-1">
                      {selectedAgentNativeSlashCommands.map((command) => (
                        <div
                          key={`${selectedSlashEngine.engineId}:agent:${command}`}
                          className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                          data-testid="skills-mcp-agent-slash-command"
                        >
                          <div className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            {command}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
                      {resolveAgentNativeSlashCommandsMessage(
                        selectedAgentNativeSlashStatus,
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
                  Agent-native slash commands apply to external agents. Select
                  an external engine tab to view discovered metadata.
                </div>
              )}
            </div>
          </div>
          <div className="text-[10px] text-setta-500 dark:text-setta-400">
            Setta command availability is defined by this app. Native agent
            command lists are sourced from current external-agent run metadata.
          </div>
        </>
      )}
    </section>
  );
}
