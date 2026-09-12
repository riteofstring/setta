import { afterEach, describe, expect, it } from "vitest";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceHistoryAuthority,
  WorkspaceHistoryTransaction,
} from "../history/workspaceHistoryTypes";
import {
  autoLayoutTopLevelSections,
  getWorkspaceTopLevelAutoLayoutDisabledReason,
} from "./topLevelAutoLayout";

let activeHost: WorkspaceHost | null = null;

afterEach(() => {
  activeHost?.dispose();
  activeHost = null;
});

function section(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 120, width: 220 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function documentWithSections(
  dimensions: { h: number | null; w: number | null } = { h: 120, w: 220 },
): WorkspaceDocumentInput {
  return {
    activeIds: ["bravo"],
    sections: {
      alpha: section("alpha", { data: { value: "alpha" } }),
      bravo: section("bravo", { data: { value: "bravo" } }),
      group: section("group", {
        children: ["nested"],
        kind: "group",
        overflowMode: true,
      }),
      locked: section("locked", {
        data: { value: "fixed" },
        positionAndSizeLocked: true,
      }),
      nested: section("nested", { data: { value: "nested" } }),
    },
    topLevelSections: {
      alpha: { ...dimensions, x: 760, y: 360, zIndex: 1 },
      bravo: { ...dimensions, x: 40, y: 420, zIndex: 2 },
      group: { ...dimensions, x: 520, y: 760, zIndex: 3 },
      locked: { ...dimensions, x: 0, y: 0, zIndex: 4 },
    },
    viewport: { x: 80, y: 120, zoom: 1.25 },
    savedViews: null,
  };
}

function createHistoryAuthority(
  transactions: Array<WorkspaceHistoryTransaction>,
): WorkspaceHistoryAuthority {
  return {
    getState: () => ({ canRedo: false, canUndo: false }),
    record: (transaction) => transactions.push(transaction),
    redo: () => undefined,
    subscribe: () => () => undefined,
    synchronize: () => undefined,
    undo: () => undefined,
  };
}

function createHost(
  transactions: Array<WorkspaceHistoryTransaction> = [],
): WorkspaceHost {
  const host = createWorkspaceHost({
    history: {
      authority: createHistoryAuthority(transactions),
      kind: "delegated",
    },
  });
  registerSectionKinds(host, { leaf: { renderContent: () => null } });
  activeHost = host;
  return host;
}

describe("top-level auto layout", () => {
  it("gates direct invocation before geometry when layout editing is unavailable", () => {
    const host = createWorkspaceHost();
    activeHost = host;
    getWorkspaceCapabilitiesStore(host).setState({ canEditLayout: false });

    expect(getWorkspaceTopLevelAutoLayoutDisabledReason(host)).toBe(
      "Layout editing is disabled in this workspace.",
    );
    expect(() => autoLayoutTopLevelSections(host)).toThrow(
      "Layout editing is disabled in this workspace.",
    );
  });

  it("requires measured geometry for every displayed top-level root", () => {
    const host = createHost();
    host.loadDocument(documentWithSections({ h: null, w: null }));

    expect(getWorkspaceTopLevelAutoLayoutDisabledReason(host)).toBe(
      "Auto layout requires measured geometry for every displayed top-level section.",
    );
    expect(() => autoLayoutTopLevelSections(host)).toThrow(
      "Auto layout requires measured geometry for every displayed top-level section.",
    );
  });

  it("publishes one atomic section-move while preserving document-owned fields", () => {
    const transactions: Array<WorkspaceHistoryTransaction> = [];
    const host = createHost(transactions);
    host.loadDocument(documentWithSections());
    const before = structuredClone(host.getSnapshot());
    const publications: Array<WorkspaceDocumentInput> = [];
    const atomicStates: Array<boolean> = [];
    const unsubscribeDocument = host.subscribe((document) =>
      publications.push(document),
    );
    const unsubscribeStore = getWorkspaceDocumentStore(host).subscribe(
      (document) => {
        atomicStates.push(
          Object.entries(document.topLevelSections).every(
            ([sectionId, layout]) => {
              const node = getNodeInternalsStore(host)
                .getState()
                .x.get(sectionId);
              return (
                node !== undefined &&
                node.position.x === layout.x &&
                node.position.y === layout.y &&
                node.zIndex === layout.zIndex
              );
            },
          ),
        );
      },
    );

    expect(autoLayoutTopLevelSections(host)).toBe("applied");
    const after = host.getSnapshot();

    expect(publications).toHaveLength(1);
    expect(atomicStates).toEqual([true]);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.kind).toBe("section-move");
    expect(after.sections).toEqual(before.sections);
    expect(after.activeIds).toEqual(before.activeIds);
    expect(after.viewport).toEqual(before.viewport);
    expect(after.sections["group"]?.children).toEqual(["nested"]);
    expect(after.topLevelSections["locked"]?.x).toBe(0);
    expect(after.topLevelSections["locked"]?.y).toBe(0);
    for (const [sectionId, layout] of Object.entries(before.topLevelSections)) {
      expect(after.topLevelSections[sectionId]).toMatchObject({
        h: layout.h,
        w: layout.w,
        zIndex: layout.zIndex,
      });
    }

    expect(getWorkspaceTopLevelAutoLayoutDisabledReason(host)).toBe(
      "Top-level sections are already arranged.",
    );
    expect(autoLayoutTopLevelSections(host)).toBe("unchanged");
    expect(publications).toHaveLength(1);
    expect(transactions).toHaveLength(1);

    unsubscribeStore();
    unsubscribeDocument();
  });

  it("returns unchanged when fewer than two top-level roots are unlocked", () => {
    const host = createHost();
    const document = documentWithSections();
    document.sections["alpha"] = section("alpha", {
      positionAndSizeLocked: true,
    });
    document.sections["group"] = section("group", {
      children: ["nested"],
      kind: "group",
      overflowMode: true,
      positionAndSizeLocked: true,
    });
    document.sections["locked"] = section("locked", {
      positionAndSizeLocked: true,
    });
    host.loadDocument(document);
    let publications = 0;
    const unsubscribe = host.subscribe(() => {
      publications += 1;
    });

    expect(getWorkspaceTopLevelAutoLayoutDisabledReason(host)).toBe(
      "Auto layout requires at least two unlocked top-level sections.",
    );
    expect(autoLayoutTopLevelSections(host)).toBe("unchanged");
    expect(publications).toBe(0);
    unsubscribe();
  });
});
