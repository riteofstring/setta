import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { persistSectionSizeChange } from "../section/sectionSizes";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { setActiveSectionIds } from "./activeSections";
import {
  getWorkspaceDocument,
  notifyWorkspaceDocumentChange,
  runWithWorkspaceDocumentChangeNotificationsSuppressed,
} from "./documentChangeCallback";
import {
  commitWorkspaceDocument,
  loadWorkspaceDocument,
} from "./loadWorkspaceDocument";
import { moveSections } from "./moveSections";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  deleteSection,
  setSectionName,
  toggleGroupOrientation,
  toggleMinimized,
  togglePositionLock,
} from "./sectionMutations";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "./stores";
import type { WorkspaceDocument, WorkspaceSection } from "./types";

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 100, height: 50 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function makeDocument(): WorkspaceDocument {
  return {
    sections: {
      leaf: makeSection("leaf"),
      group: makeSection("group", { kind: "group", children: ["nested"] }),
      nested: makeSection("nested"),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 100, h: 50, zIndex: 0 },
      group: { x: 200, y: 0, w: null, h: null, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["nested"],
  };
}

let reported: Array<WorkspaceDocument>;
let host: WorkspaceHost;
let unsubscribe: () => void;

beforeEach(() => {
  host = createWorkspaceHost();
  registerSectionKinds(host, { leaf: { renderContent: () => null } });
  host.loadDocument(makeDocument());
  reported = [];
  unsubscribe = host.subscribe((document) => {
    reported.push(document);
  });
});

afterEach(() => {
  unsubscribe();
  host.dispose();
});

describe("WorkspaceHost getSnapshot", () => {
  it("returns a serializable snapshot that round-trips through loadDocument", () => {
    setSectionName(host, "leaf", "Renamed leaf");
    const snapshot = host.getSnapshot();

    host.loadDocument(makeDocument());
    expect(
      getWorkspaceDocumentStore(host).getState().sections["leaf"]?.name,
    ).toBe("leaf");

    host.loadDocument(snapshot);
    expect(
      getWorkspaceDocumentStore(host).getState().sections["leaf"]?.name,
    ).toBe("Renamed leaf");
    expect(getActiveSectionsStore(host).getState().activeIds).toEqual([
      "nested",
    ]);
  });
});

describe("document-change notification", () => {
  it("notifies once per per-flag mutation funnel with the committed document", () => {
    setSectionName(host, "leaf", "Renamed leaf");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.name).toBe("Renamed leaf");

    togglePositionLock(host, "leaf");
    toggleMinimized(host, "leaf");
    toggleGroupOrientation(host, "group");
    expect(reported).toHaveLength(4);
    expect(reported[3]?.sections["group"]?.isHorizontalOrientation).toBe(true);
  });

  it("does not notify when the orientation funnel refuses a non-group", () => {
    toggleGroupOrientation(host, "leaf");
    expect(reported).toHaveLength(0);
  });

  it("notifies once for a delete commit, including its selection removal", () => {
    deleteSection(host, "group");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["group"]).toBeUndefined();
    expect(reported[0]?.activeIds).toEqual([]);
  });

  it("notifies once per move commit and not for an empty move", () => {
    moveSections(host, {
      sectionIds: ["leaf"],
      newParentId: "group",
      newIndex: 0,
      positionsById: null,
    });
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["group"]?.children).toEqual([
      "leaf",
      "nested",
    ]);

    moveSections(host, {
      sectionIds: [],
      newParentId: null,
      newIndex: null,
      positionsById: null,
    });
    expect(reported).toHaveLength(1);
  });

  it("notifies once per resize commit", () => {
    persistSectionSizeChange(host, "leaf", { width: 240 });
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.size).toEqual({
      width: 240,
      height: 50,
    });
  });

  it("notifies selection commits and skips unchanged selections", () => {
    setActiveSectionIds(host, ["leaf"]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.activeIds).toEqual(["leaf"]);

    setActiveSectionIds(host, ["leaf"]);
    expect(reported).toHaveLength(1);
  });

  it("publishes one completed snapshot for a host-initiated load", () => {
    host.loadDocument(makeDocument());
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.name).toBe("leaf");
  });

  it("validates and publishes one complete host-driven document commit", () => {
    const before = host.getSnapshot();

    expect(() =>
      commitWorkspaceDocument(host, { ...before, activeIds: ["missing"] }),
    ).toThrow(/Active ids references unknown section missing/u);
    expect(host.getSnapshot()).toEqual(before);
    expect(reported).toEqual([]);

    commitWorkspaceDocument(host, {
      ...before,
      sections: {
        ...before.sections,
        leaf: { ...before.sections["leaf"]!, name: "Committed leaf" },
      },
    });
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.name).toBe("Committed leaf");
  });

  it("suppresses notifications inside an explicit suppression scope", () => {
    runWithWorkspaceDocumentChangeNotificationsSuppressed(host, () => {
      setSectionName(host, "leaf", "Silent rename");
    });
    expect(reported).toHaveLength(0);

    setSectionName(host, "leaf", "Loud rename");
    expect(reported).toHaveLength(1);
  });

  it("stops notifying after a host subscription is removed", () => {
    unsubscribe();
    setSectionName(host, "leaf", "Renamed leaf");
    expect(reported).toHaveLength(0);
  });

  it("throws when a subscription mutates the workspace synchronously", () => {
    unsubscribe();
    host.subscribe(() => {
      setActiveSectionIds(host, ["leaf"]);
    });
    expect(() => setSectionName(host, "leaf", "Renamed leaf")).toThrowError(
      /mutated the workspace synchronously/,
    );
  });

  it("snapshots consistently when notified during an atomic publication", () => {
    // A subscriber-driven read during the delete publication must observe the staged state;
    // the notification itself fires after the publication with the same committed document.
    const observedDuringPublication: { current: WorkspaceDocument | null } = {
      current: null,
    };
    const unsubscribeNodeStore = getNodeInternalsStore(host).subscribe(() => {
      observedDuringPublication.current = getWorkspaceDocument(host);
    });
    try {
      deleteSection(host, "leaf");
    } finally {
      unsubscribeNodeStore();
    }
    const observed = observedDuringPublication.current;
    if (observed === null) {
      throw new Error("publication subscriber never fired");
    }
    expect(observed.sections["leaf"]).toBeUndefined();
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]).toBeUndefined();
  });
});

describe("notifyWorkspaceDocumentChange", () => {
  it("is inert without a host subscription", () => {
    unsubscribe();
    expect(() => notifyWorkspaceDocumentChange(host)).not.toThrow();
  });
});
