import { describe, expect, it } from "vitest";
import {
  buildWorkspaceFloatingSnapBounds,
  buildWorkspaceFloatingSnapResizeBounds,
  buildWorkspaceFloatingSnapResizeSeams,
  classifyWorkspaceFloatingSnapPreset,
  denormalizeWorkspaceWindowBounds,
  normalizeWorkspaceWindowBounds,
  resolveWorkspaceFloatingSnapPresetFromPointer,
  resolveWorkspaceWindowWorkArea,
  type WorkspaceSnappedWindow,
} from "./windowingSnapLayout";
import type {
  WorkspaceFloatingSnapPreset,
  WorkspaceWindowViewport,
} from "./windowingTypes";

const viewport: WorkspaceWindowViewport = {
  width: 1_000,
  height: 800,
  insets: { left: 40, right: 40, top: 40, bottom: 0 },
};

const presets: readonly WorkspaceFloatingSnapPreset[] = [
  "left",
  "right",
  "top",
  "bottom",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];

describe("workspace floating snap layout", () => {
  it("round-trips all eight exact preset bounds through inset classification", () => {
    for (const preset of presets) {
      expect(
        classifyWorkspaceFloatingSnapPreset(
          buildWorkspaceFloatingSnapBounds(preset, viewport),
          viewport,
        ),
      ).toBe(preset);
    }
  });

  it("uses global host insets and gives corners priority over side zones", () => {
    expect(resolveWorkspaceWindowWorkArea(viewport)).toMatchObject({
      minX: 40,
      maxX: 960,
      minY: 40,
      maxY: 800,
    });
    expect(
      resolveWorkspaceFloatingSnapPresetFromPointer({
        pointerX: 41,
        pointerY: 41,
        viewport,
      }),
    ).toBe("top_left");
    expect(
      resolveWorkspaceFloatingSnapPresetFromPointer({
        pointerX: 959,
        pointerY: 420,
        viewport,
      }),
    ).toBe("right");
    expect(
      resolveWorkspaceFloatingSnapPresetFromPointer({
        pointerX: 500,
        pointerY: 420,
        viewport,
      }),
    ).toBeNull();
  });

  it("keeps edge-anchored split-resized tiles classified as snapped", () => {
    expect(
      classifyWorkspaceFloatingSnapPreset(
        { x: 40, y: 40, width: 600, height: 760 },
        viewport,
      ),
    ).toBe("left");
    expect(
      classifyWorkspaceFloatingSnapPreset(
        { x: 640, y: 40, width: 320, height: 760 },
        viewport,
      ),
    ).toBe("right");
  });

  it("merges a quad into one vertical and one horizontal shared seam", () => {
    const windows: WorkspaceSnappedWindow[] = presets
      .slice(4)
      .map((preset) => ({
        id: preset,
        bounds: buildWorkspaceFloatingSnapBounds(preset, viewport),
        snapPreset: preset,
      }));
    const seams = buildWorkspaceFloatingSnapResizeSeams(windows);

    expect(seams).toHaveLength(2);
    expect(seams[0]).toMatchObject({
      axis: "vertical",
      coordinate: 500,
      start: 40,
      end: 800,
      leadingWindowIds: ["top_left", "bottom_left"],
      trailingWindowIds: ["top_right", "bottom_right"],
    });
    expect(seams[1]).toMatchObject({
      axis: "horizontal",
      coordinate: 420,
      start: 40,
      end: 960,
      leadingWindowIds: ["top_left", "top_right"],
      trailingWindowIds: ["bottom_left", "bottom_right"],
    });
  });

  it("moves every side of a shared seam atomically without gaps or outer-edge drift", () => {
    const left = buildWorkspaceFloatingSnapBounds("left", viewport);
    const right = buildWorkspaceFloatingSnapBounds("right", viewport);
    const [seam] = buildWorkspaceFloatingSnapResizeSeams([
      { id: "left", bounds: left, snapPreset: "left" },
      { id: "right", bounds: right, snapPreset: "right" },
    ]);
    expect(seam).toBeDefined();
    if (!seam) {
      throw new Error("Expected a vertical seam.");
    }

    expect(
      buildWorkspaceFloatingSnapResizeBounds(seam, { left, right }, 540),
    ).toEqual({
      left: { x: 40, y: 40, width: 500, height: 760 },
      right: { x: 540, y: 40, width: 420, height: 760 },
    });
  });

  it("normalizes against insets and scales the same layout into a different host", () => {
    const normalized = normalizeWorkspaceWindowBounds(
      buildWorkspaceFloatingSnapBounds("top_left", viewport),
      viewport,
    );
    const resizedViewport: WorkspaceWindowViewport = {
      width: 2_000,
      height: 1_000,
      insets: { left: 100, right: 100, top: 50, bottom: 50 },
    };
    expect(normalized).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(
      denormalizeWorkspaceWindowBounds(normalized, resizedViewport),
    ).toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 450,
    });
  });
});
