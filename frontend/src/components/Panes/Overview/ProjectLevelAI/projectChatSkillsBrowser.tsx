import { type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { FiPlus, FiRefreshCw } from "react-icons/fi";
import type { AppGenSkillEntry } from "utils/generatedTypes";

import {
  type ProjectChatSkillMarkdownViewerProps,
  ProjectChatSkillMarkdownViewer,
} from "./projectChatSkillMarkdownViewer";
import { ProjectChatSkillsMcpPathGroupHeader } from "./projectChatSkillsMcpPathGroupHeader";
import type {
  SkillStatus,
  SkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";
import {
  canSaveSelectedSkill,
  resolveRawMarkdownModeHint,
  resolveRenderedSkillPreviewContent,
  resolveSaveSelectedSkillButtonTitle,
  resolveSkillPreviewContent,
  resolveSkillPreviewTruncationNotice,
} from "./projectChatSkillsViewModel";

export const DEFAULT_SKILLS_LIST_HEIGHT_PCT = 66;
export const MIN_SKILLS_LIST_HEIGHT_PCT = 30;
export const MIN_SKILL_MARKDOWN_HEIGHT_PCT = 20;

type ProjectChatSkillsBrowserProps = {
  skillsCount: number;
  skillsLoading: boolean;
  skillsError: string | null;
  skillFilter: string;
  onSkillFilterChange: (nextSkillFilter: string) => void;
  onRefreshSkills: () => void;
  newCustomSkillRelativePath: string;
  onNewCustomSkillRelativePathChange: (nextRelativePath: string) => void;
  canCreateCustomSkillButton: boolean;
  onCreateCustomSkill: () => void;
  customSkillCreateRootPath: string | null;
  customSkillCreateRootActionable: boolean;
  groupedSkills: SkillsByRootPath[];
  selectedSkillId: string | null;
  onSelectSkill: (skillId: string) => void;
  skillStatusBySkillId: Record<string, SkillStatus>;
  onCopyPathToClipboard: (path: string | null) => void;
  onRevealPathInFileExplorer: (path: string | null) => void;
  skillsSectionRef: RefObject<HTMLDivElement | null>;
  isSkillMarkdownViewerOpen: boolean;
  onSkillMarkdownViewerOpenChange: (nextIsOpen: boolean) => void;
  skillsListHeightPct: number;
  onBeginSkillsListResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResetSkillsListHeight: () => void;
  selectedSkill: AppGenSkillEntry | null;
  selectedSkillContent: string;
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
  skillContentLoadStatus: ProjectChatSkillMarkdownViewerProps["skillContentLoadStatus"];
  skillContentLoadError: string | null;
  skillMarkdownViewMode: ProjectChatSkillMarkdownViewerProps["skillMarkdownViewMode"];
  onSkillMarkdownViewModeChange: (
    nextMode: ProjectChatSkillMarkdownViewerProps["skillMarkdownViewMode"],
  ) => void;
  skillMarkdownRawDraft: string | null;
  customSkillSaveInFlight: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSkillMarkdownChange: (value: string) => void;
};

export function ProjectChatSkillsBrowser({
  skillsCount,
  skillsLoading,
  skillsError,
  skillFilter,
  onSkillFilterChange,
  onRefreshSkills,
  newCustomSkillRelativePath,
  onNewCustomSkillRelativePathChange,
  canCreateCustomSkillButton,
  onCreateCustomSkill,
  customSkillCreateRootPath,
  customSkillCreateRootActionable,
  groupedSkills,
  selectedSkillId,
  onSelectSkill,
  skillStatusBySkillId,
  onCopyPathToClipboard,
  onRevealPathInFileExplorer,
  skillsSectionRef,
  isSkillMarkdownViewerOpen,
  onSkillMarkdownViewerOpenChange,
  skillsListHeightPct,
  onBeginSkillsListResize,
  onResetSkillsListHeight,
  selectedSkill,
  selectedSkillContent,
  selectedSkillContentTruncated,
  selectedSkillOriginalSizeBytes,
  skillContentLoadStatus,
  skillContentLoadError,
  skillMarkdownViewMode,
  onSkillMarkdownViewModeChange,
  skillMarkdownRawDraft,
  customSkillSaveInFlight,
  onSaveSelectedCustomSkill,
  onSkillMarkdownChange,
}: ProjectChatSkillsBrowserProps) {
  const showSkillsLoadingState = skillsLoading && skillsCount === 0;
  const skillContentLoading = skillContentLoadStatus === "loading";
  const selectedSkillIsEditable = selectedSkill?.isEditable === true;
  const selectedSkillEditabilityReason =
    selectedSkill?.editabilityReason ?? null;
  const skillPreviewContent = resolveSkillPreviewContent({
    skillContentLoading,
    skillsLoading,
    selectedSkillId,
    skillContentLoadStatus,
    selectedSkillContent,
  });
  const renderedSkillPreviewContent = resolveRenderedSkillPreviewContent({
    skillPreviewContent,
    skillMarkdownRawDraft,
    selectedSkillId,
    skillContentLoadStatus,
  });
  const skillPreviewTruncationNotice = resolveSkillPreviewTruncationNotice({
    selectedSkillContentTruncated,
    selectedSkillOriginalSizeBytes,
  });
  const rawMarkdownModeHint = resolveRawMarkdownModeHint({
    selectedSkillId,
    selectedSkillIsEditable,
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    skillContentLoadStatus,
  });
  const saveSelectedSkillButtonTitle = resolveSaveSelectedSkillButtonTitle({
    selectedSkillId,
    selectedSkillIsEditable,
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    skillContentLoadStatus,
  });
  const canSaveSelectedSkillButton = canSaveSelectedSkill({
    skillContentLoadStatus,
    selectedSkillIsEditable,
    selectedSkillId,
    skillMarkdownViewMode,
    selectedSkillContentTruncated,
    skillMarkdownRawDraft,
    skillContentLoading,
    customSkillSaveInFlight,
  });
  const isSkillMarkdownEditable =
    selectedSkillIsEditable &&
    !selectedSkillContentTruncated &&
    skillContentLoadStatus === "loaded";

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="project-chat-skills-content"
    >
      <div className="grid gap-2">
        <div role="search" className="relative flex min-w-0 items-center gap-1">
          <div className="absolute left-0 grid select-none place-items-center pl-1">
            <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
          </div>
          <input
            aria-label="Filter skills"
            className="min-w-0 flex-grow cursor-text truncate rounded bg-setta-100/70 py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            value={skillFilter}
            onChange={(event) => onSkillFilterChange(event.target.value)}
            placeholder="Filter"
          />
          <button
            type="button"
            data-testid="project-chat-skills-refresh"
            aria-label="Refresh"
            title="Refresh skills"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            onClick={() => void onRefreshSkills()}
            disabled={skillsLoading}
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${skillsLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <input
            aria-label="New custom skill name"
            data-testid="project-chat-custom-skill-relative-path-input"
            className="min-w-0 flex-1 cursor-text truncate rounded bg-setta-100/70 px-2 py-1 text-xs text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            value={newCustomSkillRelativePath}
            onChange={(event) =>
              onNewCustomSkillRelativePathChange(event.target.value)
            }
            placeholder="new-custom-skill"
          />
          <button
            type="button"
            data-testid="project-chat-custom-skill-create"
            aria-label="Create custom skill"
            title="Create custom skill"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            onClick={() => void onCreateCustomSkill()}
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
              void onRevealPathInFileExplorer(customSkillCreateRootPath)
            }
            disabled={
              !customSkillCreateRootActionable || !customSkillCreateRootPath
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
                <ProjectChatSkillsMcpPathGroupHeader
                  title={group.rootLabel}
                  path={group.rootPath}
                  onCopyPath={onCopyPathToClipboard}
                  onRevealPath={(path) => void onRevealPathInFileExplorer(path)}
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
                        onClick={() => onSelectSkill(skill.skillId)}
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
            onPointerDown={onBeginSkillsListResize}
            onDoubleClick={onResetSkillsListHeight}
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
            <div className="relative z-[1] h-1 w-10 rounded-full bg-setta-300/90 transition-colors group-hover/resize:bg-blue-400 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400" />
          </div>
        ) : null}
        <ProjectChatSkillMarkdownViewer
          isOpen={isSkillMarkdownViewerOpen}
          onOpenChange={onSkillMarkdownViewerOpenChange}
          skillContentLoadStatus={skillContentLoadStatus}
          skillContentLoadError={skillContentLoadError}
          skillPreviewTruncationNotice={skillPreviewTruncationNotice}
          skillMarkdownViewMode={skillMarkdownViewMode}
          onSkillMarkdownViewModeChange={onSkillMarkdownViewModeChange}
          canSaveSelectedSkill={canSaveSelectedSkillButton}
          saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
          onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
          rawMarkdownModeHint={rawMarkdownModeHint}
          renderedSkillPreviewContent={renderedSkillPreviewContent}
          skillMarkdownRawDraft={skillMarkdownRawDraft}
          skillPreviewContent={skillPreviewContent}
          isSkillMarkdownEditable={isSkillMarkdownEditable}
          onSkillMarkdownChange={onSkillMarkdownChange}
        />
      </div>
    </section>
  );
}
