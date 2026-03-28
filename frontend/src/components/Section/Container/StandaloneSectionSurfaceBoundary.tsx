import React, { type ComponentProps } from "react";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import { SectionWindowSurface } from "./SectionWindowSurface";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

type StandaloneSectionSurfaceBoundaryProps = Pick<
  ComponentProps<typeof SectionWindowSurface>,
  "onProjectChatBlockedErrorCodeChange" | "projectChatSurfaceId" | "sectionId"
> & {
  sectionType: SectionType;
  renderDictArea: (props: SectionContainerAreaDictProps) => React.ReactNode;
};

function StandaloneSectionNestedSectionsBody({
  sectionId,
  sectionType,
}: Pick<StandaloneSectionSurfaceBoundaryProps, "sectionId" | "sectionType">) {
  if (
    sectionType !== SectionTypeEnum.Group &&
    sectionType !== SectionTypeEnum.ListRoot
  ) {
    return null;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <SectionContainerNestedSections
        sectionId={sectionId}
        isGroup={sectionType === SectionTypeEnum.Group}
        isJoinedCodeTerminalGroup={false}
        renderCoreBody={renderDefaultSectionContainerCoreBody}
        renderNestedSections={renderDefaultSectionContainerNestedSections}
      />
    </div>
  );
}

function _StandaloneSectionSurfaceBoundary({
  sectionId,
  sectionType,
  projectChatSurfaceId,
  onProjectChatBlockedErrorCodeChange,
  renderDictArea,
}: StandaloneSectionSurfaceBoundaryProps) {
  const bodyOverride =
    sectionType === SectionTypeEnum.Group ||
    sectionType === SectionTypeEnum.ListRoot ? (
      <StandaloneSectionNestedSectionsBody
        sectionId={sectionId}
        sectionType={sectionType}
      />
    ) : undefined;

  return (
    <SectionWindowSurface
      sectionId={sectionId}
      headerActions={null}
      roundedClassName="rounded-none"
      chatHost="standalone_page"
      projectChatSurfaceId={projectChatSurfaceId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
      bodyOverride={bodyOverride}
      renderDictArea={renderDictArea}
    />
  );
}

export const StandaloneSectionSurfaceBoundary = React.memo(
  _StandaloneSectionSurfaceBoundary,
);
