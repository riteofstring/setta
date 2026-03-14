import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SettaProjectConfigDiagnostics } from "utils/generatedTypes";

const {
  useProjectState,
  useShareSession,
  useTypeErrors,
  routeTypeCheckMock,
  addTemporaryNotificationMock,
  getCurrProjectConfigIdMock,
} = vi.hoisted(() => {
  function createStore<T extends Record<string, unknown>>(initial: T) {
    const listeners = new Set<(state: T) => void>();
    let state = { ...initial };
    return {
      getState: () => state,
      setState: (next: Partial<T> | ((prev: T) => Partial<T>)) => {
        const patch = typeof next === "function" ? next(state) : next;
        state = { ...state, ...patch };
        for (const listener of listeners) {
          listener(state);
        }
      },
      subscribe: (listener: (state: T) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      reset: () => {
        state = { ...initial };
        listeners.clear();
      },
    };
  }

  return {
    useProjectState: createStore({
      projectConfig: { id: "project-1" },
    }),
    useShareSession: createStore({
      isDeploymentMode: false,
    }),
    useTypeErrors: createStore({
      userRequested: false,
      errors: {} as Record<string, unknown>,
    }),
    routeTypeCheckMock: vi.fn(),
    addTemporaryNotificationMock: vi.fn(),
    getCurrProjectConfigIdMock: vi.fn(() => "project-1"),
  };
});

vi.mock("state/definitions", () => ({
  useProjectState,
  useShareSession,
  useTypeErrors,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_type_check: routeTypeCheckMock,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("./sectionInfos", () => ({
  getCurrProjectConfigId: getCurrProjectConfigIdMock,
}));

import { processTypeErrors, requestTypeCheck } from "./typeCheck";

describe("typeCheck", () => {
  beforeEach(() => {
    useProjectState.reset();
    useShareSession.reset();
    useTypeErrors.reset();
    routeTypeCheckMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    getCurrProjectConfigIdMock.mockReset();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a type-check request for the current project id", async () => {
    await requestTypeCheck();

    expect(routeTypeCheckMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
  });

  it("marks the request as user requested and notifies before posting", async () => {
    await requestTypeCheck(true);

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Checking types...",
    );
    expect(useTypeErrors.getState().userRequested).toBe(true);
    expect(routeTypeCheckMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
  });

  it("skips type-check requests in deployment mode", async () => {
    useShareSession.setState({ isDeploymentMode: true });

    await requestTypeCheck(true);

    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(routeTypeCheckMock).not.toHaveBeenCalled();
  });

  it("does not clear existing errors before applying identical payloads", () => {
    const existingErrors: SettaProjectConfigDiagnostics["errors"] = {
      "section-1": {
        callable: ["Callable error"],
        params: { "param-1": ["Param error"] },
      },
    };
    useTypeErrors.setState({ errors: existingErrors });

    const updates: Array<SettaProjectConfigDiagnostics["errors"]> = [];
    const unsubscribe = useTypeErrors.subscribe((state) => {
      updates.push(state.errors as SettaProjectConfigDiagnostics["errors"]);
    });

    const incoming: SettaProjectConfigDiagnostics = {
      projectConfigId: "project-1",
      isGenCode: true,
      errors: {
        "section-1": {
          callable: ["Callable error"],
          params: { "param-1": ["Param error"] },
        },
      },
    };

    processTypeErrors(incoming);
    unsubscribe();

    const sawEmptyErrors = updates.some(
      (entry) => Object.keys(entry).length === 0,
    );
    expect(sawEmptyErrors).toBe(false);
  });

  describe("immediate clears", () => {
    it("clears errors when payload becomes empty", () => {
      useTypeErrors.setState({
        errors: {
          "section-1": {
            callable: ["Callable error"],
            params: { "param-1": ["Param error"] },
          },
        },
      });

      const emptyPayload: SettaProjectConfigDiagnostics = {
        projectConfigId: "project-1",
        isGenCode: true,
        errors: {},
      };

      processTypeErrors(emptyPayload);

      expect(useTypeErrors.getState().errors).toEqual({});
    });

    it("clears errors when a section disappears but others remain", () => {
      useTypeErrors.setState({
        errors: {
          "section-1": {
            callable: ["Callable error"],
            params: { "param-1": ["Param error"] },
          },
          "section-2": {
            callable: ["Other error"],
            params: {},
          },
        },
      });

      processTypeErrors({
        projectConfigId: "project-1",
        isGenCode: true,
        errors: {
          "section-2": {
            callable: ["Other error"],
            params: {},
          },
        },
      });

      const stateErrors = useTypeErrors.getState()
        .errors as SettaProjectConfigDiagnostics["errors"];
      expect(stateErrors["section-1"]).toBeUndefined();
      expect(stateErrors["section-2"]).toEqual({
        callable: ["Other error"],
        params: {},
      });
    });

    it("clears errors when a section reports an empty error payload", () => {
      useTypeErrors.setState({
        errors: {
          "section-1": {
            callable: ["Callable error"],
            params: { "param-1": ["Param error"] },
          },
          "section-2": {
            callable: ["Other error"],
            params: {},
          },
        },
      });

      processTypeErrors({
        projectConfigId: "project-1",
        isGenCode: true,
        errors: {
          "section-1": {
            callable: [],
            params: {},
          },
          "section-2": {
            callable: ["Other error"],
            params: {},
          },
        },
      });

      const stateErrors = useTypeErrors.getState()
        .errors as SettaProjectConfigDiagnostics["errors"];
      expect(stateErrors["section-1"]).toBeUndefined();
      expect(stateErrors["section-2"]).toEqual({
        callable: ["Other error"],
        params: {},
      });
    });
  });
});
