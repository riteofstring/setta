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
import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import { diagnosticCount, forceLinting } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { activateHover, EditorView } from "@codemirror/view";
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
import type {
  WorkspaceCodeSectionCompletionResult,
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionRequest,
} from "./codeSectionCompletion";

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

const SECTION_ID = "code";
let definition = createWorkspaceCodeSection();

function getGeneratedLineMarks(view: EditorView): Array<string | null> {
  return [...view.dom.querySelectorAll(".cm-line")].map((line) =>
    line.getAttribute("data-workspace-generated-line"),
  );
}

const GENERATED_PREFIX = "import math";
const GENERATED_SUFFIX = "state = value";
const GENERATED_CODE = `${GENERATED_PREFIX}\n\nvalue = math.sqrt(3)\n\n${GENERATED_SUFFIX}`;
const GENERATED_REGION = {
  from: GENERATED_PREFIX.length,
  to: GENERATED_CODE.length - GENERATED_SUFFIX.length,
};

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
    savedViews: null,
  };
}

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
    definition = createWorkspaceCodeSection();
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

  async function mountWithCompletion(
    completionProvider: WorkspaceCodeSectionCompletionProvider,
    section: WorkspaceSectionInput = makeGeneratedSection(),
  ) {
    definition = createWorkspaceCodeSection({ completionProvider });
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
      [WORKSPACE_CODE_SECTION_KIND]: definition,
    });
    await mount(section);
  }

  async function mountWithSubmit(
    onSubmit: (sectionId: string, data: WorkspaceCodeSectionData) => void,
    section: WorkspaceSectionInput = makeCodeSection(),
  ) {
    definition = createWorkspaceCodeSection({ onSubmit });
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
      [WORKSPACE_CODE_SECTION_KIND]: definition,
    });
    await mount(section);
  }

  async function waitForCompletion(
    view: EditorView,
    expected: "active" | null,
  ) {
    const deadline = Date.now() + 1_000;
    while (completionStatus(view.state) !== expected && Date.now() < deadline) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
    expect(completionStatus(view.state)).toBe(expected);
  }

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

  it("uses CodeMirror's lint underline and hover tooltip for document diagnostics", async () => {
    const message = 'Name "missing_value" is not defined.';
    await mount(makeCodeSection());
    const view = getView();

    await act(async () => {
      setWorkspaceCodeSectionData(testWorkspace.host, SECTION_ID, {
        ...getSectionData(),
        diagnostics: [
          {
            from: 0,
            message,
            severity: "error",
            to: 5,
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      forceLinting(view);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(diagnosticCount(view.state)).toBe(1);
    const range = view.dom.querySelector<HTMLElement>(".cm-lintRange");
    expect(range).not.toBeNull();

    await act(async () => {
      activateHover(view, 1, 1);
    });
    expect(view.dom.querySelector(".cm-tooltip-lint")?.textContent).toContain(
      message,
    );

    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "# " },
        userEvent: "input.type",
      });
    });
    expect(getSectionData().diagnostics).toEqual([]);
    expect(diagnosticCount(getView().state)).toBe(0);
  });

  it("drops the gutters when the section turns line numbers off", async () => {
    await mount(makeCodeSection({ lineNumbers: false, wrapLines: false }));
    const view = getView();
    expect(view.dom.querySelector(".cm-gutters")).toBeNull();
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  });

  it("owns only the editor axes with native overflow", async () => {
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

    expect(getWrapper().classList.contains("setta-native-wheel-x")).toBe(true);
    expect(getWrapper().classList.contains("setta-native-wheel-y")).toBe(false);

    Object.defineProperties(view.scrollDOM, {
      scrollHeight: { configurable: true, value: 700 },
      scrollWidth: { configurable: true, value: 300 },
    });
    await reportResize(view.scrollDOM);
    expect(getWrapper().classList.contains("setta-native-wheel-x")).toBe(false);
    expect(getWrapper().classList.contains("setta-native-wheel-y")).toBe(true);

    Object.defineProperties(view.scrollDOM, {
      scrollHeight: { configurable: true, value: 700 },
      scrollWidth: { configurable: true, value: 700 },
    });
    await reportResize(view.scrollDOM);
    expect(getWrapper().classList.contains("setta-native-wheel-x")).toBe(true);
    expect(getWrapper().classList.contains("setta-native-wheel-y")).toBe(true);

    Object.defineProperties(view.scrollDOM, {
      scrollHeight: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 300 },
    });
    await reportResize(view.scrollDOM);
    expect(getWrapper().classList.contains("setta-native-wheel-x")).toBe(false);
    expect(getWrapper().classList.contains("setta-native-wheel-y")).toBe(false);
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

    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
    const wrapper = getWrapper();
    expect(wrapper.getAttribute("aria-label")).toBe("train.py code, read-only");
    expect(wrapper.getAttribute("data-workspace-section-editor")).toBe(
      "read-only",
    );

    expect(
      wrapper.classList.contains("setta-workspace-generated-document"),
    ).toBe(false);
    expect(getGeneratedLineMarks(view)).toStrictEqual([null, null, null]);
  });

  it("keeps the text around a generated block authorable", async () => {
    await mount(makeGeneratedSection());
    const view = getView();

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

    expect(view.dom.textContent).toContain(GENERATED_PREFIX);

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

    expect(getView()).toBe(view);

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

    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_REGION.from + 4 } });
    });
    expect(view.state.selection.main.anchor).toBe(GENERATED_REGION.from);
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_REGION.to - 2 } });
    });
    expect(view.state.selection.main.anchor).toBe(GENERATED_REGION.to);

    await act(async () => {
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length },
      });
    });
    expect(view.state.selection.main.head).toBe(view.state.doc.length);

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

    expect(await regenerate(GENERATED_PREFIX, REGENERATED_BODY)).toBe(
      REGENERATED_CODE,
    );
    expect(getView()).toBe(view);
    expect(view.state.doc.toString()).toBe(REGENERATED_CODE);

    await act(async () => {
      pressHistory(view, "undo");
    });
    expect(view.state.doc.toString()).toBe(REGENERATED_CODE);
    expect(getSectionData()).toMatchObject({
      code: REGENERATED_CODE,
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
    await mount(makeGeneratedSection());
    expect(getGeneratedLineMarks(getView())).toStrictEqual([
      null,
      "start",
      "middle",
      "end",
      null,
    ]);

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

    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("submits the exact editor text with either platform shortcut", async () => {
    const onSubmit = vi.fn();
    await mountWithSubmit(onSubmit);
    const view = getView();
    expect(getWrapper().getAttribute("aria-keyshortcuts")).toBe(
      "Enter Escape Control+Enter Meta+Enter",
    );
    const bubbled = vi.fn();
    document.addEventListener("keydown", bubbled);
    const controlEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      ctrlKey: true,
      key: "Enter",
    });

    await act(async () => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "gamma = 3\n" },
        userEvent: "input.type",
      });
      view.contentDOM.dispatchEvent(controlEnter);
    });
    expect(controlEnter.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenLastCalledWith(
      SECTION_ID,
      expect.objectContaining({
        code: "alpha = 1\nbeta = 2\ngamma = 3\n",
      }),
    );

    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
          metaKey: true,
        }),
      );
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    document.removeEventListener("keydown", bubbled);
  });

  it("does not submit for plain Enter or while composing", async () => {
    const onSubmit = vi.fn();
    await mountWithSubmit(onSubmit);
    const view = getView();
    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Enter",
          key: "Enter",
        }),
      );
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Enter",
          ctrlKey: true,
          isComposing: true,
          key: "Enter",
        }),
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits through an open completion popup", async () => {
    const onSubmit = vi.fn();
    const completionProvider: WorkspaceCodeSectionCompletionProvider = vi.fn(
      async () => ({
        from: 0,
        options: [{ insertText: "alpha", label: "alpha" }],
        to: 0,
      }),
    );
    definition = createWorkspaceCodeSection({
      completionProvider,
      onSubmit,
    });
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
      [WORKSPACE_CODE_SECTION_KIND]: definition,
    });
    await mount();
    const view = getView();
    await act(async () => {
      startCompletion(view);
    });
    await waitForCompletion(view, "active");

    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Enter",
          ctrlKey: true,
          key: "Enter",
        }),
      );
    });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not submit a read-only or locked section", async () => {
    const onSubmit = vi.fn();
    await mountWithSubmit(onSubmit, makeCodeSection({ mode: "read-only" }));
    getView().contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Enter",
        ctrlKey: true,
        key: "Enter",
      }),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await remount(makeCodeSection({}, { positionAndSizeLocked: true }));
    getView().contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Enter",
        key: "Enter",
        metaKey: true,
      }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requests outer generated-Python completions with live UTF-16 context and lets the popup own its keys", async () => {
    const requests: WorkspaceCodeSectionCompletionRequest[] = [];
    const completionProvider: WorkspaceCodeSectionCompletionProvider = vi.fn(
      async (request) => {
        requests.push(request);
        return {
          from: request.cursorOffsetUtf16 - "math".length,
          options: [{ insertText: "mathlib", label: "mathlib" }],
          to: request.cursorOffsetUtf16,
        };
      },
    );
    await mountWithCompletion(completionProvider);
    const view = getView();

    const prefixCursor = GENERATED_REGION.from;
    await act(async () => {
      view.dispatch({ selection: { anchor: prefixCursor } });
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, "active");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      cursorOffsetUtf16: prefixCursor,
      generatedRegion: GENERATED_REGION,
      language: "python",
      sectionId: SECTION_ID,
      text: GENERATED_CODE,
      trigger: "explicit",
    });

    const tab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Tab",
      key: "Tab",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toContain("import mathlib");

    const liveRegion = (
      getSectionData() as WorkspaceCodeSectionData & {
        generatedRegion: { from: number; to: number };
      }
    ).generatedRegion;
    await act(async () => {
      view.dispatch({ selection: { anchor: liveRegion.from + 1 } });
      expect(startCompletion(view)).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toHaveLength(1);
  });

  it("aborts stale section completion work", async () => {
    const pending: {
      request: WorkspaceCodeSectionCompletionRequest | null;
      resolve:
        ((value: WorkspaceCodeSectionCompletionResult | null) => void) | null;
    } = { request: null, resolve: null };
    const completionProvider: WorkspaceCodeSectionCompletionProvider = vi.fn(
      (nextRequest): Promise<WorkspaceCodeSectionCompletionResult | null> => {
        if (pending.request !== null) {
          return Promise.resolve(null);
        }
        pending.request = nextRequest;
        return new Promise<WorkspaceCodeSectionCompletionResult | null>(
          (nextResolve) => {
            pending.resolve = nextResolve;
          },
        );
      },
    );
    await mountWithCompletion(completionProvider);
    const view = getView();
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_PREFIX.length - 1 } });
      expect(startCompletion(view)).toBe(true);
    });
    const deadline = Date.now() + 1_000;
    while (pending.request === null && Date.now() < deadline) {
      await act(async () => {
        await new Promise((next) => setTimeout(next, 5));
      });
    }
    if (pending.request === null || pending.resolve === null) {
      throw new Error("The section completion provider was not invoked.");
    }
    const request = pending.request;
    const resolve = pending.resolve;
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "# " },
        userEvent: "input.type",
      });
    });
    expect(request.signal.aborted).toBe(true);
    resolve({
      from: GENERATED_REGION.from - 1,
      options: [{ insertText: "blocked", label: "blocked" }],
      to: GENERATED_REGION.to + 1,
    });
    await waitForCompletion(view, null);
    expect(view.state.doc.toString()).not.toContain("blocked");
  });

  it("ignores a malformed completion result without changing the optional editor surface", async () => {
    const completionProvider = vi.fn(
      async () =>
        ({
          from: GENERATED_PREFIX.length - 1,
          options: [{ insertText: "", label: "" }],
          to: GENERATED_PREFIX.length,
        }) as unknown as Awaited<
          ReturnType<WorkspaceCodeSectionCompletionProvider>
        >,
    );
    await mountWithCompletion(completionProvider);
    const view = getView();
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_PREFIX.length - 1 } });
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, null);
    expect(view.state.doc.toString()).toBe(GENERATED_CODE);
  });

  it("rejects a completion replacement that crosses the live generated region", async () => {
    const completionProvider: WorkspaceCodeSectionCompletionProvider = vi.fn(
      async () => ({
        from: GENERATED_REGION.from - 1,
        options: [{ insertText: "blocked", label: "blocked" }],
        to: GENERATED_REGION.to + 1,
      }),
    );
    await mountWithCompletion(completionProvider);
    const view = getView();
    await act(async () => {
      view.dispatch({ selection: { anchor: GENERATED_PREFIX.length - 1 } });
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, null);
    expect(view.state.doc.toString()).toBe(GENERATED_CODE);
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
