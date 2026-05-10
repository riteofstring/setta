/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SETTA_POPOVER_PORTAL_PARENT_ID } from "utils/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPickerInput } from "./ColorPickerInput";

describe("ColorPickerInput", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("opens color choices and commits the selected color", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const portalRoot = document.createElement("div");
    portalRoot.id = SETTA_POPOVER_PORTAL_PARENT_ID;
    document.body.appendChild(portalRoot);

    await act(async () => {
      root.render(
        <ColorPickerInput
          colorChoices={[
            { color: "#ef4444", description: "Red" },
            { color: "#3b82f6", description: "Blue" },
          ]}
          value="#ef4444"
          onChange={onChange}
          onCommit={onCommit}
          wrapperClassName="h-8 w-36"
          colorPickerChoicesClasses="flex h-8 w-36 items-center rounded-lg"
        />,
      );
    });

    const trigger = host.querySelector(
      'button[aria-haspopup="listbox"]',
    ) as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.dataset.gpuFlowInteractive).toBe("true");
    expect(trigger?.classList.contains("nodrag")).toBe(true);
    expect(trigger?.classList.contains("nopan")).toBe(true);

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const blueOption = Array.from(
      portalRoot.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((element) => element.textContent?.includes("Blue"));
    expect(blueOption).toBeTruthy();
    expect(portalRoot.querySelector('[role="listbox"]')).not.toBeNull();

    await act(async () => {
      blueOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("#3b82f6");
    expect(onCommit).toHaveBeenCalledWith("#3b82f6");
    expect(portalRoot.querySelector('[role="listbox"]')).toBeNull();
  });

  it("marks the native color input as an explicit GPU flow control", async () => {
    await act(async () => {
      root.render(
        <ColorPickerInput
          colorChoices={[]}
          value="#ef4444"
          onChange={() => undefined}
          wrapperClassName="h-8 w-36"
          colorPickerChoicesClasses="flex h-8 w-36 items-center rounded-lg"
        />,
      );
    });

    const input = host.querySelector('input[type="color"]');
    expect(input?.getAttribute("data-gpu-flow-interactive")).toBe("true");
    expect(input?.classList.contains("nodrag")).toBe(true);
    expect(input?.classList.contains("nopan")).toBe(true);
  });

  it("splits native color input preview and commit events", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    await act(async () => {
      root.render(
        <ColorPickerInput
          colorChoices={[]}
          value="#ef4444"
          onChange={onChange}
          onCommit={onCommit}
          wrapperClassName="h-8 w-36"
          colorPickerChoicesClasses="flex h-8 w-36 items-center rounded-lg"
        />,
      );
    });

    const input = host.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (!input) {
        return;
      }
      input.value = "#3b82f6";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onChange.mock.calls).toEqual([["#3b82f6"]]);
    expect(onCommit.mock.calls).toEqual([["#3b82f6"]]);
  });
});
