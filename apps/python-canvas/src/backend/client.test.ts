import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { describe, expect, it, vi } from "vitest";

import {
  PROJECT_CALLABLES_PATH_V2,
  PROJECT_PATH_V2,
  PROJECT_TARGET_COMPLETIONS_PATH_V2,
  PROJECT_TARGET_PATH_V2,
  projectCallableCommitPath,
  projectCallableDeletePath,
  projectCallableParametersPath,
  projectCallableRefreshParametersPath,
  projectCallableRenamePath,
} from "./generatedContract";
import {
  ProjectClientError,
  commitCallable,
  completeCallable,
  completePythonTarget,
  createCallable,
  deleteCallable,
  fetchProjectSnapshot,
  refreshCallableParameters,
  renameCallable,
  setCallableParameters,
  setPythonTarget,
} from "./client";

describe("Python Canvas V2 project client", () => {
  it("uses one exact JSON GET request and validates the V2 snapshot", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(createJsonResponse(projectSnapshotFixture));

    await expect(
      fetchProjectSnapshot(fetchImplementation as typeof fetch),
    ).resolves.toEqual(projectSnapshotFixture);

    expect(fetchImplementation).toHaveBeenCalledWith(PROJECT_PATH_V2, {
      headers: { Accept: "application/json" },
      method: "GET",
    });
  });

  it("uses exact generated V2 paths for every revision-bound mutation", async () => {
    const callableId = "callable:one";
    const createRequest = {
      expectedRevision: 1,
      name: "New callable",
      projectId: "project:fixture",
    };
    const callableRequest = {
      expectedRevision: 1,
      name: "Renamed callable",
      projectId: "project:fixture",
    };
    const deleteRequest = {
      expectedRevision: 1,
      projectId: "project:fixture",
    };
    const commitRequest = {
      authoredExpression: "value",
      expectedRevision: 1,
      projectId: "project:fixture",
    };
    const refreshRequest = {
      expectedRevision: 1,
      projectId: "project:fixture",
    };
    const parameterRequest = {
      expectedRevision: 1,
      parameters: [
        {
          authoredExpression: "2",
          id: "parameter:scale",
          name: "scale",
        },
      ],
      projectId: "project:fixture",
    };
    const targetRequest = {
      expectedRevision: 1,
      prefix: "import os",
      projectId: "project:fixture",
      suffix: "state = SettaState()",
    };

    await expectSnapshotPost(
      PROJECT_CALLABLES_PATH_V2,
      createRequest,
      (fetch) => createCallable(createRequest, fetch),
    );
    await expectSnapshotPost(
      projectCallableRenamePath(callableId),
      callableRequest,
      (fetch) => renameCallable(callableId, callableRequest, fetch),
    );
    await expectSnapshotPost(
      projectCallableDeletePath(callableId),
      deleteRequest,
      (fetch) => deleteCallable(callableId, deleteRequest, fetch),
    );
    await expectSnapshotPost(
      projectCallableCommitPath(callableId),
      commitRequest,
      (fetch) => commitCallable(callableId, commitRequest, fetch),
    );
    await expectSnapshotPost(
      projectCallableRefreshParametersPath(callableId),
      refreshRequest,
      (fetch) => refreshCallableParameters(callableId, refreshRequest, fetch),
    );
    await expectSnapshotPost(
      projectCallableParametersPath(callableId),
      parameterRequest,
      (fetch) => setCallableParameters(callableId, parameterRequest, fetch),
    );
    await expectSnapshotPost(PROJECT_TARGET_PATH_V2, targetRequest, (fetch) =>
      setPythonTarget(targetRequest, fetch),
    );
  });

  it("sends complete combined-document completion requests with cancellation", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ insertText: "value", label: "value" }],
      }),
    );
    const controller = new AbortController();
    const targetRequest = {
      code: "import val\n\nbody\n\nstate = SettaState()",
      cursorOffsetUtf16: 10,
      projectId: "project:fixture",
      protectedBodyRange: { end: 17, start: 12 },
    };

    await expect(
      completePythonTarget(
        targetRequest,
        controller.signal,
        fetchImplementation as typeof fetch,
      ),
    ).resolves.toEqual({ items: [{ insertText: "value", label: "value" }] });

    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_TARGET_COMPLETIONS_PATH_V2,
      expect.objectContaining({
        body: JSON.stringify(targetRequest),
        method: "POST",
        signal: controller.signal,
      }),
    );

    const callableFetch = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ items: [] }));
    await completeCallable(
      "callable:one",
      {
        authoredExpression: "value",
        cursorOffsetUtf16: 5,
        projectId: "project:fixture",
      },
      controller.signal,
      callableFetch as typeof fetch,
    );
    expect(callableFetch).toHaveBeenCalledWith(
      "/api/v2/project/callables/callable%3Aone/completions",
      expect.objectContaining({ method: "POST", signal: controller.signal }),
    );
  });

  it("surfaces typed closed revision conflicts and malformed successes", async () => {
    const conflictFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        error: {
          code: "revision_conflict",
          currentRevision: 4,
          expectedRevision: 3,
          message: "Project changed.",
        },
      }),
      ok: false,
      status: 409,
    } as unknown as Response);

    await expect(
      createCallable(
        {
          expectedRevision: 3,
          name: "New callable",
          projectId: "project:fixture",
        },
        conflictFetch as typeof fetch,
      ),
    ).rejects.toMatchObject({
      code: "revision_conflict",
      kind: "http",
      status: 409,
    } satisfies Partial<ProjectClientError>);

    const malformedFetch = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ version: "v2" }));
    await expect(
      fetchProjectSnapshot(malformedFetch as typeof fetch),
    ).rejects.toMatchObject({ kind: "invalid_response", status: 200 });
  });
});

async function expectSnapshotPost(
  path: string,
  body: object,
  invoke: (fetchImplementation: typeof fetch) => Promise<unknown>,
): Promise<void> {
  const fetchImplementation = vi
    .fn()
    .mockResolvedValue(createJsonResponse(projectSnapshotFixture));
  await invoke(fetchImplementation as typeof fetch);
  expect(fetchImplementation).toHaveBeenCalledWith(
    path,
    expect.objectContaining({
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
}

function createJsonResponse(
  body: unknown,
): Response & { json: ReturnType<typeof vi.fn> } {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok: true,
    status: 200,
  } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}
