import { describe, expect, it, vi } from "vitest";
import { focusInputWithoutSelectionById } from "./projectChatFocusUtils";

describe("projectChatFocusUtils", () => {
  it("returns false when browser document is unavailable", () => {
    // The helper should no-op safely in non-browser environments.
    expect(focusInputWithoutSelectionById("missing-input")).toBe(false);
  });

  it("focuses the input and moves the caret to the end of its text", () => {
    // The live helper should focus without selecting existing text.
    const inputId = "project-chat-engine-input";

    class FakeHTMLInputElement {
      id: string;
      value: string;
      selectionStart: number | null = null;
      selectionEnd: number | null = null;
      focus = vi.fn();
      setSelectionRange = vi.fn((start: number, end: number) => {
        this.selectionStart = start;
        this.selectionEnd = end;
      });

      constructor(id: string, value: string) {
        this.id = id;
        this.value = value;
      }
    }

    const input = new FakeHTMLInputElement(inputId, "Codex (app-server)");
    const getElementById = vi.fn(() => input);

    vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
    vi.stubGlobal("document", { getElementById });

    try {
      expect(focusInputWithoutSelectionById(inputId)).toBe(true);
      expect(getElementById).toHaveBeenCalledWith(inputId);
      expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(input.setSelectionRange).toHaveBeenCalledWith(
        input.value.length,
        input.value.length,
      );
      expect(input.selectionStart).toBe(input.value.length);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
