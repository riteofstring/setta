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

import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextValueEditor } from "../controls/text/TextValueEditor";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { initialCanvasState } from "./store";
import { CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME } from "./codeMirrorTooltipParent";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "callable";
const FIELD_ID = "expression";
const FIELD_LABEL = "Expression";
const TOOLTIP_PARENT_SELECTOR = `.${CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME}`;

const observedResizeTargets = new Map<Element, ResizeObserverCallback>();

class CapturingResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    observedResizeTargets.set(target, this.callback);
  }
  unobserve(target: Element) {
    observedResizeTargets.delete(target);
  }
  disconnect() {}
}

globalThis.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

function completionProvider() {
  return vi.fn(async (request: { cursorOffset: number }) => ({
    from: 5,
    options: [{ insertText: "sqrt", label: "sqrt" }],
    to: request.cursorOffset,
  }));
}

function registerCallableKind(workspace: WorkspaceTestHost) {
  registerSectionKinds(workspace.host, {
    callable: {
      renderContent: () => null,
      itemArea: {
        renderLeadingContent: () => (
          <TextValueEditor
            ariaLabel={FIELD_LABEL}
            sectionId={SECTION_ID}
            controlId={FIELD_ID}
            presentation="section-field"
            value="math.sq"
            language="python"
            singleLine
            completionProvider={completionProvider()}
            onValueChange={() => {}}
          />
        ),
        toolbar: "filter-only",
      },
    },
  });
}

function loadCallableDocument(workspace: WorkspaceTestHost) {
  loadWorkspaceDocument(workspace.host, {
    sections: {
      [SECTION_ID]: {
        id: SECTION_ID,
        kind: "callable",
        name: "Square Root",
        size: { width: 320, height: 200 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "root",
          items: { root: { id: "root", children: [] } },
          selectedItemIds: [],
        },
      },
    },
    topLevelSections: {
      [SECTION_ID]: { x: 0, y: 0, w: 320, h: 200, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  });
}

async function measureCanvasWrapper(container: HTMLElement) {
  const wrapper = container.querySelector<HTMLElement>("div.react-flow");
  const measure = wrapper ? observedResizeTargets.get(wrapper) : undefined;
  if (!wrapper || !measure) {
    throw new Error("The canvas wrapper is not observed for resizes.");
  }
  await act(async () => {
    measure(
      [
        {
          target: wrapper,
          borderBoxSize: [],
          contentRect: { width: 1_200, height: 800 },
        } as unknown as ResizeObserverEntry,
      ],
      new CapturingResizeObserver(measure) as unknown as ResizeObserver,
    );
  });
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Expected an element matching ${selector}.`);
  }
  return element;
}

describe("canvas CodeMirror tooltip parent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    observedResizeTargets.clear();
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.nodeInternals.setState({ x: new Map() });
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  async function mountCanvas(workspace: WorkspaceTestHost = testWorkspace) {
    registerCallableKind(workspace);
    loadCallableDocument(workspace);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceCanvas />
        </WorkspaceTestProvider>,
      );
    });
    await measureCanvasWrapper(container);
  }

  async function activateField(): Promise<EditorView> {
    const idle = getRequiredElement(
      container,
      `#${testWorkspace.domId}-${SECTION_ID}-${FIELD_ID}-SectionField`,
    );
    await act(async () => {
      idle.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 5,
          clientY: 5,
        }),
      );
    });
    const editorDom = getRequiredElement(container, ".cm-editor");
    const view = EditorView.findFromDOM(editorDom);
    if (!view) {
      throw new Error("The live section field editor is not mounted.");
    }
    return view;
  }

  it("lays out the mounted canvas without waiting for ResizeObserver", async () => {
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("react-flow")) {
          return DOMRect.fromRect({ width: 1_200, height: 800 });
        }
        return originalGetBoundingClientRect.call(this);
      });

    try {
      registerCallableKind(testWorkspace);
      loadCallableDocument(testWorkspace);
      await act(async () => {
        root.render(
          <WorkspaceTestProvider workspace={testWorkspace}>
            <WorkspaceCanvas />
          </WorkspaceTestProvider>,
        );
      });

      const renderer = getRequiredElement(container, ".react-flow__renderer");
      expect(renderer.style.width).toBe("1200px");
      expect(renderer.style.height).toBe("800px");
      expect(testWorkspace.reactFlow.getState().width).toBe(1_200);
      expect(testWorkspace.reactFlow.getState().height).toBe(800);
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it("renders one tooltip parent in the transformed scene and outside every section", async () => {
    await mountCanvas();

    const parents = container.querySelectorAll(TOOLTIP_PARENT_SELECTOR);
    expect(parents).toHaveLength(1);
    const parent = parents[0];
    if (!(parent instanceof HTMLElement)) {
      throw new Error("The canvas rendered no tooltip parent element.");
    }

    expect(
      parent.parentElement?.classList.contains("react-flow__viewport"),
    ).toBe(true);

    const section = getRequiredElement(
      container,
      `[data-section-id="${SECTION_ID}"]`,
    );
    expect(section.contains(parent)).toBe(false);
  });

  it("parents a field's completion popup to the canvas rather than the section around it", async () => {
    await mountCanvas();
    const view = await activateField();

    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      expect(startCompletion(view)).toBe(true);
    });
    const deadline = Date.now() + 1_000;
    while (completionStatus(view.state) !== "active" && Date.now() < deadline) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
    expect(completionStatus(view.state)).toBe("active");

    const parent = getRequiredElement(container, TOOLTIP_PARENT_SELECTOR);
    const tooltip = getRequiredElement(parent, ".cm-tooltip-autocomplete");
    expect(tooltip.textContent).toContain("sqrt");
    const section = getRequiredElement(
      container,
      `[data-section-id="${SECTION_ID}"]`,
    );
    expect(section.contains(tooltip)).toBe(false);
    expect(view.dom.contains(tooltip)).toBe(false);
  });

  it("gives every canvas its own parent instead of one shared document element", async () => {
    await mountCanvas();
    const secondWorkspace = createWorkspaceTestHost();
    const secondContainer = document.createElement("div");
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    try {
      registerCallableKind(secondWorkspace);
      loadCallableDocument(secondWorkspace);
      await act(async () => {
        secondRoot.render(
          <WorkspaceTestProvider workspace={secondWorkspace}>
            <WorkspaceCanvas />
          </WorkspaceTestProvider>,
        );
      });

      const parents = document.querySelectorAll(TOOLTIP_PARENT_SELECTOR);
      expect(parents).toHaveLength(2);
      expect(container.querySelectorAll(TOOLTIP_PARENT_SELECTOR)).toHaveLength(
        1,
      );
      expect(
        secondContainer.querySelectorAll(TOOLTIP_PARENT_SELECTOR),
      ).toHaveLength(1);
    } finally {
      await act(async () => {
        secondRoot.unmount();
      });
      secondContainer.remove();
      secondWorkspace.host.dispose();
    }
  });
});
