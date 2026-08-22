import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceHost } from "@setta/workspace";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";

const mocks = vi.hoisted(() => ({
  commitWorkspaceDocument: vi.fn(),
  createWorkspaceCodeSection: vi.fn(),
  createWorkspaceHost: vi.fn(),
  fetchProjectSnapshot: vi.fn(),
  getWorkspaceCodeSectionData: vi.fn(),
  registerSectionKinds: vi.fn(),
  setItemData: vi.fn(),
  setWorkspaceColorMode: vi.fn(),
}));

vi.mock("../backend/client", () => ({
  ProjectClientError: class extends Error {},
  commitCallable: vi.fn(),
  createCallable: vi.fn(),
  deleteCallable: vi.fn(),
  fetchProjectSnapshot: mocks.fetchProjectSnapshot,
  renameCallable: vi.fn(),
  renameProject: vi.fn(),
  setCallableParameters: vi.fn(),
  setPythonTarget: vi.fn(),
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

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createWorkspaceCodeSection.mockReturnValue({});
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

describe("PythonCanvasApp", () => {
  it("presents labelled project controls and an explanatory blank-project state", async () => {
    const view = renderApp();
    await flushEffects();

    expect(
      view.querySelector<HTMLInputElement>("input[name='project-name']")?.value,
    ).toBe("Fixture project");
    expect(
      view.querySelector("label[for='python-canvas-project-name']")
        ?.textContent,
    ).toBe("Project name");
    expect(
      view.querySelector("label[for='python-canvas-new-callable']")
        ?.textContent,
    ).toBe("New callable name");
    expect(view.querySelector("button[type='submit']")?.textContent).toBe(
      "Rename project",
    );
    expect(
      view.querySelector(".python-canvas-empty-state")?.textContent,
    ).toContain("No callables yet");
    expect(
      view.querySelector("[data-testid='workspace-canvas']"),
    ).not.toBeNull();
    expect(mocks.setWorkspaceColorMode).toHaveBeenCalledWith(
      expect.anything(),
      "system",
    );
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
    await Promise.resolve();
    await Promise.resolve();
  });
}
