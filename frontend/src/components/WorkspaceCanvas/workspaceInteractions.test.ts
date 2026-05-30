import type { Dispatch, SetStateAction, WheelEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_INTERACTION_MUTATION_CONTRACTS,
  createWorkspaceCanvasControllerState,
  panWorkspaceViewport,
  resolveWorkspaceKeyboardNavigationTarget,
  resolveWorkspaceSectionWheelScrollOffset,
  zoomWorkspaceViewportAtScreenPoint,
  type WorkspaceCanvasControllerState,
} from "./workspaceController";
import {
  handleWorkspaceWheel,
  type WorkspaceWheelBehavior,
} from "./workspaceInteractions";
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

  it("keeps modifier-wheel zooming over scrollable Dict sections", () => {
    const scene = createScrollableDictWheelScene();
    let controllerState = createWorkspaceCanvasControllerState({
      viewport: {
        sourceKey: "test",
        viewport: scene.viewport,
      },
    });
    const preventDefault = vi.fn();

    handleWorkspaceWheel({
      event: createWheelEvent({
        ctrlKey: true,
        deltaY: 120,
        preventDefault,
      }),
      scene,
      controllerState,
      setControllerState: createControllerStateSetter(() => controllerState, {
        set: (next) => {
          controllerState = next;
        },
      }),
      showMinimap: false,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controllerState.sectionScrollOffsets).toEqual({});
    expect(controllerState.viewport?.viewport.zoom).toBeLessThan(1);
  });

  it("pans the workspace on pan-on-scroll over scrollable Dict sections", () => {
    const scene = createScrollableDictWheelScene();
    let controllerState = createWorkspaceCanvasControllerState({
      viewport: {
        sourceKey: "test",
        viewport: scene.viewport,
      },
    });
    const preventDefault = vi.fn();

    handleWorkspaceWheel({
      event: createWheelEvent({
        deltaX: 40,
        deltaY: 120,
        preventDefault,
      }),
      scene,
      controllerState,
      setControllerState: createControllerStateSetter(() => controllerState, {
        set: (next) => {
          controllerState = next;
        },
      }),
      showMinimap: false,
      wheelBehavior: createWheelBehavior({ panOnScroll: true }),
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controllerState.sectionScrollOffsets).toEqual({});
    expect(controllerState.viewport?.viewport).toEqual({
      x: -40,
      y: -120,
      zoom: 1,
    });
  });

  it("keeps plain wheel scrolling scrollable Dict sections when pan-on-scroll is disabled", () => {
    const scene = createScrollableDictWheelScene();
    let controllerState = createWorkspaceCanvasControllerState({
      viewport: {
        sourceKey: "test",
        viewport: scene.viewport,
      },
    });
    const preventDefault = vi.fn();

    handleWorkspaceWheel({
      event: createWheelEvent({
        deltaY: 120,
        preventDefault,
      }),
      scene,
      controllerState,
      setControllerState: createControllerStateSetter(() => controllerState, {
        set: (next) => {
          controllerState = next;
        },
      }),
      showMinimap: false,
      wheelBehavior: createWheelBehavior({ panOnScroll: false }),
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controllerState.sectionScrollOffsets.dict).toBe(120);
    expect(controllerState.viewport?.viewport).toEqual(scene.viewport);
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
                  hitRegions: [
                    {
                      target: {
                        kind: "control",
                        sectionId: "section-a",
                        sectionPath: ["section-a"],
                        rowId: "row-a",
                        paramId: "param-a",
                        controlId: "row-a:control",
                      },
                    },
                  ],
                },
                {
                  visible: false,
                  id: "row-hidden",
                  paramId: "param-hidden",
                  hitRegions: [],
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
    const third = resolveWorkspaceKeyboardNavigationTarget({
      scene,
      currentTarget: second,
      direction: 1,
    });

    expect(first).toMatchObject({ kind: "section", sectionId: "section-a" });
    expect(second).toMatchObject({ kind: "dict-row", paramId: "param-a" });
    expect(third).toMatchObject({ kind: "control", paramId: "param-a" });
  });
});

function createScrollableDictWheelScene() {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportSize: { width: 640, height: 480 },
    sectionOrder: ["dict"],
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
        geometry: {
          body: { x: 0, y: 0, width: 320, height: 240 },
        },
      },
    },
    hitRegions: [
      {
        id: "dict:body",
        coordinateSpace: "workspace",
        rect: { x: 0, y: 0, width: 320, height: 240 },
        intent: "scroll-section",
        target: {
          kind: "section",
          sectionId: "dict",
          sectionPath: ["dict"],
        },
        zIndex: 0,
      },
    ],
  } as unknown as WorkspaceScene;
}

function createWheelEvent({
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  deltaX = 0,
  deltaY,
  preventDefault,
}: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  deltaX?: number;
  deltaY: number;
  preventDefault: () => void;
}): WheelEvent<HTMLCanvasElement> {
  return {
    clientX: 100,
    clientY: 100,
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
      }),
    },
    ctrlKey,
    metaKey,
    shiftKey,
    deltaX,
    deltaY,
    deltaMode: 0,
    preventDefault,
  } as unknown as WheelEvent<HTMLCanvasElement>;
}

function createControllerStateSetter(
  getState: () => WorkspaceCanvasControllerState,
  sink: { set: (state: WorkspaceCanvasControllerState) => void },
): Dispatch<SetStateAction<WorkspaceCanvasControllerState>> {
  return (action) => {
    sink.set(typeof action === "function" ? action(getState()) : action);
  };
}

function createWheelBehavior(
  overrides: Partial<WorkspaceWheelBehavior> = {},
): WorkspaceWheelBehavior {
  return {
    panOnScroll: true,
    panOnScrollMode: "free",
    panOnScrollSpeed: 1,
    zoomOnPinch: true,
    zoomOnScroll: true,
    ...overrides,
  };
}
