import * as Accordion from "@radix-ui/react-accordion";
import CodeMirror from "@uiw/react-codemirror";
import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  normalizeSlashCommandToken,
} from "components/Chat/chatComposerControls";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiChevronDown, FiPlus, FiRefreshCw, FiSave } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadAgentRuns } from "state/actions/ai";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  type ProjectChatCustomSlashCommand,
  useAIStore,
  useLocalStorage,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  type AppGenSkillContent,
  type AppGenSkillEntry,
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_mcp_server_runtime_status,
  route_reveal_path_in_os_file_explorer,
  route_upsert_app_gen_custom_skill,
} from "utils/generatedGoEndpoints";
import {
  type BaseChatMessageUnion,
  type EngineConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { clamp } from "utils/utils";
import {
  type AgentNativeSlashCommandsEntry,
  type AgentRunsAuthorityState,
  buildReservedSlashCommandTokens,
  buildSkillStatusBySkillId,
  buildSlashCommandsByEngine,
  DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
  EMPTY_AGENT_NATIVE_COMMANDS,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  isAgentRunsAuthorityReady,
  type McpRuntimeServerStatus,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveMcpServerStatus,
  resolveVisibleAgentNativeSlashCommandsByEngineId,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";

type PathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

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
const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";
const SKILL_MARKDOWN_VIEW_MODE_RENDERED = "rendered";
const SKILL_MARKDOWN_VIEW_MODE_RAW = "raw";
const DEFAULT_SKILLS_LIST_HEIGHT_PCT = 66;
const MIN_SKILLS_LIST_HEIGHT_PCT = 30;
const MIN_SKILL_MARKDOWN_HEIGHT_PCT = 20;
const SKILL_MARKDOWN_RENDERED_CLASS =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0";
type SkillMarkdownViewMode =
  | typeof SKILL_MARKDOWN_VIEW_MODE_RENDERED
  | typeof SKILL_MARKDOWN_VIEW_MODE_RAW;
type SkillContentLoadStatus = "idle" | "loading" | "loaded" | "error";
type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;
type SkillMarkdownDraftStateEntry = {
  draft: string;
  loadedContent: string;
};
type CustomSlashCommandDraft = {
  command: string;
  prompt: string;
};
const EMPTY_CUSTOM_SLASH_COMMAND_DRAFT: CustomSlashCommandDraft = {
  command: "",
  prompt: "",
};

type ResolveSkillMarkdownRawDraftBySkillIdHydrationInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  skillContent: string;
};

type ResolveSkillMarkdownRawDraftBySkillIdUpdateInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

type ResolveSkillMarkdownRawDraftBySkillIdReplaceInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

type ResolveCustomSlashDraftByProjectConfigIdUpdateInput = {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
  nextDraft: CustomSlashCommandDraft;
};
type SkillContentCacheEntry = {
  content: string;
  truncated: boolean;
  originalSizeBytes: number | null;
};
type SelectedSkillViewState = {
  selectedSkillId: string;
  selectedSkillContent: string;
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
};

function compareAppGenSkillEntries(
  first: AppGenSkillEntry,
  second: AppGenSkillEntry,
): number {
  const rootLabelComparison = first.rootLabel.localeCompare(second.rootLabel);
  if (rootLabelComparison !== 0) {
    return rootLabelComparison;
  }
  const relativePathComparison = first.relativePath.localeCompare(
    second.relativePath,
  );
  if (relativePathComparison !== 0) {
    return relativePathComparison;
  }
  return first.name.localeCompare(second.name);
}

export function upsertAppGenSkillEntry(
  skills: AppGenSkillEntry[],
  nextSkill: AppGenSkillEntry,
): AppGenSkillEntry[] {
  const existingIndex = skills.findIndex(
    (skill) => skill.skillId === nextSkill.skillId,
  );
  const nextSkills =
    existingIndex >= 0
      ? skills.map((skill, index) =>
          index === existingIndex ? nextSkill : skill,
        )
      : [...skills, nextSkill];
  return nextSkills.sort(compareAppGenSkillEntries);
}

export function resolveSkillMarkdownRawDraftBySkillIdHydration({
  skillMarkdownDraftStateBySkillId,
  skillId,
  skillContent,
}: ResolveSkillMarkdownRawDraftBySkillIdHydrationInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry) {
    if (currentEntry.loadedContent === skillContent) {
      return null;
    }
    if (currentEntry.draft !== currentEntry.loadedContent) {
      return {
        ...skillMarkdownDraftStateBySkillId,
        [skillId]: {
          ...currentEntry,
          loadedContent: skillContent,
        },
      };
    }
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: skillContent,
      loadedContent: skillContent,
    },
  };
}

export function resolveSkillMarkdownRawDraftBySkillIdReplace({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdReplaceInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (
    currentEntry &&
    currentEntry.draft === nextRawDraft &&
    currentEntry.loadedContent === nextRawDraft
  ) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: nextRawDraft,
    },
  };
}

export function resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
  currentSelectedSkillId,
  requestSkillId,
  selectUpdatedSkill,
  skill,
  skillContent,
}: {
  currentSelectedSkillId: string | null;
  requestSkillId: string | null;
  selectUpdatedSkill: boolean;
  skill: AppGenSkillEntry;
  skillContent: AppGenSkillContent;
}): SelectedSkillViewState | null {
  if (!selectUpdatedSkill && currentSelectedSkillId !== requestSkillId) {
    return null;
  }
  return {
    selectedSkillId: skill.skillId,
    selectedSkillContent: skillContent.content,
    selectedSkillContentTruncated: skillContent.truncated,
    selectedSkillOriginalSizeBytes: skillContent.originalSizeBytes,
  };
}

export function resolveSkillMarkdownRawDraftBySkillIdUpdate({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdUpdateInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry?.draft === nextRawDraft) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: currentEntry?.loadedContent ?? nextRawDraft,
    },
  };
}

export function resolveCustomSlashDraftByProjectConfigIdUpdate({
  customSlashDraftByProjectConfigId,
  projectConfigId,
  nextDraft,
}: ResolveCustomSlashDraftByProjectConfigIdUpdateInput): Record<
  string,
  CustomSlashCommandDraft
> | null {
  const currentDraft =
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
  if (
    currentDraft.command === nextDraft.command &&
    currentDraft.prompt === nextDraft.prompt
  ) {
    return null;
  }
  const nextByProjectConfigId = {
    ...customSlashDraftByProjectConfigId,
  };
  if (nextDraft.command === "" && nextDraft.prompt === "") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextDraft;
  }
  return nextByProjectConfigId;
}

function resolveAgentNativeSlashCommandsMessage(
  entry: AgentNativeSlashCommandsEntry,
): string {
  if (entry.status === "unknown" && entry.statusDetail) {
    return entry.statusDetail;
  }
  if (entry.status === "not_supported") {
    return (
      entry.statusDetail ??
      "This engine mode does not expose native slash command definitions."
    );
  }
  if (entry.status === "none") {
    return (
      entry.statusDetail ?? "This engine reported no native slash commands."
    );
  }
  if (entry.status === "error") {
    return entry.statusDetail
      ? `Native command metadata unavailable: ${entry.statusDetail}`
      : "Native command metadata unavailable for this engine.";
  }
  return (
    "No native commands discovered yet for this engine. Ask the agent for its " +
    "command list (for example, /help). This view auto-refreshes from agent run " +
    "metadata while this tab is selected."
  );
}

function resolveAgentNativeSlashAuthorityDetail(
  agentRunsAuthorityState: AgentRunsAuthorityState,
): string | null {
  if (agentRunsAuthorityState === "loading") {
    return "Native command authority is still loading for this project.";
  }
  if (
    agentRunsAuthorityState === "transient_error" ||
    agentRunsAuthorityState === "terminal_error"
  ) {
    return "Native command metadata is unavailable until agent metadata reloads for this project.";
  }
  return null;
}

function isActionablePath(path: string | null): path is string {
  if (typeof path !== "string") {
    return false;
  }
  const normalizedPath = path.trim().toLowerCase();
  return normalizedPath !== "";
}

export function canCreateCustomSkill({
  customSkillCreateInFlight,
  customSkillCreateRootPath,
  newCustomSkillRelativePath,
}: {
  customSkillCreateInFlight: boolean;
  customSkillCreateRootPath: string | null;
  newCustomSkillRelativePath: string;
}): boolean {
  if (customSkillCreateInFlight) {
    return false;
  }
  if (!isActionablePath(customSkillCreateRootPath)) {
    return false;
  }
  return newCustomSkillRelativePath.trim() !== "";
}

export function isCustomSlashNamespaceAuthorityReady({
  agentRunsAuthorityState,
  engineConfigsInitialLoadComplete,
  slashCommandsByEngine,
}: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  engineConfigsInitialLoadComplete: boolean;
  slashCommandsByEngine: Array<{ engineType: EngineConfig["engineType"] }>;
}): boolean {
  if (!engineConfigsInitialLoadComplete) {
    return false;
  }
  const hasExternalAgentEngine = slashCommandsByEngine.some(
    (entry) => entry.engineType === EngineTypeEnum.external_agent,
  );
  if (!hasExternalAgentEngine) {
    return true;
  }
  return isAgentRunsAuthorityReady(agentRunsAuthorityState);
}

export function resolveCanAddCustomSlashCommand({
  customSlashCommandTokens,
  namespaceAuthorityReady,
  newCustomSlashPrompt,
  normalizedNewCustomSlashCommand,
  reservedSlashCommandTokens,
}: {
  customSlashCommandTokens: Set<string>;
  namespaceAuthorityReady: boolean;
  newCustomSlashPrompt: string;
  normalizedNewCustomSlashCommand: string | null;
  reservedSlashCommandTokens: Set<string>;
}): boolean {
  if (!namespaceAuthorityReady) {
    return false;
  }
  if (!normalizedNewCustomSlashCommand) {
    return false;
  }
  if (!newCustomSlashPrompt.trim()) {
    return false;
  }
  if (reservedSlashCommandTokens.has(normalizedNewCustomSlashCommand)) {
    return false;
  }
  if (customSlashCommandTokens.has(normalizedNewCustomSlashCommand)) {
    return false;
  }
  return true;
}

export function shouldPollSlashCommandAgentRuns({
  viewMode,
  hasExternalAgentEngine,
}: {
  viewMode: ProjectChatSkillsMcpViewerProps["viewMode"];
  hasExternalAgentEngine: boolean;
}): boolean {
  if (viewMode !== "slash_commands") {
    return false;
  }
  if (!hasExternalAgentEngine) {
    return false;
  }
  return true;
}

export function resolveSkillPreviewContent({
  skillContentLoading,
  skillsLoading,
  selectedSkillId,
  skillContentLoadStatus,
  selectedSkillContent,
}: {
  skillContentLoading: boolean;
  skillsLoading: boolean;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  selectedSkillContent: string;
}): string {
  if (skillContentLoading || (skillsLoading && !selectedSkillId)) {
    return "Loading skill content...";
  }
  if (skillContentLoadStatus === "error") {
    return "Skill content unavailable.";
  }
  if (selectedSkillId && skillContentLoadStatus === "loaded") {
    return selectedSkillContent;
  }
  return "Select a skill to preview SKILL.md.";
}

export function resolveRenderedSkillPreviewContent({
  skillPreviewContent,
  skillMarkdownRawDraft,
  selectedSkillId,
  skillContentLoadStatus,
}: {
  skillPreviewContent: string;
  skillMarkdownRawDraft: string | null;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
}): string {
  if (
    selectedSkillId &&
    skillContentLoadStatus === "loaded" &&
    skillMarkdownRawDraft !== null
  ) {
    return skillMarkdownRawDraft;
  }
  return skillPreviewContent;
}

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

function PathGroupHeader({
  title,
  path,
  onCopyPath,
  onRevealPath,
}: PathGroupHeaderProps) {
  const actionablePath = isActionablePath(path);
  const displayPath = path && path.trim() ? path : "Unavailable";
  const iconButtonClassName =
    "grid h-5 w-5 place-items-center rounded text-setta-500 opacity-0 transition-all duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200";
  return (
    <div className="group/header flex min-w-0 items-start justify-between gap-2 px-1 pb-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-setta-700 dark:text-setta-200">
          {title}
        </div>
        <div
          className="truncate font-mono text-[10px] text-setta-400 dark:text-setta-500"
          title={displayPath}
        >
          {displayPath}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">
        <button
          aria-label={`Copy path for ${title}`}
          title="Copy path"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onCopyPath(path)}
        >
          <i className="gg-file !scale-[0.55]" />
        </button>
        <button
          aria-label={`Reveal path for ${title}`}
          title="Reveal in OS file explorer"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onRevealPath(path)}
        >
          <i className="gg-folder !scale-[0.55]" />
        </button>
      </div>
    </div>
  );
}

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
  const allLLMConfigsInitialLoadComplete = useAIStore(
    (state) => state.allLLMConfigsInitialLoadComplete,
  );
  const codeMirrorTheme = useCodeMirrorStyle();
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
  const [selectedSlashEngineId, setSelectedSlashEngineId] = useState<
    string | null
  >(null);
  const [
    customSlashDraftByProjectConfigId,
    setCustomSlashDraftByProjectConfigId,
  ] = useState<Record<string, CustomSlashCommandDraft>>({});
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
  const slashCommandsByEngine = useMemo(() => {
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
      selectedSlashEngine.engineType !== "external_agent"
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
      selectedSlashEngine.engineType !== "external_agent"
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
    return buildChatSlashCommands({
      model: true,
      permissions: true,
      search: true,
      appGenerationModes: true,
    });
  }, []);
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
  }, [selectedSlashEngineId, slashCommandsByEngine]);

  useEffect(() => {
    if (
      !shouldPollSlashCommandAgentRuns({
        viewMode,
        hasExternalAgentEngine: hasExternalAgentSlashEngine,
      })
    ) {
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
  }, [hasExternalAgentSlashEngine, viewMode]);

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

  const mcpServersLoading =
    !allLLMConfigsInitialLoadComplete || mcpRuntimeStatusLoading;
  const skillContentLoading = skillContentLoadStatus === "loading";
  const showSkillsLoadingState = skillsLoading && skills.length === 0;
  const skillMarkdownRawDraft = selectedSkillId
    ? skillMarkdownDraftStateBySkillId[selectedSkillId]?.draft ?? null
    : null;
  const currentCustomSlashDraft =
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
  const newCustomSlashCommand = currentCustomSlashDraft.command;
  const newCustomSlashPrompt = currentCustomSlashDraft.prompt;
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
  const skillPreviewTruncationNotice =
    selectedSkillContentTruncated && selectedSkillOriginalSizeBytes !== null
      ? `Preview truncated from ${selectedSkillOriginalSizeBytes.toLocaleString()} bytes.`
      : null;
  const isRawMarkdownView =
    skillMarkdownViewMode === SKILL_MARKDOWN_VIEW_MODE_RAW;
  const rawMarkdownModeHint = useMemo(() => {
    if (!selectedSkillId) {
      return "Read-only preview. Select a skill to edit.";
    }
    if (skillContentLoadStatus === "error") {
      return "Read-only preview. Resolve content loading errors before editing.";
    }
    if (skillContentLoadStatus !== "loaded") {
      return "Read-only preview. Skill content is still loading.";
    }
    if (!selectedSkillIsEditable) {
      return (
        selectedSkillEditabilityReason ??
        "Read-only preview. Select or create a custom skill to edit."
      );
    }
    if (selectedSkillContentTruncated) {
      return (
        "Preview is truncated. Full content loading is required before editing " +
        "or saving."
      );
    }
    return "Editing mode for custom skills.";
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const saveSelectedSkillButtonTitle = useMemo(() => {
    if (!selectedSkillId) {
      return "Select a skill to edit.";
    }
    if (skillContentLoadStatus === "error") {
      return "Cannot save while skill content failed to load.";
    }
    if (skillContentLoadStatus !== "loaded") {
      return "Skill content is still loading.";
    }
    if (!selectedSkillIsEditable) {
      return (
        selectedSkillEditabilityReason ?? "Only custom skills can be edited."
      );
    }
    if (selectedSkillContentTruncated) {
      return "Cannot save a truncated preview.";
    }
    return "Save selected custom skill";
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const canSaveSelectedSkill =
    skillContentLoadStatus === "loaded" &&
    selectedSkillIsEditable &&
    !!selectedSkillId &&
    isRawMarkdownView &&
    !selectedSkillContentTruncated &&
    skillMarkdownRawDraft !== null &&
    !skillContentLoading &&
    !customSkillSaveInFlight;

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
                  <PathGroupHeader
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
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
          data-testid="project-chat-skills-content"
        >
          <div className="grid gap-2">
            <search className="relative flex min-w-0 items-center gap-1">
              <div className="absolute left-0 grid select-none place-items-center pl-1">
                <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
              </div>
              <input
                aria-label="Filter skills"
                className="min-w-0 flex-grow cursor-text truncate rounded bg-setta-100/70 py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
                value={skillFilter}
                onChange={(event) => setSkillFilter(event.target.value)}
                placeholder="Filter"
              />
              <button
                type="button"
                data-testid="project-chat-skills-refresh"
                aria-label="Refresh"
                title="Refresh skills"
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                onClick={() => void refreshSkillsBrowser()}
                disabled={skillsLoading}
              >
                <FiRefreshCw
                  className={`h-3.5 w-3.5 ${skillsLoading ? "animate-spin" : ""}`}
                />
              </button>
            </search>
            <div className="flex min-w-0 items-center gap-1">
              <input
                aria-label="New custom skill name"
                data-testid="project-chat-custom-skill-relative-path-input"
                className="min-w-0 flex-1 cursor-text truncate rounded bg-setta-100/70 px-2 py-1 text-xs text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
                value={newCustomSkillRelativePath}
                onChange={(event) =>
                  setNewCustomSkillRelativePath(event.target.value)
                }
                placeholder="new-custom-skill"
              />
              <button
                type="button"
                data-testid="project-chat-custom-skill-create"
                aria-label="Create custom skill"
                title="Create custom skill"
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                onClick={() => void createCustomSkill()}
                disabled={!canCreateCustomSkillButton}
              >
                <FiPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 px-1 text-[10px] text-setta-500 dark:text-setta-400">
              <span
                className="truncate"
                data-testid="project-chat-custom-skill-root-path"
                title={
                  customSkillCreateRootPath ??
                  "Custom skill create root unavailable."
                }
              >
                {customSkillCreateRootPath
                  ? customSkillCreateRootActionable
                    ? `Custom skills root: ${customSkillCreateRootPath}`
                    : `Custom skills root (not created yet): ${customSkillCreateRootPath}`
                  : skillsLoading
                    ? "Loading custom skills root..."
                    : "Custom skills root unavailable."}
              </span>
              <button
                type="button"
                data-testid="project-chat-custom-skill-root-reveal"
                className="shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                onClick={() =>
                  void revealPathInFileExplorer(customSkillCreateRootPath)
                }
                disabled={
                  !customSkillCreateRootActionable ||
                  !isActionablePath(customSkillCreateRootPath)
                }
              >
                Open
              </button>
            </div>
          </div>
          <div
            ref={skillsSectionRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div
              className="min-h-0 min-w-0 overflow-auto rounded-md p-2 text-xs"
              data-testid="project-chat-skills-list-pane"
              style={
                isSkillMarkdownViewerOpen
                  ? { flexBasis: `${skillsListHeightPct}%` }
                  : undefined
              }
            >
              {skillsError ? (
                <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Skills unavailable ({skillsError}).
                </div>
              ) : null}
              {showSkillsLoadingState ? (
                <div className="text-setta-500 dark:text-setta-400">
                  Loading skills...
                </div>
              ) : groupedSkills.length === 0 ? (
                <div className="text-setta-500 dark:text-setta-400">
                  No skills found.
                </div>
              ) : (
                groupedSkills.map((group, groupIndex) => (
                  <div
                    key={group.rootPath}
                    className={groupIndex === 0 ? "" : "pt-2"}
                  >
                    <PathGroupHeader
                      title={group.rootLabel}
                      path={group.rootPath}
                      onCopyPath={copyPathToClipboard}
                      onRevealPath={(path) =>
                        void revealPathInFileExplorer(path)
                      }
                    />
                    <div className="mt-1 grid gap-1 border-t border-setta-200/80 px-1 pt-1 dark:border-setta-800">
                      {group.skills.map((skill) => {
                        const selected = skill.skillId === selectedSkillId;
                        const status = skillStatusBySkillId[skill.skillId];
                        const isApplicable = status?.isApplicable ?? false;
                        const isActive = status?.activityState === "active";
                        const isActivityUnknown =
                          status?.activityState === "unknown";
                        return (
                          <button
                            key={skill.skillId}
                            className={`flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded py-1 pl-1 pr-2 text-left transition-colors ${
                              selected
                                ? "bg-setta-100 text-blue-700 dark:bg-setta-800/80 dark:text-blue-300"
                                : "hover:bg-setta-100 dark:hover:bg-setta-800"
                            }`}
                            data-selected={selected ? "true" : "false"}
                            onClick={() => setSelectedSkillId(skill.skillId)}
                          >
                            <span
                              className="block w-full min-w-0 truncate font-semibold"
                              title={skill.name}
                              data-testid="skills-mcp-skill-name"
                            >
                              {skill.name}
                            </span>
                            <span
                              className="block w-full min-w-0 truncate text-[11px] opacity-80"
                              title={skill.relativePath}
                              data-testid="skills-mcp-skill-path"
                            >
                              {skill.relativePath}
                            </span>
                            {isApplicable || isActive || isActivityUnknown ? (
                              <span className="mt-0.5 flex w-full min-w-0 items-center gap-1 text-[10px] font-semibold">
                                {isApplicable ? (
                                  <span
                                    className="rounded border border-emerald-300 bg-emerald-50 px-1 py-[1px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                    title={status.applicabilityReason}
                                  >
                                    Applicable
                                  </span>
                                ) : null}
                                {isActive ? (
                                  <span
                                    className="rounded border border-blue-300 bg-blue-50 px-1 py-[1px] text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                    title={
                                      status.activitySource
                                        ? `Detected from ${status.activitySource}`
                                        : "Skill invocation observed."
                                    }
                                  >
                                    Active
                                  </span>
                                ) : null}
                                {isActivityUnknown ? (
                                  <span
                                    className="rounded border border-amber-300 bg-amber-50 px-1 py-[1px] text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                    title="Skill activity metadata is unavailable for this thread."
                                  >
                                    Unknown
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            {isSkillMarkdownViewerOpen ? (
              <div
                data-testid="project-chat-skills-resize-handle"
                role="separator"
                aria-label="Resize skill list and markdown viewer"
                className="group/resize relative flex h-3 cursor-row-resize items-center justify-center"
                onPointerDown={beginSkillsListResize}
                onDoubleClick={() =>
                  setSkillsListHeightPct(DEFAULT_SKILLS_LIST_HEIGHT_PCT)
                }
              >
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
                <div className="relative z-[1] h-1 w-10 rounded-full bg-setta-300/90 transition-colors group-hover/resize:bg-blue-400 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400" />
              </div>
            ) : null}
            <div
              className={
                isSkillMarkdownViewerOpen
                  ? "min-h-[140px] min-w-0 flex-1 overflow-hidden"
                  : "min-w-0"
              }
            >
              <Accordion.Root
                type="single"
                collapsible
                value={
                  isSkillMarkdownViewerOpen ? SKILL_MARKDOWN_VIEWER_VALUE : ""
                }
                onValueChange={(value) =>
                  setIsSkillMarkdownViewerOpen(
                    value === SKILL_MARKDOWN_VIEWER_VALUE,
                  )
                }
                className={isSkillMarkdownViewerOpen ? "h-full min-h-0" : ""}
              >
                <Accordion.Item
                  value={SKILL_MARKDOWN_VIEWER_VALUE}
                  className={`rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950 ${
                    isSkillMarkdownViewerOpen
                      ? "flex h-full min-h-0 flex-col"
                      : ""
                  }`}
                >
                  <Accordion.Header>
                    <Accordion.Trigger className="group box-border flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1 text-left">
                      <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                        Skill Markdown Viewer
                      </span>
                      <FiChevronDown
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 text-setta-500 transition-transform duration-150 group-data-[state=open]:rotate-180 dark:text-setta-400"
                      />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content
                    className={`overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown ${
                      isSkillMarkdownViewerOpen ? "min-h-0 flex-1" : ""
                    }`}
                  >
                    {isSkillMarkdownViewerOpen ? (
                      <div className="flex h-full min-h-0 flex-col">
                        {skillContentLoadStatus === "error" &&
                        skillContentLoadError ? (
                          <div
                            data-testid="project-chat-skill-content-error"
                            className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                          >
                            Failed to load skill content:{" "}
                            {skillContentLoadError}
                          </div>
                        ) : null}
                        {skillPreviewTruncationNotice ? (
                          <div className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {skillPreviewTruncationNotice}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-setta-200/80 px-2 py-1 dark:border-setta-700/80">
                          <div className="inline-flex items-center gap-1 rounded bg-setta-100/70 p-0.5 dark:bg-setta-900/80">
                            <button
                              type="button"
                              data-testid="project-chat-skill-markdown-view-rendered"
                              className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                                !isRawMarkdownView
                                  ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
                                  : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                              }`}
                              onClick={() =>
                                setSkillMarkdownViewMode(
                                  SKILL_MARKDOWN_VIEW_MODE_RENDERED,
                                )
                              }
                            >
                              Rendered
                            </button>
                            <button
                              type="button"
                              data-testid="project-chat-skill-markdown-view-raw"
                              className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                                isRawMarkdownView
                                  ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
                                  : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                              }`}
                              onClick={() =>
                                setSkillMarkdownViewMode(
                                  SKILL_MARKDOWN_VIEW_MODE_RAW,
                                )
                              }
                            >
                              Raw text
                            </button>
                          </div>
                          <button
                            type="button"
                            data-testid="project-chat-custom-skill-save"
                            className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
                            onClick={() => void saveSelectedCustomSkill()}
                            disabled={!canSaveSelectedSkill}
                            title={saveSelectedSkillButtonTitle}
                          >
                            <FiSave className="h-3 w-3" />
                            Save
                          </button>
                        </div>
                        {isRawMarkdownView ? (
                          <div className="px-2 py-1 text-[10px] text-setta-500 dark:text-setta-400">
                            {rawMarkdownModeHint}
                          </div>
                        ) : null}
                        {!isRawMarkdownView ? (
                          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                            <ReactMarkdown
                              className={SKILL_MARKDOWN_RENDERED_CLASS}
                              remarkPlugins={[remarkGfm]}
                            >
                              {renderedSkillPreviewContent}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="min-h-0 flex-1 overflow-hidden">
                            <CodeMirror
                              aria-label="Skill Markdown Content"
                              className="h-full text-xs [&_.cm-content]:text-xs [&_.cm-gutters]:text-xs"
                              height="100%"
                              value={
                                skillMarkdownRawDraft ?? skillPreviewContent
                              }
                              onChange={(value) => {
                                if (
                                  !selectedSkillIsEditable ||
                                  selectedSkillContentTruncated ||
                                  skillContentLoadStatus !== "loaded"
                                ) {
                                  return;
                                }
                                if (!selectedSkillId) {
                                  return;
                                }
                                setSkillMarkdownDraftStateBySkillId(
                                  (current) => {
                                    const next =
                                      resolveSkillMarkdownRawDraftBySkillIdUpdate(
                                        {
                                          skillMarkdownDraftStateBySkillId:
                                            current,
                                          skillId: selectedSkillId,
                                          nextRawDraft: value,
                                        },
                                      );
                                    return next ?? current;
                                  },
                                );
                              }}
                              theme={codeMirrorTheme}
                              extensions={
                                selectedSkillIsEditable &&
                                !selectedSkillContentTruncated &&
                                skillContentLoadStatus === "loaded"
                                  ? editableMarkdownViewerExtensions
                                  : readonlyMarkdownViewerExtensions
                              }
                              basicSetup={{
                                lineNumbers: false,
                                foldGutter: false,
                                highlightActiveLine: false,
                                tabSize: 4,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </div>
          </div>
        </section>
      ) : null}
      {showSlashCommandsSection ? (
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
                onChange={(event) =>
                  setNewCustomSlashCommand(event.target.value)
                }
                placeholder="/my-command"
                className="w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
                data-testid="project-chat-custom-slash-command-input"
              />
              <textarea
                value={newCustomSlashPrompt}
                onChange={(event) =>
                  setNewCustomSlashPrompt(event.target.value)
                }
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
                        {engine.engineType === "external_agent"
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
                  {selectedSlashEngine?.engineType === "external_agent" ? (
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
                      Agent-native slash commands apply to external agents.
                      Select an external engine tab to view discovered metadata.
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-setta-500 dark:text-setta-400">
                Setta command availability is defined by this app. Native agent
                command lists are sourced from current external-agent run
                metadata.
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
