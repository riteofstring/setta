/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


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

  async function mount(props: Partial<TextValueEditorProps> = {}) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(TextValueEditor, {
          ariaLabel: "Threshold value",
          sectionId: SECTION_ID,
          itemId: ITEM_ID,
          value: "0.001",
          language: "python",
          onValueChange: () => {},
          ...props,
        })
        }</WorkspaceTestProvider>,
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
                itemId={ITEM_ID}
                language="python"
                onValueChange={() => {}}
                sectionId={SECTION_ID}
                value="0.001"
              />
            </WorkspaceTestProvider>
            <WorkspaceTestProvider workspace={secondWorkspace}>
              <TextValueEditor
                ariaLabel="Second threshold value"
                itemId={ITEM_ID}
                language="python"
                onValueChange={() => {}}
                sectionId={SECTION_ID}
                value="0.002"
              />
            </WorkspaceTestProvider>
          </div>,
        );
      });

      expect(host.querySelector(`#${getDummyId()}`)?.textContent).toBe(
        "0.001",
      );
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
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([SECTION_ID]);
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
    expect(onValueChange).toHaveBeenCalledWith(
      "first line\nthird line\nsecond line",
    );
  });

  it("returns focus to the section container on Escape and restores the dummy", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
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
