/* @vitest-environment jsdom */

import { loadWorkspaceDocument, type WorkspaceSection } from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import { ItemListSectionBody, registerPlaygroundSectionKinds } from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The host-owned presentation regression from the Phase 4 presentation-parity correction,
// amended by the item-controls milestone: labels stay this host's contract (12/16 px semibold
// sans-serif in setta-800/200 with the reference padding), while the value role now mounts
// the package's built-in text value editor — the Lezer-highlighted idle dummy at the
// reference's monospace treatment plus the value-column divider with its focus paint. The
// host wires the control to its opaque item data with the reference settings surface's
// python language, so the idle layer must highlight and carry the host-addressable dummy id.

const REFERENCE_LABEL_CLASS_NAME =
  "truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200";
const REFERENCE_VALUE_DUMMY_CLASSES = [
  "nopan",
  "nodrag",
  "section-value",
  "self-end",
  "peer/textinput",
  "cursor-text",
  "select-text",
  "break-words",
  "font-mono",
  "text-xs",
  "[tab-size:4]",
  "[word-break:break-word]",
  "py-[.125rem]",
];
const REFERENCE_VALUE_DIVIDER_CLASS_NAME =
  "section-value self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400";

// Live main's complete outer `/settings` Dict measurement and the package shell border that
// separates it from the inner surface the document and registered default describe.
const RECORDED_OUTER_DICT_WIDTH_PX = 552;
const RECORDED_OUTER_DICT_HEIGHT_PX = 352;
const SHELL_BORDER_WIDTH_PX = 1;

// Replaces the setup stub so the test can drive the host's resize-driven default split. The
// import-time observer inside the built package already constructed against the stub.
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

globalThis.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver;

function getItemPanelSection(): WorkspaceSection {
  const input = playgroundDocument.sections["item-panel"];
  if (!input) {
    throw new Error("The playground document lost its item panel section.");
  }
  return { ...input, size: { width: 550, height: 350 } };
}

function findRowByLabel(container: HTMLElement, label: string): HTMLElement {
  const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-item-row="true"]'));
  const row = rows.find((candidate) =>
    Array.from(candidate.querySelectorAll(":scope > * p, :scope > p")).some(
      (paragraph) => paragraph.textContent === label,
    ),
  );
  if (!row) {
    throw new Error(`No item row renders the label ${label}.`);
  }
  return row;
}

describe("the playground item renderer presentation contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    registerPlaygroundSectionKinds();
  });

  beforeEach(() => {
    loadWorkspaceDocument(playgroundDocument);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(ItemListSectionBody, { section: getItemPanelSection() }));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    observedResizeTargets.clear();
  });

  it("renders leaf rows with the reference label and the built-in text value control", () => {
    const leafRow = findRowByLabel(container, "alpha");
    const label = leafRow.querySelector<HTMLElement>(".section-key > p");
    const value = leafRow.querySelector<HTMLElement>('[role="textbox"]');
    const divider = leafRow.querySelector<HTMLElement>("span.section-value");
    if (!label || !value || !divider) {
      throw new Error("The leaf row is missing its label, value, or divider element.");
    }
    expect(label.className).toBe(REFERENCE_LABEL_CLASS_NAME);
    // The control's idle dummy layer carries the reference value treatment, the
    // host-addressable id, and the python Lezer highlight for the numeric value.
    expect(value.id).toBe("item-panel-item-alpha-ItemValueInput");
    expect(value.textContent).toBe("0.001");
    for (const dummyClass of REFERENCE_VALUE_DUMMY_CLASSES) {
      expect(value.classList.contains(dummyClass)).toBe(true);
    }
    expect(value.querySelector(".cm-line span")?.className).toMatch(/ͼ/);
    expect(divider.className).toBe(REFERENCE_VALUE_DIVIDER_CLASS_NAME);
  });

  it("renders group labels as direct children carrying the reference label treatment", () => {
    const groupRow = findRowByLabel(container, "options");
    // The package places direct <p> children across key..value through its compiled
    // `[&>p]:section-key-value` rule, so the label must stay a direct child.
    const groupLabel = Array.from(groupRow.children).find(
      (child) => child.tagName === "P" && child.textContent === "options",
    );
    if (!groupLabel) {
      throw new Error("The group row does not render its label as a direct child.");
    }
    expect(groupLabel.className).toBe(REFERENCE_LABEL_CLASS_NAME);
  });

  it("derives the default column split from half the list area width", () => {
    const listArea = container.querySelector<HTMLElement>(".section-full-no-title");
    if (!listArea) {
      throw new Error("The item panel did not mount its list area.");
    }
    const applySplit = observedResizeTargets.get(listArea);
    if (!applySplit) {
      throw new Error("The list area is not observed for resizes.");
    }
    // The 550 x 350 inner fixture gives the list area live main's measured 550 px width;
    // the reference default is half that minus the 18 px center offset: 257 px.
    Object.defineProperty(listArea, "clientWidth", { configurable: true, value: 550 });
    act(() => {
      applySplit([], new CapturingResizeObserver(applySplit) as unknown as ResizeObserver);
    });
    expect(listArea.style.getPropertyValue("--param-column-width")).toBe("257px");
  });

  it("keeps the recorded fixture geometry and an inspectable row rhythm", () => {
    const layout = playgroundDocument.topLevelSections["item-panel"];
    expect(layout).toEqual({ x: 600, y: 216, w: 550, h: 350, zIndex: 4 });
    // Document dimensions describe the inner section surface; the shell adds a 1 px border on
    // every side, so the fixture must render main's complete 552 x 352 outer Dict measurement
    // from the inner 550 x 350 — not by authoring the outer numbers directly.
    const outerWidth = (layout?.w ?? 0) + 2 * SHELL_BORDER_WIDTH_PX;
    const outerHeight = (layout?.h ?? 0) + 2 * SHELL_BORDER_WIDTH_PX;
    expect(outerWidth).toBe(RECORDED_OUTER_DICT_WIDTH_PX);
    expect(outerHeight).toBe(RECORDED_OUTER_DICT_HEIGHT_PX);
    const itemTree = getItemPanelSection().itemTree;
    if (!itemTree) {
      throw new Error("The item panel section is missing its item tree.");
    }
    const topLevelIds = itemTree.items[itemTree.rootId]?.children ?? [];
    expect(topLevelIds.length).toBeGreaterThanOrEqual(10);
    expect(itemTree.items["item-options"]?.children.length).toBeGreaterThanOrEqual(2);
  });
});
