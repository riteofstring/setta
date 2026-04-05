import { getAiFollowSnapshot } from "openapi/http";
import { useAIFollow } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeKindEnum,
  createAIFollowToolArgumentsUpdateContent,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getAiFollowSnapshot: vi.fn(),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

const mockedGetAiFollowSnapshot = vi.mocked(getAiFollowSnapshot);

import {
  receiveAgenticScopeViolationEdges,
  requestAIFollowSnapshot,
} from "./aiFollow";

describe("useAIFollow defaults", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("defaults follow mode to all", () => {
    expect(useAIFollow.getState().mode).toBe("all");
  });
});

describe("receiveAgenticScopeViolationEdges", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetProjectStores();
  });

  it("dedupes edges by projectConfigId/source/target/kind", () => {
    const projectConfigId = "project-1";
    const edgeA = {
      sourceSectionId: "source-a",
      targetSectionId: "target-a",
      kind: AgenticEdgeKindEnum.chat_section,
    };
    const edgeB = {
      sourceSectionId: "source-b",
      targetSectionId: "target-b",
      kind: AgenticEdgeKindEnum.section_chat,
    };

    receiveAgenticScopeViolationEdges({
      projectConfigId,
      edges: [edgeA, edgeA, edgeB],
    });
    receiveAgenticScopeViolationEdges({
      projectConfigId,
      edges: [edgeB, edgeA],
    });

    const stored =
      useAIFollow.getState().scopeViolationEdgesByProjectConfigId[
        projectConfigId
      ];
    expect(stored).toEqual([edgeA, edgeB]);
  });

  it("dedupes chat_chat edges regardless of direction", () => {
    const projectConfigId = "project-1";
    const edgeForward = {
      sourceSectionId: "chat-a",
      targetSectionId: "chat-b",
      kind: AgenticEdgeKindEnum.chat_chat,
    };
    const edgeReverse = {
      sourceSectionId: "chat-b",
      targetSectionId: "chat-a",
      kind: AgenticEdgeKindEnum.chat_chat,
    };

    receiveAgenticScopeViolationEdges({
      projectConfigId,
      edges: [edgeForward],
    });
    receiveAgenticScopeViolationEdges({
      projectConfigId,
      edges: [edgeReverse],
    });

    const stored =
      useAIFollow.getState().scopeViolationEdgesByProjectConfigId[
        projectConfigId
      ];
    expect(stored).toEqual([edgeForward]);
  });
});

describe("requestAIFollowSnapshot", () => {
  beforeEach(() => {
    resetProjectStores();
    mockedGetAiFollowSnapshot.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("hydrates tool argument ids from the Go-owned AI follow snapshot route", async () => {
    mockedGetAiFollowSnapshot.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        createAIFollowToolArgumentsUpdateContent({
          projectConfigId: "project-1",
          chatId: "chat-1",
          idsByType: {
            callableName: ["callable-1"],
          },
        }),
      ],
    });

    await requestAIFollowSnapshot("project-1");

    expect(mockedGetAiFollowSnapshot).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
      },
    });
    expect(
      useAIFollow.getState().toolArgumentsIdsByProjectConfigId["project-1"],
    ).toEqual({
      "chat-1": {
        callableName: ["callable-1"],
      },
    });
  });

  it("ignores empty snapshots from the backend route", async () => {
    mockedGetAiFollowSnapshot.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });

    await requestAIFollowSnapshot("project-1");

    expect(
      useAIFollow.getState().toolArgumentsIdsByProjectConfigId["project-1"],
    ).toBeUndefined();
  });

  it("ignores failed snapshot responses", async () => {
    mockedGetAiFollowSnapshot.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: null,
    });

    await requestAIFollowSnapshot("project-1");

    expect(
      useAIFollow.getState().toolArgumentsIdsByProjectConfigId["project-1"],
    ).toBeUndefined();
  });
});
