/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  HTML_SURFACE_PASSIVE_TRANSFORM,
  HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE,
  createHtmlSurfaceInteractionProjector,
} from "./interactionProjector";

describe("HtmlSurfaceInteractionProjector", () => {
  it("aligns one source pixel under the pointer and passivates the previous source", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const projector = createHtmlSurfaceInteractionProjector();

    projector.alignSourceToClientPoint({
      localX: 15,
      localY: 5,
      sourceElement: first,
      sourceId: "first",
      surfaceX: 70,
      surfaceY: 60,
    });

    expect(first.style.transform).toBe("translate(55px, 55px)");
    expect(first.style.pointerEvents).toBe("auto");
    expect(
      first.getAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE),
    ).toBe("true");
    expect(projector.getProjectedSourceId()).toBe("first");

    projector.alignSourceToClientPoint({
      localX: 4,
      localY: 8,
      sourceElement: second,
      sourceId: "second",
      surfaceX: 20,
      surfaceY: 30,
    });

    expect(first.style.transform).toBe(HTML_SURFACE_PASSIVE_TRANSFORM);
    expect(first.style.pointerEvents).toBe("none");
    expect(
      first.hasAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE),
    ).toBe(false);
    expect(second.style.transform).toBe("translate(16px, 22px)");
    expect(second.style.pointerEvents).toBe("auto");
    expect(projector.getProjectedSourceId()).toBe("second");
  });

  it("clears only the projected source requested by the caller", () => {
    const source = document.createElement("div");
    const projector = createHtmlSurfaceInteractionProjector();

    projector.alignSourceToClientPoint({
      localX: 10,
      localY: 20,
      sourceElement: source,
      sourceId: "source-a",
      surfaceX: 100,
      surfaceY: 140,
    });
    projector.clearSource("other-source");

    expect(source.style.pointerEvents).toBe("auto");
    expect(projector.getProjectedSourceId()).toBe("source-a");

    projector.clearSource("source-a");

    expect(source.style.transform).toBe(HTML_SURFACE_PASSIVE_TRANSFORM);
    expect(source.style.pointerEvents).toBe("none");
    expect(projector.getProjectedSourceId()).toBeNull();
  });
});
