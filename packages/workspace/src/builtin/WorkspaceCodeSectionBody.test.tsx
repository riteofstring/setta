/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { indentUnit } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { getWorkspaceDocument } from "../document/documentChangeCallback";
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
  type WorkspaceCodeSectionDataOverrides,
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
// commits through one document mutation; locking or a non-editable mode stops it being an editing
// surface at all; and its focusable wrapper is the keyboard's way in and out of an editor that
// owns Tab. The controlled seam has to keep the same editor and the same selection across
// unrelated workspace changes, which is what preserves cursor, undo history, scroll, and focus.

const SECTION_ID = "code";
const definition = createWorkspaceCodeSection();

// The generated block, read the way a consumer or a capture reads it: the package's documented
// per-line hook, in rendered order.
function getGeneratedLineMarks(view: EditorView): Array<string | null> {
  return [...view.dom.querySelectorAll(".cm-line")].map((line) =>
    line.getAttribute("data-workspace-generated-line"),
  );
}

// A generated document the way a host composes one: authored text, the generated body between two
// blank separators, and authored text again. The declared region runs from the end of the first to
// the start of the last, so the separators are the block's boundary lines and the text outside it
// keeps ordinary read-only paint.
const GENERATED_PREFIX = "import math";
const GENERATED_SUFFIX = "state = value";
const GENERATED_CODE = `${GENERATED_PREFIX}\n\nvalue = math.sqrt(3)\n\n${GENERATED_SUFFIX}`;
const GENERATED_REGION = {
  from: GENERATED_PREFIX.length,
  to: GENERATED_CODE.length - GENERATED_SUFFIX.length,
};

// The body a host writes over the one above when it regenerates: a different length, so the range
// it declares with it has to move too, and a range left over from the previous document would
// describe the wrong bytes rather than the same ones.
const REGENERATED_BODY = "\n\nvalue = math.floor(9.5)\n\n";
const REGENERATED_CODE = `${GENERATED_PREFIX}${REGENERATED_BODY}${GENERATED_SUFFIX}`;
const REGENERATED_REGION = {
  from: GENERATED_PREFIX.length,
  to: GENERATED_PREFIX.length + REGENERATED_BODY.length,
};

function makeGeneratedSection(
  code = GENERATED_CODE,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return makeCodeSection(
    {
      code,
      generatedRegion: {
        from: GENERATED_PREFIX.length,
        to: code.length - GENERATED_SUFFIX.length,
      },
      mode: "generated-document",
    },
    overrides,
  );
}

// The editor's own history keymap, driven the way a person reaches it. Undo and redo are the two
// user transactions that can move the protected range without anybody typing a character.
function pressHistory(view: EditorView, command: "undo" | "redo") {
  const isUndo = command === "undo";
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: isUndo ? "z" : "y",
      keyCode: isUndo ? 90 : 89,
    }),
  );
}

function makeCodeSection(
  data: WorkspaceCodeSectionDataOverrides = {},
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
    registerSectionKinds(testWorkspace.host, {
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
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.appearance.getState().reset();
    testWorkspace.resizeEvent.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  async function mount(section: WorkspaceSectionInput = makeCodeSection()) {
    loadWorkspaceDocument(testWorkspace.host, makeDocument(section));
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(CodeSectionHarness)}
        </WorkspaceTestProvider>,
      );
    });
  }

  // A case that compares two documents mounts the second one over a reset store, exactly as the
  // suite's own teardown does.
  async function remount(section: WorkspaceSectionInput) {
    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    testWorkspace.document.getState().reset();
    await mount(section);
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
    const data = getWorkspaceDocument(testWorkspace.host).sections[SECTION_ID]
      ?.data;
    return data as WorkspaceCodeSectionData;
  }

  // How a host's canonical regeneration reaches the editor: it writes the section's own data, so
  // the controlled value the body renders with stops matching the doc the editor holds and
  // `@uiw/react-codemirror` replaces the whole document with it.
  async function regenerate(prefix: string, body: string) {
    const code = `${prefix}${body}${GENERATED_SUFFIX}`;
    await act(async () => {
      setWorkspaceCodeSectionData(testWorkspace.host, SECTION_ID, {
        ...getSectionData(),
        code,
        generatedRegion: {
          from: prefix.length,
          to: prefix.length + body.length,
        },
        mode: "generated-document",
      });
    });
    return code;
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
    testWorkspace.host.subscribe(onDocumentChange);
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
        testWorkspace.document.getState(),
        "neighbour",
      );
      testWorkspace.document.setState((state) => ({
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

  it("makes a read-only section non-editable and says so by name", async () => {
    await mount(makeCodeSection({ mode: "read-only" }));
    const view = getView();
    expect(view.state.readOnly).toBe(true);
    // A read-only state alone leaves a focusable editing surface that merely refuses
    // transactions; the view itself has to stop being one.
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
    const wrapper = getWrapper();
    expect(wrapper.getAttribute("aria-label")).toBe("train.py code, read-only");
    expect(wrapper.getAttribute("data-workspace-section-editor")).toBe(
      "read-only",
    );
    // Nothing about it is a generated document.
    expect(
      wrapper.classList.contains("setta-workspace-generated-document"),
    ).toBe(false);
    expect(getGeneratedLineMarks(view)).toStrictEqual([null, null, null]);
  });

  it("keeps the text around a generated block authorable", async () => {
    await mount(makeGeneratedSection());
    const view = getView();
    // The reference's generated Python area is an ordinary editing surface whose generated range
    // refuses edits, so only the range is read-only.
    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
    const wrapper = getWrapper();
    expect(wrapper.getAttribute("data-workspace-section-editor")).toBe(
      "generated-document",
    );
    expect(
      wrapper.classList.contains("setta-workspace-generated-document"),
    ).toBe(true);
    expect(wrapper.getAttribute("aria-label")).toBe(
      "train.py code editor, generated output read-only",
    );
    // Its text is still there to select and copy.
    expect(view.dom.textContent).toContain(GENERATED_PREFIX);
    // The keyboard reaches the authored Python the same way it reaches any other code section.
    expect(wrapper.getAttribute("aria-keyshortcuts")).toBe("Enter Escape");
    await act(async () => {
      wrapper.focus();
      wrapper.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it("accepts an outer edit and moves the protected range with it", async () => {
    const onDocumentChange = vi.fn();
    await mount(makeGeneratedSection());
    const view = getView();
    testWorkspace.host.subscribe(onDocumentChange);

    // An insertion at the range's own start belongs to the prefix, so the block starts after it.
    await act(async () => {
      view.dispatch({
        changes: { from: GENERATED_REGION.from, insert: "\nimport os" },
        userEvent: "input.type",
      });
    });
    const shifted = "\nimport os".length;
    expect(getSectionData()).toMatchObject({
      code: `${GENERATED_PREFIX}\nimport os\n\nvalue = math.sqrt(3)\n\n${GENERATED_SUFFIX}`,
      generatedRegion: {
        from: GENERATED_REGION.from + shifted,
        to: GENERATED_REGION.to + shifted,
      },
    });
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    // The commit never replaces the editor's own document, so the caret survives the round trip.
    expect(getView()).toBe(view);

    // An insertion at the range's end belongs to the suffix, so the block ends before it.
    await act(async () => {
      view.dispatch({
        changes: {
          from: GENERATED_REGION.to + shifted,
          insert: "print(state)\n",
        },
        userEvent: "input.type",
      });
    });
    expect(getSectionData()).toMatchObject({
      generatedRegion: {
        from: GENERATED_REGION.from + shifted,
        to: GENERATED_REGION.to + shifted,
      },
    });
    // The block still covers exactly the generated body and its two separator boundaries.
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      null,
      "start",
      "middle",
      "end",
      null,
      null,
    ]);
  });

  it("refuses every user transaction that touches the protected range", async () => {
    // Insertion, deletion, replacement, paste, and cut, at positions inside the range and across
    // each of its boundaries. Each one is refused as a whole rather than partly applied.
    const refusals = [
      { changes: { from: 20, insert: "0" }, userEvent: "input.type" },
      { changes: { from: 30, to: 40 }, userEvent: "delete.forward" },
      { changes: { from: 5, to: 15, insert: "#" }, userEvent: "input.type" },
      {
        changes: {
          from: GENERATED_REGION.from,
          to: GENERATED_REGION.to,
          insert: "pasted",
        },
        userEvent: "input.paste",
      },
      { changes: { from: 13, to: 33 }, userEvent: "delete.cut" },
      { changes: { from: 34, to: 36, insert: "x" }, userEvent: "input.type" },
    ];
    for (const refusal of refusals) {
      await remount(makeGeneratedSection());
      const onDocumentChange = vi.fn();
      const view = getView();
      testWorkspace.host.subscribe(onDocumentChange);
      await act(async () => {
        view.dispatch(refusal);
      });
      expect(view.state.doc.toString()).toBe(GENERATED_CODE);
      expect(getSectionData()).toMatchObject({
        code: GENERATED_CODE,
        generatedRegion: GENERATED_REGION,
      });
      expect(onDocumentChange).not.toHaveBeenCalled();
    }
  });

  it("keeps the caret out of a block the keyboard steps over", async () => {
    await mount(makeGeneratedSection());
    const view = getView();
    // A pointer press inside the generated output leaves the caret at the nearer end of the
    // block, because there is nowhere inside it for the next character to go.
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_REGION.from + 4 } });
    });
    expect(view.state.selection.main.anchor).toBe(GENERATED_REGION.from);
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_REGION.to - 2 } });
    });
    expect(view.state.selection.main.anchor).toBe(GENERATED_REGION.to);
    // A selection that spans the block is left alone: the output stays selectable and copyable.
    await act(async () => {
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length },
      });
    });
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    // Cursor motion treats the block as one step, so the keyboard is never trapped between the
    // authored text on either side of it.
    expect(
      view.moveByChar(EditorSelection.cursor(GENERATED_REGION.from), true).head,
    ).toBe(GENERATED_REGION.to);
    expect(
      view.moveByChar(EditorSelection.cursor(GENERATED_REGION.to), false).head,
    ).toBe(GENERATED_REGION.from);
  });

  it("keeps the range aligned across undo and redo of an accepted edit", async () => {
    await mount(makeGeneratedSection());
    const view = getView();
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "# header\n" },
        userEvent: "input.type",
      });
    });
    const shifted = "# header\n".length;
    expect(getSectionData()).toMatchObject({
      generatedRegion: {
        from: GENERATED_REGION.from + shifted,
        to: GENERATED_REGION.to + shifted,
      },
    });

    await act(async () => {
      pressHistory(view, "undo");
    });
    expect(view.state.doc.toString()).toBe(GENERATED_CODE);
    expect(getSectionData()).toMatchObject({
      code: GENERATED_CODE,
      generatedRegion: GENERATED_REGION,
    });

    await act(async () => {
      pressHistory(view, "redo");
    });
    expect(getSectionData()).toMatchObject({
      generatedRegion: {
        from: GENERATED_REGION.from + shifted,
        to: GENERATED_REGION.to + shifted,
      },
    });
  });

  it("refuses to undo a host's regeneration of the protected body", async () => {
    await mount(makeGeneratedSection());
    const view = getView();
    // The host regenerates the body. The section's data is the only thing that changed, so the
    // editor is reconfigured around the new range and handed the new text rather than remounted.
    expect(await regenerate(GENERATED_PREFIX, REGENERATED_BODY)).toBe(
      REGENERATED_CODE,
    );
    expect(getView()).toBe(view);
    expect(view.state.doc.toString()).toBe(REGENERATED_CODE);

    // Nobody authored that replacement, so history has nothing to take back. Undo is the one user
    // transaction the protected range's filter never sees — history pops its events with
    // `filter: false` — so a recorded host replacement would put the superseded body straight back
    // over the protected bytes.
    await act(async () => {
      pressHistory(view, "undo");
    });
    expect(view.state.doc.toString()).toBe(REGENERATED_CODE);
    expect(getSectionData()).toMatchObject({
      code: REGENERATED_CODE,
      generatedRegion: REGENERATED_REGION,
    });
    // The range still describes the body the host declared, so the block still paints...
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "end",
      null,
    ]);
    // ...and still refuses the edits it exists to refuse.
    await act(async () => {
      view.dispatch({
        changes: { from: REGENERATED_REGION.from + 3, insert: "0" },
        userEvent: "input.type",
      });
    });
    expect(view.state.doc.toString()).toBe(REGENERATED_CODE);
  });

  it("keeps an authored edit from taking a host's regeneration back with it", async () => {
    await mount(makeGeneratedSection());
    const view = getView();
    // Text somebody authored in the prefix, and then a regeneration that carries that authored
    // line through. History joins changes made close together into one event, so a recorded host
    // replacement is not even a separate step: one Undo of the authored line would revert the
    // generated body with it.
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "# header\n" },
        userEvent: "input.type",
      });
    });
    const authoredPrefix = `# header\n${GENERATED_PREFIX}`;
    const code = await regenerate(authoredPrefix, REGENERATED_BODY);

    await act(async () => {
      pressHistory(view, "undo");
    });
    // Undo cannot reach across the host's own write: it replaced the whole document the authored
    // edit applied to, and CodeMirror maps the events history holds through it rather than
    // replaying them over text that no longer exists.
    expect(view.state.doc.toString()).toBe(code);
    expect(getSectionData()).toMatchObject({
      code,
      generatedRegion: {
        from: authoredPrefix.length,
        to: authoredPrefix.length + REGENERATED_BODY.length,
      },
    });
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      null,
      "start",
      "middle",
      "end",
      null,
    ]);
  });

  it("still undoes text authored after a host's regeneration", async () => {
    // The control for the two cases above: the same keypress that cannot reach a host's write
    // still takes back an edit somebody made after it, and redo puts it back. Without it, an
    // editor whose history had simply been switched off, reset, or refused would pass them both.
    await mount(makeGeneratedSection());
    const view = getView();
    const code = await regenerate(GENERATED_PREFIX, REGENERATED_BODY);
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "# header\n" },
        userEvent: "input.type",
      });
    });
    const shifted = "# header\n".length;
    expect(getSectionData()).toMatchObject({
      code: `# header\n${code}`,
      generatedRegion: {
        from: REGENERATED_REGION.from + shifted,
        to: REGENERATED_REGION.to + shifted,
      },
    });

    await act(async () => {
      pressHistory(view, "undo");
    });
    expect(view.state.doc.toString()).toBe(code);
    expect(getSectionData()).toMatchObject({
      code,
      generatedRegion: REGENERATED_REGION,
    });
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "end",
      null,
    ]);

    await act(async () => {
      pressHistory(view, "redo");
    });
    expect(view.state.doc.toString()).toBe(`# header\n${code}`);
    expect(getSectionData()).toMatchObject({
      generatedRegion: {
        from: REGENERATED_REGION.from + shifted,
        to: REGENERATED_REGION.to + shifted,
      },
    });
  });

  it("paints only the lines the declared region covers", async () => {
    // The rejected candidate treated the whole document as generated, so the authored `import`
    // and `state` lines were painted as machine-written output. The region's own boundary lines
    // are the blank separators, and the text outside it keeps the ordinary surface.
    await mount(makeGeneratedSection());
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "end",
      null,
    ]);

    // The block follows the host's regeneration: a longer body without leaving its boundaries.
    await regenerate(
      GENERATED_PREFIX,
      "\n\nvalue = math.sqrt(3)\nscaled = value * 2\n\n",
    );
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "middle",
      "end",
      null,
    ]);

    // A region inside one line is both ends at once, which the reference's separator-bounded
    // range never has to answer for.
    await remount(
      makeCodeSection({
        code: "value = 3",
        generatedRegion: { from: 8, to: 9 },
        mode: "generated-document",
      }),
    );
    expect(getGeneratedLineMarks(getView())).toStrictEqual(["only"]);
  });

  it("makes a locked section read-only without turning it into a generated document", async () => {
    await mount(makeCodeSection({}, { positionAndSizeLocked: true }));
    expect(getView().state.readOnly).toBe(true);
    expect(getWrapper().getAttribute("data-workspace-section-editor")).toBe(
      "read-only",
    );

    // Locking a section locks its content, so a locked generated document keeps the block's paint
    // while accepting nothing at all — not even the authored Python around it.
    await remount(
      makeGeneratedSection(GENERATED_CODE, { positionAndSizeLocked: true }),
    );
    const wrapper = getWrapper();
    expect(wrapper.getAttribute("data-workspace-section-editor")).toBe(
      "generated-document",
    );
    expect(wrapper.getAttribute("aria-label")).toBe(
      "train.py generated code, read-only",
    );
    expect(getView().state.readOnly).toBe(true);
    expect(getView().contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "end",
      null,
    ]);
  });

  it("refuses a commit while the section is read-only", async () => {
    await mount(makeCodeSection({ mode: "read-only" }));
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);
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
      setWorkspaceCodeSectionData(testWorkspace.host, SECTION_ID, {
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
