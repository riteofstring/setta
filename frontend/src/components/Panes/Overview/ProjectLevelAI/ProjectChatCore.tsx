import {
  ChatInput,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  CHAT_STARTER_PROMPTS,
  buildChatSlashCommands,
  formatSlashCommandHelp,
  type ChatPermissionModeValue,
  type ChatStarterPrompt,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TbLayoutDashboard } from "react-icons/tb";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  findLatestRunningExternalRunId,
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  loadAgentRuns,
  stopChatResponseLocally,
  submitEditedMessage,
  submitMessage,
  transcribeChatAudio,
} from "state/actions/ai";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import { useAIStore } from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { hasPendingToolInteraction } from "utils/claudeTools";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgentRun,
  ChatFileAttachment,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { buildDesignFirstFigmaStarterPrompt } from "./projectChatStarterPrompts";

const PYTHON_ROOT_MARKER_FILES = new Set<string>([
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "setup.py",
  "setup.cfg",
  "Pipfile",
  "tox.ini",
  "poetry.lock",
  "uv.lock",
]);
let hasPythonInWorkspaceRootCache: boolean | null = null;

type ChatExecutionSettings = {
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
};

type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

function resolvePermissionModeArg(
  rawArg: string | undefined,
): ChatPermissionModeValue | null {
  if (!rawArg) {
    return null;
  }
  const normalized = rawArg.trim().toLowerCase().replaceAll(".", "_");
  if (normalized === "config_toml_custom") {
    return "config_toml_custom";
  }
  if (normalized === "minimal") {
    return "minimal";
  }
  if (normalized === "yolo") {
    return "yolo";
  }
  return null;
}

function resolveToggleArg(
  rawArg: string | undefined,
  currentValue: boolean,
): boolean | null {
  if (!rawArg) {
    return !currentValue;
  }
  const normalized = rawArg.trim().toLowerCase();
  if (["on", "true", "enable", "enabled", "1"].includes(normalized)) {
    return true;
  }
  if (["off", "false", "disable", "disabled", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

function hasPythonSignalsInRoot(
  entries: Array<{ name: string; type: string }>,
): boolean {
  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }
    const lowerName = entry.name.toLowerCase();
    if (lowerName.endsWith(".py")) {
      return true;
    }
    if (PYTHON_ROOT_MARKER_FILES.has(lowerName)) {
      return true;
    }
  }
  return false;
}

function useHasPythonInWorkspaceRoot(enabled: boolean): boolean {
  const [hasPython, setHasPython] = useState(
    hasPythonInWorkspaceRootCache ?? false,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (hasPythonInWorkspaceRootCache !== null) {
      setHasPython(hasPythonInWorkspaceRootCache);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const rootResponse = await route_get_file_browser_root();
      if (!rootResponse || rootResponse.status !== 200 || !rootResponse.data) {
        return;
      }
      if (cancelled) {
        return;
      }
      const contentsResponse = await route_get_folder_contents({
        folderPath: rootResponse.data.rootPath,
        includeHidden: false,
        includeMtime: false,
        includeSize: false,
        maxEntries: 5000,
      });
      if (
        !contentsResponse ||
        contentsResponse.status !== 200 ||
        !Array.isArray(contentsResponse.data)
      ) {
        return;
      }
      if (cancelled) {
        return;
      }
      const hasPythonSignals = hasPythonSignalsInRoot(contentsResponse.data);
      hasPythonInWorkspaceRootCache = hasPythonSignals;
      setHasPython(hasPythonSignals);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return hasPython;
}

function toSortedProjectHistoryEntries(
  runs: Array<AgentRun>,
): Array<ProjectChatHistoryEntry> {
  return buildChatHistoryEntries(runs, { unscopedOnly: true }).sort(
    (left, right) => right.lastUpdatedMs - left.lastUpdatedMs,
  );
}

function EmptyChatState({
  starterPrompts,
  disabled,
  onStarterPrompt,
  onDesignFirstPrompt,
}: {
  starterPrompts: ChatStarterPrompt[];
  disabled: boolean;
  onStarterPrompt: (prompt: string) => void;
  onDesignFirstPrompt: () => void;
}) {
  const starterButtonClassName =
    "rounded-md border border-setta-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50"
        onClick={onDesignFirstPrompt}
        disabled={disabled}
      >
        <TbLayoutDashboard /> Create Project UI (Design First)
      </button>
      {starterPrompts.map((starterPrompt) => (
        <button
          key={starterPrompt.id}
          type="button"
          className={starterButtonClassName}
          onClick={() => onStarterPrompt(starterPrompt.prompt)}
          disabled={disabled}
        >
          {starterPrompt.label}
        </button>
      ))}
    </div>
  );
}

export const ProjectChatCore = memo(function ProjectChatCore({
  chatId,
  placeholderText,
  thinking,
  engineConfigId,
  engineType,
  hasLLMConfig,
  externalEngineAvailable,
  noLLMConfigsAvailable,
  setChatId,
}: {
  chatId: string | null | undefined;
  placeholderText: string;
  thinking: boolean;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
}) {
  const { messages, toolCallArguments, waitingForResponse } = useAIStore(
    (state) => {
      if (chatId === null) {
        return state.pendingChatDetails ?? getDefaultChatDetails();
      }
      if (typeof chatId !== "string") {
        return getDefaultChatDetails();
      }
      return state.chatDetails[chatId] ?? getDefaultChatDetails();
    },
    shallow,
  );
  const branchIndex = useChatBranchIndex(typeof chatId === "string");
  const branchInfoByMessage = useMemo(() => {
    if (typeof chatId !== "string") {
      return {};
    }
    return buildMessageBranchInfo({
      chatId,
      messages,
      branchIndex,
    });
  }, [branchIndex, chatId, messages]);
  const pendingPrompt = useAIStore((state) => state.pendingProjectChatPrompt);
  const [draftMessage, setDraftMessage] = useState("");
  const [executionSettings, setExecutionSettings] =
    useState<ChatExecutionSettings>({
      permissionMode: "minimal",
      searchEnabled: true,
    });
  const showEmptyState = typeof chatId === "undefined";
  const hasPythonInWorkspaceRoot = useHasPythonInWorkspaceRoot(showEmptyState);
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
  const canConfigureExecutionSettings =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);
  const showPermissionExecutionControl = canConfigureExecutionSettings;
  const showSearchExecutionControl =
    canConfigureExecutionSettings && !isExternalEngine;
  const slashCommands = useMemo(
    () =>
      buildChatSlashCommands({
        model: true,
        permissions: showPermissionExecutionControl,
        search: showSearchExecutionControl,
      }),
    [showPermissionExecutionControl, showSearchExecutionControl],
  );
  const lastFetchedChatIdRef = useRef<string | null>(null);
  const lastChatIdRef = useRef<string | null>(null);
  const visibleStarterPrompts = useMemo(
    () =>
      CHAT_STARTER_PROMPTS.filter(
        (starterPrompt) =>
          !starterPrompt.requiresPython || hasPythonInWorkspaceRoot,
      ),
    [hasPythonInWorkspaceRoot],
  );

  useEffect(() => {
    if (typeof chatId === "string") {
      lastChatIdRef.current = chatId;
    }
  }, [chatId]);

  useEffect(() => {
    if (!pendingPrompt) {
      return;
    }
    setDraftMessage((current) => (current.trim() ? current : pendingPrompt));
    useAIStore.setState({ pendingProjectChatPrompt: null });
  }, [pendingPrompt]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (waitingForResponse) {
      return;
    }
    if (lastFetchedChatIdRef.current === chatId) {
      return;
    }
    lastFetchedChatIdRef.current = chatId;
    if (isExternalEngine) {
      getExternalAgentChat(chatId, null);
      return;
    }
    getLLMChat(chatId);
  }, [chatId, isExternalEngine, waitingForResponse]);

  const handleNewChatStart = useCallback(() => {
    initializePendingChatDetails();
    setChatId(null);
  }, [setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      if (!succeeded || !newChatId) {
        clearPendingChatDetails();
        setChatId((currentChatId) => {
          if (currentChatId !== null) {
            return currentChatId;
          }
          return undefined;
        });
        return;
      }
      finalizePendingChatDetails(newChatId);
    },
    [setChatId],
  );

  const updateExecutionSettings = useCallback(
    (
      nextSettings: ChatExecutionSettings,
      feedback: string,
    ): ChatSlashCommandResult => {
      setExecutionSettings(nextSettings);
      return { feedback };
    },
    [],
  );

  const handleResumeLatestChat = useCallback(async (): Promise<boolean> => {
    await loadAgentRuns();
    const currentChatId = typeof chatId === "string" ? chatId : null;
    const latestEntry = toSortedProjectHistoryEntries(
      useAIStore.getState().agentRuns,
    ).find((entry) => entry.chatId !== currentChatId);
    if (!latestEntry) {
      return false;
    }
    setChatId(latestEntry.chatId);
    return true;
  }, [chatId, setChatId]);

  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      if (command.action === "new") {
        handleNewChatStart();
        return { feedback: "Started a new chat thread." };
      }
      if (command.action === "resume") {
        const resumed = await handleResumeLatestChat();
        return resumed
          ? { feedback: "Resumed the latest project chat." }
          : {
              feedback: "No previous project chat found to resume.",
              keepInput: true,
            };
      }
      if (command.action === "permissions") {
        const nextMode = resolvePermissionModeArg(command.args[0]);
        if (!nextMode) {
          return {
            feedback: "Usage: /permissions minimal|yolo|config_toml_custom",
            keepInput: true,
          };
        }
        return updateExecutionSettings(
          {
            permissionMode: nextMode,
            searchEnabled: executionSettings.searchEnabled,
          },
          `Permissions set to ${nextMode}.`,
        );
      }
      if (command.action === "search") {
        const nextValue = resolveToggleArg(
          command.args[0],
          executionSettings.searchEnabled,
        );
        if (nextValue === null) {
          return {
            feedback: "Usage: /search on|off",
            keepInput: true,
          };
        }
        return updateExecutionSettings(
          {
            permissionMode: executionSettings.permissionMode,
            searchEnabled: nextValue,
          },
          `Search ${nextValue ? "enabled" : "disabled"}.`,
        );
      }
      if (command.action === "model") {
        return {
          feedback: "Use the model selector in the Project AI Chat toolbar.",
          keepInput: true,
        };
      }
      if (command.action === "help") {
        return {
          feedback: formatSlashCommandHelp(slashCommands),
        };
      }
      return false;
    },
    [
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      handleNewChatStart,
      handleResumeLatestChat,
      slashCommands,
      updateExecutionSettings,
    ],
  );

  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      if (!engineConfigId) {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const isFirstMessage = chatId === undefined;
      if (isFirstMessage) {
        handleNewChatStart();
      }

      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        submittedChatId = await submitMessage(
          chatId ?? null,
          message,
          attachments,
          thinking,
          engineConfigId,
          isExternalEngine,
          {
            executionSettings: {
              permissionMode: executionSettings.permissionMode,
              searchEnabled: executionSettings.searchEnabled,
            },
          },
        );
        succeeded = Boolean(submittedChatId);
      } catch (err) {
        console.error("Failed to submit LLM chat message", err);
      } finally {
        if (isFirstMessage) {
          handleNewChatSettled(submittedChatId, succeeded);
        }
      }
      return succeeded;
    },
    [
      chatId,
      thinking,
      engineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
    ],
  );

  const handleStop = useCallback(async () => {
    stopChatResponseLocally(chatId);
    if (isExternalEngine) {
      if (typeof chatId !== "string") {
        return;
      }
      const runId = await findLatestRunningExternalRunId(chatId, null);
      if (!runId) {
        return;
      }
      await route_stop_external_agent_run({ runId });
      return;
    }
    if (typeof chatId !== "string") {
      return;
    }
    await route_stop_llm_chat({ chatId });
  }, [chatId, isExternalEngine]);

  const handleEditMessage = useCallback(
    async (
      messageId: string,
      text: string,
      attachments: ChatFileAttachment[],
    ) => {
      const resolvedChatId =
        typeof chatId === "string" ? chatId : lastChatIdRef.current;
      if (!resolvedChatId) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const nextChatId = await submitEditedMessage({
        parentChatId: resolvedChatId,
        messages,
        messageId,
        message: text,
        attachments,
        thinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      });
      return Boolean(nextChatId);
    },
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      thinking,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
    ],
  );

  const handleBranchSwitch = useCallback(
    (nextChatId: string) => {
      if (!nextChatId || nextChatId === chatId) {
        return;
      }
      setChatId(nextChatId);
    },
    [chatId, setChatId],
  );

  const isDisabled =
    !engineConfigId ||
    (!isExternalEngine && !hasLLMConfig) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = useMemo(
    () =>
      getChatEditDisabledReason({
        hasEngineConfig: Boolean(engineConfigId),
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        noLLMConfigsAvailable,
      }),
    [
      engineConfigId,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
      noLLMConfigsAvailable,
    ],
  );
  const submitDisabled = useMemo(
    () => !waitingForResponse && hasPendingToolInteraction(messages),
    [messages, waitingForResponse],
  );
  const executionControls = useMemo(
    () => ({
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
      onPermissionModeChange: (nextMode: ChatPermissionModeValue) => {
        updateExecutionSettings(
          {
            permissionMode: nextMode,
            searchEnabled: executionSettings.searchEnabled,
          },
          `Permissions set to ${nextMode}.`,
        );
      },
      onSearchEnabledChange: (nextValue: boolean) => {
        updateExecutionSettings(
          {
            permissionMode: executionSettings.permissionMode,
            searchEnabled: nextValue,
          },
          `Search ${nextValue ? "enabled" : "disabled"}.`,
        );
      },
    }),
    [
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      updateExecutionSettings,
    ],
  );
  const handleDesignFirstPrompt = useCallback(() => {
    const starterPrompt = buildDesignFirstFigmaStarterPrompt();
    setDraftMessage((current) => (current.trim() ? current : starterPrompt));
  }, []);
  const handleProviderDictationTranscribe = useCallback(
    async (audioBlob: Blob) => {
      if (!engineConfigId || isExternalEngine) {
        return null;
      }
      return transcribeChatAudio(engineConfigId, audioBlob);
    },
    [engineConfigId, isExternalEngine],
  );

  return (
    <>
      {showEmptyState ? (
        <EmptyChatState
          starterPrompts={visibleStarterPrompts}
          disabled={isDisabled}
          onStarterPrompt={(prompt) => {
            void handleSubmit(prompt, []);
          }}
          onDesignFirstPrompt={handleDesignFirstPrompt}
        />
      ) : (
        <ChatMessageList
          messages={messages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
          editDisabledReason={editDisabledReason}
          onEditMessage={handleEditMessage}
          onBranchSwitch={handleBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
        />
      )}
      <ChatInput
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        submitDisabled={submitDisabled}
        disabled={isDisabled}
        value={draftMessage}
        onChange={setDraftMessage}
        onSubmit={handleSubmit}
        onStop={handleStop}
        slashCommands={slashCommands}
        onSlashCommand={handleSlashCommand}
        executionControls={executionControls}
        executionControlVisibility={{
          permissionMode: showPermissionExecutionControl,
          search: showSearchExecutionControl,
        }}
        dictationEnabledByProvider={Boolean(engineConfigId)}
        onProviderDictationTranscribe={
          isExternalEngine ? undefined : handleProviderDictationTranscribe
        }
      />
    </>
  );
});
