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
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  WorkspaceSection,
  WorkspaceSectionInput,
} from "../document/types";
import { createSectionCommandContext } from "./workspaceCommandContexts";
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

  it("refuses a command whose context no longer matches its scope", () => {
    expect(() =>
      runWorkspaceCommandById("workspace.delete-item", contextFor("leaf")),
    ).toThrow(/cannot receive section context for item/);
  });
});
