import _ from "lodash";
import React from "react";
import { getSectionOrThrow, isGroupSection } from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import { Container } from "./ContainerCore";
import { SectionContainerCore } from "./SectionContainerCore";

// The reference's `SectionContainer`, cut at the view-mode and app-feature seams: visibility
// gating, the joined code+terminal branch, and codegen-target hiding stayed application-side.
// A leaf renders its shell; a group renders its nested children through the same component
// recursively, exactly like the reference's `MaybeManyNestedSections` tree.
function SectionContainerComponent({ sectionId }: { sectionId: string }) {
  const isGroup = useWorkspaceDocument((x) => isGroupSection(getSectionOrThrow(x, sectionId)));

  return (
    <Container isGroup={isGroup} sectionId={sectionId}>
      {isGroup ? (
        <NestedSections sectionId={sectionId} />
      ) : (
        <SectionContainerCore sectionId={sectionId} />
      )}
    </Container>
  );
}

export const SectionContainer = React.memo(SectionContainerComponent);

function NestedSections({ sectionId }: { sectionId: string }) {
  const childIds = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId).children, _.isEqual);
  const isHorizontalOrientation = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return isGroupSection(section) && section.isHorizontalOrientation;
  });

  if (childIds.length === 0) {
    return null;
  }

  const containerClassName = isHorizontalOrientation
    ? "mt-2 flex flex-row items-start gap-2"
    : "mt-2 flex flex-col items-start gap-2";

  return (
    <div className="flex flex-col">
      <div className="flex items-stretch">
        <div className={containerClassName}>
          {childIds.map((childId) => (
            <NestedSectionSlot sectionId={childId} key={`Nested-Sec-${childId}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// The static shape of the reference's `SortableSectionContainer` wrapper; its sortable
// transform, transition, and drag listeners arrive with the dnd batch.
function NestedSectionSlot({ sectionId }: { sectionId: string }) {
  return (
    <div
      className="relative flex w-full outline-none"
      data-sortable-section-id={sectionId}
      tabIndex={-1}
    >
      <SectionContainer sectionId={sectionId} />
    </div>
  );
}
