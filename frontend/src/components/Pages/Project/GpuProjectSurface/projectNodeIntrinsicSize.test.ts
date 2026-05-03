/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  measureIntrinsicElementHeight,
  measureIntrinsicElementWidth,
} from "./projectNodeIntrinsicSize";

function parsePixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampDimension(
  value: number,
  minValue: number | null,
  maxValue: number | null,
): number {
  return Math.min(Math.max(value, minValue ?? 0), maxValue ?? Infinity);
}

function installMeasuredBox(
  element: HTMLElement,
  {
    autoHeight,
    autoWidth,
  }: {
    readonly autoHeight: number;
    readonly autoWidth: number;
  },
) {
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get() {
      const height = parsePixelValue(element.style.height) ?? autoHeight;
      return clampDimension(
        height,
        parsePixelValue(element.style.minHeight),
        parsePixelValue(element.style.maxHeight),
      );
    },
  });
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get() {
      const width = parsePixelValue(element.style.width) ?? autoWidth;
      return clampDimension(
        width,
        parsePixelValue(element.style.minWidth),
        parsePixelValue(element.style.maxWidth),
      );
    },
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: element.offsetHeight,
      height: element.offsetHeight,
      left: 0,
      right: element.offsetWidth,
      top: 0,
      width: element.offsetWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("projectNodeIntrinsicSize", () => {
  it("measures auto height by clearing the live fixed GPU height", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 122, autoWidth: 550 });
    element.style.height = "350px";
    element.style.maxHeight = "900px";
    element.style.minHeight = "10px";

    expect(
      measureIntrinsicElementHeight(element, {
        maxHeight: 350,
        minHeight: 80,
      }),
    ).toBe(122);
    expect(element.style.height).toBe("350px");
    expect(element.style.maxHeight).toBe("900px");
    expect(element.style.minHeight).toBe("10px");
  });

  it("preserves capped auto height for content taller than the policy cap", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 1569, autoWidth: 550 });
    element.style.height = "350px";

    expect(
      measureIntrinsicElementHeight(element, {
        maxHeight: 350,
        minHeight: 80,
      }),
    ).toBe(350);
    expect(element.style.height).toBe("350px");
  });

  it("measures auto width by clearing the live fixed GPU width", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 350, autoWidth: 240 });
    element.style.width = "550px";
    element.style.maxWidth = "900px";
    element.style.minWidth = "10px";

    expect(
      measureIntrinsicElementWidth(element, {
        maxWidth: 550,
        minWidth: 120,
      }),
    ).toBe(240);
    expect(element.style.width).toBe("550px");
    expect(element.style.maxWidth).toBe("900px");
    expect(element.style.minWidth).toBe("10px");
  });
});
