/* @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import {
  registerSectionKinds,
  type WorkspaceInspectorContributionContext,
} from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceItemControlPresentation,
  WorkspaceSectionInput,
} from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import {
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  type WorkspaceSectionTagColorPalette,
} from "../section/sectionTagColors";
import { WorkspaceInspector } from "./WorkspaceInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 240, height: 120 },
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

function makeItemSection(
  control: WorkspaceItemControlPresentation,
  selectedItemIds: Array<string> = ["value"],
  helpText?: string,
): WorkspaceSectionInput {
  return makeSection("items", {
    name: "Items",
    itemTree: {
      rootId: "root",
      items: {
        root: { id: "root", children: ["value", "other"] },
        value: {
          id: "value",
          children: [],
          presentation: {
            label: "Amount",
            ...(helpText === undefined ? {} : { helpText }),
            control,
          },
        },
        other: {
          id: "other",
          children: [],
          presentation: {
            label: "Other",
            control: {
              kind: "text",
              value: "other",
              configuration: {
                autocomplete: "off",
                disabled: false,
                placeholder: null,
                singleLine: true,
                wrapLines: true,
              },
            },
          },
        },
      },
      selectedItemIds,
    },
  });
}

function createDocument(
  activeIds: Array<string>,
  overrides: Record<string, WorkspaceSectionInput> = {},
): WorkspaceDocumentInput {
  const sections = {
    alpha: makeSection("alpha", { name: "Alpha" }),
    bravo: makeSection("bravo", {
      name: "Bravo",
      positionAndSizeLocked: true,
    }),
    ...overrides,
  };
  return {
    sections,
    topLevelSections: Object.fromEntries(
      Object.keys(sections).map((sectionId, index) => [
        sectionId,
        { x: index * 200, y: index * 50, w: 240, h: 120, zIndex: index },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
  };
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Expected a native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLabeledControl<T extends HTMLElement>(host: HTMLElement, labelText: string): T {
  const label = [...host.querySelectorAll("label")].find(
    (candidate) => candidate.textContent?.trim() === labelText,
  );
  if (!label) {
    throw new Error(`Expected Inspector label ${labelText}.`);
  }
  const control = label.htmlFor
    ? host.querySelector<HTMLElement>(`#${label.htmlFor}`)
    : label.querySelector<HTMLElement>("input, select, textarea");
  if (!control) {
    throw new Error(`Expected control for Inspector label ${labelText}.`);
  }
  return control as T;
}

function getButton(host: HTMLElement, text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Expected Inspector button ${text}.`);
  }
  return button;
}

function createHelpItemDocument(helpText: string): WorkspaceDocumentInput {
  return createDocument(["items"], {
    items: makeItemSection(
      {
        kind: "switch",
        value: "true",
        configuration: { disabled: false },
      },
      ["value"],
      helpText,
    ),
  });
}

function getStoredItemPresentation() {
  const presentation =
    useWorkspaceDocument.getState().sections.items?.itemTree?.items.value?.presentation;
  if (!presentation) {
    throw new Error("Expected the Inspector fixture's typed item presentation.");
  }
  return presentation;
}

function getInspectorStatus(host: HTMLElement): string {
  const status = host.querySelector(".setta-workspace-inspector-status");
  if (!status) {
    throw new Error("Expected the Inspector status region.");
  }
  return status.textContent ?? "";
}

function getAccessibleDescription(control: HTMLElement): string {
  const descriptionId = control.getAttribute("aria-describedby");
  const description = descriptionId ? document.getElementById(descriptionId) : null;
  if (!description) {
    throw new Error("Expected the Inspector control's accessible description.");
  }
  return description.textContent ?? "";
}

describe("WorkspaceInspector", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    registerSectionKinds({
      leaf: {
        renderContent: () => null,
        createItem: () => ({
          id: "created",
          children: [],
          presentation: {
            label: "Created",
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
        }),
      },
      custom: {
        renderContent: () => null,
        renderInspector: (context) => <button type="button">Host {context.type} inspector</button>,
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    useWorkspaceCapabilities.getState().reset();
    useItemSelectionMode.getState().reset();
    useSectionRefs.getState().reset();
    registerSectionKinds({});
    vi.restoreAllMocks();
  });

  async function renderInspector(
    document: WorkspaceDocumentInput,
    sectionTagColorPalette: WorkspaceSectionTagColorPalette = DEFAULT_SECTION_TAG_COLOR_PALETTE,
  ) {
    loadWorkspaceDocument(document);
    const initialFocusRef = createRef<HTMLElement>();
    await act(async () => {
      root.render(
        <WorkspaceInspector
          initialFocusRef={initialFocusRef}
          sectionTagColorPalette={sectionTagColorPalette}
        />,
      );
    });
    return initialFocusRef;
  }

  it("renders and focuses the reference empty state", async () => {
    const initialFocusRef = await renderInspector(createDocument([]));

    expect(host.textContent).toContain("Select A Section to Edit");
    expect(initialFocusRef.current?.getAttribute("aria-label")).toBe(
      "Workspace Inspector selection",
    );
  });

  it("keeps invalid section accents inside the pane and restores focus on Escape", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(createDocument(["alpha"]));
    const accent = getLabeledControl<HTMLInputElement>(host, "Style accent");

    await act(async () => {
      accent.focus();
      setInputValue(accent, "blue");
      accent.blur();
    });

    expect(accent.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("Enter a six-digit hex color");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      accent.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(accent.value).toBe("");
  });

  it("sets and resets a color tag from an explicit host palette with textual cues", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(createDocument(["alpha"]), [
      { color: "#123456", description: "Host slate" },
      { color: "#0f766e", description: "Host teal" },
    ]);
    const colorTag = getLabeledControl<HTMLSelectElement>(host, "Color tag");

    expect(Array.from(colorTag.options).map((option) => option.textContent)).toEqual([
      "None",
      "Host slate",
      "Host teal",
    ]);
    expect(host.textContent).toContain("None · no tag color");
    expect(colorTag.getAttribute("aria-describedby")).not.toBeNull();

    await act(async () => {
      colorTag.value = "#0f766e";
      colorTag.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useWorkspaceDocument.getState().sections["alpha"]?.tagColor).toBe("#0f766e");
    expect(host.textContent).toContain("Host teal · #0f766e");
    expect(onChange).toHaveBeenCalledOnce();
    expect(host.querySelector(".setta-workspace-inspector-status")?.textContent).toContain(
      "Section color tag set to Host teal (#0f766e)",
    );

    const reset = getButton(host, "Reset");
    expect(reset.getAttribute("aria-label")).toBe("Reset color tag to none");
    await act(async () => {
      reset.click();
    });

    expect(useWorkspaceDocument.getState().sections["alpha"]?.tagColor).toBeNull();
    expect(colorTag.value).toBe("");
    expect(reset.disabled).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("represents a valid out-of-palette color explicitly instead of falling back", async () => {
    await renderInspector(
      createDocument(["alpha"], {
        alpha: makeSection("alpha", { name: "Alpha", tagColor: "#abcdef" }),
      }),
      [{ color: "#123456", description: "Host slate" }],
    );

    const colorTag = getLabeledControl<HTMLSelectElement>(host, "Color tag");
    expect(colorTag.value).toBe("#abcdef");
    expect(Array.from(colorTag.options).map((option) => option.textContent)).toEqual([
      "None",
      "Custom (#abcdef)",
      "Host slate",
    ]);
    expect(host.textContent).toContain("Custom · #abcdef");
  });

  it("represents a document color when the host palette is empty", async () => {
    await renderInspector(
      createDocument(["alpha"], {
        alpha: makeSection("alpha", { name: "Alpha", tagColor: "#abcdef" }),
      }),
      [],
    );

    const colorTag = getLabeledControl<HTMLSelectElement>(host, "Color tag");
    expect(colorTag.value).toBe("#abcdef");
    expect(Array.from(colorTag.options).map((option) => option.textContent)).toEqual([
      "None",
      "Custom (#abcdef)",
    ]);
    expect(host.textContent).toContain("Custom · #abcdef");
  });

  it("omits the canvas-owned value editor while keeping Inspector configuration editable", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    useItemSelectionMode.setState({ isSelectingItems: true });
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection({
          kind: "slider",
          value: "5",
          configuration: { disabled: false, min: 0, max: 10, step: 1 },
        }),
      }),
    );
    const minimum = getLabeledControl<HTMLInputElement>(host, "min");
    const maximum = getLabeledControl<HTMLInputElement>(host, "max");
    const step = getLabeledControl<HTMLInputElement>(host, "step");
    expect(step.step).toBe("any");
    expect(host.querySelector('[data-inspector-focus-key="item-value"]')).toBeNull();
    expect(host.querySelector('[aria-label="Amount value numeric value"]')).toBeNull();
    expect(host.querySelector('[aria-label="Item name"]')?.hasAttribute("aria-disabled")).toBe(
      false,
    );
    expect(getLabeledControl<HTMLSelectElement>(host, "UI type").disabled).toBe(false);

    await act(async () => {
      minimum.focus();
      setInputValue(minimum, "10");
      minimum.blur();
    });

    expect(minimum.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("min must be less than max");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      minimum.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(minimum.getAttribute("aria-invalid")).toBeNull();

    await act(async () => {
      maximum.focus();
      setInputValue(maximum, "20");
      maximum.blur();
    });
    await act(async () => {
      minimum.focus();
      setInputValue(minimum, "10");
      minimum.blur();
    });
    await act(async () => {
      step.focus();
      setInputValue(step, "0.5");
      step.blur();
    });

    const control =
      useWorkspaceDocument.getState().sections["items"]?.itemTree?.items["value"]?.presentation
        ?.control;
    expect(control).toMatchObject({
      kind: "slider",
      configuration: { min: 10, max: 20, step: 0.5 },
    });
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(host.querySelector(".setta-workspace-inspector-status")?.textContent).toContain(
      "slider configuration updated",
    );
  });

  it("commits serializable item help from the labeled Inspector field", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(createHelpItemDocument("Controls whether retries are enabled."));
    const help = getLabeledControl<HTMLTextAreaElement>(host, "Help text");
    expect(help.value).toBe("Controls whether retries are enabled.");
    expect(getAccessibleDescription(help)).toContain("Shown from the parameter row");

    await act(async () => {
      help.focus();
      setInputValue(help, "Runs before each retry.\nUse a small value for tests.");
      help.blur();
    });

    expect(getStoredItemPresentation().helpText).toBe(
      "Runs before each retry.\nUse a small value for tests.",
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(getInspectorStatus(host)).toContain("Help text updated for Amount");
  });

  it("discards an escaped help draft and clears help with the textarea commit shortcut", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(createHelpItemDocument("Keep this committed help."));
    const help = getLabeledControl<HTMLTextAreaElement>(host, "Help text");

    await act(async () => {
      help.focus();
      setInputValue(help, "Discard this draft");
      help.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(getStoredItemPresentation().helpText).toBe("Keep this committed help.");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      help.focus();
      setInputValue(help, "   ");
      help.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: "Enter",
        }),
      );
    });

    expect(Object.hasOwn(getStoredItemPresentation(), "helpText")).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
    expect(getInspectorStatus(host)).toContain("Help text cleared for Amount");
  });

  it("keeps locked section sizing read-only until the section is unlocked", async () => {
    await renderInspector(createDocument(["bravo"]));

    expect(getLabeledControl<HTMLInputElement>(host, "Width").disabled).toBe(true);
    expect(getLabeledControl<HTMLInputElement>(host, "Height").disabled).toBe(true);
    expect(getButton(host, "Apply size").disabled).toBe(true);
    expect(getLabeledControl<HTMLSelectElement>(host, "Color tag").disabled).toBe(true);
    expect(getButton(host, "Reset").disabled).toBe(true);
  });

  it("resizes and resets group dimensions without disabling overflow", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["group"], {
        group: makeSection("group", {
          kind: "group",
          name: "Bounded group",
          overflowMode: true,
          size: { width: 360, height: 220 },
        }),
      }),
    );
    const width = getLabeledControl<HTMLInputElement>(host, "Width");
    const height = getLabeledControl<HTMLInputElement>(host, "Height");
    const overflow = getButton(host, "Bounded overflow");
    expect(overflow.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      setInputValue(width, "400");
      setInputValue(height, "260");
      getButton(host, "Apply size").click();
    });

    expect(useWorkspaceDocument.getState().sections["group"]?.size).toEqual({
      width: 400,
      height: 260,
    });
    expect(onChange).toHaveBeenCalledOnce();

    await act(async () => {
      setInputValue(width, "auto");
      setInputValue(height, "auto");
      getButton(host, "Apply size").click();
    });

    expect(width.hasAttribute("aria-invalid")).toBe(false);
    expect(height.hasAttribute("aria-invalid")).toBe(false);
    expect(useWorkspaceDocument.getState().sections["group"]?.size).toEqual({
      width: "auto",
      height: "auto",
    });
    expect(useWorkspaceDocument.getState().sections["group"]?.overflowMode).toBe(true);
    expect(overflow.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".setta-workspace-inspector-status")?.textContent).toContain(
      "Section size updated to auto by auto",
    );
    expect(onChange).toHaveBeenCalledTimes(2);

    await act(async () => {
      overflow.click();
    });
    expect(useWorkspaceDocument.getState().sections["group"]?.overflowMode).toBe(false);
    expect(overflow.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".setta-workspace-inspector-status")?.textContent).toContain(
      "Bounded overflow disabled",
    );
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("changes a typed item's UI type through one complete presentation mutation", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection({
          kind: "slider",
          value: "5",
          configuration: { disabled: false, min: 0, max: 10, step: 1 },
        }),
      }),
    );
    const uiType = getLabeledControl<HTMLSelectElement>(host, "UI type");

    await act(async () => {
      uiType.value = "rotary";
      uiType.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      useWorkspaceDocument.getState().sections["items"]?.itemTree?.items["value"]?.presentation
        ?.control,
    ).toEqual({
      kind: "rotary",
      value: "0",
      configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("shows an explicit multiple-item branch without guessed common editors", async () => {
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection(
          {
            kind: "slider",
            value: "5",
            configuration: { disabled: false, min: 0, max: 10, step: 1 },
          },
          ["value", "other"],
        ),
      }),
    );

    expect(host.textContent).toContain("2 items selected");
    expect(host.textContent).toContain(
      "Select one item to edit its label, UI type, and configuration.",
    );
    expect(host.querySelector('[aria-label="UI type"]')).toBeNull();
    expect(getButton(host, "Add parameter").disabled).toBe(false);
    expect(getButton(host, "Delete selected parameters").disabled).toBe(false);
  });

  it("disables parameter authoring and explains the locked section state", async () => {
    const itemSection = makeItemSection({
      kind: "slider",
      value: "5",
      configuration: { disabled: false, min: 0, max: 10, step: 1 },
    });
    await renderInspector(
      createDocument(["items"], {
        items: { ...itemSection, positionAndSizeLocked: true },
      }),
    );

    expect(getButton(host, "Add parameter").disabled).toBe(true);
    expect(getButton(host, "Delete parameter").disabled).toBe(true);
    expect(host.textContent).toContain("Unlock this section to add or delete parameters.");
  });

  it("deletes one selected parameter and preserves Inspector focus on the surviving branch", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection({
          kind: "slider",
          value: "5",
          configuration: { disabled: false, min: 0, max: 10, step: 1 },
        }),
      }),
    );
    const deleteParameter = getButton(host, "Delete parameter");
    deleteParameter.focus();

    await act(async () => deleteParameter.click());

    const itemTree = useWorkspaceDocument.getState().sections.items?.itemTree;
    expect(itemTree?.items.value).toBeUndefined();
    expect(itemTree?.selectedItemIds).toEqual(["other"]);
    expect(document.activeElement).toBe(getButton(host, "Add parameter"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("deletes a multi-selection and keeps the shared authoring actions focused", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection(
          {
            kind: "slider",
            value: "5",
            configuration: { disabled: false, min: 0, max: 10, step: 1 },
          },
          ["value", "other"],
        ),
      }),
    );
    const deleteSelected = getButton(host, "Delete selected parameters");
    deleteSelected.focus();

    await act(async () => deleteSelected.click());

    const itemTree = useWorkspaceDocument.getState().sections.items?.itemTree;
    expect(itemTree?.items.root?.children).toEqual([]);
    expect(itemTree?.selectedItemIds).toEqual([]);
    expect(host.querySelector('[data-inspector-branch="section"]')).not.toBeNull();
    expect(document.activeElement).toBe(getButton(host, "Add parameter"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("disables every multi-section action outside its owning capability", async () => {
    useWorkspaceCapabilities.setState({ canEditLayout: false, canEditStructure: false });
    await renderInspector(createDocument(["alpha", "bravo"]));

    expect(getButton(host, "Lock all").disabled).toBe(true);
    expect(getButton(host, "Group").disabled).toBe(true);
    expect(getButton(host, "Delete").disabled).toBe(true);
  });

  it("shows explicit mixed state and applies each common multi-section action once", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000",
    );
    await renderInspector(createDocument(["alpha", "bravo"]));

    expect(host.textContent).toContain("Mixed");
    await act(async () => {
      getButton(host, "Lock all").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useWorkspaceDocument.getState().sections["alpha"]?.positionAndSizeLocked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();

    onChange.mockClear();
    await act(async () => {
      getButton(host, "Group").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const group =
      useWorkspaceDocument.getState().sections["group-00000000-0000-4000-8000-000000000000"];
    expect(group?.children).toEqual(["alpha", "bravo"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("ungroups a selected group and restores Inspector focus to the resulting empty branch", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["group"], {
        group: makeSection("group", {
          kind: "group",
          name: "Group",
          children: ["child-a", "child-b"],
        }),
        "child-a": makeSection("child-a"),
        "child-b": makeSection("child-b"),
      }),
    );
    const ungroup = getButton(host, "Ungroup");
    ungroup.focus();

    await act(async () => {
      ungroup.click();
    });

    expect(useWorkspaceDocument.getState().sections["group"]).toBeUndefined();
    expect(useWorkspaceDocument.getState().parentSectionMap["child-a"]).toBeUndefined();
    expect(host.textContent).toContain("Select A Section to Edit");
    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("explains why a mixed group and leaf selection cannot be ungrouped", async () => {
    await renderInspector(
      createDocument(["group", "alpha"], {
        group: makeSection("group", { kind: "group", children: ["child"] }),
        child: makeSection("child"),
      }),
    );

    expect(getButton(host, "Ungroup").disabled).toBe(true);
    expect(host.textContent).toContain("every selected section must be an unlocked group");
  });

  it("renders a typed host contribution for custom section and item content", async () => {
    const contexts: Array<WorkspaceInspectorContributionContext> = [];
    registerSectionKinds({
      leaf: { renderContent: () => null },
      custom: {
        renderContent: () => null,
        renderInspector: (context) => {
          contexts.push(context);
          return <button type="button">Host {context.type} inspector</button>;
        },
      },
    });
    await renderInspector(
      createDocument(["custom"], {
        custom: makeSection("custom", { kind: "custom", name: "Custom" }),
      }),
    );
    expect(host.textContent).toContain("Host section inspector");

    await act(async () => {
      loadWorkspaceDocument(
        createDocument(["custom-items"], {
          "custom-items": makeSection("custom-items", {
            kind: "custom",
            itemTree: {
              rootId: "root",
              items: {
                root: { id: "root", children: ["opaque"] },
                opaque: { id: "opaque", children: [], data: { value: "host" } },
              },
              selectedItemIds: ["opaque"],
            },
          }),
        }),
      );
    });

    expect(host.textContent).toContain("Host item inspector");
    const sectionContext = contexts.find((context) => context.type === "section");
    const itemContext = contexts.find((context) => context.type === "item");
    expect(sectionContext && Object.isFrozen(sectionContext.section)).toBe(true);
    expect(sectionContext && Object.isFrozen(sectionContext.section.children)).toBe(true);
    expect(itemContext && Object.isFrozen(itemContext.item)).toBe(true);
    expect(itemContext?.item.data && Object.isFrozen(itemContext.item.data)).toBe(true);
    expect(() => {
      if (itemContext?.item.data && !Array.isArray(itemContext.item.data)) {
        (itemContext.item.data as Record<string, unknown>)["value"] = "mutated";
      }
    }).toThrow(TypeError);
    expect(
      useWorkspaceDocument.getState().sections["custom-items"]?.itemTree?.items["opaque"]?.data,
    ).toEqual({ value: "host" });
  });
});
