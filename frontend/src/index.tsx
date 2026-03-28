import "utils/backendOriginOverrideInit";
import "utils/workspaceHistoryHandoffInit";

import "@glideapps/glide-data-grid/dist/index.css";
import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import { SectionContainerDefaultBoundary } from "components/Section/Container/SectionContainerDefaultBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribe } from "state/subscriptions";
import "../icons.css";
import { App } from "./App";
import { buildRuntimeBootstrapAppProps } from "./appRuntimeBootstrap";
import "./index.css";

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

subscribe();

const appProps = buildRuntimeBootstrapAppProps({
  SectionBoundary: SectionContainerDefaultBoundary,
  renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
});

const container = document.getElementById("root");
if (!container) {
  throw new Error();
}
const root = createRoot(container);
root.render(
  <StrictMode>
    <App {...appProps} />
  </StrictMode>,
);
