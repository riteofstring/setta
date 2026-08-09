import { describe, expect, it } from "vitest";
import { buildGroupedThreadSections } from "./projectChatHistoryDerived";

describe("buildGroupedThreadSections", () => {
  it("keeps pinned threads first and honors stored thread order within a group", () => {
    const result = buildGroupedThreadSections({
      draftGroupId: null,
      pinnedThreadIds: ["thread-2"],
      visibleSortedEntries: [
        {
          chatId: "thread-1",
          label: "First",
          nameSource: null,
          lastUpdatedMs: 10,
          waitingForResponse: false,
          runType: "llm_chat",
          engineConfigId: null,
        },
        {
          chatId: "thread-2",
          label: "Second",
          nameSource: null,
          lastUpdatedMs: 20,
          waitingForResponse: false,
          runType: "llm_chat",
          engineConfigId: null,
        },
        {
          chatId: "thread-3",
          label: "Ungrouped",
          nameSource: null,
          lastUpdatedMs: 30,
          waitingForResponse: false,
          runType: "llm_chat",
          engineConfigId: null,
        },
      ],
      threadAssignments: {
        "thread-1": "group-a",
        "thread-2": "group-a",
      },
      threadGroups: [
        {
          id: "group-a",
          name: "Group A",
          collapsed: false,
        },
      ],
      threadOrderIds: ["thread-1", "thread-2"],
    });

    expect(result.groupSections).toHaveLength(1);
    expect(
      result.groupSections[0]?.entries.map((entry) => entry.chatId),
    ).toEqual(["thread-2", "thread-1"]);
    expect(result.ungroupedEntries.map((entry) => entry.chatId)).toEqual([
      "thread-3",
    ]);
  });
});
