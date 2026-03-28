import { ModalContainer } from "components/Modals/ModalContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { memo, type ComponentProps } from "react";
import { StandaloneProjectSurfacePageWithLoadState } from "./StandaloneProjectSurfacePageLoadBoundary";

export type ShareStandaloneProjectSurfacePageShareState = {
  doneLoading: boolean;
  is404: boolean;
};

export type ShareStandaloneProjectSurfacePageBoundaryProps = Pick<
  ComponentProps<typeof StandaloneProjectSurfacePageWithLoadState>,
  "renderDictArea"
>;

type ShareStandaloneProjectSurfacePageWithShareStateProps =
  ShareStandaloneProjectSurfacePageShareState &
    ShareStandaloneProjectSurfacePageBoundaryProps;

function _ShareStandaloneProjectSurfacePageWithShareState({
  doneLoading,
  is404,
  renderDictArea,
}: ShareStandaloneProjectSurfacePageWithShareStateProps) {
  return (
    <ModalContainer>
      <StandaloneProjectSurfacePageWithLoadState
        doneLoading={doneLoading}
        is404={is404}
        renderDictArea={renderDictArea}
      />
    </ModalContainer>
  );
}

export const ShareStandaloneProjectSurfacePageWithShareState = memo(
  _ShareStandaloneProjectSurfacePageWithShareState,
);

function _ShareStandaloneProjectSurfacePageBoundary({
  renderDictArea,
}: ShareStandaloneProjectSurfacePageBoundaryProps) {
  return (
    <ShareWrapper manageTitle={false}>
      {({ doneLoading, is404 }) => (
        <ShareStandaloneProjectSurfacePageWithShareState
          doneLoading={doneLoading}
          is404={is404}
          renderDictArea={renderDictArea}
        />
      )}
    </ShareWrapper>
  );
}

export const ShareStandaloneProjectSurfacePageBoundary = memo(
  _ShareStandaloneProjectSurfacePageBoundary,
);
