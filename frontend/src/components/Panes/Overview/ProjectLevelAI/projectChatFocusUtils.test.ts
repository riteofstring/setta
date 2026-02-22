import { describe, expect, it, vi } from "vitest";
import {
  focusInputWithoutSelectionById,
  setInputSelectionToEnd,
} from "./projectChatFocusUtils";

describe("projectChatFocusUtils", () => {
  it("returns false when browser document is unavailable", () => {
    // The helper should no-op safely in non-browser test environments.
    expect(focusInputWithoutSelectionById("missing-input")).toBe(false);
  });

  it("moves selection to a caret at end of input text", () => {
    // The caret should move to the end so focus does not show selected text.
    const setSelectionRange = vi.fn();
    const input = {
      value: "Codex (app-server)",
      setSelectionRange,
    };

    const caretPosition = setInputSelectionToEnd(input);

    expect(caretPosition).toBe(input.value.length);
    expect(setSelectionRange).toHaveBeenCalledWith(
      input.value.length,
      input.value.length,
    );
  });
});
