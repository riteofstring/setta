import { AgenticEdgeKindEnum, createAgenticEdge } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveAgenticScopeForChatSections,
  resolveAgenticScopeFromEdges,
} from "./agenticScopeUtils";

function sortSet(value: Set<string>): string[] {
  return Array.from(value).sort();
}

describe("resolveAgenticScopeForChatSections", () => {
  it("matches the union of resolveAgenticScopeFromEdges across chat ids", () => {
    const edges = [
      createAgenticEdge({
        id: "edge-1",
        sourceSectionId: "section-a",
        targetSectionId: "chat-1",
        kind: AgenticEdgeKindEnum.section_chat,
      }),
      createAgenticEdge({
        id: "edge-2",
        sourceSectionId: "chat-1",
        targetSectionId: "section-b",
        kind: AgenticEdgeKindEnum.chat_section,
      }),
      createAgenticEdge({
        id: "edge-3",
        sourceSectionId: "chat-1",
        targetSectionId: "chat-2",
        kind: AgenticEdgeKindEnum.chat_chat,
      }),
      createAgenticEdge({
        id: "edge-4",
        sourceSectionId: "section-c",
        targetSectionId: "chat-2",
        kind: AgenticEdgeKindEnum.section_chat,
      }),
    ];
    const chatSectionIds = ["chat-1", "chat-2"];

    const expected = {
      readSectionIds: new Set<string>(),
      writeSectionIds: new Set<string>(),
      contextSectionIds: new Set<string>(),
      peerChatSectionIds: new Set<string>(),
    };
    for (const chatSectionId of chatSectionIds) {
      const scope = resolveAgenticScopeFromEdges(edges, chatSectionId);
      scope.readSectionIds.forEach((id) => expected.readSectionIds.add(id));
      scope.writeSectionIds.forEach((id) => expected.writeSectionIds.add(id));
      scope.contextSectionIds.forEach((id) => expected.contextSectionIds.add(id));
      scope.peerChatSectionIds.forEach((id) => expected.peerChatSectionIds.add(id));
    }

    const scope = resolveAgenticScopeForChatSections(edges, chatSectionIds);
    expect(sortSet(scope.readSectionIds)).toEqual(sortSet(expected.readSectionIds));
    expect(sortSet(scope.writeSectionIds)).toEqual(sortSet(expected.writeSectionIds));
    expect(sortSet(scope.contextSectionIds)).toEqual(
      sortSet(expected.contextSectionIds),
    );
    expect(sortSet(scope.peerChatSectionIds)).toEqual(
      sortSet(expected.peerChatSectionIds),
    );
  });
});

