import { memo, type ComponentProps } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StandaloneProjectSurfacePageTargetBoundary } from "./StandaloneProjectSurfacePageTargetBoundary";

export type StandaloneProjectSurfacePageRouteStateBoundaryProps = Pick<
  ComponentProps<typeof StandaloneProjectSurfacePageTargetBoundary>,
  "doneLoading" | "is404" | "renderDictArea"
>;

function _StandaloneProjectSurfacePageRouteStateBoundary({
  doneLoading,
  is404,
  renderDictArea,
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
      renderDictArea={renderDictArea}
    />
  );
}

export const StandaloneProjectSurfacePageRouteStateBoundary = memo(
  _StandaloneProjectSurfacePageRouteStateBoundary,
);
