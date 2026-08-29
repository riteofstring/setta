/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceBottomDock,
  type WorkspaceBottomDockProps,
  type WorkspaceBottomDockRenderWindow,
} from "./WorkspaceBottomDock";
import type { WorkspaceWindowDockLayoutUpdate } from "./windowingState";
import {
  createWorkspaceFloatingWindow,
  type WorkspaceFloatingWindow,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowViewport,
} from "./windowingTypes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORT: WorkspaceWindowViewport = {
  height: 800,
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
  width: 1000,
};

function makeWindow(
  id: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindow {
  return createWorkspaceFloatingWindow({
    bounds: { height: 320, width: 460, x: 20, y: 30 },
    contentId: `content-${id}`,
    id,
    placement: "bottom_docked",
    rendererData: { id },
    sectionId: `section-${id}`,
    surfaceKind: "workspace_section",
    title: `Window ${id}`,
    zIndex: Number(id.replace(/\D/g, "")) || 1,
    ...overrides,
  });
}

const renderWindow: WorkspaceBottomDockRenderWindow = (window, options) => (
  <div
    data-testid="workspace-bottom-dock-rendered-window"
    data-window-id={window.id}
  >
    <span
      data-testid={`workspace-bottom-dock-rendered-window-title-${window.id}`}
    >
      {window.title}
    </span>
    <span data-testid={`workspace-bottom-dock-drag-${window.id}`}>
      {String(options.titleDragAffordance.enabled)}
    </span>
    {options.actions.map((action) => (
      <button
        key={action.id}
        type="button"
        data-testid={action.testId}
        data-window-id={window.id}
        disabled={action.disabled}
        onClick={action.onClick}
      >
        {action.label}
      </button>
    ))}
  </div>
);

function createCallbacks() {
  return {
    onCloseWindow: vi.fn<(windowId: string) => void>(),
    onDockLayoutCommit:
      vi.fn<(updates: readonly WorkspaceWindowDockLayoutUpdate[]) => void>(),
    onFocusWindow: vi.fn<(windowId: string) => void>(),
    onMaximizeWindow: vi.fn<(windowId: string) => void>(),
    onMinimizeWindow: vi.fn<(windowId: string) => void>(),
    onMoveWindowToCanvasSection: vi.fn<(windowId: string) => void>(),
    onMoveWindowToFloating: vi.fn<(windowId: string) => void>(),
    onReopenWindow: vi.fn<(windowId: string) => void>(),
  };
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

describe("WorkspaceBottomDock", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function mount({
    layoutEditable = true,
    viewport = VIEWPORT,
    windows = [],
    callbacks = createCallbacks(),
  }: {
    layoutEditable?: boolean;
    viewport?: WorkspaceWindowViewport | null;
    windows?: readonly WorkspaceFloatingWindow[];
    callbacks?: ReturnType<typeof createCallbacks>;
  } = {}): Promise<ReturnType<typeof createCallbacks>> {
    const props: WorkspaceBottomDockProps = {
      ...callbacks,
      layoutEditable,
      renderWindow,
      viewport,
      windows,
    };
    await act(async () => root.render(<WorkspaceBottomDock {...props} />));
    return callbacks;
  }

  function dockPanelIds(): string[] {
    return [
      ...host.querySelectorAll<HTMLElement>(
        '[data-testid="workspace-bottom-dock-window-panel"]',
      ),
    ].map((panel) => panel.dataset.workspaceWindowId ?? "");
  }

  it("shows the last fitting docked panels and exposes hidden panels as recovery pills", async () => {
    const callbacks = await mount({
      windows: [makeWindow("one"), makeWindow("two"), makeWindow("three")],
    });

    expect(dockPanelIds()).toEqual(["two", "three"]);
    const recoveryPill = host.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-bottom-dock-pill"][data-workspace-window-id="one"]',
    );
    expect(recoveryPill).not.toBeNull();

    await act(async () => recoveryPill?.click());
    expect(callbacks.onFocusWindow).toHaveBeenCalledWith("one");
    expect(dockPanelIds()).toEqual(["one", "two"]);
  });

  it("passes the frozen dock header action order and disables title dragging", async () => {
    await mount({
      windows: [makeWindow("one"), makeWindow("two"), makeWindow("three")],
    });

    const actions = [
      ...host.querySelectorAll<HTMLButtonElement>(
        'button[data-window-id="three"]',
      ),
    ].map((button) => button.textContent);
    expect(actions).toEqual([
      "Show previous docked window",
      "Show next docked window",
      "Show Window three in canvas",
      "Undock Window three",
      "Maximize Window three",
      "Minimize Window three",
      "Close Window three",
    ]);
    expect(
      host.querySelector('[data-testid="workspace-bottom-dock-drag-three"]')
        ?.textContent,
    ).toBe("false");
  });

  it("keeps focus and reopen available in read-only mode while hiding layout mutations", async () => {
    const callbacks = await mount({
      layoutEditable: false,
      windows: [
        makeWindow("visible"),
        makeWindow("minimized", { isMinimized: true, placement: "floating" }),
      ],
    });

    expect(
      host.querySelectorAll(
        '[data-testid="workspace-bottom-dock-resize-handle"]',
      ),
    ).toHaveLength(0);
    expect(
      host.querySelectorAll(
        '[data-testid="workspace-bottom-dock-window-close"]',
      ),
    ).toHaveLength(0);

    const panel = host.querySelector<HTMLElement>(
      '[data-testid="workspace-bottom-dock-window-panel"]',
    );
    await act(async () =>
      panel?.dispatchEvent(
        createPointerEvent("pointerdown", { clientX: 1, clientY: 1 }),
      ),
    );
    expect(callbacks.onFocusWindow).toHaveBeenCalledWith("visible");

    const pill = host.querySelector<HTMLButtonElement>(
      '[data-workspace-window-id="minimized"]',
    );
    await act(async () => pill?.click());
    expect(callbacks.onReopenWindow).toHaveBeenCalledWith("minimized");
  });

  it("uses the narrow overflow menu for multiple recovery pills", async () => {
    await mount({
      viewport: { ...VIEWPORT, width: 520 },
      windows: [
        makeWindow("one", { isMinimized: true, placement: "floating" }),
        makeWindow("two", { isMinimized: true, placement: "floating" }),
      ],
    });

    const strip = host.querySelector<HTMLElement>(
      '[data-testid="workspace-bottom-dock-strip"]',
    );
    expect(strip?.dataset.pillDisplayMode).toBe("menu");
    expect(
      host.querySelectorAll(
        '[data-testid="workspace-bottom-dock-overflow-menu-item"]',
      ),
    ).toHaveLength(2);
  });

  it("matches the reference manager actions for visible, hidden, and canvas windows", async () => {
    const callbacks = await mount({
      windows: [
        makeWindow("visible", { placement: "floating" }),
        makeWindow("closed", { isClosed: true, placement: "floating" }),
        makeWindow("canvas", { placement: "canvas_section" }),
      ],
    });
    const row = (id: string) => {
      const element = host.querySelector<HTMLElement>(
        `[data-testid="workspace-bottom-dock-manager-row"][data-workspace-window-id="${id}"]`,
      );
      if (!element) throw new Error(`Expected manager row ${id}.`);
      return element;
    };
    const actionTestIds = (id: string) =>
      [...row(id).querySelectorAll<HTMLButtonElement>("button")].map(
        (button) => button.dataset.testid,
      );

    expect(actionTestIds("visible")).toEqual([
      "workspace-bottom-dock-manager-move-to-canvas",
      "workspace-bottom-dock-manager-hide",
      "workspace-bottom-dock-manager-focus",
    ]);
    expect(actionTestIds("closed")).toEqual([
      "workspace-bottom-dock-manager-move-to-canvas",
      "workspace-bottom-dock-manager-reopen",
    ]);
    expect(actionTestIds("canvas")).toEqual([
      "workspace-bottom-dock-manager-float",
    ]);

    await act(async () => {
      row("visible")
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-bottom-dock-manager-hide"]',
        )
        ?.click();
      row("closed")
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-bottom-dock-manager-reopen"]',
        )
        ?.click();
      row("canvas")
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-bottom-dock-manager-float"]',
        )
        ?.click();
    });

    expect(callbacks.onMinimizeWindow).toHaveBeenCalledWith("visible");
    expect(callbacks.onReopenWindow).toHaveBeenCalledWith("closed");
    expect(callbacks.onMoveWindowToFloating).toHaveBeenCalledWith("canvas");
  });

  it("previews a six-handle resize and commits one complete dock layout on release", async () => {
    const callbacks = await mount({
      viewport: { ...VIEWPORT, width: 1200 },
      windows: [makeWindow("one")],
    });
    const handle = host.querySelector<HTMLElement>(
      '[data-testid="workspace-bottom-dock-resize-handle"][data-direction="bottom_right"]',
    );
    if (!handle)
      throw new Error("Expected the bottom-right dock resize handle.");
    expect(
      host.querySelectorAll(
        '[data-testid="workspace-bottom-dock-resize-handle"]',
      ),
    ).toHaveLength(6);

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", { clientX: 10, clientY: 10 }),
      );
      handle.dispatchEvent(
        createPointerEvent("pointermove", { clientX: 110, clientY: 90 }),
      );
      handle.dispatchEvent(
        createPointerEvent("pointerup", { clientX: 110, clientY: 90 }),
      );
    });

    expect(callbacks.onDockLayoutCommit).toHaveBeenCalledTimes(1);
    expect(callbacks.onDockLayoutCommit).toHaveBeenCalledWith([
      expect.objectContaining({
        bounds: expect.objectContaining({ height: 400, width: 560 }),
        dockMetrics: expect.objectContaining({ preferredWidthPx: 560 }),
        id: "one",
      }),
    ]);
  });
});

describe("workspace bottom dock stylesheet", () => {
  const styles = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../styles/workspaceBottomDock.css",
    ),
    "utf8",
  );

  it("includes dock panel, recovery, manager, dark, narrow, and motion treatments", () => {
    expect(styles).toContain("min-inline-size: 280px");
    expect(styles).toContain("block-size: 28px");
    expect(styles).toContain(".setta-workspace-bottom-dock-manager-menu");
    expect(styles).toContain(".setta-workspace-dark");
    expect(styles).toContain("@container (max-width: 32.5rem)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
