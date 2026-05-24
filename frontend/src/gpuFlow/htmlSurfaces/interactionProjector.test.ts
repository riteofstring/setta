/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  HTML_SURFACE_PASSIVE_TRANSFORM,
  HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE,
  applyHtmlSurfaceActiveDomIslandProjection,
  createHtmlSurfaceInteractionProjector,
  hideHtmlSurfaceActiveDomIslandProjection,
  projectHtmlSurfaceActiveDomIsland,
  projectHtmlSurfaceInteractionTarget,
  resolveTopmostHtmlSurfaceInteractionTarget,
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

  it("projects the topmost compositor interaction target", () => {
    const lower = document.createElement("div");
    const upper = document.createElement("div");
    const projector = createHtmlSurfaceInteractionProjector();
    const target = resolveTopmostHtmlSurfaceInteractionTarget([
      {
        localX: 10,
        localY: 8,
        sourceElement: lower,
        sourceId: "lower",
        surfaceX: 20,
        surfaceY: 20,
        zIndex: 1,
      },
      {
        localX: 2,
        localY: 3,
        sourceElement: upper,
        sourceId: "upper",
        surfaceX: 50,
        surfaceY: 60,
        zIndex: 4,
      },
    ]);

    projectHtmlSurfaceInteractionTarget({ projector, target });

    expect(projector.getProjectedSourceId()).toBe("upper");
    expect(upper.style.transform).toBe("translate(48px, 57px)");
    expect(lower.style.pointerEvents).toBe("");
  });

  it("projects active DOM island geometry through the compositor projector", () => {
    const element = document.createElement("div");
    const projection = projectHtmlSurfaceActiveDomIsland({
      flowRect: { height: 20, width: 40, x: 10, y: 30 },
      viewport: [5, 10, 2],
      zIndex: 7,
    });

    applyHtmlSurfaceActiveDomIslandProjection({ element, projection });

    expect(element.style.left).toBe("25px");
    expect(element.style.top).toBe("70px");
    expect(element.style.width).toBe("40px");
    expect(element.style.height).toBe("20px");
    expect(element.style.transform).toBe("scale(2)");
    expect(element.style.pointerEvents).toBe("auto");
    expect(element.style.zIndex).toBe("7");

    hideHtmlSurfaceActiveDomIslandProjection(element);

    expect(element.style.display).toBe("none");
    expect(element.style.pointerEvents).toBe("none");
  });
});
