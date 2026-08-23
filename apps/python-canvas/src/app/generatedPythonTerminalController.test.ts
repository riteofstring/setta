import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeTerminal: vi.fn(),
  disposeGeneratedPythonTerminal: vi.fn(),
  getGeneratedPythonTerminalDimensions: vi.fn(() => ({
    columns: 80,
    rows: 24,
  })),
  openTerminal: vi.fn(),
  runTerminal: vi.fn(),
  setWorkspaceSectionSize: vi.fn(),
}));

vi.mock("@setta/workspace", () => ({
  setWorkspaceSectionSize: mocks.setWorkspaceSectionSize,
}));

vi.mock("../backend/client", () => ({
  ProjectClientError: class extends Error {},
  closeTerminal: mocks.closeTerminal,
  openTerminal: mocks.openTerminal,
  runTerminal: mocks.runTerminal,
}));

vi.mock("./generatedPythonTerminalClient", () => ({
  disposeGeneratedPythonTerminal: mocks.disposeGeneratedPythonTerminal,
  getGeneratedPythonTerminalDimensions:
    mocks.getGeneratedPythonTerminalDimensions,
}));

import type { WorkspaceHost } from "@setta/workspace";
import type { ProjectSnapshotV2 } from "../backend/generatedContract";

import {
  createGeneratedPythonTerminalRuntime,
  type GeneratedPythonTerminalState,
} from "./generatedPythonTerminalController";

const projectId = "project:terminal";

describe("Generated Python terminal runtime", () => {
  it("keeps the editor's outer geometry stable across create, hide, show, and a hidden run", async () => {
    const harness = createRuntimeHarness({ revision: 2 });
    mocks.openTerminal.mockResolvedValue({
      columns: 80,
      created: true,
      rows: 24,
    });
    mocks.runTerminal.mockResolvedValue({
      columns: 80,
      created: false,
      rows: 24,
    });

    harness.runtime.create();
    await flushMicrotasks();

    expect(harness.currentState.status).toBe("visible");
    expect(harness.sectionHeight()).toBe(640);
    expect(mocks.setWorkspaceSectionSize).toHaveBeenLastCalledWith(
      harness.host,
      "python-canvas:generated-python",
      { height: 640 },
    );
    expect(mocks.runTerminal).not.toHaveBeenCalled();

    harness.runtime.hide();
    expect(harness.currentState.status).toBe("hidden");
    expect(harness.sectionHeight()).toBe(420);

    harness.runtime.run();
    await flushMicrotasks();
    expect(mocks.runTerminal).toHaveBeenCalledWith({
      columns: 80,
      expectedRevision: 2,
      projectId,
      rows: 24,
    });
    expect(harness.currentState.status).toBe("hidden");
    expect(harness.sectionHeight()).toBe(420);

    harness.runtime.show();
    expect(harness.currentState.status).toBe("visible");
    expect(harness.sectionHeight()).toBe(640);
  });

  it("joins a Run to an in-flight Create so one session adds one pane height", async () => {
    const harness = createRuntimeHarness({ revision: 7 });
    const open = deferred<{
      columns: number;
      created: boolean;
      rows: number;
    }>();
    mocks.openTerminal.mockReturnValue(open.promise);
    mocks.runTerminal.mockResolvedValue({
      columns: 80,
      created: false,
      rows: 24,
    });

    harness.runtime.create();
    harness.runtime.run();
    await flushMicrotasks();
    expect(mocks.runTerminal).not.toHaveBeenCalled();

    open.resolve({ columns: 80, created: true, rows: 24 });
    await flushMicrotasks();

    expect(mocks.openTerminal).toHaveBeenCalledTimes(1);
    expect(mocks.runTerminal).toHaveBeenCalledTimes(1);
    expect(harness.currentState.status).toBe("visible");
    expect(harness.sectionHeight()).toBe(640);
    expect(mocks.setWorkspaceSectionSize).toHaveBeenCalledTimes(1);
  });

  it("closes the runtime session locally and restores only the owner height", async () => {
    const harness = createRuntimeHarness({ revision: 2 });
    mocks.openTerminal.mockResolvedValue({
      columns: 80,
      created: true,
      rows: 24,
    });
    mocks.closeTerminal.mockResolvedValue(undefined);

    harness.runtime.create();
    await flushMicrotasks();
    const sessionKey = harness.currentState.sessionKey;
    if (sessionKey === null) {
      throw new Error("Expected the created terminal session key.");
    }

    harness.runtime.close();
    await flushMicrotasks();

    expect(mocks.closeTerminal).toHaveBeenCalledWith({ projectId });
    expect(mocks.disposeGeneratedPythonTerminal).toHaveBeenCalledWith(
      sessionKey,
    );
    expect(harness.currentState).toMatchObject({
      creating: false,
      projectId: null,
      sessionKey: null,
      status: "absent",
    });
    expect(harness.sectionHeight()).toBe(420);
    expect(harness.snapshot.project).toEqual({ id: projectId, revision: 2 });
  });

  it("keeps a terminal create failure in local terminal state", async () => {
    const harness = createRuntimeHarness({ revision: 2 });
    mocks.openTerminal.mockRejectedValue(new Error("offline"));

    harness.runtime.create();
    await flushMicrotasks();

    expect(harness.currentState).toMatchObject({
      creating: false,
      error: "Unable to create the terminal. Try again.",
      status: "absent",
    });
    expect(mocks.setWorkspaceSectionSize).not.toHaveBeenCalled();
  });

  it("runs against the snapshot supplied after the target-flush operation", async () => {
    const harness = createRuntimeHarness({ revision: 1, flushedRevision: 3 });
    mocks.runTerminal.mockResolvedValue({
      columns: 80,
      created: true,
      rows: 24,
    });

    harness.runtime.run();
    await flushMicrotasks();

    expect(harness.runAfterTargetFlush).toHaveBeenCalledTimes(1);
    expect(mocks.runTerminal).toHaveBeenCalledWith({
      columns: 80,
      expectedRevision: 3,
      projectId,
      rows: 24,
    });
  });
});

function createRuntimeHarness({
  revision,
  flushedRevision = revision,
}: {
  flushedRevision?: number;
  revision: number;
}) {
  vi.clearAllMocks();
  let document = {
    sections: {
      "python-canvas:generated-python": {
        size: { height: 420, width: 640 },
      },
    },
  };
  const host = {
    getSnapshot: () => document,
  } as unknown as WorkspaceHost;
  mocks.setWorkspaceSectionSize.mockImplementation(
    (
      _host: WorkspaceHost,
      sectionId: "python-canvas:generated-python",
      size: { height: number },
    ) => {
      document = {
        sections: {
          ...document.sections,
          [sectionId]: {
            ...document.sections[sectionId],
            size: { ...document.sections[sectionId].size, ...size },
          },
        },
      };
    },
  );
  const snapshot = projectSnapshot(revision);
  const flushedSnapshot = projectSnapshot(flushedRevision);
  let currentState: GeneratedPythonTerminalState;
  const runAfterTargetFlush = vi.fn(async (operation) =>
    operation(flushedSnapshot),
  );
  const runtime = createGeneratedPythonTerminalRuntime({
    currentSnapshot: () => snapshot,
    host,
    isActive: () => true,
    runAfterTargetFlush,
    updateState: (next) => {
      currentState = next;
    },
  });
  currentState = {
    creating: false,
    error: null,
    projectId: null,
    sessionKey: null,
    status: "absent",
    terminalHeight: 220,
  };
  return {
    get currentState() {
      return currentState;
    },
    host,
    runAfterTargetFlush,
    runtime,
    snapshot,
    sectionHeight: () =>
      document.sections["python-canvas:generated-python"].size.height,
  };
}

function projectSnapshot(revision: number): ProjectSnapshotV2 {
  return {
    project: { id: projectId, revision },
  } as ProjectSnapshotV2;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
