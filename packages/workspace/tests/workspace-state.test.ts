import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceCapabilities,
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import {
  createWorkspaceController,
  moveWorkspaceRootSections,
  resizeWorkspaceRootSection,
  setWorkspaceSectionContentSize,
} from "../src/internal/workspace-controller.js";
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
    expect(() =>
      resolveWorkspaceCapabilities({ editLayout: null } as unknown as { editLayout: boolean }),
    ).toThrow("Workspace capability editLayout must be a boolean");
    expect(() =>
      resolveWorkspaceCapabilities({ unknown: true } as unknown as { editLayout: boolean }),
    ).toThrow("Unknown workspace capability option unknown");
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
    expect(host.controller.setSectionTitle("root", "Renamed")).toEqual({
      reason: "presentation-edit-disabled",
      status: "rejected",
    });
    expect(
      host.controller.setSectionPresentation("root", {
        accentColor: "oklch(0.62 0.14 255)",
        chrome: "compact",
        tagColor: null,
      }),
    ).toEqual({ reason: "presentation-edit-disabled", status: "rejected" });
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
    expect(host.controller.groupSections(["root", "peer"])).toEqual({
      reason: "grouping-unavailable",
      status: "rejected",
    });
    expect(host.controller.ungroupSection("root")).toEqual({
      reason: "grouping-unavailable",
      status: "rejected",
    });
    expect(host.changes()).toEqual([]);
    expect(() => host.controller.setSectionMinimized("missing", true)).toThrowError(
      expect.objectContaining({ code: "unknown-section" }),
    );
    expect(() => host.controller.ungroupSection("missing")).toThrowError(
      expect.objectContaining({ code: "unknown-section" }),
    );
  });

  it("rejects malformed controller arguments before publishing a change", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());
    const sparseSectionIds = ["root"];
    delete sparseSectionIds[0];

    expect(() => host.controller.deleteSections(sparseSectionIds)).toThrow(
      "Workspace section IDs must be a dense array without extra fields",
    );
    expect(() => host.controller.setSectionMinimized("root", "yes" as unknown as boolean)).toThrow(
      "Workspace minimized state must be a boolean",
    );
    expect(() => host.controller.setSectionsLocked(["root"], null as unknown as boolean)).toThrow(
      "Workspace locked state must be a boolean",
    );
    expect(() => host.controller.setSectionTitle("root", "   ")).toThrow(
      "Workspace section title must not be empty",
    );
    expect(() =>
      host.controller.setSectionPresentation("root", {
        accentColor: "not a color",
        chrome: "default",
        tagColor: null,
      }),
    ).toThrow("accent color must be null or a valid color");
    expect(() =>
      host.controller.setViewport(null as unknown as { x: number; y: number; zoom: number }),
    ).toThrow("Workspace viewport must be an object");
    expect(host.changes()).toEqual([]);
  });

  it("fails clipboard controller calls specifically when no React adapter is configured", async () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());

    await expect(host.controller.copySelection()).resolves.toEqual({
      reason: "clipboard-unavailable",
      status: "rejected",
    });
    await expect(host.controller.paste()).resolves.toEqual({
      reason: "clipboard-unavailable",
      status: "rejected",
    });
    expect(host.changes()).toEqual([]);
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

  it("preserves a section whose ID is an object prototype mutator", () => {
    const host = new WorkspaceInMemoryHost(
      createWorkspaceTestDocument([
        { id: "__proto__", title: "Prototype section" },
        { id: "peer", title: "Peer" },
      ]),
    );

    expect(host.controller.deleteSections(["peer"])).toEqual({ status: "applied" });
    expect(Object.hasOwn(host.document().sections, "__proto__")).toBe(true);
    expect(host.document().sections.__proto__).toMatchObject({ id: "__proto__" });
    expect(Object.getPrototypeOf(host.document().sections)).toBe(Object.prototype);
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

  it("normalizes titles and commits scoped presentation with one change each", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());
    const presentation = {
      accentColor: "oklch(0.62 0.14 255)",
      chrome: "compact",
      tagColor: "oklch(0.72 0.11 80)",
    } as const;

    expect(host.controller.setSectionTitle("root", "  Planning note  ")).toEqual({
      status: "applied",
    });
    expect(host.controller.setSectionPresentation("root", presentation)).toEqual({
      status: "applied",
    });
    expect(host.document().sections.root).toMatchObject({
      presentation,
      title: "Planning note",
    });
    expect(host.changes().map(({ change }) => change.reason)).toEqual([
      "section-title",
      "section-presentation",
    ]);
    expect(host.controller.setSectionTitle("root", "Planning note")).toEqual({
      status: "unchanged",
    });
    expect(host.controller.setSectionPresentation("root", presentation)).toEqual({
      status: "unchanged",
    });
    expect(host.changes()).toHaveLength(2);
  });

  it("rejects accessor-backed presentation without evaluating it", () => {
    const host = new WorkspaceInMemoryHost(recursiveDocument());
    let evaluated = false;
    const presentation = Object.defineProperty(
      { chrome: "default", tagColor: null },
      "accentColor",
      {
        enumerable: true,
        get: () => {
          evaluated = true;
          return null;
        },
      },
    );

    expect(() =>
      host.controller.setSectionPresentation(
        "root",
        presentation as unknown as WorkspaceSection["presentation"],
      ),
    ).toThrow("workspace section presentation field accentColor");
    expect(evaluated).toBe(false);
    expect(host.changes()).toEqual([]);
  });

  it("moves root sections atomically without changing stacking or section records", () => {
    let document = recursiveDocument();
    const initialSections = document.sections;
    const changes: string[] = [];
    const bindings = {
      commit: (nextDocument: WorkspaceDocument, change: { reason: string }) => {
        document = nextDocument;
        changes.push(change.reason);
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    };

    expect(
      moveWorkspaceRootSections(bindings, {
        peer: { x: -48, y: 72 },
        root: { x: 96, y: 24 },
      }),
    ).toEqual({ status: "applied" });
    expect(document.rootSections).toEqual([
      { position: { x: 96, y: 24 }, sectionId: "root" },
      { position: { x: -48, y: 72 }, sectionId: "peer" },
    ]);
    expect(document.sections).toBe(initialSections);
    expect(changes).toEqual(["section-move"]);
    expect(
      moveWorkspaceRootSections(bindings, {
        peer: { x: -48, y: 72 },
        root: { x: 96, y: 24 },
      }),
    ).toEqual({ status: "unchanged" });
    expect(changes).toEqual(["section-move"]);
  });

  it("rejects root movement when layout policy, containment, or locking disallows it", () => {
    const document = recursiveDocument();
    const lockedRoot = document.sections.root as WorkspaceSection;
    const lockedDocument: WorkspaceDocument = {
      ...document,
      sections: {
        ...document.sections,
        root: { ...lockedRoot, positionAndSizeLocked: true },
      },
    };
    const bindings = (currentDocument: WorkspaceDocument, editLayout: boolean) => ({
      commit: () => {
        throw new Error("A rejected root move must not commit.");
      },
      getCapabilities: () => ({ ...WORKSPACE_DEFAULT_CAPABILITIES, editLayout }),
      getDocument: () => currentDocument,
    });

    expect(
      moveWorkspaceRootSections(bindings(document, false), { root: { x: 24, y: 24 } }),
    ).toEqual({ reason: "layout-edit-disabled", status: "rejected" });
    expect(
      moveWorkspaceRootSections(bindings(lockedDocument, true), { root: { x: 24, y: 24 } }),
    ).toEqual({ reason: "section-locked", status: "rejected" });
    expect(
      moveWorkspaceRootSections(bindings(document, true), { child: { x: 24, y: 24 } }),
    ).toEqual({ reason: "section-not-root", status: "rejected" });
  });

  it("rejects malformed root positions without evaluating accessors", () => {
    const document = recursiveDocument();
    const bindings = {
      commit: () => {
        throw new Error("Malformed root movement must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    };
    let evaluated = false;
    const positions = Object.defineProperty({}, "root", {
      enumerable: true,
      get: () => {
        evaluated = true;
        return { x: 24, y: 24 };
      },
    });

    expect(() =>
      moveWorkspaceRootSections(
        bindings,
        positions as Readonly<Record<string, { x: number; y: number }>>,
      ),
    ).toThrow("Invalid workspace root position field root");
    expect(evaluated).toBe(false);
  });

  it("commits root resize and per-axis content mode transitions atomically", () => {
    const initialDocument = recursiveDocument();
    const root = initialDocument.sections.root as WorkspaceSection;
    let document: WorkspaceDocument = {
      ...initialDocument,
      sections: {
        ...initialDocument.sections,
        root: {
          ...root,
          size: { ...root.size, width: { mode: "content", value: 240 } },
        },
      },
    };
    const changes: string[] = [];
    const bindings = {
      commit: (nextDocument: WorkspaceDocument, change: { reason: string }) => {
        document = nextDocument;
        changes.push(change.reason);
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    };

    expect(
      resizeWorkspaceRootSection(bindings, "root", ["width"], {
        position: { x: -20, y: 0 },
        size: { height: 196.5, width: 276.25 },
      }),
    ).toEqual({ status: "applied" });
    expect(document.rootSections[0]).toEqual({
      position: { x: -20, y: 0 },
      sectionId: "root",
    });
    expect(document.sections.root?.size).toEqual({
      height: { mode: "fixed", value: 180 },
      width: { mode: "fixed", value: 276.25 },
    });
    expect(changes).toEqual(["section-resize"]);

    expect(setWorkspaceSectionContentSize(bindings, "root", ["width"])).toEqual({
      status: "applied",
    });
    expect(document.sections.root?.size.width).toEqual({ mode: "content", value: 276.25 });
    expect(document.sections.root?.size.height).toEqual({ mode: "fixed", value: 180 });
    expect(changes).toEqual(["section-resize", "section-size-mode"]);
    expect(setWorkspaceSectionContentSize(bindings, "root", ["width"])).toEqual({
      status: "unchanged",
    });
    expect(changes).toHaveLength(2);
  });

  it("rejects root sizing when policy, containment, locking, or minimization disallows it", () => {
    const document = recursiveDocument();
    const root = document.sections.root as WorkspaceSection;
    const bindings = (currentDocument: WorkspaceDocument, editLayout: boolean) => ({
      commit: () => {
        throw new Error("A rejected root size command must not commit.");
      },
      getCapabilities: () => ({ ...WORKSPACE_DEFAULT_CAPABILITIES, editLayout }),
      getDocument: () => currentDocument,
    });
    const resize = {
      position: { x: 0, y: 0 },
      size: { height: 192, width: 264 },
    } as const;
    const locked: WorkspaceDocument = {
      ...document,
      sections: {
        ...document.sections,
        root: { ...root, positionAndSizeLocked: true },
      },
    };
    const minimized: WorkspaceDocument = {
      ...document,
      sections: { ...document.sections, root: { ...root, isMinimized: true } },
    };

    expect(
      resizeWorkspaceRootSection(bindings(document, false), "root", ["width"], resize),
    ).toEqual({ reason: "layout-edit-disabled", status: "rejected" });
    expect(
      resizeWorkspaceRootSection(bindings(document, true), "child", ["width"], resize),
    ).toEqual({ reason: "section-not-root", status: "rejected" });
    expect(resizeWorkspaceRootSection(bindings(locked, true), "root", ["width"], resize)).toEqual({
      reason: "section-locked",
      status: "rejected",
    });
    expect(
      resizeWorkspaceRootSection(bindings(minimized, true), "root", ["width"], resize),
    ).toEqual({ reason: "section-minimized", status: "rejected" });
    expect(setWorkspaceSectionContentSize(bindings(locked, true), "root", ["width"])).toEqual({
      reason: "section-locked",
      status: "rejected",
    });
    expect(setWorkspaceSectionContentSize(bindings(minimized, true), "root", ["width"])).toEqual({
      reason: "section-minimized",
      status: "rejected",
    });
  });

  it("rejects malformed sizing axes and dimensions before publishing a change", () => {
    const document = recursiveDocument();
    const bindings = {
      commit: () => {
        throw new Error("Malformed sizing must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    };

    expect(() =>
      resizeWorkspaceRootSection(bindings, "root", ["width", "width"], {
        position: { x: 0, y: 0 },
        size: { height: 180, width: 260 },
      }),
    ).toThrow("must not contain duplicates");
    expect(() =>
      resizeWorkspaceRootSection(bindings, "root", ["height"], {
        position: { x: 0, y: 0 },
        size: { height: Number.NaN, width: 240 },
      }),
    ).toThrow("height must be a positive finite number");
    expect(() => setWorkspaceSectionContentSize(bindings, "root", [])).toThrow(
      "must contain width, height, or both",
    );
  });

  it("rejects minimizing a section whose registered kind opts out", () => {
    const document = createWorkspaceTestDocument([{ id: "fixed", title: "Fixed" }]);
    const controller = createWorkspaceController({
      canMinimizeSection: () => false,
      commit: () => {
        throw new Error("A rejected minimize command must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    });

    expect(controller.setSectionMinimized("fixed", true)).toEqual({
      reason: "section-not-minimizable",
      status: "rejected",
    });
    expect(controller.setSectionMinimized("fixed", false)).toEqual({ status: "unchanged" });
  });
});
