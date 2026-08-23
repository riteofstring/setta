import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import {
  createWorkspaceHost,
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
  type WorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import { readCallableSectionData } from "../sections/CallableSection";
import { readParameterDictionarySectionData } from "../sections/ParamDictSection";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  CALLABLE_SECTION_KIND,
  GENERATED_PYTHON_SECTION_ID,
  LIST_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
  applyProjectSnapshotToWorkspace,
  callableSectionID,
  createPendingCallableSection,
  createPendingListSection,
  createPendingParameterDictionarySection,
  dictionaryEntryWorkspaceItemID,
  listSectionID,
  parameterWorkspaceItemID,
  parameterDictionarySectionID,
  promoteDictionaryEntryParents,
  projectWorkspaceDocument,
  readCallableParameterItems,
  readParameterDictionaryEntries,
  readGeneratedPythonTarget,
  setParameterItemName,
  workspaceForestProposal,
} from "./workspaceProjection";

describe("Python Canvas V2 workspace projection", () => {
  it("derives sections and ordered parameter rows from dynamic callable IDs", () => {
    const snapshot = dynamicSnapshot();
    const document = projectWorkspaceDocument(snapshot);
    const firstId = callableSectionID("callable:first");
    const secondId = callableSectionID("callable:second");

    expect(Object.keys(document.sections)).toEqual([
      GENERATED_PYTHON_SECTION_ID,
      firstId,
      secondId,
    ]);
    expect(document.sections[firstId]).toMatchObject({
      id: firstId,
      kind: CALLABLE_SECTION_KIND,
      name: "First callable",
      size: { height: 150, width: 250 },
    });
    expect(
      readCallableSectionData(document.sections[firstId]?.data),
    ).toMatchObject({
      callable: { id: "callable:first", name: "First callable" },
    });
    expect(
      document.sections[secondId]?.itemTree?.items[`${secondId}:parameter-root`]
        ?.children,
    ).toEqual([
      parameterWorkspaceItemID("parameter:value"),
      parameterWorkspaceItemID("parameter:scale"),
    ]);
    expect(readCallableParameterItems(document, "callable:second")).toEqual([
      {
        data: {
          authoredExpression: "value",
          default: null,
          name: "value",
          nameEditable: false,
          passingStyle: "positional_or_keyword",
          providerOrdinal: 0,
          typeAnnotation: "float",
        },
        id: "parameter:value",
      },
      {
        data: {
          authoredExpression: "2",
          default: null,
          name: "scale",
          nameEditable: true,
          passingStyle: "positional_or_keyword",
          providerOrdinal: null,
          typeAnnotation: null,
        },
        id: "parameter:scale",
      },
    ]);
  });

  it("projects opaque parameter IDs without colliding with structural item IDs", () => {
    const callableId = "callable:second";
    const structuralRootId = `${callableSectionID(callableId)}:parameter-root`;
    const snapshot = dynamicSnapshot();
    snapshot.callables[1]!.parameters = [
      {
        authoredExpression: "2",
        default: null,
        id: structuralRootId,
        name: "scale",
        nameEditable: true,
        passingStyle: "positional_or_keyword",
        providerOrdinal: null,
        typeAnnotation: null,
      },
    ];

    const document = projectWorkspaceDocument(snapshot);
    const tree = document.sections[callableSectionID(callableId)]?.itemTree;
    const parameterItemId = parameterWorkspaceItemID(structuralRootId);

    expect(tree?.rootId).toBe(structuralRootId);
    expect(parameterItemId).not.toBe(structuralRootId);
    expect(tree?.items[structuralRootId]?.children).toEqual([parameterItemId]);
    expect(tree?.items[parameterItemId]).toMatchObject({
      id: parameterItemId,
      data: { name: "scale" },
    });
    expect(readCallableParameterItems(document, callableId)).toEqual([
      expect.objectContaining({ id: structuralRootId }),
    ]);
  });

  it("replaces a pending callable with its canonical section at the requested position", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    const pendingSectionId = "python-canvas:pending-callable:test";
    const pendingSection = {
      ...createPendingCallableSection(
        snapshot,
        pendingSectionId,
        "New callable",
      ),
      size: { width: 100, height: 80 },
    };
    const pendingLayout = {
      h: 150,
      w: 250,
      x: 912,
      y: 488,
      zIndex: 12,
    };
    const current = host.getSnapshot();
    host.loadDocument({
      ...current,
      activeIds: [pendingSectionId],
      sections: {
        ...current.sections,
        [pendingSectionId]: pendingSection,
      },
      topLevelSections: {
        ...current.topLevelSections,
        [pendingSectionId]: pendingLayout,
      },
    });
    expect(host.getSnapshot().sections[pendingSectionId]?.size).toEqual({
      width: 200,
      height: 104,
    });
    const createdSnapshot = dynamicSnapshot();
    createdSnapshot.callables.push({
      authoredExpression: "",
      id: "callable:created",
      name: "New callable",
      parameters: [],
    });
    createdSnapshot.topLevelSectionIds.push("callable:created");

    applyProjectSnapshotToWorkspace(host, createdSnapshot, {
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(),
      pendingSectionIds: new Map([["callable:created", pendingSectionId]]),
      unresolvedPendingSectionIds: new Set(),
    });

    const createdSectionId = callableSectionID("callable:created");
    expect(host.getSnapshot().sections[pendingSectionId]).toBeUndefined();
    expect(host.getSnapshot().topLevelSections[createdSectionId]).toEqual(
      pendingLayout,
    );
    expect(host.getSnapshot().sections[createdSectionId]?.size).toEqual({
      width: 200,
      height: 104,
    });
    expect(host.getSnapshot().activeIds).toEqual([createdSectionId]);
    host.dispose();
  });

  it("protects the generated body and its separators while preserving outer edits", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    const generated = getWorkspaceCodeSectionData(
      host,
      GENERATED_PYTHON_SECTION_ID,
    );
    if (generated.mode !== "generated-document") {
      throw new Error(
        "generated Python did not use the generated-document mode",
      );
    }
    expect(generated.generatedRegion).toEqual({
      from: snapshot.pythonTarget.prefix.length,
      to:
        snapshot.generatedCode.code.length -
        snapshot.pythonTarget.suffix.length,
    });

    const prefix = "import os";
    const suffix = "state = SettaState()\nprint('done')";
    const code = `${prefix}\n\n${snapshot.generatedCode.body}\n\n${suffix}`;
    setWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID, {
      ...generated,
      code,
      generatedRegion: {
        from: prefix.length,
        to: code.length - suffix.length,
      },
    });

    expect(readGeneratedPythonTarget(host)).toEqual({
      generated: snapshot.generatedCode.body,
      prefix,
      suffix,
    });
    host.dispose();
  });

  it("maps the backend body byte range to a separator-bounded UTF-16 editor region", () => {
    const prefix = "# π";
    const suffix = "state = SettaState()  # 🐍";
    const body = projectSnapshotFixture.generatedCode.body;
    const code = `${prefix}\n\n${body}\n\n${suffix}`;
    const bodyStart = new TextEncoder().encode(`${prefix}\n\n`).length;
    const snapshot = parseProjectSnapshotV2({
      ...projectSnapshotFixture,
      generatedCode: {
        body,
        code,
        generatedBodyRange: {
          start: bodyStart,
          end: bodyStart + new TextEncoder().encode(body).length,
        },
        sourceRangesByTargetId: {},
      },
      pythonTarget: { prefix, suffix },
    });

    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));
    const generated = getWorkspaceCodeSectionData(
      host,
      GENERATED_PYTHON_SECTION_ID,
    );
    if (generated.mode !== "generated-document") {
      throw new Error(
        "generated Python did not use the generated-document mode",
      );
    }
    expect(generated.generatedRegion).toEqual({
      from: prefix.length,
      to: code.length - suffix.length,
    });
    host.dispose();
  });

  it("retains an independent pending parameter list only for its callable", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    setParameterItemName(
      host,
      "callable:second",
      parameterWorkspaceItemID("parameter:scale"),
      "factor",
    );
    applyProjectSnapshotToWorkspace(host, snapshot, {
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(["callable:second"]),
      pendingSectionIds: new Map(),
      unresolvedPendingSectionIds: new Set(),
    });

    expect(
      readCallableParameterItems(host.getSnapshot(), "callable:second"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ name: "factor" }),
          id: "parameter:scale",
        }),
      ]),
    );
    expect(
      readCallableParameterItems(host.getSnapshot(), "callable:first"),
    ).toEqual([]);
    host.dispose();
  });

  it("retains a conflicted parameter draft for retry", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    setParameterItemName(
      host,
      "callable:second",
      parameterWorkspaceItemID("parameter:scale"),
      "local retry name",
    );
    applyProjectSnapshotToWorkspace(host, snapshot, {
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(["callable:second"]),
      pendingSectionIds: new Map(),
      unresolvedPendingSectionIds: new Set(),
    });

    expect(
      readCallableParameterItems(host.getSnapshot(), "callable:second"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            name: "local retry name",
          }),
          id: "parameter:scale",
        }),
      ]),
    );
    host.dispose();
  });

  it("keeps settled diagnostics on surviving callable, parameter, and dictionary targets while a structural snapshot lags", () => {
    const settled = diagnosticContinuitySnapshot({
      diagnostics: [
        diagnostic("callable:survives", "Callable error"),
        diagnostic("parameter:survives", "Parameter error"),
        diagnostic("entry:survives", "Dictionary entry error"),
      ],
      diagnosticsRevision: 1,
      revision: 1,
    });
    const lagging = parseProjectSnapshotV2({
      ...settled,
      diagnostics: [],
      lists: [
        {
          childSectionIds: [],
          id: "list:created",
          name: "Unrelated List",
        },
      ],
      diagnosticsRevision: 1,
      project: { ...settled.project, revision: 2 },
      providerStatus: {
        provider: "basedpyright",
        state: "pending",
        status: "available",
      },
      topLevelSectionIds: [...settled.topLevelSectionIds, "list:created"],
    });
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(settled));

    applyCanonicalSnapshot(host, lagging);

    expect(projectedCallableData(host, "callable:survives")).toMatchObject({
      callableDiagnosticMessage: "Callable error",
      parameterDiagnostics: {
        [parameterWorkspaceItemID("parameter:survives")]: [
          { message: "Parameter error", severity: "error" },
        ],
      },
    });
    expect(projectedDictionaryData(host, "dictionary:options")).toMatchObject({
      entryDiagnostics: {
        [dictionaryEntryWorkspaceItemID("entry:survives")]: [
          { message: "Dictionary entry error", severity: "error" },
        ],
      },
    });
    expect(
      host.getSnapshot().sections[listSectionID("list:created")],
    ).toBeDefined();
    host.dispose();
  });

  it("does not retain diagnostics for targets removed by a lagging structural snapshot", () => {
    const settled = diagnosticContinuitySnapshot({
      diagnostics: [
        diagnostic("callable:deleted", "Deleted callable error"),
        diagnostic("parameter:deleted", "Deleted parameter error"),
        diagnostic("entry:deleted", "Deleted dictionary entry error"),
      ],
      diagnosticsRevision: 1,
      revision: 1,
    });
    const lagging = parseProjectSnapshotV2({
      ...settled,
      callables: settled.callables
        .filter((callable) => callable.id !== "callable:deleted")
        .map((callable) => ({
          ...callable,
          parameters: callable.parameters.filter(
            (parameter) => parameter.id !== "parameter:deleted",
          ),
        })),
      diagnostics: [],
      diagnosticsRevision: 1,
      parameterDictionaries: settled.parameterDictionaries.map(
        (dictionary) => ({
          ...dictionary,
          entries: dictionary.entries.filter(
            (entry) => entry.id !== "entry:deleted",
          ),
        }),
      ),
      project: { ...settled.project, revision: 2 },
      providerStatus: {
        provider: "basedpyright",
        state: "pending",
        status: "available",
      },
      topLevelSectionIds: settled.topLevelSectionIds.filter(
        (sectionId) => sectionId !== "callable:deleted",
      ),
    });
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(settled));

    applyCanonicalSnapshot(host, lagging);

    expect(
      host.getSnapshot().sections[callableSectionID("callable:deleted")],
    ).toBeUndefined();
    expect(
      projectedCallableData(host, "callable:survives").parameterDiagnostics,
    ).toEqual({});
    expect(
      projectedDictionaryData(host, "dictionary:options").entryDiagnostics,
    ).toEqual({});
    host.dispose();
  });

  it("replaces or clears retained diagnostics when a snapshot settles, including provider failure", () => {
    const settled = diagnosticContinuitySnapshot({
      diagnostics: [
        diagnostic("callable:survives", "Old callable error"),
        diagnostic("parameter:survives", "Old parameter error"),
        diagnostic("entry:survives", "Old dictionary entry error"),
      ],
      diagnosticsRevision: 1,
      revision: 1,
    });
    const lagging = diagnosticContinuitySnapshot({
      diagnostics: [],
      diagnosticsRevision: 1,
      revision: 2,
    });
    const resolved = diagnosticContinuitySnapshot({
      diagnostics: [
        diagnostic("callable:survives", "Replacement callable error"),
        diagnostic("entry:survives", "Replacement dictionary entry error"),
      ],
      diagnosticsRevision: 2,
      revision: 2,
    });
    const failed = diagnosticContinuitySnapshot({
      diagnostics: [],
      diagnosticsRevision: 3,
      providerStatus: {
        provider: "basedpyright",
        state: "failed",
        status: "unavailable",
      },
      revision: 3,
    });
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(settled));

    applyCanonicalSnapshot(host, lagging);
    applyCanonicalSnapshot(host, resolved);

    expect(projectedCallableData(host, "callable:survives")).toMatchObject({
      callableDiagnosticMessage: "Replacement callable error",
      parameterDiagnostics: {},
    });
    expect(projectedDictionaryData(host, "dictionary:options")).toMatchObject({
      entryDiagnostics: {
        [dictionaryEntryWorkspaceItemID("entry:survives")]: [
          {
            message: "Replacement dictionary entry error",
            severity: "error",
          },
        ],
      },
    });

    applyCanonicalSnapshot(host, failed);

    expect(projectedCallableData(host, "callable:survives")).toMatchObject({
      callableDiagnosticMessage: null,
      parameterDiagnostics: {},
    });
    expect(projectedDictionaryData(host, "dictionary:options")).toMatchObject({
      entryDiagnostics: {},
    });
    host.dispose();
  });

  it("projects a mixed authored forest with recursive dictionary diagnostics", () => {
    const snapshot = forestSnapshot();
    const document = projectWorkspaceDocument(snapshot);
    const dictionaryId = parameterDictionarySectionID("dictionary:options");
    const listId = listSectionID("list:objects");

    expect(Object.keys(document.sections)).toEqual([
      GENERATED_PYTHON_SECTION_ID,
      callableSectionID("callable:child"),
      dictionaryId,
      listId,
    ]);
    expect(document.sections[dictionaryId]).toMatchObject({
      kind: PARAMETER_DICTIONARY_SECTION_KIND,
      name: "Options",
    });
    expect(document.sections[listId]).toMatchObject({
      children: [callableSectionID("callable:child"), dictionaryId],
      kind: LIST_SECTION_KIND,
      name: "Objects",
    });
    expect(Object.keys(document.topLevelSections)).toEqual([
      GENERATED_PYTHON_SECTION_ID,
      listId,
    ]);
    expect(
      readParameterDictionaryEntries(document, "dictionary:options"),
    ).toEqual([
      {
        authoredExpression: "missing_radius",
        id: "entry:radius",
        kind: "leaf",
        name: "radius",
      },
      {
        children: [
          {
            authoredExpression: "2",
            id: "entry:scale",
            kind: "leaf",
            name: "scale",
          },
        ],
        id: "entry:options",
        kind: "parent",
        name: "options",
      },
    ]);
    expect(document.sections[dictionaryId]?.data).toMatchObject({
      entryDiagnostics: {
        [dictionaryEntryWorkspaceItemID("entry:radius")]: [
          { message: '"missing_radius" is not defined', severity: "error" },
        ],
      },
    });
  });

  it("serializes list nesting and top-level section order as one forest proposal", () => {
    const snapshot = forestSnapshot();
    const document = projectWorkspaceDocument(snapshot);
    const dictionaryId = parameterDictionarySectionID("dictionary:options");
    const listId = listSectionID("list:objects");
    expect(document.sections[listId]?.size).toEqual({
      height: 50,
      width: 250,
    });
    const moved = {
      ...document,
      sections: {
        ...document.sections,
        [listId]: {
          ...document.sections[listId]!,
          children: [callableSectionID("callable:child")],
        },
      },
      topLevelSections: {
        ...document.topLevelSections,
        [dictionaryId]: {
          h: 300,
          w: 420,
          x: 452,
          y: 0,
          zIndex: 1,
        },
        [listId]: { h: 144, w: 360, x: 0, y: 0, zIndex: 0 },
      },
    };

    expect(workspaceForestProposal(moved, snapshot)).toEqual({
      listChildren: [
        { childSectionIds: ["callable:child"], listId: "list:objects" },
      ],
      topLevelSectionIds: ["list:objects", "dictionary:options"],
    });
  });

  it("promotes a nested leaf once and keeps the resulting empty parent typed", () => {
    const snapshot = forestSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));
    const sectionId = parameterDictionarySectionID("dictionary:options");
    const radiusId = dictionaryEntryWorkspaceItemID("entry:radius");
    const optionsId = dictionaryEntryWorkspaceItemID("entry:options");
    const scaleId = dictionaryEntryWorkspaceItemID("entry:scale");
    const first = host.getSnapshot();
    const section = first.sections[sectionId];
    if (section?.itemTree === undefined) {
      throw new Error("Expected the projected dictionary item tree.");
    }
    const tree = section.itemTree;
    host.loadDocument({
      ...first,
      sections: {
        ...first.sections,
        [sectionId]: {
          ...section,
          itemTree: {
            ...tree,
            items: {
              ...tree.items,
              [radiusId]: {
                ...tree.items[radiusId]!,
                children: [scaleId],
              },
              [optionsId]: { ...tree.items[optionsId]!, children: [] },
              [tree.rootId]: {
                ...tree.items[tree.rootId]!,
                children: [radiusId, optionsId],
              },
            },
          },
        },
      },
    });
    expect(promoteDictionaryEntryParents(host, "dictionary:options")).toBe(
      true,
    );

    const promoted = host.getSnapshot();
    const promotedSection = promoted.sections[sectionId];
    if (promotedSection?.itemTree === undefined) {
      throw new Error("Expected the promoted dictionary item tree.");
    }
    const promotedTree = promotedSection.itemTree;
    host.loadDocument({
      ...promoted,
      sections: {
        ...promoted.sections,
        [sectionId]: {
          ...promotedSection,
          itemTree: {
            ...promotedTree,
            items: {
              ...promotedTree.items,
              [radiusId]: {
                ...promotedTree.items[radiusId]!,
                children: [],
              },
              [promotedTree.rootId]: {
                ...promotedTree.items[promotedTree.rootId]!,
                children: [radiusId, optionsId, scaleId],
              },
            },
          },
        },
      },
    });

    expect(
      readParameterDictionaryEntries(host.getSnapshot(), "dictionary:options"),
    ).toEqual([
      {
        children: [],
        id: "entry:radius",
        kind: "parent",
        name: "radius",
      },
      { children: [], id: "entry:options", kind: "parent", name: "options" },
      {
        authoredExpression: "2",
        id: "entry:scale",
        kind: "leaf",
        name: "scale",
      },
    ]);
    host.dispose();
  });

  it("reconciles dictionary and list placeholders without retaining their creation lock", () => {
    const snapshot = forestSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(
      projectWorkspaceDocument(parseProjectSnapshotV2(projectSnapshotFixture)),
    );
    const pendingDictionaryId =
      "python-canvas:pending-parameter-dictionary:test";
    const pendingListId = "python-canvas:pending-list:test";
    const current = host.getSnapshot();
    const dictionaryLayout = { h: 300, w: 420, x: 24, y: 48, zIndex: 3 };
    const listLayout = { h: 144, w: 360, x: 516, y: 48, zIndex: 4 };
    host.loadDocument({
      ...current,
      activeIds: [pendingDictionaryId, pendingListId],
      sections: {
        ...current.sections,
        [pendingDictionaryId]: {
          ...createPendingParameterDictionarySection(
            pendingDictionaryId,
            "Options",
          ),
          size: { width: 100, height: 70 },
        },
        [pendingListId]: {
          ...createPendingListSection(pendingListId, "Objects"),
          size: { width: 250, height: 150 },
        },
      },
      topLevelSections: {
        ...current.topLevelSections,
        [pendingDictionaryId]: dictionaryLayout,
        [pendingListId]: listLayout,
      },
    });
    expect(host.getSnapshot().sections[pendingDictionaryId]?.size).toEqual({
      width: 200,
      height: 78,
    });
    expect(host.getSnapshot().sections[pendingListId]?.size).toEqual({
      width: 250,
      height: 50,
    });

    const createdSnapshot = parseProjectSnapshotV2({
      ...projectSnapshotFixture,
      parameterDictionaries: [
        { entries: [], id: "dictionary:created", name: "Options" },
      ],
      lists: [{ childSectionIds: [], id: "list:created", name: "Objects" }],
      topLevelSectionIds: ["dictionary:created", "list:created"],
    });
    applyProjectSnapshotToWorkspace(host, createdSnapshot, {
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(),
      pendingSectionIds: new Map([
        ["dictionary:created", pendingDictionaryId],
        ["list:created", pendingListId],
      ]),
      unresolvedPendingSectionIds: new Set(),
    });

    const dictionaryId = parameterDictionarySectionID("dictionary:created");
    const listId = listSectionID("list:created");
    expect(host.getSnapshot().sections[pendingDictionaryId]).toBeUndefined();
    expect(host.getSnapshot().sections[pendingListId]).toBeUndefined();
    expect(host.getSnapshot().topLevelSections[dictionaryId]).toEqual(
      dictionaryLayout,
    );
    expect(host.getSnapshot().topLevelSections[listId]).toEqual(listLayout);
    expect(host.getSnapshot().sections[dictionaryId]).toMatchObject({
      positionAndSizeLocked: false,
      size: { width: 200, height: 78 },
    });
    expect(host.getSnapshot().sections[listId]).toMatchObject({
      positionAndSizeLocked: false,
      size: { width: 250, height: 50 },
    });
    expect(host.getSnapshot().activeIds).toEqual([dictionaryId, listId]);
    host.dispose();
  });
});

function applyCanonicalSnapshot(
  host: WorkspaceHost,
  snapshot: ReturnType<typeof parseProjectSnapshotV2>,
) {
  applyProjectSnapshotToWorkspace(host, snapshot, {
    keepAuthoredPython: false,
    keepDictionaryEntries: new Set(),
    keepParameterLists: new Set(),
    pendingSectionIds: new Map(),
    unresolvedPendingSectionIds: new Set(),
  });
}

function projectedCallableData(host: WorkspaceHost, callableId: string) {
  const section = host.getSnapshot().sections[callableSectionID(callableId)];
  if (section === undefined) {
    throw new Error(`Expected projected callable ${callableId}.`);
  }
  return readCallableSectionData(section.data);
}

function projectedDictionaryData(host: WorkspaceHost, dictionaryId: string) {
  const section =
    host.getSnapshot().sections[parameterDictionarySectionID(dictionaryId)];
  if (section === undefined) {
    throw new Error(`Expected projected dictionary ${dictionaryId}.`);
  }
  return readParameterDictionarySectionData(section.data);
}

function diagnostic(targetId: string, message: string) {
  return {
    end: 1,
    id: `diagnostic:${targetId}`,
    message,
    severity: "error",
    start: 0,
    targetId,
  } as const;
}

function diagnosticContinuitySnapshot({
  diagnostics,
  diagnosticsRevision,
  providerStatus = {
    provider: "basedpyright",
    state: "ready",
    status: "available",
  },
  revision,
}: {
  diagnostics: ReadonlyArray<ReturnType<typeof diagnostic>>;
  diagnosticsRevision: number;
  providerStatus?: unknown;
  revision: number;
}) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "math.sqrt",
        id: "callable:survives",
        name: "Surviving callable",
        parameters: [
          {
            authoredExpression: "",
            default: null,
            id: "parameter:survives",
            name: "value",
            nameEditable: false,
            passingStyle: "positional_or_keyword",
            providerOrdinal: 0,
            typeAnnotation: "float",
          },
          {
            authoredExpression: "",
            default: null,
            id: "parameter:deleted",
            name: "scale",
            nameEditable: false,
            passingStyle: "positional_or_keyword",
            providerOrdinal: 1,
            typeAnnotation: "float",
          },
        ],
      },
      {
        authoredExpression: "math.floor",
        id: "callable:deleted",
        name: "Deleted callable",
        parameters: [],
      },
    ],
    diagnostics,
    diagnosticsRevision,
    parameterDictionaries: [
      {
        entries: [
          {
            authoredExpression: "missing_value",
            id: "entry:survives",
            kind: "leaf",
            name: "surviving",
          },
          {
            authoredExpression: "missing_value",
            id: "entry:deleted",
            kind: "leaf",
            name: "deleted",
          },
        ],
        id: "dictionary:options",
        name: "Options",
      },
    ],
    project: { ...projectSnapshotFixture.project, revision },
    providerStatus,
    topLevelSectionIds: [
      "callable:survives",
      "callable:deleted",
      "dictionary:options",
    ],
  });
}

function dynamicSnapshot() {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "first",
        id: "callable:first",
        name: "First callable",
        parameters: [],
      },
      {
        authoredExpression: "second",
        id: "callable:second",
        name: "Second callable",
        parameters: [
          {
            authoredExpression: "value",
            default: null,
            id: "parameter:value",
            name: "value",
            nameEditable: false,
            passingStyle: "positional_or_keyword",
            providerOrdinal: 0,
            typeAnnotation: "float",
          },
          {
            authoredExpression: "2",
            default: null,
            id: "parameter:scale",
            name: "scale",
            nameEditable: true,
            passingStyle: "positional_or_keyword",
            providerOrdinal: null,
            typeAnnotation: null,
          },
        ],
      },
    ],
    topLevelSectionIds: ["callable:first", "callable:second"],
    generatedCode: {
      ...projectSnapshotFixture.generatedCode,
      sourceRangesByTargetId: {
        "callable:first": { end: 2, start: 2 },
        "callable:second": { end: 2, start: 2 },
        "parameter:scale": { end: 2, start: 2 },
        "parameter:value": { end: 2, start: 2 },
      },
    },
  });
}

function forestSnapshot() {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "child",
        id: "callable:child",
        name: "Child callable",
        parameters: [],
      },
    ],
    diagnostics: [
      {
        end: 2,
        id: "diagnostic:radius",
        message: '"missing_radius" is not defined',
        severity: "error",
        start: 2,
        targetId: "entry:radius",
      },
    ],
    lists: [
      {
        childSectionIds: ["callable:child", "dictionary:options"],
        id: "list:objects",
        name: "Objects",
      },
    ],
    parameterDictionaries: [
      {
        entries: [
          {
            authoredExpression: "missing_radius",
            id: "entry:radius",
            kind: "leaf",
            name: "radius",
          },
          {
            children: [
              {
                authoredExpression: "2",
                id: "entry:scale",
                kind: "leaf",
                name: "scale",
              },
            ],
            id: "entry:options",
            kind: "parent",
            name: "options",
          },
        ],
        id: "dictionary:options",
        name: "Options",
      },
    ],
    topLevelSectionIds: ["list:objects"],
  });
}
