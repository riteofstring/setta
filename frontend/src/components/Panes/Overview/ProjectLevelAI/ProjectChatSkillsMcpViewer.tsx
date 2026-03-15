import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_mcp_server_runtime_status,
  route_reveal_path_in_os_file_explorer,
  route_upsert_app_gen_custom_skill,
} from "utils/generatedEndpoints";
import {
  type AppGenSkillContent,
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineConfig,
} from "utils/generatedTypes";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { clamp } from "utils/utils";
import {
  DEFAULT_SKILLS_LIST_HEIGHT_PCT,
  MIN_SKILL_MARKDOWN_HEIGHT_PCT,
  MIN_SKILLS_LIST_HEIGHT_PCT,
  ProjectChatSkillsBrowser,
} from "./projectChatSkillsBrowser";
import { ProjectChatSkillsMcpPathGroupHeader } from "./projectChatSkillsMcpPathGroupHeader";
import {
  buildSkillStatusBySkillId,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  type McpRuntimeServerStatus,
  resolveMcpServerStatus,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";
import {
  canCreateCustomSkill,
  isActionablePath,
  resolveSelectedSkillViewStateAfterUpsertedSkillResponse,
  resolveSkillMarkdownRawDraftBySkillIdHydration,
  resolveSkillMarkdownRawDraftBySkillIdReplace,
  resolveSkillMarkdownRawDraftBySkillIdUpdate,
  SKILL_MARKDOWN_VIEW_MODE_RAW,
  SKILL_MARKDOWN_VIEW_MODE_RENDERED,
  type SkillContentCacheEntry,
  type SkillContentLoadStatus,
  type SkillMarkdownDraftStateEntry,
  type SkillMarkdownViewMode,
  upsertAppGenSkillEntry,
} from "./projectChatSkillsViewModel";
import { ProjectChatSlashCommandsView } from "./projectChatSlashCommandsView";

type ProjectChatSkillsMcpViewerProps = {
  projectConfigId: string;
  chatId: string | null | undefined;
  engineConfigId: string | null;
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  viewMode: "skills" | "mcp" | "slash_commands";
};

const SKILL_MARKDOWN_VIEWER_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";
const SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewMode";
type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

function attachSkillsListResizeListeners(args: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  const { target, onMove, onUp } = args;
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}

// Owns top-level routing between the skills, MCP, and slash-command views plus
// the async fetch/save flows that feed the extracted skills render owners.
export function ProjectChatSkillsMcpViewer({
  projectConfigId,
  chatId,
  engineConfigId,
  engineType,
  externalAgentToolType,
  viewMode,
}: ProjectChatSkillsMcpViewerProps) {
  const chatMessages = useAIStore((state): BaseChatMessageUnion[] | null => {
    if (!chatId) {
      return null;
    }
    const details = state.chatDetails[chatId];
    if (!details) {
      return null;
    }
    return details.messages;
  });
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const allLLMConfigsInitialLoadComplete = useAIStore(
    (state) => state.allLLMConfigsInitialLoadComplete,
  );
  const [skills, setSkills] = useState<AppGenSkillEntry[]>([]);
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
    () => {
      return (
        storageAdapter.getItem(SKILL_MARKDOWN_VIEWER_STORAGE_KEY) === "true"
      );
    },
  );
  const [skillMarkdownViewMode, setSkillMarkdownViewMode] =
    useState<SkillMarkdownViewMode>(() => {
      const rawValue = storageAdapter.getItem(
        SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY,
      );
      return rawValue === SKILL_MARKDOWN_VIEW_MODE_RAW
        ? SKILL_MARKDOWN_VIEW_MODE_RAW
        : SKILL_MARKDOWN_VIEW_MODE_RENDERED;
    });
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
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null);
  const [settaFilesLocation, setSettaFilesLocation] = useState<string | null>(
    null,
  );
  const [mcpRuntimeStatusLoading, setMcpRuntimeStatusLoading] = useState(true);
  const [mcpRuntimeStatusError, setMcpRuntimeStatusError] = useState<
    string | null
  >(null);
  const [mcpRuntimeStatusByServerId, setMcpRuntimeStatusByServerId] =
    useState<Record<string, McpRuntimeServerStatus> | null>(null);
  const [externalRuntimeServers, setExternalRuntimeServers] = useState<
    Array<{
      serverId: string;
      source: string;
      transport: string;
      endpoint: string;
    }>
  >([]);
  const [skillsRevision, setSkillsRevision] = useState(0);
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
  const showSlashCommandsSection = viewMode === "slash_commands";

  const refreshSkillsBrowser = useCallback(async () => {
    if (skillsRefreshInFlight.current) {
      return;
    }
    skillsRefreshInFlight.current = true;
    setSkillsLoading(true);
    setSkillsError(null);
    setCustomSkillCreateRootPath(null);
    setCustomSkillCreateRootActionable(false);
    try {
      const res = await route_get_app_gen_skills();
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
  }, []);

  useEffect(() => {
    return () => {
      skillsResizeCleanupRef.current?.();
      skillsResizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!showSkillsSection) {
      return;
    }
    void refreshSkillsBrowser();
  }, [refreshSkillsBrowser, showSkillsSection]);

  useEffect(() => {
    async function loadSkillContent() {
      if (!showSkillsSection) {
        return;
      }
      if (!selectedSkillId) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoadStatus("idle");
        setSkillContentLoadError(null);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      if (!isSkillMarkdownViewerOpen) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoadStatus("idle");
        setSkillContentLoadError(null);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      const cacheKey = `${skillsRevision}:${selectedSkillId}`;
      const cached = skillContentCache.current.get(cacheKey) ?? null;
      if (cached) {
        setSkillContentLoadStatus("loaded");
        setSkillContentLoadError(null);
        setSelectedSkillContent(cached.content);
        setSelectedSkillContentTruncated(cached.truncated);
        setSelectedSkillOriginalSizeBytes(cached.originalSizeBytes);
        return;
      }
      const requestedSkillId = selectedSkillId;
      const requestSequence = skillContentRequestSequence.current + 1;
      skillContentRequestSequence.current = requestSequence;
      setSkillContentLoadStatus("loading");
      setSkillContentLoadError(null);
      const res = await route_get_app_gen_skill_content({
        skillId: requestedSkillId,
      });
      if (
        requestSequence !== skillContentRequestSequence.current ||
        requestedSkillId !== selectedSkillIdRef.current
      ) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setSkillContentLoadStatus("error");
        setSkillContentLoadError(
          detail ?? "Failed to load selected skill content.",
        );
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      setSkillContentLoadStatus("loaded");
      setSkillContentLoadError(null);
      setSelectedSkillContent(res.data.content);
      setSelectedSkillContentTruncated(res.data.truncated);
      setSelectedSkillOriginalSizeBytes(res.data.originalSizeBytes);
      skillContentCache.current.set(cacheKey, {
        content: res.data.content,
        truncated: res.data.truncated,
        originalSizeBytes: res.data.originalSizeBytes,
      });
    }
    void loadSkillContent();
  }, [
    isSkillMarkdownViewerOpen,
    selectedSkillId,
    showSkillsSection,
    skillsRevision,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadMcpRuntimeStatus() {
      if (!showMcpSection || !allLLMConfigsInitialLoadComplete) {
        return;
      }
      setMcpRuntimeStatusLoading(true);
      setMcpRuntimeStatusError(null);
      const res = await route_get_mcp_server_runtime_status({
        chatId: chatId ?? null,
        engineConfigId: engineConfigId ?? null,
      });
      if (cancelled) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setMcpRuntimeStatusError(
          detail ?? "Failed to load MCP runtime status.",
        );
        setMcpRuntimeStatusByServerId(null);
        setExternalRuntimeServers([]);
        setMcpConfigPath(null);
        setSettaFilesLocation(null);
        setMcpRuntimeStatusLoading(false);
        return;
      }
      const settaStatuses = res.data.servers;
      const externalStatuses = res.data.externalServers;
      const runtimeStatusesByServerId = toRuntimeStatusByServerId([
        ...settaStatuses,
        ...externalStatuses,
      ]);
      setMcpRuntimeStatusByServerId(runtimeStatusesByServerId);
      setExternalRuntimeServers(
        externalStatuses.map((status) => ({
          serverId: status.serverId,
          source: status.source,
          transport: status.transport,
          endpoint: status.endpoint,
        })),
      );
      setMcpConfigPath(res.data.llmConfigPath);
      setSettaFilesLocation(res.data.activeSettaFilesLocation);
      setMcpRuntimeStatusLoading(false);
    }
    void loadMcpRuntimeStatus();
    return () => {
      cancelled = true;
    };
  }, [
    allLLMConfigsInitialLoadComplete,
    chatId,
    engineConfigId,
    allLLMConfigs?.mcpServers,
    showMcpSection,
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
      externalRuntimeServers,
    });
  }, [
    allLLMConfigs?.mcpServers,
    externalRuntimeServers,
    mcpConfigPath,
    settaFilesLocation,
  ]);
  const mcpServersLoading =
    !allLLMConfigsInitialLoadComplete || mcpRuntimeStatusLoading;
  const skillMarkdownRawDraft = selectedSkillId
    ? skillMarkdownDraftStateBySkillId[selectedSkillId]?.draft ?? null
    : null;
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
    if (!selectedSkillId) {
      return null;
    }
    return skills.find((skill) => skill.skillId === selectedSkillId) ?? null;
  }, [selectedSkillId, skills]);
  const selectedSkillIsEditable = selectedSkill?.isEditable === true;
  const selectedSkillEditabilityReason =
    selectedSkill?.editabilityReason ?? null;

  const updateSelectedSkillMarkdownDraft = useCallback(
    (nextRawDraft: string) => {
      if (
        !selectedSkillIsEditable ||
        selectedSkillContentTruncated ||
        skillContentLoadStatus !== "loaded" ||
        !selectedSkillId
      ) {
        return;
      }
      setSkillMarkdownDraftStateBySkillId((current) => {
        const next = resolveSkillMarkdownRawDraftBySkillIdUpdate({
          skillMarkdownDraftStateBySkillId: current,
          skillId: selectedSkillId,
          nextRawDraft,
        });
        return next ?? current;
      });
    },
    [
      selectedSkillContentTruncated,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadStatus,
    ],
  );

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
    const res = await route_reveal_path_in_os_file_explorer({ path });
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
  const applyUpsertedSkillResponse = useCallback(
    ({
      requestSkillId,
      selectUpdatedSkill,
      skill,
      skillContent,
    }: {
      requestSkillId: string | null;
      selectUpdatedSkill: boolean;
      skill: AppGenSkillEntry;
      skillContent: AppGenSkillContent;
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
      if (!nextSelectedSkillViewState) {
        return;
      }
      setSelectedSkillId(nextSelectedSkillViewState.selectedSkillId);
      setSkillContentLoadStatus("loaded");
      setSkillContentLoadError(null);
      setSelectedSkillContent(nextSelectedSkillViewState.selectedSkillContent);
      setSelectedSkillContentTruncated(
        nextSelectedSkillViewState.selectedSkillContentTruncated,
      );
      setSelectedSkillOriginalSizeBytes(
        nextSelectedSkillViewState.selectedSkillOriginalSizeBytes,
      );
    },
    [skillsRevision],
  );

  const createCustomSkill = useCallback(async () => {
    const relativePath = newCustomSkillRelativePath.trim();
    if (!relativePath) {
      addTemporaryNotification("Provide a custom skill name first.");
      return;
    }
    setCustomSkillCreateInFlight(true);
    const initialContent = `# ${relativePath}\n\nDescribe what this skill helps with.\n`;
    const res = await route_upsert_app_gen_custom_skill({
      skillId: null,
      relativePath,
      content: initialContent,
    });
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
  }, [applyUpsertedSkillResponse, newCustomSkillRelativePath]);

  const saveSelectedCustomSkill = useCallback(async () => {
    if (!selectedSkillId) {
      return;
    }
    const requestSkillId = selectedSkillId;
    if (skillContentLoadStatus === "error") {
      addTemporaryNotification(
        skillContentLoadError
          ? `Cannot save while skill content failed to load: ${skillContentLoadError}`
          : "Cannot save while skill content failed to load.",
      );
      return;
    }
    if (skillContentLoadStatus !== "loaded") {
      addTemporaryNotification("Skill content is still loading.");
      return;
    }
    if (!selectedSkillIsEditable) {
      addTemporaryNotification(
        selectedSkillEditabilityReason ??
          "Selected skill is read-only. Create or pick a custom skill to edit.",
      );
      return;
    }
    if (selectedSkillContentTruncated) {
      addTemporaryNotification(
        "Cannot save while this skill preview is truncated.",
      );
      return;
    }
    if (skillMarkdownRawDraft === null) {
      addTemporaryNotification("Skill content is still loading.");
      return;
    }
    const nextContent = skillMarkdownRawDraft;
    setCustomSkillSaveInFlight(true);
    const res = await route_upsert_app_gen_custom_skill({
      skillId: requestSkillId,
      relativePath: null,
      content: nextContent,
    });
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
  }, [
    applyUpsertedSkillResponse,
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadError,
    skillContentLoadStatus,
    skillMarkdownRawDraft,
  ]);

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

  return (
    <div
      className="-mr-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll pr-1 pt-4 text-sm text-setta-600 dark:text-setta-300"
      data-testid={
        showSkillsSection
          ? "project-chat-skills-view"
          : showMcpSection
            ? "project-chat-mcp-view"
            : "project-chat-slash-commands-view"
      }
    >
      {showMcpSection ? (
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="project-chat-mcp-content"
        >
          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md p-2 text-[11px]">
            {mcpServersLoading ? (
              <div className="text-setta-500 dark:text-setta-400">
                Loading MCP servers...
              </div>
            ) : mcpServerGroups.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No MCP servers configured.
              </div>
            ) : (
              mcpServerGroups.map((group, groupIndex) => (
                <div
                  key={`${group.configLabel}:${group.configPath ?? "unavailable"}`}
                  className={groupIndex === 0 ? "" : "pt-2"}
                >
                  <ProjectChatSkillsMcpPathGroupHeader
                    title={group.configLabel}
                    path={group.configPath}
                    onCopyPath={copyPathToClipboard}
                    onRevealPath={(path) => void revealPathInFileExplorer(path)}
                  />
                  {mcpRuntimeStatusError ? (
                    <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                      Runtime status check unavailable: {mcpRuntimeStatusError}
                    </div>
                  ) : null}
                  <div className="mt-1 grid gap-1 border-t border-setta-200/80 px-1 pt-1 dark:border-setta-800">
                    {group.servers.map((server) => {
                      const serverEndpointDisplay = `${server.transport} · ${server.endpoint}`;
                      const status = resolveMcpServerStatus({
                        serverId: server.serverId,
                        source: server.source,
                        endpoint: server.endpoint,
                        runtimeStatusByServerId: mcpRuntimeStatusByServerId,
                        runtimeStatusLoading: mcpRuntimeStatusLoading,
                        runtimeStatusError: mcpRuntimeStatusError,
                      });
                      const statusDotClassName =
                        status.color === "green"
                          ? "bg-emerald-500"
                          : status.color === "yellow"
                            ? "bg-amber-500"
                            : "bg-red-500";
                      return (
                        <div
                          key={server.serverId}
                          className="min-w-0 pb-1 last:pb-0"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${statusDotClassName}`}
                              title={status.quickInfo}
                              aria-label={status.quickInfo}
                            />
                            <div
                              className="truncate font-semibold"
                              title={`${server.serverId} - ${status.quickInfo}`}
                              data-testid="skills-mcp-server-id"
                            >
                              {server.serverId}
                            </div>
                          </div>
                          <div
                            className="truncate font-mono text-setta-500 dark:text-setta-400"
                            title={serverEndpointDisplay}
                            data-testid="skills-mcp-server-endpoint"
                          >
                            {serverEndpointDisplay}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
      {showSkillsSection ? (
        <ProjectChatSkillsBrowser
          skillsCount={skills.length}
          skillsLoading={skillsLoading}
          skillsError={skillsError}
          skillFilter={skillFilter}
          onSkillFilterChange={setSkillFilter}
          onRefreshSkills={() => void refreshSkillsBrowser()}
          newCustomSkillRelativePath={newCustomSkillRelativePath}
          onNewCustomSkillRelativePathChange={setNewCustomSkillRelativePath}
          canCreateCustomSkillButton={canCreateCustomSkillButton}
          onCreateCustomSkill={() => void createCustomSkill()}
          customSkillCreateRootPath={customSkillCreateRootPath}
          customSkillCreateRootActionable={customSkillCreateRootActionable}
          groupedSkills={groupedSkills}
          selectedSkillId={selectedSkillId}
          onSelectSkill={setSelectedSkillId}
          skillStatusBySkillId={skillStatusBySkillId}
          onCopyPathToClipboard={copyPathToClipboard}
          onRevealPathInFileExplorer={(path) =>
            void revealPathInFileExplorer(path)
          }
          skillsSectionRef={skillsSectionRef}
          isSkillMarkdownViewerOpen={isSkillMarkdownViewerOpen}
          onSkillMarkdownViewerOpenChange={setIsSkillMarkdownViewerOpen}
          skillsListHeightPct={skillsListHeightPct}
          onBeginSkillsListResize={beginSkillsListResize}
          onResetSkillsListHeight={() =>
            setSkillsListHeightPct(DEFAULT_SKILLS_LIST_HEIGHT_PCT)
          }
          selectedSkill={selectedSkill}
          selectedSkillContent={selectedSkillContent}
          selectedSkillContentTruncated={selectedSkillContentTruncated}
          selectedSkillOriginalSizeBytes={selectedSkillOriginalSizeBytes}
          skillContentLoadStatus={skillContentLoadStatus}
          skillContentLoadError={skillContentLoadError}
          skillMarkdownViewMode={skillMarkdownViewMode}
          onSkillMarkdownViewModeChange={setSkillMarkdownViewMode}
          skillMarkdownRawDraft={skillMarkdownRawDraft}
          customSkillSaveInFlight={customSkillSaveInFlight}
          onSaveSelectedCustomSkill={() => void saveSelectedCustomSkill()}
          onSkillMarkdownChange={updateSelectedSkillMarkdownDraft}
        />
      ) : null}
      <ProjectChatSlashCommandsView
        isVisible={showSlashCommandsSection}
        projectConfigId={projectConfigId}
      />
    </div>
  );
}
