import * as Accordion from "@radix-ui/react-accordion";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_call_mcp_tool,
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_setta_home_info,
  route_reveal_path_in_os_file_explorer,
} from "utils/generatedEndpoints";
import { type AppGenSkillEntry } from "utils/generatedTypes";
import {
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  parseRegisteredMcpToolCounts,
  resolveMcpServerStatus,
} from "./projectChatSkillsMcpViewerUtils";

type PathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

const SKILL_MARKDOWN_VIEWER_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";
const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";

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
    "grid h-5 w-5 place-items-center rounded border border-setta-200 text-setta-500 opacity-0 transition-all duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200";
  return (
    <div className="group/header flex min-w-0 items-start justify-between gap-2 border-b border-setta-200/70 px-1 pb-1 dark:border-setta-700/70">
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

export function ProjectChatSkillsMcpViewer() {
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
  const [mcpConfigInfoLoading, setMcpConfigInfoLoading] = useState(true);
  const [mcpRuntimeStatusLoading, setMcpRuntimeStatusLoading] = useState(true);
  const [mcpRuntimeStatusError, setMcpRuntimeStatusError] = useState<
    string | null
  >(null);
  const [mcpRuntimeToolCountsByServerId, setMcpRuntimeToolCountsByServerId] =
    useState<Record<string, number> | null>(null);
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
    async function loadMcpConfigPath() {
      setMcpConfigInfoLoading(true);
      const res = await route_get_setta_home_info();
      if (!res200(res)) {
        setMcpConfigPath(null);
        setSettaFilesLocation(null);
        setMcpConfigInfoLoading(false);
        return;
      }
      setMcpConfigPath(res.data.llmConfigPath);
      setSettaFilesLocation(res.data.activeSettaFilesLocation);
      setMcpConfigInfoLoading(false);
    }
    void loadMcpConfigPath();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMcpRuntimeStatus() {
      if (!allLLMConfigsInitialLoadComplete) {
        return;
      }
      setMcpRuntimeStatusLoading(true);
      setMcpRuntimeStatusError(null);
      const res = await route_call_mcp_tool({
        tool: "list_mcp_tools",
        arguments: {},
      });
      if (cancelled) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const resolvedError =
          res.status === 404
            ? "MCP status endpoint is unavailable in this mode."
            : (detail ?? "Failed to query MCP runtime registration.");
        setMcpRuntimeStatusError(resolvedError);
        setMcpRuntimeToolCountsByServerId(null);
        setMcpRuntimeStatusLoading(false);
        return;
      }
      if (res.data.isError === true) {
        setMcpRuntimeStatusError(
          "MCP runtime reported an error while listing tools.",
        );
        setMcpRuntimeToolCountsByServerId(null);
        setMcpRuntimeStatusLoading(false);
        return;
      }
      setMcpRuntimeToolCountsByServerId(parseRegisteredMcpToolCounts(res.data));
      setMcpRuntimeStatusLoading(false);
    }
    void loadMcpRuntimeStatus();
    return () => {
      cancelled = true;
    };
  }, [allLLMConfigs?.mcpServers, allLLMConfigsInitialLoadComplete]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SKILL_MARKDOWN_VIEWER_STORAGE_KEY,
      isSkillMarkdownViewerOpen ? "true" : "false",
    );
  }, [isSkillMarkdownViewerOpen]);

  const filteredSkills = useMemo(() => {
    return filterSkills(skills, skillFilter);
  }, [skillFilter, skills]);
  const groupedSkills = useMemo(() => {
    return groupSkillsByRootPath(filteredSkills);
  }, [filteredSkills]);

  const mcpServerGroups = useMemo(() => {
    return groupMcpServersByConfigPath({
      mcpServers: allLLMConfigs?.mcpServers,
      mcpConfigPath,
      settaFilesLocation,
    });
  }, [allLLMConfigs?.mcpServers, mcpConfigPath, settaFilesLocation]);

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
    !allLLMConfigsInitialLoadComplete || mcpConfigInfoLoading;
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
      <div className="grid min-w-0 gap-5">
        <section className="min-w-0">
          <div className="grid min-w-0 gap-2">
            <div className="relative grid gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Skills
              </div>
              <button
                className="absolute right-0 top-0 cursor-pointer rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => void refreshSkillsBrowser()}
                disabled={skillsLoading}
              >
                Refresh
              </button>
              <search className="relative flex min-w-0 items-center">
                <div className="absolute left-0 grid select-none place-items-center pl-1">
                  <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
                </div>
                <input
                  aria-label="Filter skills"
                  className="min-w-0 flex-grow cursor-text truncate border-solid border-setta-200 bg-transparent py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:text-setta-200 dark:placeholder-setta-700"
                  value={skillFilter}
                  onChange={(event) => setSkillFilter(event.target.value)}
                  placeholder="Filter"
                />
              </search>
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="h-[280px] max-h-[70vh] min-h-[140px] min-w-0 resize-y overflow-auto rounded-md border border-setta-200 bg-white/80 p-2 text-xs dark:border-setta-700 dark:bg-setta-950/60">
                {skillsError ? (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
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
                      className={groupIndex === 0 ? "" : "mt-3"}
                    >
                      <PathGroupHeader
                        title={group.rootLabel}
                        path={group.rootPath}
                        onCopyPath={copyPathToClipboard}
                        onRevealPath={(path) =>
                          void revealPathInFileExplorer(path)
                        }
                      />
                      <div className="mt-1 grid gap-1 px-1">
                        {group.skills.map((skill) => {
                          const selected = skill.skillId === selectedSkillId;
                          return (
                            <button
                              key={skill.skillId}
                              className={`flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded py-1 pl-1 pr-2 text-left transition-colors ${
                                selected
                                  ? "bg-setta-100 text-blue-700 dark:bg-setta-800/80 dark:text-blue-300"
                                  : "hover:bg-setta-100 dark:hover:bg-setta-800"
                              }`}
                              onClick={() => setSelectedSkillId(skill.skillId)}
                            >
                              <span
                                className="block min-w-0 w-full truncate font-semibold"
                                title={skill.name}
                                data-testid="skills-mcp-skill-name"
                              >
                                {skill.name}
                              </span>
                              <span
                                className="block min-w-0 w-full truncate text-[11px] opacity-80"
                                title={skill.relativePath}
                                data-testid="skills-mcp-skill-path"
                              >
                                {skill.relativePath}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
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
                          <div className="border-t border-setta-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:border-setta-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {skillPreviewTruncationNotice}
                          </div>
                        ) : null}
                        <div className="h-36 min-h-[120px] resize-y overflow-hidden border-t border-setta-200 dark:border-setta-700">
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
          </div>
        </section>
        <section className="grid min-w-0 gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            MCP Servers
          </div>
          <div className="h-[180px] max-h-[60vh] min-h-[90px] min-w-0 resize-y overflow-auto rounded-md border border-setta-200 bg-white/80 p-2 text-[11px] dark:border-setta-700 dark:bg-setta-950/60">
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
                  key={group.configPath ?? "unavailable"}
                  className={groupIndex === 0 ? "" : "mt-3"}
                >
                  <PathGroupHeader
                    title={group.configLabel}
                    path={group.configPath}
                    onCopyPath={copyPathToClipboard}
                    onRevealPath={(path) => void revealPathInFileExplorer(path)}
                  />
                  {mcpRuntimeStatusError ? (
                    <div className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      Runtime status check unavailable: {mcpRuntimeStatusError}
                    </div>
                  ) : null}
                  <div className="mt-1 grid gap-1 px-1">
                    {group.servers.map((server) => {
                      const serverEndpointDisplay = `${server.transport} · ${server.endpoint}`;
                      const status = resolveMcpServerStatus({
                        serverId: server.serverId,
                        endpoint: server.endpoint,
                        runtimeToolCountsByServerId:
                          mcpRuntimeToolCountsByServerId,
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
      </div>
    </div>
  );
}
