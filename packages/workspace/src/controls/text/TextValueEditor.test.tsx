/* @vitest-environment jsdom */

import { EditorView } from "@codemirror/view";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../../canvas/store";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import {
  useActiveSections,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../../document/stores";
import { useSectionRefs } from "../../section/sectionRefs";
import { TextValueEditor, type TextValueEditorProps } from "./TextValueEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the two-layer text value editor against the reference's `TextInputCodeMirror`
// behavior: the highlighted idle dummy (and its placeholder form), the primary-mouse-down
// activation that swaps in the live CodeMirror editor and activates the section through the
// input-focus intent, per-document-change reporting through the controlled seam, Escape
// returning focus to the section container, and the interaction-first disabled contract for
// the host flag and item-select mode.

const SECTION_ID = "panel";
const ITEM_ID = "item-alpha";
const DUMMY_ID = `${SECTION_ID}-${ITEM_ID}-ItemValueInput`;

describe("TextValueEditor", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useItemSelectionMode.getState().reset();
    useWorkspaceAppearance.getState().reset();
    useSectionRefs.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(props: Partial<TextValueEditorProps> = {}) {
    await act(async () => {
      root.render(
        createElement(TextValueEditor, {
          ariaLabel: "Threshold value",
          sectionId: SECTION_ID,
          itemId: ITEM_ID,
          value: "0.001",
          language: "python",
          onValueChange: () => {},
          ...props,
        }),
      );
    });
  }

  function getDummy(): HTMLElement {
    const dummy = document.getElementById(DUMMY_ID);
    if (!dummy) {
      throw new Error("The idle dummy layer is not rendered.");
    }
    return dummy;
  }

  async function activate() {
    await act(async () => {
      getDummy().dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
      );
    });
  }

  function getLiveView(): EditorView {
    const editorDom = host.querySelector<HTMLElement>(".cm-editor");
    const view = editorDom ? EditorView.findFromDOM(editorDom) : null;
    if (!view) {
      throw new Error("The live editor is not mounted.");
    }
    return view;
  }

  it("renders the highlighted idle dummy with the reference value treatment", async () => {
    await mount();
    const dummy = getDummy();
    expect(dummy.textContent).toBe("0.001");
    expect(dummy.getAttribute("role")).toBe("textbox");
    expect(dummy.getAttribute("aria-label")).toBe("Threshold value");
    for (const expectedClass of [
      "nopan",
      "nodrag",
      "section-value",
      "self-end",
      "peer/textinput",
      "cursor-text",
      "font-mono",
      "text-xs",
      "py-[.125rem]",
    ]) {
      expect(dummy.classList.contains(expectedClass)).toBe(true);
    }
    // The Lezer highlight marks the python number token with a theme class inside a cm-line.
    const line = dummy.querySelector(".cm-line");
    expect(line).not.toBeNull();
    expect(line?.querySelector("span")?.className).toMatch(/ͼ/);
    // The value-column divider carries the reference focus treatment while item-select mode
    // is inactive.
    const divider = host.querySelector("span.section-value");
    expect(divider?.classList.contains("peer-focus-within/textinput:border-blue-400")).toBe(true);
  });

  it("renders the placeholder form when the value is empty", async () => {
    await mount({ value: "", placeholder: "default_value" });
    const dummy = getDummy();
    expect(dummy.tagName).toBe("SPAN");
    expect(dummy.textContent).toBe("default_value");
    expect(dummy.classList.contains("text-gray-600")).toBe(true);
  });

  it("swaps to the live editor on primary mouse down and activates the section", async () => {
    await mount();
    await activate();
    expect(document.getElementById(`CodeMirror-${SECTION_ID}-${ITEM_ID}`)).not.toBeNull();
    expect(getLiveView().state.doc.toString()).toBe("0.001");
    expect(getLiveView().contentDOM.getAttribute("aria-label")).toBe("Threshold value");
    // The dummy layer leaves once the live editor initializes.
    expect(document.getElementById(DUMMY_ID)).toBeNull();
    // The input-focus intent made the owning section the single active section.
    expect(useActiveSections.getState().activeIds).toEqual([SECTION_ID]);
  });

  it("reports each document change once through the controlled value seam", async () => {
    const onValueChange = vi.fn();
    await mount({ onValueChange });
    await activate();
    await act(async () => {
      getLiveView().dispatch({ changes: { from: 5, insert: "23" } });
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("0.00123");
  });

  it("reuses the editor as the wrapped multiline text-area presentation", async () => {
    const onValueChange = vi.fn();
    await mount({
      value: "first line\nsecond line",
      language: null,
      singleLine: false,
      wrapLines: true,
      onValueChange,
    });
    expect(getDummy().querySelectorAll(":scope > .cm-line")).toHaveLength(2);
    expect(getDummy().style.whiteSpace).toBe("break-spaces");
    await activate();
    expect(getLiveView().state.doc.lines).toBe(2);
    await act(async () => {
      getLiveView().dispatch({ changes: { from: 10, insert: "\nthird line" } });
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("first line\nthird line\nsecond line");
  });

  it("returns focus to the section container on Escape and restores the dummy", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    await mount();
    await activate();
    const view = getLiveView();
    await act(async () => {
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.activeElement).toBe(sectionRoot);
    // The blur handler resets both layers on the next tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(document.getElementById(DUMMY_ID)).not.toBeNull();
    expect(host.querySelector(".cm-editor")).toBeNull();
    sectionRoot.remove();
  });

  it("ignores activation while the host disabled flag is set", async () => {
    await mount({ disabled: true });
    const dummy = getDummy();
    expect(dummy.classList.contains("cursor-text")).toBe(false);
    expect(dummy.getAttribute("aria-disabled")).toBe("true");
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(useActiveSections.getState().activeIds).toEqual([]);
  });

  it("disables package-wide and drops the divider focus treatment during item-select mode", async () => {
    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount();
    const divider = host.querySelector("span.section-value");
    expect(divider?.classList.contains("peer-focus-within/textinput:border-blue-400")).toBe(false);
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });
});
