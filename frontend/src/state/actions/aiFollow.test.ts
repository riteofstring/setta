import { useAIFollow } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { AgenticEdgeKindEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { receiveAgenticScopeViolationEdges } from "./aiFollow";

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
});
