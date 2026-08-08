import { AgenticEdgeKindEnum, createAgenticEdge } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildAgenticScopeHighlightMaps } from "./agenticScopeHighlights";

describe("buildAgenticScopeHighlightMaps", () => {
  it("keeps peer-chat targets out of the read highlight map", () => {
    // Linked chats should stay discoverable elsewhere, but not as readable sections.
    const maps = buildAgenticScopeHighlightMaps(
      [
        createAgenticEdge({
          id: "edge-read",
          sourceSectionId: "chat-1",
          targetSectionId: "section-a",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
        createAgenticEdge({
          id: "edge-peer",
          sourceSectionId: "chat-1",
          targetSectionId: "chat-2",
          kind: AgenticEdgeKindEnum.chat_chat,
        }),
      ],
      ["chat-1"],
    );

    expect(maps.readMap).toEqual({ "section-a": true });
    expect(maps.writeMap).toEqual({ "section-a": true });
    expect(maps.readMap["chat-2"]).toBeUndefined();
  });
});
