// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown,
  shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown,
} from "./projectGpuActiveParamCanvasPopupDismissal";

describe("project GPU active param canvas popup dismissal", () => {
  it("dismisses retained canvas popups on Escape", () => {
    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown({
        defaultPrevented: false,
        key: "Escape",
      }),
    ).toBe(true);
    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown({
        defaultPrevented: false,
        key: "Enter",
      }),
    ).toBe(false);
    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnKeyDown({
        defaultPrevented: true,
        key: "Escape",
      }),
    ).toBe(false);
  });

  it("dismisses retained canvas popups only for document pointer downs outside the project surface", () => {
    const root = document.createElement("div");
    const child = document.createElement("button");
    const outside = document.createElement("button");
    root.append(child);
    document.body.append(root, outside);

    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown(
        {
          defaultPrevented: false,
          target: outside,
        },
        root,
      ),
    ).toBe(true);
    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown(
        {
          defaultPrevented: false,
          target: child,
        },
        root,
      ),
    ).toBe(false);
    expect(
      shouldDismissProjectGpuActiveParamCanvasPopupOnPointerDown(
        {
          defaultPrevented: true,
          target: outside,
        },
        root,
      ),
    ).toBe(false);
  });
});
