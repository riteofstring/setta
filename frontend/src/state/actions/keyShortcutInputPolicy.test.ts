// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getIgnoreWhenInInputField,
  getIsInput,
} from "./keyShortcutInputPolicy";
import { parseShortcut } from "./keyShortcutMatching";

describe("keyShortcutInputPolicy", () => {
  it("treats native editable targets as input surfaces", () => {
    // Listener filtering should recognize both classic inputs and contenteditable targets.
    const input = document.createElement("input");
    const contentEditable = document.createElement("div");
    Object.defineProperty(contentEditable, "isContentEditable", {
      value: true,
    });

    expect(getIsInput({ target: input } as KeyboardEvent)).toBe(true);
    expect(getIsInput({ target: contentEditable } as KeyboardEvent)).toBe(true);
    expect(getIsInput({ target: document.createElement("div") } as Event)).toBe(
      false,
    );
  });

  it("keeps tab and escape available even when focus is inside an input", () => {
    // Tab navigation and Escape clearing should bypass the input-ignore allowlist.
    expect(getIgnoreWhenInInputField(parseShortcut("tab"), true)).toBe(false);
    expect(getIgnoreWhenInInputField(parseShortcut("escape"), false)).toBe(
      false,
    );
  });

  it("allows standard text-editing shortcuts through input fields", () => {
    // Editing shortcuts should not steal browser-native input behavior.
    expect(getIgnoreWhenInInputField(parseShortcut("mod + c"), true)).toBe(
      true,
    );
    expect(
      getIgnoreWhenInInputField(parseShortcut("ctrl + shift + v"), false),
    ).toBe(true);
    expect(
      getIgnoreWhenInInputField(parseShortcut("mod + shift + 1"), true),
    ).toBe(false);
  });
});
