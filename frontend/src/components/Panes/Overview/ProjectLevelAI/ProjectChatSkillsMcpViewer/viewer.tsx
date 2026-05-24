import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { getExtensions } from "components/Utils/CodeMirror/getExtensions";

import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";

import {
  getAppGenSkills,
  revealPathInOsFileExplorer,
  upsertAppGenCustomSkill,
} from "openapi/http";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  type ProjectChatCustomSlashCommand,
  useAIStore,
  useLocalStorage,
} from "state/definitions";

import {
  type BaseChatMessageUnion,
  type SkillContent,
  type SkillEntry,
} from "utils/generatedTypes";

import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

import { clamp } from "utils/utils";

import {
  buildSkillStatusBySkillId,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
} from "../projectChatSkillsMcpViewerUtils";

import { selectCustomProjectChatSlashCommands } from "../projectChatSlashCommandSelectors";

import {
  DEFAULT_SKILLS_LIST_HEIGHT_PCT,
  MIN_SKILLS_LIST_HEIGHT_PCT,
  MIN_SKILL_MARKDOWN_HEIGHT_PCT,
  ProjectChatSkillsMcpViewerProps,
  SKILL_MARKDOWN_VIEWER_STORAGE_KEY,
  SKILL_MARKDOWN_VIEW_MODE_RAW,
  SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY,
  SkillContentCacheEntry,
  SkillContentLoadStatus,
  SkillMarkdownDraftStateEntry,
  SkillMarkdownViewMode,
  applySelectedSkillViewState,
  attachSkillsListResizeListeners,
  canCreateCustomSkill,
  isActionablePath,
  resolveInitialSkillMarkdownViewMode,
  resolveInitialSkillMarkdownViewerOpen,
  resolveProjectChatSkillsViewTestId,
  resolveRawMarkdownModeHint,
  resolveRenderedSkillPreviewContent,
  resolveSaveSelectedSkillButtonTitle,
  resolveSelectedCustomSkillSaveError,
  resolveSelectedSkill,
  resolveSelectedSkillViewStateAfterUpsertedSkillResponse,
  resolveSkillMarkdownRawDraft,
  resolveSkillMarkdownRawDraftBySkillIdHydration,
  resolveSkillMarkdownRawDraftBySkillIdReplace,
  resolveSkillMarkdownRawDraftBySkillIdUpdate,
  resolveSkillPreviewContent,
  resolveSkillPreviewTruncationNotice,
  selectChatMessagesForChat,
  upsertAppGenSkillEntry,
} from "./skillState";

import {
  McpSection,
  canEditSelectedSkillMarkdown,
  loadSelectedSkillContent,
  resolveCanSaveSelectedSkill,
  resolveProjectChatViewerLoadingState,
  runSkillsRefreshEffect,
} from "./skillMarkdownAndMcpPanels";

import { useProjectChatMcpRuntimeStatus } from "./mcpRuntimeStatus";
import { useProjectChatSlashCommandState } from "./slashCommandState";

import { SkillsSection, SlashCommandsSection } from "./skillsAndSlashSections";

export function ProjectChatSkillsMcpViewer({
  projectConfigId,
  chatId,
  engineConfigId,
  engineType,
  externalAgentToolType,
  viewMode,
}: ProjectChatSkillsMcpViewerProps) {
  const chatMessages = useAIStore((state): BaseChatMessageUnion[] | null =>
    selectChatMessagesForChat({ chatId, state }),
  );
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
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
  );
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const allLLMConfigsInitialLoadComplete = useAIStore(
    (state) => state.allLLMConfigsInitialLoadComplete,
  );
  const codeMirrorTheme = useCodeMirrorStyle();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedSkillId, setSelectedSkillIdState] = useState<string | null>(
    null,
  );
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [selectedSkillContentTruncated, setSelectedSkillContentTruncated] =
    useState(false);
  const [selectedSkillOriginalSizeBytes, setSelectedSkillOriginalSizeBytes] =
    useState<number | null>(null);
  const [skillsListHeightPct, setSkillsListHeightPct] = useState(
    DEFAULT_SKILLS_LIST_HEIGHT_PCT,
  );
  const [skillContentLoadStatus, setSkillContentLoadStatus] =
    useState<SkillContentLoadStatus>("idle");
  const [skillContentLoadError, setSkillContentLoadError] = useState<
    string | null
  >(null);
  const storageAdapter = useMemo(
    () => getSafeLocalStorageAdapter("project-chat-skills-mcp-viewer"),
    [],
  );
  const [isSkillMarkdownViewerOpen, setIsSkillMarkdownViewerOpen] = useState(
    () => resolveInitialSkillMarkdownViewerOpen(storageAdapter),
  );
  const [skillMarkdownViewMode, setSkillMarkdownViewMode] =
    useState<SkillMarkdownViewMode>(() =>
      resolveInitialSkillMarkdownViewMode(storageAdapter),
    );
  const [
    skillMarkdownDraftStateBySkillId,
    setSkillMarkdownDraftStateBySkillId,
  ] = useState<Record<string, SkillMarkdownDraftStateEntry>>({});
  const [newCustomSkillRelativePath, setNewCustomSkillRelativePath] =
    useState("");
  const [customSkillCreateInFlight, setCustomSkillCreateInFlight] =
    useState(false);
  const [customSkillSaveInFlight, setCustomSkillSaveInFlight] = useState(false);
  const [customSkillCreateRootPath, setCustomSkillCreateRootPath] = useState<
    string | null
  >(null);
  const [customSkillCreateRootActionable, setCustomSkillCreateRootActionable] =
    useState(false);
  const [skillsRevision, setSkillsRevision] = useState(0);
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
  const skillsRefreshInFlight = useRef(false);
  const skillContentRequestSequence = useRef(0);
  const selectedSkillIdRef = useRef<string | null>(null);
  const setSelectedSkillId = useCallback(
    (
      nextSelectedSkillId:
        | string
        | null
        | ((currentSelectedSkillId: string | null) => string | null),
    ) => {
      if (typeof nextSelectedSkillId !== "function") {
        selectedSkillIdRef.current = nextSelectedSkillId;
        setSelectedSkillIdState(nextSelectedSkillId);
        return;
      }
      setSelectedSkillIdState((currentSelectedSkillId) => {
        const resolvedSelectedSkillId = nextSelectedSkillId(
          currentSelectedSkillId,
        );
        selectedSkillIdRef.current = resolvedSelectedSkillId;
        return resolvedSelectedSkillId;
      });
    },
    [],
  );
  const skillsSectionRef = useRef<HTMLDivElement | null>(null);
  const skillsResizeCleanupRef = useRef<(() => void) | null>(null);
  const skillContentCache = useRef(new Map<string, SkillContentCacheEntry>());
  const showSkillsSection = viewMode === "skills";
  const showMcpSection = viewMode === "mcp";
  const {
    mcpConfigPath,
    mcpRuntimeStatusByServerId,
    mcpRuntimeStatusError,
    mcpRuntimeStatusLoading,
    runtimeServers,
    settaFilesLocation,
  } = useProjectChatMcpRuntimeStatus({
    allLLMConfigsInitialLoadComplete,
    chatId,
    engineConfigId,
    mcpServers: allLLMConfigs?.mcpServers,
    projectConfigId,
    showMcpSection,
  });
  const refreshSkillsBrowser = useCallback(
    async function refreshSkillsBrowserImpl() {
      if (skillsRefreshInFlight.current) {
        return;
      }
      skillsRefreshInFlight.current = true;
      setSkillsLoading(true);
      setSkillsError(null);
      setCustomSkillCreateRootPath(null);
      setCustomSkillCreateRootActionable(false);
      try {
        const res = await callOpenAPI(getAppGenSkills());
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          setSkillsError(detail ?? "Failed to load skills.");
          return;
        }
        const nextSkills = res.data.skills;
        skillContentCache.current.clear();
        setSkills(nextSkills);
        setCustomSkillCreateRootPath(res.data.customSkillCreateRootPath);
        setCustomSkillCreateRootActionable(
          res.data.customSkillCreateRootActionable,
        );
        setSkillsRevision((value) => value + 1);
        setSelectedSkillId((current) => {
          if (nextSkills.length === 0) {
            return null;
          }
          return nextSkills.some((skill) => skill.skillId === current)
            ? current
            : nextSkills[0].skillId;
        });
      } finally {
        setSkillsLoading(false);
        skillsRefreshInFlight.current = false;
      }
    },
    [],
  );
  useEffect(() => {
    return () => {
      skillsResizeCleanupRef.current?.();
      skillsResizeCleanupRef.current = null;
    };
  }, []);
  useEffect(() => {
    runSkillsRefreshEffect({
      refreshSkillsBrowser,
      showSkillsSection,
    });
  }, [refreshSkillsBrowser, showSkillsSection]);
  useEffect(() => {
    void loadSelectedSkillContent({
      isSkillMarkdownViewerOpen,
      selectedSkillId,
      selectedSkillIdRef,
      setters: {
        setSelectedSkillContent,
        setSelectedSkillContentTruncated,
        setSelectedSkillOriginalSizeBytes,
        setSkillContentLoadError,
        setSkillContentLoadStatus,
      },
      showSkillsSection,
      skillContentCache,
      skillContentRequestSequence,
      skillsRevision,
    });
  }, [
    isSkillMarkdownViewerOpen,
    selectedSkillId,
    showSkillsSection,
    skillsRevision,
  ]);
  useEffect(() => {
    storageAdapter.setItem(
      SKILL_MARKDOWN_VIEWER_STORAGE_KEY,
      isSkillMarkdownViewerOpen ? "true" : "false",
    );
  }, [isSkillMarkdownViewerOpen, storageAdapter]);
  useEffect(() => {
    storageAdapter.setItem(
      SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY,
      skillMarkdownViewMode,
    );
  }, [skillMarkdownViewMode, storageAdapter]);
  useEffect(() => {
    if (!selectedSkillId || skillContentLoadStatus !== "loaded") {
      return;
    }
    setSkillMarkdownDraftStateBySkillId((current) => {
      const next = resolveSkillMarkdownRawDraftBySkillIdHydration({
        skillMarkdownDraftStateBySkillId: current,
        skillId: selectedSkillId,
        skillContent: selectedSkillContent,
      });
      return next ?? current;
    });
  }, [selectedSkillContent, selectedSkillId, skillContentLoadStatus]);
  const filteredSkills = useMemo(() => {
    return filterSkills(skills, skillFilter);
  }, [skillFilter, skills]);
  const skillStatusBySkillId = useMemo(() => {
    return buildSkillStatusBySkillId({
      skills,
      engineType,
      externalAgentToolType,
      messages: chatMessages,
    });
  }, [chatMessages, engineType, externalAgentToolType, skills]);
  const groupedSkills = useMemo(() => {
    return groupSkillsByRootPath(filteredSkills);
  }, [filteredSkills]);
  const mcpServerGroups = useMemo(() => {
    return groupMcpServersByConfigPath({
      mcpServers: allLLMConfigs?.mcpServers,
      mcpConfigPath,
      settaFilesLocation,
      runtimeServers,
    });
  }, [
    allLLMConfigs?.mcpServers,
    runtimeServers,
    mcpConfigPath,
    settaFilesLocation,
  ]);
  const {
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
  } = useProjectChatSlashCommandState({
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
  });
  const readonlyMarkdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: true,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);
  const editableMarkdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: false,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);
  const { mcpServersLoading, showSkillsLoadingState } =
    resolveProjectChatViewerLoadingState({
      allLLMConfigsInitialLoadComplete,
      mcpRuntimeStatusLoading,
      skillsCount: skills.length,
      skillsLoading,
    });
  const skillContentLoading = skillContentLoadStatus === "loading";
  const skillMarkdownRawDraft = resolveSkillMarkdownRawDraft({
    selectedSkillId,
    skillMarkdownDraftStateBySkillId,
  });
  const canCreateCustomSkillButton = useMemo(() => {
    return canCreateCustomSkill({
      customSkillCreateInFlight,
      customSkillCreateRootPath,
      newCustomSkillRelativePath,
    });
  }, [
    customSkillCreateInFlight,
    customSkillCreateRootPath,
    newCustomSkillRelativePath,
  ]);
  const selectedSkill = useMemo(() => {
    return resolveSelectedSkill(skills, selectedSkillId);
  }, [selectedSkillId, skills]);
  const selectedSkillIsEditable = selectedSkill?.isEditable === true;
  const selectedSkillEditabilityReason =
    selectedSkill?.editabilityReason ?? null;
  const skillPreviewContent = useMemo(() => {
    return resolveSkillPreviewContent({
      skillContentLoading,
      skillsLoading,
      selectedSkillId,
      skillContentLoadStatus,
      selectedSkillContent,
    });
  }, [
    selectedSkillContent,
    selectedSkillId,
    skillContentLoadStatus,
    skillContentLoading,
    skillsLoading,
  ]);
  const renderedSkillPreviewContent = useMemo(() => {
    return resolveRenderedSkillPreviewContent({
      skillPreviewContent,
      skillMarkdownRawDraft,
      selectedSkillId,
      skillContentLoadStatus,
    });
  }, [
    skillContentLoadStatus,
    skillMarkdownRawDraft,
    skillPreviewContent,
    selectedSkillId,
  ]);
  const skillPreviewTruncationNotice = resolveSkillPreviewTruncationNotice({
    selectedSkillContentTruncated,
    selectedSkillOriginalSizeBytes,
  });
  const isRawMarkdownView =
    skillMarkdownViewMode === SKILL_MARKDOWN_VIEW_MODE_RAW;
  const rawMarkdownModeHint = useMemo(() => {
    return resolveRawMarkdownModeHint({
      selectedSkillContentTruncated,
      selectedSkillEditabilityReason,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadStatus,
    });
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const saveSelectedSkillButtonTitle = useMemo(() => {
    return resolveSaveSelectedSkillButtonTitle({
      selectedSkillContentTruncated,
      selectedSkillEditabilityReason,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadStatus,
    });
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const skillMarkdownEditable = canEditSelectedSkillMarkdown({
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  });
  const saveSelectedCustomSkillError = useMemo(() => {
    return resolveSelectedCustomSkillSaveError({
      selectedSkillEditabilityReason,
      selectedSkillContentTruncated,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadError,
      skillContentLoadStatus,
      skillMarkdownRawDraft,
    });
  }, [
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadError,
    skillContentLoadStatus,
    skillMarkdownRawDraft,
  ]);
  const canSaveSelectedSkill = resolveCanSaveSelectedSkill({
    customSkillSaveInFlight,
    isRawMarkdownView,
    saveSelectedCustomSkillError,
    skillContentLoading,
    skillMarkdownEditable,
    skillMarkdownRawDraft,
  });
  const copyPathToClipboard = useCallback((path: string | null) => {
    if (!isActionablePath(path)) {
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(path);
        addTemporaryNotification("Copied path to clipboard.");
      } catch (error) {
        const detail =
          getErrorDetail(error) ??
          (error instanceof Error ? error.message : null);
        addTemporaryNotification(
          detail
            ? `Failed to copy path: ${detail}`
            : "Failed to copy path to clipboard.",
        );
      }
    })();
  }, []);
  const revealPathInFileExplorer = useCallback(async (path: string | null) => {
    if (!isActionablePath(path)) {
      return;
    }
    const res = await callOpenAPI(
      revealPathInOsFileExplorer({
        body: { path },
      } as Parameters<typeof revealPathInOsFileExplorer>[0]),
    );
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      addTemporaryNotification(
        detail
          ? `Failed to reveal path: ${detail}`
          : "Failed to reveal path in file explorer.",
      );
      return;
    }
  }, []);
  const handleRefreshSkills = useCallback(() => {
    void refreshSkillsBrowser();
  }, [refreshSkillsBrowser]);
  const handleRevealPathInFileExplorer = useCallback(
    (path: string | null) => {
      void revealPathInFileExplorer(path);
    },
    [revealPathInFileExplorer],
  );
  const handleRevealCustomSkillRoot = useCallback(() => {
    void revealPathInFileExplorer(customSkillCreateRootPath);
  }, [customSkillCreateRootPath, revealPathInFileExplorer]);
  const handleResetSkillsListHeight = useCallback(() => {
    setSkillsListHeightPct(DEFAULT_SKILLS_LIST_HEIGHT_PCT);
  }, []);
  const handleSkillMarkdownDraftChange = useCallback(
    (value: string) => {
      if (!skillMarkdownEditable || !selectedSkillId) {
        return;
      }
      setSkillMarkdownDraftStateBySkillId((current) => {
        const next = resolveSkillMarkdownRawDraftBySkillIdUpdate({
          skillMarkdownDraftStateBySkillId: current,
          skillId: selectedSkillId,
          nextRawDraft: value,
        });
        return next ?? current;
      });
    },
    [selectedSkillId, skillMarkdownEditable],
  );
  const applyUpsertedSkillResponse = useCallback(
    ({
      requestSkillId,
      selectUpdatedSkill,
      skill,
      skillContent,
    }: {
      requestSkillId: string | null;
      selectUpdatedSkill: boolean;
      skill: SkillEntry;
      skillContent: SkillContent;
    }) => {
      const cacheEntry: SkillContentCacheEntry = {
        content: skillContent.content,
        truncated: skillContent.truncated,
        originalSizeBytes: skillContent.originalSizeBytes,
      };
      for (const key of skillContentCache.current.keys()) {
        if (key.endsWith(`:${skill.skillId}`)) {
          skillContentCache.current.set(key, cacheEntry);
        }
      }
      skillContentCache.current.set(
        `${skillsRevision}:${skill.skillId}`,
        cacheEntry,
      );
      setSkills((current) => upsertAppGenSkillEntry(current, skill));
      setSkillMarkdownDraftStateBySkillId((current) => {
        const next = resolveSkillMarkdownRawDraftBySkillIdReplace({
          skillMarkdownDraftStateBySkillId: current,
          skillId: skill.skillId,
          nextRawDraft: skillContent.content,
        });
        return next ?? current;
      });
      const nextSelectedSkillViewState =
        resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
          currentSelectedSkillId: selectedSkillIdRef.current,
          requestSkillId,
          selectUpdatedSkill,
          skill,
          skillContent,
        });
      applySelectedSkillViewState({
        nextSelectedSkillViewState,
        setSelectedSkillContent,
        setSelectedSkillContentTruncated,
        setSelectedSkillId,
        setSelectedSkillOriginalSizeBytes,
        setSkillContentLoadError,
        setSkillContentLoadStatus,
      });
    },
    [skillsRevision],
  );
  const createCustomSkill = useCallback(
    async function createCustomSkillImpl() {
      const relativePath = newCustomSkillRelativePath.trim();
      if (!relativePath) {
        addTemporaryNotification("Provide a custom skill name first.");
        return;
      }
      setCustomSkillCreateInFlight(true);
      const initialContent = `# ${relativePath}\n\nDescribe what this skill helps with.\n`;
      const res = await callOpenAPI(
        upsertAppGenCustomSkill({
          body: {
            skillId: null,
            relativePath,
            content: initialContent,
          },
        } as Parameters<typeof upsertAppGenCustomSkill>[0]),
      );
      setCustomSkillCreateInFlight(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        addTemporaryNotification(
          detail
            ? `Failed to create custom skill: ${detail}`
            : "Failed to create custom skill.",
        );
        return;
      }
      setCustomSkillCreateRootPath(res.data.rootPath);
      setCustomSkillCreateRootActionable(true);
      setNewCustomSkillRelativePath("");
      setIsSkillMarkdownViewerOpen(true);
      setSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RAW);
      applyUpsertedSkillResponse({
        requestSkillId: null,
        selectUpdatedSkill: true,
        skill: res.data.skill,
        skillContent: res.data.skillContent,
      });
      addTemporaryNotification(`Created custom skill ${relativePath}.`);
    },
    [applyUpsertedSkillResponse, newCustomSkillRelativePath],
  );
  const handleCreateCustomSkill = useCallback(() => {
    void createCustomSkill();
  }, [createCustomSkill]);
  const saveSelectedCustomSkill = useCallback(
    async function saveSelectedCustomSkillImpl() {
      if (!selectedSkillId) {
        return;
      }
      const requestSkillId = selectedSkillId;
      if (saveSelectedCustomSkillError) {
        addTemporaryNotification(saveSelectedCustomSkillError);
        return;
      }
      const nextContent = skillMarkdownRawDraft;
      if (nextContent === null) {
        return;
      }
      setCustomSkillSaveInFlight(true);
      const res = await callOpenAPI(
        upsertAppGenCustomSkill({
          body: {
            skillId: requestSkillId,
            relativePath: null,
            content: nextContent,
          },
        } as Parameters<typeof upsertAppGenCustomSkill>[0]),
      );
      setCustomSkillSaveInFlight(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        addTemporaryNotification(
          detail
            ? `Failed to save custom skill: ${detail}`
            : "Failed to save custom skill.",
        );
        return;
      }
      applyUpsertedSkillResponse({
        requestSkillId,
        selectUpdatedSkill: false,
        skill: res.data.skill,
        skillContent: res.data.skillContent,
      });
      addTemporaryNotification("Saved custom skill.");
    },
    [
      applyUpsertedSkillResponse,
      selectedSkillId,
      skillMarkdownRawDraft,
      saveSelectedCustomSkillError,
    ],
  );
  const handleSaveSelectedCustomSkill = useCallback(() => {
    void saveSelectedCustomSkill();
  }, [saveSelectedCustomSkill]);
  const beginSkillsListResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isSkillMarkdownViewerOpen) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const container = skillsSectionRef.current;
      if (!container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.height <= 0) {
        return;
      }
      const pointerId = event.pointerId;
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const offsetY = moveEvent.clientY - bounds.top;
        const rawListHeightPct = (offsetY / bounds.height) * 100;
        setSkillsListHeightPct(
          clamp(
            rawListHeightPct,
            MIN_SKILLS_LIST_HEIGHT_PCT,
            100 - MIN_SKILL_MARKDOWN_HEIGHT_PCT,
          ),
        );
      };
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        skillsResizeCleanupRef.current = null;
      };
      skillsResizeCleanupRef.current?.();
      const cleanup = attachSkillsListResizeListeners({
        target: window,
        onMove,
        onUp,
      });
      skillsResizeCleanupRef.current = cleanup;
    },
    [isSkillMarkdownViewerOpen],
  );
  const contentByViewMode: Record<
    ProjectChatSkillsMcpViewerProps["viewMode"],
    ReactNode
  > = {
    mcp: (
      <McpSection
        mcpServerGroups={mcpServerGroups}
        mcpRuntimeStatusByServerId={mcpRuntimeStatusByServerId}
        mcpRuntimeStatusError={mcpRuntimeStatusError}
        mcpRuntimeStatusLoading={mcpRuntimeStatusLoading}
        mcpServersLoading={mcpServersLoading}
        onCopyPath={copyPathToClipboard}
        onRevealPath={handleRevealPathInFileExplorer}
      />
    ),
    skills: (
      <SkillsSection
        beginSkillsListResize={beginSkillsListResize}
        canCreateCustomSkillButton={canCreateCustomSkillButton}
        canSaveSelectedSkill={canSaveSelectedSkill}
        codeMirrorTheme={codeMirrorTheme}
        customSkillCreateRootActionable={customSkillCreateRootActionable}
        customSkillCreateRootPath={customSkillCreateRootPath}
        editableMarkdownViewerExtensions={editableMarkdownViewerExtensions}
        groupedSkills={groupedSkills}
        isRawMarkdownView={isRawMarkdownView}
        isSkillMarkdownViewerOpen={isSkillMarkdownViewerOpen}
        newCustomSkillRelativePath={newCustomSkillRelativePath}
        onCopyPath={copyPathToClipboard}
        onCreateCustomSkill={handleCreateCustomSkill}
        onRefreshSkills={handleRefreshSkills}
        onRevealPath={handleRevealPathInFileExplorer}
        onRevealCustomSkillRoot={handleRevealCustomSkillRoot}
        onSelectSkill={setSelectedSkillId}
        onSetSkillMarkdownViewerOpen={setIsSkillMarkdownViewerOpen}
        onSelectSkillMarkdownViewMode={setSkillMarkdownViewMode}
        onSetNewCustomSkillRelativePath={setNewCustomSkillRelativePath}
        onSkillFilterChange={setSkillFilter}
        onSkillMarkdownDraftChange={handleSkillMarkdownDraftChange}
        onResetSkillsListHeight={handleResetSkillsListHeight}
        onSaveSelectedCustomSkill={handleSaveSelectedCustomSkill}
        rawMarkdownModeHint={rawMarkdownModeHint}
        readonlyMarkdownViewerExtensions={readonlyMarkdownViewerExtensions}
        renderedSkillPreviewContent={renderedSkillPreviewContent}
        saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
        selectedSkillId={selectedSkillId}
        showSkillsLoadingState={showSkillsLoadingState}
        skillContentLoadError={skillContentLoadError}
        skillContentLoadStatus={skillContentLoadStatus}
        skillFilter={skillFilter}
        skillMarkdownEditable={skillMarkdownEditable}
        skillMarkdownRawDraft={skillMarkdownRawDraft}
        skillPreviewContent={skillPreviewContent}
        skillPreviewTruncationNotice={skillPreviewTruncationNotice}
        skillStatusBySkillId={skillStatusBySkillId}
        skillsError={skillsError}
        skillsListHeightPct={skillsListHeightPct}
        skillsLoading={skillsLoading}
        skillsSectionRef={skillsSectionRef}
      />
    ),
    slash_commands: (
      <SlashCommandsSection
        addCustomProjectChatSlashCommand={addCustomProjectChatSlashCommand}
        canAddCustomSlashCommand={canAddCustomSlashCommand}
        conflictingCustomSlashCommandTokens={
          conflictingCustomSlashCommandTokens
        }
        customSlashCommandModeItems={customSlashCommandModeItems}
        customSlashCommandDefinitions={customSlashCommandDefinitions}
        customSlashNamespaceAuthorityReady={customSlashNamespaceAuthorityReady}
        defaultCustomSlashCommandMode={defaultCustomSlashCommandMode}
        engineConfigsInitialLoadComplete={engineConfigsInitialLoadComplete}
        newCustomSlashAppGenerationMode={newCustomSlashAppGenerationMode}
        newCustomSlashCommand={newCustomSlashCommand}
        newCustomSlashPrompt={newCustomSlashPrompt}
        onRemoveCustomProjectChatSlashCommand={
          removeCustomProjectChatSlashCommand
        }
        onSelectSlashEngine={setSelectedSlashEngineId}
        onSetNewCustomSlashAppGenerationMode={
          setNewCustomSlashAppGenerationMode
        }
        onSetNewCustomSlashCommand={setNewCustomSlashCommand}
        onSetNewCustomSlashPrompt={setNewCustomSlashPrompt}
        selectedAgentNativeSlashCommands={selectedAgentNativeSlashCommands}
        selectedAgentNativeSlashStatus={selectedAgentNativeSlashStatus}
        selectedSlashEngine={selectedSlashEngine}
        slashCommandsByEngine={slashCommandsByEngine}
      />
    ),
  };
  return (
    <div
      className="-mr-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll pr-1 pt-4 text-sm text-setta-600 dark:text-setta-300"
      data-testid={resolveProjectChatSkillsViewTestId(viewMode)}
    >
      {contentByViewMode[viewMode]}
    </div>
  );
}
