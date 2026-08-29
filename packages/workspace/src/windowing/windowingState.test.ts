import { describe, expect, it } from "vitest";
import {
  clampWorkspaceFloatingWindowBounds,
  closeWorkspaceWindow,
  createDefaultWorkspaceFloatingWindowBounds,
  dockWorkspaceWindow,
  focusWorkspaceWindow,
  getWorkspaceWindowStackingOrder,
  maximizeWorkspaceWindow,
  minimizeWorkspaceWindow,
  moveWorkspaceFloatingWindow,
  moveWorkspaceWindowToCanvasSection,
  openWorkspaceFloatingWindow,
  renameWorkspaceWindow,
  reopenWorkspaceWindow,
  resizeWorkspaceFloatingWindow,
  restoreWorkspaceWindow,
  setWorkspaceWindowDockLayoutAtomically,
  setWorkspaceWindowBoundsAtomically,
  showWorkspaceSectionInFloatingWindow,
  snapWorkspaceFloatingWindow,
  undockWorkspaceWindow,
} from "./windowingState";
import {
  createWorkspaceFloatingWindow,
  createWorkspaceWindowingState,
  isWorkspaceWindowVisible,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowViewport,
  WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
  WorkspaceWindowingError,
} from "./windowingTypes";

const viewport: WorkspaceWindowViewport = {
  width: 1_440,
  height: 900,
  insets: { left: 40, right: 40, top: 40, bottom: 0 },
};

function makeWindow(
  id: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindowInput {
  return {
    id,
    contentId: `content-${id}`,
    surfaceKind: "example",
    title: `Window ${id}`,
    rendererData: { id },
    sectionId: null,
    bounds: { x: 100, y: 120, width: 500, height: 300 },
    restorePlacement: null,
    dockMetrics: { preferredWidthPx: 460, widthFraction: 1 },
    ...overrides,
  };
}

describe("workspace floating window state", () => {
  it("uses the frozen centered default float geometry", () => {
    expect(createDefaultWorkspaceFloatingWindowBounds(viewport)).toEqual({
      x: 310,
      y: 155,
      width: 820,
      height: 630,
    });
  });

  it("constructs explicit placement metadata and rejects incompatible section or dock input", () => {
    const defaulted = createWorkspaceFloatingWindow({
      id: "defaulted",
      contentId: "content-defaulted",
      surfaceKind: "example",
      title: "Defaulted",
      rendererData: null,
      bounds: { x: 100, y: 120, width: 500, height: 300 },
    });
    expect(defaulted).toMatchObject({
      sectionId: null,
      placement: "floating",
      restorePlacement: null,
      dockMetrics: { preferredWidthPx: 460, widthFraction: 1 },
    });

    expect(() =>
      createWorkspaceFloatingWindow(
        makeWindow("section-with-generic-surface", { sectionId: "section-a" }),
      ),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      createWorkspaceFloatingWindow({
        ...makeWindow("reserved-without-section"),
        surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
      }),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      createWorkspaceFloatingWindow({
        ...makeWindow("canvas-without-section"),
        placement: "canvas_section",
      }),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      createWorkspaceFloatingWindow({
        ...makeWindow("bad-dock-metrics"),
        dockMetrics: { preferredWidthPx: 0, widthFraction: 1.1 },
      }),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      createWorkspaceWindowingState({
        windows: [
          makeWindow("section-a", {
            sectionId: "same-section",
            surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          }),
          makeWindow("section-b", {
            sectionId: "same-section",
            surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          }),
        ],
      }),
    ).toThrow(WorkspaceWindowingError);
  });

  it("resolves equal z-indexes by stable state order and raises the focused window", () => {
    const state = createWorkspaceWindowingState({
      windows: [
        makeWindow("first", { zIndex: 0 }),
        makeWindow("second", { zIndex: 0 }),
      ],
      nextFocusOrder: 1,
    });

    expect(
      getWorkspaceWindowStackingOrder(state).map((window) => window.id),
    ).toEqual(["first", "second"]);
    expect(
      focusWorkspaceWindow(state, "first").windows.map(
        (window) => window.zIndex,
      ),
    ).toEqual([1, 0]);
  });

  it("clamps free movement and resizing while preserving a reachable title bar", () => {
    expect(
      clampWorkspaceFloatingWindowBounds(
        { x: -9_000, y: 9_000, width: 20, height: 20 },
        viewport,
      ),
    ).toEqual({ x: -220, y: 868, width: 380, height: 240 });

    const state = createWorkspaceWindowingState({ windows: [makeWindow("a")] });
    const moved = moveWorkspaceFloatingWindow(
      state,
      "a",
      { x: -9_000, y: 9_000 },
      viewport,
    );
    expect(moved.windows[0]?.bounds).toMatchObject({ x: -340, y: 868 });
    const resized = resizeWorkspaceFloatingWindow(
      moved,
      "a",
      { x: 0, y: 0, width: 20, height: 20 },
      viewport,
    );
    expect(resized.windows[0]?.bounds).toMatchObject({
      width: 380,
      height: 240,
    });
  });

  it("caches ordinary free bounds when snapping even if an external input had no cache", () => {
    const freeBounds = { x: 100, y: 120, width: 500, height: 300 };
    const state = createWorkspaceWindowingState({
      windows: [
        makeWindow("a", { bounds: freeBounds, lastUnsnappedBounds: null }),
      ],
    });

    const snapped = snapWorkspaceFloatingWindow(state, "a", "left", viewport);
    expect(snapped.windows[0]?.lastUnsnappedBounds).toEqual(freeBounds);
  });

  it("opens, maximizes, restores, minimizes, closes, and reopens without losing floating bounds", () => {
    const opened = openWorkspaceFloatingWindow(
      createWorkspaceWindowingState(),
      {
        id: "a",
        contentId: "content-a",
        surfaceKind: "example",
        title: "A",
        rendererData: { value: 1 },
      },
      viewport,
    );
    const originalBounds = opened.windows[0]?.bounds;
    expect(originalBounds).toBeDefined();
    if (!originalBounds) {
      throw new Error("Expected an opened window.");
    }

    const maximized = maximizeWorkspaceWindow(opened, "a");
    expect(maximized.windows[0]).toMatchObject({
      placement: "maximized",
      restoreBounds: originalBounds,
      restorePlacement: "floating",
    });
    const restored = restoreWorkspaceWindow(maximized, "a");
    expect(restored.windows[0]).toMatchObject({
      placement: "floating",
      bounds: originalBounds,
      restoreBounds: null,
    });
    const minimized = minimizeWorkspaceWindow(restored, "a");
    expect(minimized.windows[0]?.isMinimized).toBe(true);
    expect(reopenWorkspaceWindow(minimized, "a").windows[0]?.isMinimized).toBe(
      false,
    );
    const closed = closeWorkspaceWindow(restored, "a");
    expect(closed.windows[0]).toMatchObject({
      isClosed: true,
      isMinimized: false,
    });
    expect(reopenWorkspaceWindow(closed, "a").windows[0]).toMatchObject({
      isClosed: false,
      isMinimized: false,
    });
  });

  it("creates, reuses, externalizes, and returns one section binding to canvas ownership", () => {
    const initial = createWorkspaceWindowingState({
      windows: [makeWindow("generic", { zIndex: 5 })],
      nextFocusOrder: 6,
    });
    const shown = showWorkspaceSectionInFloatingWindow(
      initial,
      {
        id: "section-window",
        contentId: "section-content-a",
        sectionId: "section-a",
        title: "Section A",
      },
      viewport,
    );
    const sectionWindow = shown.windows.find(
      (window) => window.id === "section-window",
    );
    expect(sectionWindow).toMatchObject({
      sectionId: "section-a",
      surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
      placement: "floating",
      isClosed: false,
      isMinimized: false,
      zIndex: 6,
    });
    expect(shown.nextFocusOrder).toBe(7);

    const canvasOwned = moveWorkspaceWindowToCanvasSection(
      shown,
      "section-window",
    );
    expect(canvasOwned.windows.find((window) => window.id === "section-window"))
      .toMatchObject({
        placement: "canvas_section",
        isClosed: false,
        isMinimized: false,
      });
    expect(
      isWorkspaceWindowVisible(
        canvasOwned.windows.find((window) => window.id === "section-window")!,
      ),
    ).toBe(false);

    const reshown = showWorkspaceSectionInFloatingWindow(
      canvasOwned,
      {
        id: "ignored-new-id",
        contentId: "ignored-new-content",
        sectionId: "section-a",
        title: "Renamed section metadata",
      },
      viewport,
    );
    expect(reshown.windows.filter((window) => window.sectionId === "section-a"))
      .toHaveLength(1);
    expect(reshown.windows.find((window) => window.sectionId === "section-a"))
      .toMatchObject({ id: "section-window", placement: "floating" });
  });

  it("prevents canvas-owned section windows from receiving lifecycle or floating mutations", () => {
    const canvasOwned = createWorkspaceWindowingState({
      windows: [
        makeWindow("section", {
          sectionId: "section-a",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          placement: "canvas_section",
        }),
      ],
    });
    expect(() => focusWorkspaceWindow(canvasOwned, "section")).toThrow(
      WorkspaceWindowingError,
    );
    expect(() => reopenWorkspaceWindow(canvasOwned, "section")).toThrow(
      WorkspaceWindowingError,
    );
    expect(() => minimizeWorkspaceWindow(canvasOwned, "section")).toThrow(
      WorkspaceWindowingError,
    );
    expect(() => closeWorkspaceWindow(canvasOwned, "section")).toThrow(
      WorkspaceWindowingError,
    );
    expect(() =>
      moveWorkspaceFloatingWindow(
        canvasOwned,
        "section",
        { x: 1, y: 1 },
        viewport,
      ),
    ).toThrow(WorkspaceWindowingError);
  });

  it("docks, undocks, and restores maximized windows to their prior external host", () => {
    const initial = createWorkspaceWindowingState({ windows: [makeWindow("a")] });
    const docked = dockWorkspaceWindow(initial, "a");
    expect(docked.windows[0]).toMatchObject({ placement: "bottom_docked" });

    const maximizedDock = maximizeWorkspaceWindow(docked, "a");
    expect(maximizedDock.windows[0]).toMatchObject({
      placement: "maximized",
      restorePlacement: "bottom_docked",
    });
    expect(restoreWorkspaceWindow(maximizedDock, "a").windows[0]).toMatchObject(
      { placement: "bottom_docked" },
    );

    const minimizedDock = minimizeWorkspaceWindow(docked, "a");
    const undocked = undockWorkspaceWindow(minimizedDock, "a", viewport);
    expect(undocked.windows[0]).toMatchObject({
      placement: "floating",
      isMinimized: false,
      isClosed: false,
    });

    const maximizedFloat = maximizeWorkspaceWindow(undocked, "a");
    expect(restoreWorkspaceWindow(maximizedFloat, "a").windows[0]).toMatchObject(
      { placement: "floating" },
    );
  });

  it("updates dock bounds and metrics atomically after validating every target", () => {
    const docked = dockWorkspaceWindow(
      createWorkspaceWindowingState({
        windows: [makeWindow("a"), makeWindow("b")],
      }),
      "a",
    );
    const bothDocked = dockWorkspaceWindow(docked, "b");
    const updated = setWorkspaceWindowDockLayoutAtomically(bothDocked, [
      {
        id: "a",
        bounds: { x: 0, y: 220, width: 360, height: 480 },
        dockMetrics: { preferredWidthPx: 360, widthFraction: 0.4 },
      },
      {
        id: "b",
        bounds: { x: 372, y: 220, width: 540, height: 480 },
        dockMetrics: { preferredWidthPx: 540, widthFraction: 0.6 },
      },
    ]);
    expect(updated.windows.map((window) => window.dockMetrics.widthFraction)).toEqual([
      0.4,
      0.6,
    ]);

    expect(() =>
      setWorkspaceWindowDockLayoutAtomically(updated, [
        {
          id: "a",
          bounds: { x: 0, y: 100, width: 400, height: 400 },
          dockMetrics: { preferredWidthPx: 400, widthFraction: 0.5 },
        },
        {
          id: "missing",
          bounds: { x: 400, y: 100, width: 400, height: 400 },
          dockMetrics: { preferredWidthPx: 400, widthFraction: 0.5 },
        },
      ]),
    ).toThrow(WorkspaceWindowingError);
    expect(updated.windows[0]?.dockMetrics).toEqual({
      preferredWidthPx: 360,
      widthFraction: 0.4,
    });
  });

  it("validates complete bounds batches before producing any next state", () => {
    const state = createWorkspaceWindowingState({
      windows: [makeWindow("a"), makeWindow("b")],
    });
    expect(() =>
      setWorkspaceWindowBoundsAtomically(state, [
        { id: "a", bounds: { x: 1, y: 1, width: 400, height: 300 } },
        { id: "missing", bounds: { x: 2, y: 2, width: 400, height: 300 } },
      ]),
    ).toThrow(WorkspaceWindowingError);
    expect(state.windows[0]?.bounds).toEqual({
      x: 100,
      y: 120,
      width: 500,
      height: 300,
    });
  });

  it("rejects layout mutations when a host marks layout editing disabled while allowing reopen", () => {
    const closed = createWorkspaceWindowingState({
      windows: [makeWindow("a", { isClosed: true })],
    });
    expect(() =>
      renameWorkspaceWindow(closed, "a", "Renamed", { layoutEditable: false }),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      showWorkspaceSectionInFloatingWindow(
        closed,
        {
          id: "section-window",
          contentId: "section-content-a",
          sectionId: "section-a",
          title: "Section A",
        },
        viewport,
        { layoutEditable: false },
      ),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      dockWorkspaceWindow(closed, "a", { layoutEditable: false }),
    ).toThrow(WorkspaceWindowingError);
    expect(() =>
      setWorkspaceWindowDockLayoutAtomically(
        closed,
        [
          {
            id: "a",
            bounds: { x: 0, y: 100, width: 400, height: 400 },
            dockMetrics: { preferredWidthPx: 400, widthFraction: 1 },
          },
        ],
        { layoutEditable: false },
      ),
    ).toThrow(WorkspaceWindowingError);
    expect(reopenWorkspaceWindow(closed, "a").windows[0]?.isClosed).toBe(false);
  });
});
