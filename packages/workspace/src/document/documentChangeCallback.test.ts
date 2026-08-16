import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { persistSectionSizeChange } from "../section/sectionSizes";
import { setActiveSectionIds } from "./activeSections";
import {
  getWorkspaceDocument,
  notifyWorkspaceDocumentChange,
  runWithWorkspaceDocumentChangeNotificationsSuppressed,
  setWorkspaceDocumentChangeCallback,
} from "./documentChangeCallback";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
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
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
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

beforeEach(() => {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument(makeDocument());
  reported = [];
  setWorkspaceDocumentChangeCallback((document) => {
    reported.push(document);
  });
});

afterEach(() => {
  setWorkspaceDocumentChangeCallback(null);
});

describe("getWorkspaceDocument", () => {
  it("returns a serializable snapshot that round-trips through loadWorkspaceDocument", () => {
    setSectionName("leaf", "Renamed leaf");
    const snapshot = getWorkspaceDocument();

    loadWorkspaceDocument(makeDocument());
    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("leaf");

    loadWorkspaceDocument(snapshot);
    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe(
      "Renamed leaf",
    );
    expect(useActiveSections.getState().activeIds).toEqual(["nested"]);
  });
});

describe("document-change notification", () => {
  it("notifies once per per-flag mutation funnel with the committed document", () => {
    setSectionName("leaf", "Renamed leaf");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.name).toBe("Renamed leaf");

    togglePositionLock("leaf");
    toggleMinimized("leaf");
    toggleGroupOrientation("group");
    expect(reported).toHaveLength(4);
    expect(reported[3]?.sections["group"]?.isHorizontalOrientation).toBe(true);
  });

  it("does not notify when the orientation funnel refuses a non-group", () => {
    toggleGroupOrientation("leaf");
    expect(reported).toHaveLength(0);
  });

  it("notifies once for a delete commit, including its selection removal", () => {
    deleteSection("group");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["group"]).toBeUndefined();
    expect(reported[0]?.activeIds).toEqual([]);
  });

  it("notifies once per move commit and not for an empty move", () => {
    moveSections({
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

    moveSections({
      sectionIds: [],
      newParentId: null,
      newIndex: null,
      positionsById: null,
    });
    expect(reported).toHaveLength(1);
  });

  it("notifies once per resize commit", () => {
    persistSectionSizeChange("leaf", { width: 240 });
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["leaf"]?.size).toEqual({
      width: 240,
      height: 50,
    });
  });

  it("notifies selection commits and skips unchanged selections", () => {
    setActiveSectionIds(["leaf"]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.activeIds).toEqual(["leaf"]);

    setActiveSectionIds(["leaf"]);
    expect(reported).toHaveLength(1);
  });

  it("does not notify for a host-initiated load", () => {
    loadWorkspaceDocument(makeDocument());
    expect(reported).toHaveLength(0);
  });

  it("suppresses notifications inside an explicit suppression scope", () => {
    runWithWorkspaceDocumentChangeNotificationsSuppressed(() => {
      setSectionName("leaf", "Silent rename");
    });
    expect(reported).toHaveLength(0);

    setSectionName("leaf", "Loud rename");
    expect(reported).toHaveLength(1);
  });

  it("stops notifying after the callback is cleared", () => {
    setWorkspaceDocumentChangeCallback(null);
    setSectionName("leaf", "Renamed leaf");
    expect(reported).toHaveLength(0);
  });

  it("throws when the callback mutates the workspace synchronously", () => {
    setWorkspaceDocumentChangeCallback(() => {
      setActiveSectionIds(["leaf"]);
    });
    expect(() => setSectionName("leaf", "Renamed leaf")).toThrowError(
      /mutated the workspace synchronously/,
    );
  });

  it("snapshots consistently when notified during an atomic publication", () => {
    // A subscriber-driven read during the delete publication must observe the staged state;
    // the notification itself fires after the publication with the same committed document.
    const observedDuringPublication: { current: WorkspaceDocument | null } = {
      current: null,
    };
    const unsubscribe = useNodeInternals.subscribe(() => {
      observedDuringPublication.current = getWorkspaceDocument();
    });
    try {
      deleteSection("leaf");
    } finally {
      unsubscribe();
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
  it("is inert without a registered callback", () => {
    setWorkspaceDocumentChangeCallback(null);
    expect(() => notifyWorkspaceDocumentChange()).not.toThrow();
  });
});
