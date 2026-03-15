import { describe, expect, it } from "vitest";

import {
  buildProjectChatAuxTabs,
  buildProjectChatConversationSearchCounterText,
  getProjectChatReturnTooltipContent,
  getProjectChatThreadsTooltipContent,
  resolveProjectChatConversationSearchIndexAfterCountChange,
  resolveProjectChatConversationSearchIndexAfterQueryChange,
} from "./projectChatSurfaceViewModel";

describe("buildProjectChatAuxTabs", () => {
  it("marks only the active aux tab for the selected view", () => {
    const tabs = buildProjectChatAuxTabs("mcp");

    expect(
      tabs.map((tab) => ({
        id: tab.id,
        active: tab.active,
      })),
    ).toEqual([
      { id: "skills", active: false },
      { id: "mcp", active: true },
      { id: "slash_commands", active: false },
      { id: "ai_settings", active: false },
    ]);
  });
});

describe("getProjectChatReturnTooltipContent", () => {
  it("describes the current aux surface when one is open", () => {
    expect(getProjectChatReturnTooltipContent("skills")).toBe(
      "Leave Skills and reopen chat.",
    );
    expect(getProjectChatReturnTooltipContent("ai_settings")).toBe(
      "Leave AI Settings and reopen chat.",
    );
  });

  it("falls back to the threads-only copy when no aux surface is active", () => {
    expect(getProjectChatReturnTooltipContent("none")).toBe(
      "Close threads-only view and reopen chat.",
    );
  });
});

describe("getProjectChatThreadsTooltipContent", () => {
  it("switches copy based on whether inline threads are visible", () => {
    expect(getProjectChatThreadsTooltipContent(true)).toBe(
      "Collapse the threads list.",
    );
    expect(getProjectChatThreadsTooltipContent(false)).toBe(
      "Open the threads list.",
    );
  });
});

describe("project chat conversation search counters", () => {
  it("starts at the first match when a new query produces results", () => {
    expect(
      resolveProjectChatConversationSearchIndexAfterQueryChange({
        hasConversationSearchTerms: true,
        conversationSearchMatchCount: 3,
        currentIndex: null,
      }),
    ).toBe(0);
  });

  it("clears the active match when the query has no active terms", () => {
    expect(
      resolveProjectChatConversationSearchIndexAfterQueryChange({
        hasConversationSearchTerms: false,
        conversationSearchMatchCount: 2,
        currentIndex: 1,
      }),
    ).toBeNull();
  });

  it("clamps the active match when the result count shrinks", () => {
    expect(
      resolveProjectChatConversationSearchIndexAfterCountChange({
        conversationSearchMatchCount: 2,
        currentIndex: 3,
      }),
    ).toBe(1);
  });

  it("formats the counter text from the active match and result count", () => {
    expect(
      buildProjectChatConversationSearchCounterText({
        conversationSearchMatchCount: 4,
        conversationSearchMatchIndex: 1,
      }),
    ).toBe("2/4");
    expect(
      buildProjectChatConversationSearchCounterText({
        conversationSearchMatchCount: 0,
        conversationSearchMatchIndex: null,
      }),
    ).toBe("0/0");
  });
});
