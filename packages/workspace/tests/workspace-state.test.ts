import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceCapabilities,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function recursiveDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root", title: "Root" },
    { id: "child", title: "Child" },
    { id: "grandchild", title: "Grandchild" },
    { id: "peer", title: "Peer" },
  ]);
  const root = flat.sections.root as WorkspaceSection;
  const child = flat.sections.child as WorkspaceSection;
  return {
    ...flat,
    rootSections: [
      flat.rootSections[0] as (typeof flat.rootSections)[number],
      flat.rootSections[3] as (typeof flat.rootSections)[number],
    ],
    sections: {
      ...flat.sections,
      child: {
        ...child,
        childLayout: {
          orientation: "horizontal",
          overflow: "grow",
          sectionIds: ["grandchild"],
        },
      },
      root: {
        ...root,
        childLayout: { orientation: "vertical", overflow: "grow", sectionIds: ["child"] },
      },
    },
  };
}

describe("workspace capabilities", () => {
  it("resolves granular overrides and lets read-only take precedence", () => {
    expect(resolveWorkspaceCapabilities({ editLayout: false })).toEqual({
      editLayout: false,
      editPresentation: true,
      editStructure: true,
    });
    expect(
      resolveWorkspaceCapabilities(
        { editLayout: true, editPresentation: true, editStructure: true },
        true,
      ),
    ).toEqual({ editLayout: false, editPresentation: false, editStructure: false });
  });

  it("rejects invalid runtime capability values specifically", () => {
    expect(() =>
      resolveWorkspaceCapabilities({ editLayout: "yes" } as unknown as {
        editLayout: boolean;
      }),
    ).toThrow("Workspace capability editLayout must be a boolean");
    expect(() =>
      resolveWorkspaceCapabilities(
        { editStructure: "no" } as unknown as { editStructure: boolean },
        true,
      ),
    ).toThrow("Workspace capability editStructure must be a boolean");
  });
});

describe("workspace controller", () => {
  it("rejects all edit categories in read-only mode while preserving viewport navigation", () => {
    const initialDocument = recursiveDocument();
    const host = new WorkspaceInMemoryHost(initialDocument, { readOnly: true });

    expect(host.controller.setSectionsLocked(["root"], true)).toEqual({
      reason: "layout-edit-disabled",
      status: "rejected",
    });
    expect(host.controller.deleteSections(["child"])).toEqual({
      reason: "structure-edit-disabled",
      status: "rejected",
    });
    expect(host.controller.setSectionMinimized("root", true)).toEqual({
      reason: "presentation-edit-disabled",
      status: "rejected",
    });
    expect(host.controller.setViewport({ x: 40, y: -20, zoom: 1.5 })).toEqual({
      status: "applied",
    });

    expect(host.document().viewport).toEqual({ x: 40, y: -20, zoom: 1.5 });
    expect(host.document().sections).toBe(initialDocument.sections);
    expect(host.changes().map(({ change }) => change.reason)).toEqual(["viewport"]);
  });

  it("uses current capability policy without replacing the controller", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument(), {
      capabilities: { editLayout: false },
    });
    const controller = host.controller;

    expect(controller.setSectionsLocked(["root"], true).status).toBe("rejected");
    host.setPolicy({ capabilities: { editLayout: true } });
    expect(host.controller).toBe(controller);
    expect(controller.setSectionsLocked(["root"], true)).toEqual({ status: "applied" });
    expect(host.document().sections.root?.positionAndSizeLocked).toBe(true);
    expect(controller.getCapabilities().editLayout).toBe(true);
  });

  it("emits no change for no-op commands and fails specifically for unknown sections", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());

    expect(host.controller.setViewport(host.document().viewport)).toEqual({ status: "unchanged" });
    expect(host.controller.setSectionsLocked([], true)).toEqual({ status: "unchanged" });
    expect(host.changes()).toEqual([]);
    expect(() => host.controller.setSectionMinimized("missing", true)).toThrowError(
      expect.objectContaining({ code: "unknown-section" }),
    );
  });

  it("deletes normalized section subtrees with one committed change", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());

    expect(host.controller.deleteSections(["grandchild", "root", "child"])).toEqual({
      status: "applied",
    });

    expect(host.document().rootSections.map(({ sectionId }) => sectionId)).toEqual(["peer"]);
    expect(Object.keys(host.document().sections)).toEqual(["peer"]);
    expect(host.changes()).toHaveLength(1);
    expect(host.changes()[0]?.change.reason).toBe("section-delete");
  });

  it("commits presentation and layout changes in order against uncontrolled memory", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());

    expect(host.controller.setSectionMinimized("root", true)).toEqual({ status: "applied" });
    expect(host.controller.setSectionsLocked(["root", "peer"], true)).toEqual({
      status: "applied",
    });

    expect(host.document().sections.root).toMatchObject({
      isMinimized: true,
      positionAndSizeLocked: true,
    });
    expect(host.document().sections.peer?.positionAndSizeLocked).toBe(true);
    expect(host.changes().map(({ change }) => change.reason)).toEqual([
      "section-minimize",
      "section-lock",
    ]);
  });
});
