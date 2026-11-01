/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  formatWorkspaceChord,
  getWorkspaceChordSignature,
  matchesWorkspaceChord,
  parseWorkspaceChord,
} from "./workspaceChords.js";

function heldKeysEqual(held: ReadonlyArray<string>) {
  return (codes: ReadonlyArray<string>) =>
    held.length === codes.length && codes.every((code) => held.includes(code));
}

describe("workspace chords", () => {
  it("parses modifiers and keys as event codes regardless of spelling", () => {
    expect(parseWorkspaceChord("Shift + Mod + G")).toEqual({
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
      keys: ["KeyG"],
    });
    expect(
      getWorkspaceChordSignature(parseWorkspaceChord("mod+shift+g"), false),
    ).toBe(
      getWorkspaceChordSignature(parseWorkspaceChord("Shift + Mod + G"), false),
    );
    expect(
      getWorkspaceChordSignature(parseWorkspaceChord("Mod + Comma"), false),
    ).toBe(getWorkspaceChordSignature(parseWorkspaceChord("Mod + ,"), false));
  });

  it("signs Mod and Ctrl as one chord only where they are one key", () => {
    const mod = parseWorkspaceChord("Mod + G");
    const ctrl = parseWorkspaceChord("Ctrl + G");
    expect(getWorkspaceChordSignature(mod, false)).toBe(
      getWorkspaceChordSignature(ctrl, false),
    );
    expect(getWorkspaceChordSignature(mod, true)).not.toBe(
      getWorkspaceChordSignature(ctrl, true),
    );
  });

  it("parses the named keys the reference's shortcuts use", () => {
    expect(parseWorkspaceChord("Alt + ArrowUp").keys).toEqual(["ArrowUp"]);
    expect(parseWorkspaceChord("Backspace").keys).toEqual(["Backspace"]);
    expect(parseWorkspaceChord("Ctrl + Shift + 1").keys).toEqual(["Digit1"]);
    expect(parseWorkspaceChord("F2").keys).toEqual(["F2"]);
    expect(parseWorkspaceChord("Q + F").keys).toEqual(["KeyF", "KeyQ"]);
  });

  it("rejects a chord that could never match instead of guessing a key code", () => {
    expect(() => parseWorkspaceChord("Mod + Meta")).toThrow(
      /unknown key meta/u,
    );
    expect(() => parseWorkspaceChord("Mod + ")).toThrow(/empty part/u);
    expect(() => parseWorkspaceChord("")).toThrow(/empty part/u);
    expect(() => parseWorkspaceChord("Mod")).not.toThrow();
  });

  it("matches the whole modifier state and the whole pressed-key set", () => {
    const chord = parseWorkspaceChord("Mod + G");
    const event = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
    });
    expect(
      matchesWorkspaceChord(event, chord, false, heldKeysEqual(["KeyG"])),
    ).toBe(true);
    expect(
      matchesWorkspaceChord(
        event,
        chord,
        false,
        heldKeysEqual(["KeyG", "KeyH"]),
      ),
    ).toBe(false);

    const shifted = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(
      matchesWorkspaceChord(shifted, chord, false, heldKeysEqual(["KeyG"])),
    ).toBe(false);
  });

  it("resolves Mod to Meta on macOS and to Control elsewhere", () => {
    const chord = parseWorkspaceChord("Mod + G");
    const meta = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      metaKey: true,
    });
    const control = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
    });
    expect(
      matchesWorkspaceChord(meta, chord, true, heldKeysEqual(["KeyG"])),
    ).toBe(true);
    expect(
      matchesWorkspaceChord(control, chord, true, heldKeysEqual(["KeyG"])),
    ).toBe(false);
    expect(
      matchesWorkspaceChord(control, chord, false, heldKeysEqual(["KeyG"])),
    ).toBe(true);

    expect(
      matchesWorkspaceChord(meta, chord, false, heldKeysEqual(["KeyG"])),
    ).toBe(false);
  });

  it("labels a chord with the platform's mod key", () => {
    const chord = parseWorkspaceChord("shift + mod + g");
    expect(formatWorkspaceChord(chord, true)).toBe("⌘ + Shift + G");
    expect(formatWorkspaceChord(chord, false)).toBe("Ctrl + Shift + G");
    expect(
      formatWorkspaceChord(parseWorkspaceChord("Alt + ArrowUp"), false),
    ).toBe("Alt + ArrowUp");
    expect(formatWorkspaceChord(parseWorkspaceChord("Backspace"), true)).toBe(
      "Backspace",
    );
  });
});
