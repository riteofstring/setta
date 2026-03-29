import { buildStandalonePageSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { StandaloneSectionSurfaceBoundary } from "components/Section/Container/StandaloneSectionSurfaceBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { memo, type ComponentProps, type ReactNode } from "react";
import type { SectionType } from "utils/generatedTypes";

export type StandaloneProjectSurfaceRouteSectionBoundaryProps = {
  projectConfigId: string;
  sectionId: string;
  sectionType: SectionType;
  renderDictArea: (props: SectionContainerAreaDictProps) => ReactNode;
  renderCoreBody: ComponentProps<
    typeof StandaloneSectionSurfaceBoundary
  >["renderCoreBody"];
  renderNestedSections: ComponentProps<
    typeof StandaloneSectionSurfaceBoundary
  >["renderNestedSections"];
  onProjectChatBlockedErrorCodeChange: (errorCode: string | null) => void;
};

function _StandaloneProjectSurfaceRouteSectionBoundary({
  projectConfigId,
  sectionId,
  sectionType,
  renderDictArea,
  renderCoreBody,
  renderNestedSections,
  onProjectChatBlockedErrorCodeChange,
}: StandaloneProjectSurfaceRouteSectionBoundaryProps) {
  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      data-testid="standalone-section-surface"
    >
      <StandaloneSectionSurfaceBoundary
        sectionId={sectionId}
        sectionType={sectionType}
        projectChatSurfaceId={buildStandalonePageSectionProjectChatSurfaceId(
          projectConfigId,
          sectionId,
        )}
        onProjectChatBlockedErrorCodeChange={
          onProjectChatBlockedErrorCodeChange
        }
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />
    </div>
  );
}

export const StandaloneProjectSurfaceRouteSectionBoundary = memo(
  _StandaloneProjectSurfaceRouteSectionBoundary,
);
