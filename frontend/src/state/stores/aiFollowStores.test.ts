import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetProjectStores } from "../utils";
import {
  useAgenticScopeHighlights,
  useAIFollow,
  useToolArgumentPreview,
} from "./aiFollowStores";

describe("aiFollowStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("starts ai follow with empty selections and transitions disabled", () => {
    expect(useAIFollow.getState()).toEqual({
      mode: "all",
      isFollowTransitioning: false,
      toolArgumentsIdsByProjectConfigId: {},
      toolResultIdsByProjectConfigId: {},
      selectedChatIdsByProjectConfigId: {},
      selectedSectionIdsByProjectConfigId: {},
      scopeViolationEdgesByProjectConfigId: {},
      reset: expect.any(Function),
    });
  });

  it("starts scope highlights and tool previews empty", () => {
    expect(useAgenticScopeHighlights.getState()).toEqual({
      readSectionIdsByProjectConfigId: {},
      writeSectionIdsByProjectConfigId: {},
      reset: expect.any(Function),
    });
    expect(useToolArgumentPreview.getState()).toEqual({
      byProjectConfigId: {},
      reset: expect.any(Function),
    });
  });
});
