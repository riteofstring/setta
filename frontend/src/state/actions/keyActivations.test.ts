import { describe, expect, it } from "vitest";
import {
  getIgnoreWhenInInputField,
  getShouldPreventDefault,
  parseShortcut,
} from "./keyActivations";

describe("key activation shortcut policy", () => {
  it("does not prevent default copy or paste shortcuts", () => {
    expect(getShouldPreventDefault(parseShortcut("mod + c"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + v"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + p"))).toBe(true);
  });

  it("ignores plain typing and editor-navigation shortcuts inside macOS inputs", () => {
    expect(getIgnoreWhenInInputField(parseShortcut("k"), true)).toBe(true);
    expect(
      getIgnoreWhenInInputField(parseShortcut("mod + shift + z"), true),
    ).toBe(true);
    expect(
      getIgnoreWhenInInputField(parseShortcut("mod + shift + p"), true),
    ).toBe(false);
  });

  it("ignores ctrl-or-mod text editing shortcuts inside Windows inputs", () => {
    expect(
      getIgnoreWhenInInputField(parseShortcut("ctrl + shift + v"), false),
    ).toBe(true);
    expect(getIgnoreWhenInInputField(parseShortcut("mod + end"), false)).toBe(
      true,
    );
    expect(
      getIgnoreWhenInInputField(parseShortcut("ctrl + shift + p"), false),
    ).toBe(false);
  });

  it("never ignores tab or escape shortcuts inside inputs", () => {
    expect(getIgnoreWhenInInputField(parseShortcut("tab"), true)).toBe(false);
    expect(getIgnoreWhenInInputField(parseShortcut("shift + tab"), false)).toBe(
      false,
    );
    expect(getIgnoreWhenInInputField(parseShortcut("escape"), true)).toBe(
      false,
    );
  });
});
