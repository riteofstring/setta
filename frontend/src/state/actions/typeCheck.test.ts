import { useProjectState, useTypeErrors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  type SettaProjectConfigDiagnostics,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processTypeErrors } from "./typeCheck";

describe("processTypeErrors", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({ id: "project-1" }),
    });
  });

  afterEach(() => {
    resetProjectStores();
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
      updates.push(state.errors);
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

      expect(useTypeErrors.getState().errors["section-1"]).toBeUndefined();
      expect(useTypeErrors.getState().errors["section-2"]).toEqual({
        callable: ["Other error"],
        params: {},
      });
    });
  });
});
