/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FloatingSnapPreset } from "./projectChatSnapLayout";
import { useProjectChatWindowShortcuts } from "./projectChatWindowShortcuts";

vi.mock("utils/utils", () => ({
  isMacOs: () => false,
}));

const TEST_SHORTCUTS = {
  canvasToggle: "Shift + Escape",
  maximizeFocused: "Ctrl + Shift + Enter",
  minimizeFocused: "Ctrl + Shift + Backspace",
  snapLeft: "Ctrl + Alt + ArrowLeft",
  snapRight: "Ctrl + Alt + ArrowRight",
  snapTop: "Ctrl + Alt + ArrowUp",
  snapBottom: "Ctrl + Alt + ArrowDown",
  snapTopLeft: "Ctrl + Alt + Shift + Q",
  snapTopRight: "Ctrl + Alt + Shift + W",
  snapBottomLeft: "Ctrl + Alt + Shift + A",
  snapBottomRight: "Ctrl + Alt + Shift + S",
};

function ShortcutHarness({
  hasOverlayWindows = false,
  hasActiveVisibleWindow = false,
  onToggleCanvasVisibility = () => {},
  onMaximizeFocusedWindow = null,
  onMinimizeFocusedWindow = null,
  onSnapPreset = () => {},
}: {
  hasOverlayWindows?: boolean;
  hasActiveVisibleWindow?: boolean;
  onToggleCanvasVisibility?: () => void;
  onMaximizeFocusedWindow?: (() => void) | null;
  onMinimizeFocusedWindow?: (() => void) | null;
  onSnapPreset?: (preset: FloatingSnapPreset) => void;
}) {
  useProjectChatWindowShortcuts({
    shortcuts: TEST_SHORTCUTS,
    hasOverlayWindows,
    hasActiveVisibleWindow,
    onToggleCanvasVisibility,
    onMaximizeFocusedWindow,
    onMinimizeFocusedWindow,
    onSnapPreset,
  });

  return (
    <div>
      <input data-testid="shortcut-input" />
      <div
        data-testid="shortcut-editor"
        contentEditable
        suppressContentEditableWarning
      />
    </div>
  );
}

function dispatchKeyboardEvent(
  target: Document | HTMLElement,
  init: KeyboardEventInit,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useProjectChatWindowShortcuts", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("toggles canvas visibility when the overlay shortcut fires outside inputs", async () => {
    const onToggleCanvasVisibility = vi.fn();

    await act(async () => {
      root.render(
        <ShortcutHarness
          hasOverlayWindows
          onToggleCanvasVisibility={onToggleCanvasVisibility}
        />,
      );
    });

    const event = dispatchKeyboardEvent(document, {
      key: "Escape",
      code: "Escape",
      shiftKey: true,
    });

    expect(onToggleCanvasVisibility).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores global shortcuts while typing in inputs or contenteditable targets", async () => {
    const onToggleCanvasVisibility = vi.fn();

    await act(async () => {
      root.render(
        <ShortcutHarness
          hasOverlayWindows
          onToggleCanvasVisibility={onToggleCanvasVisibility}
        />,
      );
    });

    const input = host.querySelector(
      '[data-testid="shortcut-input"]',
    ) as HTMLInputElement | null;
    const editor = host.querySelector(
      '[data-testid="shortcut-editor"]',
    ) as HTMLDivElement | null;

    expect(input).not.toBeNull();
    expect(editor).not.toBeNull();

    dispatchKeyboardEvent(input!, {
      key: "Escape",
      code: "Escape",
      shiftKey: true,
    });
    dispatchKeyboardEvent(editor!, {
      key: "Escape",
      code: "Escape",
      shiftKey: true,
    });

    expect(onToggleCanvasVisibility).not.toHaveBeenCalled();
  });

  it("runs maximize and minimize actions for the active visible window shortcuts", async () => {
    const onMaximizeFocusedWindow = vi.fn();
    const onMinimizeFocusedWindow = vi.fn();

    await act(async () => {
      root.render(
        <ShortcutHarness
          hasActiveVisibleWindow
          onMaximizeFocusedWindow={onMaximizeFocusedWindow}
          onMinimizeFocusedWindow={onMinimizeFocusedWindow}
        />,
      );
    });

    dispatchKeyboardEvent(document, {
      key: "Enter",
      code: "Enter",
      ctrlKey: true,
      shiftKey: true,
    });
    dispatchKeyboardEvent(document, {
      key: "Backspace",
      code: "Backspace",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(onMaximizeFocusedWindow).toHaveBeenCalledTimes(1);
    expect(onMinimizeFocusedWindow).toHaveBeenCalledTimes(1);
  });

  it("maps directional and quarter snap shortcuts to the expected presets", async () => {
    const onSnapPreset = vi.fn();

    await act(async () => {
      root.render(<ShortcutHarness onSnapPreset={onSnapPreset} />);
    });

    dispatchKeyboardEvent(document, {
      key: "ArrowLeft",
      code: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
    });
    dispatchKeyboardEvent(document, {
      key: "W",
      code: "KeyW",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });

    expect(onSnapPreset).toHaveBeenNthCalledWith(1, "left");
    expect(onSnapPreset).toHaveBeenNthCalledWith(2, "top_right");
  });
});
