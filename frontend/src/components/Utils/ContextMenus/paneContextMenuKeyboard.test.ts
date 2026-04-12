// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  getFilterEditingKey,
  getFilterInputState,
  getNextFilterInputState,
  isMenuNavigationKey,
  shouldDispatchFilterInputEvent,
  shouldEditableTargetHandleMenuKey,
} from "./paneContextMenuKeyboard";

function createInput(value: string, start: number, end = start) {
  const input = document.createElement("input");
  input.value = value;
  input.setSelectionRange(start, end);
  return input;
}

describe("paneContextMenuKeyboard", () => {
  it("recognizes printable and delete keys as filter edits", () => {
    expect(getFilterEditingKey("a")).toBe("a");
    expect(getFilterEditingKey("Backspace")).toBe("Backspace");
    expect(getFilterEditingKey("Delete")).toBe("Delete");
    expect(getFilterEditingKey("ArrowDown")).toBeNull();
  });

  it("builds an empty selection state when resetting the filter input", () => {
    const input = createInput("filter", 3);

    expect(getFilterInputState(input, true)).toEqual({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });

  it("backspace deletes the previous character for a collapsed cursor", () => {
    const result = getNextFilterInputState(
      {
        value: "filter",
        selectionStart: 3,
        selectionEnd: 3,
      },
      "Backspace",
    );

    expect(result).toEqual({
      nextValue: "fiter",
      nextSelection: 2,
      didChange: true,
    });
  });

  it("delete removes the active selection", () => {
    const result = getNextFilterInputState(
      {
        value: "filter",
        selectionStart: 1,
        selectionEnd: 4,
      },
      "Delete",
    );

    expect(result).toEqual({
      nextValue: "fer",
      nextSelection: 1,
      didChange: true,
    });
  });

  it("replaces the current selection for printable keys", () => {
    const result = getNextFilterInputState(
      {
        value: "filter",
        selectionStart: 1,
        selectionEnd: 4,
      },
      "x",
    );

    expect(result).toEqual({
      nextValue: "fxer",
      nextSelection: 2,
      didChange: true,
    });
  });

  it("keeps the reset path dispatching even when delete keys become no-ops", () => {
    const result = getNextFilterInputState(
      {
        value: "",
        selectionStart: 0,
        selectionEnd: 0,
      },
      "Backspace",
    );

    expect(result).toEqual({
      nextValue: "",
      nextSelection: 0,
      didChange: false,
    });
    expect(shouldDispatchFilterInputEvent(false, result)).toBe(false);
    expect(shouldDispatchFilterInputEvent(true, result)).toBe(true);
  });

  it("tracks the menu-key routing rules for editable targets and arrow navigation", () => {
    expect(shouldEditableTargetHandleMenuKey(true, false)).toBe(true);
    expect(shouldEditableTargetHandleMenuKey(true, true)).toBe(false);
    expect(isMenuNavigationKey("ArrowDown")).toBe(true);
    expect(isMenuNavigationKey("ArrowUp")).toBe(true);
    expect(isMenuNavigationKey("Enter")).toBe(false);
  });
});
