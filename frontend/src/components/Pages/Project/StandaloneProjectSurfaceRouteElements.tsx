import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { ModalContainer } from "components/Modals/ModalContainer";
import { memo } from "react";
import type { ModeRouteElements } from "../modeRouteResolver";
import { GlobalWrapper } from "../GlobalWrapper";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

function _IdeStandaloneProjectSurfaceRouteElement() {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <StandaloneProjectSurfacePage
          renderDictArea={renderStandaloneProjectSurfaceRouteDictArea}
        />
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
    share: (
      <ShareStandaloneProjectSurfacePage
        renderDictArea={renderStandaloneProjectSurfaceRouteDictArea}
      />
    ),
    app,
    launcher,
  };
}
