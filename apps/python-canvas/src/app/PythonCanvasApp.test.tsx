import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { parseProjectSnapshotV1 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  fetchProjectSnapshot: vi.fn(),
  setCallableParameters: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceCodeSectionData: vi.fn(),
  createWorkspaceHost: vi.fn(),
  registerSectionKinds: vi.fn(),
  setItemData: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
  editorProps: [] as Array<Record<string, unknown>>,
  // The package mounts the section content itself. A case that needs the app's own mutation
  // context, rather than a hand-written one, puts that content where the package would.
  renderCanvas: null as (() => ReactNode) | null,
}));

vi.mock("../backend/client", () => ({
  ProjectClientError: class extends Error {},
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  setCallableParameters: mocks.setCallableParameters,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  TextValueEditor: (props: Record<string, unknown>) => {
    mocks.editorProps.push(props);
    return (
      <div
        aria-label={String(props.ariaLabel)}
        data-presentation={String(props.presentation)}
      />
    );
  },
  WorkspaceCanvas: () =>
    mocks.renderCanvas?.() ?? <div data-testid="workspace-canvas" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: mocks.createWorkspaceCodeSectionData,
  createWorkspaceHost: mocks.createWorkspaceHost,
  registerSectionKinds: mocks.registerSectionKinds,
  setItemData: mocks.setItemData,
  setWorkspaceColorMode: mocks.setWorkspaceColorMode,
}));

import type { WorkspaceHost } from "@setta/workspace";
import { CallableExpressionField } from "../sections/CallableSection";
import {
  PythonCanvasApp,
  registerPythonCanvasSectionKinds,
} from "./PythonCanvasApp";
import { PythonCanvasMutationContext } from "./PythonCanvasMutationContext";

type HostStub = {
  dispose: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  loadDocument: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.editorProps.length = 0;
  mocks.renderCanvas = null;
  mocks.createWorkspaceCodeSection.mockReturnValue({});
  mocks.createWorkspaceCodeSectionData.mockImplementation(
    (overrides: Record<string, unknown>) => ({
      code: "",
      indentWidth: 4,
      language: "plaintext",
      lineNumbers: true,
      mode: "editable",
      wrapLines: true,
      ...overrides,
    }),
  );
});

afterEach(() => {
  if (root !== undefined) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  container = undefined;
  root = undefined;
});

describe("PythonCanvasApp", () => {
  it("loads one host once, registers before loading, renders the initial canvas, and disposes it", async () => {
    const pending = createDeferred<ReturnType<typeof parseProjectSnapshotV1>>();
    const host = createHostStub();
    mocks.createWorkspaceHost.mockReturnValue(host);
    mocks.fetchProjectSnapshot.mockReturnValue(pending.promise);

    const app = renderApp();

    expect(app.querySelector("h1")?.textContent).toBe("Python Canvas");
    expect(app.querySelector("main")).not.toBeNull();
    expect(app.querySelectorAll("main")).toHaveLength(1);
    expect(app.querySelector("[role='status']")?.textContent).toBe(
      "Loading project.",
    );
    expect(app.querySelector("[role='alert']")).toBeNull();
    expect(mocks.createWorkspaceHost).toHaveBeenCalledTimes(1);

    pending.resolve(parseProjectSnapshotV1(projectSnapshotFixture));
    await act(async () => {
      await pending.promise;
    });

    expect(host.loadDocument).toHaveBeenCalledTimes(1);
    expect(mocks.registerSectionKinds.mock.invocationCallOrder[0]).toBeLessThan(
      host.loadDocument.mock.invocationCallOrder[0] ?? Infinity,
    );
    // This view has no appearance control, so it follows the reader's system appearance, and it
    // resolves that before the document loads because node projection reads it.
    expect(mocks.setWorkspaceColorMode).toHaveBeenCalledWith(host, "system");
    expect(
      mocks.setWorkspaceColorMode.mock.invocationCallOrder[0],
    ).toBeLessThan(host.loadDocument.mock.invocationCallOrder[0] ?? Infinity);
    expect(app.querySelector("[role='status']")?.textContent).toBe(
      "Project loaded.",
    );
    expect(
      app.querySelector("[data-testid='workspace-canvas']"),
    ).not.toBeNull();

    unmountApp();

    expect(host.dispose).toHaveBeenCalledTimes(1);
  });

  it("registers the callable editor as leading content above the authoring Args toolbar", () => {
    const host = createHostStub();
    registerPythonCanvasSectionKinds(host as unknown as WorkspaceHost);

    const callable = registeredCallableKind();
    // The toolbar's Add, Remove Last, and Delete Selected all reach the canonical
    // parameter-list mutation, so this section takes the ordinary authoring mode.
    expect(callable.itemArea.toolbar).toBe("authoring-and-filter");
    // What the registered slot renders, not which component expression produced it: the compact
    // callable field keeps its section-field placement and accessible name through any wrapper.
    const leading = renderLeadingContent(
      callable.itemArea.renderLeadingContent({}),
    );
    const editor = leading.querySelector<HTMLElement>("[data-presentation]");
    if (!editor) {
      throw new Error("The registered leading content renders no editor.");
    }
    expect(editor.getAttribute("aria-label")).toBe("Callable expression");
    expect(editor.dataset["presentation"]).toBe("section-field");
    // The retained filter searches the text the row actually shows, which is main's visible
    // parameter name and nothing the analyzer spells.
    expect(
      callable.getItemSearchableText({
        item: {
          data: {
            authoredExpression: "3",
            default: null,
            disabled: false,
            name: "x",
            nameEditable: false,
          },
        },
      }),
    ).toBe("x");
  });

  // The package's Add parameter action asks this factory for the record it inserts, and the ID it
  // proposes here is the parameter ID the store adopts.
  it("creates one complete blank app-authored parameter with a stable ID", () => {
    const host = createHostStub();
    host.getSnapshot.mockReturnValue({ sections: {} });
    registerPythonCanvasSectionKinds(host as unknown as WorkspaceHost);

    const created = registeredCallableKind().createItem({});
    const repeated = registeredCallableKind().createItem({});

    expect(created.children).toEqual([]);
    expect(created.data).toEqual({
      authoredExpression: "",
      default: null,
      disabled: false,
      name: "",
      nameEditable: true,
    });
    expect(created.id).toMatch(/^parameter:authored:.+/u);
    expect(repeated.id).not.toBe(created.id);
  });

  // Main's callable search keeps its draft only until the field is left: Escape drops it for the
  // name the project actually holds. The draft is local, so nothing but the canonical snapshot can
  // supply that value.
  it("abandons an uncommitted callable draft back to the canonical expression", async () => {
    mocks.renderCanvas = () => <CallableExpressionField />;
    const host = createHostStub();
    mocks.createWorkspaceHost.mockReturnValue(host);
    mocks.fetchProjectSnapshot.mockResolvedValue(committedSnapshot());

    renderApp();
    await settle();
    expect(callableField().value).toBe("math.sqrt");

    act(() => {
      (callableField().onValueChange as (value: string) => void)("math.floor");
    });
    expect(callableField().value).toBe("math.floor");

    act(() => {
      (callableField().onEscape as () => void)();
    });
    expect(callableField().value).toBe("math.sqrt");
  });

  // Main never sends a name its own rule refuses; it keeps the text in the row and reports the
  // problem beside it. Here the workspace document is that text, so a blocking name holds the
  // whole ordered proposal back instead of being answered by the store restoring the list.
  it("never proposes a parameter name the store would refuse", async () => {
    vi.useFakeTimers();
    try {
      const host = createHostStub();
      mocks.createWorkspaceHost.mockReturnValue(host);
      mocks.fetchProjectSnapshot.mockResolvedValue(committedSnapshot());
      mocks.setCallableParameters.mockReturnValue(new Promise(() => {}));

      renderApp();
      await settle();
      const notifyDocumentChanged = host.subscribe.mock.calls[0]?.[0] as (
        document: unknown,
      ) => void;

      await proposeParameterRows(host, notifyDocumentChanged, [
        { name: "class", nameEditable: true },
      ]);
      expect(mocks.setCallableParameters).not.toHaveBeenCalled();
      await proposeParameterRows(host, notifyDocumentChanged, [
        { name: "x", nameEditable: false },
        { name: "x", nameEditable: true },
      ]);
      expect(mocks.setCallableParameters).not.toHaveBeenCalled();

      // The same list with a usable name is proposed whole, so the refusal above is about the
      // name rather than about this path never sending anything.
      await proposeParameterRows(host, notifyDocumentChanged, [
        { name: "x", nameEditable: false },
        { name: "scale", nameEditable: true },
      ]);
      expect(mocks.setCallableParameters).toHaveBeenCalledTimes(1);
      expect(mocks.setCallableParameters.mock.calls[0]?.[0]).toMatchObject({
        callableId: "callable:square-root",
        expectedRevision: 1,
        parameters: [
          { authoredExpression: "", id: "parameter:0", name: "x" },
          { authoredExpression: "", id: "parameter:1", name: "scale" },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces a failed load with an alert and disposes the unused host", async () => {
    const host = createHostStub();
    mocks.createWorkspaceHost.mockReturnValue(host);
    mocks.fetchProjectSnapshot.mockRejectedValue(
      new Error("backend unavailable"),
    );

    const app = renderApp();
    await settle();

    expect(app.querySelector("[role='status']")?.textContent).toBe(
      "Project could not be loaded.",
    );
    expect(app.querySelector("[role='alert']")?.textContent).toContain(
      "Check that the backend is running",
    );
    expect(app.querySelector("[data-testid='workspace-canvas']")).toBeNull();
    expect(host.dispose).toHaveBeenCalledTimes(1);

    unmountApp();
    expect(host.dispose).toHaveBeenCalledTimes(1);
  });

  it("ignores a result that arrives after unmount", async () => {
    const pending = createDeferred<ReturnType<typeof parseProjectSnapshotV1>>();
    const host = createHostStub();
    mocks.createWorkspaceHost.mockReturnValue(host);
    mocks.fetchProjectSnapshot.mockReturnValue(pending.promise);

    renderApp();
    unmountApp();
    pending.resolve(parseProjectSnapshotV1(projectSnapshotFixture));
    await act(async () => {
      await pending.promise;
    });

    expect(host.loadDocument).not.toHaveBeenCalled();
    expect(host.dispose).toHaveBeenCalledTimes(1);
  });
});

// The shipped service commits its example before it answers, so the canonical first response the
// app renders already carries the expression.
function committedSnapshot(): ReturnType<typeof parseProjectSnapshotV1> {
  return parseProjectSnapshotV1({
    ...projectSnapshotFixture,
    callables: [
      {
        ...projectSnapshotFixture.callables[0],
        authoredExpression: "math.sqrt",
      },
    ],
  });
}

// Puts one complete ordered parameter list in the controlled document, tells the app's own
// subscription that the document changed, and lets its coalescing debounce run out.
async function proposeParameterRows(
  host: HostStub,
  notifyDocumentChanged: (document: unknown) => void,
  rows: Array<{ name: string; nameEditable: boolean }>,
): Promise<void> {
  const document = documentWithParameterRows(rows);
  host.getSnapshot.mockReturnValue(document);
  act(() => {
    notifyDocumentChanged(document);
  });
  await act(async () => {
    // Longer than the controller's own coalescing window, whatever it is set to.
    await vi.advanceTimersByTimeAsync(2000);
  });
}

function documentWithParameterRows(
  rows: Array<{ name: string; nameEditable: boolean }>,
) {
  const items: Record<string, unknown> = {
    "python-canvas:callable:parameter-root": {
      id: "python-canvas:callable:parameter-root",
      children: rows.map((_row, index) => `parameter:${String(index)}`),
    },
  };
  rows.forEach((row, index) => {
    const id = `parameter:${String(index)}`;
    items[id] = {
      id,
      children: [],
      data: {
        authoredExpression: "",
        default: null,
        disabled: false,
        name: row.name,
        nameEditable: row.nameEditable,
      },
    };
  });
  return {
    sections: {
      "python-canvas:callable": {
        id: "python-canvas:callable",
        itemTree: { rootId: "python-canvas:callable:parameter-root", items },
      },
    },
  };
}

// The most recent props the callable field handed the package's editor.
function callableField(): Record<string, unknown> {
  const props = mocks.editorProps
    .filter((candidate) => candidate.ariaLabel === "Callable expression")
    .at(-1);
  if (props === undefined) {
    throw new Error("The callable field rendered no editor.");
  }
  return props;
}

function createHostStub(): HostStub {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(),
    loadDocument: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

type CallableKindRegistration = {
  createItem: (context: unknown) => {
    children: Array<string>;
    data: unknown;
    id: string;
  };
  getItemSearchableText: (context: unknown) => string;
  itemArea: {
    renderLeadingContent: (section: unknown) => ReactNode;
    toolbar: string;
  };
};

function registeredCallableKind(): CallableKindRegistration {
  const kinds = mocks.registerSectionKinds.mock.calls.at(-1)?.[1] as
    Record<string, Partial<CallableKindRegistration>> | undefined;
  const callable = kinds?.["python-canvas.callable"];
  if (
    callable?.itemArea?.renderLeadingContent === undefined ||
    callable.getItemSearchableText === undefined ||
    callable.createItem === undefined
  ) {
    throw new Error(
      "The callable kind registers no item area with leading content and a factory.",
    );
  }
  return callable as CallableKindRegistration;
}

// The package places this node itself, so the test supplies only the app-owned mutation context
// the field reads.
function renderLeadingContent(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasMutationContext.Provider
        value={{
          callableCompletionProvider: undefined,
          callableDraft: "math.sq",
          completionError: null,
          mutationError: null,
          onCallableCommit: vi.fn(),
          onCallableDraftChange: vi.fn(),
          onCallableRevert: vi.fn(),
          onParameterExpressionChange: vi.fn(),
          onParameterNameChange: vi.fn(),
          pendingDescription: null,
        }}
      >
        {node}
      </PythonCanvasMutationContext.Provider>,
    );
  });
  return container;
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

function unmountApp(): void {
  act(() => {
    root?.unmount();
  });
  root = undefined;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
