import { matchSorter } from "match-sorter";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
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
      'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
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

type WorkspaceNavigatorActiveResolution = Readonly<{
  activeEntry: WorkspaceNavigatorEntry | null;
  activeOptionId: string | undefined;
  resolvedActiveIndex: number;
}>;

function resolveWorkspaceNavigatorActiveEntry(
  results: ReadonlyArray<WorkspaceNavigatorEntry>,
  requestedIndex: number,
  instanceId: string,
): WorkspaceNavigatorActiveResolution {
  if (results.length === 0) {
    return {
      activeEntry: null,
      activeOptionId: undefined,
      resolvedActiveIndex: -1,
    };
  }
  const resolvedActiveIndex = Math.min(requestedIndex, results.length - 1);
  const activeEntry = results[resolvedActiveIndex] ?? null;
  return {
    activeEntry,
    activeOptionId: activeEntry
      ? `${instanceId}-option-${resolvedActiveIndex}`
      : undefined,
    resolvedActiveIndex,
  };
}

function resolveVisibleWorkspaceNavigatorEntries(
  host: ReturnType<typeof useWorkspaceHost>,
  isOpen: boolean,
  mode: WorkspaceNavigatorMode,
  query: string,
): Array<WorkspaceNavigatorEntry> {
  return isOpen ? getWorkspaceNavigatorEntries(host, mode, query) : [];
}

function getWorkspaceNavigatorTriggerShortcut(
  defaultMode: WorkspaceNavigatorMode,
  findShortcutLabel: string | null,
  commandsShortcutLabel: string | null,
): string | null {
  return defaultMode === "find" ? findShortcutLabel : commandsShortcutLabel;
}

function getWorkspaceNavigatorLiveMessage(
  isOpen: boolean,
  statusMessage: string | null,
  liveSummary: string,
): string {
  return isOpen || statusMessage ? liveSummary : "";
}

function getWorkspaceNavigatorPlaceholder(
  mode: WorkspaceNavigatorMode,
): string {
  return mode === "find" ? "Search sections and parameters" : "Search commands";
}

function getWorkspaceNavigatorEmptyMessage(
  mode: WorkspaceNavigatorMode,
): string {
  return mode === "find"
    ? "No matching workspace entries."
    : "No matching commands.";
}

function WorkspaceNavigatorLiveRegion({
  message,
  workspaceScopeClassName,
}: {
  message: string;
  workspaceScopeClassName: string;
}) {
  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className={`${workspaceScopeClassName} setta-workspace-navigator-live`}
      role="status"
    >
      {message}
    </span>
  );
}

function WorkspaceNavigatorTrigger({
  className,
  defaultMode,
  onOpen,
  shortcutLabel,
  showTrigger,
  workspaceScopeClassName,
}: {
  className?: string;
  defaultMode: WorkspaceNavigatorMode;
  onOpen: () => void;
  shortcutLabel: string | null;
  showTrigger: boolean;
  workspaceScopeClassName: string;
}) {
  if (!showTrigger) {
    return null;
  }
  return (
    <button
      aria-label="Open workspace navigator"
      className={`${workspaceScopeClassName} setta-workspace-navigator-trigger${className ? ` ${className}` : ""}`}
      onClick={onOpen}
      type="button"
    >
      <FiSearch aria-hidden="true" focusable="false" />
      <span>{getNavigatorModeLabel(defaultMode)}</span>
      {shortcutLabel ? <kbd>{shortcutLabel}</kbd> : null}
    </button>
  );
}

function getWorkspaceNavigatorOptionIcon(
  entry: WorkspaceNavigatorEntry,
): ReactNode {
  if (entry.icon) {
    const Icon = entry.icon;
    return <Icon />;
  }
  return entry.kind === "command" ? <FiCommand /> : <FiSearch />;
}

function WorkspaceNavigatorOption({
  entry,
  instanceId,
  onActivate,
  onRegister,
  resultIndex,
  selected,
}: {
  entry: WorkspaceNavigatorEntry;
  instanceId: string;
  onActivate: (entry: WorkspaceNavigatorEntry) => void;
  onRegister: (entryId: string, element: HTMLElement | null) => void;
  resultIndex: number;
  selected: boolean;
}) {
  const reasonId = `${instanceId}-reason-${resultIndex}`;
  return (
    <button
      aria-describedby={entry.disabledReason ? reasonId : undefined}
      aria-disabled={entry.disabled || undefined}
      aria-selected={selected}
      className="setta-workspace-navigator-option"
      data-active={selected}
      data-disabled={entry.disabled}
      id={`${instanceId}-option-${resultIndex}`}
      onClick={() => onActivate(entry)}
      onMouseDown={(event) => event.preventDefault()}
      ref={(element) => onRegister(entry.id, element)}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span
        aria-hidden="true"
        className="setta-workspace-navigator-option-icon"
      >
        {getWorkspaceNavigatorOptionIcon(entry)}
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
    </button>
  );
}

function WorkspaceNavigatorResults({
  groups,
  instanceId,
  mode,
  onActivateEntry,
  onRegisterOption,
  resolvedActiveIndex,
  results,
}: {
  groups: ReadonlyArray<WorkspaceNavigatorEntryGroup>;
  instanceId: string;
  mode: WorkspaceNavigatorMode;
  onActivateEntry: (entry: WorkspaceNavigatorEntry) => void;
  onRegisterOption: (entryId: string, element: HTMLElement | null) => void;
  resolvedActiveIndex: number;
  results: ReadonlyArray<WorkspaceNavigatorEntry>;
}) {
  const listboxId = `${instanceId}-results`;
  return (
    <div
      aria-label={getNavigatorResultLabel(mode)}
      className="setta-workspace-navigator-results"
      id={listboxId}
      role="listbox"
    >
      {groups.length === 0 ? (
        <p className="setta-workspace-navigator-empty">
          {getWorkspaceNavigatorEmptyMessage(mode)}
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
              return (
                <WorkspaceNavigatorOption
                  entry={entry}
                  instanceId={instanceId}
                  key={entry.id}
                  onActivate={onActivateEntry}
                  onRegister={onRegisterOption}
                  resultIndex={resultIndex}
                  selected={resultIndex === resolvedActiveIndex}
                />
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

type WorkspaceNavigatorDialogProps = Readonly<{
  activeOptionId: string | undefined;
  ariaLabel: string;
  commandsShortcutLabel: string | null;
  dialogRef: RefObject<HTMLDivElement | null>;
  direction: "ltr" | "rtl" | undefined;
  findShortcutLabel: string | null;
  groups: ReadonlyArray<WorkspaceNavigatorEntryGroup>;
  inputRef: RefObject<HTMLInputElement | null>;
  instanceId: string;
  liveSummary: string;
  mode: WorkspaceNavigatorMode;
  onActivateEntry: (entry: WorkspaceNavigatorEntry) => void;
  onClose: () => void;
  onDialogKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onModeKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onQueryChange: (query: string) => void;
  onRegisterModeButton: (
    mode: WorkspaceNavigatorMode,
    element: HTMLButtonElement | null,
  ) => void;
  onRegisterOption: (entryId: string, element: HTMLElement | null) => void;
  onSetMode: (mode: WorkspaceNavigatorMode) => void;
  query: string;
  resolvedActiveIndex: number;
  results: ReadonlyArray<WorkspaceNavigatorEntry>;
  workspaceScopeClassName: string;
}>;

function WorkspaceNavigatorDialog({
  activeOptionId,
  ariaLabel,
  commandsShortcutLabel,
  dialogRef,
  direction,
  findShortcutLabel,
  groups,
  inputRef,
  instanceId,
  liveSummary,
  mode,
  onActivateEntry,
  onClose,
  onDialogKeyDown,
  onInputKeyDown,
  onModeKeyDown,
  onQueryChange,
  onRegisterModeButton,
  onRegisterOption,
  onSetMode,
  query,
  resolvedActiveIndex,
  results,
  workspaceScopeClassName,
}: WorkspaceNavigatorDialogProps) {
  const listboxId = `${instanceId}-results`;
  return (
    <div
      className={`${workspaceScopeClassName} setta-workspace-navigator-overlay`}
      data-workspace-navigator-overlay="true"
      dir={direction}
    >
      <button
        aria-label="Close workspace navigator"
        className="setta-workspace-navigator-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-describedby={`${instanceId}-summary`}
        aria-label={ariaLabel}
        aria-modal="true"
        className="setta-workspace-navigator-dialog"
        data-workspace-navigator-mode={mode}
        onKeyDown={onDialogKeyDown}
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
                  onClick={() => onSetMode(candidate)}
                  onKeyDown={onModeKeyDown}
                  ref={(element) => onRegisterModeButton(candidate, element)}
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
            onClick={onClose}
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
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              onKeyDown={onInputKeyDown}
              placeholder={getWorkspaceNavigatorPlaceholder(mode)}
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
          <WorkspaceNavigatorResults
            groups={groups}
            instanceId={instanceId}
            mode={mode}
            onActivateEntry={onActivateEntry}
            onRegisterOption={onRegisterOption}
            resolvedActiveIndex={resolvedActiveIndex}
            results={results}
          />
        </div>
      </div>
    </div>
  );
}

function WorkspaceNavigatorPortal({
  children,
  isOpen,
}: {
  children: ReactNode;
  isOpen: boolean;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
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
  const results = resolveVisibleWorkspaceNavigatorEntries(
    host,
    isOpen,
    mode,
    query,
  );
  const groups = groupWorkspaceNavigatorEntries(results);
  const { activeEntry, activeOptionId, resolvedActiveIndex } =
    resolveWorkspaceNavigatorActiveEntry(results, activeIndex, instanceId);
  const findShortcutLabel = getWorkspaceKeyBindingChordLabel(
    host,
    "workspace.open-find",
  );
  const commandsShortcutLabel = getWorkspaceKeyBindingChordLabel(
    host,
    "workspace.open-command-palette",
  );
  const triggerShortcutLabel = getWorkspaceNavigatorTriggerShortcut(
    defaultMode,
    findShortcutLabel,
    commandsShortcutLabel,
  );
  const liveSummary = getWorkspaceNavigatorSummary(
    mode,
    query,
    results.length,
    statusMessage,
  );
  const liveMessage = getWorkspaceNavigatorLiveMessage(
    isOpen,
    statusMessage,
    liveSummary,
  );

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

  function registerModeButton(
    candidate: WorkspaceNavigatorMode,
    element: HTMLButtonElement | null,
  ): void {
    if (element) {
      modeButtonRefs.current.set(candidate, element);
    } else {
      modeButtonRefs.current.delete(candidate);
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

  return (
    <>
      <WorkspaceNavigatorTrigger
        className={className}
        defaultMode={defaultMode}
        onOpen={() => openWorkspaceNavigator(host, defaultMode)}
        shortcutLabel={triggerShortcutLabel}
        showTrigger={showTrigger}
        workspaceScopeClassName={workspaceScopeClassName}
      />
      <WorkspaceNavigatorLiveRegion
        message={liveMessage}
        workspaceScopeClassName={workspaceScopeClassName}
      />
      <WorkspaceNavigatorPortal isOpen={isOpen}>
        <WorkspaceNavigatorDialog
          activeOptionId={activeOptionId}
          ariaLabel={ariaLabel}
          commandsShortcutLabel={commandsShortcutLabel}
          dialogRef={dialogRef}
          direction={opener ? getElementTextDirection(opener) : undefined}
          findShortcutLabel={findShortcutLabel}
          groups={groups}
          inputRef={inputRef}
          instanceId={instanceId}
          liveSummary={liveSummary}
          mode={mode}
          onActivateEntry={activateEntry}
          onClose={() => closeWorkspaceNavigator(host)}
          onDialogKeyDown={handleDialogKeyDown}
          onInputKeyDown={handleInputKeyDown}
          onModeKeyDown={handleModeTabKeyDown}
          onQueryChange={(nextQuery) =>
            setWorkspaceNavigatorQuery(host, nextQuery)
          }
          onRegisterModeButton={registerModeButton}
          onRegisterOption={registerOption}
          onSetMode={(nextMode) => setWorkspaceNavigatorMode(host, nextMode)}
          query={query}
          resolvedActiveIndex={resolvedActiveIndex}
          results={results}
          workspaceScopeClassName={workspaceScopeClassName}
        />
      </WorkspaceNavigatorPortal>
    </>
  );
}
