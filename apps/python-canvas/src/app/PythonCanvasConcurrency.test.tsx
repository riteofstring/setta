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
      project: { ...initialSnapshot.project, revision: 2 },
      topLevelSectionIds: ["callable:created"],
    });
    const dictionarySnapshot = parseProjectSnapshotV2({
      ...callableSnapshot,
      parameterDictionaries: [
        { entries: [], id: "dictionary:created", name: "New Param Dict" },
      ],
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
    const callableLayout = { h: 300, w: 360, x: 48, y: 64, zIndex: 4 };
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

function installWorkspaceHarness() {
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
  };
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
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds,
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

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
