import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  beginStandaloneSnapResize,
  buildStandaloneSnapResizeNextBounds,
  hydrateWindowSpaceWindows,
  type StandaloneWindowSpaceWindow,
} from "./standaloneWindowSpaceState";

describe("standaloneWindowSpaceState", () => {
  it("keeps only the highest z-index section owner for duplicate section windows", () => {
    const windowsById = hydrateWindowSpaceWindows(
      createWindowSpaceConfig({
        id: "space-1",
        name: "Research Board",
        windowsById: {
          low: {
            surfaceKind: WindowSpaceSurfaceKindEnum.section,
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            title: null,
            chatId: null,
            zIndex: 1,
            normalizedBounds: {
              x: 0,
              y: 0,
              width: 0.5,
              height: 0.5,
            },
          },
          high: {
            surfaceKind: WindowSpaceSurfaceKindEnum.section,
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            title: null,
            chatId: null,
            zIndex: 4,
            normalizedBounds: {
              x: 0.5,
              y: 0,
              width: 0.5,
              height: 0.5,
            },
          },
        },
        order: ["low", "high"],
      }),
      1200,
      800,
      {
        "section-1": "Research Notes",
      },
    );

    expect(Object.keys(windowsById)).toEqual(["high"]);
    expect(windowsById.high).toEqual(
      expect.objectContaining({
        instanceId: "high",
        sectionIdOrNull: "section-1",
        title: "Research Notes",
        zIndex: 4,
      }),
    );
  });

  it("clamps vertical standalone snap resize movement to the minimum window width", () => {
    const windowsById: Record<string, StandaloneWindowSpaceWindow> = {
      left: {
        instanceId: "left",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Left",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 400,
          height: 600,
        },
      },
      right: {
        instanceId: "right",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Right",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 400,
          y: 0,
          width: 400,
          height: 600,
        },
      },
    };

    const activeResize = beginStandaloneSnapResize({
      handle: {
        axis: "vertical",
        coordinate: 400,
        start: 0,
        end: 600,
        leadingInstanceIds: ["left"],
        trailingInstanceIds: ["right"],
      },
      pointerId: 3,
      pointerPosition: 400,
      windowsById,
    });

    expect(activeResize).toEqual(
      expect.objectContaining({
        pointerId: 3,
        minCoordinate: 220,
        maxCoordinate: 580,
      }),
    );
    if (!activeResize) {
      throw new Error("Expected active standalone snap resize state.");
    }

    expect(
      buildStandaloneSnapResizeNextBounds({
        activeResize,
        pointerPosition: 700,
      }),
    ).toEqual({
      left: {
        x: 0,
        y: 0,
        width: 580,
        height: 600,
      },
      right: {
        x: 580,
        y: 0,
        width: 220,
        height: 600,
      },
    });
  });

  it("clamps horizontal standalone snap resize movement to the minimum window height", () => {
    const windowsById: Record<string, StandaloneWindowSpaceWindow> = {
      top: {
        instanceId: "top",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Top",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 800,
          height: 300,
        },
      },
      bottom: {
        instanceId: "bottom",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Bottom",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 0,
          y: 300,
          width: 800,
          height: 300,
        },
      },
    };

    const activeResize = beginStandaloneSnapResize({
      handle: {
        axis: "horizontal",
        coordinate: 300,
        start: 0,
        end: 800,
        leadingInstanceIds: ["top"],
        trailingInstanceIds: ["bottom"],
      },
      pointerId: 9,
      pointerPosition: 300,
      windowsById,
    });

    expect(activeResize).toEqual(
      expect.objectContaining({
        pointerId: 9,
        minCoordinate: 180,
        maxCoordinate: 420,
      }),
    );
    if (!activeResize) {
      throw new Error("Expected active standalone snap resize state.");
    }

    expect(
      buildStandaloneSnapResizeNextBounds({
        activeResize,
        pointerPosition: 50,
      }),
    ).toEqual({
      top: {
        x: 0,
        y: 0,
        width: 800,
        height: 180,
      },
      bottom: {
        x: 0,
        y: 180,
        width: 800,
        height: 420,
      },
    });
  });
});
