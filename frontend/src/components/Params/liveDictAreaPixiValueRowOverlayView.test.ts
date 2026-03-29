import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPixiValueRowOverlayStyle } from "./liveDictAreaPixiValueRowOverlayView";

describe("buildLiveDictAreaPixiValueRowOverlayStyle", () => {
  it("counter-scales live Pixi CodeMirror overlays when the viewport is zoomed out", () => {
    const style = buildLiveDictAreaPixiValueRowOverlayStyle({
      editorKind: "codemirror",
      target: {
        height: 20,
        width: 296,
        x: 12,
        y: 34,
      },
      viewportZoom: 0.1,
    });

    expect(style).toMatchObject({
      contain: "layout paint",
      left: 12,
      minHeight: 20,
      top: 34,
      transform: "scale(10)",
      transformOrigin: "top left",
      width: 296,
    });
  });

  it("keeps non-CodeMirror overlays in flow-space", () => {
    const style = buildLiveDictAreaPixiValueRowOverlayStyle({
      editorKind: "combobox",
      target: {
        height: 20,
        width: 296,
        x: 12,
        y: 34,
      },
      viewportZoom: 0.1,
    });

    expect(style).toMatchObject({
      contain: "layout paint",
      left: 12,
      minHeight: 20,
      top: 34,
      width: 296,
    });
    expect(style.transform).toBeUndefined();
    expect(style.transformOrigin).toBeUndefined();
  });

  it("keeps CodeMirror overlays unmodified at normal or zoomed-in scales", () => {
    const style = buildLiveDictAreaPixiValueRowOverlayStyle({
      editorKind: "codemirror",
      target: {
        height: 20,
        width: 296,
        x: 12,
        y: 34,
      },
      viewportZoom: 1,
    });

    expect(style.transform).toBeUndefined();
    expect(style.transformOrigin).toBeUndefined();
  });
});
