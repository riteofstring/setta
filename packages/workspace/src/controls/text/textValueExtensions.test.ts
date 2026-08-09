import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { getTextValueExtensions } from "./textValueExtensions";

// Characterizes the reference's `getExtensions` behavior on the trimmed text-value path: the
// wrap default, the single-line transaction filter, and the extension counts the reference's
// own test freezes for wrap and language packs.

function createState(options: Partial<Parameters<typeof getTextValueExtensions>[0]> = {}) {
  return EditorState.create({
    doc: "alpha",
    extensions: getTextValueExtensions({
      language: null,
      singleLine: false,
      wrapLines: undefined,
      onEscape: () => {},
      ...options,
    }),
  });
}

describe("getTextValueExtensions", () => {
  it("wraps by default and drops wrapping for single-line editors", () => {
    // wrap + keymap; the reference asserts the same two-slot shape with wrapping off.
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: false,
        wrapLines: undefined,
        onEscape: () => {},
      }),
    ).toHaveLength(2);
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: true,
        wrapLines: undefined,
        onEscape: () => {},
      }),
    ).toHaveLength(2); // single-line filter + keymap, no wrapping
    expect(
      getTextValueExtensions({
        language: "python",
        singleLine: false,
        wrapLines: undefined,
        onEscape: () => {},
      }),
    ).toHaveLength(3); // wrap + language pack + keymap
  });

  it("keeps an explicit wrapLines override independent of single-line mode", () => {
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: true,
        wrapLines: true,
        onEscape: () => {},
      }),
    ).toHaveLength(3); // wrap + single-line filter + keymap
  });

  it("blocks transactions that would grow a single-line document beyond one line", () => {
    const state = createState({ singleLine: true });
    const blocked = state.update({ changes: { from: 5, insert: "\nbeta" } });
    expect(blocked.state.doc.toString()).toBe("alpha");
    const allowed = state.update({ changes: { from: 5, insert: " beta" } });
    expect(allowed.state.doc.toString()).toBe("alpha beta");
  });

  it("keeps multi-line edits when the editor is not single-line", () => {
    const state = createState();
    const applied = state.update({ changes: { from: 5, insert: "\nbeta" } });
    expect(applied.state.doc.toString()).toBe("alpha\nbeta");
  });
});
