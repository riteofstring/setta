/* @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../../canvas/store";
import type { MetaControlKind } from "../../controls/meta/metaControlTypes";
import { useDndChildren } from "../../dnd/dndChildren";
import { useDndState } from "../../dnd/dndState";
import { SectionDndContext } from "../../dnd/SectionDndContext";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../../document/stores";
import type { WorkspaceDocument, WorkspaceSection } from "../../document/types";
import { useWorkspaceTooltip } from "../../tooltip/WorkspaceTooltip";
import { useSectionRefs } from "../sectionRefs";
import { SectionContainer } from "./SectionContainer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeSection(id: string, overrides: Partial<WorkspaceSection> = {}): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function loadTestDocument(overridesById: Record<string, Partial<WorkspaceSection>> = {}) {
  loadWorkspaceDocument({
    sections: {
      leaf: makeSection("leaf", { name: "Leaf section", ...overridesById["leaf"] }),
      group: makeSection("group", {
        kind: "group",
        name: "Group section",
        size: { width: "auto", height: "auto" },
        children: ["nested"],
        ...overridesById["group"],
      }),
      nested: makeSection("nested", { name: "Nested section", ...overridesById["nested"] }),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
      group: { x: 300, y: 0, w: null, h: null, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

// The representative recursive structure from the Phase 0 captures: a root group holding a
// nested group holding a horizontal group with three leaves — three group levels, leaves at
// the fourth.
function loadDeepDocument() {
  loadWorkspaceDocument({
    sections: {
      outer: makeSection("outer", {
        kind: "group",
        name: "Outer group",
        size: { width: "auto", height: "auto" },
        children: ["middle"],
      }),
      middle: makeSection("middle", {
        kind: "group",
        name: "Middle group",
        size: { width: "auto", height: "auto" },
        children: ["inner"],
      }),
      inner: makeSection("inner", {
        kind: "group",
        name: "Inner group",
        size: { width: "auto", height: "auto" },
        isHorizontalOrientation: true,
        children: ["row-a", "row-b", "row-c"],
      }),
      "row-a": makeSection("row-a", { name: "Row A" }),
      "row-b": makeSection("row-b", { name: "Row B" }),
      "row-c": makeSection("row-c", { name: "Row C" }),
    },
    topLevelSections: {
      outer: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function loadMetaControlDocument(
  onEdit: (section: WorkspaceSection) => void,
  overrides: Partial<WorkspaceSection> = {},
  controlKind: MetaControlKind = "text",
) {
  registerSectionKinds({
    leaf: { renderContent: renderSectionBody },
    meta: {
      renderContent: () => createElement("div", { "data-testid": "meta-body" }, "Meta body"),
      presentation: {
        type: "meta-control",
        resolveControlKind: () => controlKind,
        onEdit,
      },
    },
  });
  const { size: _size, ...metaWithoutSize } = makeSection("meta", {
    kind: "meta",
    name: "Meta text",
    styleColor: "#3b82f6",
    data: { control: "text" },
    ...overrides,
  });
  loadWorkspaceDocument({
    sections: { meta: metaWithoutSize },
    topLevelSections: { meta: { x: 0, y: 0, w: 200, h: 44, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function updateMetaSizeForTest(sections: Record<string, WorkspaceSection>) {
  const meta = sections["meta"];
  if (!meta) {
    throw new Error("The meta-control test document is missing its section.");
  }
  return {
    ...sections,
    meta: { ...meta, size: { width: 200, height: 44 } },
  };
}

// Mirrors production, where NodeRenderer stops rendering a section's container in the same
// pass that removes it from the document.
function SectionHost({ sectionId }: { sectionId: string }) {
  const exists = useWorkspaceDocument((x) => x.sections[sectionId] !== undefined);
  if (!exists) {
    return null;
  }
  return createElement(SectionContainer, { sectionId });
}

function renderSectionBody(section: WorkspaceSection): ReactNode {
  return createElement("p", { "data-testid": "section-body" }, `${section.name} body`);
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Expected an element matching ${selector}.`);
  }
  return element;
}

function expectSectionGroupSemantics(element: HTMLElement, label: string) {
  expect(element.getAttribute("role")).toBe("group");
  expect(element.getAttribute("aria-label")).toBe(label);
  expect(element.getAttribute("aria-keyshortcuts")).toBe("Enter Space");
  expect(element.getAttribute("aria-pressed")).toBeNull();
}

describe("SectionContainer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: renderSectionBody } });
    loadTestDocument();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useSectionRefs.getState().reset();
    useWorkspaceCapabilities.getState().reset();
    useDndState.getState().reset();
    useDndChildren.getState().reset();
    useWorkspaceTooltip.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  // Production always renders section containers inside the dnd context, which also owns the
  // document → dnd-children sync that feeds nested child lists.
  async function mount(sectionId: string) {
    await act(async () => {
      root.render(
        createElement(SectionDndContext, null, createElement(SectionHost, { sectionId })),
      );
    });
  }

  it("renders the leaf shell, header controls, host body, and resize handles", async () => {
    await mount("leaf");

    const shell = getRequiredElement(host, '[data-section-id="leaf"]');
    expect(shell.getAttribute("data-section-type")).toBe("leaf");
    expect(shell.getAttribute("data-section-active")).toBe("false");
    expectSectionGroupSemantics(shell, "Leaf section section");
    expect(shell.className).toContain("rounded-lg");

    expect(host.querySelector("i.gg-menu")).not.toBeNull();
    expect(host.querySelector('[aria-label="Lock position and size"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Minimize section"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete section"]')).not.toBeNull();
    const compactControlGroup = host.querySelector<HTMLElement>(
      '[data-setta-workspace-compact-control-group="true"]',
    ) as HTMLElement;
    expect(compactControlGroup).not.toBeNull();
    expect(compactControlGroup.querySelectorAll("button")).toHaveLength(3);
    expect(
      compactControlGroup.querySelectorAll('[data-setta-workspace-touch-target="compact"]'),
    ).toHaveLength(3);
    expect(host.textContent).toContain("Leaf section body");
    expect(host.querySelector('[data-testid="section-body"]')?.parentElement?.className).toBe(
      "section-full-no-title",
    );

    const rightHandle = host.querySelector(".section-resize-handle-right") as HTMLElement;
    const bottomHandle = host.querySelector(".section-resize-handle-bottom") as HTMLElement;
    expect(host.querySelector(".section-resize-handle-bottom-right")).not.toBeNull();
    expect(rightHandle.style.right).toBe("-8px");
    expect(bottomHandle.style.bottom).toBe("-8px");

    // The container registers both DOM refs for measurement fallbacks.
    expect(useSectionRefs.getState().selfOnly["leaf"]).toBeInstanceOf(HTMLElement);
    expect(useSectionRefs.getState().withNested["leaf"]).toBeInstanceOf(HTMLElement);
  });

  it("renders package-owned meta chrome at the captured inner geometry", async () => {
    const onEdit = vi.fn();
    loadMetaControlDocument(onEdit);
    await mount("meta");

    const shell = host.querySelector<HTMLElement>('[data-section-id="meta"]');
    if (!shell) {
      throw new Error("The meta-control shell did not render.");
    }
    expect(shell.getAttribute("data-section-presentation")).toBe("meta-control");
    expect(shell.getAttribute("aria-label")).toBe("Meta text meta control");
    for (const expectedClass of [
      "bg-transparent",
      "!border-transparent",
      "outline-2",
      "group-hover/card-section:outline-setta-400/60",
    ]) {
      expect(shell.classList.contains(expectedClass)).toBe(true);
    }
    // Meta presentation suppresses a section style color rather than repainting its transparent
    // shell with the ordinary themed variables.
    expect(shell.className).not.toContain("--setta-section-style");
    expect(String(shell.getAttribute("style"))).not.toContain("--setta-section-style");

    const surface = host.querySelector<HTMLElement>("#meta-CustomResizable");
    if (!surface) {
      throw new Error("The meta-control resizable surface did not render.");
    }
    expect(surface.style.width).toBe("200px");
    expect(surface.style.height).toBe("44px");
    for (const expectedClass of [
      "bg-transparent",
      "grid-cols-1",
      "grid-rows-1",
      "group-hover/card-section:z-[170]",
      "before:!border-transparent",
    ]) {
      expect(surface.classList.contains(expectedClass)).toBe(true);
    }
    expect(host.querySelector('[data-testid="meta-body"]')).not.toBeNull();
    expect(host.querySelector("i.gg-menu")).toBeNull();
    expect(host.querySelector('[aria-label="Minimize section"]')).toBeNull();

    const rightHandle = host.querySelector<HTMLElement>(".section-resize-handle-right");
    const bottomHandle = host.querySelector<HTMLElement>(".section-resize-handle-bottom");
    const cornerHandle = host.querySelector<HTMLElement>(".section-resize-handle-bottom-right");
    if (!rightHandle || !bottomHandle || !cornerHandle) {
      throw new Error("The meta-control resize handles did not render.");
    }
    expect(rightHandle.style.right).toBe("-8px");
    expect(rightHandle.style.width).toBe("16px");
    expect(rightHandle.style.height).toBe("100%");
    expect(bottomHandle.style.bottom).toBe("-8px");
    expect(bottomHandle.style.height).toBe("16px");
    expect(bottomHandle.style.width).toBe("100%");
    expect(cornerHandle.style.width).toBe("16px");
    expect(cornerHandle.style.height).toBe("16px");
    expect(rightHandle.className).toContain("hover:after:bg-blue-500/80");

    expect(host.querySelector('[data-meta-control-drag-handle="true"]')).not.toBeNull();
    const editButton = host.querySelector<HTMLButtonElement>('[data-meta-control-edit="true"]');
    if (!editButton) {
      throw new Error("The meta-control edit affordance did not render.");
    }
    expect(editButton.getAttribute("aria-label")).toBe("Edit Meta text");
    expect(editButton.className).toContain("h-6");
    expect(editButton.className).toContain("w-6");
    expect(editButton.className).toContain("after:h-12");
    expect(editButton.className).toContain("after:w-10");
    expect(editButton.className).toContain("focus:opacity-100");
    const editIcon = editButton.querySelector("svg") as SVGSVGElement;
    expect(editIcon.classList.contains("h-4")).toBe(true);
    expect(editIcon.classList.contains("w-4")).toBe(true);
    await act(async () => editButton.click());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "meta" }));

    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    editButton.focus();
    await act(async () => {
      editButton.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(useSectionRefs.getState().selfOnly["meta"]);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("removes meta drag and resize affordances when its layout is locked", async () => {
    loadMetaControlDocument(() => {}, { positionAndSizeLocked: true });
    await mount("meta");

    expect(host.querySelector('[data-meta-control-drag-handle="true"]')).toBeNull();
    expect(host.querySelector(".section-resize-handle")).toBeNull();
    expect(host.querySelector('[data-meta-control-edit="true"]')).not.toBeNull();
    expect(host.querySelector('[data-section-id="meta"]')?.className).toContain("rounded-sm");
  });

  it("removes meta drag and resize affordances when layout editing is unavailable", async () => {
    useWorkspaceCapabilities.setState({ canEditLayout: false });
    loadMetaControlDocument(() => {});
    await mount("meta");

    expect(host.querySelector('[data-meta-control-drag-handle="true"]')).toBeNull();
    expect(host.querySelector(".section-resize-handle")).toBeNull();
    expect(host.querySelector('[data-meta-control-edit="true"]')).not.toBeNull();
  });

  it("keeps only the horizontal resize handle for an auto-height-only meta control", async () => {
    loadMetaControlDocument(() => {}, {}, "slider");
    await mount("meta");

    expect(host.querySelector(".section-resize-handle-right")).not.toBeNull();
    expect(host.querySelector(".section-resize-handle-bottom")).toBeNull();
    expect(host.querySelector(".section-resize-handle-bottom-right")).toBeNull();
    expect(host.querySelector<HTMLElement>("#meta-CustomResizable")?.style.height).toBe("auto");
  });

  it("normalizes auto-height-only meta controls independently of layout editability", async () => {
    loadMetaControlDocument(() => {}, { positionAndSizeLocked: true }, "slider");
    useWorkspaceDocument.setState((state) => ({
      sections: updateMetaSizeForTest(state.sections),
    }));
    useWorkspaceCapabilities.setState({ canEditLayout: false });
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);

    await mount("meta");

    expect(useWorkspaceDocument.getState().sections["meta"]?.size).toEqual({
      width: 200,
      height: "auto",
    });
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("renders a registered kind icon with the reference icon treatment", async () => {
    registerSectionKinds({
      leaf: {
        renderContent: renderSectionBody,
        icon: ({ className }) => createElement("svg", { "data-testid": "kind-icon", className }),
      },
    });
    loadTestDocument();
    await mount("leaf");

    // The registered icon replaces the gg-menu fallback and carries the reference's default
    // blue simple-icon treatment.
    expect(host.querySelector("i.gg-menu")).toBeNull();
    const icon = host.querySelector('[data-testid="kind-icon"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("class")).toContain("text-setta-300");

    // A style-colored section swaps in the themed treatment, exactly as the reference.
    loadTestDocument({ leaf: { styleColor: "#3b82f6" } });
    await mount("leaf");
    expect(host.querySelector('[data-testid="kind-icon"]')?.getAttribute("class")).toContain(
      "text-[color:var(--setta-section-style-muted-text)]",
    );
  });

  it("appends host presentation to the package-owned content slot", async () => {
    registerSectionKinds({
      leaf: {
        renderContent: renderSectionBody,
        contentClassName: "host-content-layout",
      },
    });
    loadTestDocument();
    await mount("leaf");

    expect(host.querySelector('[data-testid="section-body"]')?.parentElement?.className).toBe(
      "section-full-no-title host-content-layout",
    );
  });

  it("disables resize handles and squares the corners while locked", async () => {
    loadTestDocument({ leaf: { positionAndSizeLocked: true } });
    await mount("leaf");

    expect(host.querySelector(".section-resize-handle")).toBeNull();
    const shell = host.querySelector('[data-section-id="leaf"]');
    expect(shell?.className).toContain("rounded-sm");
  });

  it("drops the body but keeps the header when minimized", async () => {
    loadTestDocument({ leaf: { isMinimized: true } });
    await mount("leaf");

    expect(host.querySelector('[data-testid="section-body"]')).toBeNull();
    expect(host.querySelector('[aria-label="Expand section"]')).not.toBeNull();
  });

  it("renders group chrome with its controls and the nested leaf", async () => {
    await mount("group");

    const groupRoot = getRequiredElement(host, ".group\\/group-section");
    expectSectionGroupSemantics(groupRoot, "Group section group section");
    // The frame and selection outline paint on an absolutely positioned sibling layer.
    expect(host.querySelector(".outline-4.absolute")).not.toBeNull();
    expect(host.querySelector('[aria-label="Flow children horizontally"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Lock position and size"]')).not.toBeNull();

    const nestedSlot = getRequiredElement(host, '[data-sortable-section-id="nested"]');
    expect(nestedSlot.getAttribute("role")).toBeNull();
    expect(nestedSlot.getAttribute("aria-pressed")).toBeNull();
    expect(nestedSlot.getAttribute("aria-grabbed")).toBeNull();
    expect(nestedSlot.querySelector('[data-section-id="nested"]')).not.toBeNull();
    // Groups never render a minimize control.
    const groupHeader = groupRoot.querySelector(".min-h-10");
    expect(groupHeader?.querySelector('[aria-label="Minimize section"]')).toBeNull();
  });

  it("shows the drop hint for an empty group", async () => {
    loadTestDocument({ group: { children: [] } });
    await mount("group");

    expect(host.textContent).toContain("Drop A Section Here.");
  });

  it("renders three nested group levels with the innermost horizontal child flow", async () => {
    loadDeepDocument();
    await mount("outer");

    // Every level renders full group chrome, recursively composed.
    expect(host.querySelectorAll(".group\\/group-section").length).toBe(3);

    const middleSlot = host.querySelector('[data-sortable-section-id="middle"]') as HTMLElement;
    const innerSlot = middleSlot.querySelector('[data-sortable-section-id="inner"]') as HTMLElement;
    expect(innerSlot).not.toBeNull();
    for (const rowId of ["row-a", "row-b", "row-c"]) {
      expect(innerSlot.querySelector(`[data-section-id="${rowId}"]`)).not.toBeNull();
    }
    expect(host.textContent).toContain("Row A body");

    // The middle group flows its children vertically; the inner group flows horizontally.
    expect(middleSlot.querySelector(".mt-2.flex.flex-col")).not.toBeNull();
    expect(innerSlot.querySelector(".mt-2.flex.flex-row")).not.toBeNull();

    // Only the horizontal group offers the stack-vertically direction.
    expect(innerSlot.querySelector('[aria-label="Stack children vertically"]')).not.toBeNull();
    expect(middleSlot.querySelector('[aria-label="Flow children horizontally"]')).not.toBeNull();
  });

  it("flips a nested group's child flow from its orientation control and reports one change", async () => {
    loadDeepDocument();
    await mount("outer");

    const reported: Array<WorkspaceDocument> = [];
    setWorkspaceDocumentChangeCallback((next) => reported.push(next));

    const innerSlot = host.querySelector('[data-sortable-section-id="inner"]') as HTMLElement;
    const toggle = innerSlot.querySelector(
      '[aria-label="Stack children vertically"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useWorkspaceDocument.getState().sections["inner"]?.isHorizontalOrientation).toBe(false);
    expect(innerSlot.querySelector(".mt-2.flex.flex-col")).not.toBeNull();
    expect(innerSlot.querySelector(".mt-2.flex.flex-row")).toBeNull();

    // One canonical commit, one notification, carrying only the flipped group.
    expect(reported.length).toBe(1);
    expect(reported[0]?.sections["inner"]?.isHorizontalOrientation).toBe(false);
    expect(reported[0]?.sections["middle"]?.isHorizontalOrientation).toBe(false);
    expect(reported[0]?.sections["outer"]?.isHorizontalOrientation).toBe(false);
  });

  it("renames the section through the double-click editable title", async () => {
    await mount("leaf");

    const title = Array.from(host.querySelectorAll('[role="button"]')).find(
      (el) => el.textContent === "Leaf section",
    ) as HTMLElement;
    await act(async () => {
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    });

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      nativeValueSetter?.call(input, "  Renamed leaf  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    // The commit normalizes surrounding whitespace, mirroring the reference.
    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("Renamed leaf");
  });

  it("enters title editing with Enter and restores label focus after keyboard commit", async () => {
    await mount("leaf");
    const title = host.querySelector<HTMLElement>(
      '[role="button"][aria-label="Leaf section, edit section title"]',
    );
    title?.focus();
    await act(async () => {
      title?.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }),
      );
    });
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Section title"]');
    expect(document.activeElement).toBe(input);
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      nativeValueSetter?.call(input, "Keyboard title");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const committedTitle = host.querySelector<HTMLElement>(
      '[role="button"][aria-label="Keyboard title, edit section title"]',
    );
    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("Keyboard title");
    expect(document.activeElement).toBe(committedTitle);
  });

  it("drives the tooltip content from the hovered section title", async () => {
    await mount("leaf");

    const title = Array.from(host.querySelectorAll('[role="button"]')).find(
      (el) => el.textContent === "Leaf section",
    ) as HTMLElement;
    // React synthesizes onMouseEnter/onMouseLeave from native mouseover/mouseout.
    await act(async () => {
      title.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(useWorkspaceTooltip.getState().content).toBe("Leaf section");

    await act(async () => {
      title.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(useWorkspaceTooltip.getState().content).toBeNull();
  });

  it("reverts the title on Escape", async () => {
    await mount("leaf");

    const title = Array.from(host.querySelectorAll('[role="button"]')).find(
      (el) => el.textContent === "Leaf section",
    ) as HTMLElement;
    await act(async () => {
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    });

    const input = host.querySelector("input") as HTMLInputElement;
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      nativeValueSetter?.call(input, "Discarded");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      // Escape blurs the input itself; the escape flag swallows that blur without committing.
      input.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("Leaf section");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Leaf section, edit section title",
    );
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("deletes the section from the header control", async () => {
    await mount("leaf");

    const deleteButton = host.querySelector('[aria-label="Delete section"]') as HTMLButtonElement;
    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useWorkspaceDocument.getState().sections["leaf"]).toBeUndefined();
    expect(host.querySelector('[data-section-id="leaf"]')).toBeNull();
  });

  it("moves focus to the next rendered section after a focused delete action", async () => {
    await act(async () => {
      root.render(
        createElement(
          SectionDndContext,
          null,
          createElement(SectionHost, { sectionId: "leaf" }),
          createElement(SectionHost, { sectionId: "group" }),
        ),
      );
    });
    const leaf = host.querySelector<HTMLElement>('[data-section-id="leaf"]');
    const deleteButton = leaf?.querySelector<HTMLButtonElement>('[aria-label="Delete section"]');
    deleteButton?.focus();
    await act(async () => {
      deleteButton?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement).toBe(useSectionRefs.getState().withNested["group"]);
  });

  it("gates structure edits behind canEditStructure", async () => {
    useWorkspaceCapabilities.setState({ canEditStructure: false });
    await mount("leaf");

    // The title renders the fixed presentation instead of the editable one.
    expect(host.querySelector("h2")?.textContent).toBe("Leaf section");
    const deleteButton = host.querySelector('[aria-label="Delete section"]') as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });

  it("gates layout edits behind canEditLayout", async () => {
    useWorkspaceCapabilities.setState({ canEditLayout: false });
    await mount("leaf");

    const lockButton = host.querySelector(
      '[aria-label="Lock position and size"]',
    ) as HTMLButtonElement;
    expect(lockButton.disabled).toBe(true);
    expect(lockButton.className).toContain("cursor-not-allowed");
    expect(host.querySelector(".section-resize-handle")).toBeNull();
  });

  it("marks the shell active when the section is selected", async () => {
    await mount("leaf");

    await act(async () => {
      useActiveSections.setState({ activeIds: ["leaf"] });
    });

    const shell = host.querySelector('[data-section-id="leaf"]');
    expect(shell?.getAttribute("data-section-active")).toBe("true");
    expect(shell?.getAttribute("aria-label")).toBe("Leaf section section, selected");
    expect(shell?.getAttribute("aria-pressed")).toBeNull();
    expect(shell?.className).toContain("z-[150]");
  });
});
