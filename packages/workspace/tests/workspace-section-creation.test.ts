import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspaceDocument,
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
} from "../src/core.js";
import { applyWorkspaceDocumentCommand } from "../src/internal/document-commands.js";
import { createWorkspaceController } from "../src/internal/workspace-controller.js";
import {
  createWorkspaceSectionFromDefinition,
  filterWorkspaceSectionDefinitions,
  groupWorkspaceSectionDefinitions,
  planWorkspaceRootSectionCreation,
} from "../src/internal/workspace-section-creation.js";
import { resolveSectionDefinitions } from "../src/internal/workspace-section-registry.js";

const registry = resolveSectionDefinitions([
  {
    creation: { group: "Basics", keywords: ["memo", "text"] },
    defaultSize: { height: 180, width: 240 },
    defaultTitle: "Untitled note",
    displayName: "Note",
    kind: "note",
    render: () => null,
  },
  {
    canContainSections: true,
    chrome: "compact",
    creation: { group: "Layout", keywords: ["group"] },
    defaultChildOrientation: "horizontal",
    defaultSize: { height: 320, width: 480 },
    displayName: "Container",
    kind: "container",
    render: () => null,
  },
]);

describe("workspace section creation", () => {
  it("builds a canonical section from registry defaults and host-owned data", () => {
    const definition = registry.definition("container");
    if (!definition) {
      throw new Error("Missing container fixture definition.");
    }

    expect(
      createWorkspaceSectionFromDefinition(definition, ({ kind }) => ({
        data: { requestedKind: kind },
        id: "container-1",
        title: "  Planning group  ",
      })),
    ).toEqual({
      childLayout: { orientation: "horizontal", overflow: "grow", sectionIds: [] },
      data: { requestedKind: "container" },
      id: "container-1",
      isMinimized: false,
      kind: "container",
      positionAndSizeLocked: false,
      presentation: { accentColor: null, chrome: "compact", tagColor: null },
      size: {
        height: { mode: "fixed", value: 320 },
        width: { mode: "fixed", value: 480 },
      },
      title: "Planning group",
    });
  });

  it("filters metadata by all search terms and preserves registry grouping order", () => {
    const definitions = registry.definitions();

    expect(
      filterWorkspaceSectionDefinitions(definitions, "text note").map(({ kind }) => kind),
    ).toEqual(["note"]);
    expect(groupWorkspaceSectionDefinitions(definitions)).toEqual([
      { definitions: [definitions[0]], label: "Basics" },
      { definitions: [definitions[1]], label: "Layout" },
    ]);
  });

  it("lets an explicit position bypass unavailable canvas geometry", () => {
    const plan = planWorkspaceRootSectionCreation({
      canvasController: null,
      document: createEmptyWorkspaceDocument(),
      factory: () => ({ data: null, id: "note-1" }),
      gridOptions: {
        markSize: 1,
        pattern: "dots",
        snap: true,
        spacing: [24, 24],
        visible: true,
      },
      kind: "note",
      options: { position: { x: 37, y: -19 } },
      registry,
    });

    expect(plan).toMatchObject({ position: { x: 37, y: -19 }, status: "ready" });
  });

  it("commits one validated root creation and rejects duplicate IDs", () => {
    const definition = registry.definition("note");
    if (!definition) {
      throw new Error("Missing note fixture definition.");
    }
    const section = createWorkspaceSectionFromDefinition(definition, () => ({
      data: null,
      id: "note-1",
    }));
    const initial = createEmptyWorkspaceDocument();
    const applied = applyWorkspaceDocumentCommand(
      initial,
      { position: { x: 24, y: 48 }, section, type: "create-root-section" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );

    expect(applied).toMatchObject({ reason: "section-create", status: "applied" });
    if (applied.status !== "applied") {
      throw new Error("Expected root creation to apply.");
    }
    expect(applied.document.rootSections).toEqual([
      { position: { x: 24, y: 48 }, sectionId: "note-1" },
    ]);
    expect(
      applyWorkspaceDocumentCommand(
        applied.document,
        { position: { x: 96, y: 96 }, section, type: "create-root-section" },
        WORKSPACE_DEFAULT_CAPABILITIES,
      ),
    ).toEqual({
      document: applied.document,
      reason: "section-id-exists",
      status: "rejected",
    });
  });

  it("rejects unavailable and malformed public creation calls before host work", () => {
    const document: WorkspaceDocument = createEmptyWorkspaceDocument();
    const controller = createWorkspaceController({
      commit: () => undefined,
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    });
    let evaluated = false;
    const options = Object.defineProperty({}, "position", {
      enumerable: true,
      get: () => {
        evaluated = true;
        return { x: 0, y: 0 };
      },
    });

    expect(controller.createSection("note", { position: { x: 0, y: 0 } })).toEqual({
      reason: "section-creation-unavailable",
      status: "rejected",
    });
    expect(() =>
      controller.createSection("note", options as { position: { x: number; y: number } }),
    ).toThrow("Unknown workspace create-section option position");
    expect(evaluated).toBe(false);
  });
});
