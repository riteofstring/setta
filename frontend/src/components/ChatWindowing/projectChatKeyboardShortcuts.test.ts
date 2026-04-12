import { describe, expect, it } from "vitest";
import {
  getNormalizedEventCode,
  isShortcutPressed,
  parseShortcut,
  resolveChatWindowingShortcuts,
} from "./projectChatKeyboardShortcuts";

describe("project chat keyboard shortcuts", () => {
  it("fills missing shortcut bindings from defaults", () => {
    expect(
      resolveChatWindowingShortcuts({
        maximizeFocused: "Mod + Enter",
      }),
    ).toEqual({
      canvasToggle: "Shift + Esc",
      maximizeFocused: "Mod + Enter",
      minimizeFocused: "Mod + Shift + M",
      snapLeft: "Mod + Alt + ArrowLeft",
      snapRight: "Mod + Alt + ArrowRight",
      snapTop: "Mod + Alt + ArrowUp",
      snapBottom: "Mod + Alt + ArrowDown",
    });
  });

  it("normalizes fallback keyboard keys when code is unavailable", () => {
    const event = {
      key: "Escape",
      code: "Unidentified",
    } as KeyboardEvent;

    expect(getNormalizedEventCode(event)).toBe("Escape");
  });

  it("matches platform-aware modifier shortcuts", () => {
    const event = {
      key: "ArrowLeft",
      code: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent;

    expect(
      isShortcutPressed(
        event,
        getNormalizedEventCode(event),
        parseShortcut("Mod + Alt + ArrowLeft"),
        false,
      ),
    ).toBe(true);
  });
});
