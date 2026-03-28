import { ModalContainer } from "components/Modals/ModalContainer";
import { memo, type ComponentProps } from "react";
import { GlobalWrapper } from "../GlobalWrapper";
import { ShareStandaloneProjectSurfacePageBoundary } from "./ShareStandaloneProjectSurfacePageBoundary";
import { StandaloneProjectSurfacePageLoadBoundary } from "./StandaloneProjectSurfacePageLoadBoundary";

export type StandaloneProjectSurfaceRouteElementBoundaryProps = Pick<
  ComponentProps<typeof StandaloneProjectSurfacePageLoadBoundary>,
  "renderDictArea"
>;

function _IdeStandaloneProjectSurfaceRouteBoundary({
  renderDictArea,
}: StandaloneProjectSurfaceRouteElementBoundaryProps) {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <StandaloneProjectSurfacePageLoadBoundary
          renderDictArea={renderDictArea}
        />
      </ModalContainer>
    </GlobalWrapper>
  );
}

export const IdeStandaloneProjectSurfaceRouteBoundary = memo(
  _IdeStandaloneProjectSurfaceRouteBoundary,
);

function _ShareStandaloneProjectSurfaceRouteBoundary({
  renderDictArea,
}: StandaloneProjectSurfaceRouteElementBoundaryProps) {
  return (
    <ShareStandaloneProjectSurfacePageBoundary
      renderDictArea={renderDictArea}
    />
  );
}

export const ShareStandaloneProjectSurfaceRouteBoundary = memo(
  _ShareStandaloneProjectSurfaceRouteBoundary,
);
