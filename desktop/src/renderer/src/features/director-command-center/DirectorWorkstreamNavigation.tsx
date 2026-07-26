import type {
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  Workstream,
  WorkstreamStatus,
} from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  FolderPlus,
  PanelLeft,
  PanelRight,
  Settings,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useAppWindowDragHandlers } from "../../app-window-drag";
import { SettaLogoMark } from "../../components/setta-logo-mark";
import { directorFocus, directorFocusFolder, type DirectorFocus } from "./director-focus";
import { directorWorkstreamStatusLabels } from "./director-workstream-status";

export interface DirectorRailVisibility {
  readonly artifacts: boolean;
  readonly now: boolean;
}

type DirectorRailName = keyof DirectorRailVisibility;
type DirectorKeyboardDirection = "next" | "previous";

interface DirectorKeyboardNavigationInput {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly targetIsEditable: boolean;
}

const maxVisibleWorkstreamDots = 19;
const unwindowedWorkstreamLimit = 24;

/*
 * Running is a pulse, not a spinner.
 *
 * A rotating loader is a busy indicator from a different design language — it
 * says "wait" — and the command center's language is luminous dots that
 * breathe. The mockup has no spinner anywhere; work in progress is a filled
 * dot that fades and glows.
 */
const statusGlyphs = {
  archived: { Icon: Circle, size: 12 },
  awaiting_approval: { Icon: AlertTriangle, size: 14 },
  awaiting_resource: { Icon: AlertTriangle, size: 14 },
  blocked: { Icon: AlertTriangle, size: 14 },
  completed: { Icon: Check, size: 14 },
  failed: { Icon: X, size: 14 },
  idle: { Icon: Circle, size: 12 },
  queued: { Icon: Square, size: 13 },
  running: { Icon: Circle, size: 12 },
} as const satisfies Record<WorkstreamStatus, { Icon: LucideIcon; size: number }>;

export function CommandCenterTopBar({
  dispatch,
  onStartWorkstream,
  onToggleRail,
  onOpenSettingsPage,
  platform,
  railVisibility,
  snapshot,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  onStartWorkstream: () => void;
  onToggleRail: (rail: DirectorRailName, trigger: HTMLButtonElement) => void;
  onOpenSettingsPage: () => void;
  platform: DesktopPlatform;
  railVisibility: DirectorRailVisibility;
  snapshot: DirectorSnapshot | null;
}) {
  const windowDragHandlers = useAppWindowDragHandlers();
  return (
    <header
      className="director-command-center-top app-drag"
      data-desktop-platform={platform}
      data-setta-shell-title-bar="true"
      data-testid="director-command-center-top-bar"
      {...windowDragHandlers}
    >
      <div aria-hidden="true" className="director-command-center-chrome-shield app-no-drag" />
      <div className="director-command-center-brand">
        <SettaLogoMark height={13} />
      </div>
      <WorkstreamNavigation dispatch={dispatch} snapshot={snapshot} />
      <DirectorRailControls
        onOpenSettingsPage={onOpenSettingsPage}
        onStartWorkstream={onStartWorkstream}
        onToggleRail={onToggleRail}
        railVisibility={railVisibility}
      />
    </header>
  );
}

function WorkstreamNavigation({
  dispatch,
  snapshot,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  snapshot: DirectorSnapshot | null;
}) {
  const navigation = directorWorkstreamNavigation(snapshot);
  const focus = directorFocus(navigation.selected?.workstream ?? null);
  const canMoveSelection = workstreamSelectionCanMove(navigation);
  const workstreamStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    centerSelectedWorkstreamDot(workstreamStripRef.current);
  }, [snapshot?.selectedWorkstreamId, snapshot?.workstreams]);
  return (
    <nav aria-label="Workstreams" className="director-workstream-nav app-no-drag">
      <IconButton
        disabled={!canMoveSelection}
        label="Previous workstream"
        onClick={() => dispatchDirectorIntent(dispatch, moveSelectionIntent("previous"))}
      >
        <ChevronLeft aria-hidden="true" size={16} />
      </IconButton>
      <div className="director-workstream-selector">
        <WorkstreamNavigationTitle counter={navigation.counter} focus={focus} />
        {/*
         * A strip of one is not a navigator. With a single workstream the dot
         * has nothing to switch between, and it read as an unexplained glyph
         * floating under the title — the status it carries is already the
         * word beside the title.
         */}
        {navigation.visibleEntries.length > 0 ? (
          <div
            aria-label="Views"
            className="director-workstream-strip"
            ref={workstreamStripRef}
            role="list"
          >
            <span role="listitem">
              <button
                aria-current={focus.kind === "director" ? "page" : undefined}
                aria-label="Select the Director"
                className="director-workstream-dot director-view-dot"
                data-view="director"
                onClick={() => dispatchDirectorIntent(dispatch, selectViewIntent(null))}
                title="Director — every workstream at once"
                type="button"
              />
            </span>
            <span aria-hidden="true" className="director-strip-separator" />
            {navigation.visibleEntries.map((item) => (
              <WorkstreamDot
                dispatch={dispatch}
                entry={item.entry}
                key={item.entry.workstream.id}
                selectedWorkstreamId={selectedWorkstreamID(snapshot)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <IconButton
        disabled={!canMoveSelection}
        label="Next workstream"
        onClick={() => dispatchDirectorIntent(dispatch, moveSelectionIntent("next"))}
      >
        <ChevronRight aria-hidden="true" size={16} />
      </IconButton>
    </nav>
  );
}

function workstreamSelectionCanMove(
  navigation: ReturnType<typeof directorWorkstreamNavigation>,
): boolean {
  if (navigation.total > 1) {
    return true;
  }
  return navigation.total === 1 && navigation.selected === null;
}

function selectedWorkstreamID(snapshot: DirectorSnapshot | null): string | null {
  return snapshot === null ? null : snapshot.selectedWorkstreamId;
}

function WorkstreamNavigationTitle({
  counter,
  focus,
}: {
  counter: string | null;
  focus: DirectorFocus;
}) {
  return (
    <div className="director-workstream-title" data-focus={focus.kind}>
      {focus.kind === "director" ? <span aria-hidden="true" className="director-role-dot" /> : null}
      <h1 className="director-focus-title">{focus.title}</h1>
      <span className="director-focus-meta">
        {/*
         * The status is its own element because it is the top bar's only
         * changing fact, and the Now rail no longer restates it.
         *
         * The folder is not here. It never changes while a workstream is
         * selected, so it spent bar width on a constant — and every workstream
         * dot's accessible name and tooltip already name it.
         */}
        <span className="director-focus-status">{focusMetaLabel(focus)}</span>
        {counter === null ? "" : ` ${counter}`}
      </span>
    </div>
  );
}

function WorkstreamDot({
  dispatch,
  entry,
  selectedWorkstreamId,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  entry: DirectorWorkstreamEntry;
  selectedWorkstreamId: string | null;
}) {
  const workstream = entry.workstream;
  const labels = workstreamDotLabels(workstream);
  return (
    <span role="listitem">
      <button
        aria-current={workstream.id === selectedWorkstreamId ? "page" : undefined}
        aria-label={labels.accessibleName}
        className="director-workstream-dot"
        data-status={workstream.status}
        data-workstream-id={workstream.id}
        onClick={() => dispatchDirectorIntent(dispatch, selectViewIntent(workstream.id))}
        title={labels.tooltip}
        type="button"
      >
        <StatusGlyph status={workstream.status} />
      </button>
    </span>
  );
}

/**
 * A dot is only meaningful if it says what it selects. Hovering or reading one
 * names the workstream, what it is doing, and the folder it does it in.
 */
function workstreamDotLabels(workstream: Workstream): {
  accessibleName: string;
  tooltip: string;
} {
  const folder = directorFocusFolder(workstream.resourceScope);
  const status = directorWorkstreamStatusLabels[workstream.status];
  return {
    accessibleName: `Select ${workstream.title}, ${status}, ${folder.label}`,
    tooltip: `${workstream.title} — ${status} · ${folder.label}`,
  };
}

function focusMetaLabel(focus: DirectorFocus): string {
  return focus.kind === "director" ? focus.roleLabel : focus.statusLabel;
}

function DirectorRailControls({
  onOpenSettingsPage,
  onStartWorkstream,
  onToggleRail,
  railVisibility,
}: {
  onOpenSettingsPage: () => void;
  onStartWorkstream: () => void;
  onToggleRail: (rail: DirectorRailName, trigger: HTMLButtonElement) => void;
  railVisibility: DirectorRailVisibility;
}) {
  return (
    <div
      aria-label="View controls"
      className="director-command-center-view-controls app-no-drag"
      role="group"
    >
      {/*
       * Starting work in a folder is a way in, not something the Director is
       * waiting on, so it belongs with the other view-level controls rather
       * than as a panel stacked over the composer.
       */}
      <IconButton label="Start a workstream in a folder" onClick={onStartWorkstream}>
        <FolderPlus aria-hidden="true" size={16} />
      </IconButton>
      <IconButton
        controls="director-now-rail"
        expanded={railVisibility.now}
        label={railVisibility.now ? "Hide Now rail" : "Show Now rail"}
        onClick={(trigger) => onToggleRail("now", trigger)}
      >
        <PanelLeft aria-hidden="true" size={16} />
      </IconButton>
      <IconButton
        controls="director-artifacts-rail"
        expanded={railVisibility.artifacts}
        label={railVisibility.artifacts ? "Hide Artifacts rail" : "Show Artifacts rail"}
        onClick={(trigger) => onToggleRail("artifacts", trigger)}
      >
        <PanelRight aria-hidden="true" size={16} />
      </IconButton>
      <IconButton label="Open settings" onClick={onOpenSettingsPage}>
        <Settings aria-hidden="true" size={16} />
      </IconButton>
    </div>
  );
}

function StatusGlyph({ status }: { status: WorkstreamStatus }) {
  const { Icon, size } = statusGlyphs[status];
  return (
    <Icon
      aria-hidden="true"
      className={
        status === "running" ? "director-status-icon director-pulse" : "director-status-icon"
      }
      size={size}
    />
  );
}

/*
 * Selecting a view. A null workstream is the Director's own, which is what the
 * strip's first destination selects.
 */
function selectViewIntent(workstreamId: string | null): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
    kind: "select_workstream",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: { workstreamId },
    submit: null,
  };
}

export function moveSelectionIntent(direction: "previous" | "next"): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
    kind: "move_selection",
    moveSelection: { direction },
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: null,
  };
}

export function directorWorkstreamNavigation(snapshot: DirectorSnapshot | null) {
  if (snapshot === null) {
    return emptyWorkstreamNavigation();
  }
  const entries = snapshot.workstreams;
  const selectedIndex = selectedWorkstreamIndex(entries, snapshot.selectedWorkstreamId);
  const windowed = visibleWorkstreamEntries(entries, Math.max(selectedIndex, 0));
  const selected = selectedIndex < 0 ? null : (entries[selectedIndex] ?? null);
  const total = snapshot.aggregates.workstreamCount;
  const counter = workstreamNavigationCounter(snapshot, selectedIndex, total);
  return { counter, selected, selectedIndex, total, visibleEntries: windowed };
}

export function directorWorkstreamKeyboardDirection({
  key,
  targetIsEditable,
}: DirectorKeyboardNavigationInput): DirectorKeyboardDirection | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return null;
  }
  if (targetIsEditable) {
    return null;
  }
  return key === "ArrowLeft" ? "previous" : "next";
}

function dispatchDirectorIntent(
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>,
  intent: DirectorIntent,
): void {
  void dispatch(intent).catch(() => {});
}

function IconButton({
  children,
  controls,
  disabled,
  expanded,
  label,
  onClick,
}: {
  children: ReactNode;
  controls?: string;
  disabled?: boolean;
  expanded?: boolean;
  label: string;
  onClick: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      className="director-icon-button"
      disabled={disabled}
      onClick={(event) => onClick(event.currentTarget)}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function windowWorkstreamEntries(
  entries: readonly DirectorWorkstreamEntry[],
  selectedIndex: number,
) {
  const half = Math.floor(maxVisibleWorkstreamDots / 2);
  const start = Math.max(
    0,
    Math.min(selectedIndex - half, entries.length - maxVisibleWorkstreamDots),
  );
  return entries.slice(start, start + maxVisibleWorkstreamDots).map((entry, index) => ({
    entry,
    position: start + index + 1,
  }));
}

function emptyWorkstreamNavigation() {
  return {
    counter: null,
    selected: null,
    selectedIndex: -1,
    total: 0,
    visibleEntries: [],
  };
}

function selectedWorkstreamIndex(
  entries: readonly DirectorWorkstreamEntry[],
  selectedWorkstreamId: string | null,
): number {
  return entries.findIndex((entry) => entry.workstream.id === selectedWorkstreamId);
}

function visibleWorkstreamEntries(
  entries: readonly DirectorWorkstreamEntry[],
  selectedIndex: number,
) {
  if (entries.length > unwindowedWorkstreamLimit) {
    return windowWorkstreamEntries(entries, selectedIndex);
  }
  return entries.map((entry, index) => ({ entry, position: index + 1 }));
}

function workstreamNavigationCounter(
  snapshot: DirectorSnapshot,
  selectedIndex: number,
  total: number,
): string | null {
  if (snapshot.workstreams.length <= unwindowedWorkstreamLimit && !snapshot.hasMoreWorkstreams) {
    return null;
  }
  if (snapshot.hasMoreWorkstreams) {
    return `${total} total`;
  }
  if (selectedIndex < 0) {
    return `${total} total`;
  }
  return `${Math.min(selectedIndex + 1, total)}/${total}`;
}

function centerSelectedWorkstreamDot(strip: HTMLDivElement | null): void {
  if (strip === null) {
    return;
  }
  const selected = strip.querySelector<HTMLElement>('[aria-current="page"]');
  if (selected === null) {
    return;
  }
  const centered = selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2;
  const maximum = Math.max(0, strip.scrollWidth - strip.clientWidth);
  strip.scrollLeft = Math.max(0, Math.min(centered, maximum));
}
