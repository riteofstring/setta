import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { describe, expect, it, vi } from "vitest";

import {
  PROJECT_CALLABLES_PATH_V2,
  PROJECT_CLIPBOARD_COPY_PATH_V2,
  PROJECT_CLIPBOARD_PASTE_PATH_V2,
  PROJECT_EVENTS_PATH_V2,
  PROJECT_FOREST_PATH_V2,
  PROJECT_LISTS_PATH_V2,
  PROJECT_PARAMETER_DICTIONARIES_PATH_V2,
  PROJECT_PATH_V2,
  PROJECT_TARGET_COMPLETIONS_PATH_V2,
  PROJECT_TARGET_PATH_V2,
  PROJECT_TERMINAL_CLOSE_PATH_V2,
  PROJECT_TERMINAL_PATH_V2,
  PROJECT_TERMINAL_RUN_PATH_V2,
  PROJECT_TERMINAL_TICKET_PATH_V2,
  projectCallableCommitPath,
  projectCallableDeletePath,
  projectCallableParametersPath,
  projectCallableRefreshParametersPath,
  projectCallableRenamePath,
  projectListDecrementPath,
  projectListDeletePath,
  projectListIncrementPath,
  projectListRenamePath,
  projectParameterDictionaryDeletePath,
  projectParameterDictionaryEntriesPath,
  projectParameterDictionaryRenamePath,
  type SetParameterDictionaryEntriesRequestV2,
} from "./generatedContract";

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
import {
  ProjectClientError,
  commitCallable,
  closeTerminal,
  completeCallable,
  completePythonTarget,
  connectProjectSnapshotStream,
  copyProjectClipboard,
  createCallable,
  createList,
  createParameterDictionary,
  decrementListChildren,
  deleteList,
  deleteCallable,
  deleteParameterDictionary,
  fetchProjectSnapshot,
  refreshCallableParameters,
  renameList,
  renameCallable,
  renameParameterDictionary,
  replaceSectionForest,
  setCallableParameters,
  setParameterDictionaryEntries,
  setPythonTarget,
  incrementListChildren,
  getTerminalTicket,
  openTerminal,
  pasteProjectClipboard,
  runTerminal,
} from "./client";

describe("Python Canvas V2 project client", () => {
  it("consumes canonical snapshots from one server-pushed event stream", () => {
    const source = createProjectSnapshotEventSource();
    const createEventSource = vi.fn(() => source);
    const onProtocolError = vi.fn();
    const onSnapshot = vi.fn();

    const disconnect = connectProjectSnapshotStream(
      { onProtocolError, onSnapshot },
      createEventSource,
    );

    expect(createEventSource).toHaveBeenCalledWith(PROJECT_EVENTS_PATH_V2);
    source.onmessage?.call(
      source as EventSource,
      new MessageEvent("message", {
        data: JSON.stringify(projectSnapshotFixture),
      }),
    );
    source.onerror?.call(source as EventSource, new Event("error"));

    expect(onSnapshot).toHaveBeenCalledWith(projectSnapshotFixture);
    expect(onProtocolError).not.toHaveBeenCalled();
    expect(source.close).not.toHaveBeenCalled();

    disconnect();
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("closes a project stream whose pushed snapshot violates the contract", () => {
    const source = createProjectSnapshotEventSource();
    const onProtocolError = vi.fn();
    const onSnapshot = vi.fn();

    connectProjectSnapshotStream({ onProtocolError, onSnapshot }, () => source);
    source.onmessage?.call(
      source as EventSource,
      new MessageEvent("message", {
        data: JSON.stringify({ version: "v2" }),
      }),
    );

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(onProtocolError).toHaveBeenCalledTimes(1);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("uses one exact JSON GET request and validates the V2 snapshot", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(createJsonResponse(projectSnapshotFixture));

    await expect(
      fetchProjectSnapshot({}, fetchImplementation as typeof fetch),
    ).resolves.toEqual(projectSnapshotFixture);

    expect(fetchImplementation).toHaveBeenCalledWith(PROJECT_PATH_V2, {
      headers: { Accept: "application/json" },
      method: "GET",
    });
  });

  it("forwards a caller-owned cancellation signal for project revalidation", async () => {
    const controller = new AbortController();
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(createJsonResponse(projectSnapshotFixture));

    await fetchProjectSnapshot(
      { signal: controller.signal },
      fetchImplementation as typeof fetch,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_PATH_V2,
      expect.objectContaining({ signal: controller.signal }),
    );
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
          ui: CODE_UI,
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
    const dictionaryRequest = {
      expectedRevision: 1,
      name: "Options",
      projectId: "project:fixture",
    };
    const dictionaryEntriesRequest: SetParameterDictionaryEntriesRequestV2 = {
      entries: [
        {
          authoredExpression: "4",
          id: "entry:radius",
          kind: "leaf",
          name: "radius",
          ui: CODE_UI,
        },
      ],
      expectedRevision: 1,
      projectId: "project:fixture",
    };
    const listRequest = {
      expectedRevision: 1,
      name: "Objects",
      projectId: "project:fixture",
    };
    const countRequest = {
      count: 2,
      expectedRevision: 1,
      projectId: "project:fixture",
    };
    const forestRequest = {
      expectedRevision: 1,
      listChildren: [],
      projectId: "project:fixture",
      topLevelSectionIds: [],
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
    await expectSnapshotPost(
      PROJECT_PARAMETER_DICTIONARIES_PATH_V2,
      dictionaryRequest,
      (fetch) => createParameterDictionary(dictionaryRequest, fetch),
    );
    await expectSnapshotPost(
      projectParameterDictionaryRenamePath("dictionary:one"),
      dictionaryRequest,
      (fetch) =>
        renameParameterDictionary("dictionary:one", dictionaryRequest, fetch),
    );
    await expectSnapshotPost(
      projectParameterDictionaryDeletePath("dictionary:one"),
      deleteRequest,
      (fetch) =>
        deleteParameterDictionary("dictionary:one", deleteRequest, fetch),
    );
    await expectSnapshotPost(
      projectParameterDictionaryEntriesPath("dictionary:one"),
      dictionaryEntriesRequest,
      (fetch) =>
        setParameterDictionaryEntries(
          "dictionary:one",
          dictionaryEntriesRequest,
          fetch,
        ),
    );
    await expectSnapshotPost(PROJECT_LISTS_PATH_V2, listRequest, (fetch) =>
      createList(listRequest, fetch),
    );
    await expectSnapshotPost(
      projectListRenamePath("list:one"),
      listRequest,
      (fetch) => renameList("list:one", listRequest, fetch),
    );
    await expectSnapshotPost(
      projectListDeletePath("list:one"),
      deleteRequest,
      (fetch) => deleteList("list:one", deleteRequest, fetch),
    );
    await expectSnapshotPost(
      projectListIncrementPath("list:one"),
      countRequest,
      (fetch) => incrementListChildren("list:one", countRequest, fetch),
    );
    await expectSnapshotPost(
      projectListDecrementPath("list:one"),
      countRequest,
      (fetch) => decrementListChildren("list:one", countRequest, fetch),
    );
    await expectSnapshotPost(PROJECT_FOREST_PATH_V2, forestRequest, (fetch) =>
      replaceSectionForest(forestRequest, fetch),
    );
  });

  it("uses typed clipboard copy and paste endpoints with closed responses", async () => {
    const payload = clipboardPayload();
    const copyRequest = {
      observedRevision: 1,
      projectId: "project:fixture",
      rootSectionIds: ["callable:source"],
    };
    const pastedSnapshot = clipboardPastedSnapshot();
    const pasteRequest = {
      expectedRevision: 1,
      payload,
      projectId: "project:fixture",
    };

    await expectClipboardPost(
      PROJECT_CLIPBOARD_COPY_PATH_V2,
      copyRequest,
      { payload },
      (fetch) => copyProjectClipboard(copyRequest, fetch),
    );
    await expectClipboardPost(
      PROJECT_CLIPBOARD_PASTE_PATH_V2,
      pasteRequest,
      {
        pastedRootSectionIds: ["callable:pasted"],
        snapshot: pastedSnapshot,
      },
      (fetch) => pasteProjectClipboard(pasteRequest, fetch),
    );

    await expect(
      copyProjectClipboard(
        copyRequest,
        vi
          .fn()
          .mockResolvedValue(
            createJsonResponse({ payload: { version: 1 } }),
          ) as typeof fetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid_response", status: 200 });
  });

  it("uses the generated terminal routes and accepts only the close route's 204 boundary", async () => {
    const projectId = "project:fixture";
    const openRequest = { columns: 80, projectId, rows: 24 };
    const runRequest = {
      columns: 80,
      expectedRevision: 1,
      projectId,
      rows: 24,
    };
    const ticketRequest = { projectId };
    const closeRequest = { projectId };
    const session = { columns: 80, created: true, rows: 24 };

    await expectTerminalPost(
      PROJECT_TERMINAL_PATH_V2,
      openRequest,
      session,
      (fetch) => openTerminal(openRequest, fetch),
    );
    await expectTerminalPost(
      PROJECT_TERMINAL_RUN_PATH_V2,
      runRequest,
      session,
      (fetch) => runTerminal(runRequest, fetch),
    );
    await expectTerminalPost(
      PROJECT_TERMINAL_TICKET_PATH_V2,
      ticketRequest,
      { ticket: "t".repeat(32) },
      (fetch) => getTerminalTicket(ticketRequest, fetch),
    );

    const response = {
      json: vi.fn(),
      ok: true,
      status: 204,
    } as unknown as Response & { json: ReturnType<typeof vi.fn> };
    const fetchImplementation = vi.fn().mockResolvedValue(response);
    await expect(
      closeTerminal(closeRequest, fetchImplementation as typeof fetch),
    ).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_TERMINAL_CLOSE_PATH_V2,
      expect.objectContaining({
        body: JSON.stringify(closeRequest),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    expect(response.json).not.toHaveBeenCalled();

    const unexpectedJsonResponse = {
      json: vi.fn().mockResolvedValue({ closed: true }),
      ok: true,
      status: 200,
    } as unknown as Response & { json: ReturnType<typeof vi.fn> };
    await expect(
      closeTerminal(
        closeRequest,
        vi.fn().mockResolvedValue(unexpectedJsonResponse) as typeof fetch,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_response",
      status: 200,
    } satisfies Partial<ProjectClientError>);
    expect(unexpectedJsonResponse.json).not.toHaveBeenCalled();
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
      fetchProjectSnapshot({}, malformedFetch as typeof fetch),
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

async function expectTerminalPost(
  path: string,
  body: object,
  responseBody: object,
  invoke: (fetchImplementation: typeof fetch) => Promise<unknown>,
): Promise<void> {
  const fetchImplementation = vi
    .fn()
    .mockResolvedValue(createJsonResponse(responseBody));
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

async function expectClipboardPost(
  path: string,
  body: object,
  responseBody: object,
  invoke: (fetchImplementation: typeof fetch) => Promise<unknown>,
): Promise<void> {
  const fetchImplementation = vi
    .fn()
    .mockResolvedValue(createJsonResponse(responseBody));
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

function createProjectSnapshotEventSource(): Pick<
  EventSource,
  "close" | "onerror" | "onmessage"
> {
  return {
    close: vi.fn(),
    onerror: null,
    onmessage: null,
  };
}

function clipboardPayload() {
  return {
    callables: [
      {
        authoredExpression: "value",
        id: "callable:source",
        name: "Source",
        parameters: [],
      },
    ],
    lists: [],
    parameterDictionaries: [],
    rootSectionIds: ["callable:source"],
    version: 1 as const,
  };
}

function clipboardPastedSnapshot() {
  return {
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "value",
        id: "callable:pasted",
        name: "Pasted",
        parameters: [],
      },
    ],
    topLevelSectionIds: ["callable:pasted"],
  };
}
