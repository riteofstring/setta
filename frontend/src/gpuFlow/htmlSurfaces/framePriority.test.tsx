/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { renderHtmlSurfaceFrame } from "./frame";
import {
  canvasSize,
  createFrameRenderer,
  createFrameTextureManager,
  getRegisterTextureCall,
  node,
  surfaceOverlay,
} from "./frame.test-helper";

describe("HTML surface frame texture priority", () => {
  it("prioritizes visible section shell textures ahead of passive overlays", () => {
    const section = document.createElement("section");
    const snapshot = document.createElement("div");
    const elements = new Map([
      ["section-a", section],
      ["snapshot-a", snapshot],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 1,
      htmlSurfaceOverlays: [
        {
          ...surfaceOverlay("snapshot-a", 10, 20, 100, 24, 1),
          actorKind: "dom-control",
        },
      ],
      marginCssPx: 0,
      nodes: [
        {
          ...node("section-a", 10, 20, 100, 80, 0),
          actorKind: "dom-section",
        },
      ],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(getRegisterTextureCall(manager, "section-a")).toMatchObject({
      priority: "critical",
      surfaceId: "section-a",
    });
    expect(getRegisterTextureCall(manager, "snapshot-a")).toMatchObject({
      priority: "visible",
      surfaceId: "snapshot-a",
    });
  });
});
