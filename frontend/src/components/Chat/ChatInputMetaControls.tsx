import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { memo, useCallback, useMemo, useState } from "react";
import { BiSolidBrain } from "react-icons/bi";
import { FiCpu, FiTerminal } from "react-icons/fi";
import { IoMdKey } from "react-icons/io";
import { type ChatPermissionModeValue } from "./chatComposerControls";

export type ChatExecutionControls = {
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (next: boolean) => void;
  permissionMode: ChatPermissionModeValue;
  searchEnabled?: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange?: (next: boolean) => void;
};

export type ChatExecutionControlVisibility = {
  thinking?: boolean;
  permissionMode?: boolean;
  search?: boolean;
};

export type ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: number;
  activeSubagents: number;
};

type ChatRuntimeActivityEntry = {
  id: string;
  label: string;
  toolName: string;
};

export type ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: ChatRuntimeActivityEntry[];
  activeSubagents: ChatRuntimeActivityEntry[];
};

export const DEFAULT_RUNTIME_ACTIVITY_COUNTS: ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: 0,
  activeSubagents: 0,
};

export const DEFAULT_RUNTIME_ACTIVITY_DETAILS: ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: [],
  activeSubagents: [],
};

const PERMISSION_MODE_OPTIONS: Array<{
  value: ChatPermissionModeValue;
  label: string;
}> = [
  { value: "minimal", label: "minimal" },
  { value: "yolo", label: "yolo" },
  { value: "config_toml_custom", label: "config.toml custom" },
];

function normalizeNonNegativeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = millions >= 10 ? 0 : 1;
    return `${millions.toFixed(digits).replace(/\.0$/u, "")}m`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    const digits = thousands >= 10 ? 0 : 1;
    return `${thousands.toFixed(digits).replace(/\.0$/u, "")}k`;
  }
  return `${value}`;
}

type ChatInputMetaControlsProps = {
  disabled: boolean;
  executionControls?: ChatExecutionControls;
  executionControlVisibility?: ChatExecutionControlVisibility;
  contextWindowTokens?: number | null;
  contextUsedTokens?: number | null;
  contextUsageIsEstimated?: boolean;
  contextUsageUnavailable?: boolean;
  runtimeActivityCounts?: ChatRuntimeActivityCounts;
  runtimeActivityDetails?: ChatRuntimeActivityDetails;
};

export const ChatInputMetaControls = memo(function ChatInputMetaControls({
  disabled,
  executionControls,
  executionControlVisibility = {
    permissionMode: true,
    search: true,
  },
  contextWindowTokens = null,
  contextUsedTokens = null,
  contextUsageIsEstimated = false,
  contextUsageUnavailable = false,
  runtimeActivityCounts = DEFAULT_RUNTIME_ACTIVITY_COUNTS,
  runtimeActivityDetails = DEFAULT_RUNTIME_ACTIVITY_DETAILS,
}: ChatInputMetaControlsProps) {
  const [contextBadgeMode, setContextBadgeMode] = useState<
    "percentage" | "tokens"
  >("percentage");

  const showPermissionControl = Boolean(
    executionControls && executionControlVisibility.permissionMode !== false,
  );
  const showThinkingControl = Boolean(
    executionControls &&
      executionControlVisibility.thinking !== false &&
      typeof executionControls.onThinkingEnabledChange === "function",
  );
  const showSearchControl = Boolean(
    executionControls &&
      executionControlVisibility.search !== false &&
      typeof executionControls.onSearchEnabledChange === "function",
  );
  const showExecutionControls =
    showThinkingControl || showPermissionControl || showSearchControl;

  const permissionModeIconClassName = useMemo(() => {
    if (!executionControls) {
      return "text-setta-600 dark:text-setta-300";
    }
    if (executionControls.permissionMode === "yolo") {
      return "text-orange-500 dark:text-orange-400";
    }
    if (executionControls.permissionMode === "config_toml_custom") {
      return "text-amber-500 dark:text-amber-300";
    }
    return "text-setta-600 dark:text-setta-300";
  }, [executionControls?.permissionMode]);

  const thinkingIconClassName = useMemo(() => {
    if (!executionControls?.thinkingEnabled) {
      return "text-setta-600 dark:text-setta-300";
    }
    return "text-blue-600 dark:text-blue-400";
  }, [executionControls?.thinkingEnabled]);

  const normalizedContextWindowTokens = useMemo(() => {
    if (
      typeof contextWindowTokens !== "number" ||
      !Number.isFinite(contextWindowTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextWindowTokens));
  }, [contextWindowTokens]);

  const normalizedContextUsedTokens = useMemo(() => {
    if (
      typeof contextUsedTokens !== "number" ||
      !Number.isFinite(contextUsedTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextUsedTokens));
  }, [contextUsedTokens]);

  const remainingContextTokens = useMemo(() => {
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextUsedTokens === null
    ) {
      return null;
    }
    return Math.max(
      0,
      normalizedContextWindowTokens - normalizedContextUsedTokens,
    );
  }, [normalizedContextUsedTokens, normalizedContextWindowTokens]);

  const remainingContextPercentage = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextWindowTokens <= 0
    ) {
      return 0;
    }
    const rawPercentage = Math.round(
      (remainingContextTokens / normalizedContextWindowTokens) * 100,
    );
    return Math.max(0, Math.min(100, rawPercentage));
  }, [normalizedContextWindowTokens, remainingContextTokens]);

  const contextRemainingValue = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (contextBadgeMode === "tokens") {
      return `~${formatCompactTokenCount(remainingContextTokens)}`;
    }
    if (remainingContextPercentage === null) {
      return null;
    }
    return `${remainingContextPercentage}%`;
  }, [contextBadgeMode, remainingContextPercentage, remainingContextTokens]);

  const contextLabelPrefixFull = contextUsageIsEstimated
    ? "est. context left"
    : "context left";
  const contextLabelPrefixCompact = contextUsageIsEstimated
    ? "est. context"
    : "context";
  const showContextUnavailableBadge =
    contextRemainingValue === null && contextUsageUnavailable;

  const activeBackgroundTerminalEntries =
    runtimeActivityDetails.activeBackgroundTerminals;
  const activeSubagentEntries = runtimeActivityDetails.activeSubagents;

  const activeBackgroundTerminals = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(
          runtimeActivityCounts.activeBackgroundTerminals,
        ),
        activeBackgroundTerminalEntries.length,
      ),
    [
      activeBackgroundTerminalEntries.length,
      runtimeActivityCounts.activeBackgroundTerminals,
    ],
  );

  const activeSubagents = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(runtimeActivityCounts.activeSubagents),
        activeSubagentEntries.length,
      ),
    [activeSubagentEntries.length, runtimeActivityCounts.activeSubagents],
  );

  const showBackgroundTerminalDropdown =
    activeBackgroundTerminalEntries.length > 0;
  const showSubagentDropdown = activeSubagentEntries.length > 0;
  const showRuntimeActivityCounters =
    activeBackgroundTerminals > 0 || activeSubagents > 0;
  const showContextBadge =
    contextRemainingValue !== null || showContextUnavailableBadge;
  const shouldShowComposerMetaRow =
    showExecutionControls || showContextBadge || showRuntimeActivityCounters;

  const thinkingTooltipHandlers = useMemo(() => {
    if (!showThinkingControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Thinking",
      content: executionControls.thinkingEnabled
        ? "Reasoning is enabled for new messages."
        : "Reasoning is disabled for new messages.",
    });
  }, [executionControls, showThinkingControl]);

  const permissionTooltipHandlers = useMemo(() => {
    if (!executionControls || !showPermissionControl) {
      return null;
    }
    const modeLabel = executionControls.permissionMode.replaceAll("_", " ");
    return getFloatingBoxHandlers({
      title: "Permissions",
      content: `Current mode: ${modeLabel}`,
    });
  }, [executionControls, showPermissionControl]);

  const backgroundTerminalTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Background terminals",
      content: showBackgroundTerminalDropdown
        ? `${activeBackgroundTerminals} active. Click to view running terminals.`
        : `${activeBackgroundTerminals} active`,
    });
  }, [
    activeBackgroundTerminals,
    showBackgroundTerminalDropdown,
    showRuntimeActivityCounters,
  ]);

  const subagentTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Subagents",
      content: showSubagentDropdown
        ? `${activeSubagents} active. Click to view running subagents.`
        : `${activeSubagents} active`,
    });
  }, [activeSubagents, showRuntimeActivityCounters, showSubagentDropdown]);

  const contextTooltipHandlers = useMemo(() => {
    if (!showContextBadge) {
      return null;
    }
    if (showContextUnavailableBadge) {
      return getFloatingBoxHandlers({
        title: "Context unavailable",
        content: "Context usage telemetry is unavailable for this chat run.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Context",
      content:
        contextBadgeMode === "tokens"
          ? "Click to show remaining context percentage."
          : "Click to show remaining context tokens.",
    });
  }, [contextBadgeMode, showContextBadge, showContextUnavailableBadge]);

  const searchTooltipHandlers = useMemo(() => {
    if (!showSearchControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Search",
      content: executionControls.searchEnabled
        ? "Search is enabled for new messages."
        : "Search is disabled for new messages.",
    });
  }, [executionControls, showSearchControl]);

  const handleContextBadgeToggle = useCallback(() => {
    setContextBadgeMode((current) =>
      current === "percentage" ? "tokens" : "percentage",
    );
  }, []);

  if (!shouldShowComposerMetaRow) {
    return null;
  }

  return (
    <div className="mb-0.5 flex items-center justify-between gap-2 [&_button]:cursor-pointer">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {showThinkingControl && executionControls ? (
          <button
            type="button"
            aria-label="Thinking"
            aria-pressed={Boolean(executionControls.thinkingEnabled)}
            disabled={disabled}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
            onClick={() =>
              executionControls.onThinkingEnabledChange?.(
                !Boolean(executionControls.thinkingEnabled),
              )
            }
            {...(thinkingTooltipHandlers ?? {})}
          >
            <BiSolidBrain size={12} className={thinkingIconClassName} />
          </button>
        ) : null}
        {executionControls &&
        executionControlVisibility.permissionMode !== false ? (
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                disabled={disabled}
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
                {PERMISSION_MODE_OPTIONS.map((mode) => (
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
        ) : null}
        {showRuntimeActivityCounters ? (
          <div className="inline-flex items-center gap-1">
            {showBackgroundTerminalDropdown ? (
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    data-chat-runtime-active-background-terminals="true"
                    className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                    aria-label={`${activeBackgroundTerminals} background terminal${activeBackgroundTerminals === 1 ? "" : "s"} active`}
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
            ) : (
              <span
                data-chat-runtime-active-background-terminals="true"
                className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
                aria-label={`${activeBackgroundTerminals} background terminal${activeBackgroundTerminals === 1 ? "" : "s"} active`}
                {...(backgroundTerminalTooltipHandlers ?? {})}
              >
                <FiTerminal size={10} />
                <span className="font-mono leading-none">
                  {activeBackgroundTerminals}
                </span>
              </span>
            )}
            {showSubagentDropdown ? (
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    data-chat-runtime-active-subagents="true"
                    className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                    aria-label={`${activeSubagents} subagent${activeSubagents === 1 ? "" : "s"} active`}
                    {...(subagentTooltipHandlers ?? {})}
                  >
                    <FiCpu size={10} />
                    <span className="font-mono leading-none">
                      {activeSubagents}
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
            ) : (
              <span
                data-chat-runtime-active-subagents="true"
                className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
                aria-label={`${activeSubagents} subagent${activeSubagents === 1 ? "" : "s"} active`}
                {...(subagentTooltipHandlers ?? {})}
              >
                <FiCpu size={10} />
                <span className="font-mono leading-none">
                  {activeSubagents}
                </span>
              </span>
            )}
          </div>
        ) : null}
        {executionControls &&
        executionControlVisibility.search !== false &&
        typeof executionControls.onSearchEnabledChange === "function" ? (
          <button
            type="button"
            aria-pressed={Boolean(executionControls.searchEnabled)}
            disabled={disabled}
            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors ${
              executionControls.searchEnabled
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            onClick={() =>
              executionControls.onSearchEnabledChange?.(
                !Boolean(executionControls.searchEnabled),
              )
            }
            {...(searchTooltipHandlers ?? {})}
          >
            Search
          </button>
        ) : null}
      </div>
      {contextRemainingValue ? (
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
      ) : showContextUnavailableBadge ? (
        <span
          className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-300"
          aria-label="context unavailable"
          {...(contextTooltipHandlers ?? {})}
        >
          context unavailable
        </span>
      ) : null}
    </div>
  );
});
