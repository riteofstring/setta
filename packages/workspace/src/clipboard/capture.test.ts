import { describe, expect, it } from "vitest";
import { captureWorkspaceClipboardSelection } from "./capture.js";
import type { WorkspaceClipboardCaptureInput } from "./types.js";
import type { WorkspaceSection } from "../document/types.js";

function createSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
  return {
    children,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 80, width: 160 },
    styleColor: null,
    tagColor: null,
  };
}

function createCaptureInput(): WorkspaceClipboardCaptureInput {
  return {
    activeIds: ["parent", "child", "other"],
    parentSectionMap: { child: "parent" },
    sections: {
      child: createSection("child"),
      other: createSection("other"),
      parent: createSection("parent", ["child"]),
    },
    topLevelSections: {
      other: { h: 80, w: 160, x: 320, y: 90, zIndex: 1 },
      parent: { h: 80, w: 160, x: 120, y: 40, zIndex: 0 },
    },
  };
}

describe("workspace clipboard capture", () => {
  it("normalizes selected roots while preserving each complete descendant subtree", () => {
    const captured = captureWorkspaceClipboardSelection(createCaptureInput());

    expect(captured.fragment.roots).toEqual(["parent", "other"]);
    expect(Object.keys(captured.fragment.sections)).toEqual([
      "parent",
      "child",
      "other",
    ]);
    expect(captured.fragment.sections.parent?.children).toEqual(["child"]);
    expect(captured.fragment.topLevelLayouts).toEqual({
      other: { h: 80, w: 160, x: 200, y: 50, zIndex: 1 },
      parent: { h: 80, w: 160, x: 0, y: 0, zIndex: 0 },
    });
    expect(Object.isFrozen(captured.fragment)).toBe(true);
    expect(Object.isFrozen(captured.fragment.roots)).toBe(true);
    expect(Object.isFrozen(captured.fragment.sections)).toBe(true);
    expect(Object.isFrozen(captured.source)).toBe(true);
    expect(Object.isFrozen(captured.source.sections.parent)).toBe(true);
  });

  it("rejects a descendant cycle before producing a fragment", () => {
    const input = createCaptureInput();
    const cyclic: WorkspaceClipboardCaptureInput = {
      ...input,
      activeIds: ["parent"],
      parentSectionMap: { child: "parent", parent: "child" },
    };

    expect(() => captureWorkspaceClipboardSelection(cyclic)).toThrow(
      "cyclic parent chain",
    );
  });

  it("promotes nested roots with their own dimensions and distinct placement", () => {
    const captured = captureWorkspaceClipboardSelection({
      activeIds: ["child", "sibling"],
      parentSectionMap: { child: "parent", sibling: "parent" },
      sections: {
        child: {
          ...createSection("child"),
          size: { height: 90, width: 140 },
        },
        parent: createSection("parent", ["child", "sibling"]),
        sibling: {
          ...createSection("sibling"),
          size: { height: 100, width: 180 },
        },
      },
      topLevelSections: {
        parent: { h: 320, w: 480, x: 120, y: 40, zIndex: 2 },
      },
    });

    expect(captured.fragment.topLevelLayouts).toEqual({
      child: { h: 90, w: 140, x: 0, y: 0, zIndex: 2 },
      sibling: { h: 100, w: 180, x: 40, y: 40, zIndex: 2 },
    });
  });
});
