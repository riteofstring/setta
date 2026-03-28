import "utils/backendOriginOverrideInit";
import "utils/workspaceHistoryHandoffInit";

import "@glideapps/glide-data-grid/dist/index.css";
import { createAppRouter } from "components/Pages/router";
import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribe } from "state/subscriptions";
import "../icons.css";
import { App } from "./App";
import "./index.css";

subscribe();

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

const router = createAppRouter({
  renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
});

const container = document.getElementById("root");
if (!container) {
  throw new Error();
}
const root = createRoot(container);
root.render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);
