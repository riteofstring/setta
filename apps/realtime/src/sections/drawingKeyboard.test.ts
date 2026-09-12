import { describe, expect, it } from "vitest";

import {
  resolveDrawingKeyboardAction,
  type DrawingKeyboardAvailability,
  type DrawingKeyboardContext,
  type DrawingKeyboardEvent,
} from "./drawingKeyboard";

const AVAILABLE: DrawingKeyboardAvailability = {
  activeTool: "draw",
  canClearSelection: true,
  canCopySelection: true,
  canDeleteSelection: true,
  canDuplicateSelection: true,
  canGroupSelection: true,
  canNudgeSelection: true,
  canPaste: true,
  canRedo: true,
  canSelectAll: true,
  canSetTool: true,
  canUndo: true,
  canUngroupSelection: true,
};

function keyboardEvent(
  key: string,
  overrides: Partial<DrawingKeyboardEvent> = {},
): DrawingKeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    target: document.body,
    ...overrides,
  };
}

function context(
  availability: DrawingKeyboardAvailability = AVAILABLE,
  overrides: Partial<DrawingKeyboardContext> = {},
): DrawingKeyboardContext {
  return {
    availability,
    fabricTextEditing: false,
    macOS: false,
    ...overrides,
  };
}

describe("drawing keyboard policy", () => {
  it("resolves platform undo and redo chords", () => {
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { ctrlKey: true }),
        context(),
      ),
    ).toEqual({ type: "undo" });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { ctrlKey: true, shiftKey: true }),
        context(),
      ),
    ).toEqual({ type: "redo" });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("y", { ctrlKey: true }),
        context(),
      ),
    ).toEqual({ type: "redo" });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("Z", { metaKey: true }),
        context(AVAILABLE, { macOS: true }),
      ),
    ).toEqual({ type: "undo" });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { metaKey: true, shiftKey: true }),
        context(AVAILABLE, { macOS: true }),
      ),
    ).toEqual({ type: "redo" });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("y", { ctrlKey: true }),
        context(AVAILABLE, { macOS: true }),
      ),
    ).toEqual({ type: "redo" });
  });

  it("resolves drawing clipboard, selection, and grouping chords", () => {
    const chords = [
      ["c", { type: "copy-selection" }],
      ["v", { type: "paste" }],
      ["d", { type: "duplicate-selection" }],
      ["a", { type: "select-all" }],
      ["g", { type: "group-selection" }],
    ] as const;
    for (const [key, action] of chords) {
      expect(
        resolveDrawingKeyboardAction(
          keyboardEvent(key, { ctrlKey: true }),
          context(),
        ),
      ).toEqual(action);
      expect(
        resolveDrawingKeyboardAction(
          keyboardEvent(key, { metaKey: true }),
          context(AVAILABLE, { macOS: true }),
        ),
      ).toEqual(action);
    }
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("g", { ctrlKey: true, shiftKey: true }),
        context(),
      ),
    ).toEqual({ type: "ungroup-selection" });
  });

  it("resolves deletion, selection clearing, and logical-pixel nudges", () => {
    for (const key of ["Backspace", "Delete"]) {
      expect(
        resolveDrawingKeyboardAction(keyboardEvent(key), context()),
      ).toEqual({ type: "delete-selection" });
    }
    expect(
      resolveDrawingKeyboardAction(keyboardEvent("Escape"), context()),
    ).toEqual({ type: "clear-selection" });
    expect(
      resolveDrawingKeyboardAction(keyboardEvent("ArrowLeft"), context()),
    ).toEqual({ type: "nudge-selection", x: -1, y: 0 });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("ArrowRight", { shiftKey: true }),
        context(),
      ),
    ).toEqual({ type: "nudge-selection", x: 10, y: 0 });
    expect(
      resolveDrawingKeyboardAction(keyboardEvent("ArrowUp"), context()),
    ).toEqual({ type: "nudge-selection", x: 0, y: -1 });
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("ArrowDown", { shiftKey: true }),
        context(),
      ),
    ).toEqual({ type: "nudge-selection", x: 0, y: 10 });
  });

  it("selects tools only for bare keys and an actual tool change", () => {
    const tools = [
      ["v", "select"],
      ["p", "draw"],
      ["h", "highlighter"],
      ["e", "erase"],
    ] as const;
    for (const [key, tool] of tools) {
      expect(
        resolveDrawingKeyboardAction(
          keyboardEvent(key),
          context({ ...AVAILABLE, activeTool: "highlighter" }),
        ),
      ).toEqual(tool === "highlighter" ? null : { tool, type: "set-tool" });
    }
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("V", { shiftKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("v"),
        context({ ...AVAILABLE, canSetTool: false }),
      ),
    ).toBeNull();
  });

  it("yields every chord while Fabric text or editable DOM owns input", () => {
    const textEditingChord = keyboardEvent("Backspace");
    expect(
      resolveDrawingKeyboardAction(
        textEditingChord,
        context(AVAILABLE, { fabricTextEditing: true }),
      ),
    ).toBeNull();

    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editor = document.createElement("div");
    const editorChild = document.createElement("span");
    editor.setAttribute("contenteditable", "true");
    editor.append(editorChild);
    for (const target of [input, textarea, select, editor, editorChild]) {
      expect(
        resolveDrawingKeyboardAction(
          keyboardEvent("z", { ctrlKey: true, target }),
          context(),
        ),
      ).toBeNull();
    }
  });

  it("rejects foreign modifiers and unavailable drawing actions", () => {
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { altKey: true, ctrlKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { ctrlKey: true, metaKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("z", { metaKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("ArrowLeft", { ctrlKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("ArrowRight", { altKey: true }),
        context(),
      ),
    ).toBeNull();
    expect(
      resolveDrawingKeyboardAction(
        keyboardEvent("p", { altKey: true }),
        context(),
      ),
    ).toBeNull();

    const unavailable = [
      ["canUndo", keyboardEvent("z", { ctrlKey: true })],
      ["canRedo", keyboardEvent("z", { ctrlKey: true, shiftKey: true })],
      ["canCopySelection", keyboardEvent("c", { ctrlKey: true })],
      ["canPaste", keyboardEvent("v", { ctrlKey: true })],
      ["canDuplicateSelection", keyboardEvent("d", { ctrlKey: true })],
      ["canSelectAll", keyboardEvent("a", { ctrlKey: true })],
      ["canGroupSelection", keyboardEvent("g", { ctrlKey: true })],
      [
        "canUngroupSelection",
        keyboardEvent("g", { ctrlKey: true, shiftKey: true }),
      ],
      ["canDeleteSelection", keyboardEvent("Delete")],
      ["canClearSelection", keyboardEvent("Escape")],
      ["canNudgeSelection", keyboardEvent("ArrowDown")],
    ] as const;
    for (const [capability, event] of unavailable) {
      expect(
        resolveDrawingKeyboardAction(
          event,
          context({ ...AVAILABLE, [capability]: false }),
        ),
      ).toBeNull();
    }
  });
});
