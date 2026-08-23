import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceDocument,
  type WorkspaceHost,
} from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import type {
  DictionaryEntryV2,
  ParameterV2,
} from "../backend/generatedContract";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import { ProjectClientError } from "../backend/client";

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
  createCallable: vi.fn(),
  createList: vi.fn(),
  createParameterDictionary: vi.fn(),
  decrementListChildren: vi.fn(),
  deleteCallable: vi.fn(),
  deleteList: vi.fn(),
  deleteParameterDictionary: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  incrementListChildren: vi.fn(),
  refreshCallableParameters: vi.fn(),
  renameCallable: vi.fn(),
  renameList: vi.fn(),
  renameParameterDictionary: vi.fn(),
  registerWorkspaceCreationCommands: vi.fn(),
  registerSectionKinds: vi.fn(),
  replaceSectionForest: vi.fn(),
  renderWorkspaceCanvas: false,
  setItemData: vi.fn(),
  setCallableParameters: vi.fn(),
  setParameterDictionaryEntries: vi.fn(),
  setPythonTarget: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
  textValueEditorProps: [] as Array<Record<string, unknown>>,
  workspaceCanvasSectionId: null as string | null,
  workspaceCanvasHost: null as {
    getSnapshot: () => {
      sections: Record<string, unknown>;
    };
  } | null,
}));

type MockSectionRegistration = {
  canAcceptNestedSection?: (section: { kind: string }) => boolean;
  createItem?: unknown;
  deleteActionLabel?: string;
  itemArea?: {
    renderLeadingContent?: (section: unknown) => ReactNode;
    toolbar?: string;
  };
  nestedSections?: string;
  renderContent?: (section: unknown) => ReactNode;
};
type MockCreationCommand = {
  createSection: (context: unknown) => WorkspaceDocument["sections"][string];
  group: string;
  id: string;
  label: string;
};
type RegisteredPythonCanvasSectionKinds = {
  authoring: MockSectionRegistration;
  dictionary: MockSectionRegistration;
  list: MockSectionRegistration;
  pending: MockSectionRegistration;
  pendingDictionary: MockSectionRegistration;
  pendingList: MockSectionRegistration;
};

function MockWorkspaceCanvas() {
  const mutation = usePythonCanvasMutationContext();
  return (
    <div
      data-parameter-authoring-pending={String(
        mutation.parameterAuthoringPending("callable:one"),
      )}
      data-testid="workspace-canvas"
    >
      {mocks.renderWorkspaceCanvas ? mockWorkspaceContent() : null}
    </div>
  );
}

function mockWorkspaceContent(): ReactNode {
  if (mocks.workspaceCanvasSectionId === null) {
    return mockWorkspaceLeadingContent();
  }
  const host = mocks.workspaceCanvasHost;
  if (host === null) {
    return null;
  }
  const section = host.getSnapshot().sections[mocks.workspaceCanvasSectionId];
  const sectionKind = mockSectionKind(section);
  if (sectionKind === null) {
    return null;
  }
  return (
    lastMockSectionRegistrations()[sectionKind]?.renderContent?.(section) ??
    null
  );
}

function mockWorkspaceLeadingContent(): ReactNode {
  const host = mocks.workspaceCanvasHost;
  if (host === null) {
    return null;
  }
  const section =
    host.getSnapshot().sections["python-canvas:callable:callable:one"];
  const sectionKind = mockSectionKind(section);
  if (sectionKind === null) {
    return null;
  }
  return (
    lastMockSectionRegistrations()[
      sectionKind
    ]?.itemArea?.renderLeadingContent?.(section) ?? null
  );
}

function mockSectionKind(section: unknown): string | null {
  if (typeof section !== "object" || section === null || !("kind" in section)) {
    return null;
  }
  return String(section.kind);
}

function lastMockSectionRegistrations(): Record<
  string,
  MockSectionRegistration
> {
  return (
    (mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
      Record<string, MockSectionRegistration> | undefined) ?? {}
  );
}

function requiredMockSectionRegistration(
  kind: string,
): MockSectionRegistration {
  const registration = lastMockSectionRegistrations()[kind];
  if (registration === undefined) {
    throw new Error(`Missing mock section registration ${kind}.`);
  }
  return registration;
}

function registeredPythonCanvasSectionKinds(): RegisteredPythonCanvasSectionKinds {
  registerPythonCanvasSectionKinds(createHost());
  return {
    authoring: requiredMockSectionRegistration(CALLABLE_SECTION_KIND),
    dictionary: requiredMockSectionRegistration(
      PARAMETER_DICTIONARY_SECTION_KIND,
    ),
    list: requiredMockSectionRegistration(LIST_SECTION_KIND),
    pending: requiredMockSectionRegistration(PENDING_CALLABLE_SECTION_KIND),
    pendingDictionary: requiredMockSectionRegistration(
      PENDING_PARAMETER_DICTIONARY_SECTION_KIND,
    ),
    pendingList: requiredMockSectionRegistration(PENDING_LIST_SECTION_KIND),
  };
}

function expectAuthoringSectionKinds(
  registrations: RegisteredPythonCanvasSectionKinds,
): void {
  expect(requiredItemArea(registrations.authoring).toolbar).toBe(
    "authoring-and-filter",
  );
  expect(requiredItemArea(registrations.pending).toolbar).toBe("filter-only");
  expect(registrations.pending.createItem).toBeUndefined();
  expect(requiredItemArea(registrations.dictionary).toolbar).toBe(
    "authoring-and-filter",
  );
  expect(registrations.dictionary.createItem).toEqual(expect.any(Function));
  expect(requiredItemArea(registrations.pendingDictionary).toolbar).toBe(
    "filter-only",
  );
  expect(registrations.pendingDictionary.createItem).toBeUndefined();
}

function expectListSectionKinds(
  registrations: RegisteredPythonCanvasSectionKinds,
): void {
  const canAccept = requiredNestedSectionAcceptance(registrations.list);
  expect(registrations.list.nestedSections).toBe("vertical");
  expect(registrations.pendingList.nestedSections).toBe("vertical");
  expect(canAccept({ kind: CALLABLE_SECTION_KIND })).toBe(true);
  expect(canAccept({ kind: PARAMETER_DICTIONARY_SECTION_KIND })).toBe(true);
  expect(canAccept({ kind: LIST_SECTION_KIND })).toBe(true);
  expect(canAccept({ kind: WORKSPACE_CODE_SECTION_KIND })).toBe(false);
  expect(canAccept({ kind: PENDING_LIST_SECTION_KIND })).toBe(false);
  expect(registrations.list.deleteActionLabel).toBe(
    "Delete list and all nested descendants",
  );
  expect(registrations.pendingList.deleteActionLabel).toBe(
    "Delete list and all nested descendants",
  );
}

function requiredItemArea(registration: MockSectionRegistration) {
  if (registration.itemArea === undefined) {
    throw new Error("Expected section item area.");
  }
  return registration.itemArea;
}

function requiredNestedSectionAcceptance(
  registration: MockSectionRegistration,
) {
  if (registration.canAcceptNestedSection === undefined) {
    throw new Error("Expected nested-section acceptance.");
  }
  return registration.canAcceptNestedSection;
}

function requiredMockCreationCommand(
  id = "python-callable",
): MockCreationCommand {
  const commands = mocks.registerWorkspaceCreationCommands.mock.calls.at(
    -1,
  )?.[1] as ReadonlyArray<MockCreationCommand> | undefined;
  const command = commands?.find((candidate) => candidate.id === id);
  if (command === undefined) {
    throw new Error(`Missing ${id} creation command.`);
  }
  return command;
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
    throw new Error(
      "The Python callable creation command returned no section.",
    );
  }
  return section;
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

vi.mock("./GeneratedPythonTerminal", () => ({
  GeneratedPythonTerminalAttachment: () => null,
  GeneratedPythonTerminalHeaderControls: () => null,
  GeneratedPythonTerminalSection: ({ editor }: { editor: ReactNode }) => editor,
}));

vi.mock("@setta/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@setta/workspace")>()),
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ItemNameEditor: () => <input aria-label="Parameter name" readOnly />,
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
  TextValueEditor: (props: Record<string, unknown>) => {
    mocks.textValueEditorProps.push(props);
    return <input aria-label={String(props.ariaLabel)} readOnly />;
  },
  WorkspaceCanvas: MockWorkspaceCanvas,
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  WorkspaceItemList: () => <div data-testid="parameter-list" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  WorkspaceShell: MockWorkspaceCanvas,
  commitWorkspaceDocument: mocks.commitWorkspaceDocument,
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: (data: Record<string, unknown>) => data,
  createWorkspaceHost: mocks.createWorkspaceHost,
  getWorkspaceCodeSectionData: mocks.getWorkspaceCodeSectionData,
  registerWorkspaceCreationCommands: mocks.registerWorkspaceCreationCommands,
  registerSectionKinds: mocks.registerSectionKinds,
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

import { PythonCanvasApp } from "./PythonCanvasApp";
import { usePythonCanvasMutationContext } from "./PythonCanvasMutationContext";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  CALLABLE_SECTION_KIND,
  LIST_SECTION_KIND,
  PENDING_CALLABLE_SECTION_KIND,
  PENDING_LIST_SECTION_KIND,
  PENDING_PARAMETER_DICTIONARY_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
  callableSectionID,
  dictionaryEntryWorkspaceItemID,
  listSectionID,
  parameterDictionarySectionID,
  parameterWorkspaceItemID,
  readCallableParameterItems,
} from "./workspaceProjection";
import {
  PythonTargetCompletionErrorProvider,
  pythonTargetCompletionErrorId,
} from "./PythonTargetCompletionBoundary";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.textValueEditorProps.length = 0;
  mocks.renderWorkspaceCanvas = false;
  mocks.workspaceCanvasSectionId = null;
  mocks.workspaceCanvasHost = null;
  mocks.createWorkspaceCodeSection.mockReturnValue({
    renderContent: () => <div data-testid="target-editor" />,
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

describe("PythonCanvasApp", () => {
  it("creates a canonical callable from the registered pane command without app chrome", async () => {
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const createdSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [
        {
          authoredExpression: "",
          id: "callable:created",
          name: "New callable",
          parameters: [],
        },
      ],
      topLevelSectionIds: ["callable:created"],
      project: {
        ...initialSnapshot.project,
        revision: initialSnapshot.project.revision + 1,
      },
    });
    const request = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.createCallable.mockReturnValueOnce(request.promise);

    const view = renderApp();
    await flushEffects();

    expect(
      view.querySelector("[data-testid='workspace-canvas']"),
    ).not.toBeNull();
    expect(view.querySelector(".python-canvas-heading")).toBeNull();
    expect(view.querySelector(".python-canvas-project-controls")).toBeNull();
    expect(view.querySelector(".python-canvas-empty-state")).toBeNull();
    expect(mocks.setWorkspaceColorMode).toHaveBeenCalledWith(
      expect.anything(),
      "system",
    );

    const pending = invokeMockCreationCommand({
      workspacePosition: { x: 912, y: 488 },
    });
    expect(pending).toMatchObject({
      kind: PENDING_CALLABLE_SECTION_KIND,
      name: "New callable",
      positionAndSizeLocked: true,
    });
    const pendingLayout = {
      h: 150,
      w: 250,
      x: 912,
      y: 488,
      zIndex: 4,
    };
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

    expect(mocks.createCallable).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      name: "New callable",
      projectId: initialSnapshot.project.id,
    });

    await act(async () => {
      request.resolve(createdSnapshot);
      await flushMicrotasks();
    });

    const canonicalSectionId = callableSectionID("callable:created");
    expect(workspace.getDocument().sections[pending.id]).toBeUndefined();
    expect(
      workspace.getDocument().topLevelSections[canonicalSectionId],
    ).toEqual(pendingLayout);
    expect(workspace.getDocument().activeIds).toEqual([canonicalSectionId]);
    expect(workspace.getDocument().sections[canonicalSectionId]).toMatchObject({
      positionAndSizeLocked: false,
    });
  });

  it("registers the exact three Python creation labels", async () => {
    renderApp();
    await flushEffects();

    const commands = mocks.registerWorkspaceCreationCommands.mock.calls.at(
      -1,
    )?.[1] as ReadonlyArray<MockCreationCommand> | undefined;
    expect(commands?.map((command) => command.label)).toEqual([
      "Python callable",
      "Param Dict",
      "List of Objects",
    ]);
  });

  it("serializes dictionary item-tree changes at the current revision", async () => {
    const initialSnapshot = dictionarySnapshot(1, []);
    const entries = [
      {
        authoredExpression: "4",
        id: "entry:radius",
        kind: "leaf" as const,
        name: "radius",
        ui: CODE_UI,
      },
    ];
    const persistedSnapshot = dictionarySnapshot(2, entries);
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.setParameterDictionaryEntries.mockResolvedValueOnce(
      persistedSnapshot,
    );

    renderApp();
    await flushEffects();
    workspace.publish(
      appendDictionaryEntry(
        workspace.getDocument(),
        "dictionary:options",
        entries[0]!,
      ),
    );
    await flushEffects();

    expect(mocks.setParameterDictionaryEntries).toHaveBeenCalledWith(
      "dictionary:options",
      {
        entries,
        expectedRevision: initialSnapshot.project.revision,
        projectId: initialSnapshot.project.id,
      },
    );
    expect(
      workspace.getDocument().sections[
        parameterDictionarySectionID("dictionary:options")
      ]?.itemTree?.items[dictionaryEntryWorkspaceItemID("entry:radius")],
    ).toMatchObject({
      presentation: {
        control: {
          kind: "code",
          value: "4",
        },
        label: "radius",
      },
    });
  });

  it("serializes list increment and decrement commands with their latest revisions", async () => {
    const initialSnapshot = listSnapshot(1, []);
    const incrementedSnapshot = listSnapshot(2, ["callable:created"]);
    const decrementedSnapshot = listSnapshot(3, []);
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.workspaceCanvasSectionId = listSectionID("list:objects");
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.incrementListChildren.mockResolvedValueOnce(incrementedSnapshot);
    mocks.decrementListChildren.mockResolvedValueOnce(decrementedSnapshot);

    const view = renderApp();
    await flushEffects();
    const add = view.querySelector<HTMLButtonElement>(
      "button[aria-label='Add children']",
    );
    if (add === null) {
      throw new Error("Expected the List of Objects add button.");
    }
    expect(add.disabled).toBe(false);
    await act(async () => {
      add.click();
      await flushMicrotasks();
    });
    expect(mocks.incrementListChildren).toHaveBeenCalledWith("list:objects", {
      count: 1,
      expectedRevision: 1,
      projectId: initialSnapshot.project.id,
    });

    const remove = view.querySelector<HTMLButtonElement>(
      "button[aria-label='Remove children']",
    );
    if (remove === null) {
      throw new Error("Expected the List of Objects remove button.");
    }
    expect(remove.disabled).toBe(false);
    await act(async () => {
      remove.click();
      await flushMicrotasks();
    });
    expect(mocks.decrementListChildren).toHaveBeenCalledWith("list:objects", {
      count: 1,
      expectedRevision: 2,
      projectId: incrementedSnapshot.project.id,
    });
  });

  it("persists a callable rename made through the workspace section header", async () => {
    const initialSnapshot = callableSnapshot(1, []);
    const renamedSnapshot = callableSnapshot(
      2,
      [],
      "fixture.initial",
      "Renamed callable",
    );
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.renameCallable.mockResolvedValueOnce(renamedSnapshot);

    renderApp();
    await flushEffects();

    const sectionId = callableSectionID("callable:one");
    const section = workspace.getDocument().sections[sectionId];
    if (section === undefined) {
      throw new Error("Expected the projected callable section.");
    }
    workspace.publish({
      ...workspace.getDocument(),
      sections: {
        ...workspace.getDocument().sections,
        [sectionId]: { ...section, name: "Renamed callable" },
      },
    });
    await flushEffects();

    expect(mocks.renameCallable).toHaveBeenCalledWith("callable:one", {
      expectedRevision: 1,
      name: "Renamed callable",
      projectId: initialSnapshot.project.id,
    });
    expect(workspace.getDocument().sections[sectionId]?.name).toBe(
      "Renamed callable",
    );
  });

  it("keeps a callable visually deleted while its server mutation is pending", async () => {
    const initialSnapshot = callableSnapshot(1, []);
    const request = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.deleteCallable.mockReturnValueOnce(request.promise);

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

    expect(mocks.deleteCallable).toHaveBeenCalledWith("callable:one", {
      expectedRevision: 1,
      projectId: initialSnapshot.project.id,
    });
    expect(workspace.getDocument().sections[sectionId]).toBeUndefined();
  });

  it("reports an initial load failure without mounting a workspace canvas", async () => {
    mocks.fetchProjectSnapshot.mockRejectedValueOnce(new Error("offline"));
    const view = renderApp();
    await flushEffects();

    expect(view.querySelector("[role='alert']")?.textContent).toContain(
      "Unable to load Python Canvas",
    );
    expect(view.querySelector("[data-testid='workspace-canvas']")).toBeNull();
  });

  it("removes a pending pane callable when its backend creation fails", async () => {
    const workspace = installWorkspaceHarness();
    mocks.createCallable.mockRejectedValueOnce(new Error("offline"));
    const view = renderApp();
    await flushEffects();

    const pending = invokeMockCreationCommand({
      workspacePosition: { x: 48, y: 64 },
    });
    workspace.publish({
      ...workspace.getDocument(),
      activeIds: [pending.id],
      sections: { ...workspace.getDocument().sections, [pending.id]: pending },
      topLevelSections: {
        ...workspace.getDocument().topLevelSections,
        [pending.id]: { h: 150, w: 250, x: 48, y: 64, zIndex: 4 },
      },
    });
    await flushEffects();

    expect(workspace.getDocument().sections[pending.id]).toBeUndefined();
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toContain("Unable to update the callable");
  });

  it("registers authored dictionaries and vertical lists through their app-owned kinds", () => {
    const registrations = registeredPythonCanvasSectionKinds();
    expectAuthoringSectionKinds(registrations);
    expectListSectionKinds(registrations);
  });

  it("associates target completion failures with the app-owned editor boundary", () => {
    const host = createHost();
    registerPythonCanvasSectionKinds(host);
    const registrations = mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
      | Record<string, { renderContent?: (section: never) => ReactNode }>
      | undefined;
    const renderTarget = registrations?.["setta.code"]?.renderContent;
    if (renderTarget === undefined) {
      throw new Error("Expected the generated Python section renderer.");
    }

    const view = renderNode(
      <PythonTargetCompletionErrorProvider error="Unable to load Python target completions. Try again.">
        {renderTarget({ id: "python-canvas:generated-python" } as never)}
      </PythonTargetCompletionErrorProvider>,
    );
    const boundary = view.querySelector("[role='group']");

    expect(boundary?.getAttribute("aria-label")).toBe("Python target editor");
    expect(boundary?.getAttribute("aria-invalid")).toBe("true");
    expect(boundary?.getAttribute("aria-describedby")).toBe(
      pythonTargetCompletionErrorId,
    );
    expect(view.querySelector("[data-testid='target-editor']")).not.toBeNull();
  });

  it("persists a pending outer target draft after pane-menu creation", async () => {
    vi.useFakeTimers();
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const localPrefix = "# local prefix";
    const localSuffix = "local_state = SettaState()";
    const createdSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [
        {
          authoredExpression: "",
          id: "callable:created",
          name: "New callable",
          parameters: [],
        },
      ],
      topLevelSectionIds: ["callable:created"],
      project: {
        ...initialSnapshot.project,
        revision: initialSnapshot.project.revision + 1,
      },
    });
    const bodyStart = localPrefix.length + 2;
    const persistedSnapshot = parseProjectSnapshotV2({
      ...createdSnapshot,
      generatedCode: {
        ...createdSnapshot.generatedCode,
        code: `${localPrefix}\n\n${createdSnapshot.generatedCode.body}\n\n${localSuffix}`,
        generatedBodyRange: {
          end: bodyStart + createdSnapshot.generatedCode.body.length,
          start: bodyStart,
        },
      },
      project: {
        ...createdSnapshot.project,
        revision: createdSnapshot.project.revision + 1,
      },
      pythonTarget: { prefix: localPrefix, suffix: localSuffix },
    });
    let workspaceDocument: WorkspaceDocument = {
      activeIds: [],
      sections: {},
      topLevelSections: {},
      viewport: null,
    };
    let subscriber: ((next: WorkspaceDocument) => void) | null = null;
    const publish = (next: WorkspaceDocument) => subscriber?.(next);
    const host = {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => workspaceDocument),
      loadDocument: vi.fn((next: WorkspaceDocument) => {
        workspaceDocument = next;
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
      (_host: WorkspaceHost, document: WorkspaceDocument) => {
        workspaceDocument = document;
      },
    );
    mocks.getWorkspaceCodeSectionData.mockImplementation(
      (_host: WorkspaceHost, sectionId: string) => {
        const section = workspaceDocument.sections[sectionId];
        if (section === undefined) {
          throw new Error(`Missing workspace section ${sectionId}.`);
        }
        return section.data;
      },
    );
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.createCallable.mockResolvedValue(createdSnapshot);
    mocks.setPythonTarget.mockResolvedValue(persistedSnapshot);

    renderApp();
    await flushEffects();
    const generatedSection =
      workspaceDocument.sections["python-canvas:generated-python"];
    if (generatedSection === undefined) {
      throw new Error("Generated Python section is missing.");
    }
    const localCode = `${localPrefix}\n\n${initialSnapshot.generatedCode.body}\n\n${localSuffix}`;
    workspaceDocument = {
      ...workspaceDocument,
      sections: {
        ...workspaceDocument.sections,
        "python-canvas:generated-python": {
          ...generatedSection,
          data: {
            ...(generatedSection.data as object),
            code: localCode,
            generatedRegion: {
              from: localPrefix.length,
              to: localCode.length - localSuffix.length,
            },
          },
        },
      },
    };
    publish(workspaceDocument);

    const pending = invokeMockCreationCommand({
      workspacePosition: { x: 912, y: 488 },
    });
    workspaceDocument = {
      ...workspaceDocument,
      activeIds: [pending.id],
      sections: { ...workspaceDocument.sections, [pending.id]: pending },
      topLevelSections: {
        ...workspaceDocument.topLevelSections,
        [pending.id]: { h: 150, w: 250, x: 912, y: 488, zIndex: 4 },
      },
    };
    publish(workspaceDocument);
    await flushEffects();

    expect(mocks.createCallable).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      name: "New callable",
      projectId: initialSnapshot.project.id,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await flushMicrotasks();
    });

    expect(mocks.setPythonTarget).toHaveBeenCalledWith({
      expectedRevision: createdSnapshot.project.revision,
      prefix: localPrefix,
      projectId: createdSnapshot.project.id,
      suffix: localSuffix,
    });
    const persistedSection =
      workspaceDocument.sections["python-canvas:generated-python"];
    if (persistedSection === undefined) {
      throw new Error("Persisted generated Python section is missing.");
    }
    expect((persistedSection.data as { code: string }).code).toBe(
      persistedSnapshot.generatedCode.code,
    );
  });

  it("queues a later parameter-list action after the current request settles", async () => {
    vi.useFakeTimers();
    const initialSnapshot = callableSnapshot(1, [
      providerParameter("parameter:value", "value"),
    ]);
    const firstAnswer = callableSnapshot(2, [
      providerParameter("parameter:value", "first"),
    ]);
    const secondAnswer = callableSnapshot(3, [
      providerParameter("parameter:value", "first"),
      authoredParameter("parameter:later", "later", "later"),
    ]);
    const firstRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.setCallableParameters
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondAnswer);

    const view = renderApp();
    await flushEffects();

    workspace.publish(
      changeParameterExpression(
        workspace.getDocument(),
        "callable:one",
        "parameter:value",
        "first",
      ),
    );
    await advanceMutationDebounce();

    expect(mocks.setCallableParameters).toHaveBeenCalledTimes(1);
    expect(
      view
        .querySelector("[data-testid='workspace-canvas']")
        ?.getAttribute("data-parameter-authoring-pending"),
    ).toBe("false");
    expect(mocks.setCallableParameters).toHaveBeenLastCalledWith(
      "callable:one",
      {
        expectedRevision: 1,
        parameters: [
          { authoredExpression: "first", id: "parameter:value", name: "value", ui: CODE_UI },
        ],
        projectId: initialSnapshot.project.id,
      },
    );

    workspace.publish(
      appendParameter(
        workspace.getDocument(),
        "callable:one",
        authoredParameter("parameter:later", "later", "later"),
      ),
    );
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:value",
      "parameter:later",
    ]);
    await advanceMutationDebounce();

    await act(async () => {
      firstRequest.resolve(firstAnswer);
      await flushMicrotasks();
    });
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:value",
      "parameter:later",
    ]);
    await advanceMutationDebounce();

    expect(view.querySelector("[role='status']")?.textContent).not.toContain(
      "Unable",
    );
    expect(mocks.setCallableParameters).toHaveBeenCalledTimes(2);
    expect(mocks.setCallableParameters).toHaveBeenLastCalledWith(
      "callable:one",
      {
        expectedRevision: 2,
        parameters: [
          { authoredExpression: "first", id: "parameter:value", name: "value", ui: CODE_UI },
          { authoredExpression: "later", id: "parameter:later", name: "later", ui: CODE_UI },
        ],
        projectId: firstAnswer.project.id,
      },
    );
  });

  it("persists a callable diagnostic when initial parameter retrieval fails", async () => {
    vi.useFakeTimers();
    const initialSnapshot = callableSnapshot(1, [
      providerParameter("parameter:old-provider", "value"),
    ]);
    const committedSnapshot = {
      ...callableSnapshot(
        2,
        [providerParameter("parameter:old-provider", "value")],
        "math.sqrt",
      ),
      diagnostics: [
        {
          end: 9,
          id: "diagnostic:missing-math",
          message: `"math" is not defined`,
          severity: "error" as const,
          start: 0,
          targetId: "callable:one",
        },
      ],
      diagnosticsRevision: 2,
    };
    const commitRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.commitCallable.mockReturnValueOnce(commitRequest.promise);
    mocks.refreshCallableParameters.mockRejectedValueOnce(
      new ProjectClientError(
        "http",
        "Basedpyright could not complete this request.",
        502,
        undefined,
        "provider_failed",
      ),
    );

    const view = renderApp();
    await flushEffects();
    const expression = mocks.textValueEditorProps.find(
      (props) => props.presentation === "section-field",
    );
    if (expression === undefined) {
      throw new Error("Expected the compact callable expression field.");
    }
    await act(async () => {
      (expression.onValueChange as (value: string) => void)("math.sqrt");
      (expression.onCommit as (value: string) => void)("math.sqrt");
      await flushMicrotasks();
    });

    expect(mocks.commitCallable).toHaveBeenCalledWith("callable:one", {
      authoredExpression: "math.sqrt",
      expectedRevision: 1,
      projectId: initialSnapshot.project.id,
    });
    expect(
      workspace.getDocument().sections[callableSectionID("callable:one")],
    ).toMatchObject({
      kind: CALLABLE_SECTION_KIND,
      positionAndSizeLocked: false,
    });
    expect(mocks.textValueEditorProps.at(-1)?.disabled).toBeUndefined();
    expect(mocks.refreshCallableParameters).not.toHaveBeenCalled();
    expect(
      view
        .querySelector("[data-testid='workspace-canvas']")
        ?.getAttribute("data-parameter-authoring-pending"),
    ).toBe("true");

    await act(async () => {
      commitRequest.resolve(committedSnapshot);
      await flushMicrotasks();
    });
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:old-provider",
    ]);
    expect(
      workspace.getDocument().sections[callableSectionID("callable:one")],
    ).toMatchObject({
      kind: CALLABLE_SECTION_KIND,
      positionAndSizeLocked: false,
    });
    expect(mocks.textValueEditorProps.at(-1)?.diagnosticMessage).toBe(
      `"math" is not defined`,
    );
    expect(mocks.refreshCallableParameters).toHaveBeenCalledWith(
      "callable:one",
      {
        expectedRevision: 2,
        projectId: committedSnapshot.project.id,
      },
    );
    expect(mocks.setCallableParameters).not.toHaveBeenCalled();
    expect(
      view.querySelector(".python-canvas-callable-mutation-error"),
    ).toBeNull();
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toBe("");
    expect(
      view
        .querySelector("[data-testid='workspace-canvas']")
        ?.getAttribute("data-parameter-authoring-pending"),
    ).toBe("false");
  });

  it("retrieves parameters for a new callable through normal Enter", async () => {
    const initialSnapshot = callableSnapshot(1, [
      providerParameter("parameter:old-provider", "value"),
    ]);
    const committedSnapshot = callableSnapshot(
      2,
      [providerParameter("parameter:old-provider", "value")],
      "fixture.resolved",
    );
    const refreshedSnapshot = callableSnapshot(
      3,
      [providerParameter("parameter:fresh-provider", "resolved")],
      "fixture.resolved",
    );
    const refreshRequest =
      deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.commitCallable.mockResolvedValueOnce(committedSnapshot);
    mocks.refreshCallableParameters.mockReturnValueOnce(refreshRequest.promise);

    renderApp();
    await flushEffects();
    const expression = mocks.textValueEditorProps.find(
      (props) => props.presentation === "section-field",
    );
    if (expression === undefined) {
      throw new Error("Expected the compact callable expression field.");
    }
    await act(async () => {
      (expression.onCommit as (value: string) => void)("fixture.resolved");
      await flushMicrotasks();
    });

    expect(mocks.commitCallable).toHaveBeenCalledWith("callable:one", {
      authoredExpression: "fixture.resolved",
      expectedRevision: 1,
      projectId: initialSnapshot.project.id,
    });
    expect(mocks.refreshCallableParameters).toHaveBeenCalledWith(
      "callable:one",
      {
        expectedRevision: 2,
        projectId: committedSnapshot.project.id,
      },
    );
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:old-provider",
    ]);
    expect(
      workspace.getDocument().sections[callableSectionID("callable:one")],
    ).toMatchObject({
      kind: CALLABLE_SECTION_KIND,
      positionAndSizeLocked: false,
    });

    await act(async () => {
      refreshRequest.resolve(refreshedSnapshot);
      await flushMicrotasks();
    });

    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:fresh-provider",
    ]);
  });

  it("skips a selected callable on normal Enter and force-refreshes it on alternate Enter", async () => {
    const selectedSnapshot = callableSnapshot(
      3,
      [providerParameter("parameter:current-provider", "selected")],
      "fixture.selected",
    );
    const forceRefreshedSnapshot = callableSnapshot(
      4,
      [providerParameter("parameter:force-refreshed", "selected")],
      "fixture.selected",
    );
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.fetchProjectSnapshot.mockResolvedValue(selectedSnapshot);
    mocks.commitCallable
      .mockResolvedValueOnce(selectedSnapshot)
      .mockResolvedValueOnce(selectedSnapshot);
    mocks.refreshCallableParameters.mockResolvedValueOnce(
      forceRefreshedSnapshot,
    );

    renderApp();
    await flushEffects();
    const expression = mocks.textValueEditorProps.find(
      (props) => props.presentation === "section-field",
    );
    if (expression === undefined) {
      throw new Error("Expected the compact callable expression field.");
    }

    await act(async () => {
      (expression.onCommit as (value: string) => void)("fixture.selected");
      await flushMicrotasks();
    });
    expect(mocks.commitCallable).toHaveBeenLastCalledWith("callable:one", {
      authoredExpression: "fixture.selected",
      expectedRevision: 3,
      projectId: selectedSnapshot.project.id,
    });
    expect(mocks.refreshCallableParameters).not.toHaveBeenCalled();

    await act(async () => {
      (expression.onAlternateCommit as (value: string) => void)(
        "fixture.selected",
      );
      await flushMicrotasks();
    });
    expect(mocks.refreshCallableParameters).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCallableParameters).toHaveBeenCalledWith(
      "callable:one",
      {
        expectedRevision: 3,
        projectId: selectedSnapshot.project.id,
      },
    );
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:force-refreshed",
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
    host,
    publish: (next: WorkspaceDocument) => {
      document = next;
      subscriber?.(next);
    },
  };
}

function callableSnapshot(
  revision: number,
  parameters: Array<ParameterV2>,
  authoredExpression = "fixture.initial",
  name = "One callable",
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression,
        id: "callable:one",
        name,
        parameters,
      },
    ],
    topLevelSectionIds: ["callable:one"],
    project: { ...projectSnapshotFixture.project, revision },
  });
}

function dictionarySnapshot(revision: number, entries: DictionaryEntryV2[]) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    parameterDictionaries: [
      { entries, id: "dictionary:options", name: "Options" },
    ],
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: ["dictionary:options"],
  });
}

function listSnapshot(revision: number, childSectionIds: string[]) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: childSectionIds.map((id) => ({
      authoredExpression: "",
      id,
      name: "New callable",
      parameters: [],
    })),
    lists: [{ childSectionIds, id: "list:objects", name: "Objects" }],
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: ["list:objects"],
  });
}

function providerParameter(id: string, authoredExpression: string) {
  return {
    authoredExpression,
    default: null,
    id,
    name: "value",
    nameEditable: false,
    passingStyle: "positional_or_keyword" as const,
    providerOrdinal: 0,
    typeAnnotation: "float",
    ui: CODE_UI,
  };
}

function authoredParameter(
  id: string,
  name: string,
  authoredExpression: string,
) {
  return {
    authoredExpression,
    default: null,
    id,
    name,
    nameEditable: true,
    passingStyle: "positional_or_keyword" as const,
    providerOrdinal: null,
    typeAnnotation: null,
    ui: CODE_UI,
  };
}

function changeParameterExpression(
  document: WorkspaceDocument,
  callableId: string,
  parameterId: string,
  authoredExpression: string,
): WorkspaceDocument {
  const sectionId = callableSectionID(callableId);
  const itemId = parameterWorkspaceItemID(parameterId);
  const section = document.sections[sectionId];
  const item = section?.itemTree?.items[itemId];
  if (section?.itemTree === undefined || item === undefined) {
    throw new Error(`Missing parameter ${parameterId}.`);
  }
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...section.itemTree,
          items: {
            ...section.itemTree.items,
            [itemId]: {
              ...item,
              presentation: {
                ...item.presentation!,
                control: {
                  ...(item.presentation!.control as Exclude<
                    NonNullable<typeof item.presentation>["control"],
                    { kind: "group" }
                  >),
                  value: authoredExpression,
                },
              },
            },
          },
        },
      },
    },
  };
}

function appendParameter(
  document: WorkspaceDocument,
  callableId: string,
  parameter: ReturnType<typeof authoredParameter>,
): WorkspaceDocument {
  const sectionId = callableSectionID(callableId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const root = itemTree?.items[itemTree.rootId];
  if (section === undefined || itemTree === undefined || root === undefined) {
    throw new Error(`Missing parameter list for ${callableId}.`);
  }
  const { id } = parameter;
  const itemId = parameterWorkspaceItemID(id);
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [root.id]: {
              ...root,
              children: [...root.children, itemId],
            },
            [itemId]: {
              children: [],
              id: itemId,
              presentation: {
                control: {
                  kind: "code",
                  value: parameter.authoredExpression,
                  configuration: {
                    ...CODE_UI.configuration,
                    autocomplete: "off",
                  },
                },
                label: parameter.name,
                labelEditable: true,
              },
            },
          },
        },
      },
    },
  };
}

function appendDictionaryEntry(
  document: WorkspaceDocument,
  dictionaryId: string,
  entry: DictionaryEntryV2,
): WorkspaceDocument {
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const root = itemTree?.items[itemTree.rootId];
  if (section === undefined || itemTree === undefined || root === undefined) {
    throw new Error(`Missing dictionary entry list for ${dictionaryId}.`);
  }
  if (entry.kind !== "leaf") {
    throw new Error("This test helper accepts only dictionary leaf entries.");
  }
  const itemId = dictionaryEntryWorkspaceItemID(entry.id);
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [root.id]: { ...root, children: [...root.children, itemId] },
            [itemId]: {
              children: [],
              presentation: {
                control: {
                  kind: "code",
                  value: entry.authoredExpression,
                  configuration: {
                    ...CODE_UI.configuration,
                    autocomplete: "off",
                  },
                },
                label: entry.name,
                labelEditable: true,
              },
              id: itemId,
            },
          },
        },
      },
    },
  };
}

function parameterIds(document: WorkspaceDocument, callableId: string) {
  return readCallableParameterItems(document, callableId).map(
    (parameter) => parameter.id,
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function advanceMutationDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
  });
}

function renderApp(): HTMLDivElement {
  return renderNode(<PythonCanvasApp />);
}

function renderNode(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
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
