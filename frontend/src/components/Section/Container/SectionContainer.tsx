import _ from "lodash";
import React from "react";
import {
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewingEditingModeVisibility,
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
  const { visibility, viewingEditingMode, isGroup } = useProjectState((x) => {
    const { visibility, viewingEditingMode } =
      getSectionViewingEditingModeVisibility(sectionId, x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      visibility,
      viewingEditingMode,
      isGroup: impl.type === SectionTypeEnum.Group,
    };
  }, _.isEqual);

  if (!getSectionShouldRender(visibility, viewingEditingMode)) {
    return null;
  }

  return (
    <ContainerSwitch
      isGroup={isGroup}
      sectionId={sectionId}
      dragListeners={dragListeners}
      isTopLevel={isTopLevel}
      visibility={visibility}
      viewingEditingMode={viewingEditingMode}
    >
      {!isGroup && (
        <SectionContainerCore
          sectionId={sectionId}
          viewingEditingMode={viewingEditingMode}
        />
      )}
      <MaybeManyNestedSections sectionId={sectionId} isGroup={isGroup} />
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, () => true);
