import type {
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  WorkstreamStatus,
} from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  LoaderCircle,
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

const statusGlyphs = {
  archived: { Icon: Circle, size: 12 },
  awaiting_approval: { Icon: AlertTriangle, size: 14 },
  awaiting_resource: { Icon: AlertTriangle, size: 14 },
  blocked: { Icon: AlertTriangle, size: 14 },
  completed: { Icon: Check, size: 14 },
  failed: { Icon: X, size: 14 },
  idle: { Icon: Circle, size: 12 },
  queued: { Icon: Square, size: 13 },
  running: { Icon: LoaderCircle, size: 14 },
} as const satisfies Record<WorkstreamStatus, { Icon: LucideIcon; size: number }>;

export function CommandCenterTopBar({
  dispatch,
  onToggleRail,
  onOpenSettingsPage,
  platform,
  railVisibility,
  snapshot,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
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
  const selectedStatus = navigation.selected?.workstream.status ?? "idle";
  const workstreamStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    centerSelectedWorkstreamDot(workstreamStripRef.current);
  }, [snapshot?.selectedWorkstreamId, snapshot?.workstreams]);
  return (
    <nav aria-label="Workstreams" className="director-workstream-nav app-no-drag">
      <IconButton
        label="Previous workstream"
        onClick={() => dispatchDirectorIntent(dispatch, moveSelectionIntent("previous"))}
      >
        <ChevronLeft aria-hidden="true" size={16} />
      </IconButton>
      <div className="director-workstream-selector">
        <div className="director-workstream-title">
          <span>{navigation.selected?.workstream.title ?? "Setta"}</span>
          <span>
            {directorWorkstreamStatusLabels[selectedStatus]}
            {navigation.counter ? ` ${navigation.counter}` : ""}
          </span>
        </div>
        <div
          aria-label="Visible workstreams"
          className="director-workstream-strip"
          ref={workstreamStripRef}
          role="list"
        >
          {navigation.visibleEntries.map((item) => (
            <WorkstreamDot
              dispatch={dispatch}
              entry={item.entry}
              key={item.entry.workstream.id}
              selectedWorkstreamId={snapshot?.selectedWorkstreamId ?? null}
            />
          ))}
        </div>
      </div>
      <IconButton
        label="Next workstream"
        onClick={() => dispatchDirectorIntent(dispatch, moveSelectionIntent("next"))}
      >
        <ChevronRight aria-hidden="true" size={16} />
      </IconButton>
    </nav>
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
  return (
    <span role="listitem">
      <button
        aria-current={workstream.id === selectedWorkstreamId ? "page" : undefined}
        aria-label={`Select ${workstream.title}, ${directorWorkstreamStatusLabels[workstream.status]}`}
        className="director-workstream-dot"
        data-status={workstream.status}
        data-workstream-id={workstream.id}
        onClick={() => dispatchDirectorIntent(dispatch, selectWorkstreamIntent(workstream.id))}
        type="button"
      >
        <StatusGlyph status={workstream.status} />
      </button>
    </span>
  );
}

function DirectorRailControls({
  onOpenSettingsPage,
  onToggleRail,
  railVisibility,
}: {
  onOpenSettingsPage: () => void;
  onToggleRail: (rail: DirectorRailName, trigger: HTMLButtonElement) => void;
  railVisibility: DirectorRailVisibility;
}) {
  return (
    <div aria-label="View controls" className="director-command-center-view-controls app-no-drag">
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

export function StatusGlyph({ status }: { status: WorkstreamStatus }) {
  const { Icon, size } = statusGlyphs[status];
  return (
    <Icon
      aria-hidden="true"
      className={
        status === "running" ? "director-status-icon director-spinner" : "director-status-icon"
      }
      size={size}
    />
  );
}

function selectWorkstreamIntent(workstreamId: string): DirectorIntent {
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
  const windowed = visibleWorkstreamEntries(entries, selectedIndex);
  const selected = entries[selectedIndex] ?? null;
  const total = snapshot.aggregates.workstreamCount;
  const counter = workstreamNavigationCounter(snapshot, selectedIndex, total);
  return { counter, selected, selectedIndex, total, visibleEntries: windowed };
}

export function directorWorkstreamKeyboardDirection({
  altKey,
  ctrlKey,
  key,
  metaKey,
  targetIsEditable,
}: DirectorKeyboardNavigationInput): DirectorKeyboardDirection | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return null;
  }
  if (targetIsEditable && !altKey && !ctrlKey && !metaKey) {
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
  expanded,
  label,
  onClick,
}: {
  children: ReactNode;
  controls?: string;
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
    selectedIndex: 0,
    total: 0,
    visibleEntries: [],
  };
}

function selectedWorkstreamIndex(
  entries: readonly DirectorWorkstreamEntry[],
  selectedWorkstreamId: string | null,
): number {
  return Math.max(
    entries.findIndex((entry) => entry.workstream.id === selectedWorkstreamId),
    0,
  );
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
