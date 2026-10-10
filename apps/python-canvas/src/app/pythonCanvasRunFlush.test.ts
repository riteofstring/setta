import { createWorkspaceHost } from "@setta/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setCallableParameters,
  setParameterDictionaryEntries,
} from "../api/client";
import {
  CODE_UI,
  callableSnapshot,
  dictionarySnapshot,
  providerParameter,
} from "./pythonCanvasAppTestFixtures";
import {
  createPythonCanvasMutations,
  type PythonCanvasMutationEnvironment,
} from "./pythonCanvasMutations";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  projectWorkspaceDocument,
  parameterWorkspaceItemID,
  dictionaryEntryWorkspaceItemID,
  setDictionaryEntryExpression,
  setParameterItemExpression,
} from "./workspaceProjection";

vi.mock("../api/client", () => ({
  setCallableParameters: vi.fn(),
  setParameterDictionaryEntries: vi.fn(),
}));

describe("Run with pending control edits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("saves callable and dictionary values before executing, without waiting for their debounce", async () => {
    const { host, mutations, current } = harness();
    setParameterItemExpression(
      host,
      "callable:one",
      parameterWorkspaceItemID("enabled"),
      "False",
    );
    setDictionaryEntryExpression(
      host,
      "dictionary:options",
      dictionaryEntryWorkspaceItemID("seed"),
      "10",
    );
    mutations.scheduleParameterListMutation("callable:one");
    mutations.scheduleDictionaryEntriesMutation("dictionary:options", false);
    vi.mocked(setCallableParameters).mockImplementation(
      async (_id, request) => ({
        ...current(),
        project: { ...current().project, revision: 2 },
        callables: [
          {
            ...current().callables[0]!,
            parameters: request.parameters.map((parameter) => ({
              ...providerParameter(parameter.id, parameter.authoredExpression),
              ...parameter,
              ui: CODE_UI,
            })),
          },
        ],
      }),
    );
    vi.mocked(setParameterDictionaryEntries).mockImplementation(
      async (_id, request) => ({
        ...current(),
        project: { ...current().project, revision: 3 },
        parameterDictionaries: [
          { ...current().parameterDictionaries[0]!, entries: request.entries },
        ],
      }),
    );
    const execute = vi.fn(async (snapshot) => {
      expect(snapshot.project.revision).toBe(3);
      expect(snapshot.callables[0].parameters[0].authoredExpression).toBe(
        "False",
      );
      expect(
        snapshot.parameterDictionaries[0].entries[0].authoredExpression,
      ).toBe("10");
    });
    await mutations.runWithEditsFlushed(execute);
    expect(execute).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(setCallableParameters).toHaveBeenCalledOnce();
    expect(setParameterDictionaryEntries).toHaveBeenCalledOnce();
    host.dispose();
  });

  it("does not execute stale inputs after a save failure, and allows a retry", async () => {
    const { host, mutations, current, environment } = harness();
    setParameterItemExpression(
      host,
      "callable:one",
      parameterWorkspaceItemID("enabled"),
      "False",
    );
    mutations.scheduleParameterListMutation("callable:one");
    vi.mocked(setCallableParameters).mockRejectedValueOnce(
      new Error("temporarily unavailable"),
    );
    const execute = vi.fn(async (snapshot) => {
      expect(snapshot.callables[0].parameters[0].authoredExpression).toBe(
        "False",
      );
    });
    await expect(mutations.runWithEditsFlushed(execute)).rejects.toThrow(
      "latest inputs could not be saved",
    );
    expect(execute).not.toHaveBeenCalled();
    expect(environment.handleMutationFailure).toHaveBeenCalledOnce();
    vi.mocked(setCallableParameters).mockResolvedValueOnce({
      ...current(),
      project: { ...current().project, revision: 2 },
      callables: [
        {
          ...current().callables[0]!,
          parameters: [providerParameter("enabled", "False")],
        },
      ],
    });
    mutations.scheduleParameterListMutation("callable:one");
    await mutations.runWithEditsFlushed(execute);
    expect(execute).toHaveBeenCalledOnce();
    host.dispose();
  });
});

function harness() {
  const dictionaries = dictionarySnapshot(1, [
    {
      kind: "leaf",
      id: "seed",
      name: "seed",
      authoredExpression: "9",
      ui: CODE_UI,
    },
  ]);
  let snapshot = {
    ...callableSnapshot(1, [providerParameter("enabled", "True")]),
    parameterDictionaries: dictionaries.parameterDictionaries,
    topLevelSectionIds: ["callable:one", "dictionary:options"],
  };
  const host = createWorkspaceHost();
  registerPythonCanvasSectionKinds(host);
  host.loadDocument(projectWorkspaceDocument(snapshot));
  let queue = Promise.resolve();
  const environment: PythonCanvasMutationEnvironment = {
    host,
    currentSnapshot: () => snapshot,
    isActive: () => true,
    enqueue: (operation) => {
      queue = queue.then(operation);
      return queue;
    },
    publishSnapshot: (next) => {
      snapshot = next;
    },
    acceptCanonicalSnapshot: vi.fn(),
    clearCallableCompletionError: vi.fn(),
    clearCallableError: vi.fn(),
    clearDictionaryError: vi.fn(),
    finishCallableMutation: vi.fn(),
    handleMutationFailure: vi.fn(async () => {}),
    isParameterAuthoringPending: () => false,
    persistCallableExpression: vi.fn(async () => null),
    restoreCanonicalProject: vi.fn(),
    retrieveCallableParameters: vi.fn(async () => {}),
    registerPendingSection: vi.fn(),
    setCallableDraft: vi.fn(),
    setParameterAuthoringPending: vi.fn(),
    settlePendingSection: vi.fn(),
    updateAnnouncement: vi.fn(),
    updateCallableMutation: vi.fn(),
    updateDictionaryMutation: vi.fn(),
    updateListMutation: vi.fn(),
  };
  return {
    host,
    environment,
    current: () => snapshot,
    mutations: createPythonCanvasMutations(environment),
  };
}
