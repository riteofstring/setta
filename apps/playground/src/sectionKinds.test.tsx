/* @vitest-environment jsdom */

import { loadWorkspaceDocument, type WorkspaceSection } from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import { ItemListSectionBody, registerPlaygroundSectionKinds } from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The host-owned presentation regression from the Phase 4 presentation-parity correction: the
// package leaves opaque item contents to this renderer, so the reference's label and value
// roles — 12/16 px semibold sans-serif labels in setta-800/200 with the reference padding,
// 12/16 px medium monospace tabular values, the subtle value-column divider, and the default
// half-width column split through `--param-column-width` — are this host's contract, frozen
// here as literal expectations independent of the renderer's constants.

const REFERENCE_LABEL_CLASS_NAME =
  "truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200";
const REFERENCE_VALUE_CLASS_NAME =
  "section-value self-end break-words py-[.125rem] font-mono text-xs font-medium tabular-nums text-setta-800 dark:text-setta-300";
const REFERENCE_VALUE_DIVIDER_CLASS_NAME =
  "section-value self-end border-b border-setta-200/50 dark:border-setta-600/30";

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
  return { ...input, size: { width: 552, height: 352 } };
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

  it("renders leaf rows with the reference label, value, and divider treatments", () => {
    const leafRow = findRowByLabel(container, "alpha");
    const label = leafRow.querySelector<HTMLElement>(".section-key > p");
    const value = leafRow.querySelector<HTMLElement>("p.section-value");
    const divider = leafRow.querySelector<HTMLElement>("span.section-value");
    if (!label || !value || !divider) {
      throw new Error("The leaf row is missing its label, value, or divider element.");
    }
    expect(label.className).toBe(REFERENCE_LABEL_CLASS_NAME);
    expect(value.className).toBe(REFERENCE_VALUE_CLASS_NAME);
    expect(value.textContent).toBe("0.001");
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
    // The recorded 552 x 352 authored geometry leaves 550 px inside the shell's 1 px borders;
    // the reference default is half that minus the 18 px center offset: 257 px.
    Object.defineProperty(listArea, "clientWidth", { configurable: true, value: 550 });
    act(() => {
      applySplit([], new CapturingResizeObserver(applySplit) as unknown as ResizeObserver);
    });
    expect(listArea.style.getPropertyValue("--param-column-width")).toBe("257px");
  });

  it("keeps the recorded fixture geometry and an inspectable row rhythm", () => {
    expect(playgroundDocument.topLevelSections["item-panel"]).toEqual({
      x: 600,
      y: 216,
      w: 552,
      h: 352,
      zIndex: 4,
    });
    const itemTree = getItemPanelSection().itemTree;
    if (!itemTree) {
      throw new Error("The item panel section is missing its item tree.");
    }
    const topLevelIds = itemTree.items[itemTree.rootId]?.children ?? [];
    expect(topLevelIds.length).toBeGreaterThanOrEqual(10);
    expect(itemTree.items["item-options"]?.children.length).toBeGreaterThanOrEqual(2);
  });
});
