import { describe, expect, it } from "vitest";
import {
  WORKSPACE_INTERACTION_MUTATION_CONTRACTS,
  panWorkspaceViewport,
  resolveWorkspaceKeyboardNavigationTarget,
  resolveWorkspaceSectionWheelScrollOffset,
  zoomWorkspaceViewportAtScreenPoint,
} from "./workspaceController";
import { screenToWorkspace, type WorkspaceScene } from "./workspaceScene";

describe("workspace canvas interactions", () => {
  it("declares implemented mutation contracts for step 5 surfaces", () => {
    expect(Object.keys(WORKSPACE_INTERACTION_MUTATION_CONTRACTS)).toEqual([
      "viewportPersistence",
      "sectionScroll",
      "sectionDrag",
      "sectionResize",
      "sectionReorderReparent",
      "paramReorder",
      "canvasNativeControls",
      "sliders",
      "colorEdits",
      "comboboxSelection",
      "textCodeDrafts",
    ]);
    expect(WORKSPACE_INTERACTION_MUTATION_CONTRACTS.paramReorder).toMatchObject(
      {
        owner: "project",
        implementationStatus: "implemented",
      },
    );
    expect(
      WORKSPACE_INTERACTION_MUTATION_CONTRACTS.textCodeDrafts,
    ).toMatchObject({
      owner: "project",
      implementationStatus: "implemented",
    });
  });

  it("keeps viewport zoom anchored at the screen point", () => {
    const viewport = { x: 10, y: 20, zoom: 2 };
    const panned = panWorkspaceViewport(viewport, { x: 15, y: -5 });
    const screenPoint = { x: 50, y: 60 };
    const anchorBefore = screenToWorkspace(screenPoint, panned);
    const zoomed = zoomWorkspaceViewportAtScreenPoint({
      viewport: panned,
      screenPoint,
      zoom: 1,
    });

    expect(panned).toEqual({ x: 25, y: 15, zoom: 2 });
    expect(screenToWorkspace(screenPoint, zoomed)).toEqual(anchorBefore);
  });

  it("clamps section scroll offsets against Dict scrollbar range", () => {
    const scene = {
      sectionsById: {
        dict: {
          renderModel: {
            kind: "dict",
            dict: {
              scrollbar: {
                contentHeight: 600,
                viewportHeight: 180,
              },
            },
          },
        },
      },
    } as unknown as WorkspaceScene;

    expect(
      resolveWorkspaceSectionWheelScrollOffset({
        scene,
        sectionId: "dict",
        currentOffset: 0,
        deltaY: 10_000,
      }),
    ).toBe(420);
  });

  it("navigates scene-level focus across sections and visible Dict rows", () => {
    const scene = {
      sectionOrder: ["section-a"],
      sectionsById: {
        "section-a": {
          id: "section-a",
          sectionPath: ["section-a"],
          renderModel: {
            kind: "dict",
            dict: {
              rows: [
                {
                  visible: true,
                  id: "row-a",
                  paramId: "param-a",
                },
                {
                  visible: false,
                  id: "row-hidden",
                  paramId: "param-hidden",
                },
              ],
            },
          },
        },
      },
    } as unknown as WorkspaceScene;

    const first = resolveWorkspaceKeyboardNavigationTarget({
      scene,
      currentTarget: null,
      direction: 1,
    });
    const second = resolveWorkspaceKeyboardNavigationTarget({
      scene,
      currentTarget: first,
      direction: 1,
    });

    expect(first).toMatchObject({ kind: "section", sectionId: "section-a" });
    expect(second).toMatchObject({ kind: "dict-row", paramId: "param-a" });
  });
});
