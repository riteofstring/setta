import { useEffect, useMemo } from "react";
import {
  buildSectionIdLookup,
  resolveAgenticScopeForChatSections,
} from "state/agenticScopeUtils";
import type { ZustandProjectState } from "state/definitions";
import { useAgenticScopeHighlights } from "state/stores/aiStores";
import type { AgenticEdge } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";

type AgenticScopeHighlightInputs = {
  projectConfigId: string;
  agenticEdges: Array<AgenticEdge>;
  activeIds: Array<string>;
  topLevelSectionIds: Array<string>;
  sectionVariantMap: Record<string, string>;
  sectionVariants: ZustandProjectState["sectionVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
};

export function useUpdateAgenticScopeHighlights(
  inputs: AgenticScopeHighlightInputs,
): void {
  const {
    projectConfigId,
    agenticEdges,
    activeIds,
    topLevelSectionIds,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  } = inputs;

  const activeChatSectionIds = useMemo(() => {
    const chatSectionIds = new Set<string>();
    const resolveImpl = (sectionId: string) => {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        return null;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        return null;
      }
      return sectionImpls[variant.impl] ?? null;
    };
    for (const sectionId of activeIds) {
      const impl = resolveImpl(sectionId);
      if (impl?.type === SectionTypeEnum.Chat) {
        chatSectionIds.add(sectionId);
      }
    }
    for (const sectionId of topLevelSectionIds) {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (!impl) {
        continue;
      }
      if (impl.type === SectionTypeEnum.Chat && impl.waitingForResponse) {
        chatSectionIds.add(sectionId);
      }
    }
    return Array.from(chatSectionIds);
  }, [
    activeIds,
    sectionImpls,
    sectionVariantMap,
    sectionVariants,
    topLevelSectionIds,
  ]);

  const highlightMaps = useMemo(() => {
    return buildAgenticScopeHighlightMaps(agenticEdges, activeChatSectionIds);
  }, [activeChatSectionIds, agenticEdges]);

  useEffect(() => {
    useAgenticScopeHighlights.setState((state) => {
      if (Object.keys(highlightMaps.readMap).length === 0) {
        delete state.readSectionIdsByProjectConfigId[projectConfigId];
      } else {
        state.readSectionIdsByProjectConfigId[projectConfigId] =
          highlightMaps.readMap;
      }
      if (Object.keys(highlightMaps.writeMap).length === 0) {
        delete state.writeSectionIdsByProjectConfigId[projectConfigId];
      } else {
        state.writeSectionIdsByProjectConfigId[projectConfigId] =
          highlightMaps.writeMap;
      }
    });
  }, [highlightMaps, projectConfigId]);
}

export function buildAgenticScopeHighlightMaps(
  agenticEdges: Array<AgenticEdge>,
  activeChatSectionIds: Array<string>,
): {
  readMap: Record<string, true>;
  writeMap: Record<string, true>;
} {
  if (activeChatSectionIds.length === 0) {
    return { readMap: {}, writeMap: {} };
  }
  const scope = resolveAgenticScopeForChatSections(
    agenticEdges,
    activeChatSectionIds,
  );
  return {
    readMap: buildSectionIdLookup(scope.readSectionIds),
    writeMap: buildSectionIdLookup(scope.writeSectionIds),
  };
}
