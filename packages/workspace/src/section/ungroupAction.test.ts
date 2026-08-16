/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNodeDimensionsFromResizeObserver } from "../canvas/nodeInternalsActions";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSectionInput } from "../document/types";
import { useSectionRefs } from "./sectionRefs";
import { ungroupSections } from "./ungroupAction";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";

function makeSection(
  id: string,
  kind = "leaf",
  children: Array<string> = [],
): WorkspaceSectionInput {
  return {
    id,
    kind,
    name: id,
    size: { width: 120, height: 80 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children,
  };
}

function loadUngroupDocument(): void {
  registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      group: makeSection("group", "group", ["child-a", "child-b"]),
      "child-a": makeSection("child-a"),
      "child-b": makeSection("child-b"),
      sibling: makeSection("sibling"),
    },
    topLevelSections: {
      group: { x: 200, y: 40, w: null, h: null, zIndex: 1 },
      sibling: { x: 500, y: 40, w: 120, h: 80, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["group", "sibling"],
  });
}

describe("ungroupSections", () => {
  beforeEach(() => {
    testWorkspace.capabilities.getState().reset();
    testWorkspace.reactFlow.setState({
      ...initialCanvasState,
      nodesSelectionDims: { x: 1, y: 2, width: 3, height: 4 },
    });
    loadUngroupDocument();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    vi.unstubAllGlobals();
  });

  it("publishes document, geometry, and selection atomically with one notification", () => {
    const onChange = vi.fn();
    let observedDocumentHasGroup = true;
    let observedActiveIds: Array<string> = [];
    const unsubscribe = testWorkspace.nodeInternals.subscribe(() => {
      observedDocumentHasGroup =
        testWorkspace.document.getState().sections["group"] !== undefined;
      observedActiveIds = testWorkspace.activeSections.getState().activeIds;
    });
    testWorkspace.host.subscribe(onChange);

    ungroupSections(testWorkspace.host, ["group"]);
    unsubscribe();

    expect(observedDocumentHasGroup).toBe(false);
    expect(observedActiveIds).toEqual(["sibling"]);
    expect(testWorkspace.nodeInternals.getState().x.has("group")).toBe(false);
    expect(testWorkspace.nodeInternals.getState().x.has("child-a")).toBe(true);
    expect(testWorkspace.reactFlow.getState().nodesSelectionDims).toBeNull();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].activeIds).toEqual(["sibling"]);
  });

  it("includes mounted promoted sizes in the one notification and ignores matching remeasurement", () => {
    const canvas = document.createElement("div");
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    canvas.append(viewport);
    testWorkspace.reactFlow.setState({ domNode: canvas });

    const childA = document.createElement("div");
    childA.dataset["id"] = "child-a";
    Object.defineProperties(childA, {
      offsetWidth: { configurable: true, value: 121 },
      offsetHeight: { configurable: true, value: 81 },
    });
    const childB = document.createElement("div");
    childB.dataset["id"] = "child-b";
    Object.defineProperties(childB, {
      offsetWidth: { configurable: true, value: 141 },
      offsetHeight: { configurable: true, value: 91 },
    });
    testWorkspace.sectionRefs.setState({
      withNested: { "child-a": childA, "child-b": childB },
    });

    const reported: Array<ReturnType<typeof testWorkspace.document.getState>> =
      [];
    testWorkspace.host.subscribe(() => {
      reported.push(testWorkspace.document.getState());
    });

    ungroupSections(testWorkspace.host, ["group"]);
    updateNodeDimensionsFromResizeObserver(testWorkspace.host, [
      { target: childA } as unknown as ResizeObserverEntry,
      { target: childB } as unknown as ResizeObserverEntry,
    ]);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.topLevelSections["child-a"]).toMatchObject({
      w: 121,
      h: 81,
    });
    expect(reported[0]?.topLevelSections["child-b"]).toMatchObject({
      w: 141,
      h: 91,
    });
  });

  it("rejects unavailable structure capability without changing any store", () => {
    const beforeDocument = testWorkspace.document.getState();
    const beforeNodes = testWorkspace.nodeInternals.getState().x;
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);
    testWorkspace.capabilities.setState({ canEditStructure: false });

    expect(() => ungroupSections(testWorkspace.host, ["group"])).toThrow(
      "Ungrouping requires permission to edit workspace structure.",
    );
    expect(testWorkspace.document.getState()).toBe(beforeDocument);
    expect(testWorkspace.nodeInternals.getState().x).toBe(beforeNodes);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves canvas focus from the removed group control to its first promoted child", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const group = document.createElement("div");
    const trigger = document.createElement("button");
    const child = document.createElement("div");
    child.tabIndex = -1;
    group.appendChild(trigger);
    document.body.append(group, child);
    const unregisterHostElement = registerWorkspaceHostElement(
      testWorkspace.host,
      group,
    );
    testWorkspace.sectionRefs.setState({
      withNested: { group, "child-a": child },
      selfOnly: { "child-a": child },
    });
    trigger.focus();

    try {
      ungroupSections(testWorkspace.host, ["group"]);

      expect(document.activeElement).toBe(child);
    } finally {
      unregisterHostElement();
      group.remove();
      child.remove();
    }
  });

  it("keeps an Outline invocation in the Outline after the group disappears", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const outline = document.createElement("div");
    outline.setAttribute("role", "tree");
    outline.setAttribute("aria-label", "Workspace outline");
    const groupRow = document.createElement("div");
    groupRow.dataset["workspaceOutlineItem"] = "group";
    groupRow.tabIndex = 0;
    const childRow = document.createElement("div");
    childRow.dataset["workspaceOutlineItem"] = "child-a";
    childRow.tabIndex = -1;
    outline.append(groupRow, childRow);
    document.body.append(outline);
    const unregisterHostElement = registerWorkspaceHostElement(
      testWorkspace.host,
      outline,
    );
    groupRow.focus();

    try {
      ungroupSections(testWorkspace.host, ["group"]);

      expect(document.activeElement).toBe(childRow);
    } finally {
      unregisterHostElement();
      outline.remove();
    }
  });
});
