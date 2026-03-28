import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { memo, type ComponentProps } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StandaloneProjectSurfacePageTargetBoundary } from "./StandaloneProjectSurfacePageTargetBoundary";

export type StandaloneProjectSurfacePageRouteStateBoundaryProps = Pick<
  ComponentProps<typeof StandaloneProjectSurfacePageTargetBoundary>,
  "doneLoading" | "is404"
>;

function renderStandaloneProjectSurfacePageRouteStateDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

function _StandaloneProjectSurfacePageRouteStateBoundary({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageRouteStateBoundaryProps) {
  const { projectConfigName, sectionSlug, chatId, windowSpaceSlug } =
    useParams();
  const navigate = useNavigate();

  return (
    <StandaloneProjectSurfacePageTargetBoundary
      doneLoading={doneLoading}
      is404={is404}
      projectConfigName={projectConfigName}
      sectionSlug={sectionSlug}
      chatId={chatId}
      windowSpaceSlug={windowSpaceSlug}
      navigate={navigate}
      renderDictArea={renderStandaloneProjectSurfacePageRouteStateDictArea}
    />
  );
}

export const StandaloneProjectSurfacePageRouteStateBoundary = memo(
  _StandaloneProjectSurfacePageRouteStateBoundary,
);
