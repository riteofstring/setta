import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatBytes } from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  type CSSProperties,
  ChangeEvent,
  KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BiSolidBrain } from "react-icons/bi";
import { FiCpu, FiTerminal } from "react-icons/fi";
import { IoMdKey } from "react-icons/io";
import { IoAdd, IoAttach, IoClose, IoFolderOpen, IoMic } from "react-icons/io5";
import { ChatFileAttachment, ProjectChatUIConfig } from "utils/generatedTypes";
import { type ChatPermissionModeValue } from "../chatComposerControls";
import {
  type ChatExecutionControls,
  type QueuedChatDraft,
} from "../chatInputHelpers";
import { type DictationState } from "../dictation";

import {
  CHAT_COMPOSER_GPU_FLOW_CLASS_NAME,
  type ChatRuntimeActivityEntry,
  type FloatingBoxHandlers,
} from "./shared";

function ChatThinkingControlButton(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    executionControls,
    isDisabled,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  } = props;
  return (
    <button
      type="button"
      aria-label="Thinking"
      aria-pressed={Boolean(executionControls.thinkingEnabled)}
      disabled={isDisabled}
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
      onClick={() =>
        executionControls.onThinkingEnabledChange?.(
          !executionControls.thinkingEnabled,
        )
      }
      {...(thinkingTooltipHandlers ?? {})}
    >
      <BiSolidBrain size={12} className={thinkingIconClassName} />
    </button>
  );
}

function ChatPermissionModeControl(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    executionControls,
    isDisabled,
    permissionModeIconClassName,
    permissionTooltipHandlers,
  } = props;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          aria-label={`${executionControls.permissionMode} permissions`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          {...(permissionTooltipHandlers ?? {})}
        >
          <IoMdKey size={12} className={permissionModeIconClassName} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[220px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          {(
            ProjectChatUIConfig.permissionModeOptions as Array<{
              value: ChatPermissionModeValue;
              label: string;
            }>
          ).map((mode) => (
            <DropdownMenu.Item
              key={mode.value}
              className={`cursor-pointer rounded px-2 py-1.5 transition-colors ${
                executionControls.permissionMode === mode.value
                  ? "bg-blue-600 text-white"
                  : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-800"
              }`}
              onSelect={() =>
                executionControls.onPermissionModeChange(mode.value)
              }
            >
              {mode.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatBackgroundTerminalActivityControl(props: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
  showBackgroundTerminalDropdown: boolean;
}) {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    backgroundTerminalTooltipHandlers,
    showBackgroundTerminalDropdown,
  } = props;
  const label = `${activeBackgroundTerminals} background terminal${
    activeBackgroundTerminals === 1 ? "" : "s"
  } active`;
  if (!showBackgroundTerminalDropdown) {
    return (
      <span
        data-chat-runtime-active-background-terminals="true"
        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
        aria-label={label}
        {...(backgroundTerminalTooltipHandlers ?? {})}
      >
        <FiTerminal size={10} />
        <span className="font-mono leading-none">
          {activeBackgroundTerminals}
        </span>
      </span>
    );
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-chat-runtime-active-background-terminals="true"
          className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label={label}
          {...(backgroundTerminalTooltipHandlers ?? {})}
        >
          <FiTerminal size={10} />
          <span className="font-mono leading-none">
            {activeBackgroundTerminals}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[240px] max-w-[360px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Background terminals
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <div className="max-h-52 overflow-y-auto pb-1">
            {activeBackgroundTerminalEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded px-2 py-1.5 text-setta-700 dark:text-setta-200"
              >
                <p
                  className="truncate text-[11px] font-medium"
                  title={entry.label}
                >
                  {entry.label}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-setta-400 dark:text-setta-500"
                  title={`${entry.toolName} | ${entry.id}`}
                >
                  {entry.toolName} | {entry.id}
                </p>
              </div>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatSubagentActivityControl(props: {
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  showSubagentDropdown: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    activeSubagentEntries,
    activeSubagents,
    showSubagentDropdown,
    subagentTooltipHandlers,
  } = props;
  const label = `${activeSubagents} subagent${
    activeSubagents === 1 ? "" : "s"
  } active`;
  if (!showSubagentDropdown) {
    return (
      <span
        data-chat-runtime-active-subagents="true"
        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
        aria-label={label}
        {...(subagentTooltipHandlers ?? {})}
      >
        <FiCpu size={10} />
        <span className="font-mono leading-none">{activeSubagents}</span>
      </span>
    );
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-chat-runtime-active-subagents="true"
          className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label={label}
          {...(subagentTooltipHandlers ?? {})}
        >
          <FiCpu size={10} />
          <span className="font-mono leading-none">{activeSubagents}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[240px] max-w-[360px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Subagents
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <div className="max-h-52 overflow-y-auto pb-1">
            {activeSubagentEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded px-2 py-1.5 text-setta-700 dark:text-setta-200"
              >
                <p
                  className="truncate text-[11px] font-medium"
                  title={entry.label}
                >
                  {entry.label}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-setta-400 dark:text-setta-500"
                  title={`${entry.toolName} | ${entry.id}`}
                >
                  {entry.toolName} | {entry.id}
                </p>
              </div>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatSearchControl(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  searchTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const { executionControls, isDisabled, searchTooltipHandlers } = props;
  return (
    <button
      type="button"
      aria-pressed={Boolean(executionControls.searchEnabled)}
      disabled={isDisabled}
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        executionControls.searchEnabled
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
      } disabled:cursor-not-allowed disabled:opacity-60`}
      onClick={() =>
        executionControls.onSearchEnabledChange?.(
          !executionControls.searchEnabled,
        )
      }
      {...(searchTooltipHandlers ?? {})}
    >
      Search
    </button>
  );
}

function ChatContextBadge(props: {
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  handleContextBadgeToggle: () => void;
}) {
  const {
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    handleContextBadgeToggle,
  } = props;
  if (!contextRemainingValue) {
    return null;
  }
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-setta-400 transition-colors hover:bg-setta-100 hover:text-setta-600 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-300"
      aria-label={`${contextLabelPrefixFull} ${contextRemainingValue}`}
      onClick={handleContextBadgeToggle}
      {...(contextTooltipHandlers ?? {})}
    >
      <span className="hidden @[30rem]:inline" aria-hidden="true">
        {contextLabelPrefixFull}
      </span>
      <span className="@[30rem]:hidden" aria-hidden="true">
        {contextLabelPrefixCompact}
      </span>
      <span className="ml-1" aria-hidden="true">
        {contextRemainingValue}
      </span>
    </button>
  );
}

export function ChatComposerMetaSection(props: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  executionControls?: ChatExecutionControls | undefined;
  handleContextBadgeToggle: () => void;
  isDisabled: boolean;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
  searchTooltipHandlers: FloatingBoxHandlers | null;
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showPermissionControl: boolean;
  showRuntimeActivityCounters: boolean;
  showSearchControl: boolean;
  showSubagentDropdown: boolean;
  showThinkingControl: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    backgroundTerminalTooltipHandlers,
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    executionControls,
    handleContextBadgeToggle,
    isDisabled,
    permissionModeIconClassName,
    permissionTooltipHandlers,
    searchTooltipHandlers,
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showPermissionControl,
    showRuntimeActivityCounters,
    showSearchControl,
    showSubagentDropdown,
    showThinkingControl,
    subagentTooltipHandlers,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  } = props;
  if (!shouldShowComposerMetaRow) {
    return null;
  }
  return (
    <div className="mb-0.5 flex items-center justify-between gap-2 [&_button]:cursor-pointer">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {showThinkingControl && executionControls ? (
          <ChatThinkingControlButton
            executionControls={executionControls}
            isDisabled={isDisabled}
            thinkingIconClassName={thinkingIconClassName}
            thinkingTooltipHandlers={thinkingTooltipHandlers}
          />
        ) : null}
        {showPermissionControl && executionControls ? (
          <ChatPermissionModeControl
            executionControls={executionControls}
            isDisabled={isDisabled}
            permissionModeIconClassName={permissionModeIconClassName}
            permissionTooltipHandlers={permissionTooltipHandlers}
          />
        ) : null}
        {showRuntimeActivityCounters ? (
          <div className="inline-flex items-center gap-1">
            <ChatBackgroundTerminalActivityControl
              activeBackgroundTerminalEntries={activeBackgroundTerminalEntries}
              activeBackgroundTerminals={activeBackgroundTerminals}
              backgroundTerminalTooltipHandlers={
                backgroundTerminalTooltipHandlers
              }
              showBackgroundTerminalDropdown={showBackgroundTerminalDropdown}
            />
            <ChatSubagentActivityControl
              activeSubagentEntries={activeSubagentEntries}
              activeSubagents={activeSubagents}
              showSubagentDropdown={showSubagentDropdown}
              subagentTooltipHandlers={subagentTooltipHandlers}
            />
          </div>
        ) : null}
        {showSearchControl && executionControls ? (
          <ChatSearchControl
            executionControls={executionControls}
            isDisabled={isDisabled}
            searchTooltipHandlers={searchTooltipHandlers}
          />
        ) : null}
      </div>
      <ChatContextBadge
        contextLabelPrefixCompact={contextLabelPrefixCompact}
        contextLabelPrefixFull={contextLabelPrefixFull}
        contextRemainingValue={contextRemainingValue}
        contextTooltipHandlers={contextTooltipHandlers}
        handleContextBadgeToggle={handleContextBadgeToggle}
      />
    </div>
  );
}

function ChatAttachmentMenuControl(props: {
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handlePickFromProject: () => void;
  isDeploymentMode: boolean;
}) {
  const {
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentTooltipHandlers,
    fileInputRef,
    handlePickFromProject,
    isDeploymentMode,
  } = props;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Attachment options"
          className={`absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200 ${
            attachmentInputDisabled
              ? "cursor-not-allowed opacity-40 hover:bg-transparent"
              : "cursor-pointer"
          }`}
          disabled={attachmentInputDisabled}
          {...attachmentTooltipHandlers}
        >
          <IoAdd />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-30 flex min-w-[170px] flex-col gap-1 rounded-lg border border-setta-200 bg-white p-2 text-xs font-semibold text-setta-600 shadow-xl dark:border-setta-700/70 dark:bg-setta-900 dark:text-setta-200"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            {attachmentCountLabel}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
            onSelect={() => fileInputRef.current?.click()}
            disabled={attachmentInputDisabled}
          >
            <IoAttach />
            Attach
          </DropdownMenu.Item>
          {!isDeploymentMode ? (
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
              onSelect={handlePickFromProject}
              disabled={attachmentInputDisabled}
            >
              <IoFolderOpen />
              Project
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatDictationControl(props: {
  canDictate: boolean;
  dictationAriaLabel: string;
  dictationState: DictationState;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  handleDictationToggle: () => void;
  isDisabled: boolean;
}) {
  const {
    canDictate,
    dictationAriaLabel,
    dictationState,
    dictationTooltipHandlers,
    handleDictationToggle,
    isDisabled,
  } = props;
  if (!canDictate) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={dictationAriaLabel}
      aria-pressed={dictationState === "listening"}
      disabled={isDisabled || dictationState === "transcribing"}
      className={`absolute left-7 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        dictationState === "listening"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200"
          : "text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
      } ${
        dictationState === "transcribing"
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer"
      }`}
      onClick={handleDictationToggle}
      {...(dictationTooltipHandlers ?? {})}
    >
      <IoMic
        size={11}
        className={dictationState === "listening" ? "animate-pulse" : undefined}
      />
    </button>
  );
}

export function ChatQueuedDraftStack(props: {
  queuedDrafts: readonly QueuedChatDraft[];
  restoreQueuedDraftToComposer: (draftId: string) => void;
  selectedQueuedDraftId: string | null;
  selectQueuedDraft: (draftId: string) => void;
  cycleSelectedQueuedDraft: (direction: "prev" | "next") => void;
}) {
  const {
    queuedDrafts,
    restoreQueuedDraftToComposer,
    selectedQueuedDraftId,
    selectQueuedDraft,
    cycleSelectedQueuedDraft,
  } = props;
  if (queuedDrafts.length === 0) {
    return null;
  }
  return (
    <div
      className="mb-1 flex flex-col gap-1"
      data-chat-queued-draft-stack="true"
    >
      {queuedDrafts.map((draft, index) => {
        const isSelected = draft.id === selectedQueuedDraftId;
        const previewText = draft.message.trim();
        const attachmentCount = draft.attachments.length;
        const attachmentLabel =
          attachmentCount === 1
            ? "1 attachment"
            : `${attachmentCount} attachments`;
        const queuedDraftTooltipHandlers = getFloatingBoxHandlers({
          title: "Queued draft",
          content:
            previewText.length > 0 ? previewText : "Queued attachment message",
        });
        return (
          <button
            key={draft.id}
            type="button"
            className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)] overflow-hidden rounded-md border text-left transition-colors ${
              isSelected
                ? "border-blue-400/90 bg-blue-200 text-setta-950 dark:border-blue-700/80 dark:bg-blue-950 dark:text-white"
                : "border-blue-300/75 bg-blue-100/85 text-setta-900 hover:border-blue-400/80 hover:bg-blue-200/80 dark:border-blue-800/70 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:border-blue-700 dark:hover:bg-blue-900/80"
            }`}
            data-chat-queued-draft="true"
            data-selected={isSelected ? "true" : "false"}
            onClick={() => selectQueuedDraft(draft.id)}
            onDoubleClick={() => restoreQueuedDraftToComposer(draft.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                restoreQueuedDraftToComposer(draft.id);
                return;
              }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                cycleSelectedQueuedDraft(
                  event.key === "ArrowUp" ? "prev" : "next",
                );
              }
            }}
            {...queuedDraftTooltipHandlers}
          >
            <div
              className={`flex h-full items-center justify-center text-[10px] font-semibold ${
                isSelected
                  ? "bg-blue-300/75 text-blue-900 dark:bg-blue-900/80 dark:text-blue-100"
                  : "bg-blue-200/75 text-blue-900 dark:bg-blue-900/65 dark:text-blue-200"
              }`}
              data-chat-queued-draft-rail="true"
            >
              <span className="inline-flex h-4 min-w-4 items-center justify-center">
                {index + 1}
              </span>
            </div>
            <div className="min-w-0 px-2 py-1">
              <div className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]">
                <span>Queued</span>
                {attachmentCount > 0 ? (
                  <span className="truncate opacity-80">{attachmentLabel}</span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium">
                {previewText.length > 0 ? previewText : "(Attachment message)"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ChatComposerFeedbackSection(props: {
  dictationFeedback: string | null;
  dictationState: DictationState;
  isUploading: boolean;
  showAttachmentDisabledMessage: boolean;
  showSharePolicyMessage: boolean;
  slashFeedback: string | null;
}) {
  const {
    dictationFeedback,
    dictationState,
    isUploading,
    showAttachmentDisabledMessage,
    showSharePolicyMessage,
    slashFeedback,
  } = props;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
      {showSharePolicyMessage ? (
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
          Attachments blocked by share policy
        </span>
      ) : null}
      {showAttachmentDisabledMessage ? (
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
          Attachments disabled
        </span>
      ) : null}
      {isUploading ? (
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
          Uploading...
        </span>
      ) : null}
      {slashFeedback ? (
        <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
          {slashFeedback}
        </span>
      ) : null}
      {dictationFeedback ? (
        <span
          className={`text-[10px] uppercase tracking-[0.16em] ${
            dictationState === "error"
              ? "text-amber-700 dark:text-amber-300"
              : "text-blue-600 dark:text-blue-400"
          }`}
        >
          {dictationFeedback}
        </span>
      ) : null}
    </div>
  );
}

export function ChatAttachmentsSection(props: {
  attachmentActionsDisabled: boolean;
  attachments: readonly ChatFileAttachment[];
  handleClearAttachments: () => void;
  handleRemoveAttachment: (attachment: ChatFileAttachment) => void;
}) {
  const {
    attachmentActionsDisabled,
    attachments,
    handleClearAttachments,
    handleRemoveAttachment,
  } = props;
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="mb-0.5 flex flex-wrap gap-1.5 [&_button]:cursor-pointer">
      {attachments.map((attachment) => {
        const removeAttachmentTooltipHandlers = getFloatingBoxHandlers({
          title: "Remove attachment",
          content: attachment.name,
        });
        return (
          <div
            key={attachment.id}
            className="flex items-center gap-1.5 rounded-md border border-setta-200 bg-white/80 px-2 py-0.5 text-xs text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200"
          >
            <span className="max-w-[200px] truncate">{attachment.name}</span>
            {attachment.size !== null && attachment.size !== undefined ? (
              <span className="text-[10px] text-setta-400">
                {formatBytes(attachment.size)}
              </span>
            ) : null}
            <button
              type="button"
              className="rounded-full p-1 text-setta-400 transition-colors hover:text-red-500"
              onClick={() => handleRemoveAttachment(attachment)}
              disabled={attachmentActionsDisabled}
              {...removeAttachmentTooltipHandlers}
            >
              <IoClose />
            </button>
          </div>
        );
      })}
      {attachments.length > 1 ? (
        <button
          type="button"
          className="rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 hover:border-setta-400 hover:text-setta-600 dark:border-setta-800 dark:text-setta-500 dark:hover:text-setta-200"
          onClick={handleClearAttachments}
          disabled={attachmentActionsDisabled}
          {...getFloatingBoxHandlers({
            title: "Clear attachments",
            content: "Remove all attachments from this draft.",
          })}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

export function ChatSlashSuggestionsPortal(props: {
  canRenderSlashSuggestionsInPortal: boolean;
  slashSuggestionsList: ReactNode;
  slashSuggestionsPortalStyle: CSSProperties | null;
}) {
  const {
    canRenderSlashSuggestionsInPortal,
    slashSuggestionsList,
    slashSuggestionsPortalStyle,
  } = props;
  if (
    !canRenderSlashSuggestionsInPortal ||
    typeof document === "undefined" ||
    !document.body
  ) {
    return null;
  }
  return createPortal(
    <div
      className="fixed z-40 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900"
      style={slashSuggestionsPortalStyle ?? undefined}
    >
      {slashSuggestionsList}
    </div>,
    document.body,
  );
}

export function ChatComposerFieldSection(props: {
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  buttonClassName: string;
  buttonIcon: ReactNode;
  canDictate: boolean;
  canRenderSlashSuggestionsInPortal: boolean;
  dictationAriaLabel: string;
  dictationState: DictationState;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleDictationToggle: () => void;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePickFromProject: () => void;
  inputValue: string;
  isDeploymentMode: boolean;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  placeholderText: string | undefined;
  shouldShowSlashSuggestions: boolean;
  slashSuggestionsList: ReactNode;
  slashSuggestionsPositionClass: string;
  submitTooltipHandlers: FloatingBoxHandlers;
  textAreaClassName: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  waitingForResponse: boolean;
}) {
  const {
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentTooltipHandlers,
    buttonClassName,
    buttonIcon,
    canDictate,
    canRenderSlashSuggestionsInPortal,
    dictationAriaLabel,
    dictationState,
    dictationTooltipHandlers,
    fileInputRef,
    handleChange,
    handleDictationToggle,
    handleFileInputChange,
    handleKeyDown,
    handlePickFromProject,
    inputValue,
    isDeploymentMode,
    isDisabled,
    isSubmitDisabled,
    placeholderText,
    shouldShowSlashSuggestions,
    slashSuggestionsList,
    slashSuggestionsPositionClass,
    submitTooltipHandlers,
    textAreaClassName,
    textareaRef,
    waitingForResponse,
  } = props;
  return (
    <div
      className={`${CHAT_COMPOSER_GPU_FLOW_CLASS_NAME} group relative my-1 w-full`}
      data-gpu-flow-control="chat-composer-field"
      data-gpu-flow-interactive="true"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        disabled={attachmentInputDisabled}
      />
      <ChatAttachmentMenuControl
        attachmentCountLabel={attachmentCountLabel}
        attachmentInputDisabled={attachmentInputDisabled}
        attachmentTooltipHandlers={attachmentTooltipHandlers}
        fileInputRef={fileInputRef}
        handlePickFromProject={handlePickFromProject}
        isDeploymentMode={isDeploymentMode}
      />
      <ChatDictationControl
        canDictate={canDictate}
        dictationAriaLabel={dictationAriaLabel}
        dictationState={dictationState}
        dictationTooltipHandlers={dictationTooltipHandlers}
        handleDictationToggle={handleDictationToggle}
        isDisabled={isDisabled}
      />
      <textarea
        ref={textareaRef}
        data-testid="chat-input-textarea"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholderText}
        className={`${textAreaClassName} ${canDictate ? "pl-14" : "pl-9"}`}
        disabled={isDisabled}
      />
      <button
        type="submit"
        aria-label={waitingForResponse ? "Stop response" : "Send message"}
        disabled={isSubmitDisabled}
        className={`absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${buttonClassName} disabled:opacity-40`}
        {...submitTooltipHandlers}
      >
        {buttonIcon}
      </button>
      {shouldShowSlashSuggestions && !canRenderSlashSuggestionsInPortal ? (
        <div
          className={`absolute left-1 right-1 z-20 max-h-52 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900 ${slashSuggestionsPositionClass}`}
        >
          {slashSuggestionsList}
        </div>
      ) : null}
    </div>
  );
}
