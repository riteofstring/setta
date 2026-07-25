import type { WorkspaceBrowserViewKeyEvent } from "@shared/types";
import type { AppearanceShortcutsSettings } from "@generated/backend";

import type { FrameScheduler } from "./frame-scheduler";
import type { WorkspaceRuntime } from "./workspace-runtime";
import { workspaceFrameActionById, workspaceFrameActions } from "./workspace-toolbar";
import {
  executeWorkspaceFrameAction,
  workspaceFrameActionAllowed,
} from "./workspace-frame-actions";
import {
  classifyOverviewWheel,
  overviewWheelZoomFactor,
  wheelDeltaModePixelFactor,
} from "./overview-wheel-gesture";
import { paneFocusTargetFromClick } from "./pane-focus-click";
import {
  interpretWorkspaceTrackpadWheel,
  workspaceWheelNavigationTargetFromEventTarget,
} from "./trackpad-navigation";
import type { createWorkspaceTrackpadNavigationState } from "./trackpad-navigation";
import {
  isWorkspaceArrowNavigationShortcut,
  workspaceShortcutModifierMatches,
  workspaceArrowDirection,
} from "./workspace-shortcuts";
import type { Rect, SurfacePaneCloseResult } from "./types";

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
  if (eventTargetsPaneInteractiveControl(event)) {
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

export function handleWorkspacePaneFocusPointerDown({
  event,
  runLayoutAction,
  runtime,
  scheduler,
  viewportProvider,
}: {
  event: PointerEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): void {
  if (
    event.button !== 0 ||
    runtime.mode !== "workspace" ||
    runtime.store.getSnapshot().presentationMode === "overview" ||
    eventTargetsPaneInteractiveControl(event)
  ) {
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

export function eventTargetsPaneInteractiveControl(event: MouseEvent | PointerEvent): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const selector = '[data-workspace-pane-interactive-control="true"]';
  if (event.target.closest(selector)) {
    return true;
  }
  return Boolean(
    event.target.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest(selector),
  );
}

export function eventTargetsWorkspaceWheelNavigation(
  event: WheelEvent,
  root: HTMLElement,
): boolean {
  return workspaceWheelNavigationTargetFromEventTarget(event.target, root) !== null;
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
  const action = workspaceFrameActionById(button?.dataset.workspaceFrameActionId ?? "");
  if (!button || !paneId || !action || !workspaceFrameActionAllowed(runtime.store, action.action)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  void executeWorkspaceFrameAction({
    action: action.action,
    placement: { kind: "empty-frame", paneId },
    runLayoutAction,
    runtime,
  });
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
      void closePaneWithConfirmation({ paneId, runLayoutAction, runtime, viewportProvider });
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
  event: MouseEvent | PointerEvent;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  viewportProvider: () => Rect;
}): boolean {
  const focusTarget = paneFocusTargetFromClick(event);
  if (!focusTarget) {
    return false;
  }
  if (!focusTarget.reveal && focusTarget.paneId === runtime.store.focusedPaneId()) {
    return false;
  }
  scheduler.pauseBenchmark();
  runLayoutAction(() => {
    if (!focusTarget.reveal) {
      runtime.store.focusPaneWithoutReveal(focusTarget.paneId);
      return;
    }
    if (runtime.store.focusPane(focusTarget.paneId)) {
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
  const action = workspaceFrameActions.find(
    (candidate) => candidate.shortcutKey === event.key.toLowerCase(),
  );
  if (!action) {
    return false;
  }
  event.preventDefault();
  if (workspaceFrameActionAllowed(runtime.store, action.action)) {
    void executeWorkspaceFrameAction({
      action: action.action,
      placement: { kind: "new-pane" },
      runLayoutAction,
      runtime,
    });
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
  void closePaneWithConfirmation({ paneId: focusedPaneId, runLayoutAction, runtime });
  return true;
};

function isClosePaneKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

async function closePaneWithConfirmation({
  paneId,
  runLayoutAction,
  runtime,
  viewportProvider,
}: {
  paneId: string;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  viewportProvider?: () => Rect;
}): Promise<void> {
  const pane = runtime.store.toScene().paneById.get(paneId);
  if (!pane) {
    return;
  }
  let closeResult: SurfacePaneCloseResult;
  try {
    const adapter = runtime.surfaceRegistry.adapterFor(pane.surfaceId);
    closeResult = (await adapter.requestPaneClose?.({
      confirm: (message) => window.confirm(message),
    })) ?? { removePane: true };
  } catch (error) {
    console.error("workspace pane close failed", error);
    return;
  }
  if (!closeResult.removePane) {
    return;
  }
  runLayoutAction(() => {
    if (!runtime.store.focusPane(paneId)) {
      return;
    }
    runtime.store.closeFocusedPaneOrClearLastPane();
    if (viewportProvider) {
      runtime.store.ensureFocusedPaneVisible(viewportProvider());
    }
  });
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}

export function handleWorkspaceWheel({
  event,
  persistLayout,
  root,
  runtime,
  scheduler,
  stage,
  state,
  viewportProvider,
}: {
  event: WheelEvent;
  persistLayout: () => void;
  root: HTMLElement;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  // The presentation stage, whose screen origin maps the cursor into the
  // viewport coordinate space used for overview zoom-to-cursor.
  stage: HTMLElement;
  state: ReturnType<typeof createWorkspaceTrackpadNavigationState>;
  viewportProvider: () => Rect;
}): void {
  const presentationMode = runtime.store.getSnapshot().presentationMode;
  if (presentationMode === "overview") {
    handleOverviewWheel({ event, root, runtime, scheduler, stage, viewportProvider });
    return;
  }
  const navigationTarget = workspaceWheelNavigationTargetFromEventTarget(event.target, root);
  if (!navigationTarget) {
    return;
  }
  const result = interpretWorkspaceTrackpadWheel(
    {
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      modifierRequired: false,
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
    if (
      navigationTarget.paneId &&
      presentationMode === "normal" &&
      !workspaceScrollAnimationActive(runtime.store.getSnapshot())
    ) {
      runtime.store.moveFocusFromPane(navigationTarget.paneId, direction, viewportProvider());
      continue;
    }
    runtime.store.moveFocus(direction, viewportProvider());
  }
  persistLayout();
}

// In overview the wheel drives zoom or pan of the scaled surface (rather than
// moving focus between panes): a mouse wheel / pinch / Cmd-Ctrl+wheel zooms toward
// the cursor, a two-finger trackpad swipe pans. Both are ephemeral view state
// (reset on toggle), so neither is persisted.
function handleOverviewWheel({
  event,
  root,
  runtime,
  scheduler,
  stage,
  viewportProvider,
}: {
  event: WheelEvent;
  root: HTMLElement;
  runtime: WorkspaceRuntime;
  scheduler: FrameScheduler;
  stage: HTMLElement;
  viewportProvider: () => Rect;
}): void {
  if (!wheelTargetWithinRoot(root, event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const intent = classifyOverviewWheel({
    ctrlKey: event.ctrlKey,
    deltaMode: event.deltaMode,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    metaKey: event.metaKey,
  });
  let changed: boolean;
  if (intent === "zoom") {
    const stageRect = stage.getBoundingClientRect();
    changed = runtime.store.zoomOverviewBy(
      overviewWheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey),
      event.clientX - stageRect.left,
      event.clientY - stageRect.top,
      viewportProvider(),
    );
  } else {
    changed = runtime.store.panOverviewBy(
      event.deltaX * wheelDeltaModePixelFactor(event.deltaMode),
      event.deltaY * wheelDeltaModePixelFactor(event.deltaMode),
      viewportProvider(),
    );
  }
  if (changed) {
    scheduler.pauseBenchmark();
  }
}

function wheelTargetWithinRoot(root: HTMLElement, target: EventTarget | null): boolean {
  if (!target) {
    return false;
  }
  if (typeof Node !== "undefined" && target instanceof Node) {
    return root.contains(target);
  }
  return (root as unknown as { contains: (candidate: EventTarget) => boolean }).contains(target);
}

function workspaceScrollAnimationActive(snapshot: {
  scrollColumn: number;
  scrollRow: number;
  targetScrollColumn: number;
  targetScrollRow: number;
}): boolean {
  return (
    Math.abs(snapshot.targetScrollColumn - snapshot.scrollColumn) > 0.001 ||
    Math.abs(snapshot.targetScrollRow - snapshot.scrollRow) > 0.001
  );
}

function isArrowKey(key: string): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}
