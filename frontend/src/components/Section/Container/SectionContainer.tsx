import _ from "lodash";
import React from "react";
import {
  getSectionShouldRender,
  getSectionType,
  getSectionViewingEditingModeVisibility,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { UITypeNameSchema } from "utils/generatedTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, isTopLevel, dragListeners }) {
  const { visibility, viewingEditingMode, isGroup } = useProjectState((x) => {
    const { visibility, viewingEditingMode } =
      getSectionViewingEditingModeVisibility(sectionId, x);
    return {
      visibility,
      viewingEditingMode,
      isGroup: getSectionType(sectionId, x) === UITypeNameSchema.enum.GROUP,
    };
  });

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
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
