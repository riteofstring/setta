import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppearanceShortcutsSettings } from "@generated/backend";

import type { FrameScheduler } from "./frame-scheduler";
import {
  handleForwardedBrowserViewKey,
  handleWorkspaceClick,
  handleWorkspaceKeyDown,
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
      shortcuts: { workspaceNavigation: "ctrl_alt_arrows" },
    });
    const event = keyboardEvent({ altKey: true, ctrlKey: true, key: "ArrowRight" });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.moveFocus).toHaveBeenCalledWith("right", context.viewport);
  });

  test("ignores Mod+Alt+Arrow when Ctrl+Alt+Arrow is active", () => {
    const context = workspaceKeyContext({
      shortcuts: { workspaceNavigation: "ctrl_alt_arrows" },
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

  test("accepts Mod+Alt+Arrow rerouted from terminal surfaces", () => {
    const context = workspaceKeyContext();
    const terminalTarget = new FakeElement({ terminal: true });
    const event = keyboardEvent({
      altKey: true,
      key: "ArrowDown",
      metaKey: true,
      target: terminalTarget,
    });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.runtime.store.moveFocus).toHaveBeenCalledWith("down", context.viewport);
  });

  test("ignores bare arrows from terminal surfaces", () => {
    const context = workspaceKeyContext();
    const terminalTarget = new FakeElement({ terminal: true });
    const event = keyboardEvent({ key: "ArrowDown", target: terminalTarget });

    handleWorkspaceKeyDown({ ...context, event });

    expect(event.preventDefault).not.toHaveBeenCalled();
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
      shortcuts: { workspaceNavigation: "ctrl_alt_arrows" },
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

  test("uses active shortcut settings for forwarded BrowserView arrows", () => {
    const context = workspaceKeyContext({
      shortcuts: { workspaceNavigation: "ctrl_alt_arrows" },
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
        wheelDeltaY: 120,
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

  test("focuses terminal panes from interior clicks without swallowing the click", () => {
    const context = workspaceClickContext();
    const event = mouseEvent({ clientX: 240, clientY: 160, target: context.terminalTarget });

    handleWorkspaceClick({ ...context, event });

    expect(context.runtime.store.focusPane).toHaveBeenCalledWith("terminal-pane");
    expect(context.runtime.store.ensureFocusedPaneVisible).toHaveBeenCalledWith(context.viewport);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
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

function workspaceClickContext() {
  const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };
  const terminalHost = new FakeElement({
    rect: { bottom: 260, left: 100, right: 420, top: 40 },
    surfaceKind: "terminal",
    terminal: true,
  });
  terminalHost.dataset.paneId = "terminal-pane";
  const terminalTarget = new FakeElement({
    closestHost: terminalHost,
    terminal: true,
  });
  const store = {
    canOpenPane: vi.fn(() => false),
    ensureFocusedPaneVisible: vi.fn(),
    focusedPaneId: vi.fn(() => "chat-pane"),
    focusPane: vi.fn(() => true),
    getSnapshot: () => ({ presentationMode: "normal" }),
  };
  const runtime = { mode: "workspace", store } as unknown as WorkspaceRuntime;
  const scheduler = { pauseBenchmark: vi.fn() } as unknown as FrameScheduler;
  return {
    event: mouseEvent({ clientX: 240, clientY: 160, target: terminalTarget }),
    runLayoutAction: (action: () => void) => action(),
    runtime,
    scheduler,
    terminalTarget,
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
  wheelDeltaY,
}: {
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  deltaMode?: number;
  deltaX?: number;
  deltaY: number;
  metaKey?: boolean;
  target: unknown;
  wheelDeltaY?: number;
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
    wheelDeltaY,
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

function workspaceKeyContext({
  shortcuts = { workspaceNavigation: "mod_alt_arrows" },
}: {
  shortcuts?: AppearanceShortcutsSettings;
} = {}) {
  const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };
  const store = {
    moveFocus: vi.fn(),
    moveFocusedPane: vi.fn(),
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
  target = new FakeElement({ terminal: false }),
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

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly classList = {
    contains: (className: string) => this.terminal && className === "workspace-terminal-surface",
  };

  constructor(
    private readonly options: {
      closestHost?: FakeElement;
      rect?: { bottom: number; left: number; right: number; top: number };
      surfaceKind?: string;
      terminal: boolean;
    },
  ) {
    if (options.surfaceKind) {
      this.dataset.surfaceKind = options.surfaceKind;
    }
  }

  closest(selector: string): FakeElement | null {
    if (
      this.options.closestHost &&
      selector === '[data-testid="workspace-pane-host"][data-visible="true"]'
    ) {
      return this.options.closestHost;
    }
    return this.terminal && selector === ".workspace-terminal-surface" ? this : null;
  }

  getBoundingClientRect(): { bottom: number; left: number; right: number; top: number } {
    return this.options.rect ?? { bottom: 0, left: 0, right: 0, top: 0 };
  }

  private get terminal(): boolean {
    return this.options.terminal;
  }
}
