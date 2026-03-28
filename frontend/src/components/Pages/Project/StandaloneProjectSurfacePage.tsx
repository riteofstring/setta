import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import {
  StandaloneProjectSurfacePageLoadBoundary,
  StandaloneProjectSurfacePageWithLoadState,
} from "./StandaloneProjectSurfacePageLoadBoundary";

function renderStandaloneProjectSurfacePageDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

export function StandaloneProjectSurfacePage() {
  return (
    <StandaloneProjectSurfacePageLoadBoundary
      renderDictArea={renderStandaloneProjectSurfacePageDictArea}
    />
  );
}

export { StandaloneProjectSurfacePageWithLoadState };
