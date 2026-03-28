import { ModalContainer } from "components/Modals/ModalContainer";
import { memo } from "react";
import { GlobalWrapper } from "../GlobalWrapper";
import type { ModeRouteElements } from "../modeRouteResolver";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

export type StandaloneProjectSurfaceRouteElementsArgs = Pick<
  ModeRouteElements,
  "app" | "launcher"
> & {
  renderDictArea: Parameters<
    typeof StandaloneProjectSurfacePage
  >[0]["renderDictArea"];
};

function _IdeStandaloneProjectSurfaceRouteElement({
  renderDictArea,
}: Pick<StandaloneProjectSurfaceRouteElementsArgs, "renderDictArea">) {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <StandaloneProjectSurfacePage renderDictArea={renderDictArea} />
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
  renderDictArea,
}: StandaloneProjectSurfaceRouteElementsArgs): ModeRouteElements {
  return {
    ide: (
      <IdeStandaloneProjectSurfaceRouteElement
        renderDictArea={renderDictArea}
      />
    ),
    share: (
      <ShareStandaloneProjectSurfacePage renderDictArea={renderDictArea} />
    ),
    app,
    launcher,
  };
}
