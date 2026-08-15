/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  openWorkspaceItemMenu,
  openWorkspacePaneMenu,
  openWorkspaceSectionHeaderMenu,
  openWorkspaceSectionMenu,
} from "./workspaceMenuInvocation";
import {
  registerWorkspaceCreationCommands,
  registerWorkspaceMenuActions,
} from "./workspaceMenuRegistry";
import { useWorkspaceMenuState } from "./workspaceMenuState";

function createSection(id: string, item = false): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...(item
      ? {
          itemTree: {
            rootId: `${id}-root`,
            items: {
              [`${id}-root`]: { id: `${id}-root`, children: [`${id}-item`] },
              [`${id}-item`]: {
                id: `${id}-item`,
                children: [],
                data: { value: "host" },
              },
            },
            selectedItemIds: [],
          },
        }
      : {}),
  };
}

function resetState(): void {
  registerWorkspaceCreationCommands([]);
  registerWorkspaceMenuActions([]);
  useWorkspaceMenuState.getState().reset();
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
}

describe("workspace menu invocation", () => {
  let canvas: HTMLDivElement;
  let owner: HTMLDivElement;

  beforeEach(() => {
    resetState();
    registerSectionKinds({ leaf: { renderContent: () => null } });
    loadWorkspaceDocument({
      sections: { alpha: createSection("alpha", true), bravo: createSection("bravo") },
      topLevelSections: {
        alpha: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
        bravo: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: -200, y: 100, zoom: 2 },
      activeIds: ["alpha"],
    });
    canvas = document.createElement("div");
    canvas.getBoundingClientRect = () =>
      ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 }) as DOMRect;
    owner = document.createElement("div");
    document.body.append(canvas, owner);
    useReactFlow.setState({ domNode: canvas, transform: [-200, 100, 2] });
  });

  afterEach(() => {
    canvas.remove();
    owner.remove();
    registerSectionKinds({});
    resetState();
  });

  it("publishes a frozen pane context in workspace coordinates only when extensions exist", () => {
    expect(openWorkspacePaneMenu({ x: 500, y: 300 }, owner)).toBe(false);
    registerWorkspaceCreationCommands([
      {
        id: "note",
        label: "Note",
        group: "Host",
        createSection: vi.fn(),
      },
    ]);

    expect(openWorkspacePaneMenu({ x: 500, y: 300 }, owner)).toBe(true);
    const invocation = useWorkspaceMenuState.getState().invocation;
    expect(invocation).toMatchObject({
      kind: "pane",
      clientPoint: { x: 500, y: 300 },
      context: { scope: "pane", workspacePosition: { x: 300, y: 75 } },
    });
    expect(Object.isFrozen(invocation?.context)).toBe(true);
    if (invocation?.context.scope !== "pane") {
      throw new Error("Expected a pane invocation.");
    }
    expect(Object.isFrozen(invocation.context.workspacePosition)).toBe(true);
  });

  it("selects an unselected section and snapshots the resulting selection", () => {
    openWorkspaceSectionMenu("bravo", "section", { x: 20, y: 30 }, owner);

    expect(useActiveSections.getState().activeIds).toEqual(["bravo"]);
    const invocation = useWorkspaceMenuState.getState().invocation;
    expect(invocation).toMatchObject({
      kind: "section",
      initialFocus: "first",
      sectionIds: ["bravo"],
      surface: "context-menu",
      context: { scope: "section", section: { id: "bravo" } },
    });
    expect(Object.isFrozen(invocation?.context)).toBe(true);
  });

  it("preserves an existing multi-selection when invoking one of its sections", () => {
    useActiveSections.setState({ activeIds: ["alpha", "bravo"] });
    openWorkspaceSectionMenu("alpha", "outline", { x: 20, y: 30 }, owner);

    const invocation = useWorkspaceMenuState.getState().invocation;
    expect(invocation).toMatchObject({
      kind: "section",
      sectionIds: ["alpha", "bravo"],
      context: { scope: "outline", selectedSections: [{ id: "alpha" }, { id: "bravo" }] },
    });
  });

  it("marks header invocations and preserves their requested initial focus", () => {
    openWorkspaceSectionHeaderMenu("alpha", { x: 20, y: 30 }, owner, "last");

    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "section",
      initialFocus: "last",
      sectionIds: ["alpha"],
      surface: "header",
      context: { scope: "section", section: { id: "alpha" } },
    });
  });

  it("always snapshots item context for the package delete action", () => {
    expect(openWorkspaceItemMenu("alpha", "alpha-item", { x: 20, y: 30 }, owner)).toBe(true);
    const invocation = useWorkspaceMenuState.getState().invocation;
    expect(invocation).toMatchObject({
      kind: "item",
      context: { scope: "item", section: { id: "alpha" }, item: { id: "alpha-item" } },
    });
    expect(Object.isFrozen(invocation?.context)).toBe(true);
  });
});
