import { describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "../document/documentSelectors";
import type { WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  createWorkspaceOutlineTree,
  findWorkspaceOutlineTypeaheadMatch,
  getValidWorkspaceOutlineCollapsedGroupIds,
  getWorkspaceOutlineVisibleEntries,
  resolveWorkspaceOutlineFocus,
} from "./workspaceOutlineModel";

function createSection(
  id: string,
  children: Array<string> = [],
  kind = children.length > 0 ? GROUP_SECTION_KIND : "leaf",
): WorkspaceSection {
  return {
    id,
    kind,
    name: id,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children,
  };
}

function createDocument(): WorkspaceDocumentState {
  return {
    sections: {
      alpha: createSection("alpha", ["bravo", "group-charlie"]),
      bravo: createSection("bravo"),
      "group-charlie": createSection("group-charlie", ["delta"]),
      delta: createSection("delta"),
      echo: createSection("echo"),
    },
    topLevelSections: {
      alpha: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
      echo: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
    },
    viewport: null,
    parentSectionMap: {
      bravo: "alpha",
      "group-charlie": "alpha",
      delta: "group-charlie",
    },
  };
}

describe("workspace Outline model", () => {
  it("projects top-level and recursive child arrays in canonical document order", () => {
    const entries = getWorkspaceOutlineVisibleEntries(
      createWorkspaceOutlineTree(createDocument()),
      [],
    );

    expect(
      entries.map((entry) => ({
        id: entry.section.id,
        depth: entry.depth,
        parent: entry.parentSectionId,
        position: `${entry.positionInSet}/${entry.setSize}`,
      })),
    ).toEqual([
      { id: "alpha", depth: 0, parent: null, position: "1/2" },
      { id: "bravo", depth: 1, parent: "alpha", position: "1/2" },
      { id: "group-charlie", depth: 1, parent: "alpha", position: "2/2" },
      { id: "delta", depth: 2, parent: "group-charlie", position: "1/1" },
      { id: "echo", depth: 0, parent: null, position: "2/2" },
    ]);
  });

  it("removes collapsed descendants from the visible projection without changing the tree", () => {
    const tree = createWorkspaceOutlineTree(createDocument());

    expect(
      getWorkspaceOutlineVisibleEntries(tree, ["group-charlie"]).map((entry) => entry.section.id),
    ).toEqual(["alpha", "bravo", "group-charlie", "echo"]);
    expect(tree[0]?.children[1]?.children[0]?.section.id).toBe("delta");
  });

  it("restores hidden focus to its visible ancestor and deleted focus to the same row position", () => {
    const state = createDocument();
    const tree = createWorkspaceOutlineTree(state);
    const previous = getWorkspaceOutlineVisibleEntries(tree, []);
    const collapsed = getWorkspaceOutlineVisibleEntries(tree, ["group-charlie"]);

    expect(resolveWorkspaceOutlineFocus(state, previous, collapsed, "delta")).toBe("group-charlie");

    const deletedState = createDocument();
    delete deletedState.sections.bravo;
    const alpha = deletedState.sections.alpha;
    if (!alpha) {
      throw new Error("Expected alpha group in the Outline test document.");
    }
    deletedState.sections.alpha = {
      ...alpha,
      children: ["group-charlie"],
    };
    delete deletedState.parentSectionMap.bravo;
    const afterDelete = getWorkspaceOutlineVisibleEntries(
      createWorkspaceOutlineTree(deletedState),
      [],
    );
    expect(resolveWorkspaceOutlineFocus(deletedState, previous, afterDelete, "bravo")).toBe(
      "group-charlie",
    );
  });

  it("prunes collapsed ids that no longer name groups", () => {
    expect(
      getValidWorkspaceOutlineCollapsedGroupIds(createDocument(), [
        "alpha",
        "bravo",
        "missing",
        "group-charlie",
      ]),
    ).toEqual(["alpha", "group-charlie"]);
  });

  it("finds visible names cyclically after the current row", () => {
    const entries = getWorkspaceOutlineVisibleEntries(
      createWorkspaceOutlineTree(createDocument()),
      [],
    );

    expect(findWorkspaceOutlineTypeaheadMatch(entries, "echo", "br")).toBe("bravo");
    expect(findWorkspaceOutlineTypeaheadMatch(entries, "bravo", "d")).toBe("delta");
    expect(findWorkspaceOutlineTypeaheadMatch(entries, "alpha", "z")).toBeNull();
  });
});
