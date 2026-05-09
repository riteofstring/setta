import { describe, expect, it } from "vitest";
import {
  applyGpuRetainedContentRowHoverStateToScene,
  areGpuRetainedContentRowHoverTargetsEqual,
} from "./retainedContentRowHover";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "./retainedContentSceneSourceMetadata";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("applyGpuRetainedContentRowHoverStateToScene", () => {
  it("moves row hover state through retained scene and source metadata", () => {
    const scene = flowScene();

    const hoverA = applyGpuRetainedContentRowHoverStateToScene({
      scene,
      target: { rowId: "param-a", surfaceId: "dict-a:param-content" },
    });

    expect(hoverA).not.toBeNull();
    expect([
      ...hoverA!.changedRowIdsBySurfaceId.get("dict-a:param-content")!,
    ]).toEqual(["param-a"]);
    expect(getRowHoverStates(hoverA!.scene)).toEqual({
      "param-a": true,
      "param-b": false,
    });
    expect(getSourceInputHoverStates(hoverA!.scene)).toEqual({
      "param-a": true,
      "param-b": false,
    });
    expect(getRowBackgroundHoverStates(hoverA!.scene)).toEqual({
      "param-a": true,
      "param-b": false,
    });

    const hoverB = applyGpuRetainedContentRowHoverStateToScene({
      scene: hoverA!.scene,
      target: { rowId: "param-b", surfaceId: "dict-a:param-content" },
    });

    expect(hoverB).not.toBeNull();
    expect([
      ...hoverB!.changedRowIdsBySurfaceId.get("dict-a:param-content")!,
    ]).toEqual(["param-a", "param-b"]);
    expect(getRowHoverStates(hoverB!.scene)).toEqual({
      "param-a": false,
      "param-b": true,
    });
    expect(getSourceInputHoverStates(hoverB!.scene)).toEqual({
      "param-a": false,
      "param-b": true,
    });

    const cleared = applyGpuRetainedContentRowHoverStateToScene({
      scene: hoverB!.scene,
      target: null,
    });

    expect(cleared).not.toBeNull();
    expect([
      ...cleared!.changedRowIdsBySurfaceId.get("dict-a:param-content")!,
    ]).toEqual(["param-b"]);
    expect(getRowHoverStates(cleared!.scene)).toEqual({
      "param-a": false,
      "param-b": false,
    });
  });

  it("does not update a scene whose retained row hover already matches", () => {
    const scene = flowScene();
    const hoverA = applyGpuRetainedContentRowHoverStateToScene({
      scene,
      target: { rowId: "param-a", surfaceId: "dict-a:param-content" },
    });

    expect(
      applyGpuRetainedContentRowHoverStateToScene({
        scene: hoverA!.scene,
        target: { rowId: "param-a", surfaceId: "dict-a:param-content" },
      }),
    ).toBeNull();
  });
});

describe("areGpuRetainedContentRowHoverTargetsEqual", () => {
  it("compares retained row hover targets by surface and row", () => {
    expect(
      areGpuRetainedContentRowHoverTargetsEqual(
        { rowId: "param-a", surfaceId: "surface-a" },
        { rowId: "param-a", surfaceId: "surface-a" },
      ),
    ).toBe(true);
    expect(
      areGpuRetainedContentRowHoverTargetsEqual(
        { rowId: "param-a", surfaceId: "surface-a" },
        { rowId: "param-b", surfaceId: "surface-a" },
      ),
    ).toBe(false);
    expect(areGpuRetainedContentRowHoverTargetsEqual(null, null)).toBe(true);
  });
});

function flowScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: rect,
    id: "dict-a:param-content",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-a",
          label: "Param A",
        },
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-b",
          label: "Param B",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function getRetainedSurface(scene: GpuFlowScene): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const surface = scene.contentSurfaces[0];
  if (!surface?.retainedScene) {
    throw new Error("Missing retained surface.");
  }
  return surface as GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  };
}

function getRowHoverStates(scene: GpuFlowScene): Record<string, boolean> {
  return Object.fromEntries(
    getRetainedSurface(scene).retainedScene.rows.map((row) => [
      row.id,
      row.state.hovered,
    ]),
  );
}

function getSourceInputHoverStates(
  scene: GpuFlowScene,
): Record<string, boolean> {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    getRetainedSurface(scene).retainedScene,
  );
  if (!sourceInput) {
    throw new Error("Missing retained source input.");
  }
  return Object.fromEntries(
    sourceInput.rows.map((row) => [row.id, Boolean(row.state?.hovered)]),
  );
}

function getRowBackgroundHoverStates(
  scene: GpuFlowScene,
): Record<string, boolean> {
  return Object.fromEntries(
    getRetainedSurface(scene)
      .retainedScene.drawCommands.filter(
        (command) => command.kind === "row-background",
      )
      .map((command) => [command.rowId, command.state.hovered]),
  );
}

function textLikeControlDescriptor() {
  return {
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    rendererFamily: "text-like",
    commitPolicy: "native-island" as const,
  };
}
