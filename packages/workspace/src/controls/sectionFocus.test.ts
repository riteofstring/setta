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

import { afterEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import type { WorkspaceDocumentState } from "../document/stores";
import { useSectionRefs } from "../section/sectionRefs";
import {
  focusSectionAfterEscape,
  resolveSectionFocusAfterRemoval,
  restoreFocusAfterSectionRemoval,
} from "./sectionFocus";

function makeState(): WorkspaceDocumentState {
  return {
    sections: {
      first: makeSection("first"),
      second: makeSection("second"),
      group: makeSection("group", ["nested-a", "nested-b"]),
      "nested-a": makeSection("nested-a"),
      "nested-b": makeSection("nested-b"),
    },
    topLevelSections: {
      first: { x: 0, y: 0, w: 100, h: 100, zIndex: 0 },
      second: { x: 120, y: 0, w: 100, h: 100, zIndex: 1 },
      group: { x: 240, y: 0, w: 100, h: 100, zIndex: 2 },
    },
    viewport: null,
    parentSectionMap: { "nested-a": "group", "nested-b": "group" },
  };
}

function makeSection(id: string, children: Array<string> = []) {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 100, height: 100 } as const,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children,
  };
}

afterEach(() => {
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
  testWorkspace.sectionRefs.getState().reset();
});

describe("section removal focus", () => {
  it("prefers the named leaf shell over its positional outer wrapper", () => {
    const outer = document.createElement("div");
    const leafShell = document.createElement("div");
    outer.tabIndex = -1;
    leafShell.tabIndex = -1;
    document.body.append(outer, leafShell);
    testWorkspace.sectionRefs.setState({
      withNested: { first: outer },
      selfOnly: { first: leafShell },
    });

    focusSectionAfterEscape(testWorkspace.host, "first");

    expect(document.activeElement).toBe(leafShell);
    outer.remove();
    leafShell.remove();
  });

  it("prefers the next sibling, then the previous sibling", () => {
    const state = makeState();
    expect(resolveSectionFocusAfterRemoval(state, "first")).toBe("second");
    expect(resolveSectionFocusAfterRemoval(state, "group")).toBe("second");
    expect(resolveSectionFocusAfterRemoval(state, "nested-a")).toBe("nested-b");
  });

  it("returns the parent after its only nested child and the pane after the only root", () => {
    const nestedState = makeState();
    nestedState.sections["group"] = makeSection("group", ["nested-a"]);
    expect(resolveSectionFocusAfterRemoval(nestedState, "nested-a")).toBe(
      "group",
    );

    const rootState = makeState();
    rootState.sections = { first: makeSection("first") };
    rootState.topLevelSections = {
      first: { x: 0, y: 0, w: 100, h: 100, zIndex: 0 },
    };
    rootState.parentSectionMap = {};
    expect(resolveSectionFocusAfterRemoval(rootState, "first")).toBeNull();
  });

  it("fails specifically for unknown or structurally unlisted sections", () => {
    const state = makeState();
    expect(() => resolveSectionFocusAfterRemoval(state, "missing")).toThrow(
      "Cannot resolve removal focus for unknown section missing.",
    );
    delete state.topLevelSections["first"];
    expect(() => resolveSectionFocusAfterRemoval(state, "first")).toThrow(
      "Section first is missing from its rendered sibling order.",
    );
  });

  it("restores the final root's focus to the mounted canvas pane", async () => {
    const canvas = document.createElement("div");
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    pane.tabIndex = -1;
    canvas.appendChild(pane);
    document.body.appendChild(canvas);
    testWorkspace.reactFlow.setState({ domNode: canvas });

    restoreFocusAfterSectionRemoval(testWorkspace.host, null);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(document.activeElement).toBe(pane);
    canvas.remove();
  });
});
