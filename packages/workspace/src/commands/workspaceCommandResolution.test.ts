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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceTopLevelAutoLayoutDisabledReason } from "../auto-layout/topLevelAutoLayout";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { registerWorkspaceClipboardAuthority } from "../clipboard/registry";
import {
  getWorkspaceCapabilitiesStore,
  useWorkspaceCapabilities,
} from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { deleteSections } from "../document/sectionMutations";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  Node,
  WorkspaceSection,
  WorkspaceSectionInput,
} from "../document/types";
import {
  createPaneCommandContext,
  createSectionCommandContext,
} from "./workspaceCommandContexts";
import { createWorkspaceHost } from "../workspaceHost";
import { registerWorkspaceCommands } from "./workspaceCommandRegistry";
import {
  hasApplicableWorkspaceCommands,
  resolveWorkspaceCommandEntries,
  runWorkspaceCommandById,
} from "./workspaceCommandResolution";

function createSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
) {
  return {
    id,
    kind: "leaf",
    name: id,
    data: { body: id },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  } satisfies WorkspaceSectionInput;
}

function createItemTree(selectedItemIds: Array<string>) {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: ["first", "second"] },
      first: { id: "first", children: [], data: { value: 1 } },
      second: { id: "second", children: [], data: { value: 2 } },
    },
    selectedItemIds,
  };
}

function getSection(sectionId: string): WorkspaceSection {
  const section = testWorkspace.document.getState().sections[sectionId];
  if (!section) {
    throw new Error(`Missing test section ${sectionId}.`);
  }
  return section;
}

function contextFor(
  sectionId: string,
  selectedIds: Array<string> = [sectionId],
) {
  return createSectionCommandContext(
    testWorkspace.host,
    getSection(sectionId),
    selectedIds.map((id) => getSection(id)),
  );
}

function loadGroupDocument(): void {
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      group: { ...createSection("group"), kind: "group", children: ["child"] },
      child: createSection("child"),
      leaf: { ...createSection("leaf"), itemTree: createItemTree([]) },
    },
    topLevelSections: {
      group: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
      leaf: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["group"],
  });
}

function createLocalHistoryHost() {
  const host = createWorkspaceHost({ history: { kind: "local" } });
  registerSectionKinds(host, {
    leaf: { renderContent: () => null },
  });
  loadWorkspaceDocument(host, {
    sections: { history: createSection("history") },
    topLevelSections: {
      history: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["history"],
  });
  deleteSections(host, ["history"]);
  return host;
}

describe("workspace command resolution", () => {
  beforeEach(() => {
    registerWorkspaceCommands(testWorkspace.host, []);
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    registerSectionKinds(testWorkspace.host, {
      leaf: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
        createItem: () => ({
          id: `created-${crypto.randomUUID()}`,
          children: [],
          data: {},
        }),
      },
    });
    loadGroupDocument();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    registerWorkspaceCommands(testWorkspace.host, []);
    testWorkspace.document.getState().reset();
  });

  it("offers each surface the commands that apply to its target", () => {
    expect(
      resolveWorkspaceCommandEntries("context-menu", contextFor("group")).map(
        (entry) => entry.id,
      ),
    ).toEqual([
      "workspace.group-sections",
      "workspace.toggle-group-overflow",
      "workspace.ungroup-sections",
      "workspace.delete-sections",
      "workspace.lock-sections",
    ]);
    expect(
      resolveWorkspaceCommandEntries("header", contextFor("group")).map(
        (entry) => entry.id,
      ),
    ).toEqual([
      "workspace.toggle-group-overflow",
      "workspace.ungroup-sections",
    ]);
    expect(
      resolveWorkspaceCommandEntries("header", contextFor("leaf")),
    ).toEqual([]);
    expect(hasApplicableWorkspaceCommands("header", contextFor("group"))).toBe(
      true,
    );
    expect(hasApplicableWorkspaceCommands("header", contextFor("leaf"))).toBe(
      false,
    );
  });

  it("offers registered clipboard actions on their command surfaces", () => {
    registerWorkspaceClipboardAuthority(testWorkspace.host, {
      id: "test-local",
      kind: "local",
    });

    const sectionContext = contextFor("group");
    const clipboardEntries = (
      surface: "context-menu" | "outline" | "palette",
    ) =>
      resolveWorkspaceCommandEntries(surface, sectionContext)
        .filter(
          (entry) =>
            entry.id === "workspace.copy-sections" ||
            entry.id === "workspace.duplicate-sections",
        )
        .map((entry) => entry.id);

    expect(clipboardEntries("context-menu")).toEqual([
      "workspace.copy-sections",
      "workspace.duplicate-sections",
    ]);
    expect(clipboardEntries("outline")).toEqual([
      "workspace.copy-sections",
      "workspace.duplicate-sections",
    ]);
    expect(clipboardEntries("palette")).toEqual([
      "workspace.copy-sections",
      "workspace.duplicate-sections",
    ]);
    expect(
      resolveWorkspaceCommandEntries(
        "context-menu",
        createPaneCommandContext(testWorkspace.host, null),
      )
        .filter((entry) => entry.id === "workspace.paste-sections")
        .map((entry) => entry.id),
    ).toEqual(["workspace.paste-sections"]);
    expect(
      resolveWorkspaceCommandEntries(
        "palette",
        createPaneCommandContext(testWorkspace.host, null),
      )
        .filter((entry) => entry.id === "workspace.paste-sections")
        .map((entry) => entry.id),
    ).toEqual(["workspace.paste-sections"]);
  });

  it("resolves and runs the top-level auto-layout pane command", () => {
    const context = createPaneCommandContext(testWorkspace.host, null);
    const getAutoLayoutEntry = (
      surface: "context-menu" | "palette" | "toolbar",
    ) => {
      const entry = resolveWorkspaceCommandEntries(surface, context).find(
        (candidate) => candidate.id === "workspace.auto-layout-top-level",
      );
      if (!entry) {
        throw new Error(`Missing top-level auto-layout command on ${surface}.`);
      }
      return entry;
    };

    expect(getAutoLayoutEntry("context-menu")).toMatchObject({
      keywords: ["arrange", "pack", "layout"],
      label: "Auto Layout",
    });
    expect(getAutoLayoutEntry("palette")).toMatchObject({
      keywords: ["arrange", "pack", "layout"],
      label: "Auto Layout",
    });
    expect(getAutoLayoutEntry("toolbar")).toMatchObject({
      keywords: ["arrange", "pack", "layout"],
      label: "Auto Layout",
    });

    expect(
      getWorkspaceTopLevelAutoLayoutDisabledReason(testWorkspace.host),
    ).toBe(
      "Auto layout requires measured geometry for every displayed top-level section.",
    );
    expect(getAutoLayoutEntry("context-menu")).toMatchObject({
      disabled: true,
      disabledReason:
        "Auto layout requires measured geometry for every displayed top-level section.",
    });

    testWorkspace.capabilities.setState({ canEditLayout: false });
    expect(
      getWorkspaceTopLevelAutoLayoutDisabledReason(testWorkspace.host),
    ).toBe("Layout editing is disabled in this workspace.");
    expect(getAutoLayoutEntry("palette")).toMatchObject({
      disabled: true,
      disabledReason: "Layout editing is disabled in this workspace.",
    });

    testWorkspace.capabilities.setState({ canEditLayout: true });
    testWorkspace.nodeInternals.setState({
      x: new Map<string, Node>([
        [
          "group",
          {
            id: "group",
            position: { x: 0, y: 0 },
            width: 200,
            height: 100,
            zIndex: 0,
            tempZIndex: 0,
            kind: "group",
          },
        ],
        [
          "leaf",
          {
            id: "leaf",
            position: { x: 300, y: 0 },
            width: 200,
            height: 100,
            zIndex: 1,
            tempZIndex: 1,
            kind: "leaf",
          },
        ],
      ]),
    });

    const entry = getAutoLayoutEntry("context-menu");
    expect(entry).toMatchObject({
      disabled: false,
      disabledReason: null,
    });
    expect(entry.run()).toEqual({
      ran: true,
      statusMessage: "Top-level sections arranged.",
    });
  });

  it("offers history commands in the palette with their live availability", () => {
    const context = createPaneCommandContext(testWorkspace.host, null);

    expect(
      resolveWorkspaceCommandEntries("palette", context)
        .filter(
          (entry) =>
            entry.id === "workspace.undo" || entry.id === "workspace.redo",
        )
        .map((entry) => ({
          disabled: entry.disabled,
          disabledReason: entry.disabledReason,
          id: entry.id,
          label: entry.label,
        })),
    ).toEqual([
      {
        disabled: true,
        disabledReason: "History is disabled for this workspace.",
        id: "workspace.undo",
        label: "Undo",
      },
      {
        disabled: true,
        disabledReason: "History is disabled for this workspace.",
        id: "workspace.redo",
        label: "Redo",
      },
    ]);
  });

  it("runs available history navigation and exposes its capability reason", () => {
    const host = createLocalHistoryHost();
    try {
      const context = createPaneCommandContext(host, null);
      const getHistoryEntry = (id: "workspace.redo" | "workspace.undo") => {
        const entry = resolveWorkspaceCommandEntries("palette", context).find(
          (candidate) => candidate.id === id,
        );
        if (!entry) {
          throw new Error(`Missing history command ${id}.`);
        }
        return entry;
      };

      expect(getHistoryEntry("workspace.undo")).toMatchObject({
        disabled: false,
        disabledReason: null,
      });
      getWorkspaceCapabilitiesStore(host).setState({
        canEditStructure: false,
      });
      expect(getHistoryEntry("workspace.undo")).toMatchObject({
        disabled: true,
        disabledReason: "Undo requires permission to edit workspace structure.",
      });
      expect(getHistoryEntry("workspace.undo").run()).toEqual({
        ran: false,
        statusMessage: null,
      });

      getWorkspaceCapabilitiesStore(host).setState({
        canEditStructure: true,
      });
      expect(getHistoryEntry("workspace.undo").run()).toEqual({
        ran: true,
        statusMessage: null,
      });
      expect(host.getSnapshot().sections["history"]).toBeDefined();
      expect(getHistoryEntry("workspace.redo").run()).toEqual({
        ran: true,
        statusMessage: null,
      });
      expect(host.getSnapshot().sections["history"]).toBeUndefined();
    } finally {
      host.dispose();
    }
  });

  it("hides the overflow toggle for a multiple selection and flips lock with the selection", () => {
    const multiple = contextFor("group", ["group", "leaf"]);
    expect(
      resolveWorkspaceCommandEntries("context-menu", multiple).map(
        (entry) => entry.id,
      ),
    ).toEqual([
      "workspace.group-sections",
      "workspace.ungroup-sections",
      "workspace.delete-sections",
      "workspace.lock-sections",
    ]);

    expect(
      runWorkspaceCommandById("workspace.lock-sections", multiple),
    ).toEqual({
      ran: true,
      statusMessage: "2 sections locked.",
    });
    expect(
      resolveWorkspaceCommandEntries(
        "context-menu",
        contextFor("group", ["group", "leaf"]),
      ).map((entry) => entry.id),
    ).toContain("workspace.unlock-sections");
  });

  it("explains a disabled command the same way wherever it is offered", () => {
    testWorkspace.capabilities.setState({ canEditStructure: false });
    const context = contextFor("group");
    const reasons = (["context-menu", "header", "inspector"] as const).map(
      (surface) =>
        resolveWorkspaceCommandEntries(surface, context).find(
          (entry) => entry.id === "workspace.ungroup-sections",
        )?.disabledReason,
    );

    expect(new Set(reasons)).toEqual(
      new Set(["Structural editing is disabled in this workspace."]),
    );
    expect(
      runWorkspaceCommandById("workspace.ungroup-sections", context),
    ).toEqual({
      ran: false,
      statusMessage: null,
    });
    expect(testWorkspace.document.getState().sections["group"]).toBeDefined();
  });

  it("runs one canonical operation and reports its announcement", () => {
    const context = contextFor("group");
    expect(
      runWorkspaceCommandById("workspace.ungroup-sections", context),
    ).toEqual({
      ran: true,
      statusMessage: "Group ungrouped.",
    });
    expect(testWorkspace.document.getState().sections["group"]).toBeUndefined();
    expect(testWorkspace.document.getState().sections["child"]).toBeDefined();
  });

  it("chooses the parameter command that matches the item selection", () => {
    const withoutSelection = contextFor("leaf");
    expect(
      resolveWorkspaceCommandEntries(
        "inspector-parameters",
        withoutSelection,
      ).map((entry) => entry.id),
    ).toEqual(["workspace.insert-item", "workspace.delete-last-item"]);

    testWorkspace.document.setState((state) => ({
      sections: {
        ...state.sections,
        leaf: {
          ...getSection("leaf"),
          itemTree: createItemTree(["first", "second"]),
        },
      },
    }));
    expect(
      resolveWorkspaceCommandEntries(
        "inspector-parameters",
        contextFor("leaf"),
      ).map((entry) => entry.id),
    ).toEqual(["workspace.insert-item", "workspace.delete-selected-items"]);
  });

  it("explains a locked section once for every parameter command", () => {
    testWorkspace.document.setState((state) => ({
      sections: {
        ...state.sections,
        leaf: { ...getSection("leaf"), positionAndSizeLocked: true },
      },
    }));
    const entries = resolveWorkspaceCommandEntries(
      "inspector-parameters",
      contextFor("leaf"),
    );

    expect(entries.every((entry) => entry.disabled)).toBe(true);
    expect(new Set(entries.map((entry) => entry.disabledReason))).toEqual(
      new Set(["Unlock this section to add or delete parameters."]),
    );
  });

  it("hands host commands a detached frozen context", () => {
    const run = vi.fn();
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-report",
        scope: "section",
        surfaces: ["inspector"],
        label: "Report selection",
        run,
      },
    ]);
    const entries = resolveWorkspaceCommandEntries(
      "inspector",
      contextFor("group"),
    );
    const hostEntry = entries.find((entry) => entry.origin === "host");
    expect(hostEntry?.disabled).toBe(false);

    hostEntry?.run();
    const context = run.mock.calls[0]?.[0];
    expect(context.section.id).toBe("group");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.section)).toBe(true);
    expect(context.section).not.toBe(getSection("group"));
  });

  it("keeps palette keywords on resolved command entries", () => {
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-palette-report",
        scope: "section",
        surfaces: ["palette"],
        label: "Report selection",
        keywords: ["report", "host"],
        run: vi.fn(),
      },
    ]);

    expect(
      resolveWorkspaceCommandEntries("palette", contextFor("group")).find(
        (entry) => entry.id === "host-palette-report",
      )?.keywords,
    ).toEqual(["report", "host"]);
  });

  it("refuses a command whose context no longer matches its scope", () => {
    expect(() =>
      runWorkspaceCommandById("workspace.delete-item", contextFor("leaf")),
    ).toThrow(/cannot receive section context for item/);
  });
});
