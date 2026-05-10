import React from "react";
import { getAncestorSameVisibility } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import type { SectionRefRegistrationMode } from "state/hooks/sectionRef";
import { Container } from "./ContainerCore";

type GpuSceneSectionContainerProps = {
  readonly children: React.ReactNode;
  readonly isEditingViewMode: boolean;
  readonly isGroup: boolean;
  readonly isUserView: boolean;
  readonly sectionId: string;
  readonly visibility: boolean;
};

function _GpuSceneSectionContainer({
  isGroup,
  sectionId,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}: GpuSceneSectionContainerProps) {
  const ancestorHasSameVisibility = useProjectState((x) =>
    getAncestorSameVisibility(sectionId, x),
  );
  const style = maybeGetOpacityStyle(
    visibility,
    isEditingViewMode,
    ancestorHasSameVisibility,
  );

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      className="h-full w-full"
      style={style}
      sectionRefMode={getGpuSceneSectionRefMode(isGroup)}
      trueDragListeners={{}}
    >
      {children}
    </Container>
  );
}

function getGpuSceneSectionRefMode(
  isGroup: boolean,
): SectionRefRegistrationMode {
  return isGroup ? "selfOnly" : "none";
}

export const GpuSceneSectionContainer = React.memo(
  _GpuSceneSectionContainer,
  (p, n) =>
    p.isGroup === n.isGroup &&
    p.sectionId === n.sectionId &&
    p.children === n.children &&
    p.visibility === n.visibility &&
    p.isEditingViewMode === n.isEditingViewMode &&
    p.isUserView === n.isUserView,
);

function maybeGetOpacityStyle(
  visibility: boolean,
  isEditingViewMode: boolean,
  ancestorHasSameVisibility: boolean,
): React.CSSProperties {
  if (!visibility && isEditingViewMode) {
    return ancestorHasSameVisibility ? {} : { opacity: 0.3 };
  }
  return {};
}
