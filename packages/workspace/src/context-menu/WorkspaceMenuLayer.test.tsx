/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSectionInput } from "../document/types";
import { WorkspaceMenuLayer } from "./WorkspaceMenuLayer";
import { openWorkspacePaneMenu, openWorkspaceSectionMenu } from "./workspaceMenuInvocation";
import {
  registerWorkspaceCreationCommands,
  registerWorkspaceMenuActions,
} from "./workspaceMenuRegistry";
import { useWorkspaceMenuState } from "./workspaceMenuState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    tagColor: null,
    children: [],
  };
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
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

function resetState(): void {
  registerWorkspaceCreationCommands([]);
  registerWorkspaceMenuActions([]);
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
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains("setta-workspace-menu")
        ? createRect(0, 0, 160, 180)
        : createRect(0, 0, 100, 40);
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    registerSectionKinds({
      leaf: { renderContent: () => null, defaultSize: { width: 200, height: 100 } },
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
            body: `${context.workspacePosition.x},${context.workspacePosition.y}`,
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
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
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
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
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
    expect(useWorkspaceDocument.getState().sections["created"]?.data).toEqual({ body: "50,50" });
    expect(useWorkspaceDocument.getState().topLevelSections["created"]).toMatchObject({
      x: 50,
      y: 50,
      zIndex: 1,
    });
    expect(useActiveSections.getState().activeIds).toEqual(["created"]);
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
  });

  it("exposes capability-disabled structural actions through menuitem semantics", async () => {
    useWorkspaceCapabilities.setState({ canEditStructure: false, canEditLayout: false });
    openWorkspaceSectionMenu("existing", "section", { x: 150, y: 100 }, owner);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const entries = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Delete",
      "Lock Position & Size",
    ]);
    expect(entries.every((entry) => entry.hasAttribute("data-disabled"))).toBe(true);
    expect(entries.every((entry) => entry.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(document.activeElement).toBe(entries[0]);

    await act(async () => {
      root.render(null);
    });
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
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
    openWorkspaceSectionMenu("existing", "section", { x: 150, y: 100 }, owner);
    await act(async () => {
      root.render(<WorkspaceMenuLayer />);
    });

    const lockItem = document.body.querySelector<HTMLElement>(
      '[role="menuitem"]:not([data-disabled])',
    );
    const entries = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Group",
      "Delete",
      "Lock Position & Size",
    ]);
    expect(lockItem?.textContent).toBe("Group");
    const mixedLockItem = entries.find((entry) => entry.textContent === "Lock Position & Size");
    await act(async () => {
      mixedLockItem?.click();
    });

    expect(useWorkspaceDocument.getState().sections["existing"]?.positionAndSizeLocked).toBe(true);
    expect(useWorkspaceDocument.getState().sections["locked"]?.positionAndSizeLocked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });
});
