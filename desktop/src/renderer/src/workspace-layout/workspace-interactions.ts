import type { WorkspaceBrowserViewKeyEvent } from "@shared/types";
import type { AppearanceShortcutsSettings } from "@generated/backend";

import type { FrameScheduler } from "./frame-scheduler";
import type { WorkspaceRuntime } from "./workspace-runtime";
import { openPaneActionForSurfaceKind, openPaneActions } from "./workspace-toolbar";
import { visiblePaneHostForPane } from "./pane-drag-reorder";
import { paneFocusTargetFromClick } from "./pane-focus-click";
import { eventTargetsTerminalSurface } from "./terminal-surface-utils";
import {
  interpretWorkspaceTrackpadWheel,
  paneTopBarPaneIdFromWheelTarget,
  wheelTargetIsAppTitleBar,
} from "./trackpad-navigation";
import type { createWorkspaceTrackpadNavigationState } from "./trackpad-navigation";
import {
  isTerminalSafeWorkspaceArrowNavigationShortcut,
  isWorkspaceArrowNavigationShortcut,
  workspaceShortcutModifierMatches,
  workspaceArrowDirection,
} from "./workspace-shortcuts";
import type { Rect } from "./types";

type PaneChromeAction = "add-above" | "add-below" | "close" | "maximize" | "split-down";

export function handleWorkspaceClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): void {
  if (runtime.mode !== "workspace" || !(event.target instanceof Element)) {
    return;
  }
  if (
    handlePaneChromeActionClick({
      event,
      runLayoutAction,
      runtime,
      scheduler,
      viewportProvider,
    })
  ) {
    return;
  }
  if (runtime.store.getSnapshot().presentationMode === "overview") {
    return;
  }
  if (handleEmptyFrameActionClick({ event, runLayoutAction, runtime, scheduler })) {
    return;
  }
  handlePaneChromeFocusClick({ event, runLayoutAction, runtime, scheduler, viewportProvider });
}

export function eventTargetsPaneChromeAction(event: PointerEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-workspace-pane-action]") instanceof HTMLButtonElement
  );
}

export function eventTargetsWorkspaceWheelNavigation(
  event: WheelEvent,
  root: HTMLElement,
): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  return root.contains(event.target) || wheelTargetIsAppTitleBar(event.target);
}

function handleEmptyFrameActionClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
}): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const button = event.target.closest<HTMLButtonElement>(
    '[data-workspace-empty-frame-action="true"]',
  );
  const paneId = emptyFrameHostPaneId(button);
  const action = openPaneActionForSurfaceKind(button?.dataset.surfaceKind ?? "");
  if (!button || !paneId || !action || !runtime.store.canOpenPane(action.request)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  runLayoutAction(() => runtime.store.configurePane(paneId, action.request));
  return true;
}

function emptyFrameHostPaneId(button: HTMLButtonElement | null): string | null {
  const host = button?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
  return host?.dataset.paneId ?? null;
}

function handlePaneChromeActionClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const button = event.target.closest<HTMLButtonElement>("[data-workspace-pane-action]");
  const action = paneChromeActionFromButton(button);
  const paneId = paneChromeActionButtonPaneId(button);
  if (!button || !action || !paneId) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  runPaneChromeAction({ action, paneId, runLayoutAction, runtime, viewportProvider });
  return true;
}

function paneChromeActionButtonPaneId(button: HTMLButtonElement | null): string | null {
  const host = button?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
  return button?.dataset.paneId ?? host?.dataset.paneId ?? null;
}

function paneChromeActionFromButton(button: HTMLButtonElement | null): PaneChromeAction | null {
  const action = button?.dataset.workspacePaneAction;
  switch (action) {
    case "add-above":
    case "add-below":
    case "close":
    case "maximize":
    case "split-down":
      return action;
    case undefined:
    default:
      return null;
  }
}

function runPaneChromeAction({
  action,
  paneId,
  runLayoutAction,
  runtime,
  viewportProvider,
}: {
  action: PaneChromeAction;
  paneId: string;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  viewportProvider: () => Rect;
}): void {
  switch (action) {
    case "add-above":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPaneToPlane("up");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "add-below":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPaneToPlane("down");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "close":
      closePaneWithConfirmation({ paneId, runLayoutAction, runtime, viewportProvider });
      return;
    case "maximize":
      runLayoutAction(() => {
        runtime.store.togglePaneMaximized(paneId);
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    case "split-down":
      runLayoutAction(() => {
        if (!runtime.store.focusPane(paneId)) {
          return;
        }
        runtime.store.splitFocusedPane("down");
        runtime.store.ensureFocusedPaneVisible(viewportProvider());
      });
      return;
    default:
      assertNever(action);
  }
}

function handlePaneChromeFocusClick({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: MouseEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): boolean {
  const paneId = paneFocusTargetFromClick(event);
  if (!paneId || paneId === runtime.store.focusedPaneId()) {
    return false;
  }
  scheduler.pauseBenchmark();
  runLayoutAction(() => {
    if (runtime.store.focusPane(paneId)) {
      runtime.store.ensureFocusedPaneVisible(viewportProvider());
    }
  });
  return true;
}

export function handleWorkspaceKeyDown({
  event,
  persistLayout,
  runLayoutAction,
  runtime,
  scheduler,
  shortcuts,
  viewportProvider,
}: {
  event: KeyboardEvent;
  persistLayout: () => void;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  shortcuts?: AppearanceShortcutsSettings;
  viewportProvider: () => Rect;
}): void {
  if (
    eventTargetsTerminalSurface(event) &&
    !isTerminalSafeWorkspaceArrowNavigationShortcut(event, shortcuts)
  ) {
    return;
  }
  handleWorkspaceKeyAction({
    event,
    persistLayout,
    runLayoutAction,
    runtime,
    scheduler,
    shortcuts,
    viewportProvider,
  });
}

interface WorkspaceKeyEvent {
  altKey: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey: boolean;
  preventDefault(): void;
  shiftKey: boolean;
}

export function handleForwardedBrowserViewKey({
  event,
  persistLayout,
  runLayoutAction,
  runtime,
  scheduler,
  shortcuts,
  viewportProvider,
}: {
  event: WorkspaceBrowserViewKeyEvent;
  persistLayout: () => void;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  shortcuts?: AppearanceShortcutsSettings;
  viewportProvider: () => Rect;
}): void {
  handleWorkspaceKeyAction({
    event: {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      key: event.key,
      metaKey: event.metaKey,
      preventDefault() {},
      shiftKey: event.shiftKey,
    },
    persistLayout,
    runLayoutAction,
    runtime,
    scheduler,
    shortcuts,
    viewportProvider,
  });
}

function handleWorkspaceKeyAction({
  event,
  persistLayout,
  runLayoutAction,
  runtime,
  scheduler,
  shortcuts,
  viewportProvider,
}: {
  event: WorkspaceKeyEvent;
  persistLayout: () => void;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  shortcuts?: AppearanceShortcutsSettings;
  viewportProvider: () => Rect;
}): void {
  if (!isArrowKey(event.key)) {
    handleWorkspaceCommandKey({ event, runLayoutAction, runtime, shortcuts });
    return;
  }
  if (!isWorkspaceArrowNavigationShortcut(event, shortcuts)) {
    return;
  }
  event.preventDefault();
  scheduler.pauseBenchmark();
  if (event.shiftKey) {
    runLayoutAction(() => runtime.store.moveFocusedPane(workspaceArrowDirection(event.key)));
    return;
  }
  runtime.store.moveFocus(workspaceArrowDirection(event.key), viewportProvider());
  persistLayout();
}

function handleWorkspaceCommandKey({
  event,
  runLayoutAction,
  runtime,
  shortcuts,
}: {
  event: WorkspaceKeyEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  shortcuts?: AppearanceShortcutsSettings;
}): void {
  const handlers = [
    handleNewEmptyFrameCommand,
    handleSplitFocusedPaneToPlaneCommand,
    handleSplitFocusedPaneCommand,
    handleOpenPaneShortcutCommand,
    handleToggleOverviewCommand,
    handleCloseFocusedPaneCommand,
  ];
  for (const handler of handlers) {
    if (handler({ event, runLayoutAction, runtime, shortcuts })) {
      return;
    }
  }
}

type WorkspaceCommandHandler = (context: {
  event: WorkspaceKeyEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  shortcuts?: AppearanceShortcutsSettings;
}) => boolean;

const handleNewEmptyFrameCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.key.toLowerCase() !== "n") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.openEmptyFrame());
  return true;
};

const handleSplitFocusedPaneCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.altKey || event.key !== "Enter") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.splitFocusedPane(event.shiftKey ? "down" : "right"));
  return true;
};

const handleSplitFocusedPaneToPlaneCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
  shortcuts,
}) => {
  if (event.key !== "Enter" || !workspaceShortcutModifierMatches(event, shortcuts)) {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.splitFocusedPaneToPlane(event.shiftKey ? "up" : "down"));
  return true;
};

const handleOpenPaneShortcutCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || !event.altKey) {
    return false;
  }
  const action = openPaneActions.find(
    (candidate) => candidate.shortcutKey === event.key.toLowerCase(),
  );
  if (!action) {
    return false;
  }
  event.preventDefault();
  if (runtime.store.canOpenPane(action.request)) {
    runLayoutAction(() => runtime.store.openPane(action.request));
  }
  return true;
};

const handleToggleOverviewCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || event.key.toLowerCase() !== "o") {
    return false;
  }
  event.preventDefault();
  runLayoutAction(() => runtime.store.toggleOverviewMode());
  return true;
};

const handleCloseFocusedPaneCommand: WorkspaceCommandHandler = ({
  event,
  runLayoutAction,
  runtime,
}) => {
  if (!event.metaKey || !isClosePaneKey(event.key)) {
    return false;
  }
  event.preventDefault();
  const focusedPaneId = runtime.store.focusedPaneId();
  closePaneWithConfirmation({ paneId: focusedPaneId, runLayoutAction, runtime });
  return true;
};

function isClosePaneKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

function closePaneWithConfirmation({
  paneId,
  runLayoutAction,
  runtime,
  viewportProvider,
}: {
  paneId: string;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  viewportProvider?: () => Rect;
}): void {
  const pane = runtime.store.toScene().paneById.get(paneId);
  if (
    pane?.surfaceKind === "terminal" &&
    terminalPaneCloseRequiresConfirmation(paneId) &&
    !window.confirm("Close running terminal session?")
  ) {
    return;
  }
  runLayoutAction(() => {
    if (!runtime.store.focusPane(paneId)) {
      return;
    }
    runtime.store.closeFocusedPane();
    if (viewportProvider) {
      runtime.store.ensureFocusedPaneVisible(viewportProvider());
    }
  });
}

function terminalPaneCloseRequiresConfirmation(paneId: string): boolean {
  const host = visiblePaneHostForPane(paneId);
  const sessionId = host?.dataset.terminalSessionId ?? "";
  if (sessionId === "") {
    return false;
  }
  const status = host?.dataset.terminalStatus ?? "";
  return status === "" || status === "running" || status === "starting";
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}

export function handleWorkspaceWheel({
  event,
  persistLayout,
  runtime,
  scheduler,
  state,
  viewportProvider,
}: {
  event: WheelEvent;
  persistLayout: () => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  state: ReturnType<typeof createWorkspaceTrackpadNavigationState>;
  viewportProvider: () => Rect;
}): void {
  const presentationMode = runtime.store.getSnapshot().presentationMode;
  const topBarPaneId = paneTopBarPaneIdFromWheelTarget(event.target);
  const appTitleBarTargeted = wheelTargetIsAppTitleBar(event.target);
  const result = interpretWorkspaceTrackpadWheel(
    {
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      modifierRequired:
        presentationMode !== "overview" && topBarPaneId === null && !appTitleBarTargeted,
      timeStampMs: event.timeStamp,
    },
    state,
  );
  if (!result.shouldHandle) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (result.directions.length === 0) {
    return;
  }

  scheduler.pauseBenchmark();
  for (const direction of result.directions) {
    if (topBarPaneId && presentationMode === "normal") {
      runtime.store.moveFocusFromPane(topBarPaneId, direction, viewportProvider());
      continue;
    }
    runtime.store.moveFocus(direction, viewportProvider());
  }
  persistLayout();
}

function isArrowKey(key: string): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}
