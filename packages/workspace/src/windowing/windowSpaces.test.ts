import { describe, expect, it } from "vitest";
import {
  canSnapshotWorkspaceWindowSpace,
  createWorkspaceWindowSpace,
  restoreWorkspaceWindowSpace,
  snapshotWorkspaceWindowSpace,
} from "./windowSpaces.js";
import {
  buildWorkspaceFloatingSnapBounds,
  classifyWorkspaceFloatingSnapPreset,
} from "./windowingSnapLayout.js";
import { focusWorkspaceWindow } from "./windowingState.js";
import {
  createWorkspaceWindowingState,
  WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes.js";

const viewport: WorkspaceWindowViewport = {
  width: 1_000,
  height: 800,
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

describe("Workspace Window Spaces", () => {
  it("snapshots only visible floating windows with normalized bounds and stable stacking order", () => {
    const left = buildWorkspaceFloatingSnapBounds("left", viewport);
    const state = createWorkspaceWindowingState({
      windows: [
        makeWindow("floating", { bounds: left, zIndex: 2 }),
        makeWindow("minimized", { isMinimized: true }),
        makeWindow("closed", { isClosed: true }),
        makeWindow("maximized", {
          placement: "maximized",
          restoreBounds: { x: 100, y: 120, width: 500, height: 300 },
          restorePlacement: "floating",
        }),
        makeWindow("docked", { placement: "bottom_docked" }),
        makeWindow("canvas", {
          contentId: "section-canvas",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-canvas",
          placement: "canvas_section",
        }),
      ],
    });

    expect(canSnapshotWorkspaceWindowSpace(state)).toBe(true);
    expect(
      snapshotWorkspaceWindowSpace(
        state,
        { id: "space", name: "Space", order: 0 },
        viewport,
      ),
    ).toMatchObject({
      windows: [
        {
          id: "floating",
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 2,
        },
      ],
    });
  });

  it("restores into the current host size and retains snapped edge classification", () => {
    const source = createWorkspaceWindowingState({
      windows: [
        makeWindow("left", {
          bounds: buildWorkspaceFloatingSnapBounds("left", viewport),
        }),
        makeWindow("right", {
          bounds: buildWorkspaceFloatingSnapBounds("right", viewport),
        }),
      ],
    });
    const space = snapshotWorkspaceWindowSpace(
      source,
      { id: "space", name: "Space", order: 0 },
      viewport,
    );
    const largerViewport: WorkspaceWindowViewport = {
      width: 2_000,
      height: 1_000,
      insets: { left: 100, right: 100, top: 50, bottom: 50 },
    };

    const restored = restoreWorkspaceWindowSpace(
      createWorkspaceWindowingState(),
      space,
      largerViewport,
    ).state;
    expect(restored.windows.map((window) => window.bounds)).toEqual([
      { x: 100, y: 50, width: 900, height: 900 },
      { x: 1_000, y: 50, width: 900, height: 900 },
    ]);
    expect(
      restored.windows.map((window) =>
        classifyWorkspaceFloatingSnapPreset(window.bounds, largerViewport),
      ),
    ).toEqual(["left", "right"]);
  });

  it("reuses content identity, preserves unrelated windows, and remaps conflicting ids", () => {
    const space = createWorkspaceWindowSpace({
      id: "space",
      name: "Space",
      order: 0,
      windows: [
        {
          id: "saved-a",
          contentId: "content-a",
          surfaceKind: "new-kind",
          title: "Saved A",
          rendererData: { version: 2 },
          sectionId: null,
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 7,
        },
        {
          id: "unrelated",
          contentId: "content-b",
          surfaceKind: "new-kind",
          title: "Saved B",
          rendererData: { version: 3 },
          sectionId: null,
          normalizedBounds: { x: 0.5, y: 0, width: 0.5, height: 1 },
          zIndex: 8,
        },
        {
          id: "saved-maximized",
          contentId: "content-maximized",
          surfaceKind: "new-kind",
          title: "Saved maximized",
          rendererData: { version: 4 },
          sectionId: null,
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 9,
        },
      ],
    });
    const current = createWorkspaceWindowingState({
      windows: [
        makeWindow("live-a", {
          contentId: "content-a",
          isMinimized: true,
          title: "Old A",
        }),
        makeWindow("unrelated", {
          contentId: "other-content",
          title: "Unrelated",
        }),
        makeWindow("live-maximized", {
          contentId: "content-maximized",
          placement: "maximized",
          restoreBounds: { x: 20, y: 30, width: 500, height: 300 },
          restorePlacement: "floating",
          title: "Live maximized",
          zIndex: 15,
        }),
      ],
    });

    const result = restoreWorkspaceWindowSpace(current, space, viewport);
    expect(result.idRemaps).toEqual({
      "saved-a": "live-a",
      unrelated: "unrelated-2",
    });
    expect(result.state.windows).toMatchObject([
      {
        id: "live-a",
        contentId: "content-a",
        surfaceKind: "new-kind",
        title: "Saved A",
        isMinimized: false,
        isClosed: false,
      },
      { id: "unrelated", contentId: "other-content", title: "Unrelated" },
      {
        id: "live-maximized",
        contentId: "content-maximized",
        placement: "maximized",
        title: "Live maximized",
      },
      { id: "unrelated-2", contentId: "content-b", title: "Saved B" },
    ]);
    expect(result.state.nextFocusOrder).toBe(16);
    const focused = focusWorkspaceWindow(result.state, "live-a");
    expect(focused.nextFocusOrder).toBe(17);
    expect(focused.windows[0]).toMatchObject({ id: "live-a", zIndex: 16 });
  });

  it("rejects malformed snapshots before any restore state is produced", () => {
    const state = createWorkspaceWindowingState({ windows: [makeWindow("a")] });
    expect(() =>
      restoreWorkspaceWindowSpace(
        state,
        {
          id: "space",
          name: "Space",
          order: 0,
          windows: [
            {
              id: "bad",
              contentId: "bad",
              surfaceKind: "example",
              title: "Bad",
              rendererData: {},
              sectionId: null,
              normalizedBounds: { x: 0, y: 0, width: 0, height: 1 },
              zIndex: 0,
            },
          ],
        },
        viewport,
      ),
    ).toThrow(WorkspaceWindowingError);
    expect(state.windows[0]?.id).toBe("a");
  });

  it("persists a floating section binding while excluding docked and canvas-owned sections", () => {
    const state = createWorkspaceWindowingState({
      windows: [
        makeWindow("floating-section", {
          contentId: "section-floating",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-floating",
        }),
        makeWindow("docked-section", {
          contentId: "section-docked",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-docked",
          placement: "bottom_docked",
        }),
        makeWindow("canvas-section", {
          contentId: "section-canvas",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-canvas",
          placement: "canvas_section",
        }),
      ],
    });

    expect(
      snapshotWorkspaceWindowSpace(
        state,
        { id: "space", name: "Space", order: 0 },
        viewport,
      ).windows,
    ).toMatchObject([
      {
        id: "floating-section",
        sectionId: "section-floating",
      },
    ]);
  });

  it("reuses a floating section owner by section identity and restores coherent float fields", () => {
    const space = createWorkspaceWindowSpace({
      id: "space",
      name: "Space",
      order: 0,
      windows: [
        {
          id: "saved-section",
          contentId: "saved-section-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          title: "Saved section",
          rendererData: { version: 2 },
          sectionId: "section-a",
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 7,
        },
      ],
    });
    const current = createWorkspaceWindowingState({
      windows: [
        makeWindow("live-section", {
          contentId: "live-section-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-a",
          title: "Live section",
        }),
      ],
    });

    const result = restoreWorkspaceWindowSpace(current, space, viewport);

    expect(result.idRemaps).toEqual({ "saved-section": "live-section" });
    expect(result.state.windows).toEqual([
      expect.objectContaining({
        id: "live-section",
        contentId: "saved-section-content",
        sectionId: "section-a",
        placement: "floating",
        restoreBounds: null,
        restorePlacement: null,
        isMinimized: false,
        isClosed: false,
        zIndex: 7,
      }),
    ]);
  });

  it("keeps docked, canvas-owned, and maximized section owners during restore", () => {
    const space = createWorkspaceWindowSpace({
      id: "space",
      name: "Space",
      order: 0,
      windows: [
        {
          id: "saved-docked",
          contentId: "same-docked-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          title: "Saved docked",
          rendererData: {},
          sectionId: "section-docked",
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 1,
        },
        {
          id: "saved-canvas",
          contentId: "saved-canvas-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          title: "Saved canvas",
          rendererData: {},
          sectionId: "section-canvas",
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 2,
        },
        {
          id: "saved-maximized",
          contentId: "saved-maximized-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          title: "Saved maximized",
          rendererData: {},
          sectionId: "section-maximized",
          normalizedBounds: { x: 0, y: 0, width: 0.5, height: 1 },
          zIndex: 3,
        },
        {
          id: "saved-generic",
          contentId: "generic-content",
          surfaceKind: "example",
          title: "Saved generic",
          rendererData: {},
          sectionId: null,
          normalizedBounds: { x: 0.5, y: 0, width: 0.5, height: 1 },
          zIndex: 4,
        },
      ],
    });
    const current = createWorkspaceWindowingState({
      windows: [
        makeWindow("live-docked", {
          contentId: "same-docked-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-docked",
          placement: "bottom_docked",
          title: "Live docked",
        }),
        makeWindow("live-canvas", {
          contentId: "live-canvas-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-canvas",
          placement: "canvas_section",
          title: "Live canvas",
        }),
        makeWindow("live-maximized", {
          contentId: "live-maximized-content",
          surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
          sectionId: "section-maximized",
          placement: "maximized",
          restoreBounds: { x: 20, y: 30, width: 500, height: 300 },
          restorePlacement: "bottom_docked",
          title: "Live maximized",
        }),
      ],
    });

    const result = restoreWorkspaceWindowSpace(current, space, viewport);

    expect(result.idRemaps).toEqual({});
    expect(result.state.windows).toMatchObject([
      { id: "live-docked", placement: "bottom_docked", title: "Live docked" },
      { id: "live-canvas", placement: "canvas_section", title: "Live canvas" },
      {
        id: "live-maximized",
        placement: "maximized",
        title: "Live maximized",
      },
      {
        id: "saved-generic",
        contentId: "generic-content",
        sectionId: null,
        placement: "floating",
      },
    ]);
  });
});
