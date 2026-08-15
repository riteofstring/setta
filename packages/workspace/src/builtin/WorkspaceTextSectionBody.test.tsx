/* @vitest-environment jsdom */

import { EditorView } from "@codemirror/view";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  getWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
} from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceDocumentInput, WorkspaceSectionInput } from "../document/types";
import { SectionHeader } from "../section/header/SectionHeader";
import { useResizeEvent } from "../section/resize/resizeEvents";
import { setWorkspaceTextSectionData } from "./textSectionActions";
import {
  createWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceTextSectionData,
} from "./textSectionData";
import { createWorkspaceTextSection } from "./textSectionKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the built-in Text section against the reference's `TextBlock`: one section that either
// renders Markdown or plain text, or edits it in the same section-scale editor the Code Editor
// section uses. The header control swaps the surface without rewriting the text, locking makes the
// editor read-only, and the rendered surface carries the reference's Markdown vocabulary.

const SECTION_ID = "notes";

function makeTextSection(
  data: Partial<WorkspaceTextSectionData> = {},
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id: SECTION_ID,
    kind: WORKSPACE_TEXT_SECTION_KIND,
    name: "Notes",
    data: createWorkspaceTextSectionData({ text: "alpha\nbeta\n", ...data }),
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
    sections: { [SECTION_ID]: section },
    topLevelSections: { [SECTION_ID]: { x: 0, y: 0, w: 500, h: null, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

describe("built-in text section", () => {
  let host: HTMLDivElement;
  let root: Root;
  let definition = createWorkspaceTextSection();

  function SectionHarness() {
    const section = useWorkspaceDocument((state) => state.sections[SECTION_ID]);
    if (!section) {
      return null;
    }
    return createElement(
      "div",
      null,
      createElement(SectionHeader, { sectionId: SECTION_ID, hasSectionStyleTheme: false }),
      definition.renderContent(section) as ReactNode,
    );
  }

  beforeEach(() => {
    definition = createWorkspaceTextSection();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setClipboard(undefined);
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useWorkspaceAppearance.getState().reset();
    useResizeEvent.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(section: WorkspaceSectionInput = makeTextSection()) {
    registerSectionKinds({ [WORKSPACE_TEXT_SECTION_KIND]: definition });
    loadWorkspaceDocument(makeDocument(section));
    await act(async () => {
      root.render(createElement(SectionHarness));
    });
  }

  function getView(): EditorView {
    const editorDom = host.querySelector<HTMLElement>(".cm-editor");
    const view = editorDom ? EditorView.findFromDOM(editorDom) : null;
    if (!view) {
      throw new Error("The text section editor is not mounted.");
    }
    return view;
  }

  function getSectionData(): WorkspaceTextSectionData {
    return getWorkspaceDocument().sections[SECTION_ID]?.data as WorkspaceTextSectionData;
  }

  // jsdom implements no clipboard, so the copy affordance's two outcomes are driven from here.
  function setClipboard(clipboard: { writeText: (value: string) => Promise<void> } | undefined) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
      writable: true,
    });
  }

  function requireElement(selector: string): HTMLElement {
    const element = host.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`The rendered text section is missing ${selector}.`);
    }
    return element;
  }

  function getDisplayModeButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      "button[aria-label$='text'], " + "button[aria-label$='Markdown']",
    );
    if (!button) {
      throw new Error("The display-mode control is not mounted.");
    }
    return button;
  }

  it("edits plain text in the shared section editor and commits one mutation per edit", async () => {
    const onDocumentChange = vi.fn();
    await mount();
    const wrapper = host.querySelector<HTMLElement>("article");
    expect(wrapper?.getAttribute("aria-label")).toBe("Notes text editor");
    for (const expectedClass of ["nopan", "nodrag", "setta-prevent-section-active-css"]) {
      expect(wrapper?.classList.contains(expectedClass)).toBe(true);
    }
    const view = getView();
    // Prose wraps and needs no authored column, exactly as the reference's in-section editor does.
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    expect(view.state.tabSize).toBe(4);

    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await act(async () => {
      view.dispatch({ changes: { from: 5, insert: "!" } });
    });
    expect(getSectionData().text).toBe("alpha!\nbeta\n");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    // The commit never replaces the editor's own document, so the caret survives the round trip.
    expect(getView()).toBe(view);
  });

  it("renders authored whitespace as plain text without a Markdown surface", async () => {
    await mount(makeTextSection({ displayMode: "render", text: "alpha\n  indented" }));
    const block = host.querySelector("pre");
    expect(block?.textContent).toBe("alpha\n  indented");
    expect(host.querySelector(".setta-prose")).toBeNull();
  });

  it("renders the reference's Markdown vocabulary", async () => {
    await mount(
      makeTextSection({
        displayMode: "render",
        format: "markdown",
        text: [
          "# Heading",
          "",
          "A [link](https://example.com) and `inline` code.",
          "",
          "- [x] done",
          "- [ ] todo",
          "",
          "| a | b |",
          "| - | - |",
          "| 1 | 2 |",
          "",
          "$E = mc^2$",
          "",
          "```python",
          "alpha = 1",
          "```",
        ].join("\n"),
      }),
    );
    const surface = requireElement(".setta-prose");
    expect(surface.querySelector("h1")?.textContent).toBe("Heading");
    expect(surface.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(surface.querySelector("table td")?.textContent).toBe("1");
    expect(surface.querySelectorAll("input[type='checkbox']")).toHaveLength(2);
    expect(surface.querySelector(".katex")).not.toBeNull();
  });

  it("paints inline code as a chip and a fence as a highlighted code block", async () => {
    await mount(
      makeTextSection({
        displayMode: "render",
        format: "markdown",
        text: "Run `train` first.\n\n```python\nalpha = 1\n```\n",
      }),
    );
    expect(requireElement("[data-setta-inline-code]").textContent).toBe("train");
    const codeBlock = requireElement("[data-setta-workspace-code-block]");
    expect(codeBlock.textContent).toContain("alpha = 1");
    // The parser's trailing newline is not a blank line the reader authored.
    expect(codeBlock.querySelectorAll(".cm-line")).toHaveLength(1);
    expect(codeBlock.querySelector("button[aria-label='Copy code']")).not.toBeNull();
  });

  it("copies a fence, and reports nothing copied when the browser refuses", async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve());
    setClipboard({ writeText });
    await mount(
      makeTextSection({
        displayMode: "render",
        format: "markdown",
        text: "```python\nalpha = 1\n```\n",
      }),
    );
    await act(async () => {
      requireElement("button[aria-label='Copy code']").click();
    });
    expect(writeText).toHaveBeenCalledWith("alpha = 1");
    expect(requireElement("button[aria-label='Code copied']")).not.toBeNull();

    // A refused write and a browser with no clipboard both leave the affordance saying the copy
    // did not happen, rather than raising out of the click.
    writeText.mockImplementation(() => Promise.reject(new Error("denied")));
    await act(async () => {
      requireElement("button[aria-label='Code copied']").click();
    });
    expect(requireElement("button[aria-label='Copy code']")).not.toBeNull();

    setClipboard(undefined);
    await act(async () => {
      requireElement("button[aria-label='Copy code']").click();
    });
    expect(requireElement("button[aria-label='Copy code']")).not.toBeNull();
  });

  it("keeps a paragraph that begins with inline code inline", async () => {
    await mount(
      makeTextSection({ displayMode: "render", format: "markdown", text: "`alpha` starts here" }),
    );
    expect(host.querySelector("[data-setta-inline-code]")?.textContent).toBe("alpha");
    expect(host.querySelector("[data-setta-workspace-code-block]")).toBeNull();
  });

  it("renders no raw HTML", async () => {
    await mount(
      makeTextSection({
        displayMode: "render",
        format: "markdown",
        text: "<button id='injected'>press</button>",
      }),
    );
    expect(host.querySelector("#injected")).toBeNull();
    expect(host.textContent).toContain("<button id='injected'>press</button>");
  });

  it("swaps the surface from the header control without rewriting the text", async () => {
    const onDocumentChange = vi.fn();
    await mount(makeTextSection({ format: "markdown", text: "# Heading" }));
    expect(getView().state.doc.toString()).toBe("# Heading");
    const button = getDisplayModeButton();
    expect(button.getAttribute("aria-label")).toBe("Render Markdown");

    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await act(async () => {
      button.click();
    });
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(getSectionData()).toMatchObject({ displayMode: "render", text: "# Heading" });
    expect(host.querySelector(".setta-prose h1")?.textContent).toBe("Heading");
    expect(getDisplayModeButton().getAttribute("aria-label")).toBe("Edit Markdown");

    await act(async () => {
      getDisplayModeButton().click();
    });
    expect(getSectionData()).toMatchObject({ displayMode: "edit", text: "# Heading" });
    expect(getView().state.doc.toString()).toBe("# Heading");
  });

  it("makes a locked or read-only section read-only and refuses its control", async () => {
    await mount(makeTextSection({}, { positionAndSizeLocked: true }));
    expect(getView().state.readOnly).toBe(true);
    // Selection and scrolling survive; only mutation is refused.
    expect(getView().contentDOM.getAttribute("contenteditable")).toBe("true");
    expect(getDisplayModeButton().disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    useWorkspaceDocument.getState().reset();
    await mount(makeTextSection({ readOnly: true }));
    expect(getView().state.readOnly).toBe(true);
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await act(async () => {
      getView().dispatch({ changes: { from: 0, insert: "#" } });
    });
    expect(getSectionData().text).toBe("alpha\nbeta\n");
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("scales the rendered surface from the authored font size", async () => {
    await mount(makeTextSection({ displayMode: "render", format: "markdown", fontSizePx: 20 }));
    const surface = host.querySelector<HTMLElement>(".setta-prose")?.parentElement;
    expect(surface?.style.getPropertyValue("--setta-workspace-text-body-size")).toBe("20px");
    expect(surface?.style.getPropertyValue("--setta-workspace-text-h1-size")).toBe("40px");
  });

  it("repaints when a host writes the typed section data", async () => {
    await mount();
    await act(async () => {
      setWorkspaceTextSectionData(SECTION_ID, {
        ...getSectionData(),
        format: "markdown",
        text: "## Rewritten",
      });
    });
    expect(getView().state.doc.toString()).toBe("## Rewritten");
    expect(getSectionData().format).toBe("markdown");
  });
});
