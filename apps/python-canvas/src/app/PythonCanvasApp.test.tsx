import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { parseProjectSnapshotV1 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  fetchProjectSnapshot: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceCodeSectionData: vi.fn(),
  createWorkspaceHost: vi.fn(),
  registerSectionKinds: vi.fn(),
}));

vi.mock("../backend/client", () => ({
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_CODE_SECTION_KIND: "setta.code",
  WorkspaceCanvas: () => <div data-testid="workspace-canvas" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  createWorkspaceCodeSection: mocks.createWorkspaceCodeSection,
  createWorkspaceCodeSectionData: mocks.createWorkspaceCodeSectionData,
  createWorkspaceHost: mocks.createWorkspaceHost,
  registerSectionKinds: mocks.registerSectionKinds,
}));

import type { WorkspaceHost } from "@setta/workspace";
import { CallableExpressionField } from "../sections/CallableSection";
import {
  PythonCanvasApp,
  registerPythonCanvasSectionKinds,
} from "./PythonCanvasApp";

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
  mocks.createWorkspaceCodeSection.mockReturnValue({});
  mocks.createWorkspaceCodeSectionData.mockImplementation(
    (overrides: Record<string, unknown>) => ({
      code: "",
      indentWidth: 4,
      language: "plaintext",
      lineNumbers: true,
      readOnly: false,
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
    expect(
      mocks.registerSectionKinds.mock.invocationCallOrder[0],
    ).toBeLessThan(host.loadDocument.mock.invocationCallOrder[0] ?? Infinity);
    expect(app.querySelector("[role='status']")?.textContent).toBe(
      "Project loaded.",
    );
    expect(app.querySelector("[data-testid='workspace-canvas']")).not.toBeNull();

    unmountApp();

    expect(host.dispose).toHaveBeenCalledTimes(1);
  });

  it("registers the callable editor as leading content above a filter-only Args toolbar", () => {
    const host = createHostStub();
    registerPythonCanvasSectionKinds(host as unknown as WorkspaceHost);

    const kinds = mocks.registerSectionKinds.mock.calls[0]?.[1] as Record<
      string,
      {
        getItemSearchableText?: (context: unknown) => string;
        itemArea?: {
          renderLeadingContent?: (section: unknown) => ReactNode;
          toolbar?: string;
        };
      }
    >;
    const callable = kinds["python-canvas.callable"];
    expect(callable?.itemArea?.toolbar).toBe("filter-only");
    expect(callable?.itemArea?.renderLeadingContent?.({})).toEqual(
      <CallableExpressionField />,
    );
    // The retained filter searches the text the row actually shows.
    expect(
      callable?.getItemSearchableText?.({
        item: {
          data: {
            authoredExpression: "3",
            default: null,
            disabled: false,
            kind: "parameter",
            name: "x",
            parameterId: "parameter:square-root:1",
            passingStyle: "positional_only",
            typeAnnotation: "float",
          },
        },
      }),
    ).toBe("x positional only · float");
  });

  it("replaces a failed load with an alert and disposes the unused host", async () => {
    const host = createHostStub();
    mocks.createWorkspaceHost.mockReturnValue(host);
    mocks.fetchProjectSnapshot.mockRejectedValue(new Error("backend unavailable"));

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
