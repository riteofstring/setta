/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSectionInput } from "../document/types";
import { WorkspaceMenuLayer } from "./WorkspaceMenuLayer";
import {
  openWorkspaceItemMenu,
  openWorkspacePaneMenu,
  openWorkspaceSectionHeaderMenu,
  openWorkspaceSectionMenu,
} from "./workspaceMenuInvocation";
import { registerWorkspaceCreationCommands } from "./workspaceMenuRegistry";
import { useWorkspaceMenuState } from "./workspaceMenuState";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSection(id: string): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    data: { body: id },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function getMenuItems(): Array<HTMLElement> {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  );
}

function resetState(): void {
  registerWorkspaceCreationCommands([]);
  registerWorkspaceCommands([]);
  useWorkspaceMenuState.getState().reset();
  useWorkspaceCapabilities.getState().reset();
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
}

describe("WorkspaceMenuLayer", () => {
  let host: HTMLDivElement;
  let canvas: HTMLDivElement;
  let owner: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetState();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("setta-workspace-menu")
          ? createRect(0, 0, 160, 180)
          : createRect(0, 0, 100, 40);
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    registerSectionKinds({
      leaf: {
        renderContent: () => null,
        defaultSize: { width: 200, height: 100 },
      },
    });
    loadWorkspaceDocument({
      sections: { existing: createSection("existing") },
      topLevelSections: { existing: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["existing"],
    });
    registerWorkspaceCreationCommands([
      {
        id: "host-note",
        label: "Host note",
        group: "Host",
        createSection: (context) => ({
          ...createSection("created"),
          data: {
            body: context.workspacePosition
              ? `${context.workspacePosition.x},${context.workspacePosition.y}`
              : "no pointer",
          },
        }),
      },
    ]);
    host = document.createElement("div");
    canvas = document.createElement("div");
    owner = document.createElement("div");
    owner.tabIndex = -1;
    canvas.getBoundingClientRect = () => createRect(100, 50, 800, 600);
    owner.getBoundingClientRect = () => createRect(20, 30, 200, 100);
    document.body.append(host, canvas, owner);
    useReactFlow.setState({ domNode: canvas, transform: [0, 0, 1] });
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    canvas.remove();
    owner.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    registerSectionKinds({});
    setWorkspaceDocumentChangeCallback(null);
    resetState();
  });

  async function renderOpenPaneMenu(): Promise<void> {
    expect(openWorkspacePaneMenu({ x: 150, y: 100 }, owner)).toBe(true);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });
  }

  function setNativeInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) {
      throw new Error("Missing native input value setter.");
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("renders a semantic searchable pane menu and restores focus on Escape", async () => {
    owner.dir = "rtl";
    await renderOpenPaneMenu();

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    const filter = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Filter sections"]',
    );
    expect(menu?.getAttribute("aria-label")).toBe("Create a workspace section");
    expect(menu?.getAttribute("dir")).toBe("rtl");
    expect(menu?.classList.contains("setta-workspace")).toBe(true);
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(filter).not.toBeNull();
    expect(document.activeElement).toBe(filter);

    await act(async () => {
      filter?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(owner);
  });

  it("filters commands and inserts the selected factory result at the invocation coordinate", async () => {
    await renderOpenPaneMenu();
    const filter = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Filter sections"]',
    );
    if (!filter) {
      throw new Error("Missing pane menu filter.");
    }

    await act(async () => {
      setNativeInputValue(filter, "missing");
    });
    expect(document.body.textContent).toContain("No matching sections");

    await act(async () => {
      setNativeInputValue(filter, "host");
    });
    const item = document.body.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item?.textContent).toContain("Host note");

    await act(async () => {
      item?.click();
    });
    expect(useWorkspaceDocument.getState().sections["created"]?.data).toEqual({
      body: "50,50",
    });
    expect(
      useWorkspaceDocument.getState().topLevelSections["created"],
    ).toMatchObject({
      x: 50,
      y: 50,
      zIndex: 1,
    });
    expect(useActiveSections.getState().activeIds).toEqual(["created"]);
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
  });

  it("deletes an item through the package action before separately grouped host actions", async () => {
    loadWorkspaceDocument({
      sections: {
        existing: {
          ...createSection("existing"),
          itemTree: {
            rootId: "root",
            items: {
              root: { id: "root", children: ["first", "second"] },
              first: { id: "first", children: [], data: { value: 1 } },
              second: { id: "second", children: [], data: { value: 2 } },
            },
            selectedItemIds: ["first"],
          },
        },
      },
      topLevelSections: { existing: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["existing"],
    });
    registerWorkspaceCommands([
      {
        id: "host-report",
        scope: "item",
        surfaces: ["context-menu"],
        label: "Report item",
        run: vi.fn(),
      },
    ]);
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    expect(
      openWorkspaceItemMenu("existing", "first", { x: 150, y: 100 }, owner),
    ).toBe(true);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Delete parameter",
      "Report item",
    ]);
    expect(document.body.querySelectorAll('[role="separator"]')).toHaveLength(
      1,
    );

    await act(async () => {
      entries[0]?.click();
    });

    const itemTree =
      useWorkspaceDocument.getState().sections["existing"]?.itemTree;
    expect(itemTree?.items["first"]).toBeUndefined();
    expect(itemTree?.selectedItemIds).toEqual(["second"]);
    expect(onChange).toHaveBeenCalledOnce();
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
  });

  it("keeps a locked section's item deletion visible but disabled", async () => {
    loadWorkspaceDocument({
      sections: {
        existing: {
          ...createSection("existing"),
          positionAndSizeLocked: true,
          itemTree: {
            rootId: "root",
            items: {
              root: { id: "root", children: ["first"] },
              first: { id: "first", children: [], data: { value: 1 } },
            },
            selectedItemIds: ["first"],
          },
        },
      },
      topLevelSections: { existing: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["existing"],
    });
    const hostAction = vi.fn();
    registerWorkspaceCommands([
      {
        id: "host-report",
        scope: "item",
        surfaces: ["context-menu"],
        label: "Report item",
        run: hostAction,
      },
    ]);
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    openWorkspaceItemMenu("existing", "first", { x: 150, y: 100 }, owner);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    const deleteParameter = entries.find(
      (entry) => entry.textContent === "Delete parameter",
    );
    const reportItem = entries.find(
      (entry) => entry.textContent === "Report item",
    );
    expect(deleteParameter?.getAttribute("aria-disabled")).toBe("true");
    expect(deleteParameter?.hasAttribute("data-disabled")).toBe(true);
    expect(reportItem?.getAttribute("aria-disabled")).toBeNull();

    await act(async () => {
      deleteParameter?.click();
    });
    expect(
      useWorkspaceDocument.getState().sections.existing?.itemTree?.items.first,
    ).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
    expect(hostAction).not.toHaveBeenCalled();
  });

  it("exposes capability-disabled structural actions through menuitem semantics", async () => {
    useWorkspaceCapabilities.setState({
      canEditStructure: false,
      canEditLayout: false,
    });
    openWorkspaceSectionMenu(
      "existing",
      "context-menu",
      { x: 150, y: 100 },
      owner,
    );
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Delete",
      "Lock Position & Size",
    ]);
    expect(entries.every((entry) => entry.hasAttribute("data-disabled"))).toBe(
      true,
    );
    expect(
      entries.every((entry) => entry.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
    expect(document.activeElement).toBe(entries[0]);

    await act(async () => {
      root.render(null);
    });
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
  });

  it("dismisses a section menu without deleting valid multi-selection geometry", async () => {
    const selectionBounds = { x: 10, y: 20, width: 300, height: 120 };
    useReactFlow.setState({ nodesSelectionDims: selectionBounds });
    openWorkspaceSectionMenu(
      "existing",
      "context-menu",
      { x: 150, y: 100 },
      owner,
    );
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const focusedItem =
      document.body.querySelector<HTMLElement>('[role="menuitem"]');
    await act(async () => {
      focusedItem?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });

    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
    expect(useReactFlow.getState().nodesSelectionDims).toEqual(selectionBounds);
    expect(document.activeElement).toBe(owner);
  });

  it("locks a mixed selection through one canonical structural action", async () => {
    loadWorkspaceDocument({
      sections: {
        existing: createSection("existing"),
        locked: { ...createSection("locked"), positionAndSizeLocked: true },
      },
      topLevelSections: {
        existing: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
        locked: { x: 240, y: 0, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["existing", "locked"],
    });
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    openWorkspaceSectionMenu(
      "existing",
      "context-menu",
      { x: 150, y: 100 },
      owner,
    );
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const lockItem = document.body.querySelector<HTMLElement>(
      '[role="menuitem"]:not([data-disabled])',
    );
    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Delete",
      "Lock Position & Size",
    ]);
    expect(lockItem?.textContent).toBe("Group");
    const mixedLockItem = entries.find(
      (entry) => entry.textContent === "Lock Position & Size",
    );
    await act(async () => {
      mixedLockItem?.click();
    });

    expect(
      useWorkspaceDocument.getState().sections["existing"]
        ?.positionAndSizeLocked,
    ).toBe(true);
    expect(
      useWorkspaceDocument.getState().sections["locked"]?.positionAndSizeLocked,
    ).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("renders the focused group-header action set and toggles canonical overflow", async () => {
    loadWorkspaceDocument({
      sections: {
        group: {
          ...createSection("group"),
          kind: "group",
          size: { width: 320, height: 180 },
          children: ["child"],
        },
        child: createSection("child"),
      },
      topLevelSections: {
        group: { x: 20, y: 30, w: 320, h: 180, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["group"],
    });
    const onHostAction = vi.fn();
    registerWorkspaceCommands([
      {
        id: "host-report",
        scope: "section",
        surfaces: ["header"],
        label: "Report section",
        run: onHostAction,
      },
      {
        id: "host-disabled",
        scope: "section",
        surfaces: ["header"],
        label: "Unavailable host action",
        getDisabledReason: () =>
          "The host action is unavailable for this section.",
        run: vi.fn(),
      },
    ]);
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    openWorkspaceSectionHeaderMenu("group", { x: 150, y: 100 }, owner, "last");
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Overflow Mode",
      "Ungroup",
      "Report section",
      "Unavailable host action",
    ]);
    const overflow = entries[0];
    const hostAction = entries[2];
    const disabledHostAction = entries[3];
    expect(overflow?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(overflow?.getAttribute("aria-checked")).toBe("false");
    expect(disabledHostAction?.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(hostAction);

    await act(async () => {
      hostAction?.click();
    });

    expect(onHostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "section",
        section: expect.objectContaining({ id: "group" }),
      }),
    );
    expect(Object.isFrozen(onHostAction.mock.calls[0]?.[0])).toBe(true);
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
    expect(document.activeElement).toBe(owner);

    await act(async () => {
      openWorkspaceSectionHeaderMenu("group", { x: 150, y: 100 }, owner);
    });
    const reopenedOverflow = document.body.querySelector<HTMLElement>(
      '[role="menuitemcheckbox"]',
    );
    await act(async () => {
      reopenedOverflow?.click();
    });

    expect(
      useWorkspaceDocument.getState().sections["group"]?.overflowMode,
    ).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
    expect(document.activeElement).toBe(owner);

    await act(async () => {
      openWorkspaceSectionHeaderMenu("group", { x: 150, y: 100 }, owner);
    });
    const checkedOverflow = document.body.querySelector<HTMLElement>(
      '[role="menuitemcheckbox"]',
    );
    expect(checkedOverflow?.getAttribute("aria-checked")).toBe("true");
    expect(
      checkedOverflow?.querySelector('[data-state="checked"] svg'),
    ).not.toBeNull();

    await act(async () => {
      useWorkspaceDocument.setState((state) => {
        const group = state.sections["group"];
        if (!group) {
          throw new Error("Expected the header-menu group to remain loaded.");
        }
        return {
          sections: {
            ...state.sections,
            group: { ...group, positionAndSizeLocked: true },
          },
        };
      });
    });
    expect(
      getMenuItems()
        .slice(0, 2)
        .every((entry) => entry.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
  });

  it("targets the owning group when header ungroup opens from a mixed selection", async () => {
    loadWorkspaceDocument({
      sections: {
        group: {
          ...createSection("group"),
          kind: "group",
          children: ["child"],
        },
        child: createSection("child"),
        leaf: createSection("leaf"),
      },
      topLevelSections: {
        group: { x: 20, y: 30, w: null, h: null, zIndex: 0 },
        leaf: { x: 300, y: 30, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["group", "leaf"],
    });
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    openWorkspaceSectionHeaderMenu("group", { x: 150, y: 100 }, owner);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const ungroup = getMenuItems().find(
      (entry) => entry.textContent === "Ungroup",
    );
    expect(ungroup?.hasAttribute("data-disabled")).toBe(false);

    await act(async () => {
      ungroup?.click();
    });

    expect(useWorkspaceDocument.getState().sections["group"]).toBeUndefined();
    expect(useWorkspaceDocument.getState().sections["leaf"]).toBeDefined();
    expect(
      useWorkspaceDocument.getState().topLevelSections["child"],
    ).toMatchObject({
      x: 20,
      y: 30,
    });
    expect(useActiveSections.getState().activeIds).toEqual(["leaf"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("ungroups a valid group selection through the canonical section action", async () => {
    loadWorkspaceDocument({
      sections: {
        group: {
          ...createSection("group"),
          kind: "group",
          children: ["child"],
        },
        child: createSection("child"),
        sibling: createSection("sibling"),
      },
      topLevelSections: {
        group: { x: 20, y: 30, w: null, h: null, zIndex: 0 },
        sibling: { x: 300, y: 30, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["group"],
    });
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    openWorkspaceSectionMenu(
      "group",
      "context-menu",
      { x: 150, y: 100 },
      owner,
    );
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Overflow Mode",
      "Ungroup",
      "Delete",
      "Lock Position & Size",
    ]);
    const ungroup = entries.find((entry) => entry.textContent === "Ungroup");
    expect(ungroup?.hasAttribute("data-disabled")).toBe(false);

    await act(async () => {
      ungroup?.click();
    });

    expect(useWorkspaceDocument.getState().sections["group"]).toBeUndefined();
    expect(
      useWorkspaceDocument.getState().topLevelSections["child"],
    ).toMatchObject({
      x: 20,
      y: 30,
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("exposes but disables ungroup for a mixed group and leaf selection", async () => {
    loadWorkspaceDocument({
      sections: {
        group: {
          ...createSection("group"),
          kind: "group",
          children: ["child"],
        },
        child: createSection("child"),
        leaf: createSection("leaf"),
      },
      topLevelSections: {
        group: { x: 20, y: 30, w: null, h: null, zIndex: 0 },
        leaf: { x: 300, y: 30, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["group", "leaf"],
    });
    openWorkspaceSectionMenu(
      "group",
      "context-menu",
      { x: 150, y: 100 },
      owner,
    );
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = getMenuItems();
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Ungroup",
      "Delete",
      "Lock Position & Size",
    ]);
    const ungroup = entries.find((entry) => entry.textContent === "Ungroup");
    expect(ungroup?.getAttribute("aria-disabled")).toBe("true");
  });
});
