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
      scope.contextSectionIds.forEach((id) =>
        expected.contextSectionIds.add(id),
      );
      scope.peerChatSectionIds.forEach((id) =>
        expected.peerChatSectionIds.add(id),
      );
    }

    const scope = resolveAgenticScopeForChatSections(edges, chatSectionIds);
    expect(sortSet(scope.readSectionIds)).toEqual(
      sortSet(expected.readSectionIds),
    );
    expect(sortSet(scope.writeSectionIds)).toEqual(
      sortSet(expected.writeSectionIds),
    );
    expect(sortSet(scope.contextSectionIds)).toEqual(
      sortSet(expected.contextSectionIds),
    );
    expect(sortSet(scope.peerChatSectionIds)).toEqual(
      sortSet(expected.peerChatSectionIds),
    );
  });

  it("includes only direct outgoing edges from the active chat section", () => {
    const edges = [
      createAgenticEdge({
        id: "edge-incoming-section",
        sourceSectionId: "section-incoming",
        targetSectionId: "chat-1",
        kind: AgenticEdgeKindEnum.section_chat,
      }),
      createAgenticEdge({
        id: "edge-incoming-chat",
        sourceSectionId: "chat-2",
        targetSectionId: "chat-1",
        kind: AgenticEdgeKindEnum.chat_chat,
      }),
      createAgenticEdge({
        id: "edge-outgoing-chat",
        sourceSectionId: "chat-1",
        targetSectionId: "chat-3",
        kind: AgenticEdgeKindEnum.chat_chat,
      }),
      createAgenticEdge({
        id: "edge-outgoing-section",
        sourceSectionId: "chat-1",
        targetSectionId: "section-outgoing",
        kind: AgenticEdgeKindEnum.chat_section,
      }),
      createAgenticEdge({
        id: "edge-other-chat",
        sourceSectionId: "chat-2",
        targetSectionId: "section-other",
        kind: AgenticEdgeKindEnum.chat_section,
      }),
    ];

    const scope = resolveAgenticScopeFromEdges(edges, "chat-1");
    expect(sortSet(scope.readSectionIds)).toEqual(["section-outgoing"]);
    expect(sortSet(scope.writeSectionIds)).toEqual(["section-outgoing"]);
    expect(sortSet(scope.contextSectionIds)).toEqual(["section-outgoing"]);
    expect(sortSet(scope.peerChatSectionIds)).toEqual(["chat-3"]);
  });

  it("recomputes scope from the latest edge edits", () => {
    const baseEdge = createAgenticEdge({
      id: "edge-chat-section",
      sourceSectionId: "chat-1",
      targetSectionId: "section-a",
      kind: AgenticEdgeKindEnum.chat_section,
    });
    const peerEdge = createAgenticEdge({
      id: "edge-chat-peer",
      sourceSectionId: "chat-1",
      targetSectionId: "chat-2",
      kind: AgenticEdgeKindEnum.chat_chat,
    });

    const initialScope = resolveAgenticScopeFromEdges([baseEdge], "chat-1");
    expect(sortSet(initialScope.readSectionIds)).toEqual(["section-a"]);
    expect(sortSet(initialScope.peerChatSectionIds)).toEqual([]);

    const editedScope = resolveAgenticScopeFromEdges(
      [{ ...baseEdge, targetSectionId: "section-b" }],
      "chat-1",
    );
    expect(sortSet(editedScope.readSectionIds)).toEqual(["section-b"]);
    expect(sortSet(editedScope.writeSectionIds)).toEqual(["section-b"]);
    expect(sortSet(editedScope.contextSectionIds)).toEqual(["section-b"]);

    const withPeerScope = resolveAgenticScopeFromEdges(
      [{ ...baseEdge, targetSectionId: "section-b" }, peerEdge],
      "chat-1",
    );
    expect(sortSet(withPeerScope.peerChatSectionIds)).toEqual(["chat-2"]);

    const clearedScope = resolveAgenticScopeFromEdges([], "chat-1");
    expect(sortSet(clearedScope.readSectionIds)).toEqual([]);
    expect(sortSet(clearedScope.writeSectionIds)).toEqual([]);
    expect(sortSet(clearedScope.contextSectionIds)).toEqual([]);
    expect(sortSet(clearedScope.peerChatSectionIds)).toEqual([]);
  });
});
