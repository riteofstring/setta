import { useEffect, useMemo } from "react";
import {
  buildSectionIdLookup,
  resolveAgenticScopeForChatSections,
} from "state/agenticScopeUtils";
import type { ZustandProjectState } from "state/definitions";
import { useAgenticScopeHighlights } from "state/definitions";
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

type AgenticScopeSectionLookup = Pick<
  AgenticScopeHighlightInputs,
  "sectionVariantMap" | "sectionVariants" | "sectionImpls"
>;

type AgenticScopeSectionImpl =
  | ZustandProjectState["sectionImpls"][string]
  | null;

function resolveAgenticScopeSectionImpl(
  sectionId: string,
  lookup: AgenticScopeSectionLookup,
): AgenticScopeSectionImpl {
  const variantId = lookup.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = lookup.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  return lookup.sectionImpls[variant.impl] ?? null;
}

function isChatSectionImpl(impl: AgenticScopeSectionImpl): boolean {
  return impl?.type === SectionTypeEnum.Chat;
}

function isWaitingChatSectionImpl(impl: AgenticScopeSectionImpl): boolean {
  return impl?.type === SectionTypeEnum.Chat && impl.waitingForResponse;
}

function collectMatchingSectionIds(
  sectionIds: Array<string>,
  lookup: AgenticScopeSectionLookup,
  predicate: (impl: AgenticScopeSectionImpl) => boolean,
): Array<string> {
  const matchingSectionIds: Array<string> = [];
  for (const sectionId of sectionIds) {
    if (predicate(resolveAgenticScopeSectionImpl(sectionId, lookup))) {
      matchingSectionIds.push(sectionId);
    }
  }
  return matchingSectionIds;
}

function resolveActiveChatSectionIds(
  inputs: Pick<
    AgenticScopeHighlightInputs,
    | "activeIds"
    | "topLevelSectionIds"
    | "sectionVariantMap"
    | "sectionVariants"
    | "sectionImpls"
  >,
): Array<string> {
  const lookup: AgenticScopeSectionLookup = {
    sectionVariantMap: inputs.sectionVariantMap,
    sectionVariants: inputs.sectionVariants,
    sectionImpls: inputs.sectionImpls,
  };
  return Array.from(
    new Set([
      ...collectMatchingSectionIds(inputs.activeIds, lookup, isChatSectionImpl),
      ...collectMatchingSectionIds(
        inputs.topLevelSectionIds,
        lookup,
        isWaitingChatSectionImpl,
      ),
    ]),
  );
}

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

  const activeChatSectionIds = useMemo(
    () =>
      resolveActiveChatSectionIds({
        activeIds,
        topLevelSectionIds,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      }),
    [
      activeIds,
      sectionImpls,
      sectionVariantMap,
      sectionVariants,
      topLevelSectionIds,
    ],
  );

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

function buildAgenticScopeHighlightMaps(
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
