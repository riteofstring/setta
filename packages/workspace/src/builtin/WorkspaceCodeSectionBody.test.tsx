/* @vitest-environment jsdom */

import { indentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  getWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
} from "../document/documentChangeCallback";
import { getSectionOrThrow } from "../document/documentSelectors";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import { useResizeEvent } from "../section/resize/resizeEvents";
import { setWorkspaceCodeSectionData } from "./codeSectionActions";
import {
  createWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceCodeSectionData,
} from "./codeSectionData";
import { createWorkspaceCodeSection } from "./codeSectionKind";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const resizeCallbacksByTarget = new Map<Element, Set<ResizeObserverCallback>>();

class CapturingResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.targets.add(target);
    const callbacks =
      resizeCallbacksByTarget.get(target) ?? new Set<ResizeObserverCallback>();
    callbacks.add(this.callback);
    resizeCallbacksByTarget.set(target, callbacks);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
    resizeCallbacksByTarget.get(target)?.delete(this.callback);
  }

  disconnect() {
    for (const target of this.targets) {
      resizeCallbacksByTarget.get(target)?.delete(this.callback);
    }
    this.targets.clear();
  }
}

globalThis.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

// Freezes the built-in Code Editor section against the reference's `CoreCodeArea`: the editor
// paints the section's authored language, gutters, wrapping, and indentation; every keystroke
// commits through one document mutation; locking or the read-only option makes it read-only; and
// its focusable wrapper is the keyboard's way in and out of an editor that owns Tab. The
// controlled seam has to keep the same editor and the same selection across unrelated workspace
// changes, which is what preserves cursor, undo history, scroll, and focus.

const SECTION_ID = "code";
const definition = createWorkspaceCodeSection();

function makeCodeSection(
  data: Partial<WorkspaceCodeSectionData> = {},
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id: SECTION_ID,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "train.py",
    data: createWorkspaceCodeSectionData({
      code: "alpha = 1\nbeta = 2\n",
      ...data,
    }),
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function makeDocument(section: WorkspaceSectionInput): WorkspaceDocumentInput {
  return {
    sections: {
      [SECTION_ID]: section,
      neighbour: {
        id: "neighbour",
        kind: "leaf",
        name: "neighbour",
        data: { body: "unrelated" },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: {
      [SECTION_ID]: { x: 0, y: 0, w: 500, h: null, zIndex: 0 },
      neighbour: { x: 600, y: 0, w: 200, h: 120, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

// Mirrors the package's own section body slot: the live section drives the registered renderer.
function CodeSectionHarness() {
  const section = useWorkspaceDocument((state) => state.sections[SECTION_ID]);
  if (!section) {
    return null;
  }
  return definition.renderContent(section) as ReactNode;
}

describe("built-in code section body", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resizeCallbacksByTarget.clear();
    registerSectionKinds({
      leaf: { renderContent: () => null },
      [WORKSPACE_CODE_SECTION_KIND]: definition,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useWorkspaceAppearance.getState().reset();
    useResizeEvent.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(section: WorkspaceSectionInput = makeCodeSection()) {
    loadWorkspaceDocument(makeDocument(section));
    await act(async () => {
      root.render(createElement(CodeSectionHarness));
    });
  }

  function getView(): EditorView {
    const editorDom = host.querySelector<HTMLElement>(".cm-editor");
    const view = editorDom ? EditorView.findFromDOM(editorDom) : null;
    if (!view) {
      throw new Error("The code section editor is not mounted.");
    }
    return view;
  }

  function getWrapper(): HTMLElement {
    const wrapper = host.querySelector<HTMLElement>("article");
    if (!wrapper) {
      throw new Error("The code section wrapper is not mounted.");
    }
    return wrapper;
  }

  function getSectionData(): WorkspaceCodeSectionData {
    const data = getWorkspaceDocument().sections[SECTION_ID]?.data;
    return data as WorkspaceCodeSectionData;
  }

  async function reportResize(target: Element) {
    const callbacks = [...(resizeCallbacksByTarget.get(target) ?? [])];
    if (callbacks.length === 0) {
      throw new Error("The code section did not observe its editor scroller.");
    }
    await act(async () => {
      for (const callback of callbacks) {
        callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it("mounts the authored code behind the reference's interaction boundary", async () => {
    await mount();
    expect(getView().state.doc.toString()).toBe("alpha = 1\nbeta = 2\n");
    const wrapper = getWrapper();
    expect(wrapper.getAttribute("aria-label")).toBe("train.py code editor");
    expect(wrapper.tabIndex).toBe(0);
    for (const expectedClass of [
      "nopan",
      "nodrag",
      "setta-prevent-section-active-css",
    ]) {
      expect(wrapper.classList.contains(expectedClass)).toBe(true);
    }
    // The section is auto-height, so the editor owns its overflow, exactly as the reference does.
    expect(wrapper.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("paints the authored gutters, wrapping, and indentation", async () => {
    await mount(makeCodeSection({ wrapLines: true, indentWidth: 2 }));
    const view = getView();
    expect(view.dom.querySelector(".cm-gutters")).not.toBeNull();
    expect(view.dom.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    expect(view.state.tabSize).toBe(2);
    expect(view.state.facet(indentUnit)).toBe("  ");
  });

  it("drops the gutters when the section turns line numbers off", async () => {
    await mount(makeCodeSection({ lineNumbers: false, wrapLines: false }));
    const view = getView();
    expect(view.dom.querySelector(".cm-gutters")).toBeNull();
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  });

  it("fills a fixed-height body and owns horizontal trackpad overflow", async () => {
    await mount(
      makeCodeSection(
        {
          code: "const result = aVeryLongIdentifier + anotherVeryLongIdentifier;\n",
          wrapLines: false,
        },
        { size: { width: 500, height: 400 } },
      ),
    );
    const view = getView();
    expect(view.dom.parentElement?.classList.contains("h-full")).toBe(true);
    expect(getComputedStyle(view.dom).height).toBe("100%");

    Object.defineProperties(view.scrollDOM, {
      clientHeight: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 700 },
    });
    await reportResize(view.scrollDOM);

    // `nowheel` hands both native axes to the CodeMirror scroller. ZoomPane's wheel regression
    // locks that a horizontal trackpad gesture on this target never becomes canvas panning.
    expect(getWrapper().classList.contains("nowheel")).toBe(true);

    Object.defineProperty(view.scrollDOM, "scrollWidth", {
      configurable: true,
      value: 300,
    });
    await reportResize(view.scrollDOM);
    expect(getWrapper().classList.contains("nowheel")).toBe(false);
  });

  it("commits each edit through one document mutation and one notification", async () => {
    const onDocumentChange = vi.fn();
    await mount();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await act(async () => {
      getView().dispatch({ changes: { from: 9, insert: "0" } });
    });
    expect(getSectionData().code).toBe("alpha = 10\nbeta = 2\n");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    // The commit never replaces the editor's own document, so the caret survives the round trip.
    expect(getView().state.doc.toString()).toBe("alpha = 10\nbeta = 2\n");
  });

  it("keeps the editor, its selection, and its document across an unrelated workspace change", async () => {
    await mount();
    const view = getView();
    await act(async () => {
      view.dispatch({ selection: { anchor: 3 } });
    });
    await act(async () => {
      const neighbour = getSectionOrThrow(
        useWorkspaceDocument.getState(),
        "neighbour",
      );
      useWorkspaceDocument.setState((state) => ({
        sections: {
          ...state.sections,
          neighbour: { ...neighbour, name: "renamed" },
        },
      }));
    });
    expect(getView()).toBe(view);
    expect(view.state.selection.main.anchor).toBe(3);
    expect(view.state.doc.toString()).toBe("alpha = 1\nbeta = 2\n");
  });

  it("makes a read-only section read-only without taking away its selection", async () => {
    await mount(makeCodeSection({ readOnly: true }));
    const view = getView();
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  });

  it("makes a locked section read-only", async () => {
    await mount(makeCodeSection({}, { positionAndSizeLocked: true }));
    expect(getView().state.readOnly).toBe(true);
  });

  it("refuses a commit while the section is read-only", async () => {
    await mount(makeCodeSection({ readOnly: true }));
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await act(async () => {
      // A read-only state stops user commands; a direct dispatch still has to leave the document
      // alone, which is the reference's own guard.
      getView().dispatch({ changes: { from: 0, insert: "#" } });
    });
    expect(getSectionData().code).toBe("alpha = 1\nbeta = 2\n");
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("moves the keyboard into the editor on Enter and back out on Escape", async () => {
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount();
    const wrapper = getWrapper();
    await act(async () => {
      wrapper.focus();
      wrapper.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    const view = getView();
    expect(document.activeElement).toBe(view.contentDOM);
    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.activeElement).toBe(wrapper);
    // The workspace's own Escape chord must not also run and clear the selection behind it.
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("repaints when a host writes the typed section data", async () => {
    await mount();
    await act(async () => {
      setWorkspaceCodeSectionData(SECTION_ID, {
        ...getSectionData(),
        language: "bash",
        code: "ls -la\n",
      });
    });
    const view = getView();
    expect(view.state.doc.toString()).toBe("ls -la\n");
    expect(getSectionData().language).toBe("bash");
  });
});
