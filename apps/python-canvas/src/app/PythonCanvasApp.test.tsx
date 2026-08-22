import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { ProjectClientError } from "../backend/client";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  commitWorkspaceDocument: vi.fn(),
  createCallable: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  renameCallable: vi.fn(),
  renameProject: vi.fn(),
  registerSectionKinds: vi.fn(),
  setItemData: vi.fn(),
  setPythonTarget: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
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
  commitCallable: vi.fn(),
  createCallable: mocks.createCallable,
  deleteCallable: vi.fn(),
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  renameCallable: mocks.renameCallable,
  renameProject: mocks.renameProject,
  setCallableParameters: vi.fn(),
  setPythonTarget: mocks.setPythonTarget,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  ItemNameEditor: () => <input aria-label="Parameter name" readOnly />,
  TextValueEditor: () => <input aria-label="Callable expression" readOnly />,
  WorkspaceCanvas: () => <div data-testid="workspace-canvas" />,
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
  PythonTargetCompletionErrorProvider,
  pythonTargetCompletionErrorId,
} from "./PythonTargetCompletionBoundary";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
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

  it("registers public workspace parameter authoring and filter controls", () => {
    const host = createHost();
    registerPythonCanvasSectionKinds(host);

    const registrations = mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
      Record<string, { itemArea?: { toolbar?: string } }> | undefined;
    expect(registrations?.["python-canvas.callable"]?.itemArea?.toolbar).toBe(
      "authoring-and-filter",
    );
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
