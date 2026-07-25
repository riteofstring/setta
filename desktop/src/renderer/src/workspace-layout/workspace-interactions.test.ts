import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppearanceShortcutsSettings } from "@generated/backend";

import type { FrameScheduler } from "./frame-scheduler";
import {
  handleForwardedBrowserViewKey,
  handleWorkspaceClick,
  handleWorkspaceKeyDown,
  handleWorkspacePaneFocusPointerDown,
  handleWorkspaceWheel,
} from "./workspace-interactions";
import { createWorkspaceTrackpadNavigationState } from "./trackpad-navigation";
import type { WorkspaceRuntime } from "./workspace-runtime";
import type { Rect } from "./types";

describe("workspace keyboard interactions", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", FakeElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("leaves bare arrows available to focused surfaces", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({ key: "ArrowRight" });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(context.runtime.store.moveFocus).not.toHaveBeenCalled();
    expect(context.persistLayout).not.toHaveBeenCalled();
  });

  test("moves focus with Mod+Alt+Arrow", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({ altKey: true, key: "ArrowRight", metaKey: true });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.scheduler.pauseBenchmark).toHaveBeenCalledOnce();
    expect(context.runtime.store.moveFocus).toHaveBeenCalledWith("right", context.viewport);
    expect(context.persistLayout).toHaveBeenCalledOnce();
  });

  test("moves focus with Ctrl+Alt+Arrow when that preset is active", () => {
    const context = workspaceKeyContext({
      shortcuts: { masterVoice: "mod_shift_k", workspaceNavigation: "ctrl_alt_arrows" },
    });
    const event = keyboardEvent({ altKey: true, ctrlKey: true, key: "ArrowRight" });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.moveFocus).toHaveBeenCalledWith("right", context.viewport);
  });

  test("ignores Mod+Alt+Arrow when Ctrl+Alt+Arrow is active", () => {
    const context = workspaceKeyContext({
      shortcuts: { masterVoice: "mod_shift_k", workspaceNavigation: "ctrl_alt_arrows" },
    });
    const event = keyboardEvent({ altKey: true, key: "ArrowRight", metaKey: true });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(context.runtime.store.moveFocus).not.toHaveBeenCalled();
  });

  test("moves the focused pane with Mod+Alt+Shift+Arrow", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({
      altKey: true,
      key: "ArrowLeft",
      metaKey: true,
      shiftKey: true,
    });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.moveFocusedPane).toHaveBeenCalledWith("left");
    expect(context.runtime.store.moveFocus).not.toHaveBeenCalled();
  });

  test("uses Mod+Alt+Enter for plane splits", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({ altKey: true, key: "Enter", metaKey: true });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.splitFocusedPaneToPlane).toHaveBeenCalledWith("down");
    expect(context.runtime.store.splitFocusedPane).not.toHaveBeenCalled();
  });

  test("uses Ctrl+Alt+Enter for plane splits when that preset is active", () => {
    const context = workspaceKeyContext({
      shortcuts: { masterVoice: "mod_shift_k", workspaceNavigation: "ctrl_alt_arrows" },
    });
    const event = keyboardEvent({ altKey: true, ctrlKey: true, key: "Enter" });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.splitFocusedPaneToPlane).toHaveBeenCalledWith("down");
    expect(context.runtime.store.splitFocusedPane).not.toHaveBeenCalled();
  });

  test("uses Mod+Alt+Shift+Enter for upward plane splits", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({
      altKey: true,
      key: "Enter",
      metaKey: true,
      shiftKey: true,
    });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.splitFocusedPaneToPlane).toHaveBeenCalledWith("up");
    expect(context.runtime.store.splitFocusedPane).not.toHaveBeenCalled();
  });

  test("opens a browser pane with Mod+Alt+B", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({ altKey: true, key: "b", metaKey: true });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.canOpenPane).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceKind: "browser" }),
    );
    expect(context.runtime.store.openPane).toHaveBeenCalledWith(
      expect.objectContaining({
        surfaceKind: "browser",
        title: "Browser",
      }),
    );
  });

  test("does not expose a generic shortcut for conversation-bound panes", () => {
    const context = workspaceKeyContext();
    const event = keyboardEvent({ altKey: true, key: "e", metaKey: true });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(context.runtime.store.canOpenPane).not.toHaveBeenCalled();
    expect(context.runtime.store.openPane).not.toHaveBeenCalled();
  });

  test("uses active shortcut settings for forwarded BrowserView arrows", () => {
    const context = workspaceKeyContext({
      shortcuts: { masterVoice: "mod_shift_k", workspaceNavigation: "ctrl_alt_arrows" },
    });

    handleForwardedBrowserViewKey({
      ...context,
      event: {
        altKey: true,
        ctrlKey: true,
        key: "ArrowUp",
        metaKey: false,
        shiftKey: false,
        surfaceId: "surface-browser",
        workspaceId: "workspace-test",
      },
    });

    expect(context.runtime.store.moveFocus).toHaveBeenCalledWith("up", context.viewport);
    expect(context.persistLayout).toHaveBeenCalledOnce();
  });
});

describe("workspace overview wheel panning", () => {
  test("routes wheel scrolling to overview pan instead of focus moves", () => {
    const context = overviewWheelContext();

    handleWorkspaceWheel({
      ...context,
      event: wheelEvent({ deltaX: 30, deltaY: 120, target: context.insideTarget }),
    });

    expect(context.runtime.store.panOverviewBy).toHaveBeenCalledWith(30, 120, context.viewport);
    expect(context.runtime.store.moveFocus).not.toHaveBeenCalled();
  });

  test("ignores wheel events outside the workspace root", () => {
    const context = overviewWheelContext();

    handleWorkspaceWheel({
      ...context,
      event: wheelEvent({ deltaX: 30, deltaY: 120, target: {} }),
    });

    expect(context.runtime.store.panOverviewBy).not.toHaveBeenCalled();
  });

  test("routes a mouse-wheel notch to zoom toward the cursor", () => {
    const context = overviewWheelContext();

    handleWorkspaceWheel({
      ...context,
      event: wheelEvent({
        clientX: 130,
        clientY: 80,
        deltaY: -120,
        target: context.insideTarget,
      }),
    });

    // Cursor is mapped into stage space (stage origin at 30, 20).
    expect(context.runtime.store.zoomOverviewBy).toHaveBeenCalledWith(
      expect.any(Number),
      100,
      60,
      context.viewport,
    );
    expect(context.runtime.store.panOverviewBy).not.toHaveBeenCalled();
  });

  test("routes a trackpad swipe to pan", () => {
    const context = overviewWheelContext();

    handleWorkspaceWheel({
      ...context,
      event: wheelEvent({ deltaY: -8, target: context.insideTarget }),
    });

    expect(context.runtime.store.panOverviewBy).toHaveBeenCalled();
    expect(context.runtime.store.zoomOverviewBy).not.toHaveBeenCalled();
  });

  test("routes a pinch (ctrl+wheel) to zoom", () => {
    const context = overviewWheelContext();

    handleWorkspaceWheel({
      ...context,
      event: wheelEvent({ ctrlKey: true, deltaY: -4, target: context.insideTarget }),
    });

    expect(context.runtime.store.zoomOverviewBy).toHaveBeenCalled();
    expect(context.runtime.store.panOverviewBy).not.toHaveBeenCalled();
  });
});

describe("workspace pane click focus", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", FakeElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("focuses pane interior clicks without scrolling the layout", () => {
    const context = workspaceClickContext();
    const event = mouseEvent({ clientX: 240, clientY: 160, target: context.paneTarget });

    handleWorkspaceClick({ ...context, event });

    expect(context.runtime.store.focusPaneWithoutReveal).toHaveBeenCalledWith("pane");
    expect(context.runtime.store.focusPane).not.toHaveBeenCalled();
    expect(context.runtime.store.ensureFocusedPaneVisible).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  test("focuses pane content from pointerdown capture when click propagation is stopped", () => {
    const context = workspaceClickContext();
    const event = pointerEvent({ clientX: 240, clientY: 160, target: context.paneTarget });

    handleWorkspacePaneFocusPointerDown({ ...context, event });

    expect(context.runtime.store.focusPaneWithoutReveal).toHaveBeenCalledWith("pane");
    expect(context.runtime.store.focusPane).not.toHaveBeenCalled();
    expect(context.runtime.store.ensureFocusedPaneVisible).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  test("focuses another pane body without scrolling the layout", () => {
    const context = workspaceClickContext({
      paneId: "browser-pane",
      surfaceKind: "browser",
    });
    const event = mouseEvent({ clientX: 240, clientY: 160, target: context.paneTarget });

    handleWorkspaceClick({ ...context, event });

    expect(context.runtime.store.focusPaneWithoutReveal).toHaveBeenCalledWith("browser-pane");
    expect(context.runtime.store.focusPane).not.toHaveBeenCalled();
    expect(context.runtime.store.ensureFocusedPaneVisible).not.toHaveBeenCalled();
  });

  test("fully focuses panes from top bar clicks", () => {
    const context = workspaceClickContext();
    const event = mouseEvent({ clientX: 240, clientY: 52, target: context.paneTarget });

    handleWorkspaceClick({ ...context, event });

    expect(context.runtime.store.focusPane).toHaveBeenCalledWith("pane");
    expect(context.runtime.store.ensureFocusedPaneVisible).toHaveBeenCalledWith(context.viewport);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  test("fully focuses panes from top bar pointerdown capture", () => {
    const context = workspaceClickContext();
    const event = pointerEvent({ clientX: 240, clientY: 52, target: context.paneTarget });

    handleWorkspacePaneFocusPointerDown({ ...context, event });

    expect(context.runtime.store.focusPane).toHaveBeenCalledWith("pane");
    expect(context.runtime.store.ensureFocusedPaneVisible).toHaveBeenCalledWith(context.viewport);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  test("leaves interactive pane controls mounted throughout a click gesture", () => {
    const context = workspaceClickContext();
    const pointerDown = pointerEvent({
      clientX: 240,
      clientY: 52,
      target: context.interactiveControlTarget,
    });
    const click = mouseEvent({ clientX: 240, clientY: 52, target: context.retargetedControlClick });

    handleWorkspacePaneFocusPointerDown({ ...context, event: pointerDown });
    handleWorkspaceClick({ ...context, event: click });

    expect(context.runtime.store.focusPane).not.toHaveBeenCalled();
    expect(context.runtime.store.focusPaneWithoutReveal).not.toHaveBeenCalled();
    expect(context.runtime.store.ensureFocusedPaneVisible).not.toHaveBeenCalled();
    expect(context.scheduler.pauseBenchmark).not.toHaveBeenCalled();
    expect(pointerDown.preventDefault).not.toHaveBeenCalled();
    expect(pointerDown.stopPropagation).not.toHaveBeenCalled();
    expect(click.preventDefault).not.toHaveBeenCalled();
    expect(click.stopPropagation).not.toHaveBeenCalled();
  });

  test("focuses another pane when master close is non-destructive", async () => {
    const context = masterCloseClickContext();

    handleWorkspaceClick({ ...context, event: context.event });
    await waitForMicrotask();

    expect(context.event.preventDefault).toHaveBeenCalledOnce();
    expect(context.event.stopPropagation).toHaveBeenCalledOnce();
    expect(context.scheduler.pauseBenchmark).toHaveBeenCalledOnce();
    expect(context.adapter.requestPaneClose).toHaveBeenCalledOnce();
    expect(context.runtime.store.mostRecentlyFocusedPaneId).toHaveBeenCalledWith([
      "conversation-pane",
    ]);
    expect(context.runtime.store.focusPane).toHaveBeenCalledWith("conversation-pane");
    expect(context.runtime.store.ensureFocusedPaneVisible).toHaveBeenCalledWith(context.viewport);
    expect(context.runtime.store.closeFocusedPaneOrClearLastPane).not.toHaveBeenCalled();
  });

  test("reveals top bar clicks on panes already focused by content", () => {
    const context = workspaceClickContext({ focusedPaneId: "pane" });
    const event = pointerEvent({ clientX: 240, clientY: 52, target: context.paneTarget });

    handleWorkspacePaneFocusPointerDown({ ...context, event });

    expect(context.runtime.store.focusPane).toHaveBeenCalledWith("pane");
    expect(context.runtime.store.focusPaneWithoutReveal).not.toHaveBeenCalled();
    expect(context.runtime.store.ensureFocusedPaneVisible).toHaveBeenCalledWith(context.viewport);
  });
});

function overviewWheelContext() {
  const viewport: Rect = { height: 720, width: 480, x: 0, y: 0 };
  const insideTarget = {};
  const root = {
    contains: (candidate: unknown) => candidate === insideTarget,
  } as unknown as HTMLElement;
  const stage = {
    getBoundingClientRect: () => ({ left: 30, top: 20 }),
  } as unknown as HTMLElement;
  const store = {
    getSnapshot: () => ({ presentationMode: "overview" }),
    moveFocus: vi.fn(),
    panOverviewBy: vi.fn(() => true),
    zoomOverviewBy: vi.fn(() => true),
  };
  const runtime = { store } as unknown as WorkspaceRuntime;
  const scheduler = { pauseBenchmark: vi.fn() } as unknown as FrameScheduler;
  return {
    insideTarget,
    persistLayout: vi.fn(),
    root,
    runtime,
    scheduler,
    stage,
    state: createWorkspaceTrackpadNavigationState(),
    viewport,
    viewportProvider: () => viewport,
  };
}

function workspaceClickContext({
  focusedPaneId = "other-pane",
  paneId = "pane",
  surfaceKind = "fake-dom",
}: {
  focusedPaneId?: string;
  paneId?: string;
  surfaceKind?: string;
} = {}) {
  const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };
  const paneHost = new FakeElement({
    rect: { bottom: 260, left: 100, right: 420, top: 40 },
    surfaceKind,
  });
  paneHost.dataset.paneId = paneId;
  const paneTarget = new FakeElement({
    closestHost: paneHost,
  });
  const interactiveControlTarget = new FakeElement({
    closestHost: paneHost,
    interactiveControl: true,
  });
  const retargetedControlClick = new FakeElement({
    closestHost: paneHost,
    pointTarget: interactiveControlTarget,
  });
  const store = {
    canOpenPane: vi.fn(() => false),
    ensureFocusedPaneVisible: vi.fn(),
    focusedPaneId: vi.fn(() => focusedPaneId),
    focusPane: vi.fn(() => true),
    focusPaneWithoutReveal: vi.fn(() => true),
    getSnapshot: () => ({ presentationMode: "normal" }),
  };
  const runtime = { mode: "workspace", store } as unknown as WorkspaceRuntime;
  const scheduler = { pauseBenchmark: vi.fn() } as unknown as FrameScheduler;
  return {
    event: mouseEvent({ clientX: 240, clientY: 160, target: paneTarget }),
    interactiveControlTarget,
    runLayoutAction: (action: () => void) => action(),
    runtime,
    scheduler,
    paneTarget,
    retargetedControlClick,
    viewport,
    viewportProvider: () => viewport,
  };
}

function masterCloseClickContext() {
  const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };
  const paneHost = new FakeElement({
    rect: { bottom: 260, left: 100, right: 420, top: 40 },
    surfaceKind: "master",
  });
  paneHost.dataset.paneId = "master-pane";
  const closeButton = new FakeElement({
    closestHost: paneHost,
    paneAction: "close",
  });
  const scene = {
    paneById: new Map([
      [
        "master-pane",
        {
          paneId: "master-pane",
          surfaceId: "master-surface",
          surfaceKind: "master",
        },
      ],
      [
        "conversation-pane",
        {
          paneId: "conversation-pane",
          surfaceId: "conversation-surface",
          surfaceKind: "conversation",
        },
      ],
    ]),
    panes: [
      {
        paneId: "master-pane",
        surfaceId: "master-surface",
        surfaceKind: "master",
      },
      {
        paneId: "conversation-pane",
        surfaceId: "conversation-surface",
        surfaceKind: "conversation",
      },
    ],
  };
  const adapter = {
    requestPaneClose: vi.fn(async () => ({ removePane: false })),
  };
  const store = {
    closeFocusedPaneOrClearLastPane: vi.fn(),
    ensureFocusedPaneVisible: vi.fn(),
    focusPane: vi.fn(() => true),
    getSnapshot: () => ({ presentationMode: "normal" }),
    mostRecentlyFocusedPaneId: vi.fn(() => "conversation-pane"),
    toScene: vi.fn(() => scene),
  };
  const runtime = {
    mode: "workspace",
    store,
    surfaceRegistry: {
      adapterFor: vi.fn(() => adapter),
    },
  } as unknown as WorkspaceRuntime;
  const scheduler = { pauseBenchmark: vi.fn() } as unknown as FrameScheduler;
  return {
    adapter,
    event: mouseEvent({ clientX: 240, clientY: 52, target: closeButton }),
    runLayoutAction: (action: () => void) => action(),
    runtime,
    scheduler,
    viewport,
    viewportProvider: () => viewport,
  };
}

function wheelEvent({
  clientX = 0,
  clientY = 0,
  ctrlKey = false,
  deltaMode = 0,
  deltaX = 0,
  deltaY,
  metaKey = false,
  target,
}: {
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  deltaMode?: number;
  deltaX?: number;
  deltaY: number;
  metaKey?: boolean;
  target: unknown;
}): WheelEvent {
  return {
    clientX,
    clientY,
    ctrlKey,
    deltaMode,
    deltaX,
    deltaY,
    metaKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as WheelEvent;
}

function mouseEvent({
  clientX,
  clientY,
  target,
}: {
  clientX: number;
  clientY: number;
  target: FakeElement;
}): MouseEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as MouseEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function pointerEvent({
  button = 0,
  clientX,
  clientY,
  target,
}: {
  button?: number;
  clientX: number;
  clientY: number;
  target: FakeElement;
}): PointerEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    ...mouseEvent({ clientX, clientY, target }),
    button,
  } as unknown as PointerEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function workspaceKeyContext({
  shortcuts = { masterVoice: "mod_shift_k", workspaceNavigation: "mod_alt_arrows" },
}: {
  shortcuts?: AppearanceShortcutsSettings;
} = {}) {
  const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };
  const store = {
    canOpenPane: vi.fn(() => true),
    moveFocus: vi.fn(),
    moveFocusedPane: vi.fn(),
    openPane: vi.fn(),
    splitFocusedPane: vi.fn(),
    splitFocusedPaneToPlane: vi.fn(),
  };
  const runtime = { store } as unknown as WorkspaceRuntime;
  const scheduler = { pauseBenchmark: vi.fn() } as unknown as FrameScheduler;
  return {
    event: keyboardEvent({ key: "Escape" }),
    persistLayout: vi.fn(),
    runLayoutAction: (action: () => void) => action(),
    runtime,
    scheduler,
    shortcuts,
    viewport,
    viewportProvider: () => viewport,
  };
}

function keyboardEvent({
  altKey = false,
  ctrlKey = false,
  key,
  metaKey = false,
  shiftKey = false,
  target = new FakeElement({}),
}: {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: FakeElement;
}): KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    altKey,
    composedPath: () => [target],
    ctrlKey,
    key,
    metaKey,
    preventDefault: vi.fn(),
    shiftKey,
    target,
  } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

function waitForMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly classList = {
    contains: () => false,
  };

  constructor(
    private readonly options: {
      closestHost?: FakeElement;
      interactiveControl?: boolean;
      paneAction?: string;
      pointTarget?: FakeElement;
      rect?: { bottom: number; left: number; right: number; top: number };
      surfaceKind?: string;
    },
  ) {
    if (options.surfaceKind) {
      this.dataset.surfaceKind = options.surfaceKind;
    }
    if (options.paneAction) {
      this.dataset.workspacePaneAction = options.paneAction;
    }
  }

  get ownerDocument(): { elementFromPoint: () => FakeElement | null } {
    return { elementFromPoint: () => this.options.pointTarget ?? null };
  }

  closest(selector: string): FakeElement | null {
    if (
      this.options.closestHost &&
      (selector === '[data-testid="workspace-pane-host"][data-visible="true"]' ||
        selector === '[data-testid="workspace-pane-host"]')
    ) {
      return this.options.closestHost;
    }
    if (this.options.paneAction && selector === "[data-workspace-pane-action]") {
      return this;
    }
    if (
      this.options.interactiveControl &&
      selector === '[data-workspace-pane-interactive-control="true"]'
    ) {
      return this;
    }
    return null;
  }

  getBoundingClientRect(): { bottom: number; left: number; right: number; top: number } {
    return this.options.rect ?? { bottom: 0, left: 0, right: 0, top: 0 };
  }
}
