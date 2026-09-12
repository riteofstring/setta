import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "@setta/python-canvas/project-snapshot-v2.json";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

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

const mocks = vi.hoisted(() => ({
  commitCallable: vi.fn(),
  commitWorkspaceDocument: vi.fn(),
  connectProjectSnapshotStream: vi.fn(),
  copyProjectClipboard: vi.fn(),
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
  loadPythonCanvasSavedViews: vi.fn(),
  pasteProjectClipboard: vi.fn(),
  persistPythonCanvasSavedViews: vi.fn(),
  refreshCallableParameters: vi.fn(),
  registerSectionKinds: vi.fn(),
  registerWorkspaceClipboardAuthority: vi.fn(),
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
  disconnectProjectSnapshotStream: vi.fn(),
  projectSnapshotStreamOptions: null as {
    onProtocolError: () => void;
    onSnapshot: (snapshot: unknown) => void;
  } | null,
  workspaceCanvasHost: null as WorkspaceHost | null,
}));

type MockCreationCommand = {
  createSection: (context: unknown) => WorkspaceDocument["sections"][string];
  id: string;
};

type MockClipboardAuthority = {
  canCopySelection: (request: { rootIds: ReadonlyArray<string> }) => boolean;
  id: string;
  kind: "delegated";
  paste: (request: ReturnType<typeof clipboardPasteRequest>) => Promise<{
    rootIds: string[];
  }>;
  payloadVersion: number;
  prepareCopy: (request: { rootIds: string[] }) => Promise<unknown>;
};

type WorkspaceHarness = {
  getDocument: () => WorkspaceDocument;
  host: WorkspaceHost;
  publish: (next: WorkspaceDocument) => void;
  replace: (next: WorkspaceDocument) => void;
};

function MockWorkspaceCanvas() {
  return <div data-testid="workspace-canvas" />;
}

vi.mock("../backend/client", () => ({
  ProjectClientError: class extends Error {
    public readonly code: string | undefined;

    public constructor(
      _kind: unknown,
      message: string,
      _status?: number,
      _cause?: unknown,
      code?: string,
    ) {
      super(message);
      this.code = code;
    }
  },
  commitCallable: mocks.commitCallable,
  connectProjectSnapshotStream: mocks.connectProjectSnapshotStream,
  copyProjectClipboard: mocks.copyProjectClipboard,
  createCallable: mocks.createCallable,
  createList: mocks.createList,
  createParameterDictionary: mocks.createParameterDictionary,
  decrementListChildren: mocks.decrementListChildren,
  deleteCallable: mocks.deleteCallable,
  deleteList: mocks.deleteList,
  deleteParameterDictionary: mocks.deleteParameterDictionary,
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  incrementListChildren: mocks.incrementListChildren,
  pasteProjectClipboard: mocks.pasteProjectClipboard,
  refreshCallableParameters: mocks.refreshCallableParameters,
  renameCallable: mocks.renameCallable,
  renameList: mocks.renameList,
  renameParameterDictionary: mocks.renameParameterDictionary,
  replaceSectionForest: mocks.replaceSectionForest,
  setCallableParameters: mocks.setCallableParameters,
  setParameterDictionaryEntries: mocks.setParameterDictionaryEntries,
  setPythonTarget: mocks.setPythonTarget,
}));

vi.mock("@setta/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@setta/workspace")>()),
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ItemNameEditor: () => <input aria-label="Item name" readOnly />,
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
  TextValueEditor: () => <input aria-label="Value" readOnly />,
  WorkspaceCanvas: MockWorkspaceCanvas,
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  WorkspaceItemList: () => <div data-testid="workspace-items" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  WorkspaceShell: MockWorkspaceCanvas,
  commitWorkspaceDocument: mocks.commitWorkspaceDocument,
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: (data: Record<string, unknown>) => data,
  createWorkspaceHost: mocks.createWorkspaceHost,
  getWorkspaceCodeSectionData: mocks.getWorkspaceCodeSectionData,
  registerSectionKinds: mocks.registerSectionKinds,
  registerWorkspaceClipboardAuthority:
    mocks.registerWorkspaceClipboardAuthority,
  registerWorkspaceCreationCommands: mocks.registerWorkspaceCreationCommands,
  setItemData: mocks.setItemData,
  setWorkspaceColorMode: mocks.setWorkspaceColorMode,
  useWorkspaceDocumentSnapshot: () =>
    mocks.workspaceCanvasHost?.getSnapshot() ?? {
      activeIds: [],
      sections: {},
      topLevelSections: {},
      viewport: null,
    },
}));

vi.mock("./pythonCanvasSavedViewsPreferences", () => ({
  loadPythonCanvasSavedViews: mocks.loadPythonCanvasSavedViews,
  persistPythonCanvasSavedViews: mocks.persistPythonCanvasSavedViews,
}));

import { PythonCanvasApp } from "./PythonCanvasApp";
import { ProjectClientError } from "../backend/client";
import {
  GENERATED_PYTHON_SECTION_ID,
  callableSectionID,
  listSectionID,
  parameterWorkspaceItemID,
  parameterDictionarySectionID,
} from "./workspaceProjection";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadPythonCanvasSavedViews.mockReturnValue({ kind: "missing" });
  mocks.persistPythonCanvasSavedViews.mockReturnValue({ kind: "persisted" });
  mocks.projectSnapshotStreamOptions = null;
  mocks.connectProjectSnapshotStream.mockImplementation((options) => {
    mocks.projectSnapshotStreamOptions = options;
    return mocks.disconnectProjectSnapshotStream;
  });
  mocks.createWorkspaceCodeSection.mockReturnValue({
    renderContent: () => <div />,
  });
  mocks.workspaceCanvasHost = createHost();
  mocks.createWorkspaceHost.mockReturnValue(mocks.workspaceCanvasHost);
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
  mocks.workspaceCanvasHost = null;
  vi.useRealTimers();
});

describe("PythonCanvasApp concurrency", () => {
  it("registers a queued delegated clipboard authority that projects only the accepted snapshot", async () => {
    const initialSnapshot = clipboardControllerSnapshot(1, ["callable:source"]);
    const pastedSnapshot = clipboardControllerSnapshot(2, [
      "callable:source",
      "callable:pasted",
    ]);
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.copyProjectClipboard.mockResolvedValue({
      payload: clipboardPayload(),
    });
    mocks.pasteProjectClipboard.mockResolvedValue({
      pastedRootSectionIds: ["callable:pasted"],
      snapshot: pastedSnapshot,
    });

    renderApp();
    await flushEffects();

    expect(mocks.registerWorkspaceClipboardAuthority).toHaveBeenCalledWith(
      workspace.host,
      expect.objectContaining({
        id: "python-canvas",
        kind: "delegated",
        payloadVersion: 1,
      }),
    );
    const authority = registeredClipboardAuthority();
    expect(
      authority.canCopySelection({
        rootIds: [callableSectionID("callable:source")],
      }),
    ).toBe(true);
    expect(
      authority.canCopySelection({ rootIds: [GENERATED_PYTHON_SECTION_ID] }),
    ).toBe(false);
    expect(
      authority.canCopySelection({
        rootIds: ["python-canvas:pending-callable:source"],
      }),
    ).toBe(false);
    await expect(
      authority.prepareCopy({
        rootIds: [callableSectionID("callable:source")],
      }),
    ).resolves.toEqual(clipboardPayload());
    expect(mocks.copyProjectClipboard).toHaveBeenCalledWith({
      observedRevision: initialSnapshot.project.revision,
      projectId: initialSnapshot.project.id,
      rootSectionIds: ["callable:source"],
    });
    expect(mocks.commitWorkspaceDocument).not.toHaveBeenCalled();

    await expect(authority.paste(clipboardPasteRequest())).resolves.toEqual({
      rootIds: [callableSectionID("callable:pasted")],
    });
    expect(mocks.pasteProjectClipboard).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      payload: clipboardPayload(),
      projectId: initialSnapshot.project.id,
    });
    expect(
      workspace.getDocument().topLevelSections[
        callableSectionID("callable:pasted")
      ],
    ).toEqual({ h: 180, w: 320, x: 800, y: 600, zIndex: 3 });
    expect(workspace.getDocument().activeIds).toEqual([
      callableSectionID("callable:pasted"),
    ]);
    expect(
      workspace.getDocument().sections[callableSectionID("callable:pasted")],
    ).toMatchObject({
      isHorizontalOrientation: true,
      isMinimized: true,
      overflowMode: true,
      positionAndSizeLocked: true,
      size: { height: "auto", width: 320 },
      styleColor: "#ef4444",
      tagColor: "#f97316",
    });
    expect(mocks.commitWorkspaceDocument).toHaveBeenCalledTimes(1);
  });

  it("refreshes the canonical projection after a copy revision conflict without retrying", async () => {
    const initialSnapshot = clipboardControllerSnapshot(1, ["callable:source"]);
    const latestSnapshot = clipboardControllerSnapshot(2, ["callable:latest"]);
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(latestSnapshot);
    mocks.copyProjectClipboard.mockRejectedValue(
      new ProjectClientError(
        "http",
        "Project changed.",
        409,
        undefined,
        "revision_conflict",
      ),
    );

    renderApp();
    await flushEffects();

    await expect(
      registeredClipboardAuthority().prepareCopy({
        rootIds: [callableSectionID("callable:source")],
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(mocks.copyProjectClipboard).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(2);
    expect(
      workspace.getDocument().sections[callableSectionID("callable:latest")],
    ).toBeDefined();
    expect(
      workspace.getDocument().sections[callableSectionID("callable:source")],
    ).toBeUndefined();
  });

  it("keeps z-index reordering browser-local", async () => {
    const initialSnapshot = multiCallableSnapshot(1, [
      "callable:one",
      "callable:two",
      "callable:three",
    ]);
    const firstViewOrder = ["callable:two", "callable:one", "callable:three"];
    const secondViewOrder = ["callable:three", "callable:two", "callable:one"];
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);

    renderApp();
    await flushEffects();

    workspace.publish(
      reorderTopLevelCallables(workspace.getDocument(), firstViewOrder),
    );
    await flushEffects();
    expect(mocks.replaceSectionForest).not.toHaveBeenCalled();
    expect(topLevelCallableIds(workspace.getDocument())).toEqual(
      firstViewOrder,
    );

    workspace.publish(
      reorderTopLevelCallables(workspace.getDocument(), secondViewOrder),
    );
    await flushEffects();
    expect(mocks.replaceSectionForest).not.toHaveBeenCalled();
    expect(topLevelCallableIds(workspace.getDocument())).toEqual(
      secondViewOrder,
    );
  });

  it("queues a later forest replacement from surviving list membership", async () => {
    const initialSnapshot = multiCallableListSnapshot(
      1,
      [],
      ["list:objects", "callable:one", "callable:two", "callable:three"],
    );
    const firstCanonicalSnapshot = multiCallableListSnapshot(
      2,
      ["callable:one"],
      ["list:objects", "callable:two", "callable:three"],
    );
    const latestCanonicalSnapshot = multiCallableListSnapshot(
      3,
      ["callable:one", "callable:two"],
      ["list:objects", "callable:three"],
    );
    const firstRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.replaceSectionForest
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(latestCanonicalSnapshot);

    renderApp();
    await flushEffects();

    workspace.publish(
      nestCallableInObjectsList(workspace.getDocument(), "callable:one"),
    );
    await flushEffects();
    expect(mocks.replaceSectionForest).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      listChildren: [
        { childSectionIds: ["callable:one"], listId: "list:objects" },
      ],
      projectId: initialSnapshot.project.id,
      topLevelSectionIds: firstCanonicalSnapshot.topLevelSectionIds,
    });

    workspace.publish(
      nestCallableInObjectsList(workspace.getDocument(), "callable:two"),
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
      listChildren: [
        {
          childSectionIds: ["callable:one", "callable:two"],
          listId: "list:objects",
        },
      ],
      projectId: firstCanonicalSnapshot.project.id,
      topLevelSectionIds: latestCanonicalSnapshot.topLevelSectionIds,
    });
    expect(topLevelCallableIds(workspace.getDocument())).toEqual([
      "callable:three",
    ]);
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

  it("applies pushed same-revision diagnostics without polling or losing a local parameter draft", async () => {
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
      ui: CODE_UI,
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
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);
    mocks.createCallable.mockResolvedValueOnce(createdSnapshot);

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
    await pushProjectSnapshot(settledSnapshot);

    const canonical = workspace.getDocument().sections[canonicalSectionId];
    expect(
      workspace.getDocument().topLevelSections[canonicalSectionId],
    ).toEqual(callableLayout);
    expect(canonical?.data).toMatchObject({
      callableDiagnosticMessage: "The callable needs diagnostics.",
    });
    expect(
      canonical?.itemTree?.items[parameterId]?.presentation?.control,
    ).toMatchObject({ value: "local draft" });
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(1);
    expectReadyStatus(view);
    expectNoMutationError(view);
  });

  it("ignores a late pushed snapshot after accepting a newer revision", async () => {
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const firstSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:first", name: "New callable" },
    ]);
    const secondSnapshot = laggingCallableSnapshot(3, [
      { id: "callable:first", name: "New callable" },
      { id: "callable:second", name: "New callable 2" },
    ]);
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);
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

    await pushProjectSnapshot(
      settledDiagnosticsSnapshot(secondSnapshot, "callable:second"),
    );
    await pushProjectSnapshot(
      settledDiagnosticsSnapshot(firstSnapshot, "callable:first"),
    );

    const secondSectionId = callableSectionID("callable:second");
    expect(
      workspace.getDocument().sections[secondSectionId]?.data,
    ).toMatchObject({
      callableDiagnosticMessage: "The callable needs diagnostics.",
    });
    expect(workspace.getDocument().sections[secondSectionId]).toBeDefined();
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not let a pushed snapshot overtake pending create reconciliation", async () => {
    const initialSnapshot = laggingCallableSnapshot(2, []);
    const createdSnapshot = laggingCallableSnapshot(3, [
      { id: "callable:created", name: "New callable" },
    ]);
    const createRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);
    mocks.createCallable.mockReturnValueOnce(createRequest.promise);

    renderApp();
    await flushEffects();

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

    publishProjectSnapshot(createdSnapshot);
    await flushMicrotasks();

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

  it("does not resurrect a local deletion from an older pushed snapshot", async () => {
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    const deletedSnapshot = laggingCallableSnapshot(3, []);
    const deleteRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);
    mocks.deleteCallable.mockReturnValueOnce(deleteRequest.promise);

    renderApp();
    await flushEffects();

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

    publishProjectSnapshot(
      settledDiagnosticsSnapshot(initialSnapshot, "callable:one"),
    );
    await flushMicrotasks();
    await act(async () => {
      deleteRequest.resolve(deletedSnapshot);
      await flushMicrotasks();
    });

    expect(workspace.getDocument().sections[sectionId]).toBeUndefined();
    expect(workspace.getDocument().topLevelSections[sectionId]).toBeUndefined();
    expect(mocks.deleteCallable).toHaveBeenCalledWith("callable:one", {
      expectedRevision: initialSnapshot.project.revision,
      projectId: initialSnapshot.project.id,
    });
  });

  it("accepts a pushed provider failure without an app mutation error", async () => {
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);

    const view = renderApp();
    await flushEffects();
    await pushProjectSnapshot(failedDiagnosticsSnapshot(initialSnapshot));
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toBe("");
  });

  it("disconnects the project stream when the controller unmounts", async () => {
    vi.useFakeTimers();
    const initialSnapshot = laggingCallableSnapshot(2, [
      { id: "callable:one", name: "One callable" },
    ]);
    installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValueOnce(initialSnapshot);

    renderApp();
    await flushEffects();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await flushMicrotasks();
    });
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.connectProjectSnapshotStream).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = undefined;
    expect(mocks.disconnectProjectSnapshotStream).toHaveBeenCalledTimes(1);
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
      ui: CODE_UI,
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
      savedViews: null,
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
    savedViews: null,
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
  mocks.workspaceCanvasHost = host;
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
    host,
    publish: (next: WorkspaceDocument) => {
      document = next;
      subscriber?.(next);
    },
    replace: (next: WorkspaceDocument) => {
      document = next;
    },
  };
}

function registeredClipboardAuthority(): MockClipboardAuthority {
  const authority = mocks.registerWorkspaceClipboardAuthority.mock.calls.at(
    -1,
  )?.[1] as MockClipboardAuthority | undefined;
  if (authority === undefined) {
    throw new Error("Python Canvas did not register a clipboard authority.");
  }
  return authority;
}

function clipboardPayload() {
  return {
    callables: [
      {
        authoredExpression: "source",
        id: "callable:source",
        name: "Source callable",
        parameters: [],
      },
    ],
    lists: [],
    parameterDictionaries: [],
    rootSectionIds: ["callable:source"],
    version: 1,
  };
}

function clipboardPasteRequest() {
  const sourceRootId = callableSectionID("callable:source");
  return {
    fragment: {
      roots: [sourceRootId],
      sections: {
        [sourceRootId]: {
          children: [],
          id: sourceRootId,
          isHorizontalOrientation: true,
          isMinimized: true,
          kind: "python-canvas.callable",
          name: "Source callable",
          overflowMode: true,
          positionAndSizeLocked: true,
          size: { height: "auto", width: 320 },
          styleColor: "#ef4444",
          tagColor: "#f97316",
        },
      },
      topLevelLayouts: {
        [sourceRootId]: { h: 180, w: 320, x: 0, y: 0, zIndex: 0 },
      },
    },
    payload: clipboardPayload(),
    payloadVersion: 1,
    placement: { x: 800, y: 600 },
    rootIds: [sourceRootId],
  };
}

function clipboardControllerSnapshot(
  revision: number,
  callableIds: ReadonlyArray<string>,
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: callableIds.map((id) => ({
      authoredExpression: id === "callable:source" ? "source" : "pasted",
      id,
      name: id,
      parameters: [],
    })),
    diagnosticsRevision: revision,
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: [...callableIds],
  });
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
  const presentation = parameter.presentation;
  if (presentation === undefined || presentation.control.kind === "group") {
    throw new Error("Expected a typed callable parameter draft.");
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
              presentation: {
                ...presentation,
                control: {
                  ...presentation.control,
                  value: "local draft",
                },
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

function multiCallableListSnapshot(
  revision: number,
  childSectionIds: string[],
  topLevelSectionIds: string[],
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: ["callable:one", "callable:two", "callable:three"].map((id) => ({
      authoredExpression: "",
      id,
      name: id,
      parameters: [],
    })),
    diagnosticsRevision: revision,
    lists: [{ childSectionIds, id: "list:objects", name: "Objects" }],
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

function nestCallableInObjectsList(
  document: WorkspaceDocument,
  callableId: string,
): WorkspaceDocument {
  const listId = listSectionID("list:objects");
  const callableWorkspaceId = callableSectionID(callableId);
  const list = document.sections[listId];
  if (
    list === undefined ||
    document.topLevelSections[callableWorkspaceId] === undefined
  ) {
    throw new Error(`Missing list or callable ${callableId}.`);
  }
  const { [callableWorkspaceId]: _, ...topLevelSections } =
    document.topLevelSections;
  return {
    ...document,
    sections: {
      ...document.sections,
      [listId]: {
        ...list,
        children: [...list.children, callableWorkspaceId],
      },
    },
    topLevelSections,
  };
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

async function pushProjectSnapshot(
  snapshot: ReturnType<typeof parseProjectSnapshotV2>,
): Promise<void> {
  publishProjectSnapshot(snapshot);
  await flushEffects();
}

function publishProjectSnapshot(
  snapshot: ReturnType<typeof parseProjectSnapshotV2>,
): void {
  const options = mocks.projectSnapshotStreamOptions;
  if (options === null) {
    throw new Error("The project snapshot stream is not connected.");
  }
  act(() => {
    options.onSnapshot(snapshot);
  });
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
