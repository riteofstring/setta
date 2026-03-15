import { useAIFollow } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import { AgenticEdgeKindEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  receiveAgenticScopeViolationEdges,
  receiveAIFollowToolResultUpdate,
} from "./aiFollowHighlights";

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

describe("aiFollowHighlights", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetProjectStores();
  });

  it("dedupes tool-result highlights and clears them after the timeout", () => {
    receiveAIFollowToolResultUpdate({
      projectConfigId: "project-1",
      chatId: "chat-1",
      idsByType: {
        section: ["section-1", "section-1"],
      },
    });

    expect(
      useAIFollow.getState().toolResultIdsByProjectConfigId["project-1"]?.[
        "chat-1"
      ],
    ).toEqual({
      section: ["section-1"],
    });

    vi.advanceTimersByTime(2000);

    expect(
      useAIFollow.getState().toolResultIdsByProjectConfigId["project-1"]?.[
        "chat-1"
      ],
    ).toBeUndefined();
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
