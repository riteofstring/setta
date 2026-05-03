/* @vitest-environment jsdom */

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import type { InputHTMLAttributes, RefObject } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import { ComboboxList } from "./ComboboxParts";

describe("ComboboxList", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
  });

  it("portals into an explicit container and refreshes placement on GPU viewport transforms", async () => {
    const host = document.createElement("div");
    const portalRoot = document.createElement("div");
    const input = document.createElement("input");
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    portalRoot.id = "combobox-portal-root";
    document.body.append(host, portalRoot, input);
    const root = createRoot(host);
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const frameCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    };
    window.cancelAnimationFrame = () => undefined;

    let rect = createRect({ bottom: 54, left: 12, width: 120 });
    input.getBoundingClientRect = () => rect;
    const inputRef: RefObject<HTMLInputElement | null> = { current: input };

    try {
      await act(async () => {
        root.render(
          <ComboboxList
            isOpen={true}
            getMenuProps={getMenuProps}
            inputRef={inputRef}
            portalContainerId={portalRoot.id}
            repositionOnCanvasTransform={true}
          >
            <div>Choice A</div>
          </ComboboxList>,
        );
      });
      await act(async () => {
        flushNextFrame(frameCallbacks);
      });

      const list = portalRoot.querySelector<HTMLElement>(
        '[data-testid="combobox-list"]',
      );
      expect(list).not.toBeNull();
      expect(list?.style.left).toBe("12px");
      expect(list?.style.top).toBe("24px");
      expect(list?.style.minWidth).toBe("120px");

      rect = createRect({ bottom: 90, left: 40, width: 180 });
      await act(async () => {
        expect(
          gpuFlowViewportStore.getState().setTransform([16, 24, 1.5]),
        ).toBe(true);
      });
      await act(async () => {
        flushNextFrame(frameCallbacks);
      });

      const repositionedList = portalRoot.querySelector<HTMLElement>(
        '[data-testid="combobox-list"]',
      );
      expect(repositionedList?.style.left).toBe("40px");
      expect(repositionedList?.style.top).toBe("60px");
      expect(repositionedList?.style.minWidth).toBe("180px");
    } finally {
      await act(async () => {
        root.unmount();
      });
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});

function getMenuProps(): InputHTMLAttributes<HTMLInputElement> {
  return {
    "data-testid": "combobox-list",
  } as InputHTMLAttributes<HTMLInputElement>;
}

function createRect({
  bottom,
  left,
  width,
}: {
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
}): DOMRect {
  return {
    bottom,
    height: 20,
    left,
    right: left + width,
    top: bottom - 20,
    width,
    x: left,
    y: bottom - 20,
    toJSON: () => ({}),
  };
}

function flushNextFrame(frameCallbacks: FrameRequestCallback[]) {
  const callback = frameCallbacks.shift();
  if (!callback) {
    throw new Error("Expected a pending animation frame callback.");
  }
  callback(performance.now());
}
