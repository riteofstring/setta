/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KwargsActionIconButton } from "./KwargsActionIconButton";

type RenderedKwargsActionIconButton = {
  host: HTMLDivElement;
  root: Root;
};

async function renderKwargsActionIconButton(
  props: Partial<Parameters<typeof KwargsActionIconButton>[0]> = {},
): Promise<RenderedKwargsActionIconButton> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <KwargsActionIconButton
        ariaLabel="Add arg"
        className="kwargs-action-button"
        disabled={false}
        iconClassName="gg-math-plus"
        lightweightActivator={true}
        onActivate={() => undefined}
        tooltipContent="Add arg"
        {...props}
      />,
    );
  });

  return { host, root };
}

describe("KwargsActionIconButton", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses a lightweight non-button root on the canvas path and preserves click and keyboard activation", async () => {
    const onActivate = vi.fn();
    const { host, root } = await renderKwargsActionIconButton({ onActivate });

    try {
      const button = host.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-action-button="true"]',
      );
      expect(button).not.toBeNull();
      expect(button?.tagName).toBe("DIV");
      expect(button?.getAttribute("role")).toBe("button");
      expect(button?.getAttribute("aria-label")).toBe("Add arg");
      expect(host.querySelector("button")).toBeNull();

      await act(async () => {
        button?.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
        button?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
        button?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: " ",
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      expect(onActivate).toHaveBeenCalledTimes(3);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("keeps the legacy button root off the lightweight path", async () => {
    const { host, root } = await renderKwargsActionIconButton({
      lightweightActivator: false,
    });

    try {
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Add arg");
      expect(
        host.querySelector('[data-canvas-owned-lightweight-action-button="true"]'),
      ).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("blocks activation when disabled on the lightweight path", async () => {
    const onActivate = vi.fn();
    const { host, root } = await renderKwargsActionIconButton({
      disabled: true,
      onActivate,
    });

    try {
      const button = host.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-action-button="true"]',
      );
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(button?.tabIndex).toBe(-1);

      await act(async () => {
        button?.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
        button?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      expect(onActivate).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
