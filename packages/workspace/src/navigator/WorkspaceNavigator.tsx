import { matchSorter } from "match-sorter";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiCommand, FiSearch, FiX } from "react-icons/fi";
import { useWorkspaceCommandState } from "../commands/workspaceCommandResolution";
import { useActiveSections } from "../document/stores";
import { getWorkspaceKeyBindingChordLabel } from "../keybindings/workspaceKeyBindingRegistry";
import { getElementTextDirection } from "../styles/textDirection";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  getWorkspaceHostDomId,
  registerWorkspaceHostElement,
} from "../workspaceHostInternals";
import { resolveWorkspaceFindResults } from "./workspaceFind";
import { resolveWorkspacePaletteEntries } from "./workspacePalette";
import {
  closeWorkspaceNavigator,
  closeWorkspaceNavigatorAfterFocusTransfer,
  registerWorkspaceNavigatorSurface,
  openWorkspaceNavigator,
  setWorkspaceNavigatorActiveIndex,
  setWorkspaceNavigatorMode,
  setWorkspaceNavigatorQuery,
  setWorkspaceNavigatorStatus,
  useWorkspaceNavigator,
} from "./workspaceNavigatorState";
import type {
  WorkspaceNavigatorActivation,
  WorkspaceNavigatorEntry,
  WorkspaceNavigatorMode,
  WorkspaceNavigatorProps,
} from "./workspaceNavigatorTypes";

type WorkspaceNavigatorEntryGroup = {
  label: string;
  entries: Array<WorkspaceNavigatorEntry>;
};

function getNavigatorModeLabel(mode: WorkspaceNavigatorMode): string {
  return mode === "find" ? "Find" : "Commands";
}

function getNavigatorInputLabel(mode: WorkspaceNavigatorMode): string {
  return mode === "find" ? "Find in workspace" : "Search workspace commands";
}

function getNavigatorResultLabel(mode: WorkspaceNavigatorMode): string {
  return mode === "find" ? "Find results" : "Command results";
}

function normalizeActivation(
  activation: WorkspaceNavigatorActivation,
): WorkspaceNavigatorActivation {
  return activation;
}

function toWorkspacePaletteNavigatorEntries(
  host: ReturnType<typeof useWorkspaceHost>,
  query: string,
): Array<WorkspaceNavigatorEntry> {
  const entries = resolveWorkspacePaletteEntries(host);
  const matching =
    query.trim() === ""
      ? entries
      : matchSorter(entries, query, {
          keys: ["label", "group", "keywords"],
        });
  return matching.map((entry) => ({
    activate: () => normalizeActivation(entry.run()),
    breadcrumb: entry.description ?? null,
    checked: entry.checked,
    disabled: entry.disabled,
    disabledReason: entry.disabledReason,
    group: entry.group,
    ...(entry.icon ? { icon: entry.icon } : {}),
    id: entry.id,
    kind: "command" as const,
    label: entry.label,
    shortcutLabel:
      entry.shortcutLabel ??
      (entry.keyBindingId
        ? getWorkspaceKeyBindingChordLabel(host, entry.keyBindingId)
        : null),
  }));
}

function getWorkspaceNavigatorEntries(
  host: ReturnType<typeof useWorkspaceHost>,
  mode: WorkspaceNavigatorMode,
  query: string,
): Array<WorkspaceNavigatorEntry> {
  if (mode === "find") {
    return resolveWorkspaceFindResults(host, query).map((entry) => ({
      activate: () => normalizeActivation(entry.activate()),
      breadcrumb: entry.breadcrumb,
      checked: entry.checked,
      disabled: entry.disabled,
      disabledReason: entry.disabledReason,
      group: entry.group,
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      shortcutLabel: entry.shortcutLabel,
    }));
  }
  return toWorkspacePaletteNavigatorEntries(host, query);
}

function groupWorkspaceNavigatorEntries(
  entries: ReadonlyArray<WorkspaceNavigatorEntry>,
): Array<WorkspaceNavigatorEntryGroup> {
  const groups = new Map<string, Array<WorkspaceNavigatorEntry>>();
  for (const entry of entries) {
    const grouped = groups.get(entry.group) ?? [];
    grouped.push(entry);
    groups.set(entry.group, grouped);
  }
  return [...groups].map(([label, groupedEntries]) => ({
    entries: groupedEntries,
    label,
  }));
}

function getWorkspaceNavigatorSummary(
  mode: WorkspaceNavigatorMode,
  query: string,
  resultCount: number,
  statusMessage: string | null,
): string {
  if (statusMessage) {
    return statusMessage;
  }
  const subject = mode === "find" ? "result" : "command";
  const count = `${resultCount} ${subject}${resultCount === 1 ? "" : "s"}`;
  return query.trim() === "" ? count : `${count} for ${query.trim()}`;
}

function getWorkspaceNavigatorFocusableElements(
  root: HTMLElement,
): Array<HTMLElement> {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.closest("[hidden], [inert]") === null,
  );
}

function getNextWorkspaceNavigatorIndex(
  currentIndex: number,
  resultCount: number,
  key: string,
): number | null {
  if (resultCount === 0) {
    return null;
  }
  switch (key) {
    case "ArrowDown":
      return (currentIndex + 1) % resultCount;
    case "ArrowUp":
      return (currentIndex - 1 + resultCount) % resultCount;
    case "Home":
      return 0;
    case "End":
      return resultCount - 1;
    default:
      return null;
  }
}

function getNextWorkspaceNavigatorMode(
  mode: WorkspaceNavigatorMode,
  key: string,
): WorkspaceNavigatorMode | null {
  if (key === "Home" || key === "End") {
    return key === "Home" ? "find" : "commands";
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    return mode === "find" ? "commands" : "find";
  }
  return null;
}

export function WorkspaceNavigator({
  ariaLabel = "Workspace navigator",
  className,
  defaultMode = "find",
  showTrigger = false,
}: WorkspaceNavigatorProps) {
  const host = useWorkspaceHost();
  const hostId = getWorkspaceHostDomId(host);
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  useWorkspaceCommandState();
  useActiveSections((state) => state.activeIds);
  const activeIndex = useWorkspaceNavigator((state) => state.activeIndex);
  const isOpen = useWorkspaceNavigator((state) => state.isOpen);
  const mode = useWorkspaceNavigator((state) => state.mode);
  const opener = useWorkspaceNavigator((state) => state.opener);
  const query = useWorkspaceNavigator((state) => state.query);
  const statusMessage = useWorkspaceNavigator((state) => state.statusMessage);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const modeButtonRefs = useRef(
    new Map<WorkspaceNavigatorMode, HTMLButtonElement>(),
  );
  const instanceId = `workspace-navigator-${hostId}-${useId().replaceAll(":", "")}`;
  const results = isOpen ? getWorkspaceNavigatorEntries(host, mode, query) : [];
  const groups = groupWorkspaceNavigatorEntries(results);
  const resolvedActiveIndex =
    results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);
  const activeEntry =
    resolvedActiveIndex === -1 ? null : (results[resolvedActiveIndex] ?? null);
  const activeOptionId = activeEntry
    ? `${instanceId}-option-${resolvedActiveIndex}`
    : undefined;
  const listboxId = `${instanceId}-results`;
  const findShortcutLabel = getWorkspaceKeyBindingChordLabel(
    host,
    "workspace.open-find",
  );
  const commandsShortcutLabel = getWorkspaceKeyBindingChordLabel(
    host,
    "workspace.open-command-palette",
  );
  const triggerShortcutLabel =
    defaultMode === "find" ? findShortcutLabel : commandsShortcutLabel;
  const liveSummary = getWorkspaceNavigatorSummary(
    mode,
    query,
    results.length,
    statusMessage,
  );
  const liveMessage = isOpen || statusMessage ? liveSummary : "";

  useLayoutEffect(() => registerWorkspaceNavigatorSurface(host), [host]);

  useEffect(() => {
    if (resolvedActiveIndex === -1 || resolvedActiveIndex === activeIndex) {
      return;
    }
    setWorkspaceNavigatorActiveIndex(host, resolvedActiveIndex);
  }, [activeIndex, host, resolvedActiveIndex]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !activeEntry) {
      return;
    }
    optionRefs.current
      .get(activeEntry.id)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeEntry, isOpen]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    return registerWorkspaceHostElement(host, dialog);
  }, [host, isOpen]);

  function registerOption(entryId: string, element: HTMLElement | null): void {
    if (element) {
      optionRefs.current.set(entryId, element);
    } else {
      optionRefs.current.delete(entryId);
    }
  }

  function activateEntry(entry: WorkspaceNavigatorEntry): void {
    if (entry.disabled) {
      setWorkspaceNavigatorStatus(
        host,
        entry.disabledReason
          ? `${entry.label}: ${entry.disabledReason}`
          : `${entry.label} is unavailable.`,
      );
      return;
    }
    const activation = entry.activate();
    if (!activation.ran) {
      setWorkspaceNavigatorStatus(
        host,
        activation.statusMessage ?? `${entry.label} is no longer available.`,
      );
      return;
    }
    if (entry.kind === "item" && activation.statusMessage === null) {
      closeWorkspaceNavigatorAfterFocusTransfer(host);
    } else {
      closeWorkspaceNavigator(host);
    }
    if (activation.statusMessage) {
      setWorkspaceNavigatorStatus(host, activation.statusMessage);
    }
  }

  function activateActiveEntry(): void {
    if (activeEntry) {
      activateEntry(activeEntry);
    }
  }

  function handleInputKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void {
    const nextIndex = getNextWorkspaceNavigatorIndex(
      resolvedActiveIndex < 0 ? 0 : resolvedActiveIndex,
      results.length,
      event.key,
    );
    if (nextIndex !== null) {
      event.preventDefault();
      setWorkspaceNavigatorActiveIndex(host, nextIndex);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateActiveEntry();
    }
  }

  function handleModeTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    const nextMode = getNextWorkspaceNavigatorMode(mode, event.key);
    if (!nextMode) {
      return;
    }
    event.preventDefault();
    setWorkspaceNavigatorMode(host, nextMode);
    modeButtonRefs.current.get(nextMode)?.focus({ preventScroll: true });
  }

  function handleDialogKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeWorkspaceNavigator(host);
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const focusable = getWorkspaceNavigatorFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1;
    const next = focusable[nextIndex];
    if (!next) {
      return;
    }
    event.preventDefault();
    next.focus({ preventScroll: true });
  }

  function handleBackdropMouseDown(
    event: ReactMouseEvent<HTMLDivElement>,
  ): void {
    if (event.target === event.currentTarget) {
      closeWorkspaceNavigator(host);
    }
  }

  const liveRegion = (
    <span
      aria-atomic="true"
      aria-live="polite"
      className={`${workspaceScopeClassName} setta-workspace-navigator-live`}
      role="status"
    >
      {liveMessage}
    </span>
  );

  const dialog = !isOpen ? null : (
    <div
      className={`${workspaceScopeClassName} setta-workspace-navigator-overlay`}
      data-workspace-navigator-overlay="true"
      dir={opener ? getElementTextDirection(opener) : undefined}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        aria-describedby={`${instanceId}-summary`}
        aria-label={ariaLabel}
        aria-modal="true"
        className="setta-workspace-navigator-dialog"
        data-workspace-navigator-mode={mode}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="setta-workspace-navigator-heading">
          <div
            aria-label="Workspace navigator modes"
            className="setta-workspace-navigator-tabs"
            role="tablist"
          >
            {(["find", "commands"] as const).map((candidate) => {
              const selected = candidate === mode;
              const shortcutLabel =
                candidate === "find"
                  ? findShortcutLabel
                  : commandsShortcutLabel;
              return (
                <button
                  aria-controls={`${instanceId}-${candidate}-panel`}
                  aria-selected={selected}
                  className="setta-workspace-navigator-tab"
                  data-active={selected}
                  id={`${instanceId}-${candidate}-tab`}
                  key={candidate}
                  onClick={() => setWorkspaceNavigatorMode(host, candidate)}
                  onKeyDown={handleModeTabKeyDown}
                  ref={(element) => {
                    if (element) {
                      modeButtonRefs.current.set(candidate, element);
                    } else {
                      modeButtonRefs.current.delete(candidate);
                    }
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  {candidate === "find" ? (
                    <FiSearch aria-hidden="true" focusable="false" />
                  ) : (
                    <FiCommand aria-hidden="true" focusable="false" />
                  )}
                  <span>{getNavigatorModeLabel(candidate)}</span>
                  {shortcutLabel ? <kbd>{shortcutLabel}</kbd> : null}
                </button>
              );
            })}
          </div>
          <button
            aria-label="Close workspace navigator"
            className="setta-workspace-navigator-close"
            onClick={() => closeWorkspaceNavigator(host)}
            type="button"
          >
            <FiX aria-hidden="true" focusable="false" />
          </button>
        </div>
        <div
          aria-labelledby={`${instanceId}-${mode}-tab`}
          className="setta-workspace-navigator-content"
          id={`${instanceId}-${mode}-panel`}
          role="tabpanel"
        >
          <label
            className="setta-workspace-navigator-input-wrap"
            htmlFor={`${instanceId}-input`}
          >
            <FiSearch aria-hidden="true" focusable="false" />
            <span className="setta-workspace-navigator-input-label">
              {getNavigatorInputLabel(mode)}
            </span>
            <input
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-label={getNavigatorInputLabel(mode)}
              className="setta-workspace-navigator-input"
              id={`${instanceId}-input`}
              onChange={(event) =>
                setWorkspaceNavigatorQuery(host, event.currentTarget.value)
              }
              onKeyDown={handleInputKeyDown}
              placeholder={
                mode === "find"
                  ? "Search sections and parameters"
                  : "Search commands"
              }
              ref={inputRef}
              role="combobox"
              value={query}
            />
          </label>
          <p
            className="setta-workspace-navigator-summary"
            id={`${instanceId}-summary`}
          >
            {liveSummary}
          </p>
          <div
            aria-label={getNavigatorResultLabel(mode)}
            className="setta-workspace-navigator-results"
            id={listboxId}
            role="listbox"
          >
            {groups.length === 0 ? (
              <p className="setta-workspace-navigator-empty">
                No{" "}
                {mode === "find"
                  ? "matching workspace entries"
                  : "matching commands"}
                .
              </p>
            ) : (
              groups.map((group) => (
                <div
                  aria-label={group.label}
                  className="setta-workspace-navigator-group"
                  key={group.label}
                  role="group"
                >
                  <h2 className="setta-workspace-navigator-group-label">
                    {group.label}
                  </h2>
                  {group.entries.map((entry) => {
                    const resultIndex = results.indexOf(entry);
                    const selected = resultIndex === resolvedActiveIndex;
                    const reasonId = `${instanceId}-reason-${resultIndex}`;
                    const Icon = entry.icon;
                    return (
                      <div
                        aria-describedby={
                          entry.disabledReason ? reasonId : undefined
                        }
                        aria-disabled={entry.disabled || undefined}
                        aria-selected={selected}
                        className="setta-workspace-navigator-option"
                        data-active={selected}
                        data-disabled={entry.disabled}
                        id={`${instanceId}-option-${resultIndex}`}
                        key={entry.id}
                        onClick={() => activateEntry(entry)}
                        onMouseDown={(event) => event.preventDefault()}
                        ref={(element) => registerOption(entry.id, element)}
                        role="option"
                      >
                        <span
                          aria-hidden="true"
                          className="setta-workspace-navigator-option-icon"
                        >
                          {Icon ? (
                            <Icon />
                          ) : entry.kind === "command" ? (
                            <FiCommand />
                          ) : (
                            <FiSearch />
                          )}
                        </span>
                        <span className="setta-workspace-navigator-option-copy">
                          <span className="setta-workspace-navigator-option-label">
                            {entry.label}
                          </span>
                          {entry.breadcrumb ? (
                            <span className="setta-workspace-navigator-option-breadcrumb">
                              {entry.breadcrumb}
                            </span>
                          ) : null}
                          {entry.disabledReason ? (
                            <span
                              className="setta-workspace-navigator-option-reason"
                              id={reasonId}
                            >
                              {entry.disabledReason}
                            </span>
                          ) : null}
                        </span>
                        {entry.checked === true ? (
                          <FiCheck
                            aria-label="Checked"
                            className="setta-workspace-navigator-option-checked"
                          />
                        ) : null}
                        {entry.shortcutLabel ? (
                          <kbd className="setta-workspace-navigator-option-shortcut">
                            {entry.shortcutLabel}
                          </kbd>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {showTrigger ? (
        <button
          aria-label="Open workspace navigator"
          className={`${workspaceScopeClassName} setta-workspace-navigator-trigger${className ? ` ${className}` : ""}`}
          onClick={() => openWorkspaceNavigator(host, defaultMode)}
          type="button"
        >
          <FiSearch aria-hidden="true" focusable="false" />
          <span>{getNavigatorModeLabel(defaultMode)}</span>
          {triggerShortcutLabel ? <kbd>{triggerShortcutLabel}</kbd> : null}
        </button>
      ) : null}
      {liveRegion}
      {typeof document === "undefined"
        ? null
        : createPortal(dialog, document.body)}
    </>
  );
}
