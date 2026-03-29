import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SettaProjectConfigDiagnostics } from "utils/generatedTypes";

const { useProjectState, useTypeErrors } = vi.hoisted(() => {
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
    useTypeErrors: createStore({
      userRequested: false,
      errors: {} as Record<string, unknown>,
    }),
  };
});

vi.mock("state/definitions", () => ({
  useProjectState,
  useTypeErrors,
}));

import { processTypeErrors } from "./typeCheck";

describe("typeCheck", () => {
  beforeEach(() => {
    useProjectState.reset();
    useTypeErrors.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it("normalizes null callable and params fields instead of crashing", () => {
      const malformedPayload = JSON.parse(`{
        "projectConfigId": "project-1",
        "isGenCode": true,
        "errors": {
          "section-1": {
            "callable": null,
            "params": null
          },
          "section-2": {
            "callable": [],
            "params": {
              "param-1": ["Param error"]
            }
          }
        }
      }`) as SettaProjectConfigDiagnostics;

      processTypeErrors(malformedPayload);

      expect(useTypeErrors.getState().errors).toEqual({
        "section-2": {
          callable: [],
          params: {
            "param-1": ["Param error"],
          },
        },
      });
    });
  });
});
