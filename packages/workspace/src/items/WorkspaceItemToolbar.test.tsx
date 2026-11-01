/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setItemDndState, useItemDndState } from "../dnd/itemDndState.js";
import { useWorkspaceCapabilities } from "../document/capabilities.js";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores.js";
import type { WorkspaceSectionItemTree } from "../document/types.js";
import { WorkspaceItemFilterProvider } from "./WorkspaceItemFilterContext.js";
import { WorkspaceItemToolbar } from "./WorkspaceItemToolbar.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function loadDocument(): void {
  loadWorkspaceDocument(testWorkspace.host, {
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
    savedViews: null,
  });
}

function getButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) {
    throw new Error(`Expected item-authoring button ${label}.`);
  }
  return button;
}

function getPanelItemTree(): WorkspaceSectionItemTree {
  const itemTree = testWorkspace.document.getState().sections.panel?.itemTree;
  if (!itemTree) {
    throw new Error("Expected the panel item tree.");
  }
  return itemTree;
}

function expectCompactAuthoringButtons(
  buttons: ReadonlyArray<HTMLButtonElement>,
): void {
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

describe("WorkspaceItemToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registerSectionKinds(testWorkspace.host, {
      items: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
        createItem: () => ({
          id: "created",
          children: [],
          data: { value: "host" },
        }),
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
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.capabilities.getState().reset();
    testWorkspace.itemDndState.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  async function mount(
    mode: "authoring-and-filter" | "filter-only" = "authoring-and-filter",
    followsLeadingContent = false,
  ): Promise<void> {
    await act(async () =>
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceItemFilterProvider
            hasSectionStyleTheme={false}
            sectionId="panel"
          >
            <WorkspaceItemToolbar
              followsLeadingContent={followsLeadingContent}
              mode={mode}
              sectionId="panel"
            />
          </WorkspaceItemFilterProvider>
        </WorkspaceTestProvider>,
      ),
    );
  }

  function getToolbarSpacing(): Array<string> {
    const toolbar = host.querySelector<HTMLElement>(".section-args");
    if (!toolbar) {
      throw new Error("Expected the rendered item toolbar.");
    }
    return [...toolbar.classList].filter((className) =>
      /^(mt|pb)-\d+$/.test(className),
    );
  }

  it("uses native compact controls and routes every operation through one canonical commit", async () => {
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);
    await mount();
    expect(host.textContent).toContain("Args");
    expect(host.textContent).not.toContain("Parameters");
    const toolbar = host.querySelector<HTMLElement>(".section-args");
    expect(toolbar?.getAttribute("data-tab-native")).toBe("true");
    expect(toolbar?.className).toContain("flex-wrap");
    expect(toolbar?.className).toContain("rounded-xl");
    expect(toolbar?.firstElementChild?.className).toContain("gap-1");
    const removeLast = getButton(host, "Remove last parameter");
    const add = getButton(host, "Add parameter");
    const deleteSelected = getButton(host, "Delete selected parameters");
    expectCompactAuthoringButtons([removeLast, add, deleteSelected]);
    expect(add.querySelector(".gg-math-plus")).not.toBeNull();

    await act(async () => add.click());
    expect(getPanelItemTree().items.root?.children).toEqual([
      "alpha",
      "beta",
      "created",
    ]);
    expect(onChange).toHaveBeenCalledOnce();

    await act(async () =>
      getButton(host, "Delete selected parameters").click(),
    );
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
      testWorkspace.capabilities.setState({ canEditStructure: false });
    });
    expect(
      [...host.querySelectorAll("button")].every((button) => button.disabled),
    ).toBe(true);

    await act(async () => {
      testWorkspace.capabilities.setState({ canEditStructure: true });
      testWorkspace.document.setState((state) => {
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
    expect(
      [...host.querySelectorAll("button")].every((button) => button.disabled),
    ).toBe(true);

    await act(async () => {
      testWorkspace.document.setState((state) => {
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
      setItemDndState(testWorkspace.host, { activeId: "alpha" });
    });
    expect(
      [...host.querySelectorAll("button")].every((button) => button.disabled),
    ).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(host);
    testWorkspace.itemDndState.getState().reset();
    registerSectionKinds(testWorkspace.host, {
      items: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
      },
    });
    await mount();
    expect(getButton(host, "Add parameter").disabled).toBe(true);
    expect(getButton(host, "Remove last parameter").disabled).toBe(false);
    expect(getButton(host, "Delete selected parameters").disabled).toBe(false);
  });

  it("renders the Args label and filter without structural actions in filter-only mode", async () => {
    await mount("filter-only");
    const toolbar = host.querySelector<HTMLElement>(".section-args");
    expect(toolbar?.dataset["workspaceItemToolbar"]).toBe("filter-only");
    expect(host.textContent).toContain("Args");

    for (const label of [
      "Add parameter",
      "Remove last parameter",
      "Delete selected parameters",
    ]) {
      expect(host.querySelector(`button[aria-label="${label}"]`)).toBeNull();
    }

    expect(
      host.querySelector<HTMLInputElement>(
        "input.setta-workspace-item-filter-input",
      )?.placeholder,
    ).toBe("Ctrl + K");
    expect(host.querySelector("label")?.textContent).toBe("Filter parameters");
  });

  it("takes the reference's compact spacing only when it follows leading content", async () => {
    await mount("filter-only", true);
    expect(getToolbarSpacing().sort()).toEqual(["mt-0", "pb-0"]);

    await act(async () => root.unmount());
    root = createRoot(host);

    await mount("authoring-and-filter", false);
    expect(getToolbarSpacing().sort()).toEqual(["mt-1", "pb-1"]);
  });
});
