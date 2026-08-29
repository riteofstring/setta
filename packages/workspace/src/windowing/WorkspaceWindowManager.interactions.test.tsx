/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import {
  WorkspaceWindowManager,
  type WorkspaceWindowManagerProps,
} from "./WorkspaceWindowManager";
import {
  createWorkspaceWindowingState,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowingState,
} from "./windowingTypes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const observedResizeTargets = new Map<Element, ResizeObserverCallback>();

class CapturingResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.targets.add(target);
    observedResizeTargets.set(target, this.callback);
  }

  disconnect() {
    for (const target of this.targets) observedResizeTargets.delete(target);
    this.targets.clear();
  }

  unobserve(target: Element) {
    this.targets.delete(target);
    observedResizeTargets.delete(target);
  }
}

globalThis.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

const EMPTY_INSETS = Object.freeze({ bottom: 0, left: 0, right: 0, top: 0 });
const RENDERERS = Object.freeze({
  example: (window: WorkspaceFloatingWindowInput) => <>{window.title}</>,
});

function makeWindow(
  id: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindowInput {
  return {
    bounds: { height: 300, width: 420, x: 120, y: 100 },
    contentId: `content-${id}`,
    id,
    rendererData: { id },
    surfaceKind: "example",
    title: `Window ${id}`,
    ...overrides,
  };
}

function createState(
  windows: readonly WorkspaceFloatingWindowInput[],
): WorkspaceWindowingState {
  return createWorkspaceWindowingState({ nextFocusOrder: 20, windows });
}

function createPointerEvent(
  type: string,
  {
    clientX,
    clientY,
    pointerId = 1,
  }: { clientX: number; clientY: number; pointerId?: number },
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function flushAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    const schedule =
      window.requestAnimationFrame ??
      ((callback) => window.setTimeout(callback, 0));
    schedule(() => resolve());
  });
}

function Harness({
  initialState,
  onChange,
  ...props
}: Omit<WorkspaceWindowManagerProps, "state" | "onStateChange"> & {
  initialState: WorkspaceWindowingState;
  onChange: (state: WorkspaceWindowingState) => void;
}) {
  const [state, setState] = useState(initialState);
  return (
    <WorkspaceWindowManager
      {...props}
      onStateChange={(nextState) => {
        onChange(nextState);
        setState(nextState);
      }}
      state={state}
    />
  );
}

describe("WorkspaceWindowManager interactions", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onChange: Mock<(state: WorkspaceWindowingState) => void>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    onChange = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    observedResizeTargets.clear();
  });

  async function mount({
    boundaryInsets = EMPTY_INSETS,
    initialState = createState([makeWindow("one")]),
  }: {
    boundaryInsets?: WorkspaceWindowManagerProps["boundaryInsets"];
    initialState?: WorkspaceWindowingState;
  } = {}): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <Harness
            boundaryInsets={boundaryInsets}
            initialState={initialState}
            onChange={onChange}
            renderers={RENDERERS}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getManager(): HTMLDivElement {
    const manager = host.querySelector<HTMLDivElement>(
      '[data-testid="workspace-window-manager"]',
    );
    if (!manager)
      throw new Error("Expected the workspace window manager root.");
    return manager;
  }

  async function resizeManager(width: number, height = 600): Promise<void> {
    const manager = getManager();
    const callback = observedResizeTargets.get(manager);
    if (!callback)
      throw new Error("Expected the manager root to be resize-observed.");
    await act(async () => {
      callback(
        [
          {
            contentRect: new DOMRect(0, 0, width, height),
            target: manager,
          } as unknown as ResizeObserverEntry,
        ],
        new CapturingResizeObserver(callback) as unknown as ResizeObserver,
      );
    });
  }

  function getLastStateChange(): WorkspaceWindowingState {
    const nextState = onChange.mock.calls.at(-1)?.[0];
    if (!nextState) throw new Error("Expected a controlled state update.");
    return nextState;
  }

  function getWindow(windowId: string): HTMLElement {
    const window = host.querySelector<HTMLElement>(
      `[data-testid="workspace-window-manager-window"][data-workspace-window-id="${windowId}"]`,
    );
    if (!window) throw new Error(`Expected window ${windowId}.`);
    return window;
  }

  function getTitleDragHandle(windowId: string): HTMLElement {
    const title = getWindow(windowId).querySelector<HTMLElement>(
      '[data-testid="workspace-window-title-drag-handle"]',
    );
    if (!title) throw new Error(`Expected title drag handle for ${windowId}.`);
    return title;
  }

  function getOverlayWindowIds(): string[] {
    return Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-testid="workspace-window-manager-window"]',
      ),
      (window) => window.dataset.workspaceWindowId ?? "",
    );
  }

  it("previews a square snap ghost, cancels safely, and unsnaps at six pixels", async () => {
    await mount({
      initialState: createState([
        makeWindow("left", {
          bounds: { height: 600, width: 400, x: 0, y: 0 },
          lastUnsnappedBounds: { height: 300, width: 400, x: 100, y: 100 },
        }),
      ]),
    });
    await resizeManager(800);
    const title = host.querySelector<HTMLParagraphElement>(
      '[data-testid="workspace-window-title-drag-handle"]',
    );
    if (!title) throw new Error("Expected the title drag handle.");

    await act(async () => {
      title.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 200,
          clientY: 100,
          pointerId: 3,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 5,
          clientY: 5,
          pointerId: 3,
        }),
      );
      await flushAnimationFrame();
    });
    expect(
      host.querySelector('[data-testid="workspace-window-snap-preview"]'),
    ).not.toBeNull();
    await act(async () => {
      title.dispatchEvent(
        createPointerEvent("pointercancel", {
          clientX: 5,
          clientY: 5,
          pointerId: 3,
        }),
      );
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      title.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 200,
          clientY: 100,
          pointerId: 4,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 206,
          clientY: 100,
          pointerId: 4,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 206,
          clientY: 100,
          pointerId: 4,
        }),
      );
    });
    expect(getLastStateChange().windows[0]?.bounds).toMatchObject({
      height: 300,
      width: 400,
      x: 6,
    });
  });

  it("commits a free corner resize once on pointer release", async () => {
    await mount();
    await resizeManager(800);
    onChange.mockClear();
    const handle = host.querySelector<HTMLDivElement>(
      '[data-testid="workspace-window-free-resize-handle"][data-direction="bottom_right"]',
    );
    if (!handle) throw new Error("Expected the bottom-right resize handle.");

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 540,
          clientY: 400,
          pointerId: 9,
        }),
      );
      handle.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 590,
          clientY: 440,
          pointerId: 9,
        }),
      );
      handle.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 590,
          clientY: 440,
          pointerId: 9,
        }),
      );
    });

    expect(onChange).toHaveBeenCalledOnce();
    expect(getLastStateChange().windows[0]?.bounds).toEqual({
      height: 340,
      width: 470,
      x: 120,
      y: 100,
    });
  });

  it("keeps overlay DOM order stable while focusing and dragging consecutive windows", async () => {
    await mount({
      initialState: createState([
        makeWindow("one", { zIndex: 1 }),
        makeWindow("two", {
          bounds: { height: 300, width: 420, x: 520, y: 100 },
          zIndex: 2,
        }),
      ]),
    });
    await resizeManager(1_000);
    const firstTitle = getTitleDragHandle("one");
    const firstCapture = vi.fn();
    Object.defineProperty(firstTitle, "setPointerCapture", {
      configurable: true,
      value: firstCapture,
    });

    await act(async () => {
      firstTitle.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 220,
          clientY: 120,
          pointerId: 41,
        }),
      );
    });

    expect(firstCapture).toHaveBeenCalledWith(41);
    expect(getOverlayWindowIds()).toEqual(["one", "two"]);
    expect(getTitleDragHandle("one")).toBe(firstTitle);
    expect(Number(getWindow("one").style.zIndex)).toBeGreaterThan(
      Number(getWindow("two").style.zIndex),
    );

    await act(async () => {
      firstTitle.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 240,
          clientY: 130,
          pointerId: 41,
        }),
      );
      firstTitle.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 240,
          clientY: 130,
          pointerId: 41,
        }),
      );
    });

    const secondTitle = getTitleDragHandle("two");
    const secondCapture = vi.fn();
    Object.defineProperty(secondTitle, "setPointerCapture", {
      configurable: true,
      value: secondCapture,
    });
    await act(async () => {
      secondTitle.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 620,
          clientY: 120,
          pointerId: 42,
        }),
      );
    });

    expect(secondCapture).toHaveBeenCalledWith(42);
    expect(getOverlayWindowIds()).toEqual(["one", "two"]);
    expect(getTitleDragHandle("two")).toBe(secondTitle);

    await act(async () => {
      secondTitle.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 650,
          clientY: 140,
          pointerId: 42,
        }),
      );
      secondTitle.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 650,
          clientY: 140,
          pointerId: 42,
        }),
      );
    });

    expect(getLastStateChange().windows).toMatchObject([
      { bounds: { x: 140, y: 110 }, id: "one" },
      { bounds: { x: 550, y: 120 }, id: "two" },
    ]);
  });

  it("resizes every snapped neighbor across a shared seam in one controlled update", async () => {
    await mount({
      initialState: createState([
        makeWindow("left", {
          bounds: { height: 600, width: 500, x: 0, y: 0 },
          zIndex: 1,
        }),
        makeWindow("right", {
          bounds: { height: 600, width: 500, x: 500, y: 0 },
          zIndex: 2,
        }),
      ]),
    });
    await resizeManager(1_000);
    onChange.mockClear();
    const seam = host.querySelector<HTMLDivElement>(
      '[data-testid="workspace-window-snap-resize-handle"][data-axis="vertical"]',
    );
    if (!seam)
      throw new Error("Expected a shared vertical snapped-window seam.");
    await act(async () => {
      seam.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 500,
          clientY: 300,
          pointerId: 5,
        }),
      );
      seam.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 550,
          clientY: 300,
          pointerId: 5,
        }),
      );
      seam.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 550,
          clientY: 300,
          pointerId: 5,
        }),
      );
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(getLastStateChange().windows.map((window) => window.bounds)).toEqual(
      [
        { height: 600, width: 550, x: 0, y: 0 },
        { height: 600, width: 450, x: 550, y: 0 },
      ],
    );
  });

  it("handles a Mod shortcut from a host sibling and leaves another host alone", async () => {
    await mount();
    await resizeManager(800);
    const canvasSibling = document.createElement("button");
    const unregisterCanvasSibling = registerWorkspaceHostElement(
      testWorkspace.host,
      canvasSibling,
    );
    const secondWorkspace = createWorkspaceTestHost();
    const secondHostTarget = document.createElement("button");
    const unregisterSecondHostTarget = registerWorkspaceHostElement(
      secondWorkspace.host,
      secondHostTarget,
    );
    document.body.append(canvasSibling, secondHostTarget);
    try {
      canvasSibling.focus();
      const overSpecified = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "Enter",
        ctrlKey: true,
        key: "Enter",
        metaKey: true,
        shiftKey: true,
      });
      await act(async () => canvasSibling.dispatchEvent(overSpecified));
      expect(overSpecified.defaultPrevented).toBe(false);
      expect(onChange).not.toHaveBeenCalled();

      const handled = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "Enter",
        ctrlKey: true,
        key: "Enter",
        shiftKey: true,
      });
      await act(async () => canvasSibling.dispatchEvent(handled));
      expect(handled.defaultPrevented).toBe(true);
      expect(getLastStateChange().windows[0]?.placement).toBe("maximized");
      onChange.mockClear();

      const foreignEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "Enter",
        ctrlKey: true,
        key: "Enter",
        shiftKey: true,
      });
      await act(async () => secondHostTarget.dispatchEvent(foreignEvent));
      expect(foreignEvent.defaultPrevented).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      unregisterCanvasSibling();
      unregisterSecondHostTarget();
      canvasSibling.remove();
      secondHostTarget.remove();
      secondWorkspace.host.dispose();
    }
  });

  it("rescales snapped geometry into caller insets with one host-resize update", async () => {
    await mount({
      boundaryInsets: { bottom: 0, left: 100, right: 0, top: 0 },
      initialState: createState([
        makeWindow("left", {
          bounds: { height: 600, width: 400, x: 100, y: 0 },
        }),
      ]),
    });
    await resizeManager(900);
    onChange.mockClear();
    await resizeManager(1_100);
    expect(onChange).toHaveBeenCalledOnce();
    expect(getLastStateChange().windows[0]?.bounds).toEqual({
      height: 600,
      width: 500,
      x: 100,
      y: 0,
    });
  });
});
