/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { resolveHtmlSurfacePaintInvalidation } from "./paintInvalidation";

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
    expect(sources.iterationCount).toBe(0);
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
