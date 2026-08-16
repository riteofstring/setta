/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReactFlowStore, initialCanvasState } from "../canvas/store";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  openWorkspaceItemMenu,
  openWorkspacePaneMenu,
  openWorkspaceSectionHeaderMenu,
  openWorkspaceSectionMenu,
} from "./workspaceMenuInvocation";
import { registerWorkspaceCreationCommands } from "./workspaceMenuRegistry";
import { getWorkspaceMenuStateStore } from "./workspaceMenuState";

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

function resetState(host: WorkspaceHost): void {
  registerWorkspaceCreationCommands(host, []);
  registerWorkspaceCommands(host, []);
  getWorkspaceMenuStateStore(host).getState().reset();
  getWorkspaceDocumentStore(host).getState().reset();
  getNodeInternalsStore(host).getState().reset();
  getActiveSectionsStore(host).getState().reset();
  getReactFlowStore(host).setState({ ...initialCanvasState });
}

describe("workspace menu invocation", () => {
  let host: WorkspaceHost;
  let canvas: HTMLDivElement;
  let owner: HTMLDivElement;

  beforeEach(() => {
    host = createWorkspaceHost();
    resetState(host);
    registerSectionKinds(host, {
      leaf: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
      },
    });
    host.loadDocument({
      sections: {
        alpha: createSection("alpha", true),
        bravo: createSection("bravo"),
      },
      topLevelSections: {
        alpha: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
        bravo: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
      },
      viewport: { x: -200, y: 100, zoom: 2 },
      activeIds: ["alpha"],
    });
    canvas = document.createElement("div");
    canvas.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        right: 900,
        bottom: 650,
        width: 800,
        height: 600,
      }) as DOMRect;
    owner = document.createElement("div");
    document.body.append(canvas, owner);
    getReactFlowStore(host).setState({
      domNode: canvas,
      transform: [-200, 100, 2],
    });
  });

  afterEach(() => {
    canvas.remove();
    owner.remove();
    host.dispose();
  });

  it("publishes a frozen pane context in workspace coordinates only when extensions exist", () => {
    expect(openWorkspacePaneMenu(host, { x: 500, y: 300 }, owner)).toBe(false);
    registerWorkspaceCreationCommands(host, [
      {
        id: "note",
        label: "Note",
        group: "Host",
        createSection: vi.fn(),
      },
    ]);

    expect(openWorkspacePaneMenu(host, { x: 500, y: 300 }, owner)).toBe(true);
    const invocation = getWorkspaceMenuStateStore(host).getState().invocation;
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
    openWorkspaceSectionMenu(
      host,
      "bravo",
      "context-menu",
      { x: 20, y: 30 },
      owner,
    );

    expect(getActiveSectionsStore(host).getState().activeIds).toEqual([
      "bravo",
    ]);
    const invocation = getWorkspaceMenuStateStore(host).getState().invocation;
    expect(invocation).toMatchObject({
      kind: "section",
      initialFocus: "first",
      surface: "context-menu",
      context: {
        scope: "section",
        section: { id: "bravo" },
        selectedSections: [{ id: "bravo" }],
      },
    });
    expect(Object.isFrozen(invocation?.context)).toBe(true);
  });

  it("preserves an existing multi-selection when invoking one of its sections", () => {
    getActiveSectionsStore(host).setState({ activeIds: ["alpha", "bravo"] });
    openWorkspaceSectionMenu(host, "alpha", "outline", { x: 20, y: 30 }, owner);

    const invocation = getWorkspaceMenuStateStore(host).getState().invocation;
    expect(invocation).toMatchObject({
      kind: "section",
      surface: "outline",
      context: {
        scope: "section",
        selectedSections: [{ id: "alpha" }, { id: "bravo" }],
      },
    });
  });

  it("marks header invocations and preserves their requested initial focus", () => {
    openWorkspaceSectionHeaderMenu(
      host,
      "alpha",
      { x: 20, y: 30 },
      owner,
      "last",
    );

    expect(
      getWorkspaceMenuStateStore(host).getState().invocation,
    ).toMatchObject({
      kind: "section",
      initialFocus: "last",
      surface: "header",
      context: {
        scope: "section",
        section: { id: "alpha" },
        selectedSections: [{ id: "alpha" }],
      },
    });
  });

  it("always snapshots item context for the package delete action", () => {
    expect(
      openWorkspaceItemMenu(
        host,
        "alpha",
        "alpha-item",
        { x: 20, y: 30 },
        owner,
      ),
    ).toBe(true);
    const invocation = getWorkspaceMenuStateStore(host).getState().invocation;
    expect(invocation).toMatchObject({
      kind: "item",
      context: {
        scope: "item",
        section: { id: "alpha" },
        item: { id: "alpha-item" },
      },
    });
    expect(Object.isFrozen(invocation?.context)).toBe(true);
  });
});
