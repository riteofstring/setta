import { ModalContainer } from "components/Modals/ModalContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { StandaloneProjectSurfacePageWithLoadState } from "./StandaloneProjectSurfacePage";

export function ShareStandaloneProjectSurfacePage() {
  return (
    <ShareWrapper manageTitle={false}>
      {({ doneLoading, is404 }) => (
        <ModalContainer>
          <StandaloneProjectSurfacePageWithLoadState
            doneLoading={doneLoading}
            is404={is404}
          />
        </ModalContainer>
      )}
    </ShareWrapper>
  );
}
