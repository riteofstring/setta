import { ModalContainer } from "components/Modals/ModalContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { memo } from "react";
import { StandaloneProjectSurfacePageWithLoadState } from "./StandaloneProjectSurfacePageLoadBoundary";

export type ShareStandaloneProjectSurfacePageShareState = {
  doneLoading: boolean;
  is404: boolean;
};

function _ShareStandaloneProjectSurfacePageWithShareState({
  doneLoading,
  is404,
}: ShareStandaloneProjectSurfacePageShareState) {
  return (
    <ModalContainer>
      <StandaloneProjectSurfacePageWithLoadState
        doneLoading={doneLoading}
        is404={is404}
      />
    </ModalContainer>
  );
}

export const ShareStandaloneProjectSurfacePageWithShareState = memo(
  _ShareStandaloneProjectSurfacePageWithShareState,
);

function _ShareStandaloneProjectSurfacePageBoundary() {
  return (
    <ShareWrapper manageTitle={false}>
      {({ doneLoading, is404 }) => (
        <ShareStandaloneProjectSurfacePageWithShareState
          doneLoading={doneLoading}
          is404={is404}
        />
      )}
    </ShareWrapper>
  );
}

export const ShareStandaloneProjectSurfacePageBoundary = memo(
  _ShareStandaloneProjectSurfacePageBoundary,
);
