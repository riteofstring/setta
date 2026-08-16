/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceMenuState } from "../context-menu/workspaceMenuState";
import { useDndState } from "../dnd/dndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { NodesSelectionWrapper } from "./NodesSelection";
import { initialCanvasState, useReactFlow } from "./store";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSection(id: string): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 100, height: 50 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function resetState(): void {
  testWorkspace.menuState.getState().reset();
  testWorkspace.capabilities.getState().reset();
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.dndState.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
}

describe("NodesSelection context menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    resetState();
    registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        alpha: createSection("alpha"),
        bravo: createSection("bravo"),
      },
      topLevelSections: {
        alpha: { x: 0, y: 0, w: 100, h: 50, zIndex: 0 },
        bravo: { x: 150, y: 0, w: 100, h: 50, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["alpha", "bravo"],
    });
    testWorkspace.reactFlow.setState({
      nodesSelectionDims: { x: 0, y: 0, width: 250, height: 50 },
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<NodesSelectionWrapper />
        }</WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
    resetState();
  });

  function getSelection(): HTMLDivElement {
    const selection = host.querySelector<HTMLDivElement>(
      ".react-flow__nodesselection-rect",
    );
    if (!selection) {
      throw new Error("Missing selection rectangle.");
    }
    return selection;
  }

  it("opens the multi-section structural menu from pointer and keyboard", async () => {
    const selection = getSelection();
    expect(selection.getAttribute("aria-keyshortcuts")).toContain("Shift+F10");
    const pointerEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 260,
      clientY: 90,
    });
    await act(async () => selection.dispatchEvent(pointerEvent));
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(testWorkspace.menuState.getState().invocation).toMatchObject({
      kind: "section",
      surface: "context-menu",
      context: {
        scope: "section",
        selectedSections: [{ id: "alpha" }, { id: "bravo" }],
      },
    });

    testWorkspace.menuState.getState().reset();
    selection.getBoundingClientRect = () =>
      ({ left: 10, right: 260, top: 40, width: 250, height: 50 }) as DOMRect;
    await act(async () => {
      selection.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ContextMenu",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(testWorkspace.menuState.getState().invocation).toMatchObject({
      kind: "section",
      clientPoint: { x: 22, y: 64 },
    });
  });

  it("removes the multi-selection bounds layer when only one section remains selected", async () => {
    await act(async () => {
      testWorkspace.activeSections.setState({ activeIds: ["alpha"] });
      testWorkspace.reactFlow.getState().setNodesSelection(1);
    });

    expect(testWorkspace.reactFlow.getState().nodesSelectionDims).toBeNull();
    expect(host.querySelector(".react-flow__nodesselection-rect")).toBeNull();
  });
});
