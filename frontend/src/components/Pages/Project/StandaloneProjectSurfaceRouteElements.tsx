import { ModalContainer } from "components/Modals/ModalContainer";
import { memo } from "react";
import type { ModeRouteElements } from "../modeRouteResolver";
import { GlobalWrapper } from "../GlobalWrapper";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

function _IdeStandaloneProjectSurfaceRouteElement() {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <StandaloneProjectSurfacePage />
      </ModalContainer>
    </GlobalWrapper>
  );
}

export const IdeStandaloneProjectSurfaceRouteElement = memo(
  _IdeStandaloneProjectSurfaceRouteElement,
);

export function buildStandaloneProjectSurfaceRouteElements({
  app,
  launcher,
}: Pick<ModeRouteElements, "app" | "launcher">): ModeRouteElements {
  return {
    ide: <IdeStandaloneProjectSurfaceRouteElement />,
    share: <ShareStandaloneProjectSurfacePage />,
    app,
    launcher,
  };
}
