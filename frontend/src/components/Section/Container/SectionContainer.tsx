import { NodeIdProvider } from "forks/xyflow/core/contexts/NodeIdContext";
import _ from "lodash";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({
  sectionId,
  isTopLevel,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: any;
}) {
  const { visibility, isEditingViewMode, isGroup, isUserView } =
    useProjectState((x) => {
      const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
        sectionId,
        x,
      );
      const viewMode = getActiveViewModeConfig(x);
      const impl = getCurrEffectiveSectionImpl(x, sectionId);
      return {
        visibility,
        isEditingViewMode,
        isUserView: viewMode.isUserFacing && !isEditingViewMode,
        isGroup: impl.type === SectionTypeEnum.Group,
      };
    }, _.isEqual);

  if (!getSectionShouldRender(visibility, isEditingViewMode)) {
    return null;
  }

  return (
    <NodeIdProvider value={sectionId}>
      <ContainerSwitch
        isGroup={isGroup}
        sectionId={sectionId}
        dragListeners={dragListeners}
        isTopLevel={isTopLevel}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
      >
        {!isGroup && (
          <SectionContainerCore sectionId={sectionId} isUserView={isUserView} />
        )}
        <MaybeManyNestedSections sectionId={sectionId} isGroup={isGroup} />
      </ContainerSwitch>
    </NodeIdProvider>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
