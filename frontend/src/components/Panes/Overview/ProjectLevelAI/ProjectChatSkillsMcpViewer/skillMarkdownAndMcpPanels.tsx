import * as Accordion from "@radix-ui/react-accordion";

import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import CodeMirror from "@uiw/react-codemirror";

import { getAppGenSkillContent } from "openapi/http";

import { type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { FiChevronDown, FiSave } from "react-icons/fi";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";

import { type SkillEntry } from "utils/generatedTypes";

import {
  type McpRuntimeServerStatus,
  resolveMcpServerStatus,
} from "../projectChatSkillsMcpViewerUtils";

import {
  CodeMirrorExtensions,
  CodeMirrorTheme,
  McpServerGroup,
  PathGroupHeaderProps,
  SKILL_MARKDOWN_RENDERED_CLASS,
  SKILL_MARKDOWN_VIEWER_VALUE,
  SKILL_MARKDOWN_VIEW_MODE_RAW,
  SKILL_MARKDOWN_VIEW_MODE_RENDERED,
  SkillContentCacheEntry,
  SkillContentLoadStatus,
  SkillContentViewStateSetters,
  SkillGroup,
  SkillMarkdownViewMode,
  SkillStatusBySkillId,
  SkillStatusEntry,
  applyCachedSkillContentViewState,
  applyLoadedSkillContentViewState,
  applySkillContentLoadErrorViewState,
  isActionablePath,
  resetSelectedSkillContentViewState,
} from "./skillState";

export async function loadSelectedSkillContent(args: {
  isSkillMarkdownViewerOpen: boolean;
  selectedSkillId: string | null;
  selectedSkillIdRef: RefObject<string | null>;
  setters: SkillContentViewStateSetters;
  showSkillsSection: boolean;
  skillContentCache: RefObject<Map<string, SkillContentCacheEntry>>;
  skillContentRequestSequence: RefObject<number>;
  skillsRevision: number;
}): Promise<void> {
  const {
    isSkillMarkdownViewerOpen,
    selectedSkillId,
    selectedSkillIdRef,
    setters,
    showSkillsSection,
    skillContentCache,
    skillContentRequestSequence,
    skillsRevision,
  } = args;
  if (!showSkillsSection) {
    return;
  }
  if (!selectedSkillId || !isSkillMarkdownViewerOpen) {
    skillContentRequestSequence.current += 1;
    resetSelectedSkillContentViewState(setters);
    return;
  }
  const cacheKey = `${skillsRevision}:${selectedSkillId}`;
  const cached = skillContentCache.current.get(cacheKey) ?? null;
  if (cached) {
    applyCachedSkillContentViewState({
      cached,
      setters,
    });
    return;
  }
  const requestedSkillId = selectedSkillId;
  const requestSequence = skillContentRequestSequence.current + 1;
  skillContentRequestSequence.current = requestSequence;
  setters.setSkillContentLoadStatus("loading");
  setters.setSkillContentLoadError(null);
  const res = await callOpenAPI(
    getAppGenSkillContent({
      body: {
        skillId: requestedSkillId,
      },
    } as Parameters<typeof getAppGenSkillContent>[0]),
  );
  if (
    requestSequence !== skillContentRequestSequence.current ||
    requestedSkillId !== selectedSkillIdRef.current
  ) {
    return;
  }
  if (!res200(res)) {
    applySkillContentLoadErrorViewState({
      detail: getErrorDetail(res.data),
      setters,
    });
    return;
  }
  applyLoadedSkillContentViewState({
    skillContent: res.data,
    setters,
  });
  skillContentCache.current.set(cacheKey, {
    content: res.data.content,
    truncated: res.data.truncated,
    originalSizeBytes: res.data.originalSizeBytes,
  });
}

export function resolveProjectChatViewerLoadingState(args: {
  allLLMConfigsInitialLoadComplete: boolean;
  mcpRuntimeStatusLoading: boolean;
  skillsCount: number;
  skillsLoading: boolean;
}): {
  mcpServersLoading: boolean;
  showSkillsLoadingState: boolean;
} {
  const {
    allLLMConfigsInitialLoadComplete,
    mcpRuntimeStatusLoading,
    skillsCount,
    skillsLoading,
  } = args;
  return {
    mcpServersLoading:
      !allLLMConfigsInitialLoadComplete || mcpRuntimeStatusLoading,
    showSkillsLoadingState: skillsLoading && skillsCount === 0,
  };
}

export function runSkillsRefreshEffect(args: {
  refreshSkillsBrowser: () => Promise<void>;
  showSkillsSection: boolean;
}): void {
  const { refreshSkillsBrowser, showSkillsSection } = args;
  if (!showSkillsSection) {
    return;
  }
  void refreshSkillsBrowser();
}

export function canEditSelectedSkillMarkdown(args: {
  selectedSkillContentTruncated: boolean;
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  skillContentLoadStatus: SkillContentLoadStatus;
}): boolean {
  const {
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  } = args;
  if (!selectedSkillId) {
    return false;
  }
  if (!selectedSkillIsEditable) {
    return false;
  }
  if (selectedSkillContentTruncated) {
    return false;
  }
  return skillContentLoadStatus === "loaded";
}

export function resolveCanSaveSelectedSkill(args: {
  customSkillSaveInFlight: boolean;
  isRawMarkdownView: boolean;
  saveSelectedCustomSkillError: string | null;
  skillContentLoading: boolean;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
}): boolean {
  const {
    customSkillSaveInFlight,
    isRawMarkdownView,
    saveSelectedCustomSkillError,
    skillContentLoading,
    skillMarkdownEditable,
    skillMarkdownRawDraft,
  } = args;
  return (
    skillMarkdownEditable &&
    isRawMarkdownView &&
    skillMarkdownRawDraft !== null &&
    !skillContentLoading &&
    !customSkillSaveInFlight &&
    saveSelectedCustomSkillError === null
  );
}

export function PathGroupHeader({
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

export type SkillListItemProps = {
  onSelectSkill: (skillId: string) => void;
  selectedSkillId: string | null;
  skill: SkillEntry;
  status: SkillStatusEntry;
};

export type SkillStatusBadgesProps = {
  status: SkillStatusEntry;
};

export function SkillApplicabilityBadge({ status }: SkillStatusBadgesProps) {
  if (!status?.isApplicable) {
    return null;
  }
  return (
    <span
      className="rounded border border-emerald-300 bg-emerald-50 px-1 py-[1px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      title={status.applicabilityReason ?? undefined}
    >
      Applicable
    </span>
  );
}

export function SkillActivityBadge({ status }: SkillStatusBadgesProps) {
  if (status?.activityState === "active") {
    return (
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
    );
  }
  if (status?.activityState === "unknown") {
    return (
      <span
        className="rounded border border-amber-300 bg-amber-50 px-1 py-[1px] text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        title="Skill activity metadata is unavailable for this thread."
      >
        Unknown
      </span>
    );
  }
  return null;
}

export function SkillStatusBadges({ status }: SkillStatusBadgesProps) {
  if (!status?.isApplicable && !status?.activityState) {
    return null;
  }
  return (
    <span className="mt-0.5 flex w-full min-w-0 items-center gap-1 text-[10px] font-semibold">
      <SkillApplicabilityBadge status={status} />
      <SkillActivityBadge status={status} />
    </span>
  );
}

export function SkillListItem({
  onSelectSkill,
  selectedSkillId,
  skill,
  status,
}: SkillListItemProps) {
  const selected = skill.skillId === selectedSkillId;
  return (
    <button
      className={`flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded py-1 pl-1 pr-2 text-left transition-colors ${
        selected
          ? "bg-setta-100 text-blue-700 dark:bg-setta-800/80 dark:text-blue-300"
          : "hover:bg-setta-100 dark:hover:bg-setta-800"
      }`}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelectSkill(skill.skillId)}
      type="button"
    >
      <span
        className="block w-full min-w-0 truncate font-semibold"
        data-testid="skills-mcp-skill-name"
        title={skill.name}
      >
        {skill.name}
      </span>
      <span
        className="block w-full min-w-0 truncate text-[11px] opacity-80"
        data-testid="skills-mcp-skill-path"
        title={skill.relativePath}
      >
        {skill.relativePath}
      </span>
      <SkillStatusBadges status={status} />
    </button>
  );
}

export type McpSectionProps = {
  mcpServerGroups: McpServerGroup[];
  mcpRuntimeStatusByServerId: Record<string, McpRuntimeServerStatus> | null;
  mcpRuntimeStatusError: string | null;
  mcpRuntimeStatusLoading: boolean;
  mcpServersLoading: boolean;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

export function McpSection({
  mcpServerGroups,
  mcpRuntimeStatusByServerId,
  mcpRuntimeStatusError,
  mcpRuntimeStatusLoading,
  mcpServersLoading,
  onCopyPath,
  onRevealPath,
}: McpSectionProps) {
  return (
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
                onCopyPath={onCopyPath}
                onRevealPath={onRevealPath}
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
                          aria-label={status.quickInfo}
                          className={`h-2 w-2 rounded-full ${statusDotClassName}`}
                          title={status.quickInfo}
                        />
                        <div
                          className="truncate font-semibold"
                          data-testid="skills-mcp-server-id"
                          title={`${server.serverId} - ${status.quickInfo}`}
                        >
                          {server.serverId}
                        </div>
                      </div>
                      <div
                        className="truncate font-mono text-setta-500 dark:text-setta-400"
                        data-testid="skills-mcp-server-endpoint"
                        title={serverEndpointDisplay}
                      >
                        {serverEndpointDisplay}
                      </div>
                      <div
                        className="truncate text-[10px] text-setta-500 dark:text-setta-400"
                        data-testid="skills-mcp-server-status"
                        title={status.quickInfo}
                      >
                        {status.quickInfo}
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
  );
}

export type SkillGroupsPanelProps = {
  groupedSkills: SkillGroup[];
  isSkillMarkdownViewerOpen: boolean;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
  onResetSkillsListHeight: () => void;
  onSelectSkill: (skillId: string) => void;
  selectedSkillId: string | null;
  showSkillsLoadingState: boolean;
  skillStatusBySkillId: SkillStatusBySkillId;
  skillsError: string | null;
  skillsListHeightPct: number;
  skillsSectionRef: RefObject<HTMLDivElement | null>;
  beginSkillsListResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function SkillGroupsPanel({
  beginSkillsListResize,
  groupedSkills,
  isSkillMarkdownViewerOpen,
  onCopyPath,
  onRevealPath,
  onResetSkillsListHeight,
  onSelectSkill,
  selectedSkillId,
  showSkillsLoadingState,
  skillStatusBySkillId,
  skillsError,
  skillsListHeightPct,
  skillsSectionRef,
}: SkillGroupsPanelProps) {
  return (
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
                onCopyPath={onCopyPath}
                onRevealPath={onRevealPath}
              />
              <div className="mt-1 grid gap-1 border-t border-setta-200/80 px-1 pt-1 dark:border-setta-800">
                {group.skills.map((skill) => (
                  <SkillListItem
                    key={skill.skillId}
                    onSelectSkill={onSelectSkill}
                    selectedSkillId={selectedSkillId}
                    skill={skill}
                    status={skillStatusBySkillId[skill.skillId]}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {isSkillMarkdownViewerOpen ? (
        <div
          aria-label="Resize skill list and markdown viewer"
          className="group/resize relative flex h-3 cursor-row-resize items-center justify-center"
          data-testid="project-chat-skills-resize-handle"
          onDoubleClick={onResetSkillsListHeight}
          onPointerDown={beginSkillsListResize}
          role="separator"
        >
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
          <div className="relative z-[1] h-1 w-10 rounded-full bg-setta-300/90 transition-colors group-hover/resize:bg-blue-400 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400" />
        </div>
      ) : null}
    </div>
  );
}

export type SkillMarkdownViewerPanelProps = {
  canSaveSelectedSkill: boolean;
  codeMirrorTheme: CodeMirrorTheme;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  isOpen: boolean;
  isRawMarkdownView: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSetSkillMarkdownViewerOpen: (isOpen: boolean) => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  onSkillMarkdownDraftChange: (value: string) => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  saveSelectedSkillButtonTitle: string;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  skillPreviewTruncationNotice: string | null;
};

export type SkillMarkdownToolbarProps = {
  canSaveSelectedSkill: boolean;
  isRawMarkdownView: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  saveSelectedSkillButtonTitle: string;
};

export function SkillMarkdownToolbar({
  canSaveSelectedSkill,
  isRawMarkdownView,
  onSaveSelectedCustomSkill,
  onSelectSkillMarkdownViewMode,
  saveSelectedSkillButtonTitle,
}: SkillMarkdownToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-setta-200/80 px-2 py-1 dark:border-setta-700/80">
      <div className="inline-flex items-center gap-1 rounded bg-setta-100/70 p-0.5 dark:bg-setta-900/80">
        <button
          className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
            !isRawMarkdownView
              ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
              : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
          }`}
          data-testid="project-chat-skill-markdown-view-rendered"
          onClick={() =>
            onSelectSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RENDERED)
          }
          type="button"
        >
          Rendered
        </button>
        <button
          className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
            isRawMarkdownView
              ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
              : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
          }`}
          data-testid="project-chat-skill-markdown-view-raw"
          onClick={() =>
            onSelectSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RAW)
          }
          type="button"
        >
          Raw text
        </button>
      </div>
      <button
        className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
        data-testid="project-chat-custom-skill-save"
        disabled={!canSaveSelectedSkill}
        onClick={onSaveSelectedCustomSkill}
        title={saveSelectedSkillButtonTitle}
        type="button"
      >
        <FiSave className="h-3 w-3" />
        Save
      </button>
    </div>
  );
}

export type SkillMarkdownBodyProps = {
  codeMirrorTheme: CodeMirrorTheme;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  isRawMarkdownView: boolean;
  onSkillMarkdownDraftChange: (value: string) => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
};

export function SkillMarkdownBody({
  codeMirrorTheme,
  editableMarkdownViewerExtensions,
  isRawMarkdownView,
  onSkillMarkdownDraftChange,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
}: SkillMarkdownBodyProps) {
  if (!isRawMarkdownView) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <ReactMarkdown
          className={SKILL_MARKDOWN_RENDERED_CLASS}
          remarkPlugins={[remarkGfm]}
        >
          {renderedSkillPreviewContent}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <>
      <div className="px-2 py-1 text-[10px] text-setta-500 dark:text-setta-400">
        {rawMarkdownModeHint}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          aria-label="Skill Markdown Content"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            tabSize: 4,
          }}
          className="h-full text-xs [&_.cm-content]:text-xs [&_.cm-gutters]:text-xs"
          extensions={
            skillMarkdownEditable
              ? editableMarkdownViewerExtensions
              : readonlyMarkdownViewerExtensions
          }
          height="100%"
          onChange={onSkillMarkdownDraftChange}
          theme={codeMirrorTheme}
          value={skillMarkdownRawDraft ?? skillPreviewContent}
        />
      </div>
    </>
  );
}

export type SkillMarkdownViewerContentProps = {
  canSaveSelectedSkill: boolean;
  codeMirrorTheme: CodeMirrorTheme;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  isOpen: boolean;
  isRawMarkdownView: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  onSkillMarkdownDraftChange: (value: string) => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  saveSelectedSkillButtonTitle: string;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  skillPreviewTruncationNotice: string | null;
};

export function SkillMarkdownViewerContent({
  canSaveSelectedSkill,
  codeMirrorTheme,
  editableMarkdownViewerExtensions,
  isOpen,
  isRawMarkdownView,
  onSaveSelectedCustomSkill,
  onSelectSkillMarkdownViewMode,
  onSkillMarkdownDraftChange,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  saveSelectedSkillButtonTitle,
  skillContentLoadError,
  skillContentLoadStatus,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
  skillPreviewTruncationNotice,
}: SkillMarkdownViewerContentProps) {
  if (!isOpen) {
    return null;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {skillContentLoadStatus === "error" && skillContentLoadError ? (
        <div
          className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          data-testid="project-chat-skill-content-error"
        >
          Failed to load skill content: {skillContentLoadError}
        </div>
      ) : null}
      {skillPreviewTruncationNotice ? (
        <div className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {skillPreviewTruncationNotice}
        </div>
      ) : null}
      <SkillMarkdownToolbar
        canSaveSelectedSkill={canSaveSelectedSkill}
        isRawMarkdownView={isRawMarkdownView}
        onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
        onSelectSkillMarkdownViewMode={onSelectSkillMarkdownViewMode}
        saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
      />
      <SkillMarkdownBody
        codeMirrorTheme={codeMirrorTheme}
        editableMarkdownViewerExtensions={editableMarkdownViewerExtensions}
        isRawMarkdownView={isRawMarkdownView}
        onSkillMarkdownDraftChange={onSkillMarkdownDraftChange}
        rawMarkdownModeHint={rawMarkdownModeHint}
        readonlyMarkdownViewerExtensions={readonlyMarkdownViewerExtensions}
        renderedSkillPreviewContent={renderedSkillPreviewContent}
        skillMarkdownEditable={skillMarkdownEditable}
        skillMarkdownRawDraft={skillMarkdownRawDraft}
        skillPreviewContent={skillPreviewContent}
      />
    </div>
  );
}

export function SkillMarkdownViewerPanel({
  canSaveSelectedSkill,
  codeMirrorTheme,
  editableMarkdownViewerExtensions,
  isOpen,
  isRawMarkdownView,
  onSaveSelectedCustomSkill,
  onSetSkillMarkdownViewerOpen,
  onSelectSkillMarkdownViewMode,
  onSkillMarkdownDraftChange,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  saveSelectedSkillButtonTitle,
  skillContentLoadError,
  skillContentLoadStatus,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
  skillPreviewTruncationNotice,
}: SkillMarkdownViewerPanelProps) {
  const containerClassName = isOpen
    ? "min-h-[140px] min-w-0 flex-1 overflow-hidden"
    : "min-w-0";
  const rootClassName = isOpen ? "h-full min-h-0" : "";
  const itemClassName = `rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950 ${isOpen ? "flex h-full min-h-0 flex-col" : ""}`;
  const contentClassName = `overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown ${isOpen ? "min-h-0 flex-1" : ""}`;

  return (
    <div className={containerClassName}>
      <Accordion.Root
        className={rootClassName}
        collapsible
        onValueChange={(value) =>
          onSetSkillMarkdownViewerOpen(value === SKILL_MARKDOWN_VIEWER_VALUE)
        }
        type="single"
        value={isOpen ? SKILL_MARKDOWN_VIEWER_VALUE : ""}
      >
        <Accordion.Item
          className={itemClassName}
          value={SKILL_MARKDOWN_VIEWER_VALUE}
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
          <Accordion.Content className={contentClassName}>
            <SkillMarkdownViewerContent
              canSaveSelectedSkill={canSaveSelectedSkill}
              codeMirrorTheme={codeMirrorTheme}
              editableMarkdownViewerExtensions={
                editableMarkdownViewerExtensions
              }
              isOpen={isOpen}
              isRawMarkdownView={isRawMarkdownView}
              onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
              onSelectSkillMarkdownViewMode={onSelectSkillMarkdownViewMode}
              onSkillMarkdownDraftChange={onSkillMarkdownDraftChange}
              rawMarkdownModeHint={rawMarkdownModeHint}
              readonlyMarkdownViewerExtensions={
                readonlyMarkdownViewerExtensions
              }
              renderedSkillPreviewContent={renderedSkillPreviewContent}
              saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
              skillContentLoadError={skillContentLoadError}
              skillContentLoadStatus={skillContentLoadStatus}
              skillMarkdownEditable={skillMarkdownEditable}
              skillMarkdownRawDraft={skillMarkdownRawDraft}
              skillPreviewContent={skillPreviewContent}
              skillPreviewTruncationNotice={skillPreviewTruncationNotice}
            />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  );
}
