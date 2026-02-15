import { describe, expect, it, vi } from "vitest";
import {
  attachPreviewResizeListeners,
  getListHeightPct,
  getPreviewHeightPctFromPointer,
} from "./FileBrowserWorkspace";

describe("FileBrowserWorkspace sizing helpers", () => {
  it("expands list pane when preview is minimized", () => {
    expect(
      getListHeightPct({ previewHeightPct: 42, isPreviewMinimized: true }),
    ).toBe(100);
  });

  it("keeps list pane within percentage bounds when preview is shown", () => {
    expect(
      getListHeightPct({ previewHeightPct: 42, isPreviewMinimized: false }),
    ).toBe(58);
    expect(
      getListHeightPct({ previewHeightPct: 90, isPreviewMinimized: false }),
    ).toBe(32);
  });

  it("converts pointer position to bounded preview height", () => {
    const mid = getPreviewHeightPctFromPointer({
      pointerClientY: 260,
      containerTop: 100,
      containerHeight: 400,
    });
    expect(mid).toBeCloseTo(60, 5);

    const clampedLow = getPreviewHeightPctFromPointer({
      pointerClientY: 490,
      containerTop: 100,
      containerHeight: 400,
    });
    expect(clampedLow).toBe(24);

    const clampedHigh = getPreviewHeightPctFromPointer({
      pointerClientY: 110,
      containerTop: 100,
      containerHeight: 400,
    });
    expect(clampedHigh).toBe(68);
  });

  it("returns a cleanup that removes all active pointer listeners", () => {
    const target = {
      addEventListener: (_name: string, _handler: (event: PointerEvent) => void) =>
        undefined,
      removeEventListener: (
        _name: string,
        _handler: (event: PointerEvent) => void,
      ) => undefined,
    };
    const addSpy = vi.spyOn(target, "addEventListener");
    const removeSpy = vi.spyOn(target, "removeEventListener");

    const cleanup = attachPreviewResizeListeners({
      target,
      onMove: () => undefined,
      onUp: () => undefined,
    });

    expect(addSpy).toHaveBeenCalledTimes(3);
    cleanup();
    expect(removeSpy).toHaveBeenCalledTimes(3);
  });
});
