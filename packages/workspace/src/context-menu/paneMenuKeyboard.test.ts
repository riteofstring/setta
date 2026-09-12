/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  getFilterEditingKey,
  getFilterInputState,
  getNextFilterInputState,
  isMenuNavigationKey,
  shouldDispatchFilterInputEvent,
  shouldEditableTargetHandleMenuKey,
} from "./paneMenuKeyboard";

function createInput(value: string, start: number, end = start) {
  const input = document.createElement("input");
  input.value = value;
  input.setSelectionRange(start, end);
  return input;
}

describe("pane menu keyboard filtering", () => {
  it("ports the frozen printable and deletion edit rules", () => {
    expect(getFilterEditingKey("a")).toBe("a");
    expect(getFilterEditingKey("Backspace")).toBe("Backspace");
    expect(getFilterEditingKey("Delete")).toBe("Delete");
    expect(getFilterEditingKey("ArrowDown")).toBeNull();
    expect(getFilterInputState(createInput("filter", 3), true)).toEqual({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(
      getNextFilterInputState(
        { value: "filter", selectionStart: 3, selectionEnd: 3 },
        "Backspace",
      ),
    ).toEqual({ nextValue: "fiter", nextSelection: 2, didChange: true });
    expect(
      getNextFilterInputState(
        { value: "filter", selectionStart: 1, selectionEnd: 4 },
        "Delete",
      ),
    ).toEqual({ nextValue: "fer", nextSelection: 1, didChange: true });
    expect(
      getNextFilterInputState(
        { value: "filter", selectionStart: 1, selectionEnd: 4 },
        "x",
      ),
    ).toEqual({ nextValue: "fxer", nextSelection: 2, didChange: true });
  });

  it("preserves the reset dispatch and expanded menu-navigation routing", () => {
    const noOp = getNextFilterInputState(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      "Backspace",
    );
    expect(shouldDispatchFilterInputEvent(false, noOp)).toBe(false);
    expect(shouldDispatchFilterInputEvent(true, noOp)).toBe(true);
    expect(shouldEditableTargetHandleMenuKey(true, false)).toBe(true);
    expect(shouldEditableTargetHandleMenuKey(true, true)).toBe(false);
    expect(
      ["ArrowDown", "ArrowUp", "Home", "End"].every(isMenuNavigationKey),
    ).toBe(true);
    expect(isMenuNavigationKey("Enter")).toBe(false);
  });
});
