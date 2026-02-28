import * as Accordion from "@radix-ui/react-accordion";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { Resizable } from "re-resizable";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiChevronDown } from "react-icons/fi";
import { loadAgentRuns } from "state/actions/ai";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_mcp_server_runtime_status,
  route_reveal_path_in_os_file_explorer,
} from "utils/generatedEndpoints";
import {
  type AgentRun,
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineConfig,
} from "utils/generatedTypes";
import {
  buildSkillStatusBySkillId,
  buildSlashCommandsByEngine,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  type McpRuntimeServerStatus,
  resolveMcpServerStatus,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";

type PathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

type ProjectChatSkillsMcpViewerProps = {
  chatId: string | null | undefined;
  engineConfigId: string | null;
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
};

const SKILL_MARKDOWN_VIEWER_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";
const AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByEngineId";
const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";
const MCP_SECTION_ACCORDION_VALUE = "mcp-servers";
const SKILLS_SECTION_ACCORDION_VALUE = "skills";
const SLASH_COMMANDS_SECTION_ACCORDION_VALUE = "slash-commands";
const DEFAULT_SECTION_ACCORDION_VALUES = [
  MCP_SECTION_ACCORDION_VALUE,
  SKILLS_SECTION_ACCORDION_VALUE,
  SLASH_COMMANDS_SECTION_ACCORDION_VALUE,
];
const EMPTY_AGENT_NATIVE_COMMANDS: string[] = [];
type AgentNativeSlashCommandsStatus =
  | "unknown"
  | "available"
  | "none"
  | "not_supported"
  | "error";
type AgentNativeSlashCommandsEntry = {
  commands: string[];
  status: AgentNativeSlashCommandsStatus;
  statusDetail: string | null;
};
const DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY: AgentNativeSlashCommandsEntry =
  {
    commands: EMPTY_AGENT_NATIVE_COMMANDS,
    status: "unknown",
    statusDetail: null,
  };
const RESIZABLE_VERTICAL_HANDLE_HEIGHT_PX = 8;
const RESIZABLE_VERTICAL_HANDLE_OFFSET_PX = 8;
const RESIZABLE_VERTICAL_HANDLE_CLASS =
  "flex h-full w-full cursor-row-resize items-center justify-center";
const RESIZABLE_VERTICAL_HANDLE_BAR_CLASS =
  "h-0.5 w-14 rounded-full bg-setta-300/80 transition-colors hover:bg-blue-500 dark:bg-setta-600/80 dark:hover:bg-blue-400";

type VerticalResizablePaneProps = {
  defaultHeightPx: number;
  minHeightPx: number;
  maxHeight: number | string;
  contentClassName: string;
  contentTestId?: string;
  resizeHandleTestId?: string;
  children: ReactNode;
};

function VerticalResizablePane({
  defaultHeightPx,
  minHeightPx,
  maxHeight,
  contentClassName,
  contentTestId,
  resizeHandleTestId,
  children,
}: VerticalResizablePaneProps) {
  const [heightPx, setHeightPx] = useState(defaultHeightPx);
  return (
    <Resizable
      className="min-w-0"
      size={{ width: "100%", height: heightPx }}
      minHeight={minHeightPx}
      maxHeight={maxHeight}
      enable={{
        top: false,
        right: false,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      handleComponent={{
        bottom: (
          <div
            className={RESIZABLE_VERTICAL_HANDLE_CLASS}
            data-testid={resizeHandleTestId}
          >
            <div
              className={RESIZABLE_VERTICAL_HANDLE_BAR_CLASS}
              aria-hidden="true"
            />
          </div>
        ),
      }}
      handleStyles={{
        bottom: {
          bottom: `-${RESIZABLE_VERTICAL_HANDLE_OFFSET_PX}px`,
          height: `${RESIZABLE_VERTICAL_HANDLE_HEIGHT_PX}px`,
          left: "0px",
          right: "0px",
          width: "100%",
        },
      }}
      onResize={(_event, _direction, elementRef) => {
        setHeightPx(elementRef.offsetHeight);
      }}
      onResizeStop={(_event, _direction, elementRef) => {
        setHeightPx(elementRef.offsetHeight);
      }}
    >
      <div className={contentClassName} data-testid={contentTestId}>
        {children}
      </div>
    </Resizable>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeSlashCommandList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeAgentNativeSlashCommandsStatus(
  rawStatus: unknown,
): AgentNativeSlashCommandsStatus {
  if (typeof rawStatus !== "string") {
    return "unknown";
  }
  switch (rawStatus.trim()) {
    case "available":
      return "available";
    case "none":
      return "none";
    case "not_supported":
      return "not_supported";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

function parseAgentNativeSlashCommandsStorage(
  rawStorageValue: string | null,
): Record<string, AgentNativeSlashCommandsEntry> {
  if (!rawStorageValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawStorageValue);
    if (!isRecord(parsed)) {
      return {};
    }
    const normalized: Record<string, AgentNativeSlashCommandsEntry> = {};
    for (const [engineId, rawEntry] of Object.entries(parsed)) {
      if (!engineId.trim()) {
        continue;
      }
      if (Array.isArray(rawEntry)) {
        const commands = normalizeSlashCommandList(rawEntry);
        if (commands.length > 0) {
          normalized[engineId] = {
            commands,
            status: "available",
            statusDetail: null,
          };
        }
        continue;
      }
      if (!isRecord(rawEntry)) {
        continue;
      }
      const hasCommandsField = Array.isArray(rawEntry.commands);
      const commands = normalizeSlashCommandList(rawEntry.commands);
      const status = normalizeAgentNativeSlashCommandsStatus(rawEntry.status);
      const statusDetail = normalizeOptionalString(rawEntry.statusDetail);
      let resolvedStatus = status;
      if (commands.length > 0 && resolvedStatus === "unknown") {
        resolvedStatus = "available";
      } else if (hasCommandsField && resolvedStatus === "unknown") {
        resolvedStatus = "none";
      }
      if (
        commands.length === 0 &&
        resolvedStatus === "unknown" &&
        statusDetail === null
      ) {
        continue;
      }
      normalized[engineId] = {
        commands,
        status: resolvedStatus,
        statusDetail,
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

function areAgentNativeSlashEntriesEqual(
  a: AgentNativeSlashCommandsEntry | undefined,
  b: AgentNativeSlashCommandsEntry,
): boolean {
  if (!a) {
    return false;
  }
  if (a.status !== b.status || a.statusDetail !== b.statusDetail) {
    return false;
  }
  if (a.commands.length !== b.commands.length) {
    return false;
  }
  for (let index = 0; index < a.commands.length; index += 1) {
    if (a.commands[index] !== b.commands[index]) {
      return false;
    }
  }
  return true;
}

function extractAgentNativeSlashCommandsFromRun(
  run: AgentRun,
): { engineConfigId: string; entry: AgentNativeSlashCommandsEntry } | null {
  const outputs = run.outputs;
  if (!isRecord(outputs)) {
    return null;
  }
  const metadata = outputs.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const rawEngineConfigId = metadata.engineConfigId;
  if (
    typeof rawEngineConfigId !== "string" ||
    rawEngineConfigId.trim() === ""
  ) {
    return null;
  }
  const hasCommandsField = Array.isArray(metadata.agentNativeSlashCommands);
  const commands = normalizeSlashCommandList(metadata.agentNativeSlashCommands);
  const status = normalizeAgentNativeSlashCommandsStatus(
    metadata.agentNativeSlashCommandsStatus,
  );
  const statusDetail = normalizeOptionalString(
    metadata.agentNativeSlashCommandsStatusDetail,
  );
  let resolvedStatus = status;
  if (commands.length > 0 && resolvedStatus === "unknown") {
    resolvedStatus = "available";
  } else if (hasCommandsField && resolvedStatus === "unknown") {
    resolvedStatus = "none";
  }
  if (
    commands.length === 0 &&
    resolvedStatus === "unknown" &&
    statusDetail === null
  ) {
    return null;
  }
  return {
    engineConfigId: rawEngineConfigId,
    entry: {
      commands,
      status: resolvedStatus,
      statusDetail,
    },
  };
}

function resolveAgentNativeSlashCommandsMessage(
  entry: AgentNativeSlashCommandsEntry,
): string {
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

function isActionablePath(path: string | null): path is string {
  if (typeof path !== "string") {
    return false;
  }
  const normalizedPath = path.trim().toLowerCase();
  return normalizedPath !== "";
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
  chatId,
  engineConfigId,
  engineType,
  externalAgentToolType,
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
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
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
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [selectedSkillContentTruncated, setSelectedSkillContentTruncated] =
    useState(false);
  const [selectedSkillOriginalSizeBytes, setSelectedSkillOriginalSizeBytes] =
    useState<number | null>(null);
  const [skillContentLoading, setSkillContentLoading] = useState(false);
  const [isSkillMarkdownViewerOpen, setIsSkillMarkdownViewerOpen] = useState(
    () => {
      if (typeof window === "undefined") {
        return false;
      }
      return (
        window.localStorage.getItem(SKILL_MARKDOWN_VIEWER_STORAGE_KEY) ===
        "true"
      );
    },
  );
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
    agentNativeSlashCommandsByEngineId,
    setAgentNativeSlashCommandsByEngineId,
  ] = useState<Record<string, AgentNativeSlashCommandsEntry>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    return parseAgentNativeSlashCommandsStorage(
      window.localStorage.getItem(AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY),
    );
  });
  const [skillsRevision, setSkillsRevision] = useState(0);
  const skillsRefreshInFlight = useRef(false);
  const skillContentRequestSequence = useRef(0);
  const selectedSkillIdRef = useRef<string | null>(null);
  const skillContentCache = useRef(
    new Map<
      string,
      {
        content: string;
        truncated: boolean;
        originalSizeBytes: number | null;
      }
    >(),
  );

  const refreshSkillsBrowser = useCallback(async () => {
    if (skillsRefreshInFlight.current) {
      return;
    }
    skillsRefreshInFlight.current = true;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const res = await route_get_app_gen_skills();
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setSkillsError(detail ?? "Failed to load skills.");
        return;
      }
      const nextSkills = res.data;
      skillContentCache.current.clear();
      setSkills(nextSkills);
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
    void refreshSkillsBrowser();
  }, [refreshSkillsBrowser]);

  useEffect(() => {
    selectedSkillIdRef.current = selectedSkillId;
  }, [selectedSkillId]);

  useEffect(() => {
    async function loadSkillContent() {
      if (!selectedSkillId) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoading(false);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      if (!isSkillMarkdownViewerOpen) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoading(false);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      const cacheKey = `${skillsRevision}:${selectedSkillId}`;
      const cached = skillContentCache.current.get(cacheKey) ?? null;
      if (cached) {
        setSkillContentLoading(false);
        setSelectedSkillContent(cached.content);
        setSelectedSkillContentTruncated(cached.truncated);
        setSelectedSkillOriginalSizeBytes(cached.originalSizeBytes);
        return;
      }
      const requestedSkillId = selectedSkillId;
      const requestSequence = skillContentRequestSequence.current + 1;
      skillContentRequestSequence.current = requestSequence;
      setSkillContentLoading(true);
      const res = await route_get_app_gen_skill_content({
        skillId: requestedSkillId,
      });
      if (
        requestSequence !== skillContentRequestSequence.current ||
        requestedSkillId !== selectedSkillIdRef.current
      ) {
        return;
      }
      setSkillContentLoading(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setSelectedSkillContent(
          detail ?? "Failed to load selected skill content.",
        );
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
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
  }, [isSkillMarkdownViewerOpen, selectedSkillId, skillsRevision]);

  useEffect(() => {
    let cancelled = false;
    async function loadMcpRuntimeStatus() {
      if (!allLLMConfigsInitialLoadComplete) {
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
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SKILL_MARKDOWN_VIEWER_STORAGE_KEY,
      isSkillMarkdownViewerOpen ? "true" : "false",
    );
  }, [isSkillMarkdownViewerOpen]);

  useEffect(() => {
    if (agentRunsInitialLoadComplete) {
      return;
    }
    void loadAgentRuns();
  }, [agentRunsInitialLoadComplete]);

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      return;
    }
    setAgentNativeSlashCommandsByEngineId((current) => {
      let changed = false;
      const next: Record<string, AgentNativeSlashCommandsEntry> = {
        ...current,
      };
      for (const run of agentRuns) {
        const extracted = extractAgentNativeSlashCommandsFromRun(run);
        if (!extracted) {
          continue;
        }
        if (
          areAgentNativeSlashEntriesEqual(
            next[extracted.engineConfigId],
            extracted.entry,
          )
        ) {
          continue;
        }
        next[extracted.engineConfigId] = extracted.entry;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [agentRuns, agentRunsInitialLoadComplete]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
      JSON.stringify(agentNativeSlashCommandsByEngineId),
    );
  }, [agentNativeSlashCommandsByEngineId]);

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
  const selectedAgentNativeSlashCommands = useMemo(() => {
    if (
      !selectedSlashEngine ||
      selectedSlashEngine.engineType !== "external_agent"
    ) {
      return EMPTY_AGENT_NATIVE_COMMANDS;
    }
    return (
      agentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId]
        ?.commands ?? EMPTY_AGENT_NATIVE_COMMANDS
    );
  }, [agentNativeSlashCommandsByEngineId, selectedSlashEngine]);
  const selectedAgentNativeSlashStatus = useMemo(() => {
    if (
      !selectedSlashEngine ||
      selectedSlashEngine.engineType !== "external_agent"
    ) {
      return DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY;
    }
    return (
      agentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId] ??
      DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY
    );
  }, [agentNativeSlashCommandsByEngineId, selectedSlashEngine]);

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
    if (!selectedSlashEngine) {
      return;
    }
    if (selectedSlashEngine.engineType !== "external_agent") {
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
  }, [selectedSlashEngine]);

  const markdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: true,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);

  const mcpServersLoading =
    !allLLMConfigsInitialLoadComplete || mcpRuntimeStatusLoading;
  const showSkillsLoadingState = skillsLoading && skills.length === 0;
  const skillPreviewContent =
    skillContentLoading || (skillsLoading && !selectedSkillId)
      ? "Loading skill content..."
      : selectedSkillContent || "Select a skill to preview SKILL.md.";
  const skillPreviewTruncationNotice =
    selectedSkillContentTruncated && selectedSkillOriginalSizeBytes !== null
      ? `Preview truncated from ${selectedSkillOriginalSizeBytes.toLocaleString()} bytes.`
      : null;

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

  return (
    <div className="-mr-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll pr-1 pt-4 text-sm text-setta-600 dark:text-setta-300">
      <Accordion.Root
        type="multiple"
        defaultValue={DEFAULT_SECTION_ACCORDION_VALUES}
        className="grid min-w-0 gap-3"
      >
        <Accordion.Item
          value={MCP_SECTION_ACCORDION_VALUE}
          className="overflow-visible rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950/70"
          data-testid="skills-mcp-accordion-mcp"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group box-border flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left">
              <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                MCP Servers
              </span>
              <FiChevronDown
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-setta-500 transition-transform duration-150 group-data-[state=open]:rotate-180 dark:text-setta-400"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown data-[state=closed]:overflow-hidden data-[state=open]:overflow-visible">
            <section className="grid min-w-0 gap-2 px-2">
              <VerticalResizablePane
                defaultHeightPx={180}
                minHeightPx={90}
                maxHeight="60vh"
                contentClassName="h-full min-w-0 overflow-auto rounded-md bg-white/70 p-2 text-[11px] dark:bg-setta-950/40"
                resizeHandleTestId="skills-mcp-mcp-resize-handle"
              >
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
                        onRevealPath={(path) =>
                          void revealPathInFileExplorer(path)
                        }
                      />
                      {mcpRuntimeStatusError ? (
                        <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          Runtime status check unavailable:{" "}
                          {mcpRuntimeStatusError}
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
              </VerticalResizablePane>
            </section>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item
          value={SKILLS_SECTION_ACCORDION_VALUE}
          className="overflow-visible rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950/70"
          data-testid="skills-mcp-accordion-skills"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group box-border flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left">
              <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Skills
              </span>
              <FiChevronDown
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-setta-500 transition-transform duration-150 group-data-[state=open]:rotate-180 dark:text-setta-400"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown data-[state=closed]:overflow-hidden data-[state=open]:overflow-visible">
            <section className="grid min-w-0 gap-2 px-2 pb-2">
              <div className="grid gap-2">
                <div className="flex min-w-0 items-center justify-end">
                  <button
                    className="cursor-pointer rounded-full bg-setta-100 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-setta-800/80 dark:text-setta-300 dark:hover:bg-setta-700"
                    onClick={() => void refreshSkillsBrowser()}
                    disabled={skillsLoading}
                  >
                    Refresh
                  </button>
                </div>
                <search className="relative flex min-w-0 items-center">
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
                </search>
              </div>
              <div className="grid min-w-0 gap-2">
                <VerticalResizablePane
                  defaultHeightPx={280}
                  minHeightPx={140}
                  maxHeight="70vh"
                  contentClassName="h-full min-w-0 overflow-auto rounded-md bg-white/70 p-2 text-xs dark:bg-setta-950/40"
                  resizeHandleTestId="skills-mcp-skills-resize-handle"
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
                            return (
                              <button
                                key={skill.skillId}
                                className={`flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded py-1 pl-1 pr-2 text-left transition-colors ${
                                  selected
                                    ? "bg-setta-100 text-blue-700 dark:bg-setta-800/80 dark:text-blue-300"
                                    : "hover:bg-setta-100 dark:hover:bg-setta-800"
                                }`}
                                onClick={() =>
                                  setSelectedSkillId(skill.skillId)
                                }
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
                                {isApplicable || isActive ? (
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
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </VerticalResizablePane>
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
                >
                  <Accordion.Item
                    value={SKILL_MARKDOWN_VIEWER_VALUE}
                    className="rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950"
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
                    <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
                      {isSkillMarkdownViewerOpen ? (
                        <div className="grid">
                          {skillPreviewTruncationNotice ? (
                            <div className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                              {skillPreviewTruncationNotice}
                            </div>
                          ) : null}
                          <div className="h-36 min-h-[120px] resize-y overflow-hidden">
                            <CodeMirror
                              aria-label="Skill Markdown Content"
                              className="h-full"
                              height="100%"
                              value={skillPreviewContent}
                              theme={codeMirrorTheme}
                              extensions={markdownViewerExtensions}
                              basicSetup={{
                                lineNumbers: false,
                                foldGutter: false,
                                highlightActiveLine: false,
                                tabSize: 4,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
              </div>
            </section>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item
          value={SLASH_COMMANDS_SECTION_ACCORDION_VALUE}
          className="overflow-visible rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950/70"
          data-testid="skills-mcp-accordion-slash-commands"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group box-border flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left">
              <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Slash Commands
              </span>
              <FiChevronDown
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-setta-500 transition-transform duration-150 group-data-[state=open]:rotate-180 dark:text-setta-400"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown data-[state=closed]:overflow-hidden data-[state=open]:overflow-visible">
            <section className="grid min-w-0 gap-2 px-2 pb-2">
              {!engineConfigsInitialLoadComplete ? (
                <div className="rounded-md bg-white/70 p-2 text-[11px] text-setta-500 dark:bg-setta-950/40 dark:text-setta-400">
                  Loading engine commands...
                </div>
              ) : slashCommandsByEngine.length === 0 ? (
                <div className="rounded-md bg-white/70 p-2 text-[11px] text-setta-500 dark:bg-setta-950/40 dark:text-setta-400">
                  No engines configured.
                </div>
              ) : (
                <>
                  <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
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
                          onClick={() =>
                            setSelectedSlashEngineId(engine.engineId)
                          }
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
                  <VerticalResizablePane
                    defaultHeightPx={220}
                    minHeightPx={120}
                    maxHeight="70vh"
                    contentClassName="h-full min-w-0 overflow-auto rounded-md bg-white/70 p-2 text-[11px] dark:bg-setta-950/40"
                    contentTestId="skills-mcp-slash-list-pane"
                    resizeHandleTestId="skills-mcp-slash-resize-handle"
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
                              {selectedAgentNativeSlashCommands.map(
                                (command) => (
                                  <div
                                    key={`${selectedSlashEngine.engineId}:agent:${command}`}
                                    className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                                    data-testid="skills-mcp-agent-slash-command"
                                  >
                                    <div className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                                      {command}
                                    </div>
                                  </div>
                                ),
                              )}
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
                          Select an external engine tab to view discovered
                          metadata.
                        </div>
                      )}
                    </div>
                  </VerticalResizablePane>
                  <div className="text-[10px] text-setta-500 dark:text-setta-400">
                    Setta command availability is defined by this app. Native
                    agent command lists are sourced from external-agent run
                    metadata and cached locally per engine.
                  </div>
                </>
              )}
            </section>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  );
}
