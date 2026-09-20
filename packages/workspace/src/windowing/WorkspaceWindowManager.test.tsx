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

  unobserve(target: Element) {
    this.targets.delete(target);
    observedResizeTargets.delete(target);
  }

  disconnect() {
    for (const target of this.targets) {
      observedResizeTargets.delete(target);
    }
    this.targets.clear();
  }
}

globalThis.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

const EMPTY_INSETS = Object.freeze({ bottom: 0, left: 0, right: 0, top: 0 });
const RENDERERS = Object.freeze({
  example: (window: WorkspaceFloatingWindowInput) => (
    <div data-testid={`workspace-window-content-${window.id}`}>
      {window.title}
    </div>
  ),
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

describe("WorkspaceWindowManager", () => {
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
    await act(async () => {
      root.unmount();
    });
    host.remove();
    observedResizeTargets.clear();
  });

  async function mount({
    boundaryInsets = EMPTY_INSETS,
    initialState = createState([makeWindow("one")]),
    layoutEditable = true,
    renderers = RENDERERS,
    shortcuts = true,
  }: {
    boundaryInsets?: WorkspaceWindowManagerProps["boundaryInsets"];
    initialState?: WorkspaceWindowingState;
    layoutEditable?: boolean;
    renderers?: WorkspaceWindowManagerProps["renderers"];
    shortcuts?: boolean;
  } = {}): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <Harness
            boundaryInsets={boundaryInsets}
            initialState={initialState}
            layoutEditable={layoutEditable}
            onChange={onChange}
            renderers={renderers}
            shortcuts={shortcuts}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getManager(): HTMLDivElement {
    const manager = host.querySelector<HTMLDivElement>(
      '[data-testid="workspace-window-manager"]',
    );
    if (!manager) {
      throw new Error("Expected the workspace window manager root.");
    }
    return manager;
  }

  function getWindow(id: string): HTMLElement {
    const window = host.querySelector<HTMLElement>(
      `[data-workspace-window-id="${id}"]`,
    );
    if (!window) {
      throw new Error(`Expected window ${id}.`);
    }
    return window;
  }

  async function resizeManager(width: number, height = 600): Promise<void> {
    const manager = getManager();
    const callback = observedResizeTargets.get(manager);
    if (!callback) {
      throw new Error("Expected the manager root to be resize-observed.");
    }
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

  it("keeps its full-shell root pointer-transparent while individual windows opt in", async () => {
    await mount();
    await resizeManager(800);

    expect(getManager().style.pointerEvents).toBe("none");
    expect(getWindow("one").style.pointerEvents).toBe("auto");
    expect(
      host.querySelectorAll(
        '[data-testid="workspace-window-free-resize-handle"]',
      ),
    ).toHaveLength(6);
  });

  it("restores and focuses minimized windows from main-style recovery pills", async () => {
    await mount({
      initialState: createState([
        makeWindow("visible", { zIndex: 3 }),
        makeWindow("minimized", { isMinimized: true, zIndex: 5 }),
        makeWindow("closed", { isClosed: true, zIndex: 7 }),
      ]),
    });
    await resizeManager(800);
    onChange.mockClear();

    const pills = host.querySelectorAll<HTMLButtonElement>(
      '[data-testid="workspace-bottom-dock-pill"]',
    );
    expect(pills).toHaveLength(1);
    expect(pills[0]?.getAttribute("aria-label")).toBe(
      "Restore Window minimized",
    );

    await act(async () => {
      pills[0]?.click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledOnce();
    const nextState = onChange.mock.calls[0]?.[0];
    expect(
      nextState?.windows.find((window) => window.id === "minimized"),
    ).toMatchObject({ isClosed: false, isMinimized: false });
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
    expect(getWindow("minimized").dataset.focused).toBe("true");
    expect(
      host.querySelector('[data-testid="workspace-bottom-dock-pill"]'),
    ).toBeNull();
  });

  it("keeps minimized recovery available in read-only presentation", async () => {
    await mount({
      initialState: createState([
        makeWindow("minimized", { isMinimized: true }),
      ]),
      layoutEditable: false,
    });
    await resizeManager(800);
    onChange.mockClear();

    const pill = host.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-bottom-dock-pill"]',
    );
    if (!pill) throw new Error("Expected a minimized-window recovery pill.");
    await act(async () => {
      pill.click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledOnce();
    expect(getWindow("minimized").dataset.focused).toBe("true");
    expect(host.querySelector('[aria-label="Minimized windows"]')).toBeNull();
  });

  it("reopens closed windows from the persistent manager in read-only presentation", async () => {
    await mount({
      initialState: createState([makeWindow("closed", { isClosed: true })]),
      layoutEditable: false,
    });
    await resizeManager(800);
    onChange.mockClear();

    const reopen = host.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-bottom-dock-manager-reopen"]',
    );
    if (!reopen) throw new Error("Expected the manager reopen action.");
    expect(
      host.querySelector('[data-testid="workspace-bottom-dock-manager-hide"]'),
    ).toBeNull();

    await act(async () => reopen.click());

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].windows[0]).toMatchObject({
      isClosed: false,
      isMinimized: false,
    });
    expect(
      host.querySelector(
        '[data-testid="workspace-window-manager-window"][data-workspace-window-id="closed"]',
      ),
    ).not.toBeNull();
  });

  it("renders a local accessible state when a visible window has no registered renderer", async () => {
    await mount({ renderers: {} });
    await resizeManager(800);

    const missing = host.querySelector<HTMLElement>(
      '[data-testid="workspace-window-missing-renderer"]',
    );
    expect(missing?.getAttribute("role")).toBe("status");
    expect(missing?.textContent).toContain("example");
  });

  it("keeps focus and stacking local in read-only mode without emitting state", async () => {
    await mount({
      initialState: createState([
        makeWindow("lower", { zIndex: 2 }),
        makeWindow("upper", { zIndex: 8 }),
      ]),
      layoutEditable: false,
    });
    await resizeManager(800);
    onChange.mockClear();

    await act(async () => {
      getWindow("lower").click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(Number(getWindow("lower").style.zIndex)).toBeGreaterThan(
      Number(getWindow("upper").style.zIndex),
    );
    expect(getWindow("lower").dataset.focused).toBe("true");
    const focusedZIndex = getWindow("lower").style.zIndex;
    await act(async () => {
      getWindow("lower").click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    expect(getWindow("lower").style.zIndex).toBe(focusedZIndex);
  });
});
