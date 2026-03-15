import { useAIFollow } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import { AgenticEdgeKindEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { receiveAgenticScopeViolationEdges } from "./aiFollow";

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
