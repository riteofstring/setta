/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { resolveHtmlSurfacePaintInvalidation } from "./paintInvalidation";
import {
  releaseHtmlSurfaceActivePaintSourceRectHint,
  setHtmlSurfaceActivePaintSourceRectHint,
} from "./paintSourceRectHints";

const SOURCE_SELECTOR = '[data-html-surface-source="true"]';
const SOURCE_ID_ATTRIBUTE = "data-surface-id";
const SURFACE_SELECTOR = '[data-html-surface-root="true"]';

describe("HTML surface paint invalidation", () => {
  it("suppresses direct source paints from expected transform-only movement", () => {
    const source = createSource("surface-a");

    const result = resolveHtmlSurfacePaintInvalidation({
      changedElements: [source],
      sourceElementBySurfaceId: new Map([["surface-a", source]]),
      sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
      sourceSelector: SOURCE_SELECTOR,
      transformOnlySourceIds: ["surface-a"],
    });

    expect(result).toEqual({
      dirtySurfaceInvalidations: [],
      dirtySurfaceIds: [],
      transformOnlyPaintSurfaceIds: ["surface-a"],
    });
  });

  it("still dirties descendant content paints when a source has moved", () => {
    const source = createSource("surface-a");
    const input = document.createElement("input");
    source.append(input);

    const result = resolveHtmlSurfacePaintInvalidation({
      changedElements: [source, input],
      sourceElementBySurfaceId: new Map([["surface-a", source]]),
      sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
      sourceSelector: SOURCE_SELECTOR,
      transformOnlySourceIds: ["surface-a"],
    });

    expect(result).toEqual({
      dirtySurfaceInvalidations: [{ surfaceId: "surface-a" }],
      dirtySurfaceIds: ["surface-a"],
      transformOnlyPaintSurfaceIds: ["surface-a"],
    });
  });

  it("uses the changed source ancestry without iterating registered sources", () => {
    const source = createSource("surface-a");
    const button = document.createElement("button");
    source.append(button);
    const sources = new ThrowOnMapIteration<string, HTMLElement>();
    sources.set("surface-a", source);
    for (let index = 0; index < 2_500; index += 1) {
      sources.set(`other-${index}`, createSource(`other-${index}`));
    }

    const result = resolveHtmlSurfacePaintInvalidation({
      changedElements: [button],
      sourceElementBySurfaceId: sources,
      sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
      sourceSelector: SOURCE_SELECTOR,
    });

    expect(result.dirtySurfaceIds).toEqual(["surface-a"]);
    expect(result.dirtySurfaceInvalidations).toEqual([
      { surfaceId: "surface-a" },
    ]);
    expect(sources.iterationCount).toBe(0);
  });

  it("routes descendant paint invalidations to source-relative dirty rects", () => {
    const source = createSource("surface-a");
    const button = document.createElement("button");
    source.append(button);
    setElementRect(source, {
      bottom: 220,
      height: 200,
      left: 10,
      right: 310,
      top: 20,
      width: 300,
    });
    setElementRect(button, {
      bottom: 72,
      height: 32,
      left: 138,
      right: 202,
      top: 40,
      width: 64,
    });

    const result = resolveHtmlSurfacePaintInvalidation({
      changedElements: [button],
      sourceElementBySurfaceId: new Map([["surface-a", source]]),
      sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
      sourceSelector: SOURCE_SELECTOR,
    });

    expect(result).toEqual({
      dirtySurfaceInvalidations: [
        {
          sourceRect: {
            height: 32,
            width: 64,
            x: 128,
            y: 20,
          },
          surfaceId: "surface-a",
        },
      ],
      dirtySurfaceIds: ["surface-a"],
      transformOnlyPaintSurfaceIds: [],
    });
  });

  it("routes direct source paints through active animation source rect hints", () => {
    const source = createSource("surface-a");
    const sourceRect = {
      height: 20,
      width: 48,
      x: 280,
      y: 186,
    };

    setHtmlSurfaceActivePaintSourceRectHint(source, sourceRect);

    expect(
      resolveHtmlSurfacePaintInvalidation({
        changedElements: [source],
        sourceElementBySurfaceId: new Map([["surface-a", source]]),
        sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
        sourceSelector: SOURCE_SELECTOR,
      }),
    ).toEqual({
      dirtySurfaceInvalidations: [
        {
          sourceRect,
          surfaceId: "surface-a",
        },
      ],
      dirtySurfaceIds: ["surface-a"],
      transformOnlyPaintSurfaceIds: [],
    });

    releaseHtmlSurfaceActivePaintSourceRectHint(source);

    for (let index = 0; index < 8; index += 1) {
      expect(
        resolveHtmlSurfacePaintInvalidation({
          changedElements: [source],
          sourceElementBySurfaceId: new Map([["surface-a", source]]),
          sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
          sourceSelector: SOURCE_SELECTOR,
        }).dirtySurfaceInvalidations,
      ).toEqual([
        {
          sourceRect,
          surfaceId: "surface-a",
        },
      ]);
    }

    expect(
      resolveHtmlSurfacePaintInvalidation({
        changedElements: [source],
        sourceElementBySurfaceId: new Map([["surface-a", source]]),
        sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
        sourceSelector: SOURCE_SELECTOR,
      }).dirtySurfaceInvalidations,
    ).toEqual([{ surfaceId: "surface-a" }]);
  });

  it("accepts an enclosing changed subtree only when it contains one source", () => {
    const wrapper = document.createElement("div");
    const first = createSource("first");
    const second = createSource("second");
    wrapper.append(first);

    expect(
      resolveHtmlSurfacePaintInvalidation({
        changedElements: [wrapper],
        sourceElementBySurfaceId: new Map([["first", first]]),
        sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
        sourceSelector: SOURCE_SELECTOR,
      }).dirtySurfaceIds,
    ).toEqual(["first"]);

    wrapper.append(second);

    expect(
      resolveHtmlSurfacePaintInvalidation({
        changedElements: [wrapper],
        sourceElementBySurfaceId: new Map([
          ["first", first],
          ["second", second],
        ]),
        sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
        sourceSelector: SOURCE_SELECTOR,
      }).dirtySurfaceIds,
    ).toEqual([]);
  });

  it("ignores surface-level and unrelated paint events", () => {
    const source = createSource("surface-a");
    const surfaceRoot = document.createElement("canvas");
    const unrelated = document.createElement("div");
    surfaceRoot.dataset.htmlSurfaceRoot = "true";
    surfaceRoot.append(source);

    const result = resolveHtmlSurfacePaintInvalidation({
      changedElements: [surfaceRoot, unrelated],
      sourceElementBySurfaceId: new Map([["surface-a", source]]),
      sourceIdAttribute: SOURCE_ID_ATTRIBUTE,
      sourceSelector: SOURCE_SELECTOR,
      surfaceSelector: SURFACE_SELECTOR,
    });

    expect(result).toEqual({
      dirtySurfaceInvalidations: [],
      dirtySurfaceIds: [],
      transformOnlyPaintSurfaceIds: [],
    });
  });
});

function createSource(surfaceId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.htmlSurfaceSource = "true";
  element.dataset.surfaceId = surfaceId;
  return element;
}

function setElementRect(
  element: Element,
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">,
) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }) as DOMRect;
}

class ThrowOnMapIteration<K, V> extends Map<K, V> {
  iterationCount = 0;

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate source maps.");
  }

  override entries(): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate source maps.");
  }
}
