import _ from "lodash";
import React from "react";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import type { SectionDragListeners } from "./ContainerCore";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

// The reference's `SectionContainer`, cut at the view-mode and app-feature seams: visibility
// gating, the joined code+terminal branch, and codegen-target hiding stayed application-side.
// A leaf renders its shell; a group renders its nested children from the live dnd children
// projection through the group's sortable context.
function SectionContainerComponent({
  sectionId,
  isTopLevel = false,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel?: boolean;
  dragListeners?: SectionDragListeners;
}) {
  const isGroup = useWorkspaceDocument((x) =>
    isGroupSection(getSectionOrThrow(x, sectionId)),
  );

  return (
    <ContainerSwitch
      isGroup={isGroup}
      sectionId={sectionId}
      dragListeners={dragListeners}
      isTopLevel={isTopLevel}
    >
      {isGroup ? (
        <MaybeManyNestedSections sectionId={sectionId} />
      ) : (
        <SectionContainerCore sectionId={sectionId} />
      )}
    </ContainerSwitch>
  );
}

export const SectionContainer = React.memo(SectionContainerComponent, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
