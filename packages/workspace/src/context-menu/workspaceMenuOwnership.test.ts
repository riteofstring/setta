/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { NO_DRAG_CLASS_NAME } from "../interaction";
import {
  isWorkspaceMenuKeyboardEvent,
  shouldRetainNativeContextMenu,
} from "./workspaceMenuOwnership";

describe("workspace context-menu ownership", () => {
  it("recognizes both authorized keyboard invocation paths", () => {
    expect(isWorkspaceMenuKeyboardEvent({ key: "ContextMenu", shiftKey: false })).toBe(true);
    expect(isWorkspaceMenuKeyboardEvent({ key: "F10", shiftKey: true })).toBe(true);
    expect(isWorkspaceMenuKeyboardEvent({ key: "F10", shiftKey: false })).toBe(false);
  });

  it.each(["button", "input", "textarea", "[contenteditable='true']"])(
    "retains the native menu for %s descendants",
    (selector) => {
      const boundary = document.createElement("div");
      boundary.innerHTML =
        selector === "[contenteditable='true']"
          ? "<span contenteditable='true'></span>"
          : `<${selector}></${selector}>`;
      const target = boundary.firstElementChild;
      expect(shouldRetainNativeContextMenu(target, boundary)).toBe(true);
    },
  );

  it("retains native ownership for explicit no-drag editor surfaces", () => {
    const boundary = document.createElement("div");
    const editor = document.createElement("div");
    editor.classList.add(NO_DRAG_CLASS_NAME);
    boundary.appendChild(editor);
    expect(shouldRetainNativeContextMenu(editor, boundary)).toBe(true);
  });

  it("lets a non-interactive surface own the workspace menu", () => {
    const boundary = document.createElement("div");
    const surface = document.createElement("span");
    boundary.appendChild(surface);
    expect(shouldRetainNativeContextMenu(surface, boundary)).toBe(false);
  });
});
