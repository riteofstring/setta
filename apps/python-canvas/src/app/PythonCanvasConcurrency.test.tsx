import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  commitCallable: vi.fn(),
  commitWorkspaceDocument: vi.fn(),
  createCallable: vi.fn(),
  createList: vi.fn(),
  createParameterDictionary: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  decrementListChildren: vi.fn(),
  deleteCallable: vi.fn(),
  deleteList: vi.fn(),
  deleteParameterDictionary: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  incrementListChildren: vi.fn(),
  refreshCallableParameters: vi.fn(),
  registerSectionKinds: vi.fn(),
  registerWorkspaceCreationCommands: vi.fn(),
  renameCallable: vi.fn(),
  renameList: vi.fn(),
  renameParameterDictionary: vi.fn(),
  replaceSectionForest: vi.fn(),
  setCallableParameters: vi.fn(),
  setItemData: vi.fn(),
  setParameterDictionaryEntries: vi.fn(),
  setPythonTarget: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
}));

type MockCreationCommand = {
  createSection: (context: unknown) => WorkspaceDocument["sections"][string];
  id: string;
};

type WorkspaceHarness = {
  getDocument: () => WorkspaceDocument;
  publish: (next: WorkspaceDocument) => void;
  replace: (next: WorkspaceDocument) => void;
};

vi.mock("../backend/client", () => ({
  ProjectClientError: class extends Error {},
  commitCallable: mocks.commitCallable,
  createCallable: mocks.createCallable,
  createList: mocks.createList,
  createParameterDictionary: mocks.createParameterDictionary,
  decrementListChildren: mocks.decrementListChildren,
  deleteCallable: mocks.deleteCallable,
  deleteList: mocks.deleteList,
  deleteParameterDictionary: mocks.deleteParameterDictionary,
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  incrementListChildren: mocks.incrementListChildren,
  refreshCallableParameters: mocks.refreshCallableParameters,
  renameCallable: mocks.renameCallable,
  renameList: mocks.renameList,
  renameParameterDictionary: mocks.renameParameterDictionary,
  replaceSectionForest: mocks.replaceSectionForest,
  setCallableParameters: mocks.setCallableParameters,
  setParameterDictionaryEntries: mocks.setParameterDictionaryEntries,
  setPythonTarget: mocks.setPythonTarget,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ItemNameEditor: () => <input aria-label="Item name" readOnly />,
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
  TextValueEditor: () => <input aria-label="Value" readOnly />,
  WorkspaceCanvas: () => <div data-testid="workspace-canvas" />,
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  WorkspaceItemList: () => <div data-testid="workspace-items" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  commitWorkspaceDocument: mocks.commitWorkspaceDocument,
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: (data: Record<string, unknown>) => data,
  createWorkspaceHost: mocks.createWorkspaceHost,
  getWorkspaceCodeSectionData: mocks.getWorkspaceCodeSectionData,
  registerSectionKinds: mocks.registerSectionKinds,
  registerWorkspaceCreationCommands: mocks.registerWorkspaceCreationCommands,
  setItemData: mocks.setItemData,
  setWorkspaceColorMode: mocks.setWorkspaceColorMode,
}));

import { PythonCanvasApp } from "./PythonCanvasApp";
import {
  callableSectionID,
  parameterWorkspaceItemID,
  parameterDictionarySectionID,
} from "./workspaceProjection";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createWorkspaceCodeSection.mockReturnValue({
    renderContent: () => <div />,
  });
  mocks.createWorkspaceHost.mockReturnValue(createHost());
  mocks.fetchProjectSnapshot.mockResolvedValue(
    parseProjectSnapshotV2(projectSnapshotFixture),
  );
});

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  vi.useRealTimers();
});

describe("PythonCanvasApp concurrency", () => {
  it("queues a later forest replacement from its surviving local order", async () => {
    const initialSnapshot = multiCallableSnapshot(1, [
      "callable:one",
      "callable:two",
      "callable:three",
    ]);
    const firstCanonicalSnapshot = multiCallableSnapshot(2, [
      "callable:two",
      "callable:one",
      "callable:three",
    ]);
    const latestCanonicalSnapshot = multiCallableSnapshot(3, [
      "callable:three",
      "callable:two",
      "callable:one",
    ]);
    const firstRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.replaceSectionForest
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(latestCanonicalSnapshot);

    renderApp();
    await flushEffects();

    workspace.publish(
      reorderTopLevelCallables(
        workspace.getDocument(),
        firstCanonicalSnapshot.topLevelSectionIds,
      ),
    );
    await flushEffects();
    expect(mocks.replaceSectionForest).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      listChildren: [],
      projectId: initialSnapshot.project.id,
      topLevelSectionIds: firstCanonicalSnapshot.topLevelSectionIds,
    });

    workspace.publish(
      reorderTopLevelCallables(
        workspace.getDocument(),
        latestCanonicalSnapshot.topLevelSectionIds,
      ),
    );
    await flushEffects();
    expect(mocks.replaceSectionForest).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRequest.resolve(firstCanonicalSnapshot);
      await flushMicrotasks();
    });

    expect(mocks.replaceSectionForest).toHaveBeenCalledTimes(2);
    expect(mocks.replaceSectionForest).toHaveBeenLastCalledWith({
      expectedRevision: firstCanonicalSnapshot.project.revision,
      listChildren: [],
      projectId: firstCanonicalSnapshot.project.id,
      topLevelSectionIds: latestCanonicalSnapshot.topLevelSectionIds,
    });
    expect(topLevelCallableIds(workspace.getDocument())).toEqual(
      latestCanonicalSnapshot.topLevelSectionIds,
    );
  });

  it("reconciles concurrent pane placeholders in their own saved layouts", async () => {
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const callableSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [
        {
          authoredExpression: "",
          id: "callable:created",
          name: "New callable",
          parameters: [],
        },
      ],
      diagnosticsRevision: 2,
      project: { ...initialSnapshot.project, revision: 2 },
      topLevelSectionIds: ["callable:created"],
    });
    const dictionarySnapshot = parseProjectSnapshotV2({
      ...callableSnapshot,
      parameterDictionaries: [
        { entries: [], id: "dictionary:created", name: "New Param Dict" },
      ],
      diagnosticsRevision: 3,
      project: { ...callableSnapshot.project, revision: 3 },
      topLevelSectionIds: ["callable:created", "dictionary:created"],
    });
    const callableRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const dictionaryRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.createCallable.mockReturnValueOnce(callableRequest.promise);
    mocks.createParameterDictionary.mockReturnValueOnce(
      dictionaryRequest.promise,
    );

    renderApp();
    await flushEffects();

    const pendingCallable = invokeMockCreationCommand({
      workspacePosition: { x: 48, y: 64 },
    });
    const callableLayout = { h: 150, w: 250, x: 48, y: 64, zIndex: 4 };
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [pendingCallable.id],
      sections: {
        ...workspace.getDocument().sections,
        [pendingCallable.id]: pendingCallable,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pendingCallable.id]: callableLayout,
      },
    });
    await flushEffects();

    const pendingDictionary = invokeMockCreationCommand(
      { workspacePosition: { x: 516, y: 336 } },
      "parameter-dictionary",
    );
    const dictionaryLayout = { h: 300, w: 420, x: 516, y: 336, zIndex: 5 };
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [...workspace.getDocument().activeIds, pendingDictionary.id],
      sections: {
        ...workspace.getDocument().sections,
        [pendingDictionary.id]: pendingDictionary,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pendingDictionary.id]: dictionaryLayout,
      },
    });
    await flushEffects();

    expect(mocks.createParameterDictionary).not.toHaveBeenCalled();
    await act(async () => {
      callableRequest.resolve(callableSnapshot);
      await flushMicrotasks();
    });

    const callableSectionId = callableSectionID("callable:created");
    expect(mocks.createParameterDictionary).toHaveBeenCalledWith({
      expectedRevision: callableSnapshot.project.revision,
      name: "New Param Dict",
      projectId: callableSnapshot.project.id,
    });
    expect(
      workspace.getDocument().sections[pendingCallable.id],
    ).toBeUndefined();
    expect(workspace.getDocument().topLevelSections[callableSectionId]).toEqual(
      callableLayout,
    );
    expect(workspace.getDocument().sections[pendingDictionary.id]).toBe(
      pendingDictionary,
    );
    expect(
      workspace.getDocument().topLevelSections[pendingDictionary.id],
    ).toEqual(dictionaryLayout);
    expect(workspace.getDocument().activeIds).toEqual([
      callableSectionId,
      pendingDictionary.id,
    ]);

    await act(async () => {
      dictionaryRequest.resolve(dictionarySnapshot);
      await flushMicrotasks();
    });

    const dictionarySectionId =
      parameterDictionarySectionID("dictionary:created");
    expect(
      workspace.getDocument().sections[pendingDictionary.id],
    ).toBeUndefined();
    expect(
      workspace.getDocument().topLevelSections[dictionarySectionId],
    ).toEqual(dictionaryLayout);
    expect(workspace.getDocument().topLevelSections[callableSectionId]).toEqual(
      callableLayout,
    );
    expect(workspace.getDocument().activeIds).toEqual([
      callableSectionId,
      dictionarySectionId,
    ]);
  });

  it("settles same-revision diagnostics without visible pending state or losing an unresolved placeholder", async () => {
    vi.useFakeTimers();
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const localParameter = {
      authoredExpression: "",
      default: null,
      id: "parameter:local",
      name: "local",
      nameEditable: true,
      passingStyle: "positional_or_keyword" as const,
      providerOrdinal: null,
      typeAnnotation: null,
    };
    const createdSnapshot = laggingCallableSnapshot(2, [
      {
        id: "callable:created",
        name: "New callable",
        parameters: [localParameter],
      },
    ]);
    const settledSnapshot = settledDiagnosticsSnapshot(
      createdSnapshot,
      "callable:created",
    );
    const diagnosticsRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const secondCreationRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(diagnosticsRequest.promise);
    mocks.createCallable
      .mockResolvedValueOnce(createdSnapshot)
      .mockReturnValueOnce(secondCreationRequest.promise);

    const view = renderApp();
    await flushEffects();

    const pendingCallable = invokeMockCreationCommand({
      workspacePosition: { x: 48, y: 64 },
    });
    const callableLayout = { h: 150, w: 250, x: 48, y: 64, zIndex: 4 };
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [pendingCallable.id],
      sections: {
        ...workspace.getDocument().sections,
        [pendingCallable.id]: pendingCallable,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pendingCallable.id]: callableLayout,
      },
    });
    await flushEffects();

    const canonicalSectionId = callableSectionID("callable:created");
    const parameterId = parameterWorkspaceItemID(localParameter.id);
    installLocalParameterDraft(workspace, canonicalSectionId, parameterId);
    await advanceDiagnosticsRevalidation();
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(2);
    expectReadyStatus(view);

    const pendingSecondCallable = invokeMockCreationCommand({
      workspacePosition: { x: 516, y: 336 },
    });
    const secondCallableLayout = {
      h: 150,
      w: 250,
      x: 516,
      y: 336,
      zIndex: 5,
    };
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [canonicalSectionId, pendingSecondCallable.id],
      sections: {
        ...workspace.getDocument().sections,
        [pendingSecondCallable.id]: pendingSecondCallable,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pendingSecondCallable.id]: secondCallableLayout,
      },
    });
    await flushEffects();

    const statusBeforeDiagnosticsSettle = statusMessage(view);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await flushMicrotasks();
    });
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(2);

    await act(async () => {
      diagnosticsRequest.resolve(settledSnapshot);
      await flushMicrotasks();
    });

    expect(statusMessage(view)).toBe(statusBeforeDiagnosticsSettle);
    expectDiagnosticsReconciliation({
      callableLayout,
      canonicalSectionId,
      parameterId,
      pendingSecondCallable,
      secondCallableLayout,
      workspace,
    });
    expectNoMutationError(view);
  });

  it("cancels obsolete diagnostics polling and ignores its late older snapshot", async () => {
    vi.useFakeTimers();
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const firstSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:first", name: "New callable" },
    ]);
    const secondSnapshot = laggingCallableSnapshot(3, [
      { id: "callable:first", name: "New callable" },
      { id: "callable:second", name: "New callable 2" },
    ]);
    const olderDiagnosticsRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(olderDiagnosticsRequest.promise)
      .mockResolvedValueOnce(
        settledDiagnosticsSnapshot(secondSnapshot, "callable:second"),
      );
    mocks.createCallable
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(secondSnapshot);

    renderApp();
    await flushEffects();

    const firstPending = invokeMockCreationCommand({
      workspacePosition: { x: 48, y: 64 },
    });
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [firstPending.id],
      sections: {
        ...workspace.getDocument().sections,
        [firstPending.id]: firstPending,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [firstPending.id]: { h: 150, w: 250, x: 48, y: 64, zIndex: 4 },
      },
    });
    await flushEffects();

    await advanceDiagnosticsRevalidation();
    const olderRequestOptions = mocks.fetchProjectSnapshot.mock
      .calls[1]?.[0] as { signal?: AbortSignal } | undefined;
    expect(olderRequestOptions?.signal).toBeDefined();

    const secondPending = invokeMockCreationCommand({
      workspacePosition: { x: 516, y: 336 },
    });
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [callableSectionID("callable:first"), secondPending.id],
      sections: {
        ...workspace.getDocument().sections,
        [secondPending.id]: secondPending,
      },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [secondPending.id]: { h: 150, w: 250, x: 516, y: 336, zIndex: 5 },
      },
    });
    await flushEffects();

    expect(olderRequestOptions?.signal?.aborted).toBe(true);
    await advanceDiagnosticsRevalidation();
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(3);

    await act(async () => {
      olderDiagnosticsRequest.resolve(
        settledDiagnosticsSnapshot(firstSnapshot, "callable:first"),
      );
      await flushMicrotasks();
    });

    const secondSectionId = callableSectionID("callable:second");
    expect(
      workspace.getDocument().sections[secondSectionId]?.data,
    ).toMatchObject({
      callableDiagnosticMessage: "The callable needs diagnostics.",
    });
    expect(workspace.getDocument().sections[secondSectionId]).toBeDefined();
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(3);
  });

  it("does not let diagnostics polling overtake pending create reconciliation", async () => {
    vi.useFakeTimers();
    const initialSnapshot = laggingCallableSnapshot(2, []);
    const createdSnapshot = laggingCallableSnapshot(3, [
      { id: "callable:created", name: "New callable" },
    ]);
    const diagnosticsRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const createRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(diagnosticsRequest.promise);
    mocks.createCallable.mockReturnValueOnce(createRequest.promise);

    renderApp();
    await flushEffects();
    await advanceDiagnosticsRevalidation();

    const pending = invokeMockCreationCommand({
      workspacePosition: { x: 48, y: 64 },
    });
    const pendingLayout = { h: 150, w: 250, x: 48, y: 64, zIndex: 4 };
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [pending.id],
      sections: { ...workspace.getDocument().sections, [pending.id]: pending },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pending.id]: pendingLayout,
      },
    });
    await flushEffects();

    await act(async () => {
      diagnosticsRequest.resolve(createdSnapshot);
      await flushMicrotasks();
    });

    const canonicalSectionId = callableSectionID("callable:created");
    expect(
      workspace.getDocument().sections[canonicalSectionId],
    ).toBeUndefined();
    expect(workspace.getDocument().sections[pending.id]).toBe(pending);
    expect(workspace.getDocument().topLevelSections[pending.id]).toEqual(
      pendingLayout,
    );
    expect(workspace.getDocument().activeIds).toEqual([pending.id]);

    await act(async () => {
      createRequest.resolve(createdSnapshot);
      await flushMicrotasks();
    });

    expect(workspace.getDocument().sections[pending.id]).toBeUndefined();
    expect(
      workspace.getDocument().topLevelSections[canonicalSectionId],
    ).toEqual(pendingLayout);
    expect(workspace.getDocument().activeIds).toEqual([canonicalSectionId]);
  });

  it("does not resurrect a local deletion from a diagnostics-only response", async () => {
    vi.useFakeTimers();
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    const diagnosticsRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const deleteRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(diagnosticsRequest.promise);
    mocks.deleteCallable.mockReturnValueOnce(deleteRequest.promise);

    renderApp();
    await flushEffects();
    await advanceDiagnosticsRevalidation();

    const sectionId = callableSectionID("callable:one");
    const sections = { ...workspace.getDocument().sections };
    const topLevelSections = { ...workspace.getDocument().topLevelSections };
    delete sections[sectionId];
    delete topLevelSections[sectionId];
    workspace.publish({
      ...workspace.getDocument(),
      sections,
      topLevelSections,
    });
    await flushEffects();

    await act(async () => {
      diagnosticsRequest.resolve(
        settledDiagnosticsSnapshot(initialSnapshot, "callable:one"),
      );
      await flushMicrotasks();
    });

    expect(workspace.getDocument().sections[sectionId]).toBeUndefined();
    expect(workspace.getDocument().topLevelSections[sectionId]).toBeUndefined();
    expect(mocks.deleteCallable).toHaveBeenCalledWith("callable:one", {
      expectedRevision: initialSnapshot.project.revision,
      projectId: initialSnapshot.project.id,
    });
  });

  it("stops after a failed diagnostics result without an app error", async () => {
    vi.useFakeTimers();
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(failedDiagnosticsSnapshot(initialSnapshot));

    const view = renderApp();
    await flushEffects();
    await advanceDiagnosticsRevalidation();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await flushMicrotasks();
    });
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(2);
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toBe("");
  });

  it("aborts a held diagnostics request when the controller unmounts", async () => {
    vi.useFakeTimers();
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    const heldRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(heldRequest.promise);

    renderApp();
    await flushEffects();
    await advanceDiagnosticsRevalidation();
    const requestOptions = mocks.fetchProjectSnapshot.mock.calls[1]?.[0] as
      { signal?: AbortSignal } | undefined;

    act(() => root?.unmount());
    root = undefined;
    expect(requestOptions?.signal?.aborted).toBe(true);

    await act(async () => {
      heldRequest.resolve(failedDiagnosticsSnapshot(initialSnapshot));
      await flushMicrotasks();
    });
  });

  it("accepts parameters refreshed by a Python target response", async () => {
    vi.useFakeTimers();
    const initialSnapshot = singleCallableSnapshot(1, []);
    const parameter = {
      authoredExpression: "",
      default: null,
      id: "parameter:x",
      name: "x",
      nameEditable: false,
      passingStyle: "positional_or_keyword" as const,
      providerOrdinal: 0,
      typeAnnotation: "float",
    };
    const prefix = "import math";
    const body = initialSnapshot.generatedCode.body;
    const suffix = initialSnapshot.pythonTarget.suffix;
    const bodyStart = prefix.length + 2;
    const resolvedSnapshot = parseProjectSnapshotV2({
      ...singleCallableSnapshot(2, [parameter]),
      diagnostics: [
        {
          end: 1,
          id: "diagnostic:missing-x",
          message: 'Argument missing for parameter "x"',
          severity: "error",
          start: 0,
          targetId: parameter.id,
        },
      ],
      generatedCode: {
        ...initialSnapshot.generatedCode,
        body,
        code: `${prefix}\n\n${body}\n\n${suffix}`,
        generatedBodyRange: {
          end: bodyStart + body.length,
          start: bodyStart,
        },
      },
      pythonTarget: { prefix, suffix },
    });
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.setPythonTarget.mockResolvedValue(resolvedSnapshot);

    renderApp();
    await flushEffects();
    const before = workspace.getDocument();
    const generated = before.sections["python-canvas:generated-python"];
    if (generated === undefined) {
      throw new Error("Generated Python section is missing.");
    }
    const localCode = `${prefix}\n\n${body}\n\n${suffix}`;
    workspace.publish({
      ...before,
      sections: {
        ...before.sections,
        "python-canvas:generated-python": {
          ...generated,
          data: {
            ...(generated.data as object),
            code: localCode,
            generatedRegion: {
              from: prefix.length,
              to: localCode.length - suffix.length,
            },
          },
        },
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await flushMicrotasks();
    });

    const section =
      workspace.getDocument().sections[callableSectionID("callable:one")];
    const itemId = parameterWorkspaceItemID(parameter.id);
    const itemTree = section?.itemTree;
    if (itemTree === undefined) {
      throw new Error("Resolved callable parameter tree is missing.");
    }
    expect(mocks.setPythonTarget).toHaveBeenCalledTimes(1);
    expect(itemTree.items[itemTree.rootId]?.children).toEqual([itemId]);
    expect(section?.data).toMatchObject({
      parameterDiagnostics: {
        [itemId]: [
          { message: 'Argument missing for parameter "x"', severity: "error" },
        ],
      },
    });
  });
});

function createHost(): WorkspaceHost {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      activeIds: [],
      sections: {},
      topLevelSections: {},
      viewport: null,
    }),
    loadDocument: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  } as unknown as WorkspaceHost;
}

function installWorkspaceHarness(): WorkspaceHarness {
  let document: WorkspaceDocument = {
    activeIds: [],
    sections: {},
    topLevelSections: {},
    viewport: null,
  };
  let subscriber: ((next: WorkspaceDocument) => void) | null = null;
  const host = {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => document),
    loadDocument: vi.fn((next: WorkspaceDocument) => {
      document = next;
    }),
    subscribe: vi.fn((next: (updated: WorkspaceDocument) => void) => {
      subscriber = next;
      return () => {
        if (subscriber === next) {
          subscriber = null;
        }
      };
    }),
  } as unknown as WorkspaceHost;
  mocks.createWorkspaceHost.mockReturnValue(host);
  mocks.commitWorkspaceDocument.mockImplementation(
    (_host: WorkspaceHost, next: WorkspaceDocument) => {
      document = next;
    },
  );
  mocks.getWorkspaceCodeSectionData.mockImplementation(
    (_host: WorkspaceHost, sectionId: string) => {
      const section = document.sections[sectionId];
      if (section === undefined) {
        throw new Error(`Missing workspace section ${sectionId}.`);
      }
      return section.data;
    },
  );
  return {
    getDocument: () => document,
    publish: (next: WorkspaceDocument) => {
      document = next;
      subscriber?.(next);
    },
    replace: (next: WorkspaceDocument) => {
      document = next;
    },
  };
}

function installLocalParameterDraft(
  workspace: WorkspaceHarness,
  canonicalSectionId: string,
  parameterId: string,
) {
  const document = workspace.getDocument();
  const section = document.sections[canonicalSectionId];
  const parameter = section?.itemTree?.items[parameterId];
  if (section?.itemTree === undefined || parameter === undefined) {
    throw new Error("Expected the canonical callable parameter draft.");
  }
  workspace.replace({
    ...document,
    sections: {
      ...document.sections,
      [canonicalSectionId]: {
        ...section,
        itemTree: {
          ...section.itemTree,
          items: {
            ...section.itemTree.items,
            [parameterId]: {
              ...parameter,
              data: {
                ...(parameter.data as object),
                authoredExpression: "local draft",
              },
            },
          },
        },
      },
    },
  });
}

function expectReadyStatus(view: HTMLElement) {
  const status = view.querySelector("[role='status']");
  expect(status?.textContent).toBe("Python Canvas ready.");
  expect(status?.getAttribute("aria-busy")).toBe("false");
}

function statusMessage(view: HTMLElement) {
  return view.querySelector("[role='status']")?.textContent ?? null;
}

function expectDiagnosticsReconciliation({
  callableLayout,
  canonicalSectionId,
  parameterId,
  pendingSecondCallable,
  secondCallableLayout,
  workspace,
}: {
  callableLayout: WorkspaceDocument["topLevelSections"][string];
  canonicalSectionId: string;
  parameterId: string;
  pendingSecondCallable: WorkspaceDocument["sections"][string];
  secondCallableLayout: WorkspaceDocument["topLevelSections"][string];
  workspace: WorkspaceHarness;
}) {
  const document = workspace.getDocument();
  const canonical = document.sections[canonicalSectionId];
  expect(document.topLevelSections[canonicalSectionId]).toEqual(callableLayout);
  expect(canonical?.data).toMatchObject({
    callableDiagnosticMessage: "The callable needs diagnostics.",
  });
  expect(canonical?.itemTree?.items[parameterId]?.data).toMatchObject({
    authoredExpression: "local draft",
  });
  expect(document.sections[pendingSecondCallable.id]).toBe(
    pendingSecondCallable,
  );
  expect(document.topLevelSections[pendingSecondCallable.id]).toEqual(
    secondCallableLayout,
  );
  expect(document.activeIds).toEqual([
    canonicalSectionId,
    pendingSecondCallable.id,
  ]);
}

function expectNoMutationError(view: HTMLElement) {
  expect(view.querySelector("#python-canvas-mutation-error")?.textContent).toBe(
    "",
  );
}

function invokeMockCreationCommand(
  context: unknown,
  id = "python-callable",
): WorkspaceDocument["sections"][string] {
  let section: WorkspaceDocument["sections"][string] | null = null;
  act(() => {
    section = requiredMockCreationCommand(id).createSection(context);
  });
  if (section === null) {
    throw new Error("The Python creation command returned no section.");
  }
  return section;
}

function requiredMockCreationCommand(id: string): MockCreationCommand {
  const commands = mocks.registerWorkspaceCreationCommands.mock.calls.at(
    -1,
  )?.[1] as ReadonlyArray<MockCreationCommand> | undefined;
  const command = commands?.find((candidate) => candidate.id === id);
  if (command === undefined) {
    throw new Error(`Missing ${id} creation command.`);
  }
  return command;
}

function multiCallableSnapshot(revision: number, topLevelSectionIds: string[]) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: ["callable:one", "callable:two", "callable:three"].map((id) => ({
      authoredExpression: "",
      id,
      name: id,
      parameters: [],
    })),
    diagnosticsRevision: revision,
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds,
  });
}

function singleCallableSnapshot(
  revision: number,
  parameters: ReadonlyArray<Record<string, unknown>>,
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "math.sqrt",
        id: "callable:one",
        name: "One callable",
        parameters,
      },
    ],
    diagnosticsRevision: revision,
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: ["callable:one"],
  });
}

function laggingCallableSnapshot(
  revision: number,
  callables: ReadonlyArray<{
    id: string;
    name: string;
    parameters?: ReadonlyArray<Record<string, unknown>>;
  }>,
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: callables.map((callable) => ({
      authoredExpression: "",
      id: callable.id,
      name: callable.name,
      parameters: callable.parameters ?? [],
    })),
    diagnostics: [],
    diagnosticsRevision: revision - 1,
    project: { ...projectSnapshotFixture.project, revision },
    providerStatus: {
      provider: "basedpyright",
      state: "pending",
      status: "available",
    },
    topLevelSectionIds: callables.map((callable) => callable.id),
  });
}

function settledDiagnosticsSnapshot(
  snapshot: ReturnType<typeof parseProjectSnapshotV2>,
  targetId: string,
) {
  return parseProjectSnapshotV2({
    ...snapshot,
    diagnostics: [
      {
        end: 3,
        id: `diagnostic:${targetId}`,
        message: "The callable needs diagnostics.",
        severity: "error",
        start: 2,
        targetId,
      },
    ],
    diagnosticsRevision: snapshot.project.revision,
    providerStatus: {
      provider: "basedpyright",
      state: "ready",
      status: "available",
    },
  });
}

function failedDiagnosticsSnapshot(
  snapshot: ReturnType<typeof parseProjectSnapshotV2>,
) {
  return parseProjectSnapshotV2({
    ...snapshot,
    diagnostics: [],
    diagnosticsRevision: snapshot.project.revision,
    providerStatus: {
      provider: "basedpyright",
      state: "failed",
      status: "unavailable",
    },
  });
}

function reorderTopLevelCallables(
  document: WorkspaceDocument,
  canonicalIds: string[],
): WorkspaceDocument {
  const topLevelSections = { ...document.topLevelSections };
  for (const [zIndex, canonicalId] of canonicalIds.entries()) {
    const sectionId = callableSectionID(canonicalId);
    const layout = topLevelSections[sectionId];
    if (layout === undefined) {
      throw new Error(`Missing callable layout for ${canonicalId}.`);
    }
    topLevelSections[sectionId] = { ...layout, zIndex };
  }
  return { ...document, topLevelSections };
}

function topLevelCallableIds(document: WorkspaceDocument): string[] {
  const callablePrefix = "python-canvas:callable:";
  return Object.entries(document.topLevelSections)
    .filter(([sectionId]) => sectionId.startsWith(callablePrefix))
    .sort(([, left], [, right]) => left.zIndex - right.zIndex)
    .map(([sectionId]) => sectionId.slice(callablePrefix.length));
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderApp(): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<PythonCanvasApp />);
  });
  return container;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await flushMicrotasks();
  });
}

async function advanceDiagnosticsRevalidation(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();
  });
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
