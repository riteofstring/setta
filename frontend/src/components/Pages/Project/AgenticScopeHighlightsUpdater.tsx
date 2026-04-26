import _ from "lodash";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useUpdateAgenticScopeHighlights } from "state/hooks/agenticScopeHighlights";

export function AgenticScopeHighlightsUpdater() {
  const {
    agenticEdges,
    topLevelSectionIds,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
    projectConfigId,
  } = useProjectState(
    (state) => ({
      agenticEdges: state.projectConfig.agenticEdges,
      topLevelSectionIds: Object.keys(state.projectConfig.topLevelSections),
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      projectConfigId: state.projectConfig.id,
    }),
    _.isEqual,
  );
  const activeIds = useActiveSectionUI((state) => state.activeIds);

  useUpdateAgenticScopeHighlights({
    projectConfigId,
    agenticEdges: agenticEdges ?? [],
    activeIds,
    topLevelSectionIds,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  });

  return null;
}
