/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";
import type { Node, WorkspaceSection } from "../../document/types";
import { WorkspaceXyflowSelection } from "./WorkspaceXyflowSelection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
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
    children,
  };
}

function createRectElement(rect: {
  height: number;
  width: number;
  x: number;
  y: number;
}): HTMLDivElement {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientHeight: { value: rect.height },
    clientWidth: { value: rect.width },
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.y + rect.height,
      height: rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }) as DOMRect;
  return element;
}

describe("WorkspaceXyflowSelection", () => {
  let canvas: HTMLDivElement;
  let floatingOverlay: HTMLDivElement;
  let pane: HTMLDivElement;
  let renderHost: HTMLDivElement;
  let root: Root;
  let testWorkspace: WorkspaceTestHost;
  let xyflowRoot: HTMLDivElement;

  beforeEach(async () => {
    testWorkspace = createWorkspaceTestHost();
    canvas = createRectElement({ x: 0, y: 0, width: 800, height: 600 });
    floatingOverlay = document.createElement("div");
    renderHost = document.createElement("div");
    xyflowRoot = document.createElement("div");
    pane = document.createElement("div");
    pane.className = "react-flow__pane";
    xyflowRoot.appendChild(pane);
    document.body.append(canvas, renderHost, xyflowRoot, floatingOverlay);
    testWorkspace.document.setState({
      sections: {
        root: createSection("root", ["nested-a", "nested-b"]),
        "nested-a": createSection("nested-a"),
        "nested-b": createSection("nested-b"),
      },
      topLevelSections: {
        root: { x: 400, y: 400, w: 200, h: 100, zIndex: 0 },
      },
      parentSectionMap: { "nested-a": "root", "nested-b": "root" },
    });
    const rootNode: Node = {
      id: "root",
      position: { x: 400, y: 400 },
      width: 200,
      height: 100,
      zIndex: 0,
      tempZIndex: 0,
      kind: "leaf",
    };
    testWorkspace.nodeInternals.setState({
      x: new Map([[rootNode.id, rootNode]]),
    });
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "nested-a": createRectElement({
          x: 20,
          y: 30,
          width: 50,
          height: 40,
        }),
        "nested-b": createRectElement({
          x: 100,
          y: 100,
          width: 60,
          height: 50,
        }),
      },
    });
    testWorkspace.reactFlow.setState({
      domNode: canvas,
      selectionKeyPressed: true,
      transform: [0, 0, 1],
    });
    root = createRoot(renderHost);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowSelection
            rootElement={xyflowRoot}
            selectionPortalElement={pane}
            suppressNextPaneClickRef={{ current: false }}
          />
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    canvas.remove();
    floatingOverlay.remove();
    renderHost.remove();
    xyflowRoot.remove();
    testWorkspace.host.dispose();
  });

  it("selects nested DOM-backed sections and keeps Workspace overlay geometry", async () => {
    await act(async () => {
      pane.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
      pane.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
        }),
      );
    });

    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "nested-a",
      "nested-b",
    ]);
    expect(pane.querySelector(".react-flow__selection")).not.toBeNull();

    await act(async () => {
      pane.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
        }),
      );
    });

    expect(testWorkspace.reactFlow.getState()).toMatchObject({
      nodesSelectionDims: { x: 20, y: 30, width: 140, height: 120 },
      userSelectionActive: false,
      userSelectionRect: null,
    });
    expect(
      pane.querySelector(".react-flow__nodesselection-rect"),
    ).not.toBeNull();
    expect(pane.querySelector(".react-flow__selection")).toBeNull();
  });

  it("starts a Shift marquee when keyboard focus is outside the Workspace host", async () => {
    testWorkspace.reactFlow.setState({ selectionKeyPressed: false });
    let downstreamMouseDown = false;
    pane.addEventListener("mousedown", () => {
      downstreamMouseDown = true;
    });

    await act(async () => {
      pane.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
          shiftKey: true,
        }),
      );
      pane.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
          shiftKey: true,
        }),
      );
    });

    expect(downstreamMouseDown).toBe(false);
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "nested-a",
      "nested-b",
    ]);
    expect(pane.querySelector(".react-flow__selection")).not.toBeNull();

    await act(async () => {
      pane.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
          shiftKey: true,
        }),
      );
    });
  });

  it("keeps a Shift marquee active while crossing a floating overlay", async () => {
    testWorkspace.reactFlow.setState({ selectionKeyPressed: false });

    await act(async () => {
      pane.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
          shiftKey: true,
        }),
      );
      floatingOverlay.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
          shiftKey: true,
        }),
      );
    });

    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "nested-a",
      "nested-b",
    ]);
    expect(pane.querySelector(".react-flow__selection")).not.toBeNull();

    await act(async () => {
      floatingOverlay.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          button: 0,
          clientX: 180,
          clientY: 180,
          shiftKey: true,
        }),
      );
    });

    expect(testWorkspace.reactFlow.getState()).toMatchObject({
      nodesSelectionDims: { x: 20, y: 30, width: 140, height: 120 },
      userSelectionActive: false,
      userSelectionRect: null,
    });
    expect(
      pane.querySelector(".react-flow__nodesselection-rect"),
    ).not.toBeNull();
  });
});
