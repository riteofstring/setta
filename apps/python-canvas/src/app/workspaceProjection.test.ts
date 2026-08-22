import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import {
  createWorkspaceHost,
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  getWorkspaceCodeSectionData,
  insertWorkspaceItem,
  setWorkspaceCodeSectionData,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import { readCallableSectionData } from "../sections/CallableSection";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  CALLABLE_SECTION_KIND,
  GENERATED_PYTHON_SECTION_ID,
  PENDING_CALLABLE_SECTION_KIND,
  applyProjectSnapshotToWorkspace,
  callableSectionID,
  createPendingCallableSection,
  isCallableParameterAuthoringPending,
  parameterWorkspaceItemID,
  projectWorkspaceDocument,
  readCallableParameterItems,
  readGeneratedPythonTarget,
  setCallableParameterAuthoringPending,
  setParameterItemName,
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

  it("locks only the committing callable's parameter authoring boundary", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    const secondId = callableSectionID("callable:second");
    const document = host.getSnapshot();
    const second = document.sections[secondId];
    if (second?.itemTree === undefined) {
      throw new Error("Expected the second callable parameter tree.");
    }
    host.loadDocument({
      ...document,
      sections: {
        ...document.sections,
        [secondId]: {
          ...second,
          itemTree: {
            ...second.itemTree,
            selectedItemIds: [parameterWorkspaceItemID("parameter:scale")],
          },
        },
      },
    });

    setCallableParameterAuthoringPending(host, "callable:second", true);

    const pending = host.getSnapshot();
    expect(pending.sections[callableSectionID("callable:first")]).toMatchObject(
      {
        kind: CALLABLE_SECTION_KIND,
        positionAndSizeLocked: false,
      },
    );
    expect(
      pending.sections[callableSectionID("callable:second")],
    ).toMatchObject({
      kind: PENDING_CALLABLE_SECTION_KIND,
      positionAndSizeLocked: true,
    });
    expect(pending.sections[secondId]?.itemTree?.selectedItemIds).toEqual([]);
    expect(
      isCallableParameterAuthoringPending(pending, "callable:second"),
    ).toBe(true);
    expect(() => insertWorkspaceItem(host, secondId)).toThrow(/locked/);
    expect(() => deleteLastWorkspaceItem(host, secondId)).toThrow(/locked/);
    expect(deleteSelectedWorkspaceItems(host, secondId)).toEqual([]);

    setCallableParameterAuthoringPending(host, "callable:second", false);

    const restored = host.getSnapshot();
    expect(
      restored.sections[callableSectionID("callable:second")],
    ).toMatchObject({
      kind: CALLABLE_SECTION_KIND,
      positionAndSizeLocked: false,
    });
    expect(
      isCallableParameterAuthoringPending(restored, "callable:second"),
    ).toBe(false);
    host.dispose();
  });

  it("replaces a pending callable with its canonical section at the requested position", () => {
    const snapshot = dynamicSnapshot();
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));

    const pendingSectionId = "python-canvas:pending-callable:test";
    const pendingSection = createPendingCallableSection(
      snapshot,
      pendingSectionId,
      "New callable",
    );
    const pendingLayout = {
      h: 300,
      w: 360,
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
    const createdSnapshot = dynamicSnapshot();
    createdSnapshot.callables.push({
      authoredExpression: "",
      id: "callable:created",
      name: "New callable",
      parameters: [],
    });

    applyProjectSnapshotToWorkspace(host, createdSnapshot, {
      keepAuthoredPython: false,
      keepParameterLists: new Set(),
      pendingCallableSectionIds: new Map([
        ["callable:created", pendingSectionId],
      ]),
    });

    const createdSectionId = callableSectionID("callable:created");
    expect(host.getSnapshot().sections[pendingSectionId]).toBeUndefined();
    expect(host.getSnapshot().topLevelSections[createdSectionId]).toEqual(
      pendingLayout,
    );
    expect(host.getSnapshot().activeIds).toEqual([createdSectionId]);
    host.dispose();
  });

  it("uses the exact body range for one combined generated document and preserves outer edits", () => {
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
      from: snapshot.generatedCode.generatedBodyRange.start,
      to: snapshot.generatedCode.generatedBodyRange.end,
    });

    const prefix = "import os";
    const suffix = "state = SettaState()\nprint('done')";
    const code = `${prefix}\n\n${snapshot.generatedCode.body}\n\n${suffix}`;
    const bodyStart = prefix.length + 2;
    setWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID, {
      ...generated,
      code,
      generatedRegion: {
        from: bodyStart,
        to: bodyStart + snapshot.generatedCode.body.length,
      },
    });

    expect(readGeneratedPythonTarget(host)).toEqual({
      generated: snapshot.generatedCode.body,
      prefix,
      suffix,
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
      keepParameterLists: new Set(["callable:second"]),
      pendingCallableSectionIds: new Map(),
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
      keepParameterLists: new Set(["callable:second"]),
      pendingCallableSectionIds: new Map(),
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
});

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
