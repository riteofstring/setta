/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";
import {
  HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
  HTML_SURFACE_WARPED_MESH_FIXTURE_RECT,
  HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT,
  createHtmlSurfaceWarpedMeshFixtureScene,
  createHtmlSurfaceWarpedMeshVisual,
  resolveHtmlSurfaceWarpedMeshFixtureHit,
} from "./warpedMeshFixture";

describe("warped HTML mesh surface fixture", () => {
  it("creates a subdivided warped mesh visual from one HTML texture source", () => {
    const texture = textureRecord(HTML_SURFACE_WARPED_MESH_FIXTURE_ID);
    const visual = createHtmlSurfaceWarpedMeshVisual({
      columns: 4,
      rect: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT,
      rows: 3,
      surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
      texture,
      warpPx: 18,
    });

    expect(visual).toMatchObject({
      kind: "mesh",
      surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
      texture,
      zIndex: 0,
    });
    expect(visual.vertices).toHaveLength(20);
    expect(visual.indices).toHaveLength(72);
    expect(
      visual.vertices.some((vertex) => {
        const localU =
          (vertex.x - HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.x) /
          HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width;
        return Math.abs(localU - vertex.u) > 0.02;
      }),
    ).toBe(true);
    expect(visual.bounds.width).toBeGreaterThanOrEqual(
      HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width,
    );
    expect(
      visual.vertices.some((vertex) => {
        const localV =
          (vertex.y - HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.y) /
          HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height;
        return Math.abs(localV - vertex.v) > 0.02;
      }),
    ).toBe(true);
    expect(visual.bounds.height).toBeGreaterThanOrEqual(
      HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height,
    );
  });

  it("projects a warped mesh screen point back to the source HTML pixel", () => {
    const texture = textureRecord(HTML_SURFACE_WARPED_MESH_FIXTURE_ID);
    const scene = createHtmlSurfaceWarpedMeshFixtureScene({ texture });
    const mesh = scene.meshSurfaces[0];
    if (!mesh) {
      throw new Error("Expected warped mesh surface.");
    }
    const vertex = mesh.vertices.find(
      (candidate) => candidate.u === 0.5 && candidate.v === 0.4,
    );
    if (!vertex) {
      throw new Error("Expected center mesh sample vertex.");
    }
    const canvas = document.createElement("canvas");
    setElementRect(canvas, { left: 0, top: 0 });

    const hit = resolveHtmlSurfaceWarpedMeshFixtureHit({
      clientX: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT[0] + vertex.x,
      clientY: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT[1] + vertex.y,
      surfaceElement: canvas,
      texture,
    });

    expect(hit).toMatchObject({
      kind: "mesh",
      localX: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width * 0.5,
      surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
      u: 0.5,
      v: 0.4,
      zIndex: 0,
    });
    expect(hit?.localY).toBeCloseTo(
      HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height * 0.4,
    );
  });
});

function textureRecord(surfaceId: string): CommittedHtmlSurfaceTextureSnapshot {
  return {
    cssHeight: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height,
    cssWidth: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width,
    lastUploadFrame: 1,
    sampler: {},
    surfaceId,
    texture: {},
    textureBytes: 0,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: {},
    tiles: [],
  } as CommittedHtmlSurfaceTextureSnapshot;
}

function setElementRect(
  element: HTMLElement,
  rect: { readonly left: number; readonly top: number },
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.top,
      height: 0,
      left: rect.left,
      right: rect.left,
      top: rect.top,
      width: 0,
      x: rect.left,
      y: rect.top,
    }) as DOMRect;
}
