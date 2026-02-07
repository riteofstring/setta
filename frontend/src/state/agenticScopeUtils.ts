import { AgenticEdgeKindEnum, type AgenticEdge } from "utils/generatedTypes";

type AgenticScope = {
  readSectionIds: Set<string>;
  writeSectionIds: Set<string>;
  contextSectionIds: Set<string>;
  peerChatSectionIds: Set<string>;
};

export function resolveAgenticScopeFromEdges(
  agenticEdges: Array<AgenticEdge>,
  chatSectionId: string,
): AgenticScope {
  const readSectionIds = new Set<string>();
  const writeSectionIds = new Set<string>();
  const contextSectionIds = new Set<string>();
  const peerChatSectionIds = new Set<string>();

  for (const edge of agenticEdges) {
    if (edge.kind === AgenticEdgeKindEnum.section_chat) {
      if (edge.targetSectionId !== chatSectionId) {
        continue;
      }
      readSectionIds.add(edge.sourceSectionId);
      contextSectionIds.add(edge.sourceSectionId);
      continue;
    }
    if (edge.kind === AgenticEdgeKindEnum.chat_section) {
      if (edge.sourceSectionId !== chatSectionId) {
        continue;
      }
      readSectionIds.add(edge.targetSectionId);
      writeSectionIds.add(edge.targetSectionId);
      continue;
    }
    if (edge.kind === AgenticEdgeKindEnum.chat_chat) {
      if (edge.sourceSectionId === chatSectionId) {
        peerChatSectionIds.add(edge.targetSectionId);
      } else if (edge.targetSectionId === chatSectionId) {
        peerChatSectionIds.add(edge.sourceSectionId);
      }
    }
  }

  return {
    readSectionIds,
    writeSectionIds,
    contextSectionIds,
    peerChatSectionIds,
  };
}

export function resolveAgenticScopeForChatSections(
  agenticEdges: Array<AgenticEdge>,
  chatSectionIds: Iterable<string>,
): AgenticScope {
  const readSectionIds = new Set<string>();
  const writeSectionIds = new Set<string>();
  const contextSectionIds = new Set<string>();
  const peerChatSectionIds = new Set<string>();

  for (const chatSectionId of chatSectionIds) {
    const scope = resolveAgenticScopeFromEdges(agenticEdges, chatSectionId);
    scope.readSectionIds.forEach((id) => readSectionIds.add(id));
    scope.writeSectionIds.forEach((id) => writeSectionIds.add(id));
    scope.contextSectionIds.forEach((id) => contextSectionIds.add(id));
    scope.peerChatSectionIds.forEach((id) => peerChatSectionIds.add(id));
  }

  return {
    readSectionIds,
    writeSectionIds,
    contextSectionIds,
    peerChatSectionIds,
  };
}

export function buildSectionIdLookup(
  ids: Iterable<string>,
): Record<string, true> {
  const map: Record<string, true> = {};
  for (const id of ids) {
    map[id] = true;
  }
  return map;
}
