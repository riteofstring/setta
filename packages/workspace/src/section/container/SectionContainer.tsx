import _ from "lodash";
import React from "react";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import { canWorkspaceSectionOwnNestedSections } from "../../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../../document/stores";
import { useWorkspaceHost } from "../../workspaceHostContext";
import type { SectionDragListeners } from "./ContainerCore";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

// The reference's `SectionContainer`, cut at the view-mode and app-feature seams: visibility
// gating, the joined code+terminal branch, and codegen-target hiding stayed application-side.
// A group retains its package-owned chrome. A registered ordinary container instead renders its
// normal shell followed by the shared live-DnD vertical child projection, with no group chrome or
// group-only controls.
function SectionContainerComponent({
  sectionId,
  isTopLevel = false,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel?: boolean;
  dragListeners?: SectionDragListeners;
}) {
  const host = useWorkspaceHost();
  const isGroup = useWorkspaceDocument((x) =>
    isGroupSection(getSectionOrThrow(x, sectionId)),
  );
  const canOwnNestedSections = useWorkspaceDocument((x) =>
    canWorkspaceSectionOwnNestedSections(host, getSectionOrThrow(x, sectionId)),
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
        <>
          <SectionContainerCore sectionId={sectionId} />
          {canOwnNestedSections ? (
            <MaybeManyNestedSections sectionId={sectionId} />
          ) : null}
        </>
      )}
    </ContainerSwitch>
  );
}

export const SectionContainer = React.memo(SectionContainerComponent, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
