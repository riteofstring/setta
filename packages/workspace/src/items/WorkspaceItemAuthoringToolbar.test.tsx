/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setItemDndState, useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSectionItemTree } from "../document/types";
import { WorkspaceItemAuthoringToolbar } from "./WorkspaceItemAuthoringToolbar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function loadDocument(): void {
  loadWorkspaceDocument({
    sections: {
      panel: {
        id: "panel",
        kind: "items",
        name: "Panel",
        size: { width: 260, height: 180 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "root",
          items: {
            root: { id: "root", children: ["alpha", "beta"] },
            alpha: { id: "alpha", children: [], data: { value: "a" } },
            beta: { id: "beta", children: [], data: { value: "b" } },
          },
          selectedItemIds: ["alpha"],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["panel"],
  });
}

function getButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Expected item-authoring button ${label}.`);
  }
  return button;
}

function getPanelItemTree(): WorkspaceSectionItemTree {
  const itemTree = useWorkspaceDocument.getState().sections.panel?.itemTree;
  if (!itemTree) {
    throw new Error("Expected the panel item tree.");
  }
  return itemTree;
}

function expectCompactAuthoringButtons(buttons: ReadonlyArray<HTMLButtonElement>): void {
  for (const button of buttons) {
    expect(button.type).toBe("button");
    expect(button.dataset["settaWorkspaceTouchTarget"]).toBe("compact");
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(button.className).toContain("focus-visible:ring-2");
    const icon = button.querySelector<HTMLElement>("[aria-hidden='true']");
    if (!icon) {
      throw new Error("Expected an aria-hidden item-authoring icon.");
    }
  }
}

describe("WorkspaceItemAuthoringToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registerSectionKinds({
      items: {
        renderContent: () => null,
        createItem: () => ({ id: "created", children: [], data: { value: "host" } }),
      },
    });
    loadDocument();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    registerSectionKinds({});
    setWorkspaceDocumentChangeCallback(null);
    useWorkspaceCapabilities.getState().reset();
    useItemDndState.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  async function mount(): Promise<void> {
    await act(async () => root.render(<WorkspaceItemAuthoringToolbar sectionId="panel" />));
  }

  it("uses native compact controls and routes every operation through one canonical commit", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await mount();
    expect(host.textContent).toContain("Parameters");
    expect(host.querySelector(".section-args")?.getAttribute("data-tab-native")).toBe("true");
    const removeLast = getButton(host, "Remove last parameter");
    const add = getButton(host, "Add parameter");
    const deleteSelected = getButton(host, "Delete selected parameters");
    expectCompactAuthoringButtons([removeLast, add, deleteSelected]);

    await act(async () => add.click());
    expect(getPanelItemTree().items.root?.children).toEqual(["alpha", "beta", "created"]);
    expect(onChange).toHaveBeenCalledOnce();

    await act(async () => getButton(host, "Delete selected parameters").click());
    expect(getPanelItemTree().items.created).toBeUndefined();
    expect(getPanelItemTree().selectedItemIds).toEqual(["beta"]);
    expect(onChange).toHaveBeenCalledTimes(2);

    await act(async () => getButton(host, "Remove last parameter").click());
    expect(getPanelItemTree().items.beta).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("exposes accurate disabled states for capability, lock, drag, and a missing factory", async () => {
    await mount();
    await act(async () => {
      useWorkspaceCapabilities.setState({ canEditStructure: false });
    });
    expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);

    await act(async () => {
      useWorkspaceCapabilities.setState({ canEditStructure: true });
      useWorkspaceDocument.setState((state) => {
        const panel = state.sections.panel;
        if (!panel) {
          throw new Error("Expected the panel section.");
        }
        return {
          sections: {
            ...state.sections,
            panel: { ...panel, positionAndSizeLocked: true },
          },
        };
      });
    });
    expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);

    await act(async () => {
      useWorkspaceDocument.setState((state) => {
        const panel = state.sections.panel;
        if (!panel) {
          throw new Error("Expected the panel section.");
        }
        return {
          sections: {
            ...state.sections,
            panel: { ...panel, positionAndSizeLocked: false },
          },
        };
      });
      setItemDndState({ activeId: "alpha" });
    });
    expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(host);
    useItemDndState.getState().reset();
    registerSectionKinds({ items: { renderContent: () => null } });
    await mount();
    expect(getButton(host, "Add parameter").disabled).toBe(true);
    expect(getButton(host, "Remove last parameter").disabled).toBe(false);
    expect(getButton(host, "Delete selected parameters").disabled).toBe(false);
  });
});
