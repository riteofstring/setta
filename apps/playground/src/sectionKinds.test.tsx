/* @vitest-environment jsdom */

import {
  getWorkspaceDocument,
  loadWorkspaceDocument,
  setItemData,
  type ItemRowRenderContext,
  type WorkspaceSection,
} from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import {
  commitPlaygroundItemNameProposal,
  ItemListSectionBody,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The host-owned presentation regression from the Phase 4 presentation-parity correction,
// amended by the item-controls milestone: labels stay this host's contract (12/16 px semibold
// sans-serif in setta-800/200 with the reference padding), while the value role now mounts
// the package's built-in controls chosen by this host's opaque `control` field — the two-layer
// text value editor (the default; the Lezer-highlighted idle dummy at the reference's
// monospace treatment plus the value-column divider with its focus paint, at the reference
// settings surface's python language), the boolean switch, the dropdown pill over this host's
// flat choices, the slider and rotary over opaque numeric configuration, and the color picker in
// both its configured-choices and native-input forms, plus the editable `rename_me` name seam.
// Every accepted control edit commits back through the host's `setItemData` funnel into the
// canonical document; duplicate-name proposals stay blocked by this host and ride the package's
// captured error presentation.

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

// Reads a committed value back out of the canonical document's opaque item data.
function getDocumentItemValue(itemId: string): string | undefined {
  const itemTree = getWorkspaceDocument().sections["item-panel"]?.itemTree;
  const data = itemTree?.items[itemId]?.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Item ${itemId} lost its row data.`);
  }
  const value = data["value"];
  return typeof value === "string" ? value : undefined;
}

function getDocumentItemLabel(itemId: string): string | undefined {
  const itemTree = getWorkspaceDocument().sections["item-panel"]?.itemTree;
  const data = itemTree?.items[itemId]?.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Item ${itemId} lost its row data.`);
  }
  const label = data["label"];
  return typeof label === "string" ? label : undefined;
}

function getItemRowContext(itemId: string): ItemRowRenderContext {
  const item = getWorkspaceDocument().sections["item-panel"]?.itemTree?.items[itemId];
  if (!item) {
    throw new Error(`Item ${itemId} is missing from the playground document.`);
  }
  return { sectionId: "item-panel", listKey: "main", item, isSelected: false };
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

  it("renders switch rows with the built-in switch and commits toggles to the document", () => {
    const switchRow = findRowByLabel(container, "enabled");
    const wrapper = switchRow.querySelector<HTMLElement>("div.section-value");
    expect(wrapper?.className).toBe("section-value flex justify-self-start self-center");
    const switchButton = switchRow.querySelector<HTMLButtonElement>('button[role="switch"]');
    if (!switchButton) {
      throw new Error("The enabled row does not mount the switch control.");
    }
    expect(switchButton.dataset.state).toBe("checked");
    act(() => {
      switchButton.click();
    });
    // The host funnel committed the stringified boolean into the canonical opaque data, and
    // the re-rendered control reflects it.
    expect(getDocumentItemValue("item-enabled")).toBe("false");
    expect(switchRow.querySelector<HTMLButtonElement>('button[role="switch"]')?.dataset.state).toBe(
      "unchecked",
    );
  });

  it("renders the slider row with opaque limits and commits keyboard stepping", () => {
    const sliderRow = findRowByLabel(container, "slider");
    const thumb = sliderRow.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) {
      throw new Error("The slider row does not mount the slider control.");
    }
    expect(thumb.getAttribute("aria-label")).toBe("slider value");
    expect(thumb.getAttribute("aria-valuemin")).toBe("0");
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");
    expect(thumb.getAttribute("aria-valuenow")).toBe("0");
    act(() => {
      thumb.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(getDocumentItemValue("item-slider")).toBe("1");
    expect(sliderRow.querySelector('[role="slider"]')?.getAttribute("aria-valuenow")).toBe("1");
  });

  it("renders the rotary row with opaque limits and commits step-aware keyboard updates", () => {
    const rotaryRow = findRowByLabel(container, "rotary");
    const knob = rotaryRow.querySelector<HTMLButtonElement>('button[role="slider"]');
    if (!knob) {
      throw new Error("The rotary row does not mount the rotary control.");
    }
    expect(knob.getAttribute("aria-label")).toBe("rotary value");
    expect(knob.getAttribute("aria-valuemin")).toBe("0");
    expect(knob.getAttribute("aria-valuemax")).toBe("1");
    expect(knob.getAttribute("aria-valuenow")).toBe("0");
    act(() => {
      knob.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(getDocumentItemValue("item-rotary")).toBe("0.1");
    expect(rotaryRow.querySelector('button[role="slider"]')?.getAttribute("aria-valuenow")).toBe(
      "0.1",
    );
  });

  it("renders the dropdown row as the reference pill and commits a selection to the document", () => {
    const dropdownRow = findRowByLabel(container, "choice");
    const input = dropdownRow.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (!input) {
      throw new Error("The choice row does not mount the dropdown control.");
    }
    // The captured fixture's empty dropdown: the recorded pill presentation behind the
    // reference "Search" placeholder, wrapped in the no-drag search shell.
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Search");
    for (const pillClass of ["rounded-full", "font-mono", "text-xs", "pl-3", "pr-6", "h-4"]) {
      expect(input.classList.contains(pillClass)).toBe(true);
    }
    expect(input.closest("search")?.classList.contains("nodrag")).toBe(true);
    const toggle = dropdownRow.querySelector<HTMLButtonElement>("search button");
    if (!toggle) {
      throw new Error("The choice row does not mount the dropdown toggle.");
    }
    act(() => {
      toggle.click();
    });
    const options = Array.from(document.body.querySelectorAll('[role="listbox"] dd'));
    expect(options.map((option) => option.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    const gamma = options.find((option) => option.textContent === "Gamma");
    act(() => {
      gamma?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The host funnel committed the picked choice string into the canonical opaque data, and
    // the re-rendered pill reflects it.
    expect(getDocumentItemValue("item-choice")).toBe("Gamma");
    expect(dropdownRow.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toBe(
      "Gamma",
    );
  });

  it("renders the configured color row with the reference trigger presentation", () => {
    const colorRow = findRowByLabel(container, "accent");
    const trigger = colorRow.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    if (!trigger) {
      throw new Error("The accent row does not mount the configured color trigger.");
    }
    const swatch = trigger.querySelector<HTMLElement>("div.single-cell-child.rounded-lg");
    expect(swatch?.style.backgroundColor).toBe("rgb(34, 197, 94)");
    expect(trigger.querySelector("p")?.textContent).toBe("Green");
    expect(trigger.querySelector("i.gg-chevron-down")).not.toBeNull();
  });

  it("renders the choiceless color row as the native input behind the eyedropper", () => {
    const colorRow = findRowByLabel(container, "tint");
    expect(colorRow.querySelector("i.gg-color-picker")).not.toBeNull();
    const input = colorRow.querySelector<HTMLInputElement>('input[type="color"]');
    if (!input) {
      throw new Error("The tint row does not mount the native color input.");
    }
    expect(input.id).toBe("item-panel-item-tint-ColorValueInput");
    expect(input.value).toBe("#afbacf");
  });

  it("renders the editable name seam and keeps duplicate-name validation host-owned", () => {
    const dummy = document.getElementById("ItemNameInput-item-panel-item-rename");
    if (!dummy) {
      throw new Error("The rename row does not mount the editable name control.");
    }
    expect(dummy.textContent).toBe("rename_me");
    for (const nameClass of [
      "section-key",
      "peer/nameinput",
      "font-mono",
      "text-xs",
      "py-[.125rem]",
    ]) {
      expect(dummy.classList.contains(nameClass)).toBe(true);
    }
    expect(dummy.querySelector(".cm-line span")?.className).toMatch(/ͼ/);

    const context = getItemRowContext("item-rename");
    const duplicateError = commitPlaygroundItemNameProposal(context, "enabled");
    expect(duplicateError).toBe('Param name "enabled" already exists under this parent.');
    expect(getDocumentItemLabel("item-rename")).toBe("rename_me");

    const validError = commitPlaygroundItemNameProposal(context, "renamed");
    expect(validError).toBe("");
    expect(getDocumentItemLabel("item-rename")).toBe("renamed");

    // A host-provided invalid controlled state drives the package error treatment independently
    // of the canonical-blocking assertion above.
    act(() => {
      const renamedItem =
        getWorkspaceDocument().sections["item-panel"]?.itemTree?.items["item-rename"];
      if (!renamedItem || renamedItem.data === null || typeof renamedItem.data !== "object") {
        throw new Error("The renamed item lost its opaque data.");
      }
      setItemData("item-panel", "item-rename", { ...renamedItem.data, label: "enabled" });
    });
    const invalidDummy = document.getElementById("ItemNameInput-item-panel-item-rename");
    expect(invalidDummy?.getAttribute("aria-invalid")).toBe("true");
    expect(invalidDummy?.classList.contains("text-red-500")).toBe(true);
    const bubble = document.getElementById("ItemNameError-item-panel-item-rename");
    expect(bubble?.textContent).toBe('Param name "enabled" already exists under this parent.');
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
