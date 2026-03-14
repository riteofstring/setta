import { ProjectSearchModeEnum } from "utils/constants/projectSearch";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetProjectStores } from "../utils";
import {
  useEdgeHandleRegistry,
  useListenerCoverage,
  useProjectSearch,
  useRenameRefactors,
  useWaitingForLSPResult,
} from "./authoringStores";

describe("authoringStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("starts workflow stores with empty listener, rename, and lsp state", () => {
    expect(useListenerCoverage.getState().byProjectId).toEqual({});
    expect(useRenameRefactors.getState()).toEqual({
      byOpId: {},
      queue: [],
      readyOpIds: {},
      reset: expect.any(Function),
    });
    expect(useWaitingForLSPResult.getState()).toEqual({
      textFields: {},
      parametersRequest: {},
      reset: expect.any(Function),
    });
  });

  it("starts project-search and edge-handle stores with their default state", () => {
    expect(useProjectSearch.getState()).toEqual({
      codeInfo: [],
      focused: null,
      lookup: new Set(),
      mode: ProjectSearchModeEnum.find,
      reset: expect.any(Function),
    });
    expect(useEdgeHandleRegistry.getState()).toEqual({
      handles: {},
      positions: {},
      reset: expect.any(Function),
    });
  });
});
