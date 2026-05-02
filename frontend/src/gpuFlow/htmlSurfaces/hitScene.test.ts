/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  createHtmlSurfaceHitScene,
  resolveHtmlSurfaceHitAtClientPoint,
  resolveHtmlSurfaceHitAtSurfacePoint,
  type HtmlSurfaceEffectHitProjector,
} from "./hitScene";

describe("html surface hit scene", () => {
  it("maps a client point to the topmost flat surface local coordinates", () => {
    const surfaceElement = document.createElement("div");
    setRect(surfaceElement, 100, 50, 500, 400);

    const hit = resolveHtmlSurfaceHitAtClientPoint({
      clientX: 170,
      clientY: 110,
      scene: createHtmlSurfaceHitScene({
        flatSurfaces: [
          {
            height: 50,
            kind: "flat",
            stackOrder: 0,
            surfaceId: "lower",
            width: 100,
            x: 10,
            y: 20,
            zIndex: 1,
          },
          {
            height: 50,
            kind: "flat",
            stackOrder: 1,
            surfaceId: "upper",
            width: 100,
            x: 10,
            y: 20,
            zIndex: 3,
          },
        ],
      }),
      surfaceElement,
      viewport: [20, 10, 2],
    });

    expect(hit).toEqual({
      kind: "flat",
      localX: 15,
      localY: 5,
      surfaceId: "upper",
      surfaceX: 70,
      surfaceY: 60,
      u: 0.15,
      v: 0.1,
      zIndex: 3,
    });
  });

  it("interpolates UV coordinates from mesh triangle hits", () => {
    const hit = resolveHtmlSurfaceHitAtSurfacePoint({
      scene: createHtmlSurfaceHitScene({
        meshSurfaces: [
          {
            bounds: { height: 100, width: 100, x: 0, y: 0 },
            indices: new Uint32Array([0, 1, 2]),
            kind: "mesh",
            sourceHeight: 100,
            sourceWidth: 200,
            surfaceId: "mesh",
            vertices: [
              { u: 0, v: 0, x: 0, y: 0 },
              { u: 1, v: 0, x: 100, y: 0 },
              { u: 0, v: 1, x: 0, y: 100 },
            ],
            zIndex: 1,
          },
        ],
      }),
      surfaceX: 25,
      surfaceY: 25,
      viewport: [0, 0, 1],
    });

    expect(hit).toMatchObject({
      kind: "mesh",
      localX: 50,
      localY: 25,
      surfaceId: "mesh",
      u: 0.25,
      v: 0.25,
    });
  });

  it("uses explicit effect projectors and fails loudly when one is missing", () => {
    const projector = vi.fn<HtmlSurfaceEffectHitProjector>(() => ({
      localX: 7,
      localY: 8,
      u: 0.07,
      v: 0.08,
    }));
    const scene = createHtmlSurfaceHitScene({
      effectSurfaces: [
        {
          bounds: { height: 100, width: 100, x: 0, y: 0 },
          effectId: "ripple",
          kind: "effect",
          projectorId: "ripple-projector",
          sourceHeight: 100,
          sourceWidth: 100,
          surfaceId: "effect",
          zIndex: 1,
        },
      ],
    });

    expect(
      resolveHtmlSurfaceHitAtSurfacePoint({
        effectProjectors: new Map([["ripple-projector", projector]]),
        scene,
        surfaceX: 20,
        surfaceY: 30,
        viewport: [0, 0, 1],
      }),
    ).toEqual({
      kind: "effect",
      localX: 7,
      localY: 8,
      surfaceId: "effect",
      surfaceX: 20,
      surfaceY: 30,
      u: 0.07,
      v: 0.08,
      zIndex: 1,
    });
    expect(projector).toHaveBeenCalledWith({
      surface: expect.objectContaining({
        effectId: "ripple",
        projectorId: "ripple-projector",
        surfaceId: "effect",
      }),
      surfaceX: 20,
      surfaceY: 30,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(() =>
      resolveHtmlSurfaceHitAtSurfacePoint({
        scene,
        surfaceX: 20,
        surfaceY: 30,
        viewport: [0, 0, 1],
      }),
    ).toThrow(
      'HTML surface effect "ripple" cannot be hit-tested without projector "ripple-projector".',
    );
  });

  it("does not require a lower effect projector when a higher surface is hit", () => {
    expect(
      resolveHtmlSurfaceHitAtSurfacePoint({
        scene: createHtmlSurfaceHitScene({
          flatSurfaces: [
            {
              height: 100,
              kind: "flat",
              surfaceId: "flat",
              width: 100,
              x: 0,
              y: 0,
              zIndex: 2,
            },
          ],
          effectSurfaces: [
            {
              bounds: { height: 100, width: 100, x: 0, y: 0 },
              effectId: "lower-effect",
              kind: "effect",
              projectorId: "missing-projector",
              sourceHeight: 100,
              sourceWidth: 100,
              surfaceId: "effect",
              zIndex: 1,
            },
          ],
        }),
        surfaceX: 20,
        surfaceY: 30,
        viewport: [0, 0, 1],
      }),
    ).toMatchObject({
      kind: "flat",
      surfaceId: "flat",
    });
  });
});

function setRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}
