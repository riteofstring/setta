/* @vitest-environment jsdom */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import {
  getTextValueExtensions,
  TEXT_VALUE_BASIC_SETUP,
} from "./textValueExtensions";

function createState(
  options: Partial<Parameters<typeof getTextValueExtensions>[0]> = {},
) {
  return EditorState.create({
    doc: "alpha",
    extensions: getTextValueExtensions({
      language: null,
      singleLine: false,
      wrapLines: undefined,
      onEscape: () => {},
      tooltipParent: null,
      ...options,
    }),
  });
}

describe("getTextValueExtensions", () => {
  it("disables the wrapper's implicit autocomplete extension", () => {
    expect(TEXT_VALUE_BASIC_SETUP.autocompletion).toBe(false);
  });

  it("wraps by default and drops wrapping for single-line editors", () => {
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: false,
        wrapLines: undefined,
        onEscape: () => {},
        tooltipParent: null,
      }),
    ).toHaveLength(2);
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: true,
        wrapLines: undefined,
        onEscape: () => {},
        tooltipParent: null,
      }),
    ).toHaveLength(2);
    expect(
      getTextValueExtensions({
        language: "python",
        singleLine: false,
        wrapLines: undefined,
        onEscape: () => {},
        tooltipParent: null,
      }),
    ).toHaveLength(3);
  });

  it("keeps an explicit wrapLines override independent of single-line mode", () => {
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: true,
        wrapLines: true,
        onEscape: () => {},
        tooltipParent: null,
      }),
    ).toHaveLength(3);
  });

  it("configures a published canvas tooltip parent and nothing when there is none", () => {
    const parent = document.createElement("div");
    const withParent = getTextValueExtensions({
      language: null,
      singleLine: true,
      wrapLines: undefined,
      onEscape: () => {},
      tooltipParent: parent,
    });
    expect(withParent).toHaveLength(3);
    expect(
      getTextValueExtensions({
        language: null,
        singleLine: true,
        wrapLines: undefined,
        onEscape: () => {},
        tooltipParent: null,
      }),
    ).toHaveLength(2);
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

  it("reads current disabled state from an already-installed Enter listener", () => {
    const onCommit = vi.fn();
    const disabled = { current: false };
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: createState({
        singleLine: true,
        onCommit,
        isDisabled: () => disabled.current,
      }),
      parent,
    });

    try {
      disabled.current = true;
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
        }),
      );

      expect(onCommit).not.toHaveBeenCalled();
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});
