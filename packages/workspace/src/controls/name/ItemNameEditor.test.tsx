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
import { ItemNameEditor, type ItemNameEditorProps } from "./ItemNameEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the package name seam against the reference `ParamNameInput`: green highlighted idle
// layer, single-line live CodeMirror swap, proposed-name reporting, key-column geometry, exact
// duplicate-error treatment, Escape focus restoration, and interaction-first disabling.

const SECTION_ID = "panel";
const ITEM_ID = "item-rename";
const DUMMY_ID = `ItemNameInput-${SECTION_ID}-${ITEM_ID}`;
const LIVE_ID = `CodeMirror-${SECTION_ID}-${ITEM_ID}-keyName`;
const ERROR_ID = `ItemNameError-${SECTION_ID}-${ITEM_ID}`;
const DUPLICATE_ERROR = 'Param name "enabled" already exists under this parent.';

describe("ItemNameEditor", () => {
  let sectionSurface: HTMLElement;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sectionSurface = document.createElement("section");
    sectionSurface.id = `${SECTION_ID}-CustomResizable`;
    host = document.createElement("div");
    sectionSurface.appendChild(host);
    document.body.appendChild(sectionSurface);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    sectionSurface.remove();
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useItemSelectionMode.getState().reset();
    useWorkspaceAppearance.getState().reset();
    useSectionRefs.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(props: Partial<ItemNameEditorProps> = {}) {
    await act(async () => {
      root.render(
        createElement(ItemNameEditor, {
          sectionId: SECTION_ID,
          itemId: ITEM_ID,
          name: "rename_me",
          language: "python",
          onNameChange: () => {},
          ...props,
        }),
      );
    });
  }

  function getDummy(): HTMLElement {
    const dummy = document.getElementById(DUMMY_ID);
    if (!dummy) {
      throw new Error("The idle name layer is not rendered.");
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
      throw new Error("The live name editor is not mounted.");
    }
    return view;
  }

  it("renders the green highlighted idle name in the reference key-column treatment", async () => {
    await mount();
    const dummy = getDummy();
    expect(dummy.textContent).toBe("rename_me");
    expect(dummy.getAttribute("role")).toBe("textbox");
    expect(dummy.getAttribute("aria-label")).toBe("Item name");
    expect(dummy.getAttribute("aria-multiline")).toBe("false");
    for (const expectedClass of [
      "nopan",
      "nodrag",
      "single-cell-child",
      "peer/nameinput",
      "cursor-text",
      "select-text",
      "font-mono",
      "text-xs",
      "py-[.125rem]",
    ]) {
      expect(dummy.classList.contains(expectedClass)).toBe(true);
    }
    const stack = host.querySelector<HTMLElement>('[data-item-name-layer-stack="true"]');
    expect(stack?.classList.contains("section-key")).toBe(true);
    expect(stack?.classList.contains("single-cell-container")).toBe(true);
    expect(dummy.querySelector(".cm-line span")?.className).toMatch(/ͼ/);
    const underline = stack?.querySelector<HTMLElement>("span.single-cell-child");
    expect(underline?.classList.contains("peer-focus-within/nameinput:border-blue-400")).toBe(true);
    expect(underline?.classList.contains("border-red-400")).toBe(false);
  });

  it("uses the reference spanning placement for names with children", async () => {
    await mount({ hasChildren: true });
    const dummy = getDummy();
    const stack = host.querySelector<HTMLElement>('[data-item-name-layer-stack="true"]');
    expect(stack?.classList.contains("section-key-value")).toBe(true);
    expect(stack?.classList.contains("grid-row-start-1")).toBe(true);
    expect(dummy.classList.contains("px-[2px]")).toBe(true);
    const underline = stack?.querySelector<HTMLElement>("span.single-cell-child");
    expect(underline?.classList.contains("mx-[2px]")).toBe(true);

    await activate();
    expect(host.querySelector('[data-item-name-layer-stack="true"]')).toBe(stack);
    expect(document.getElementById(LIVE_ID)?.parentElement).toBe(stack);
  });

  it("reports one proposed name per document change and rejects line breaks", async () => {
    const onNameChange = vi.fn();
    await mount({ onNameChange });
    await activate();
    const view = getLiveView();
    const liveWrapper = document.getElementById(LIVE_ID);
    expect(liveWrapper).not.toBeNull();
    expect(liveWrapper?.hasAttribute("tabindex")).toBe(false);
    expect(view.contentDOM.tabIndex).toBe(-1);
    expect(useActiveSections.getState().activeIds).toEqual([SECTION_ID]);
    await act(async () => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "renamed" } });
    });
    expect(onNameChange).toHaveBeenCalledTimes(1);
    expect(onNameChange).toHaveBeenLastCalledWith("renamed");
    await act(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\nsecond-line" } });
    });
    expect(view.state.doc.lines).toBe(1);
    expect(onNameChange).toHaveBeenCalledTimes(1);
  });

  it("renders and announces the captured duplicate-name error treatment", async () => {
    await mount({ name: "enabled" });
    const status = host.querySelector<HTMLElement>('[role="status"]');
    if (!status) {
      throw new Error("The persistent name-error status did not render.");
    }
    expect(status.textContent).toBe("");

    await mount({ name: "enabled", errorMessage: DUPLICATE_ERROR });
    expect(host.querySelector('[role="status"]')).toBe(status);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe(DUPLICATE_ERROR);
    const dummy = getDummy();
    expect(dummy.getAttribute("aria-invalid")).toBe("true");
    expect(dummy.getAttribute("aria-describedby")).toBe(ERROR_ID);
    for (const errorClass of ["text-red-500", "dark:text-red-300", "border-red-400"]) {
      expect(dummy.classList.contains(errorClass)).toBe(true);
    }
    const underline = host.querySelector<HTMLElement>(
      '[data-item-name-layer-stack="true"] > span.single-cell-child',
    );
    expect(underline?.classList.contains("border-red-400")).toBe(true);
    const bubble = document.getElementById(ERROR_ID);
    if (!bubble) {
      throw new Error("The duplicate-name error bubble did not render.");
    }
    expect(bubble.parentElement).toBe(sectionSurface);
    expect(bubble.hasAttribute("role")).toBe(false);
    expect(bubble.textContent).toBe(DUPLICATE_ERROR);
    expect(bubble.classList.contains("setta-workspace")).toBe(true);
    for (const bubbleClass of [
      "rounded-md",
      "border-red-300",
      "bg-red-50",
      "text-[10px]",
      "font-medium",
      "dark:border-red-900",
      "dark:bg-[#120000]",
      "dark:text-red-200",
    ]) {
      expect(bubble.classList.contains(bubbleClass)).toBe(true);
    }
    expect(bubble.style.opacity).toBe("1");

    await activate();
    const content = getLiveView().contentDOM;
    expect(content.getAttribute("aria-invalid")).toBe("true");
    expect(content.getAttribute("aria-describedby")).toBe(ERROR_ID);
  });

  it("applies a host error while the live editor is already active", async () => {
    await mount();
    await activate();
    expect(getLiveView().contentDOM.getAttribute("aria-invalid")).toBeNull();

    await mount({ name: "enabled", errorMessage: DUPLICATE_ERROR });
    const liveView = getLiveView();
    expect(liveView.state.doc.toString()).toBe("enabled");
    expect(liveView.contentDOM.getAttribute("aria-invalid")).toBe("true");
    expect(liveView.contentDOM.getAttribute("aria-describedby")).toBe(ERROR_ID);
    expect(document.getElementById(ERROR_ID)?.textContent).toBe(DUPLICATE_ERROR);
    expect(document.getElementById(LIVE_ID)?.classList.contains("text-red-500")).toBe(true);
  });

  it("returns focus to the section and notifies the host on blur after Escape", async () => {
    const focusTarget = document.createElement("div");
    focusTarget.tabIndex = -1;
    document.body.appendChild(focusTarget);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: focusTarget } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    const onBlur = vi.fn();
    await mount({ onBlur });
    await activate();
    await act(async () => {
      getLiveView().contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(focusTarget);
    expect(documentEscape).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(document.getElementById(DUMMY_ID)).not.toBeNull();
    expect(host.querySelector(".cm-editor")).toBeNull();
    document.removeEventListener("keydown", documentEscape);
    focusTarget.remove();
  });

  it("keeps disabled names inert for both the host flag and item-select mode", async () => {
    await mount({ disabled: true });
    expect(getDummy().getAttribute("aria-disabled")).toBe("true");
    expect(getDummy().tabIndex).toBe(-1);
    expect(getDummy().classList.contains("cursor-text")).toBe(false);
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();

    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount({ disabled: false });
    expect(getDummy().getAttribute("aria-disabled")).toBe("true");
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });
});
