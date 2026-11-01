/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState } from "../canvas/store.js";
import { registerWorkspaceClipboardAuthority } from "../clipboard/registry.js";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry.js";
import { registerWorkspaceCreationCommands } from "../context-menu/workspaceMenuRegistry.js";
import { setActiveSectionIds } from "../document/activeSections.js";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { setSelectedItems } from "../document/itemSelection.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import type {
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
} from "../document/types.js";
import {
  getWorkspaceKeyBindingChordLabel,
  registerWorkspaceKeyBindings,
} from "../keybindings/workspaceKeyBindingRegistry.js";
import { resolveWorkspacePaletteEntries } from "./workspacePalette.js";

function createItemTree(
  selectedItemIds: Array<string> = [],
): WorkspaceSectionItemTree {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: ["item"] },
      item: { id: "item", children: [], data: { value: "item" } },
    },
    selectedItemIds,
  };
}

function createLeaf(
  id: string,
  itemTree?: WorkspaceSectionItemTree,
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...(itemTree ? { itemTree } : {}),
  };
}

function loadWorkspace(
  workspace: WorkspaceTestHost,
  sections: Record<string, WorkspaceSectionInput>,
  activeIds: Array<string>,
): void {
  const nestedIds = new Set(
    Object.values(sections).flatMap((section) => section.children),
  );
  const topLevelIds = Object.keys(sections).filter(
    (sectionId) => !nestedIds.has(sectionId),
  );
  loadWorkspaceDocument(workspace.host, {
    sections,
    topLevelSections: Object.fromEntries(
      topLevelIds.map((sectionId, index) => [
        sectionId,
        { x: index * 320, y: 0, w: 240, h: 120, zIndex: index },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
    savedViews: null,
  });
}

function registerLeafKind(workspace: WorkspaceTestHost): void {
  registerSectionKinds(workspace.host, {
    leaf: {
      renderContent: () => null,
      defaultSize: { width: 240, height: 120 },
      itemArea: { toolbar: "authoring-and-filter" },
      createItem: () => ({
        id: `item-${crypto.randomUUID()}`,
        children: [],
        data: {},
      }),
    },
  });
}

function getPaletteEntry(id: string) {
  const entry = resolveWorkspacePaletteEntries(testWorkspace.host).find(
    (candidate) => candidate.id === id,
  );
  if (!entry) {
    throw new Error(`Missing palette entry ${id}.`);
  }
  return entry;
}

describe("workspace palette model", () => {
  beforeEach(() => {
    registerLeafKind(testWorkspace);
    testWorkspace.reactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });
  });

  afterEach(() => {
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    registerSectionKinds(testWorkspace.host, {});
  });

  it("projects checked and disabled palette commands from their existing authority", () => {
    loadWorkspace(
      testWorkspace,
      {
        group: {
          ...createLeaf("group"),
          kind: "group",
          overflowMode: true,
          children: ["leaf"],
        },
        leaf: createLeaf("leaf"),
      },
      ["group"],
    );
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-check",
        scope: "section",
        surfaces: ["palette"],
        label: "Check section",
        keywords: ["  host  ", "check"],
        isChecked: () => true,
        run: vi.fn(),
      },
    ]);

    expect(
      getPaletteEntry("command:workspace.toggle-group-overflow"),
    ).toMatchObject({
      checked: true,
      group: "Commands",
    });
    expect(getPaletteEntry("command:host-check")).toMatchObject({
      checked: true,
      keywords: ["host", "check"],
    });
    const deleteEntry = getPaletteEntry("command:workspace.delete-sections");

    testWorkspace.capabilities.setState({ canEditStructure: false });

    expect(getPaletteEntry("command:workspace.ungroup-sections")).toMatchObject(
      {
        disabled: true,
        disabledReason: "Structural editing is disabled in this workspace.",
      },
    );
    expect(deleteEntry.run()).toEqual({
      ran: false,
      statusMessage: "Structural editing is disabled in this workspace.",
    });
  });

  it("projects registered clipboard commands with their configured shortcuts", () => {
    loadWorkspace(testWorkspace, { leaf: createLeaf("leaf") }, ["leaf"]);
    registerWorkspaceClipboardAuthority(testWorkspace.host, {
      id: "test-local",
      kind: "local",
    });

    expect(getPaletteEntry("command:workspace.copy-sections")).toMatchObject({
      group: "Commands",
      keyBindingId: "workspace.copy-sections",
      label: "Copy",
      shortcutLabel: getWorkspaceKeyBindingChordLabel(
        testWorkspace.host,
        "workspace.copy-sections",
      ),
    });
    expect(getPaletteEntry("command:workspace.paste-sections")).toMatchObject({
      group: "Commands",
      keyBindingId: "workspace.paste-sections",
      label: "Paste",
      shortcutLabel: getWorkspaceKeyBindingChordLabel(
        testWorkspace.host,
        "workspace.paste-sections",
      ),
    });
    expect(
      getPaletteEntry("command:workspace.duplicate-sections"),
    ).toMatchObject({
      group: "Commands",
      keyBindingId: "workspace.duplicate-sections",
      label: "Duplicate",
    });
  });

  it("re-resolves a command against the live selection and declines after removal", () => {
    const run = vi.fn();
    loadWorkspace(
      testWorkspace,
      { first: createLeaf("first"), second: createLeaf("second") },
      ["first"],
    );
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-live-section",
        scope: "section",
        surfaces: ["palette"],
        label: "Live section",
        run,
      },
    ]);
    const entry = getPaletteEntry("command:host-live-section");

    setActiveSectionIds(testWorkspace.host, ["second"]);

    expect(entry.run()).toEqual({ ran: true, statusMessage: null });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        section: expect.objectContaining({ id: "second" }),
      }),
    );

    loadWorkspace(testWorkspace, {}, []);

    expect(entry.run()).toEqual({ ran: false, statusMessage: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("requires one live selected item for an item palette command", () => {
    const run = vi.fn();
    loadWorkspace(
      testWorkspace,
      { leaf: createLeaf("leaf", createItemTree(["item"])) },
      ["leaf"],
    );
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-live-item",
        scope: "item",
        surfaces: ["palette"],
        label: "Live item",
        run,
      },
    ]);
    const entry = getPaletteEntry("command:host-live-item");

    setSelectedItems(testWorkspace.host, "leaf", []);

    expect(entry.run()).toEqual({ ran: false, statusMessage: null });
    expect(run).not.toHaveBeenCalled();
  });

  it("projects creation commands under Create with their current chord and authority", () => {
    const createSection = vi.fn((context) => {
      expect(context.workspacePosition).toBeNull();
      return createLeaf("created");
    });
    loadWorkspace(testWorkspace, {}, []);
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-duplicate-label",
        scope: "pane",
        surfaces: ["palette"],
        label: "Duplicate",
        run: vi.fn(),
      },
    ]);
    registerWorkspaceCreationCommands(testWorkspace.host, [
      {
        id: "host-note",
        label: "Duplicate",
        group: "Host sections",
        chord: "N",
        createSection,
      },
    ]);
    registerWorkspaceKeyBindings(testWorkspace.host, [
      { id: "host-note", chord: "Mod + Alt + N" },
    ]);

    const entry = getPaletteEntry("creation:host-note");

    expect(entry).toMatchObject({
      description: "Host sections",
      group: "Create",
      keyBindingId: "host-note",
      keywords: ["Host sections"],
      label: "Duplicate",
      shortcutLabel: getWorkspaceKeyBindingChordLabel(
        testWorkspace.host,
        "host-note",
      ),
    });
    expect(getPaletteEntry("command:host-duplicate-label").label).toBe(
      "Duplicate",
    );

    expect(entry.run()).toEqual({ ran: true, statusMessage: null });
    expect(createSection).toHaveBeenCalledTimes(1);
    expect(testWorkspace.document.getState().sections.created).toBeDefined();
    expect(
      testWorkspace.document.getState().topLevelSections.created,
    ).toMatchObject({ x: 24, y: 24 });

    testWorkspace.capabilities.setState({ canEditStructure: false });

    expect(entry.run()).toEqual({
      ran: false,
      statusMessage: "Section creation is disabled in this workspace.",
    });
    expect(createSection).toHaveBeenCalledTimes(1);
  });

  it("keeps command and creation catalogs isolated by host", () => {
    const secondWorkspace = createWorkspaceTestHost();
    try {
      registerLeafKind(secondWorkspace);
      loadWorkspace(testWorkspace, { first: createLeaf("first") }, ["first"]);
      loadWorkspace(secondWorkspace, { second: createLeaf("second") }, [
        "second",
      ]);
      registerWorkspaceCommands(testWorkspace.host, [
        {
          id: "host-first",
          scope: "section",
          surfaces: ["palette"],
          label: "First host command",
          run: vi.fn(),
        },
      ]);
      registerWorkspaceCommands(secondWorkspace.host, [
        {
          id: "host-second",
          scope: "section",
          surfaces: ["palette"],
          label: "Second host command",
          run: vi.fn(),
        },
      ]);
      registerWorkspaceCreationCommands(testWorkspace.host, [
        {
          id: "first-create",
          label: "First create",
          group: "First",
          createSection: () => createLeaf("first-created"),
        },
      ]);
      registerWorkspaceCreationCommands(secondWorkspace.host, [
        {
          id: "second-create",
          label: "Second create",
          group: "Second",
          createSection: () => createLeaf("second-created"),
        },
      ]);

      expect(
        resolveWorkspacePaletteEntries(testWorkspace.host).map(
          (entry) => entry.id,
        ),
      ).toContain("command:host-first");
      expect(
        resolveWorkspacePaletteEntries(testWorkspace.host).map(
          (entry) => entry.id,
        ),
      ).not.toContain("command:host-second");
      expect(
        resolveWorkspacePaletteEntries(secondWorkspace.host).map(
          (entry) => entry.id,
        ),
      ).toContain("creation:second-create");
      expect(
        resolveWorkspacePaletteEntries(secondWorkspace.host).map(
          (entry) => entry.id,
        ),
      ).not.toContain("creation:first-create");
    } finally {
      secondWorkspace.host.dispose();
    }
  });
});
