import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import type { ParameterV2 } from "../backend/generatedContract";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  commitCallable: vi.fn(),
  commitWorkspaceDocument: vi.fn(),
  createCallable: vi.fn(),
  deleteCallable: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  refreshCallableParameters: vi.fn(),
  renameCallable: vi.fn(),
  registerWorkspaceCreationCommands: vi.fn(),
  registerSectionKinds: vi.fn(),
  renderWorkspaceCanvas: false,
  setItemData: vi.fn(),
  setCallableParameters: vi.fn(),
  setPythonTarget: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
  textValueEditorProps: [] as Array<Record<string, unknown>>,
  workspaceCanvasHost: null as {
    getSnapshot: () => {
      sections: Record<string, unknown>;
    };
  } | null,
}));

type MockSectionRegistration = {
  createItem?: unknown;
  itemArea?: {
    renderLeadingContent?: (section: unknown) => ReactNode;
    toolbar?: string;
  };
};

type MockCreationCommand = {
  createSection: (context: unknown) => WorkspaceDocument["sections"][string];
  group: string;
  id: string;
  label: string;
};

function MockWorkspaceCanvas() {
  if (!mocks.renderWorkspaceCanvas) {
    return <div data-testid="workspace-canvas" />;
  }
  return (
    <div data-testid="workspace-canvas">{mockWorkspaceLeadingContent()}</div>
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

function requiredMockCreationCommand(): MockCreationCommand {
  const commands = mocks.registerWorkspaceCreationCommands.mock.calls.at(
    -1,
  )?.[1] as ReadonlyArray<MockCreationCommand> | undefined;
  const command = commands?.find(
    (candidate) => candidate.id === "python-callable",
  );
  if (command === undefined) {
    throw new Error("Missing Python callable creation command.");
  }
  return command;
}

function invokeMockCreationCommand(
  context: unknown,
): WorkspaceDocument["sections"][string] {
  let section: WorkspaceDocument["sections"][string] | null = null;
  act(() => {
    section = requiredMockCreationCommand().createSection(context);
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
  deleteCallable: mocks.deleteCallable,
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  refreshCallableParameters: mocks.refreshCallableParameters,
  renameCallable: mocks.renameCallable,
  setCallableParameters: mocks.setCallableParameters,
  setPythonTarget: mocks.setPythonTarget,
}));

vi.mock("@setta/workspace", () => ({
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
  commitWorkspaceDocument: mocks.commitWorkspaceDocument,
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: (data: Record<string, unknown>) => data,
  createWorkspaceHost: mocks.createWorkspaceHost,
  getWorkspaceCodeSectionData: mocks.getWorkspaceCodeSectionData,
  registerWorkspaceCreationCommands: mocks.registerWorkspaceCreationCommands,
  registerSectionKinds: mocks.registerSectionKinds,
  setItemData: mocks.setItemData,
  setWorkspaceColorMode: mocks.setWorkspaceColorMode,
}));

import { PythonCanvasApp } from "./PythonCanvasApp";
import { PythonCanvasView } from "./PythonCanvasView";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  CALLABLE_SECTION_KIND,
  PENDING_CALLABLE_SECTION_KIND,
  callableSectionID,
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
      h: 300,
      w: 360,
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

  it("persists a callable deletion made through the workspace section header", async () => {
    const initialSnapshot = callableSnapshot(1, []);
    const deletedSnapshot = parseProjectSnapshotV2({
      ...initialSnapshot,
      callables: [],
      project: { ...initialSnapshot.project, revision: 2 },
    });
    const workspace = installWorkspaceHarness();
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.deleteCallable.mockResolvedValueOnce(deletedSnapshot);

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
        [pending.id]: { h: 300, w: 360, x: 48, y: 64, zIndex: 4 },
      },
    });
    await flushEffects();

    expect(workspace.getDocument().sections[pending.id]).toBeUndefined();
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toContain("Unable to update the callable");
  });

  it("registers parameter authoring and pending filter-only workspace controls", () => {
    const host = createHost();
    registerPythonCanvasSectionKinds(host);

    const authoring = requiredMockSectionRegistration(CALLABLE_SECTION_KIND);
    const pending = requiredMockSectionRegistration(
      PENDING_CALLABLE_SECTION_KIND,
    );
    expect(authoring.itemArea?.toolbar).toBe("authoring-and-filter");
    expect(pending.itemArea?.toolbar).toBe("filter-only");
    expect(pending.createItem).toBeUndefined();
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

  it("keeps app mutation feedback in an off-layout live region", () => {
    const view = renderView({
      kind: "error",
      message: "Unable to save the project. Try again.",
    });

    const error = view.querySelector("#python-canvas-mutation-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("Unable to save the project. Try again.");
    expect(view.querySelector(".python-canvas-project-controls")).toBeNull();
    expect(view.querySelector(".python-canvas-empty-state")).toBeNull();
  });

  it("keeps pending and unavailable-provider states explicit", () => {
    const view = renderView({
      description: "Saving the Python target.",
      kind: "pending",
    });

    const status = view.querySelector("[role='status']");
    expect(status?.textContent).toBe("Saving the Python target.");
    expect(status?.getAttribute("aria-busy")).toBe("true");
  });

  it("gives target completion feedback a stable description ID", () => {
    const view = renderView(
      { kind: "idle" },
      "Unable to load Python target completions. Try again.",
    );

    const error = view.querySelector("#python-canvas-target-completion-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe(
      "Unable to load Python target completions. Try again.",
    );
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
        [pending.id]: { h: 300, w: 360, x: 912, y: 488, zIndex: 4 },
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
    expect(mocks.setCallableParameters).toHaveBeenLastCalledWith(
      "callable:one",
      {
        expectedRevision: 1,
        parameters: [
          { authoredExpression: "first", id: "parameter:value", name: "value" },
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
          { authoredExpression: "first", id: "parameter:value", name: "value" },
          { authoredExpression: "later", id: "parameter:later", name: "later" },
        ],
        projectId: firstAnswer.project.id,
      },
    );
  });

  it("persists a callable diagnostic without refreshing or locking its section", async () => {
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
    };
    const commitRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.commitCallable.mockReturnValueOnce(commitRequest.promise);

    renderApp();
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
    expect(mocks.refreshCallableParameters).not.toHaveBeenCalled();
    expect(mocks.setCallableParameters).not.toHaveBeenCalled();
  });

  it("refreshes parameters only through the alternate callable commit", async () => {
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
      (expression.onAlternateCommit as (value: string) => void)(
        "fixture.resolved",
      );
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
    project: { ...projectSnapshotFixture.project, revision },
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
              data: {
                ...(item.data as Record<string, unknown>),
                authoredExpression,
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
  const { id, ...data } = parameter;
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
            [itemId]: { children: [], data, id: itemId },
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

function renderView(
  announcement:
    | { kind: "idle" }
    | { description: string; kind: "pending" }
    | { kind: "error"; message: string },
  pythonTargetCompletionError: string | null = null,
): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasView
        announcement={announcement}
        mutationContext={{
          callableCompletionError: () => null,
          callableCompletionProvider: () => undefined,
          callableMutationError: () => null,
          callablePending: () => false,
          callableDraft: () => "",
          onCallableAlternateCommit: vi.fn(),
          onCallableCommit: vi.fn(),
          onCallableDraftChange: vi.fn(),
          onCallableRevert: vi.fn(),
          onParameterExpressionChange: vi.fn(),
          onParameterNameChange: vi.fn(),
        }}
        pythonTargetCompletionError={pythonTargetCompletionError}
        state={{ host: createHost(), kind: "ready" }}
      />,
    );
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
