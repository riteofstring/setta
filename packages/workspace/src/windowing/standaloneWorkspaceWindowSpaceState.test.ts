import { describe, expect, it } from "vitest";
import {
  buildWorkspaceFloatingSnapBounds,
  buildWorkspaceFloatingSnapResizeSeams,
} from "./windowingSnapLayout.js";
import {
  applyStandaloneWorkspaceWindowBounds,
  createActiveStandaloneWorkspaceSnapResize,
  focusStandaloneWorkspaceWindow,
  hydrateStandaloneWorkspaceWindowSpace,
  hydrateStandaloneWorkspaceWindowSpaceState,
  resolveActiveStandaloneWorkspaceSnapResizeBounds,
} from "./standaloneWorkspaceWindowSpaceState.js";
import {
  WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
  type WorkspaceWindowViewport,
} from "./windowingTypes.js";
import { createWorkspaceWindowSpace } from "./windowSpaces.js";

const viewport: WorkspaceWindowViewport = {
  height: 800,
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
  width: 1_000,
};

function createSpace(id = "space") {
  return createWorkspaceWindowSpace({
    id,
    name: "Research",
    order: 0,
    windows: [
      {
        contentId: "content-left",
        id: "left",
        normalizedBounds: { height: 1, width: 0.5, x: 0, y: 0 },
        rendererData: { version: 1 },
        sectionId: null,
        surfaceKind: "example",
        title: "Left",
        zIndex: 3,
      },
      {
        contentId: "content-right",
        id: "right",
        normalizedBounds: { height: 1, width: 0.5, x: 0.5, y: 0 },
        rendererData: { version: 1 },
        sectionId: null,
        surfaceKind: "example",
        title: "Right",
        zIndex: 3,
      },
    ],
  });
}

describe("standalone Window Space state", () => {
  it("hydrates saved bounds into the local zero-inset viewport", () => {
    expect(
      hydrateStandaloneWorkspaceWindowSpace(createSpace(), viewport),
    ).toMatchObject([
      { bounds: { height: 800, width: 500, x: 0, y: 0 }, id: "left" },
      { bounds: { height: 800, width: 500, x: 500, y: 0 }, id: "right" },
    ]);
  });

  it("retains a saved section binding in the standalone floating projection", () => {
    const windows = hydrateStandaloneWorkspaceWindowSpace(
      createWorkspaceWindowSpace({
        id: "section-space",
        name: "Section Space",
        order: 0,
        windows: [
          {
            contentId: "section-content",
            id: "section-window",
            normalizedBounds: { height: 1, width: 1, x: 0, y: 0 },
            rendererData: {},
            sectionId: "section-a",
            surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
            title: "Section A",
            zIndex: 0,
          },
        ],
      }),
      viewport,
    );

    expect(windows).toMatchObject([
      {
        id: "section-window",
        sectionId: "section-a",
        placement: "floating",
        restorePlacement: null,
      },
    ]);
  });

  it("preserves same-key local focus and split edits, then resets them for a new key", () => {
    const initial = hydrateStandaloneWorkspaceWindowSpace(
      createSpace(),
      viewport,
    );
    const local = initial.map((window) =>
      window.id === "left"
        ? {
            ...window,
            bounds: { ...window.bounds, width: 600 },
            zIndex: 9,
          }
        : window,
    );
    const refreshed = hydrateStandaloneWorkspaceWindowSpace(
      createWorkspaceWindowSpace({
        ...createSpace(),
        windows: createSpace().windows.map((window) =>
          window.id === "left"
            ? { ...window, rendererData: { version: 2 }, title: "Updated left" }
            : window,
        ),
      }),
      viewport,
    );

    const sameKey = hydrateStandaloneWorkspaceWindowSpaceState({
      currentWindows: local,
      nextHydratedWindows: refreshed,
      nextKey: "space:1",
      previousHydratedWindows: initial,
      previousKey: "space:1",
    });
    expect(sameKey.resetLocalState).toBe(false);
    expect(sameKey.localWindows[0]).toMatchObject({
      bounds: { height: 800, width: 600, x: 0, y: 0 },
      rendererData: { version: 2 },
      title: "Updated left",
      zIndex: 9,
    });

    const changedKey = hydrateStandaloneWorkspaceWindowSpaceState({
      currentWindows: sameKey.localWindows,
      nextHydratedWindows: refreshed,
      nextKey: "other:1",
      previousHydratedWindows: sameKey.previousHydratedWindows,
      previousKey: sameKey.previousKey,
    });
    expect(changedKey.resetLocalState).toBe(true);
    expect(changedKey.localWindows[0]).toMatchObject({
      bounds: { height: 800, width: 500, x: 0, y: 0 },
      zIndex: 3,
    });
  });

  it("makes a pointer-focused tied window uniquely top", () => {
    const windows = hydrateStandaloneWorkspaceWindowSpace(
      createSpace(),
      viewport,
    );
    const focused = focusStandaloneWorkspaceWindow(windows, "left");

    expect(focused.find((window) => window.id === "left")?.zIndex).toBe(4);
    expect(focused.find((window) => window.id === "right")?.zIndex).toBe(3);
    expect(focusStandaloneWorkspaceWindow(focused, "left")).toBe(focused);
  });

  it("resizes a shared seam locally with the standalone 220 px minimum", () => {
    const left = buildWorkspaceFloatingSnapBounds("left", viewport);
    const right = buildWorkspaceFloatingSnapBounds("right", viewport);
    const seams = buildWorkspaceFloatingSnapResizeSeams([
      { bounds: left, id: "left", snapPreset: "left" },
      { bounds: right, id: "right", snapPreset: "right" },
    ]);
    const windows = hydrateStandaloneWorkspaceWindowSpace(
      createSpace(),
      viewport,
    ).map((window) => ({
      ...window,
      bounds: window.id === "left" ? left : right,
    }));
    const active = createActiveStandaloneWorkspaceSnapResize({
      pointerId: 1,
      pointerX: 500,
      pointerY: 100,
      seam: seams[0]!,
      windows,
    });

    expect(active).not.toBeNull();
    const resized = applyStandaloneWorkspaceWindowBounds(
      windows,
      resolveActiveStandaloneWorkspaceSnapResizeBounds(active!, 900, 100),
    );
    expect(resized.map((window) => window.bounds)).toEqual([
      { height: 800, width: 780, x: 0, y: 0 },
      { height: 800, width: 220, x: 780, y: 0 },
    ]);
  });
});
