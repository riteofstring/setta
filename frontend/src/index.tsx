import "utils/backendOriginOverrideInit";
import "utils/workspaceHistoryHandoffInit";

import "@glideapps/glide-data-grid/dist/index.css";
import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribe } from "state/subscriptions";
import "../icons.css";
import { App, buildAppProps } from "./App";
import "./index.css";

subscribe();

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

const appProps = buildAppProps({
  SectionBoundary: SectionContainerBoundary,
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
