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

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveSectionIds } from "../document/activeSections";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import { useSectionRefs } from "../section/sectionRefs";
import { focusAdjacentTopLevelSection } from "./sectionNavigation";
import { useWorkspaceFocusScope } from "./workspaceFocusScopes";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function CanvasScope() {
  const ref = useRef<HTMLDivElement>(null);
  useWorkspaceFocusScope("canvas", ref);
  return <div data-scope-root="canvas" ref={ref} />;
}

function leafSection(id: string, name: string) {
  return {
    id,
    kind: "leaf",
    name,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

// "top" and "bottom" are leaves stacked vertically with a group between them, so the reading
// order is top, middle group, bottom regardless of the order they mounted in.
function loadNavigationDocument() {
  registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      top: leafSection("top", "Top"),
      middle: {
        ...leafSection("middle", "Middle"),
        kind: "group",
        size: { width: "auto", height: "auto" },
        children: ["nested"],
      },
      nested: leafSection("nested", "Nested"),
      bottom: leafSection("bottom", "Bottom"),
    },
    topLevelSections: {
      top: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
      middle: { x: 0, y: 200, w: null, h: null, zIndex: 1 },
      bottom: { x: 0, y: 400, w: 200, h: 100, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

describe("focusAdjacentTopLevelSection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scopeRoot: HTMLElement;
  let unregisterHostElement: () => void;
  const controls = new Map<string, HTMLButtonElement>();

  function mountSection(sectionId: string, hasControl: boolean): HTMLElement {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    node.dataset["id"] = sectionId;
    node.tabIndex = -1;
    scopeRoot.appendChild(node);
    if (hasControl) {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = `${sectionId} control`;
      node.appendChild(control);
      controls.set(sectionId, control);
    }
    return node;
  }

  function requireControl(sectionId: string): HTMLButtonElement {
    const control = controls.get(sectionId);
    if (!control) {
      throw new Error(`Test section ${sectionId} has no control.`);
    }
    return control;
  }

  beforeEach(async () => {
    controls.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    unregisterHostElement = registerWorkspaceHostElement(testWorkspace.host, host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<CanvasScope />
        }</WorkspaceTestProvider>,
      );
    });
    const mountedScope = host.querySelector<HTMLElement>(
      '[data-scope-root="canvas"]',
    );
    if (!mountedScope) {
      throw new Error("Canvas scope root did not mount.");
    }
    scopeRoot = mountedScope;
    loadNavigationDocument();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    unregisterHostElement();
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  function mountAllSections() {
    const bottom = mountSection("bottom", true);
    const middle = mountSection("middle", true);
    const top = mountSection("top", true);
    testWorkspace.sectionRefs.setState({
      withNested: { top, middle, bottom },
      selfOnly: { top, bottom },
    });
  }

  it("enters the canvas at the first section in reading order and makes it active", () => {
    mountAllSections();

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(true);
    expect(document.activeElement).toBe(requireControl("top"));
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["top"]);
  });

  it("enters from the other end when it is travelling backwards", () => {
    mountAllSections();

    expect(focusAdjacentTopLevelSection(testWorkspace.host, -1)).toBe(true);
    expect(document.activeElement).toBe(requireControl("bottom"));
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["bottom"]);
  });

  it("walks forwards and backwards from the section the keyboard is inside", () => {
    mountAllSections();
    requireControl("top").focus();

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["middle"]);

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(true);
    expect(document.activeElement).toBe(requireControl("bottom"));
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["bottom"]);

    expect(focusAdjacentTopLevelSection(testWorkspace.host, -1)).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["middle"]);
  });

  // A group is one target: focus lands on the group itself instead of reaching into a child.
  it("focuses a group as a whole", () => {
    mountAllSections();
    requireControl("top").focus();

    focusAdjacentTopLevelSection(testWorkspace.host, 1);

    expect(document.activeElement).toBe(
      scopeRoot.querySelector('[data-id="middle"]'),
    );
  });

  it("stops at the ends of the order and leaves the selection alone", () => {
    mountAllSections();
    requireControl("bottom").focus();
    testWorkspace.activeSections.setState({ activeIds: ["bottom"] });

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(false);
    expect(document.activeElement).toBe(requireControl("bottom"));
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["bottom"]);
  });

  it("ignores focus outside the canvas and starts from the boundary again", () => {
    mountAllSections();
    const outside = document.createElement("button");
    outside.type = "button";
    document.body.appendChild(outside);
    outside.focus();

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(true);
    expect(document.activeElement).toBe(requireControl("top"));
    outside.remove();
  });

  it("declines a target that has not mounted without changing the selection", () => {
    const bottom = mountSection("bottom", true);
    testWorkspace.sectionRefs.setState({ withNested: { bottom }, selfOnly: { bottom } });
    testWorkspace.activeSections.setState({ activeIds: ["bottom"] });

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(false);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["bottom"]);
  });

  it("falls back to the section container when a leaf offers no control", () => {
    const top = mountSection("top", false);
    testWorkspace.sectionRefs.setState({ withNested: { top }, selfOnly: { top } });

    expect(focusAdjacentTopLevelSection(testWorkspace.host, 1)).toBe(true);
    expect(document.activeElement).toBe(top);
  });
});
