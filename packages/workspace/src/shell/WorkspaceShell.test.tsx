/* @vitest-environment jsdom */

import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { WorkspaceShell } from "./WorkspaceShell";
import { createWorkspaceShellViewState } from "./workspaceShellLayout";
import type {
  WorkspaceShellTabDefinition,
  WorkspaceShellTabIconProps,
  WorkspaceShellViewState,
} from "./workspaceShellTypes";

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
vi.mock("../tooltip/WorkspaceTooltip", () => ({
  WorkspaceTooltip: () => <div data-testid="workspace-tooltip" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

globalThis.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver;

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
  leadingPaneShiftsCanvas = true,
  onChange,
}: {
  leadingPaneShiftsCanvas?: boolean;
  onChange: (viewState: WorkspaceShellViewState) => void;
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
      leadingPaneShiftsCanvas={leadingPaneShiftsCanvas}
      leadingTabs={leadingTabs}
      onViewStateChange={(nextState) => {
        onChange(nextState);
        setViewState(nextState);
      }}
      trailingTabs={trailingTabs}
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
    useReactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onChange = vi.fn();
    await act(async () => {
      root.render(<Harness onChange={onChange} />);
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
    useReactFlow.setState({ ...initialCanvasState });
  });

  function getShell(): HTMLElement {
    const shell = host.querySelector<HTMLElement>("[data-workspace-shell]");
    if (!shell) {
      throw new Error("Expected the workspace shell root.");
    }
    return shell;
  }

  function getButton(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) {
      throw new Error(`Expected button ${label}.`);
    }
    return button;
  }

  function getResizeHandle(pane: "leading" | "trailing"): HTMLDivElement {
    const handle = host.querySelector<HTMLDivElement>(`[data-workspace-shell-resize="${pane}"]`);
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
      Array.from(host.querySelectorAll("aside")).map((aside) => aside.getAttribute("aria-label")),
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
    expect(host.querySelector('[role="tabpanel"] h2')?.textContent).toBe("Notes");
    expect(host.textContent).toContain("Notes content");
    expect(host.textContent).toContain("Details content");
    expect(
      host
        .querySelector('[data-workspace-shell-pane-region="trailing"] .setta-workspace-shell-pane')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(host.querySelector('[data-testid="workspace-canvas"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="workspace-controls"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="workspace-tooltip"]')).not.toBeNull();
    expect(useReactFlow.getState().viewportInsets).toEqual({
      top: 0,
      right: 40,
      bottom: 0,
      left: 335,
    });

    const leadingRegion = host.querySelector<HTMLElement>(
      '[data-workspace-shell-pane-region="leading"]',
    );
    const rail = leadingRegion?.querySelector('[data-workspace-shell-rail="leading"]');
    const panel = leadingRegion?.querySelector('[data-workspace-shell-panel="leading"]');
    const resizeHandle = leadingRegion?.querySelector('[data-workspace-shell-resize="leading"]');
    if (!rail || !panel || !resizeHandle) {
      throw new Error("Expected the leading rail, panel, and resize handle.");
    }
    expect(rail.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(panel.compareDocumentPosition(resizeHandle) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("updates the visible canvas insets when a pane closes", async () => {
    await act(async () => {
      getButton("Notes").click();
    });

    expect(useReactFlow.getState().viewportInsets).toEqual({
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
      getButton("Outline").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const tree = host.querySelector<HTMLElement>('[role="tree"][aria-label="Workspace outline"]');
    const filter = host.querySelector<HTMLInputElement>(".setta-workspace-outline-filter-input");
    expect(tree?.textContent).toContain("No sections");
    expect(tree?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(filter);
    expect(getButton("Outline").getAttribute("aria-selected")).toBe("true");
  });

  it("prepends the built-in Inspector and focuses its reference empty state", async () => {
    await act(async () => {
      getButton("Inspector").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const inspector = host.querySelector<HTMLElement>(
      '[aria-label="Workspace Inspector selection"]',
    );
    expect(inspector?.textContent).toContain("Select A Section to Edit");
    expect(document.activeElement).toBe(inspector);
    expect(getButton("Inspector").getAttribute("aria-selected")).toBe("true");
  });

  it("opens a registered tab into its requested focus target and restores its rail tab on close", async () => {
    await act(async () => {
      getButton("Guide").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const closeButton = host.querySelector<HTMLButtonElement>("button:not([aria-label])");
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
        .querySelector('[data-workspace-shell-pane-region="leading"] .setta-workspace-shell-pane')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(host.textContent).toContain("Close guide");
  });

  it("uses a roving tab stop with Arrow and Home or End navigation", async () => {
    const detailsTab = getButton("Details");
    detailsTab.focus();
    await act(async () => {
      detailsTab.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
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

  it("resizes by keyboard in logical direction and exposes separator values", async () => {
    const handle = getResizeHandle("leading");
    expect(handle.getAttribute("aria-valuenow")).toBe("335");
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("345");

    const rtlHandle = getResizeHandle("leading");
    rtlHandle.style.direction = "rtl";
    await act(async () => {
      rtlHandle.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight", shiftKey: true }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("344");

    await act(async () => {
      getButton("Details").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      getResizeHandle("leading").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("760");
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
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("385");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      handle.dispatchEvent(createPointerEvent("pointerup", { clientX: 175 }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].leading.width).toBe(410);
  });

  it("expands to the measured full width, closes the opposite pane, and restores width", async () => {
    await act(async () => {
      getButton("Details").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const fullWidthButton = getButton("Expand Notes pane to full width");
    fullWidthButton.focus();
    await act(async () => {
      fullWidthButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("760");
    expect(getButton("Details").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(getButton("Restore Notes pane width"));

    await act(async () => {
      getButton("Restore Notes pane width").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(getResizeHandle("leading").getAttribute("aria-valuenow")).toBe("300");
  });

  it("shifts the map by the leading pane true-width delta by default", async () => {
    await act(async () => {
      getButton("Notes").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenCalledOnce();
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenLastCalledWith(-295);

    await act(async () => {
      getButton("Notes").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenCalledTimes(2);
    expect(shiftWorkspaceMapForLeadingPane).toHaveBeenLastCalledWith(295);
  });

  it("lets hosts disable leading-pane map shifts and never shifts for the trailing pane", async () => {
    await act(async () => {
      root.render(<Harness leadingPaneShiftsCanvas={false} onChange={onChange} />);
    });
    shiftWorkspaceMapForLeadingPane.mockClear();

    await act(async () => {
      getButton("Notes").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      getButton("Details").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(shiftWorkspaceMapForLeadingPane).not.toHaveBeenCalled();
  });
});
