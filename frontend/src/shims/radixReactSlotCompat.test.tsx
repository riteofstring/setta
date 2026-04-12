/* @vitest-environment jsdom */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Slot } from "./radixReactSlotCompat";

describe("radixReactSlotCompat", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps child refs and slot refs attached to the same element", async () => {
    const slotRef = React.createRef<HTMLButtonElement>();
    const childRef = React.createRef<HTMLButtonElement>();

    await act(async () => {
      root.render(
        <Slot ref={slotRef}>
          <button ref={childRef} type="button">
            Click me
          </button>
        </Slot>,
      );
    });

    expect(slotRef.current).toBeInstanceOf(HTMLButtonElement);
    expect(childRef.current).toBe(slotRef.current);
  });

  it("keeps child handlers ahead of slot handlers when both are present", async () => {
    const callOrder: string[] = [];
    const childClick = vi.fn(() => {
      callOrder.push("child");
    });
    const slotClick = vi.fn(() => {
      callOrder.push("slot");
    });

    await act(async () => {
      root.render(
        <Slot onClick={slotClick}>
          <button onClick={childClick} type="button">
            Click me
          </button>
        </Slot>,
      );
    });

    const button = host.querySelector("button");
    if (!button) {
      throw new Error("Expected button to render");
    }

    await act(async () => {
      button.click();
    });

    expect(childClick).toHaveBeenCalledTimes(1);
    expect(slotClick).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["child", "slot"]);
  });
});
