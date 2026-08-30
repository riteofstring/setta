import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import {
  createWorkspaceSavedViewsState,
  createWorkspaceHost,
  getWorkspaceCodeSectionData,
  projectWorkspaceDocumentSavedViews,
  setItemPresentation,
  setWorkspaceCodeSectionData,
  type WorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import { readCallableSectionData } from "../sections/CallableSection";
import { readParameterDictionarySectionData } from "../sections/ParamDictSection";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import { forestMutationProposal } from "./pythonCanvasAppSupport";
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

const CODE_UI = {
  type: "CodeParam",
  configuration: {
    disabled: false,
    language: "python",
    placeholder: null,
    singleLine: true,
    wrapLines: true,
  },
} as const;
const NESTED_UI = {
  type: "NestedParam",
  configuration: {},
} as const;

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
        ui: CODE_UI,
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
        ui: CODE_UI,
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
        ui: CODE_UI,
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
      presentation: { label: "scale" },
    });
    expect(readCallableParameterItems(document, callableId)).toEqual([
      expect.objectContaining({ id: structuralRootId }),
    ]);
  });

  it("round-trips configured controls for callable parameters and Param Dict leaves", () => {
    const callableSnapshot = dynamicSnapshot();
    const callableHost = createWorkspaceHost();
    registerPythonCanvasSectionKinds(callableHost);
    callableHost.loadDocument(projectWorkspaceDocument(callableSnapshot));
    setItemPresentation(
      callableHost,
      callableSectionID("callable:second"),
      parameterWorkspaceItemID("parameter:scale"),
      {
        kind: "slider",
        value: "8",
        configuration: { disabled: false, max: 10, min: 0, step: 0.5 },
      },
    );
    expect(
      readCallableParameterItems(
        callableHost.getSnapshot(),
        "callable:second",
      ).find((parameter) => parameter.id === "parameter:scale"),
    ).toMatchObject({
      data: { authoredExpression: "8" },
      ui: {
        type: "SliderParam",
        configuration: { disabled: false, max: 10, min: 0, step: 0.5 },
      },
    });
    callableHost.dispose();

    const dictionarySnapshot = forestSnapshot();
    const dictionaryHost = createWorkspaceHost();
    registerPythonCanvasSectionKinds(dictionaryHost);
    dictionaryHost.loadDocument(projectWorkspaceDocument(dictionarySnapshot));
    setItemPresentation(
      dictionaryHost,
      parameterDictionarySectionID("dictionary:options"),
      dictionaryEntryWorkspaceItemID("entry:radius"),
      {
        kind: "dropdown",
        value: "large",
        configuration: {
          choices: ["small", "large"],
          disabled: false,
          placeholder: null,
        },
      },
    );
    expect(
      readParameterDictionaryEntries(
        dictionaryHost.getSnapshot(),
        "dictionary:options",
      )[0],
    ).toEqual({
      authoredExpression: '"large"',
      id: "entry:radius",
      kind: "leaf",
      name: "radius",
      ui: {
        type: "DropdownParam",
        configuration: {
          disabled: false,
          flatChoices: ["small", "large"],
          groupedChoices: null,
          placeholder: null,
        },
      },
    });
    dictionaryHost.dispose();
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

  it("applies clipboard root layouts with copied dimensions and frontmost z-indices", () => {
    const initialSnapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(initialSnapshot));
    const pastedSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [
        ...initialSnapshot.callables,
        {
          authoredExpression: "pasted",
          id: "callable:pasted",
          name: "Pasted callable",
          parameters: [],
        },
      ],
      project: {
        ...initialSnapshot.project,
        revision: initialSnapshot.project.revision + 1,
      },
      topLevelSectionIds: [
        ...initialSnapshot.topLevelSectionIds,
        "callable:pasted",
      ],
    });

    applyProjectSnapshotToWorkspace(host, pastedSnapshot, {
      canonicalRootLayoutOverrides: new Map([
        ["callable:pasted", { h: 240, w: 360, x: 720, y: 480 }],
      ]),
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(),
      pendingSectionIds: new Map(),
      unresolvedPendingSectionIds: new Set(),
    });

    expect(
      host.getSnapshot().topLevelSections[callableSectionID("callable:pasted")],
    ).toEqual({ h: 240, w: 360, x: 720, y: 480, zIndex: 4 });
    host.dispose();
  });

  it("preserves copied presentation for accepted roots and descendants", () => {
    const initialSnapshot = forestSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(initialSnapshot));
    const pastedSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [
        {
          authoredExpression: "pasted",
          id: "callable:pasted",
          name: "Pasted callable",
          parameters: [],
        },
      ],
      diagnostics: [],
      diagnosticsRevision: initialSnapshot.project.revision + 1,
      lists: [
        {
          childSectionIds: ["callable:pasted", "dictionary:pasted"],
          id: "list:pasted",
          name: "Pasted list",
        },
      ],
      parameterDictionaries: [
        {
          entries: [],
          id: "dictionary:pasted",
          name: "Pasted dictionary",
        },
      ],
      project: {
        ...initialSnapshot.project,
        revision: initialSnapshot.project.revision + 1,
      },
      topLevelSectionIds: ["list:pasted"],
    });

    applyProjectSnapshotToWorkspace(host, pastedSnapshot, {
      canonicalSectionPresentationOverrides: new Map([
        [
          "list:pasted",
          {
            isHorizontalOrientation: true,
            isMinimized: true,
            overflowMode: false,
            positionAndSizeLocked: true,
            size: { height: 50, width: 260 },
            styleColor: "#ef4444",
            tagColor: "#f97316",
          },
        ],
        [
          "callable:pasted",
          {
            isHorizontalOrientation: false,
            isMinimized: false,
            overflowMode: false,
            positionAndSizeLocked: false,
            size: { height: 180, width: 320 },
            styleColor: "#3b82f6",
            tagColor: "#22c55e",
          },
        ],
        [
          "dictionary:pasted",
          {
            isHorizontalOrientation: true,
            isMinimized: false,
            overflowMode: false,
            positionAndSizeLocked: false,
            size: { height: 280, width: 460 },
            styleColor: "#a855f7",
            tagColor: "#ec4899",
          },
        ],
      ]),
      keepAuthoredPython: false,
      keepDictionaryEntries: new Set(),
      keepParameterLists: new Set(),
      pendingSectionIds: new Map(),
      unresolvedPendingSectionIds: new Set(),
    });

    expect(
      host.getSnapshot().sections[listSectionID("list:pasted")],
    ).toMatchObject({
      isHorizontalOrientation: true,
      isMinimized: true,
      overflowMode: false,
      positionAndSizeLocked: true,
      size: { height: 50, width: 260 },
      styleColor: "#ef4444",
      tagColor: "#f97316",
    });
    expect(
      host.getSnapshot().sections[callableSectionID("callable:pasted")],
    ).toMatchObject({
      size: { height: 180, width: 320 },
      styleColor: "#3b82f6",
      tagColor: "#22c55e",
    });
    expect(
      host.getSnapshot().sections[
        parameterDictionarySectionID("dictionary:pasted")
      ],
    ).toMatchObject({
      isHorizontalOrientation: true,
      overflowMode: false,
      size: { height: 280, width: 460 },
      styleColor: "#a855f7",
      tagColor: "#ec4899",
    });
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

  it("replaces diagnostics when settled and clears them on a lagging provider failure", () => {
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
        diagnostic("parameter:survives", "Replacement parameter error"),
        diagnostic("entry:survives", "Replacement dictionary entry error"),
      ],
      diagnosticsRevision: 2,
      revision: 2,
    });
    const failed = diagnosticContinuitySnapshot({
      diagnostics: [],
      diagnosticsRevision: 2,
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
      parameterDiagnostics: {
        [parameterWorkspaceItemID("parameter:survives")]: [
          { message: "Replacement parameter error", severity: "error" },
        ],
      },
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
        ui: CODE_UI,
      },
      {
        children: [
          {
            authoredExpression: "2",
            id: "entry:scale",
            kind: "leaf",
            name: "scale",
            ui: CODE_UI,
          },
        ],
        id: "entry:options",
        kind: "parent",
        name: "options",
        ui: NESTED_UI,
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

  it("keeps coordinate-only top-level layout changes out of forest mutations", () => {
    const snapshot = dynamicSnapshot();
    const document = projectWorkspaceDocument(snapshot);
    const firstId = callableSectionID("callable:first");
    const secondId = callableSectionID("callable:second");
    const coordinateOnly = {
      ...document,
      topLevelSections: {
        ...document.topLevelSections,
        [firstId]: {
          ...document.topLevelSections[firstId]!,
          x: 720,
          y: 360,
        },
        [secondId]: {
          ...document.topLevelSections[secondId]!,
          x: 48,
          y: 624,
        },
      },
    };

    expect(workspaceForestProposal(coordinateOnly, snapshot)).toEqual(
      workspaceForestProposal(document, snapshot),
    );
    expect(forestMutationProposal(coordinateOnly, snapshot)).toBeNull();
  });

  it("retains local top-level coordinates through a later canonical projection", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));
    const firstId = callableSectionID("callable:first");
    const secondId = callableSectionID("callable:second");
    const current = host.getSnapshot();
    const firstLayout = {
      ...current.topLevelSections[firstId]!,
      x: 720,
      y: 360,
    };
    const secondLayout = {
      ...current.topLevelSections[secondId]!,
      x: 48,
      y: 624,
    };
    host.loadDocument({
      ...current,
      topLevelSections: {
        ...current.topLevelSections,
        [firstId]: firstLayout,
        [secondId]: secondLayout,
      },
    });
    const laterSnapshot = parseProjectSnapshotV2({
      ...snapshot,
      callables: snapshot.callables.map((callable) =>
        callable.id === "callable:first"
          ? { ...callable, name: "First callable updated" }
          : callable,
      ),
      project: {
        ...snapshot.project,
        revision: snapshot.project.revision + 1,
      },
    });

    applyCanonicalSnapshot(host, laterSnapshot);

    expect(host.getSnapshot().sections[firstId]?.name).toBe(
      "First callable updated",
    );
    expect(host.getSnapshot().topLevelSections[firstId]).toEqual(firstLayout);
    expect(host.getSnapshot().topLevelSections[secondId]).toEqual(secondLayout);
    host.dispose();
  });

  it("retains saved views while the package reconciles canonical section drift", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    const initialDocument = projectWorkspaceDocument(snapshot);
    const initialSavedViews = createWorkspaceSavedViewsState(initialDocument, {
      id: "overview",
      name: "Overview",
    });
    const firstId = callableSectionID("callable:first");
    const overview = initialSavedViews.views.overview;
    if (!overview) throw new Error("Missing Overview.");
    const retainedLayout = {
      ...overview.topLevelSections[firstId]!,
      x: 720,
      y: 360,
    };
    const savedViews = {
      ...initialSavedViews,
      views: {
        ...initialSavedViews.views,
        overview: {
          ...overview,
          topLevelSections: {
            ...overview.topLevelSections,
            [firstId]: retainedLayout,
          },
          viewport: { x: 120, y: 80, zoom: 1.25 },
        },
      },
    };
    host.loadDocument(
      projectWorkspaceDocumentSavedViews({
        ...initialDocument,
        savedViews,
      }),
    );
    const addedSnapshot = parseProjectSnapshotV2({
      ...snapshot,
      callables: [
        ...snapshot.callables,
        {
          authoredExpression: "third",
          id: "callable:third",
          name: "Third callable",
          parameters: [],
        },
      ],
      generatedCode: {
        ...snapshot.generatedCode,
        sourceRangesByTargetId: {
          ...snapshot.generatedCode.sourceRangesByTargetId,
          "callable:third": { end: 2, start: 2 },
        },
      },
      project: { ...snapshot.project, revision: snapshot.project.revision + 1 },
      topLevelSectionIds: [
        "callable:first",
        "callable:second",
        "callable:third",
      ],
    });
    applyCanonicalSnapshot(host, addedSnapshot);
    const addedDocument = host.getSnapshot();
    const addedSavedViews = addedDocument.savedViews;
    const thirdId = callableSectionID("callable:third");
    if (addedSavedViews === null)
      throw new Error("Expected reconciled saved views.");
    expect(addedDocument.topLevelSections[firstId]).toEqual(retainedLayout);
    expect(addedSavedViews.views.overview?.topLevelSections[firstId]).toEqual(
      retainedLayout,
    );
    expect(addedSavedViews.views.overview?.sectionVisibility[thirdId]).toBe(
      true,
    );
    expect(addedSavedViews.views.overview?.topLevelSections[thirdId]).toEqual(
      addedDocument.topLevelSections[thirdId],
    );
    const deletedSnapshot = parseProjectSnapshotV2({
      ...addedSnapshot,
      callables: addedSnapshot.callables.filter(
        (callable) => callable.id === "callable:first",
      ),
      generatedCode: {
        ...addedSnapshot.generatedCode,
        sourceRangesByTargetId: {
          "callable:first": { end: 2, start: 2 },
        },
      },
      project: {
        ...addedSnapshot.project,
        revision: addedSnapshot.project.revision + 1,
      },
      topLevelSectionIds: ["callable:first"],
    });
    applyCanonicalSnapshot(host, deletedSnapshot);
    const deletedSavedViews = host.getSnapshot().savedViews;
    if (deletedSavedViews === null)
      throw new Error("Expected saved views after section deletion.");
    expect(
      deletedSavedViews.views.overview?.sectionVisibility[
        callableSectionID("callable:second")
      ],
    ).toBeUndefined();
    expect(
      deletedSavedViews.views.overview?.topLevelSections[thirdId],
    ).toBeUndefined();
    host.dispose();
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
        ui: NESTED_UI,
      },
      {
        children: [],
        id: "entry:options",
        kind: "parent",
        name: "options",
        ui: NESTED_UI,
      },
      {
        authoredExpression: "2",
        id: "entry:scale",
        kind: "leaf",
        name: "scale",
        ui: CODE_UI,
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
            ui: CODE_UI,
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
            ui: CODE_UI,
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
            ui: CODE_UI,
          },
          {
            authoredExpression: "missing_value",
            id: "entry:deleted",
            kind: "leaf",
            name: "deleted",
            ui: CODE_UI,
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
            ui: CODE_UI,
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
            ui: CODE_UI,
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
            ui: CODE_UI,
          },
          {
            children: [
              {
                authoredExpression: "2",
                id: "entry:scale",
                kind: "leaf",
                name: "scale",
                ui: CODE_UI,
              },
            ],
            id: "entry:options",
            kind: "parent",
            name: "options",
            ui: NESTED_UI,
          },
        ],
        id: "dictionary:options",
        name: "Options",
      },
    ],
    topLevelSectionIds: ["list:objects"],
  });
}
