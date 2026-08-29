import { describe, expect, it } from "vitest";
import {
  clampWorkspaceFloatingWindowBounds,
  closeWorkspaceWindow,
  createDefaultWorkspaceFloatingWindowBounds,
  focusWorkspaceWindow,
  getWorkspaceWindowStackingOrder,
  maximizeWorkspaceWindow,
  minimizeWorkspaceWindow,
  moveWorkspaceFloatingWindow,
  openWorkspaceFloatingWindow,
  renameWorkspaceWindow,
  reopenWorkspaceWindow,
  resizeWorkspaceFloatingWindow,
  restoreWorkspaceWindow,
  setWorkspaceWindowBoundsAtomically,
  snapWorkspaceFloatingWindow,
} from "./windowingState";
import {
  createWorkspaceWindowingState,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowViewport,
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
    bounds: { x: 100, y: 120, width: 500, height: 300 },
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
    expect(reopenWorkspaceWindow(closed, "a").windows[0]?.isClosed).toBe(false);
  });
});
