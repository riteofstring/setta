import * as Accordion from "@radix-ui/react-accordion";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useMemo } from "react";
import { FiChevronDown, FiSave } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  type SkillContentLoadStatus,
  type SkillMarkdownViewMode,
  SKILL_MARKDOWN_VIEW_MODE_RAW,
  SKILL_MARKDOWN_VIEW_MODE_RENDERED,
} from "./projectChatSkillsViewModel";

const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";
const SKILL_MARKDOWN_RENDERED_CLASS =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0";

export type ProjectChatSkillMarkdownViewerProps = {
  isOpen: boolean;
  onOpenChange: (nextIsOpen: boolean) => void;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillContentLoadError: string | null;
  skillPreviewTruncationNotice: string | null;
  skillMarkdownViewMode: SkillMarkdownViewMode;
  onSkillMarkdownViewModeChange: (nextMode: SkillMarkdownViewMode) => void;
  canSaveSelectedSkill: boolean;
  saveSelectedSkillButtonTitle: string;
  onSaveSelectedCustomSkill: () => void;
  rawMarkdownModeHint: string;
  renderedSkillPreviewContent: string;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  isSkillMarkdownEditable: boolean;
  onSkillMarkdownChange: (value: string) => void;
};

export function ProjectChatSkillMarkdownViewer({
  isOpen,
  onOpenChange,
  skillContentLoadStatus,
  skillContentLoadError,
  skillPreviewTruncationNotice,
  skillMarkdownViewMode,
  onSkillMarkdownViewModeChange,
  canSaveSelectedSkill,
  saveSelectedSkillButtonTitle,
  onSaveSelectedCustomSkill,
  rawMarkdownModeHint,
  renderedSkillPreviewContent,
  skillMarkdownRawDraft,
  skillPreviewContent,
  isSkillMarkdownEditable,
  onSkillMarkdownChange,
}: ProjectChatSkillMarkdownViewerProps) {
  const codeMirrorTheme = useCodeMirrorStyle();
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
  const isRawMarkdownView =
    skillMarkdownViewMode === SKILL_MARKDOWN_VIEW_MODE_RAW;

  return (
    <div
      className={
        isOpen ? "min-h-[140px] min-w-0 flex-1 overflow-hidden" : "min-w-0"
      }
    >
      <Accordion.Root
        type="single"
        collapsible
        value={isOpen ? SKILL_MARKDOWN_VIEWER_VALUE : ""}
        onValueChange={(value) =>
          onOpenChange(value === SKILL_MARKDOWN_VIEWER_VALUE)
        }
        className={isOpen ? "h-full min-h-0" : ""}
      >
        <Accordion.Item
          value={SKILL_MARKDOWN_VIEWER_VALUE}
          className={`rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950 ${
            isOpen ? "flex h-full min-h-0 flex-col" : ""
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
              isOpen ? "min-h-0 flex-1" : ""
            }`}
          >
            {isOpen ? (
              <div className="flex h-full min-h-0 flex-col">
                {skillContentLoadStatus === "error" && skillContentLoadError ? (
                  <div
                    data-testid="project-chat-skill-content-error"
                    className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  >
                    Failed to load skill content: {skillContentLoadError}
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
                        onSkillMarkdownViewModeChange(
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
                        onSkillMarkdownViewModeChange(
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
                    onClick={() => void onSaveSelectedCustomSkill()}
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
                      value={skillMarkdownRawDraft ?? skillPreviewContent}
                      onChange={onSkillMarkdownChange}
                      theme={codeMirrorTheme}
                      extensions={
                        isSkillMarkdownEditable
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
  );
}
