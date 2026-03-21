import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DependencyKeyTypeEnum,
  createListenerCoverageSnapshot,
} from "utils/generatedTypes";

const { useListenerCoverage, routeGetListenerCoverageMock } = vi.hoisted(() => {
  function createStore<T extends { byProjectId: Record<string, unknown> }>(
    initial: T,
  ) {
    let state = {
      ...initial,
      byProjectId: { ...initial.byProjectId },
    };
    return {
      getState: () => state,
      setState: (next: Partial<T> | ((prev: T) => Partial<T> | void)) => {
        if (typeof next === "function") {
          const draft = {
            ...state,
            byProjectId: { ...state.byProjectId },
          } as T;
          const patch = next(draft);
          state =
            patch === undefined
              ? draft
              : ({ ...draft, ...patch } as typeof state);
          return;
        }
        state = { ...state, ...next };
      },
      reset: () => {
        state = {
          ...initial,
          byProjectId: { ...initial.byProjectId },
        };
      },
    };
  }

  return {
    useListenerCoverage: createStore({
      byProjectId: {} as Record<string, unknown>,
    }),
    routeGetListenerCoverageMock: vi.fn(),
  };
});

vi.mock("state/definitions", () => ({
  NULL_PROJECT_CONFIG_ID: "null-project-config-id",
  useListenerCoverage,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_get_listener_coverage: routeGetListenerCoverageMock,
}));

import {
  applyListenerCoverageSnapshot,
  dependencyKeyCovered,
  fetchListenerCoverageSnapshot,
  getListenerCoverageRecord,
} from "./listenerCoverage";

describe("listenerCoverage", () => {
  beforeEach(() => {
    useListenerCoverage.reset();
    routeGetListenerCoverageMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores section and param dependencies under stable lookup keys", () => {
    applyListenerCoverageSnapshot(
      createListenerCoverageSnapshot({
        projectConfigId: "project-1",
        dependencies: [
          {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "section-a",
          },
          {
            type: DependencyKeyTypeEnum.SectionParam,
            sectionId: "section-b",
            codeObjId: "param-b",
          },
        ],
        hasRealtimeWildcard: false,
      }),
    );

    expect(getListenerCoverageRecord("project-1")).toEqual({
      hasRealtimeWildcard: false,
      dependenciesByKey: {
        "section-a::": {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-a",
        },
        "section-b::param-b": {
          type: DependencyKeyTypeEnum.SectionParam,
          sectionId: "section-b",
          codeObjId: "param-b",
        },
      },
    });
    expect(
      dependencyKeyCovered("project-1", {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-a",
      }),
    ).toBe(true);
    expect(
      dependencyKeyCovered("project-1", {
        type: DependencyKeyTypeEnum.SectionParam,
        sectionId: "section-b",
        codeObjId: "param-b",
      }),
    ).toBe(true);
    expect(
      dependencyKeyCovered("project-1", {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-missing",
      }),
    ).toBe(false);
  });

  it("treats wildcard coverage as covering every dependency key", () => {
    applyListenerCoverageSnapshot(
      createListenerCoverageSnapshot({
        projectConfigId: "project-1",
        dependencies: [],
        hasRealtimeWildcard: true,
      }),
    );

    expect(
      dependencyKeyCovered("project-1", {
        type: DependencyKeyTypeEnum.SectionParam,
        sectionId: "section-a",
        codeObjId: "param-a",
      }),
    ).toBe(true);
  });

  it("skips coverage fetches when no project is selected", async () => {
    await fetchListenerCoverageSnapshot("null-project-config-id");

    expect(routeGetListenerCoverageMock).not.toHaveBeenCalled();
  });

  it("fetches and stores the current listener coverage snapshot", async () => {
    routeGetListenerCoverageMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        projectConfigId: "project-1",
        dependencies: [
          {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "section-a",
          },
        ],
        hasRealtimeWildcard: false,
      },
    });

    await fetchListenerCoverageSnapshot("project-1");

    expect(routeGetListenerCoverageMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(getListenerCoverageRecord("project-1")).toEqual({
      hasRealtimeWildcard: false,
      dependenciesByKey: {
        "section-a::": {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-a",
        },
      },
    });
  });
});
