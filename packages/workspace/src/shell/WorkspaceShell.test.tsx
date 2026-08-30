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

import { act, createRef, useState, type ReactNode } from "react";
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
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { enableWorkspaceSavedViews } from "../saved-views/operations";
import { WorkspaceShell } from "./WorkspaceShell";
import { createWorkspaceShellViewState } from "./workspaceShellLayout";
import type {
  WorkspaceShellTabDefinition,
  WorkspaceShellTabIconProps,
  WorkspaceShellViewState,
} from "./workspaceShellTypes";
import type { WorkspaceNavigatorConfiguration } from "../navigator/workspaceNavigatorTypes";

const { shiftWorkspaceMapForLeadingPane } = vi.hoisted(() => ({
  shiftWorkspaceMapForLeadingPane: vi.fn(),
}));

vi.mock("../canvas/WorkspaceCanvas", () => ({
  WorkspaceCanvas: () => <div data-testid="workspace-canvas" />,
}));
vi.mock("../canvas/viewportHelpers", () => ({
  shiftWorkspaceMapForLeadingPane,
}));
vi.mock("../toolbar/WorkspaceControls", () => ({
  WorkspaceControls: () => <div data-testid="workspace-controls" />,
}));
vi.mock("../tooltip/WorkspaceTooltip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tooltip/WorkspaceTooltip")>()),
  WorkspaceTooltip: () => <div data-testid="workspace-tooltip" />,
}));

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

function TestIcon({ className, ...iconProps }: WorkspaceShellTabIconProps) {
  return (
    <svg {...iconProps} className={className} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="4" />
    </svg>
  );
}

const guideFocusRef = createRef<HTMLButtonElement>();

const leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "notes",
    label: "Notes",
    icon: TestIcon,
    renderContent: () => <p>Notes content</p>,
  },
  {
    id: "guide",
    label: "Guide",
    icon: TestIcon,
    initialFocusRef: guideFocusRef,
    renderContent: ({ closePane }) => (
      <button onClick={closePane} ref={guideFocusRef} type="button">
        Close guide
      </button>
    ),
  },
];

const trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "details",
    label: "Details",
    icon: TestIcon,
    renderContent: () => <p>Details content</p>,
  },
  {
    id: "activity",
    label: "Activity",
    icon: TestIcon,
    renderContent: () => <p>Activity content</p>,
  },
];

const INITIAL_LEADING_TAB_ID = "notes";
const INITIAL_TRAILING_TAB_ID = "details";

function Harness({
  includeBuiltInInspector = true,
  includeBuiltInSavedViews = false,
  includeSavedViewTabs = false,
  leadingPaneShiftsCanvas = true,
  navigator,
  onChange,
  windowManager,
}: {
  includeBuiltInInspector?: boolean;
  includeBuiltInSavedViews?: boolean;
  includeSavedViewTabs?: boolean;
  leadingPaneShiftsCanvas?: boolean;
  navigator?: WorkspaceNavigatorConfiguration;
  onChange: (viewState: WorkspaceShellViewState) => void;
  windowManager?: ReactNode;
}) {
  const [viewState, setViewState] = useState(() =>
    createWorkspaceShellViewState({
      leadingTabId: INITIAL_LEADING_TAB_ID,
      trailingTabId: INITIAL_TRAILING_TAB_ID,
    }),
  );
  return (
    <WorkspaceShell
      ariaLabel="Test workspace"
      includeBuiltInInspector={includeBuiltInInspector}
      includeBuiltInSavedViews={includeBuiltInSavedViews}
      includeSavedViewTabs={includeSavedViewTabs}
      leadingPaneShiftsCanvas={leadingPaneShiftsCanvas}
      leadingTabs={leadingTabs}
      navigator={navigator}
      onViewStateChange={(nextState) => {
        onChange(nextState);
        setViewState(nextState);
      }}
      trailingTabs={trailingTabs}
      viewState={viewState}
      windowManager={windowManager}
    />
  );
}

function ContextualTrailingTabsHarness({
  activityDisabled,
  onChange,
}: {
  activityDisabled: boolean;
  onChange: (viewState: WorkspaceShellViewState) => void;
}) {
  const [viewState, setViewState] = useState(() =>
    createWorkspaceShellViewState({
      leadingTabId: INITIAL_LEADING_TAB_ID,
      trailingTabId: INITIAL_TRAILING_TAB_ID,
    }),
  );
  const contextualTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
    trailingTabs[0]!,
    { ...trailingTabs[1]!, disabled: activityDisabled },
    {
      id: "history",
      label: "History",
      icon: TestIcon,
      renderContent: () => <p>History content</p>,
    },
  ];
  return (
    <WorkspaceShell
      ariaLabel="Contextual tabs workspace"
      includeBuiltInInspector={false}
      leadingTabs={leadingTabs}
      onViewStateChange={(nextState) => {
        onChange(nextState);
        setViewState(nextState);
      }}
      trailingTabs={contextualTabs}
      viewState={viewState}
    />
  );
}

function createPointerEvent(
  type: string,
  { clientX, pointerId = 1 }: { clientX: number; pointerId?: number },
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

describe("WorkspaceShell", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onChange: Mock<(viewState: WorkspaceShellViewState) => void>;

  beforeEach(async () => {
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onChange = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });
    await resizeShell(800);
    onChange.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    observedResizeTargets.clear();
    shiftWorkspaceMapForLeadingPane.mockReset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  function getShell(): HTMLElement {
    const shell = host.querySelector<HTMLElement>("[data-workspace-shell]");
    if (!shell) {
      throw new Error("Expected the workspace shell root.");
    }
    return shell;
  }

  function getButton(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) {
      throw new Error(`Expected button ${label}.`);
    }
    return button;
  }

  function getResizeHandle(pane: "leading" | "trailing"): HTMLDivElement {
    const handle = host.querySelector<HTMLDivElement>(
      `[data-workspace-shell-resize="${pane}"]`,
    );
    if (!handle) {
      throw new Error(`Expected ${pane} resize handle.`);
    }
    return handle;
  }

  async function resizeShell(width: number) {
    const shell = getShell();
    const callback = observedResizeTargets.get(shell);
    if (!callback) {
      throw new Error("Expected the shell root to be resize-observed.");
    }
    await act(async () => {
      callback(
        [
          {
            target: shell,
            contentRect: new DOMRect(0, 0, width, 600),
          } as unknown as ResizeObserverEntry,
        ],
        new CapturingResizeObserver(callback) as unknown as ResizeObserver,
      );
    });
  }

  it("composes the canvas chrome with ordered pane landmarks and named tablists", () => {
    expect(getShell().getAttribute("aria-label")).toBe("Test workspace");
    expect(host.querySelectorAll("aside")).toHaveLength(2);
    expect(
      Array.from(host.querySelectorAll("aside")).map((aside) =>
        aside.getAttribute("aria-label"),
      ),
    ).toEqual(["Leading workspace pane", "Trailing workspace pane"]);
    expect(
      Array.from(host.querySelectorAll('[role="tablist"]')).map((tablist) =>
        tablist.getAttribute("aria-label"),
      ),
    ).toEqual(["Leading workspace panes", "Trailing workspace panes"]);
    expect(getButton("Notes").getAttribute("aria-selected")).toBe("true");
    expect(getButton("Notes").tabIndex).toBe(0);
    expect(getButton("Outline").tabIndex).toBe(-1);
    expect(getButton("Guide").tabIndex).toBe(-1);
    expect(getButton("Inspector").tabIndex).toBe(-1);
    expect(host.querySelector('[role="tabpanel"] h2')?.textContent).toBe(
      "Notes",
    );
    expect(host.textContent).toContain("Notes content");
    expect(host.textContent).toContain("Details content");
    expect(
      host
        .querySelector(
          '[data-workspace-shell-pane-region="trailing"] .setta-workspace-shell-pane',
        )
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      host.querySelector('[data-testid="workspace-canvas"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="workspace-controls"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="workspace-tooltip"]'),
    ).not.toBeNull();
    expect(testWorkspace.reactFlow.getState().viewportInsets).toEqual({
      top: 0,
      right: 40,
      bottom: 0,
      left: 335,
    });

    const leadingRegion = host.querySelector<HTMLElement>(
      '[data-workspace-shell-pane-region="leading"]',
    );
    const rail = leadingRegion?.querySelector(
      '[data-workspace-shell-rail="leading"]',
    );
    const panel = leadingRegion?.querySelector(
      '[data-workspace-shell-panel="leading"]',
    );
    const resizeHandle = leadingRegion?.querySelector(
      '[data-workspace-shell-resize="leading"]',
    );
    if (!rail || !panel || !resizeHandle) {
      throw new Error("Expected the leading rail, panel, and resize handle.");
    }
    expect(
      rail.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      panel.compareDocumentPosition(resizeHandle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("mounts the optional host-scoped navigator trigger through shell configuration", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness navigator={{ showTrigger: true }} onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });

    expect(
      host.querySelector('button[aria-label="Open workspace navigator"]'),
    ).not.toBeNull();
  });

  it("places a host-composed window manager above the canvas and below shell chrome", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <Harness
              onChange={onChange}
              windowManager={
                <button
                  data-testid="host-window-manager"
                  style={{ pointerEvents: "auto" }}
                  type="button"
                >
                  Floating window
                </button>
              }
            />
          }
        </WorkspaceTestProvider>,
      );
    });

    const manager = host.querySelector<HTMLElement>(
      '[data-workspace-shell-window-manager="true"]',
    );
    const canvas = host.querySelector<HTMLElement>(
      '[data-testid="workspace-canvas"]',
    );
    const controls = host.querySelector<HTMLElement>(
      '[data-testid="workspace-controls"]',
    );
    const leadingPaneRegion = host.querySelector<HTMLElement>(
      '[data-workspace-shell-pane-region="leading"]',
    );
    const trailingPaneRegion = host.querySelector<HTMLElement>(
      '[data-workspace-shell-pane-region="trailing"]',
    );
    if (
      !manager ||
      !canvas ||
      !controls ||
      !leadingPaneRegion ||
      !trailingPaneRegion
    ) {
      throw new Error("Expected shell canvas, chrome, and window manager.");
    }

    expect(manager.parentElement).toBe(getShell());
    expect(manager.style).toMatchObject({
      inset: "0px",
      pointerEvents: "none",
      position: "absolute",
      zIndex: "25",
    });
    expect(
      manager.querySelector('[data-testid="host-window-manager"]'),
    ).not.toBeNull();
    expect(
      canvas.compareDocumentPosition(manager) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      controls.compareDocumentPosition(manager) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      leadingPaneRegion.compareDocumentPosition(manager) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      trailingPaneRegion.compareDocumentPosition(manager) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("maps the pane insets onto the host's writing direction", async () => {
    host.dir = "rtl";

    await act(async () => {
      getButton("Notes").click();
    });
    await act(async () => {
      getButton("Notes").click();
    });

    expect(testWorkspace.reactFlow.getState().viewportInsets).toEqual({
      top: 0,
      right: 335,
      bottom: 0,
      left: 40,
    });
  });

  it("updates the visible canvas insets when a pane closes", async () => {
    await act(async () => {
      getButton("Notes").click();
    });

    expect(testWorkspace.reactFlow.getState().viewportInsets).toEqual({
      top: 0,
      right: 40,
      bottom: 0,
      left: 40,
    });
  });

  it("shows large-surface focus only when keyboard input moves focus", async () => {
    const shell = getShell();

    for (const key of ["q", "a"]) {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key }));
      });
      expect(shell.hasAttribute("data-workspace-keyboard-focus")).toBe(false);
    }

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });
    expect(shell.hasAttribute("data-workspace-keyboard-focus")).toBe(false);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      getButton("Notes").focus();
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab" }));
    });
    expect(shell.getAttribute("data-workspace-keyboard-focus")).toBe("true");

    await act(async () => {
      document.dispatchEvent(new MouseEvent("pointerdown"));
    });
    expect(shell.hasAttribute("data-workspace-keyboard-focus")).toBe(false);
  });

  it("prepends the built-in Outline and focuses its filter when opened", async () => {
    await act(async () => {
      getButton("Outline").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const tree = host.querySelector<HTMLElement>(
      '[role="tree"][aria-label="Workspace outline"]',
    );
    const filter = host.querySelector<HTMLInputElement>(
      ".setta-workspace-outline-filter-input",
    );
    expect(tree?.textContent).toContain("No sections");
    expect(tree?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(filter);
    expect(getButton("Outline").getAttribute("aria-selected")).toBe("true");
  });

  it("adds the opt-in saved-views tab after Outline and renders its unavailable state", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness includeBuiltInSavedViews onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });
    await resizeShell(800);

    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[data-workspace-shell-rail="leading"] button[role="tab"]',
        ),
      ).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Outline", "Saved Views", "Notes", "Guide"]);

    await act(async () => {
      getButton("Saved Views").click();
    });

    const pane = host.querySelector<HTMLElement>(
      '[data-testid="workspace-saved-views-pane"]',
    );
    expect(pane?.textContent).toContain(
      "Saved views are not enabled for this workspace.",
    );
    expect(document.activeElement).toBe(pane);
  });

  it("renders opted-in saved-view tabs and reserves their custom window-manager inset", async () => {
    await act(async () => {
      enableWorkspaceSavedViews(testWorkspace.host, {
        id: "overview",
        isTab: true,
        name: "Overview",
      });
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <Harness
              includeBuiltInSavedViews
              includeSavedViewTabs
              onChange={onChange}
              windowManager={<div data-testid="host-window-manager" />}
            />
          }
        </WorkspaceTestProvider>,
      );
    });
    await resizeShell(800);

    const tab = getButton("Overview");
    const tabBar = host.querySelector<HTMLElement>(
      '[data-testid="workspace-saved-view-tabs"]',
    );
    const manager = host.querySelector<HTMLElement>(
      '[data-workspace-shell-window-manager="true"]',
    );
    const panel = host.querySelector<HTMLElement>(
      '[role="tabpanel"][aria-label="Active saved view"]',
    );
    if (!tabBar || !manager || !panel) {
      throw new Error("Expected saved-view tabs, panel, and window manager.");
    }
    expect(tab.getAttribute("role")).toBe("tab");
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(manager.style.insetBlockEnd).toBe("36px");
  });

  it("focuses the first saved-view activation control when layout editing is read-only", async () => {
    await act(async () => {
      enableWorkspaceSavedViews(testWorkspace.host, {
        id: "overview",
        name: "Overview",
      });
      testWorkspace.capabilities.setState({ canEditLayout: false });
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness includeBuiltInSavedViews onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });
    await resizeShell(800);

    await act(async () => {
      getButton("Saved Views").click();
    });

    const createButton = host.querySelector<HTMLButtonElement>(
      ".setta-workspace-saved-views-create",
    );
    const activateOverviewButton = host.querySelector<HTMLButtonElement>(
      '[data-workspace-saved-view-id="overview"] .setta-workspace-saved-views-activate',
    );
    if (!createButton || !activateOverviewButton) {
      throw new Error("Expected saved-view controls.");
    }
    expect(createButton.disabled).toBe(true);
    expect(activateOverviewButton.disabled).toBe(false);
    expect(document.activeElement).toBe(activateOverviewButton);
  });

  it("prepends the built-in Inspector and focuses its reference empty state", async () => {
    await act(async () => {
      getButton("Inspector").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const inspector = host.querySelector<HTMLElement>(
      '[aria-label="Workspace Inspector selection"]',
    );
    expect(inspector?.textContent).toContain("Select A Section to Edit");
    expect(document.activeElement).toBe(inspector);
    expect(getButton("Inspector").getAttribute("aria-selected")).toBe("true");
  });

  it("leaves the trailing rail entirely host-owned when the built-in Inspector is omitted", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness includeBuiltInInspector={false} onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });

    expect(host.querySelector('button[aria-label="Inspector"]')).toBeNull();
    expect(getButton("Details").getAttribute("aria-selected")).toBe("true");
    expect(getButton("Activity")).not.toBeNull();
  });

  it("opens a registered tab into its requested focus target and restores its rail tab on close", async () => {
    await act(async () => {
      getButton("Guide").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const closeButton = host.querySelector<HTMLButtonElement>(
      "button:not([aria-label])",
    );
    expect(closeButton?.textContent).toBe("Close guide");
    expect(document.activeElement).toBe(closeButton);
    expect(getButton("Guide").getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.activeElement).toBe(getButton("Guide"));
    expect(getButton("Guide").getAttribute("aria-expanded")).toBe("false");
    expect(
      host
        .querySelector(
          '[data-workspace-shell-pane-region="leading"] .setta-workspace-shell-pane',
        )
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(host.textContent).toContain("Close guide");
  });

  it("uses a roving tab stop with Arrow and Home or End navigation", async () => {
    const detailsTab = getButton("Details");
    detailsTab.focus();
    await act(async () => {
      detailsTab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });

    expect(document.activeElement).toBe(getButton("Activity"));
    expect(getButton("Activity").tabIndex).toBe(0);
    expect(getButton("Details").tabIndex).toBe(-1);
    expect(host.textContent).toContain("Activity content");

    await act(async () => {
      getButton("Activity").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Home" }),
      );
    });
    expect(document.activeElement).toBe(getButton("Inspector"));
    expect(host.textContent).toContain("Select A Section to Edit");
  });

  it("keeps disabled contextual tabs visible, skips them while roving, and normalizes selection once", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <ContextualTrailingTabsHarness
              activityDisabled={false}
              onChange={onChange}
            />
          }
        </WorkspaceTestProvider>,
      );
    });
    await resizeShell(800);

    await act(async () => {
      getButton("Activity").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(getButton("Activity").getAttribute("aria-selected")).toBe("true");
    onChange.mockClear();

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {
            <ContextualTrailingTabsHarness
              activityDisabled
              onChange={onChange}
            />
          }
        </WorkspaceTestProvider>,
      );
    });

    const activity = getButton("Activity");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].trailing).toMatchObject({
      rememberedNonFullWidth: 500,
      selectedTabId: "details",
      visible: true,
      width: 500,
    });
    expect(activity.disabled).toBe(true);
    expect(activity.getAttribute("aria-disabled")).toBe("true");
    expect(activity.getAttribute("aria-selected")).toBe("false");
    expect(activity.getAttribute("data-disabled")).toBe("true");
    onChange.mockClear();

    await act(async () => {
      activity.click();
    });
    expect(onChange).not.toHaveBeenCalled();

    const details = getButton("Details");
    details.focus();
    await act(async () => {
      details.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    expect(document.activeElement).toBe(getButton("History"));
    expect(getButton("History").getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      getButton("History").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Home" }),
      );
    });
    expect(document.activeElement).toBe(getButton("Details"));

    await act(async () => {
      getButton("Details").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      );
    });
    expect(document.activeElement).toBe(getButton("History"));
  });

  it("resizes by keyboard in logical direction and exposes separator values", async () => {
    const handle = getResizeHandle("leading");
    expect(handle.getAttribute("aria-valuenow")).toBe("335");
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "345",
    );

    const rtlHandle = getResizeHandle("leading");
    rtlHandle.style.direction = "rtl";
    await act(async () => {
      rtlHandle.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
          shiftKey: true,
        }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "344",
    );

    await act(async () => {
      getButton("Details").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await act(async () => {
      getResizeHandle("leading").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "760",
    );
    expect(getButton("Details").getAttribute("aria-expanded")).toBe("false");
  });

  it("renders pointer resize live and commits the final release sample once", async () => {
    const handle = getResizeHandle("leading");
    Object.defineProperties(handle, {
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
      setPointerCapture: { value: vi.fn() },
    });

    await act(async () => {
      handle.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100 }));
    });
    await act(async () => {
      handle.dispatchEvent(createPointerEvent("pointermove", { clientX: 150 }));
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "385",
    );
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      handle.dispatchEvent(createPointerEvent("pointerup", { clientX: 175 }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].leading.width).toBe(410);
  });

  it("expands to the measured full width, closes the opposite pane, and restores width", async () => {
    await act(async () => {
      getButton("Details").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const fullWidthButton = getButton("Expand Notes pane to full width");
    fullWidthButton.focus();
    await act(async () => {
      fullWidthButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "760",
    );
    expect(getButton("Details").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(getButton("Restore Notes pane width"));

    await act(async () => {
      getButton("Restore Notes pane width").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe(
      "300",
    );
  });

  it("shifts the map by the leading pane true-width delta by default", async () => {
    await act(async () => {
      getButton("Notes").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenCalledOnce();
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenLastCalledWith(
      testWorkspace.host,
      -295,
    );

    await act(async () => {
      getButton("Notes").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenCalledTimes(2);
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenLastCalledWith(
      testWorkspace.host,
      295,
    );
  });

  it("lets hosts disable leading-pane map shifts and never shifts for the trailing pane", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<Harness leadingPaneShiftsCanvas={false} onChange={onChange} />}
        </WorkspaceTestProvider>,
      );
    });
    shiftWorkspaceMapForLeadingPane.mockClear();

    await act(async () => {
      getButton("Notes").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await act(async () => {
      getButton("Details").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(shiftWorkspaceMapForLeadingPane).not.toHaveBeenCalled();
  });
});
