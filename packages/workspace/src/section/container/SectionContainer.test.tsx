/* @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../../canvas/store";
import { useDndChildren } from "../../dnd/dndChildren";
import { useDndState } from "../../dnd/dndState";
import { SectionDndContext } from "../../dnd/SectionDndContext";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { loadWorkspaceDocument } from "../../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../../document/stores";
import type { WorkspaceSection } from "../../document/types";
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

    const shell = host.querySelector('[data-section-id="leaf"]');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute("data-section-type")).toBe("leaf");
    expect(shell?.getAttribute("data-section-active")).toBe("false");
    expect(shell?.className).toContain("rounded-lg");

    expect(host.querySelector("i.gg-menu")).not.toBeNull();
    expect(host.querySelector('[aria-label="Lock position and size"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Minimize section"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete section"]')).not.toBeNull();
    expect(host.textContent).toContain("Leaf section body");

    const rightHandle = host.querySelector(".section-resize-handle-right") as HTMLElement;
    const bottomHandle = host.querySelector(".section-resize-handle-bottom") as HTMLElement;
    expect(host.querySelector(".section-resize-handle-bottom-right")).not.toBeNull();
    expect(rightHandle.style.right).toBe("-8px");
    expect(bottomHandle.style.bottom).toBe("-8px");

    // The container registers both DOM refs for measurement fallbacks.
    expect(useSectionRefs.getState().selfOnly["leaf"]).toBeInstanceOf(HTMLElement);
    expect(useSectionRefs.getState().withNested["leaf"]).toBeInstanceOf(HTMLElement);
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

    const groupRoot = host.querySelector(".group\\/group-section");
    expect(groupRoot).not.toBeNull();
    // The frame and selection outline paint on an absolutely positioned sibling layer.
    expect(host.querySelector(".outline-4.absolute")).not.toBeNull();
    expect(host.querySelector('[aria-label="Flow children horizontally"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Lock position and size"]')).not.toBeNull();

    const nestedSlot = host.querySelector('[data-sortable-section-id="nested"]');
    expect(nestedSlot).not.toBeNull();
    expect(nestedSlot?.querySelector('[data-section-id="nested"]')).not.toBeNull();
    // Groups never render a minimize control.
    const groupHeader = groupRoot?.querySelector(".min-h-10");
    expect(groupHeader?.querySelector('[aria-label="Minimize section"]')).toBeNull();
  });

  it("shows the drop hint for an empty group", async () => {
    loadTestDocument({ group: { children: [] } });
    await mount("group");

    expect(host.textContent).toContain("Drop A Section Here.");
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
    });

    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("Leaf section");
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
  });

  it("marks the shell active when the section is selected", async () => {
    await mount("leaf");

    await act(async () => {
      useActiveSections.setState({ activeIds: ["leaf"] });
    });

    const shell = host.querySelector('[data-section-id="leaf"]');
    expect(shell?.getAttribute("data-section-active")).toBe("true");
    expect(shell?.className).toContain("z-[150]");
  });
});
