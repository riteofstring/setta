// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getNormalizedEventCode,
  getShouldPreventDefault,
  getTabShortcutInfo,
  isShortcutPressed,
  parseShortcut,
} from "./keyShortcutMatching";

describe("keyShortcutMatching", () => {
  it("normalizes shortcut strings into parsed modifier and key sets", () => {
    // Shortcut parsing should turn letter, digit, and symbol tokens into event-code keys.
    const parsed = parseShortcut("mod + shift + 1 + /");

    expect(parsed).toEqual({
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
      keys: new Set(["Digit1", "Slash"]),
    });
  });

  it("detects tab-only shortcuts and preserves whether shift is required", () => {
    // Tab indentation logic needs to distinguish Tab from Shift+Tab and reject Mod+Tab.
    expect(getTabShortcutInfo("Tab")).toEqual({ shift: false });
    expect(getTabShortcutInfo("Shift + Tab")).toEqual({ shift: true });
    expect(getTabShortcutInfo("Mod + Tab")).toBeNull();
  });

  it("falls back to event.key when keyboard events have no stable code", () => {
    // Browser events can arrive with `Unidentified`, so fallback normalization must stay deterministic.
    expect(
      getNormalizedEventCode(
        new KeyboardEvent("keydown", { key: "/", code: "Unidentified" }),
      ),
    ).toBe("Slash");
    expect(
      getNormalizedEventCode(
        new KeyboardEvent("keydown", { key: "a", code: "Unidentified" }),
      ),
    ).toBe("KeyA");
  });

  it("preserves default browser behavior for tab-only and copy shortcuts", () => {
    // The listener should not prevent default for bare Tab or common clipboard shortcuts.
    expect(getShouldPreventDefault(parseShortcut("tab"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + c"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + shift + 1"))).toBe(
      true,
    );
  });

  it("matches pressed shortcuts against the tracked non-modifier keys", () => {
    // Trigger detection relies on the parsed key set plus the modifier flags from the event.
    const parsed = parseShortcut("ctrl + shift + 1");
    const event = new KeyboardEvent("keydown", {
      ctrlKey: true,
      shiftKey: true,
      code: "Digit1",
    });

    expect(isShortcutPressed(event, parsed, false, new Set(["Digit1"]))).toBe(
      true,
    );
    expect(isShortcutPressed(event, parsed, false, new Set(["Digit2"]))).toBe(
      false,
    );
  });
});
