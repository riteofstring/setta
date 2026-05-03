/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RotaryInput } from "./RotaryInput";

type RenderedRotaryInput = {
  button: HTMLButtonElement;
  host: HTMLDivElement;
  root: Root;
};

async function renderRotaryInput(
  props: Partial<ComponentProps<typeof RotaryInput>> = {},
): Promise<RenderedRotaryInput> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<RotaryInput value={2} min={0} max={10} step={2} {...props} />);
  });

  const button = host.querySelector('button[role="slider"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Expected rotary slider button.");
  }

  return { button, host, root };
}

async function unmountRotaryInput({
  host,
  root,
}: Pick<RenderedRotaryInput, "host" | "root">): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("RotaryInput theme overrides", () => {
  it("uses the default indicator theme when override is not provided", () => {
    const markup = renderToStaticMarkup(
      <RotaryInput value={0} min={0} max={10} step={1} />,
    );

    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("nodrag nopan");
    expect(markup).toContain("bg-blue-500");
  });

  it("uses the override indicator theme and does not include defaults", () => {
    const markup = renderToStaticMarkup(
      <RotaryInput
        value={0}
        min={0}
        max={10}
        step={1}
        indicatorThemeClassName="bg-red-500"
      />,
    );

    expect(markup).toContain("bg-red-500");
    expect(markup).not.toContain("bg-blue-500");
  });

  it("increments from the current value for ArrowUp", async () => {
    const onChange = vi.fn();
    const rendered = await renderRotaryInput({ onChange });

    try {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowUp",
      });

      await act(async () => {
        rendered.button.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenLastCalledWith(4);
    } finally {
      await unmountRotaryInput(rendered);
    }
  });

  it.each([
    ["Home", 0],
    ["End", 10],
  ])("maps %s to the expected boundary value", async (key, expected) => {
    const onChange = vi.fn();
    const rendered = await renderRotaryInput({ onChange, value: 6 });

    try {
      await act(async () => {
        rendered.button.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key,
          }),
        );
      });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenLastCalledWith(expected);
    } finally {
      await unmountRotaryInput(rendered);
    }
  });

  it("commits keyboard changes after applying the live value", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const rendered = await renderRotaryInput({ onChange, onCommit });

    try {
      await act(async () => {
        rendered.button.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowUp",
          }),
        );
      });

      expect(onChange).toHaveBeenCalledWith(4);
      expect(onCommit).toHaveBeenCalledWith(4);
    } finally {
      await unmountRotaryInput(rendered);
    }
  });

  it("keeps pointer drag changes live until pointer release commits", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const rendered = await renderRotaryInput({ onChange, onCommit });

    try {
      vi.spyOn(rendered.button, "getBoundingClientRect").mockReturnValue({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        toJSON: () => ({}),
        top: 0,
        width: 100,
        x: 0,
        y: 0,
      });
      Object.defineProperty(rendered.button, "setPointerCapture", {
        configurable: true,
        value: vi.fn(),
      });
      Object.defineProperty(rendered.button, "releasePointerCapture", {
        configurable: true,
        value: vi.fn(),
      });

      await act(async () => {
        dispatchSyntheticPointerEvent(rendered.button, "pointerdown", {
          clientX: 100,
          clientY: 50,
          pointerId: 1,
        });
      });
      await act(async () => {
        dispatchSyntheticPointerEvent(rendered.button, "pointermove", {
          clientX: 50,
          clientY: 0,
          pointerId: 1,
        });
      });

      expect(onChange.mock.calls).toEqual([[6], [2]]);
      expect(onCommit).not.toHaveBeenCalled();

      await act(async () => {
        dispatchSyntheticPointerEvent(rendered.button, "pointerup", {
          clientX: 50,
          clientY: 0,
          pointerId: 1,
        });
      });

      expect(onCommit.mock.calls).toEqual([[2]]);
    } finally {
      await unmountRotaryInput(rendered);
    }
  });

  it("still delegates Escape to onEscape when disabled", async () => {
    const onChange = vi.fn();
    const onEscape = vi.fn();
    const rendered = await renderRotaryInput({
      isDisabled: true,
      onChange,
      onEscape,
    });

    try {
      await act(async () => {
        rendered.button.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Escape",
          }),
        );
      });

      expect(onEscape).toHaveBeenCalledOnce();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      await unmountRotaryInput(rendered);
    }
  });
});

function dispatchSyntheticPointerEvent(
  target: EventTarget,
  type: string,
  {
    clientX,
    clientY,
    pointerId,
  }: {
    clientX: number;
    clientY: number;
    pointerId: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: pointerId,
  });
  target.dispatchEvent(event);
}
