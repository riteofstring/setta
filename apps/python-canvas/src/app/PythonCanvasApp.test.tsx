import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { ProjectClientError } from "../backend/client";
import type { ParameterV2 } from "../backend/generatedContract";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  commitCallable: vi.fn(),
  commitWorkspaceDocument: vi.fn(),
  createCallable: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  renameCallable: vi.fn(),
  renameProject: vi.fn(),
  registerSectionKinds: vi.fn(),
  renderWorkspaceCanvas: false,
  setItemData: vi.fn(),
  setCallableParameters: vi.fn(),
  setPythonTarget: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
  workspaceCanvasHost: null as {
    getSnapshot: () => {
      sections: Record<string, unknown>;
    };
  } | null,
}));

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
  deleteCallable: vi.fn(),
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  renameCallable: mocks.renameCallable,
  renameProject: mocks.renameProject,
  setCallableParameters: mocks.setCallableParameters,
  setPythonTarget: mocks.setPythonTarget,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  ItemNameEditor: () => <input aria-label="Parameter name" readOnly />,
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
  TextValueEditor: () => <input aria-label="Callable expression" readOnly />,
  WorkspaceCanvas: () => {
    if (!mocks.renderWorkspaceCanvas || mocks.workspaceCanvasHost === null) {
      return <div data-testid="workspace-canvas" />;
    }
    const registrations = mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
      | Record<
          string,
          {
            itemArea?: {
              renderLeadingContent?: (section: unknown) => ReactNode;
            };
          }
        >
      | undefined;
    const section =
      mocks.workspaceCanvasHost.getSnapshot().sections[
        "python-canvas:callable:callable:one"
      ];
    const sectionKind =
      typeof section === "object" && section !== null && "kind" in section
        ? (section as { kind: string }).kind
        : null;
    const renderLeadingContent =
      sectionKind === null
        ? undefined
        : registrations?.[sectionKind]?.itemArea?.renderLeadingContent;
    return (
      <div data-testid="workspace-canvas">
        {section === undefined || renderLeadingContent === undefined
          ? null
          : renderLeadingContent(section)}
      </div>
    );
  },
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
  registerSectionKinds: mocks.registerSectionKinds,
  setItemData: mocks.setItemData,
  setWorkspaceColorMode: mocks.setWorkspaceColorMode,
}));

import {
  PythonCanvasApp,
  registerPythonCanvasSectionKinds,
} from "./PythonCanvasApp";
import { PythonCanvasView } from "./PythonCanvasView";
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
  it("opens and focuses the labelled callable-name flow from the empty state", async () => {
    const view = renderApp();
    await flushEffects();

    expect(
      view.querySelector<HTMLInputElement>("input[name='project-name']")?.value,
    ).toBe("Fixture project");
    expect(
      view.querySelector("label[for='python-canvas-project-name']")
        ?.textContent,
    ).toBe("Project name");
    expect(view.querySelector("button[type='submit']")?.textContent).toBe(
      "Rename project",
    );
    expect(
      view.querySelector(".python-canvas-empty-state")?.textContent,
    ).toContain("No callables yet");
    expect(
      view.querySelector(".python-canvas-empty-state")?.textContent,
    ).toContain(
      "Callables are Python functions or methods that Python Canvas can call after their signature is resolved.",
    );
    expect(
      view.querySelector("[data-testid='workspace-canvas']"),
    ).not.toBeNull();
    expect(mocks.setWorkspaceColorMode).toHaveBeenCalledWith(
      expect.anything(),
      "system",
    );

    const addCallable = view.querySelector<HTMLButtonElement>(
      ".python-canvas-empty-state button",
    );
    if (addCallable === null) {
      throw new Error("Expected the empty-state Add callable control.");
    }
    await act(async () => {
      addCallable.click();
      await flushMicrotasks();
    });
    const callableInput = view.querySelector<HTMLInputElement>(
      "input[name='new-callable-name']",
    );
    expect(
      view.querySelector("label[for='python-canvas-new-callable']")
        ?.textContent,
    ).toBe("New callable name");
    expect(document.activeElement).toBe(callableInput);
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

  it("registers parameter authoring and pending filter-only workspace controls", () => {
    const host = createHost();
    registerPythonCanvasSectionKinds(host);

    const registrations = mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
      | Record<
          string,
          {
            createItem?: unknown;
            itemArea?: { toolbar?: string };
          }
        >
      | undefined;
    expect(registrations?.[CALLABLE_SECTION_KIND]?.itemArea?.toolbar).toBe(
      "authoring-and-filter",
    );
    expect(
      registrations?.[PENDING_CALLABLE_SECTION_KIND]?.itemArea?.toolbar,
    ).toBe("filter-only");
    expect(
      registrations?.[PENDING_CALLABLE_SECTION_KIND]?.createItem,
    ).toBeUndefined();
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

  it("announces mutation failures and associates them with the native project controls", () => {
    const view = renderView(
      {
        kind: "error",
        message: "Unable to save the project. Try again.",
      },
      true,
    );

    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toBe("Unable to save the project. Try again.");
    expect(view.querySelector("[role='status']")?.textContent).toBe(
      "Unable to save the project. Try again.",
    );
    expect(
      view.querySelector("#python-canvas-mutation-error")?.getAttribute("role"),
    ).toBeNull();
    expect(
      view
        .querySelector<HTMLInputElement>("input[name='project-name']")
        ?.getAttribute("aria-describedby"),
    ).toBe("python-canvas-mutation-error");
    expect(
      view
        .querySelector<HTMLInputElement>("input[name='new-callable-name']")
        ?.getAttribute("aria-describedby"),
    ).toBe("python-canvas-mutation-error");
  });

  it("retains a project rename draft after a revision-conflict refresh", async () => {
    const initialSnapshot = parseProjectSnapshotV2(projectSnapshotFixture);
    const latestSnapshot = parseProjectSnapshotV2({
      ...projectSnapshotFixture,
      project: {
        ...projectSnapshotFixture.project,
        name: "Remote project name",
        revision: initialSnapshot.project.revision + 1,
      },
    });
    mocks.fetchProjectSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(latestSnapshot);
    mocks.renameProject.mockRejectedValueOnce(
      new ProjectClientError(
        "http",
        "revision conflict",
        409,
        undefined,
        "revision_conflict",
      ),
    );

    const view = renderApp();
    await flushEffects();
    const input = view.querySelector<HTMLInputElement>(
      "input[name='project-name']",
    );
    if (input === null || input.form === null) {
      throw new Error("Expected the project rename form.");
    }
    await act(async () => {
      setInputValue(input, "Local retry project name");
    });
    await act(async () => {
      input.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushMicrotasks();
    });

    expect(input.value).toBe("Local retry project name");
    expect(view.querySelector("[role='status']")?.textContent).toContain(
      "your name draft is still available to retry",
    );
    expect(
      view.querySelector("#python-canvas-mutation-error")?.getAttribute("role"),
    ).toBeNull();
    expect(mocks.fetchProjectSnapshot).toHaveBeenCalledTimes(2);
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

  it("reports an unavailable provider in the persistent status region", () => {
    const view = renderView({ kind: "idle" });

    expect(view.querySelector("[role='status']")?.textContent).toBe(
      "Project loaded. Basedpyright is unavailable.",
    );
  });

  it("gives target completion feedback a stable description ID", () => {
    const view = renderView(
      { kind: "idle" },
      false,
      "Unable to load Python target completions. Try again.",
    );

    const error = view.querySelector("#python-canvas-target-completion-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe(
      "Unable to load Python target completions. Try again.",
    );
  });

  it("persists a pending outer target draft after creating a callable", async () => {
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
          name: "Created callable",
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

    const view = renderApp();
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
              from: bodyStart,
              to: bodyStart + initialSnapshot.generatedCode.body.length,
            },
          },
        },
      },
    };
    subscriber?.(workspaceDocument);

    const addCallable = view.querySelector<HTMLButtonElement>(
      ".python-canvas-empty-state button",
    );
    if (addCallable === null) {
      throw new Error("Expected the empty-state Add callable control.");
    }
    await act(async () => {
      addCallable.click();
      await flushMicrotasks();
    });
    const callableInput = view.querySelector<HTMLInputElement>(
      "input[name='new-callable-name']",
    );
    if (callableInput === null || callableInput.form === null) {
      throw new Error("Expected the callable creation form.");
    }
    await act(async () => {
      setInputValue(callableInput, "Created callable");
      callableInput.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushMicrotasks();
    });

    expect(mocks.createCallable).toHaveBeenCalledWith({
      expectedRevision: initialSnapshot.project.revision,
      name: "Created callable",
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

  it("drops a stale parameter list when a callable commit returns fresh provider IDs", async () => {
    vi.useFakeTimers();
    const initialSnapshot = callableSnapshot(1, [
      providerParameter("parameter:old-provider", "value"),
    ]);
    const committedSnapshot = callableSnapshot(
      2,
      [providerParameter("parameter:fresh-provider", "resolved")],
      "fixture.resolved",
    );
    const commitRequest = deferred<ReturnType<typeof parseProjectSnapshotV2>>();
    const workspace = installWorkspaceHarness();
    mocks.renderWorkspaceCanvas = true;
    mocks.workspaceCanvasHost = workspace.host as unknown as {
      getSnapshot: () => { sections: Record<string, unknown> };
    };
    mocks.fetchProjectSnapshot.mockResolvedValue(initialSnapshot);
    mocks.commitCallable.mockReturnValueOnce(commitRequest.promise);

    const view = renderApp();
    await flushEffects();
    const expression = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    if (expression === null || expression.form === null) {
      throw new Error("Expected the callable expression form.");
    }
    await act(async () => {
      setInputValue(expression, "fixture.resolved");
      expression.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushMicrotasks();
    });

    expect(mocks.commitCallable).toHaveBeenCalledWith("callable:one", {
      authoredExpression: "fixture.resolved",
      expectedRevision: 1,
      projectId: initialSnapshot.project.id,
    });
    expect(
      workspace.getDocument().sections[callableSectionID("callable:one")],
    ).toMatchObject({
      kind: PENDING_CALLABLE_SECTION_KIND,
      positionAndSizeLocked: true,
    });

    workspace.publish(
      appendParameter(
        workspace.getDocument(),
        "callable:one",
        authoredParameter("parameter:later", "later", "later"),
      ),
    );
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:old-provider",
      "parameter:later",
    ]);
    await advanceMutationDebounce();
    expect(mocks.setCallableParameters).not.toHaveBeenCalled();

    await act(async () => {
      commitRequest.resolve(committedSnapshot);
      await flushMicrotasks();
    });
    expect(parameterIds(workspace.getDocument(), "callable:one")).toEqual([
      "parameter:fresh-provider",
    ]);
    expect(
      workspace.getDocument().sections[callableSectionID("callable:one")],
    ).toMatchObject({
      kind: CALLABLE_SECTION_KIND,
      positionAndSizeLocked: false,
    });
    await advanceMutationDebounce();

    expect(mocks.setCallableParameters).not.toHaveBeenCalled();
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
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression,
        id: "callable:one",
        name: "One callable",
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
  callableFormOpen = false,
  pythonTargetCompletionError: string | null = null,
): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasView
        announcement={announcement}
        callableFormOpen={callableFormOpen}
        mutationContext={{
          callableCompletionError: () => null,
          callableCompletionProvider: () => undefined,
          callableMutationError: () => null,
          callablePending: () => false,
          callableDraft: () => "",
          callableNameDraft: () => null,
          onCallableCommit: vi.fn(),
          onCallableDelete: vi.fn(),
          onCallableDraftChange: vi.fn(),
          onCallableNameDraftChange: vi.fn(),
          onCallableRename: vi.fn(),
          onCallableRevert: vi.fn(),
          onParameterExpressionChange: vi.fn(),
          onParameterNameChange: vi.fn(),
        }}
        newCallableName=""
        onCloseCallableForm={vi.fn()}
        onCreateCallable={vi.fn()}
        onNewCallableNameChange={vi.fn()}
        onOpenCallableForm={vi.fn()}
        onProjectNameChange={vi.fn()}
        onRenameProject={vi.fn()}
        project={parseProjectSnapshotV2(projectSnapshotFixture)}
        projectNameDraft="Fixture project"
        projectMutation={announcement}
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

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("The native input value setter is unavailable.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
