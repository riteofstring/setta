import _ from "lodash";
import React from "react";
import { getAncestorSameVisibility } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import type { SectionRefRegistrationMode } from "state/hooks/sectionRef";
import { Container } from "./ContainerCore";

function _GpuSceneSectionContainer({
  isGroup,
  sectionId,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}) {
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

function _StaticSectionContainer({
  isGroup,
  sectionId,
  isTopLevel,
  visibility,
  isEditingViewMode,
  isUserView,
  children,
}) {
  const ancestorHasSameVisibility = useProjectState((x) =>
    getAncestorSameVisibility(sectionId, x),
  );
  const className = isTopLevel ? "h-full w-full" : "";
  const fullStyle = {
    ...maybeGetOpacityStyle(
      visibility,
      isEditingViewMode,
      ancestorHasSameVisibility,
    ),
  };

  return (
    <Container
      isGroup={isGroup}
      sectionId={sectionId}
      trueDragListeners={{}}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      className={className}
      style={fullStyle}
    >
      {children}
    </Container>
  );
}

function maybeGetOpacityStyle(
  visibility,
  isEditingViewMode,
  ancestorHasSameVisibility,
) {
  if (!visibility && isEditingViewMode) {
    return ancestorHasSameVisibility ? {} : { opacity: 0.3 };
  }
  return {};
}

export const StaticSectionContainer = React.memo(
  _StaticSectionContainer,
  _.isEqual,
);
