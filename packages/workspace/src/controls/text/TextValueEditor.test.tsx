/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { EditorView } from "@codemirror/view";
import {
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
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

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the two-layer text value editor against the reference's `TextInputCodeMirror`
// behavior: the highlighted idle dummy (and its placeholder form), the primary-mouse-down
// activation that swaps in the live CodeMirror editor and activates the section through the
// input-focus intent, per-document-change reporting through the controlled seam, Escape
// returning focus to the section container, and the interaction-first disabled contract for
// the host flag and item-select mode.

const SECTION_ID = "panel";
const ITEM_ID = "item-alpha";
const FIELD_ID = "expression";

type ItemRowEditorProps = Extract<
  TextValueEditorProps,
  { presentation: "item-row" }
>;
type SectionFieldEditorProps = Extract<
  TextValueEditorProps,
  { presentation: "section-field" }
>;

function getDummyId(): string {
  return `${testWorkspace.domId}-${SECTION_ID}-${ITEM_ID}-ItemValueInput`;
}

function getLiveId(): string {
  return `${testWorkspace.domId}-CodeMirror-${SECTION_ID}-${ITEM_ID}`;
}

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
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.appearance.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  async function mount(props: Partial<ItemRowEditorProps> = {}) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(TextValueEditor, {
            ariaLabel: "Threshold value",
            sectionId: SECTION_ID,
            controlId: ITEM_ID,
            presentation: "item-row",
            value: "0.001",
            language: "python",
            onValueChange: () => {},
            ...props,
          })}
        </WorkspaceTestProvider>,
      );
    });
  }

  function getDummy(): HTMLElement {
    const dummy = host.querySelector<HTMLElement>(`#${getDummyId()}`);
    if (!dummy) {
      throw new Error("The idle dummy layer is not rendered.");
    }
    return dummy;
  }

  async function activate() {
    await act(async () => {
      getDummy().dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 5,
          clientY: 5,
        }),
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
    expect(dummy.getAttribute("aria-multiline")).toBe("true");
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
    expect(
      divider?.classList.contains(
        "peer-focus-within/textinput:border-blue-400",
      ),
    ).toBe(true);
  });

  it("renders the placeholder form when the value is empty", async () => {
    await mount({ value: "", placeholder: "default_value" });
    const dummy = getDummy();
    expect(dummy.tagName).toBe("SPAN");
    expect(dummy.textContent).toBe("default_value");
    expect(dummy.classList.contains("text-gray-600")).toBe(true);
  });

  it("keeps overlapping hosts' idle editor ids distinct", async () => {
    const secondWorkspace = createWorkspaceTestHost();
    const secondDummyId = `${secondWorkspace.domId}-${SECTION_ID}-${ITEM_ID}-ItemValueInput`;
    try {
      await act(async () => {
        root.render(
          <div>
            <WorkspaceTestProvider workspace={testWorkspace}>
              <TextValueEditor
                ariaLabel="First threshold value"
                controlId={ITEM_ID}
                presentation="item-row"
                language="python"
                onValueChange={() => {}}
                sectionId={SECTION_ID}
                value="0.001"
              />
            </WorkspaceTestProvider>
            <WorkspaceTestProvider workspace={secondWorkspace}>
              <TextValueEditor
                ariaLabel="Second threshold value"
                controlId={ITEM_ID}
                presentation="item-row"
                language="python"
                onValueChange={() => {}}
                sectionId={SECTION_ID}
                value="0.002"
              />
            </WorkspaceTestProvider>
          </div>,
        );
      });

      expect(host.querySelector(`#${getDummyId()}`)?.textContent).toBe("0.001");
      expect(host.querySelector(`#${secondDummyId}`)?.textContent).toBe(
        "0.002",
      );
      expect(host.querySelectorAll('[role="textbox"]')).toHaveLength(2);
    } finally {
      await act(async () => {
        root.render(null);
      });
      secondWorkspace.host.dispose();
    }
  });

  it("swaps to the live editor on primary mouse down and activates the section", async () => {
    await mount();
    await activate();
    const liveWrapper = host.querySelector<HTMLElement>(`#${getLiveId()}`);
    const liveView = getLiveView();
    expect(liveWrapper).not.toBeNull();
    expect(liveWrapper?.hasAttribute("tabindex")).toBe(false);
    expect(liveView.contentDOM.tabIndex).toBe(-1);
    expect(liveView.state.doc.toString()).toBe("0.001");
    expect(liveView.contentDOM.getAttribute("aria-label")).toBe(
      "Threshold value",
    );
    // The dummy layer leaves once the live editor initializes.
    expect(host.querySelector(`#${getDummyId()}`)).toBeNull();
    // The input-focus intent made the owning section the single active section.
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      SECTION_ID,
    ]);
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

  it("commits the current single-line value on an unmodified Enter without inserting a newline", async () => {
    const onCommit = vi.fn();
    const onValueChange = vi.fn();
    await mount({ onCommit, onValueChange, singleLine: true });
    await activate();
    const view = getLiveView();
    await act(async () => {
      view.dispatch({ changes: { from: 5, insert: "23" } });
    });

    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("0.00123");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("0.00123");
  });

  it("does not commit modified or IME-composing Enter presses", async () => {
    const onCommit = vi.fn();
    await mount({ onCommit, singleLine: true });
    await activate();
    const view = getLiveView();

    for (const init of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
    ]) {
      const enter = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "Enter",
        key: "Enter",
        ...init,
      });
      await act(async () => {
        view.contentDOM.dispatchEvent(enter);
      });
    }

    expect(onCommit).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("0.001");
  });

  it("gives an active completion popup immediate Enter and Escape precedence before normal editor actions", async () => {
    const onCommit = vi.fn();
    const provider = vi.fn().mockResolvedValue({
      from: 5,
      options: [{ insertText: "sqrt", label: "sqrt" }],
      to: 7,
    });
    await mount({
      completionProvider: provider,
      onCommit,
      singleLine: true,
      value: "math.sq",
    });
    await activate();
    const view = getLiveView();

    await act(async () => {
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, "active");
    expect(document.querySelector('[role="option"]')?.textContent).toContain(
      "sqrt",
    );

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Escape",
      key: "Escape",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(completionStatus(view.state)).not.toBe("active");
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(view.contentDOM);

    await act(async () => {
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, "active");
    const composingEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      isComposing: true,
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(composingEnter);
    });
    expect(view.state.doc.toString()).toBe("math.sq");
    expect(onCommit).not.toHaveBeenCalled();
    expect(completionStatus(view.state)).toBe("active");
    const firstEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(firstEnter);
    });
    expect(firstEnter.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("math.sqrt");
    expect(onCommit).not.toHaveBeenCalled();

    const secondEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(secondEnter);
    });
    expect(secondEnter.defaultPrevented).toBe(true);
    expect(onCommit).toHaveBeenCalledWith("math.sqrt");
  });

  it("aborts stale completion requests on document change and never adds a Tab binding", async () => {
    const first = createDeferred<{
      from: number;
      options: Array<{ label: string }>;
      to: number;
    } | null>();
    const provider = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(null);
    await mount({
      completionProvider: provider,
      singleLine: true,
      value: "math.sq",
    });
    await activate();
    const view = getLiveView();
    await act(async () => {
      expect(startCompletion(view)).toBe(true);
    });
    await waitFor(() => provider.mock.calls.length === 1);
    const request = provider.mock.calls[0]?.[0] as { signal: AbortSignal };

    await act(async () => {
      view.dispatch({ changes: { from: 7, insert: "u" } });
    });
    expect(request.signal.aborted).toBe(true);
    first.resolve({ from: 5, options: [{ label: "sqrt" }], to: 7 });
    await waitFor(() => completionStatus(view.state) !== "pending");
    expect(
      currentCompletions(view.state).map((option) => option.label),
    ).not.toContain("sqrt");

    const tab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Tab",
      key: "Tab",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe("math.squ");
  });

  it("aborts an in-flight completion when the editor becomes disabled and ignores its result", async () => {
    const pending = createDeferred<{
      from: number;
      options: Array<{ label: string; insertText: string }>;
      to: number;
    } | null>();
    const provider = vi.fn().mockReturnValue(pending.promise);
    await mount({
      completionProvider: provider,
      singleLine: true,
      value: "math.sq",
    });
    await activate();
    const view = getLiveView();
    await act(async () => {
      expect(startCompletion(view)).toBe(true);
    });
    await waitFor(() => provider.mock.calls.length === 1);
    const request = provider.mock.calls[0]?.[0] as { signal: AbortSignal };

    await mount({
      completionProvider: provider,
      disabled: true,
      singleLine: true,
      value: "math.sq",
    });
    expect(request.signal.aborted).toBe(true);
    pending.resolve({
      from: 5,
      options: [{ insertText: "sqrt", label: "sqrt" }],
      to: 7,
    });
    await waitFor(() => completionStatus(view.state) !== "pending");
    expect(view.state.doc.toString()).toBe("math.sq");
    expect(currentCompletions(view.state)).toEqual([]);
  });

  it("does not commit after the active editor becomes disabled", async () => {
    const onCommit = vi.fn();
    await mount({ onCommit, singleLine: true });
    await activate();
    await mount({ disabled: true, onCommit, singleLine: true });
    const view = getLiveView();
    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(enter);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("rejects authored document changes after the active editor becomes disabled", async () => {
    const onValueChange = vi.fn();
    await mount({ onValueChange });
    await activate();
    await mount({ disabled: true, onValueChange });

    const view = getLiveView();
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    await act(async () => {
      view.dispatch({ changes: { from: 5, insert: "23" } });
    });

    expect(view.state.doc.toString()).toBe("0.001");
    expect(onValueChange).not.toHaveBeenCalled();

    await mount({ disabled: true, onValueChange, value: "0.002" });
    expect(getLiveView().state.doc.toString()).toBe("0.002");
    expect(onValueChange).not.toHaveBeenCalled();
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
    expect(onValueChange).toHaveBeenCalledWith(
      "first line\nthird line\nsecond line",
    );
  });

  it("returns focus to the section container on Escape and restores the dummy", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({
      withNested: { [SECTION_ID]: sectionRoot },
    });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount();
    await activate();
    const view = getLiveView();
    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    expect(documentEscape).not.toHaveBeenCalled();
    // The blur handler resets both layers on the next tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(host.querySelector(`#${getDummyId()}`)).not.toBeNull();
    expect(host.querySelector(".cm-editor")).toBeNull();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("ignores activation while the host disabled flag is set", async () => {
    await mount({ disabled: true });
    const dummy = getDummy();
    expect(dummy.classList.contains("cursor-text")).toBe(false);
    expect(dummy.getAttribute("aria-disabled")).toBe("true");
    expect(dummy.tabIndex).toBe(-1);
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([]);
  });

  it("disables package-wide and drops the divider focus treatment during item-select mode", async () => {
    testWorkspace.itemSelectionMode.setState({ isSelectingItems: true });
    await mount();
    const divider = host.querySelector("span.section-value");
    expect(
      divider?.classList.contains(
        "peer-focus-within/textinput:border-blue-400",
      ),
    ).toBe(false);
    await activate();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });
});

// The section-field presentation is the same editor core inside the package's compact field
// surface. These cases re-run the accepted commit, completion, IME, Escape, and disabled
// behavior at that placement and pin the adornment's boundary: it is layout the package owns and
// content the caller owns, never editor value and never a keyboard participant.
describe("TextValueEditor section-field presentation", () => {
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
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.appearance.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  async function mountField(props: Partial<SectionFieldEditorProps> = {}) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(TextValueEditor, {
            ariaLabel: "Expression",
            sectionId: SECTION_ID,
            controlId: FIELD_ID,
            presentation: "section-field",
            value: "math.sq",
            language: "python",
            singleLine: true,
            onValueChange: () => {},
            ...props,
          })}
        </WorkspaceTestProvider>,
      );
    });
  }

  function getFieldDummy(): HTMLElement {
    const dummy = host.querySelector<HTMLElement>(
      `#${testWorkspace.domId}-${SECTION_ID}-${FIELD_ID}-SectionField`,
    );
    if (!dummy) {
      throw new Error("The section-field idle layer is not rendered.");
    }
    return dummy;
  }

  async function activateField() {
    await act(async () => {
      getFieldDummy().dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 5,
          clientY: 5,
        }),
      );
    });
  }

  function getFieldView(): EditorView {
    const editorDom = host.querySelector<HTMLElement>(".cm-editor");
    const view = editorDom ? EditorView.findFromDOM(editorDom) : null;
    if (!view) {
      throw new Error("The live section-field editor is not mounted.");
    }
    return view;
  }

  it("renders one full-width package-owned surface with no item-row value column", async () => {
    await mountField();
    const field = host.querySelector<HTMLElement>(
      ".setta-workspace-section-field",
    );
    expect(field).not.toBeNull();
    expect(field?.dataset["disabled"]).toBe("false");
    // The one public hook for the surface: consumers and captures observe the field here rather
    // than through the private class its stylesheet paints.
    expect(host.querySelector("[data-workspace-section-field='true']")).toBe(
      field,
    );
    expect(field?.classList.contains("nodrag")).toBe(true);
    expect(field?.classList.contains("nopan")).toBe(true);
    // No underlined value-column divider and no item-row placement classes at this placement.
    expect(host.querySelector("span.section-value")).toBeNull();
    const dummy = getFieldDummy();
    expect(dummy.getAttribute("aria-label")).toBe("Expression");
    expect(dummy.textContent).toBe("math.sq");
    expect(dummy.classList.contains("section-value")).toBe(false);
  });

  it("keeps the caller's end adornment out of the value and out of keyboard order", async () => {
    const onValueChange = vi.fn();
    await mountField({
      endAdornment: <span data-testid="pending-mark">pending</span>,
      onValueChange,
    });
    const adornment = host.querySelector<HTMLElement>(
      ".setta-workspace-section-field-adornment",
    );
    expect(adornment?.textContent).toBe("pending");
    // Layout is package-owned and sits outside the editor layers.
    expect(adornment?.querySelector("[role='textbox'], .cm-editor")).toBeNull();
    expect(adornment?.contains(getFieldDummy())).toBe(false);
    expect(adornment?.querySelectorAll("[tabindex]")).toHaveLength(0);

    await activateField();
    const view = getFieldView();
    expect(view.state.doc.toString()).toBe("math.sq");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  // Main's field carries its box and its type on each stacked layer, so activating it changes both.
  // Here the wrapper owns the box and both layers carry the one class that owns the type, which is
  // what keeps the swap invisible.
  it("swaps the idle layer for a live editor on the same type owner", async () => {
    await mountField();
    const dummy = getFieldDummy();
    expect(
      dummy.classList.contains("setta-workspace-section-field-editor"),
    ).toBe(true);
    expect(
      dummy.classList.contains("setta-workspace-section-field-editor-live"),
    ).toBe(false);

    await activateField();
    const live = host.querySelector<HTMLElement>(
      ".setta-workspace-section-field-editor-live",
    );
    expect(
      live?.classList.contains("setta-workspace-section-field-editor"),
    ).toBe(true);
    expect(live?.querySelector(".cm-editor")).not.toBeNull();
    // The box stays on the wrapper both layers sit inside, never on a layer.
    const field = host.querySelector<HTMLElement>(
      ".setta-workspace-section-field",
    );
    expect(field?.contains(live ?? null)).toBe(true);
  });

  it("omits the adornment gutter entirely when the caller supplies none", async () => {
    await mountField();
    expect(
      host.querySelector(".setta-workspace-section-field-adornment"),
    ).toBeNull();
  });

  it("commits on an unmodified Enter and ignores IME-composing Enter", async () => {
    const onCommit = vi.fn();
    await mountField({ onCommit });
    await activateField();
    const view = getFieldView();

    const composing = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      isComposing: true,
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(composing);
    });
    expect(onCommit).not.toHaveBeenCalled();

    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(onCommit).toHaveBeenCalledWith("math.sq");
    expect(view.state.doc.lines).toBe(1);
  });

  it("gives an active completion popup Enter precedence before the commit", async () => {
    const onCommit = vi.fn();
    const completionProvider = vi.fn().mockResolvedValue({
      from: 5,
      options: [{ insertText: "sqrt", label: "sqrt" }],
      to: 7,
    });
    await mountField({ completionProvider, onCommit });
    await activateField();
    const view = getFieldView();

    await act(async () => {
      expect(startCompletion(view)).toBe(true);
    });
    await waitForCompletion(view, "active");
    const firstEnter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
    await act(async () => {
      view.contentDOM.dispatchEvent(firstEnter);
    });
    expect(view.state.doc.toString()).toBe("math.sqrt");
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
        }),
      );
    });
    expect(onCommit).toHaveBeenCalledWith("math.sqrt");
  });

  it("returns focus to the section container on Escape", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({
      withNested: { [SECTION_ID]: sectionRoot },
    });
    await mountField();
    await activateField();
    await act(async () => {
      getFieldView().contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    sectionRoot.remove();
  });

  it("refuses activation and marks the surface while disabled", async () => {
    await mountField({ disabled: true });
    const field = host.querySelector<HTMLElement>(
      ".setta-workspace-section-field",
    );
    expect(field?.dataset["disabled"]).toBe("true");
    expect(getFieldDummy().getAttribute("aria-disabled")).toBe("true");
    await activateField();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });
});

async function waitFor(
  condition: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for editor state.");
}

async function waitForCompletion(
  view: EditorView,
  status: "active" | "pending",
): Promise<void> {
  await waitFor(() => completionStatus(view.state) === status);
}

function createDeferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}
