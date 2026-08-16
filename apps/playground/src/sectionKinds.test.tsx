/* @vitest-environment jsdom */

import {
  deleteSelectedWorkspaceItems,
  getWorkspaceDocument,
  insertWorkspaceItem,
  loadWorkspaceDocument,
  setItemLabel,
  type WorkspaceSection,
} from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import {
  ItemListSectionBody,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The workspace-shell typed-item regression: the unrelated playground supplies serialized
// presentations and no row decoder. Package-owned labels and controls render directly, scalar
// edits commit through the dedicated funnels, and only dropzone side effects use host handlers.
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

// Replaces the setup stub so the test can drive the package's resize-driven default split. The
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

globalThis.ResizeObserver =
  CapturingResizeObserver as unknown as typeof ResizeObserver;

function getItemPanelSection(): WorkspaceSection {
  const input = playgroundDocument.sections["item-panel"];
  if (!input) {
    throw new Error("The playground document lost its item panel section.");
  }
  return { ...input, size: { width: 550, height: 350 } };
}

function getDocumentItemValue(itemId: string): string | undefined {
  const itemTree = getWorkspaceDocument().sections["item-panel"]?.itemTree;
  const control = itemTree?.items[itemId]?.presentation?.control;
  return control && control.kind !== "group" ? control.value : undefined;
}

function getDocumentItemLabel(itemId: string): string | undefined {
  return getWorkspaceDocument().sections["item-panel"]?.itemTree?.items[itemId]
    ?.presentation?.label;
}

function getDocumentDropzoneAttachmentNames(): Array<string> {
  const control =
    getWorkspaceDocument().sections["item-panel"]?.itemTree?.items[
      "item-dropzone"
    ]?.presentation?.control;
  if (!control || control.kind !== "dropzone") {
    throw new Error("The dropzone item lost its typed presentation.");
  }
  return control.configuration.attachments.map((attachment) => attachment.name);
}

function findRowByLabel(container: HTMLElement, label: string): HTMLElement {
  const items =
    getWorkspaceDocument().sections["item-panel"]?.itemTree?.items ?? {};
  const itemId = Object.values(items).find(
    (item) => item.presentation?.label === label,
  )?.id;
  const row = itemId
    ? document
        .getElementById(`ItemNameInput-item-panel-${itemId}`)
        ?.closest<HTMLElement>('[data-item-row="true"]')
    : null;
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
      root.render(
        createElement(ItemListSectionBody, { section: getItemPanelSection() }),
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    observedResizeTargets.clear();
    vi.restoreAllMocks();
  });

  it("renders typed rows without a host renderer", () => {
    const leafRow = findRowByLabel(container, "alpha");
    const label = document.getElementById(
      "ItemNameInput-item-panel-item-alpha",
    );
    const valueLayers =
      leafRow.querySelectorAll<HTMLElement>('[role="textbox"]');
    const valueEditor = valueLayers[1];
    const divider = leafRow.querySelector<HTMLElement>("span.section-value");
    if (!label || !valueEditor || !divider) {
      throw new Error(
        "The leaf row is missing its label, value, or divider element.",
      );
    }
    expect(label.parentElement?.classList.contains("section-key")).toBe(true);
    expect(label.classList.contains("font-mono")).toBe(true);
    expect(valueEditor.id).toBe("item-panel-item-alpha-ItemValueInput");
    expect(valueEditor.textContent).toBe("0.001");
    for (const dummyClass of REFERENCE_VALUE_DUMMY_CLASSES) {
      expect(valueEditor.classList.contains(dummyClass)).toBe(true);
    }
    expect(valueEditor.querySelector(".cm-line span")?.className).toMatch(/ͼ/);
    expect(divider.className).toBe(REFERENCE_VALUE_DIVIDER_CLASS_NAME);
  });

  it("demonstrates serialized parameter help through the public row surface", () => {
    const row = findRowByLabel(container, "alpha");
    expect(row.getAttribute("aria-keyshortcuts")).toContain("Q");
    expect(
      row.querySelector(
        '[data-setta-workspace-item-quick-info-description="true"]',
      )?.textContent,
    ).toContain("Sets the initial learning rate");
    expect(
      row.querySelector('[data-setta-workspace-item-help-trigger="true"]'),
    ).toBeNull();
  });

  it("demonstrates host-owned ephemeral diagnostics through the public list registry", () => {
    const errorRow = findRowByLabel(container, "alpha");
    const warningRow = findRowByLabel(container, "beta");
    const infoRow = findRowByLabel(container, "momentum");
    expect(errorRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("error");
    expect(warningRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe(
      "warning",
    );
    expect(infoRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("info");

    const errorMarker = errorRow.querySelector<HTMLElement>(
      '[data-setta-workspace-item-diagnostic-marker="true"]',
    );
    if (!errorMarker) {
      throw new Error(
        "The typed playground row is missing its diagnostic marker.",
      );
    }
    expect(errorMarker.dataset.settaWorkspaceItemDiagnosticSeverity).toBe(
      "error",
    );
    expect(
      errorRow.querySelector(
        '[data-setta-workspace-item-quick-info-description="true"]',
      )?.textContent,
    ).toContain("Error: Use 0.0005 or less for the stability profile.");
    expect(JSON.stringify(getWorkspaceDocument())).not.toContain(
      "stability profile",
    );
  });

  it("renders switch rows with the built-in switch and commits toggles to the document", () => {
    const switchRow = findRowByLabel(container, "enabled");
    const wrapper = switchRow.querySelector<HTMLElement>("div.section-value");
    expect(wrapper?.className).toBe(
      "section-value flex justify-self-start self-center",
    );
    const switchButton = switchRow.querySelector<HTMLButtonElement>(
      'button[role="switch"]',
    );
    if (!switchButton) {
      throw new Error("The enabled row does not mount the switch control.");
    }
    expect(switchButton.dataset.state).toBe("checked");
    act(() => {
      switchButton.click();
    });
    // The package value funnel committed one canonical string update and re-rendered the control.
    expect(getDocumentItemValue("item-enabled")).toBe("false");
    expect(
      switchRow.querySelector<HTMLButtonElement>('button[role="switch"]')
        ?.dataset.state,
    ).toBe("unchecked");
  });

  it("renders the slider row from typed limits and commits keyboard stepping", () => {
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
    expect(
      sliderRow.querySelector('[role="slider"]')?.getAttribute("aria-valuenow"),
    ).toBe("1");
  });

  it("renders the rotary row from typed limits and commits step-aware keyboard updates", () => {
    const rotaryRow = findRowByLabel(container, "rotary");
    const knob = rotaryRow.querySelector<HTMLButtonElement>(
      'button[role="slider"]',
    );
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
    expect(
      rotaryRow
        .querySelector('button[role="slider"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("0.1");
  });

  it("renders the date row from typed formatting config and commits ISO string updates", () => {
    const dateRow = findRowByLabel(container, "date");
    const input = dateRow.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) {
      throw new Error(
        "The date row does not mount its configured input control.",
      );
    }
    expect(input.getAttribute("aria-label")).toBe("date value");
    expect(input.value).toBe("2026-08-12");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    act(() => {
      valueSetter.call(input, "2026-08-13");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getDocumentItemValue("item-date")).toBe("2026-08-13");
  });

  it("renders the time row from typed display config and commits 24-hour strings", () => {
    const timeRow = findRowByLabel(container, "time");
    const input = timeRow.querySelector<HTMLInputElement>('input[type="time"]');
    if (!input) {
      throw new Error(
        "The time row does not mount its configured input control.",
      );
    }
    expect(input.getAttribute("aria-label")).toBe("time value");
    expect(input.value).toBe("13:45");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    act(() => {
      valueSetter.call(input, "14:30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getDocumentItemValue("item-time")).toBe("14:30");
  });

  it("renders the password row and keeps visibility separate from the controlled value", () => {
    const passwordRow = findRowByLabel(container, "password");
    const input = passwordRow.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    const toggle = passwordRow.querySelector<HTMLButtonElement>(
      'button[aria-label="Show password"]',
    );
    if (!input || !toggle) {
      throw new Error(
        "The password row does not mount its input and visibility toggle.",
      );
    }
    expect(input.id).toBe("item-panel-item-password-PasswordValueInput");
    expect(input.getAttribute("aria-label")).toBe("password value");
    act(() => toggle.click());
    expect(
      passwordRow.querySelector<HTMLInputElement>('input[type="text"]'),
    ).not.toBeNull();
    expect(getDocumentItemValue("item-password")).toBe("");
  });

  it("renders the multiline row through the wrapped text editor path", () => {
    const textAreaRow = findRowByLabel(container, "textarea");
    const dummy = textAreaRow.querySelector<HTMLElement>(
      "#item-panel-item-textarea-ItemValueInput",
    );
    if (!dummy) {
      throw new Error("The textarea row does not mount the idle text editor.");
    }
    expect(dummy.id).toBe("item-panel-item-textarea-ItemValueInput");
    expect(dummy.getAttribute("aria-label")).toBe("textarea value");
    expect(dummy.style.whiteSpace).toBe("break-spaces");
    expect(dummy.classList.contains("break-words")).toBe(true);
  });

  it("renders the dropzone and keeps accepted files, server picks, and removal host-owned", () => {
    const dropzoneRow = findRowByLabel(container, "dropzone");
    const target = dropzoneRow.querySelector<HTMLElement>('[role="group"]');
    const fileInput =
      dropzoneRow.querySelector<HTMLInputElement>('input[type="file"]');
    if (!target || !fileInput) {
      throw new Error(
        "The dropzone row does not mount its drop target and file input.",
      );
    }
    expect(target.getAttribute("aria-label")).toBe(
      "dropzone dropzone: Drop a file here",
    );
    expect(target.classList.contains("border-dashed")).toBe(true);
    expect(dropzoneRow.textContent).toContain("Local file...");
    expect(dropzoneRow.textContent).toContain("Server file...");
    const file = new File(["png!"], "photo.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    act(() => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    expect(getDocumentDropzoneAttachmentNames()).toEqual(["photo.png"]);
    expect(dropzoneRow.textContent).toContain("1 attachment");

    const removeLocal = dropzoneRow.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete photo.png"]',
    );
    act(() => removeLocal?.click());
    expect(getDocumentDropzoneAttachmentNames()).toEqual([]);

    const serverButton = Array.from(
      dropzoneRow.querySelectorAll("button"),
    ).find((button) => button.textContent === "Server file...");
    act(() => serverButton?.click());
    expect(getDocumentDropzoneAttachmentNames()).toEqual([
      "server-example.csv",
    ]);
  });

  it("renders the dropdown row as the reference pill and commits a selection to the document", () => {
    const dropdownRow = findRowByLabel(container, "choice");
    const input = dropdownRow.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );
    if (!input) {
      throw new Error("The choice row does not mount the dropdown control.");
    }
    // The captured fixture's empty dropdown: the recorded pill presentation behind the
    // reference "Search" placeholder, wrapped in the no-drag search shell.
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Search");
    for (const pillClass of [
      "rounded-full",
      "font-mono",
      "text-xs",
      "ps-3",
      "pe-6",
      "h-4",
    ]) {
      expect(input.classList.contains(pillClass)).toBe(true);
    }
    expect(input.closest("search")?.classList.contains("nodrag")).toBe(true);
    const toggle =
      dropdownRow.querySelector<HTMLButtonElement>("search button");
    if (!toggle) {
      throw new Error("The choice row does not mount the dropdown toggle.");
    }
    act(() => {
      toggle.click();
    });
    const options = Array.from(
      document.body.querySelectorAll('[role="listbox"] dd'),
    );
    expect(options.map((option) => option.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    const gamma = options.find((option) => option.textContent === "Gamma");
    act(() => {
      gamma?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The package value funnel committed the picked choice and the re-rendered pill reflects it.
    expect(getDocumentItemValue("item-choice")).toBe("Gamma");
    expect(
      dropdownRow.querySelector<HTMLInputElement>('input[role="combobox"]')
        ?.value,
    ).toBe("Gamma");
  });

  it("renders the configured color row with the reference trigger presentation", () => {
    const colorRow = findRowByLabel(container, "accent");
    const trigger = colorRow.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]',
    );
    if (!trigger) {
      throw new Error(
        "The accent row does not mount the configured color trigger.",
      );
    }
    const swatch = trigger.querySelector<HTMLElement>(
      "div.single-cell-child.rounded-lg",
    );
    expect(swatch?.style.backgroundColor).toBe("rgb(34, 197, 94)");
    expect(trigger.querySelector("p")?.textContent).toBe("Green");
    expect(trigger.querySelector("i.gg-chevron-down")).not.toBeNull();
  });

  it("renders the choiceless color row as the native input behind the eyedropper", () => {
    const colorRow = findRowByLabel(container, "tint");
    expect(colorRow.querySelector("i.gg-color-picker")).not.toBeNull();
    const input = colorRow.querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
    if (!input) {
      throw new Error("The tint row does not mount the native color input.");
    }
    expect(input.id).toBe("item-panel-item-tint-ColorValueInput");
    expect(input.value).toBe("#afbacf");
  });

  it("renders package-owned editable labels and commits through the label funnel", () => {
    const dummy = document.getElementById(
      "ItemNameInput-item-panel-item-rename",
    );
    if (!dummy) {
      throw new Error(
        "The rename row does not mount the editable name control.",
      );
    }
    expect(dummy.textContent).toBe("rename_me");
    expect(dummy.parentElement?.classList.contains("section-key")).toBe(true);
    for (const nameClass of [
      "peer/nameinput",
      "font-mono",
      "text-xs",
      "py-[.125rem]",
    ]) {
      expect(dummy.classList.contains(nameClass)).toBe(true);
    }
    expect(dummy.querySelector(".cm-line span")?.className).toMatch(/ͼ/);

    act(() => setItemLabel("item-panel", "item-rename", "renamed"));
    expect(getDocumentItemLabel("item-rename")).toBe("renamed");
    expect(
      document.getElementById("ItemNameInput-item-panel-item-rename")
        ?.textContent,
    ).toBe("renamed");
  });

  it("renders explicit groups with an editable spanning label", () => {
    const groupRow = findRowByLabel(container, "options");
    const groupLabel = document.getElementById(
      "ItemNameInput-item-panel-item-options",
    );
    if (!groupLabel) {
      throw new Error("The group row does not render its built-in label.");
    }
    expect(groupLabel.parentElement?.parentElement).toBe(groupRow);
    expect(
      groupLabel.parentElement?.classList.contains("section-key-value"),
    ).toBe(true);
    expect(groupLabel.getAttribute("aria-label")).toBe("Item name");
  });

  it("includes static-name fixtures without name-editor tab stops", () => {
    for (const [itemId, label] of [
      ["item-delta", "delta"],
      ["item-iota", "iota"],
    ] as const) {
      const row = container.querySelector<HTMLElement>(
        `[data-workspace-item-id="${itemId}"]`,
      );
      const staticLabel = row?.querySelector<HTMLElement>(
        '[data-workspace-static-item-label="true"]',
      );
      expect(staticLabel?.textContent).toBe(label);
      expect(staticLabel?.hasAttribute("tabindex")).toBe(false);
      expect(
        document.getElementById(`ItemNameInput-item-panel-${itemId}`),
      ).toBeNull();
      expect(
        row?.querySelector(`[aria-label="${label} value"]`),
      ).not.toBeNull();
    }
  });

  it("lets the package derive the default split from half the list area width", () => {
    const scrollArea =
      container.querySelector<HTMLElement>(".overflow-y-scroll");
    const listOuter = scrollArea?.parentElement;
    if (!listOuter) {
      throw new Error(
        "The item panel did not mount its package-owned list outer.",
      );
    }
    const applySplit = observedResizeTargets.get(listOuter);
    if (!applySplit) {
      throw new Error(
        "The package-owned list outer is not observed for resizes.",
      );
    }
    // The 550 x 350 inner fixture gives the list area live main's measured 550 px width;
    // the reference default is half that minus the 18 px center offset: 257 px.
    Object.defineProperty(listOuter, "clientWidth", {
      configurable: true,
      value: 550,
    });
    act(() => {
      applySplit(
        [
          {
            target: listOuter,
            borderBoxSize: [],
            contentRect: { width: 550 },
          } as unknown as ResizeObserverEntry,
        ],
        new CapturingResizeObserver(applySplit) as unknown as ResizeObserver,
      );
    });
    expect(listOuter.style.getPropertyValue("--param-column-width")).toBe(
      "257px",
    );
    expect(
      container.querySelectorAll('[data-item-column-resize-handle="true"]'),
    ).toHaveLength(container.querySelectorAll('[data-item-row="true"]').length);
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
    expect(
      itemTree.items["item-options"]?.children.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("supplies stable Python defaults through the public host item factory", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000123",
    );

    const insertedItems: Array<ReturnType<typeof insertWorkspaceItem>> = [];
    act(() => {
      insertedItems.push(insertWorkspaceItem("item-panel"));
    });
    const inserted = insertedItems[0];
    if (!inserted) {
      throw new Error(
        "The playground item factory did not return its inserted item.",
      );
    }

    expect(inserted).toEqual({
      id: "item-00000000-0000-4000-8000-000000000123",
      children: [],
      presentation: {
        label: "parameter",
        labelEditable: true,
        control: {
          kind: "code",
          value: "",
          configuration: {
            autocomplete: "off",
            disabled: false,
            language: "python",
            placeholder: null,
            singleLine: false,
            wrapLines: true,
          },
        },
      },
    });
    expect(
      getWorkspaceDocument().sections["item-panel"]?.itemTree?.selectedItemIds,
    ).toEqual([inserted.id]);

    let deletedItemIds: Array<string> = [];
    act(() => {
      deletedItemIds = deleteSelectedWorkspaceItems("item-panel");
    });
    expect(deletedItemIds).toEqual([inserted.id]);
    const itemTree = getWorkspaceDocument().sections["item-panel"]?.itemTree;
    expect(itemTree?.items[inserted.id]).toBeUndefined();
    expect(itemTree?.selectedItemIds).toEqual(["item-rename"]);
  });
});
