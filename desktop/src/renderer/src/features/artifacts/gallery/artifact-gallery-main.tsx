import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../../styles.css";
import "./artifact-gallery.css";
import { ArtifactGallerySurface } from "./ArtifactGallerySurface";
import { installGraphModeCssVariables } from "../../director-graph/render/graph-mode-css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing artifact gallery root element");
}

installGraphModeCssVariables(document.documentElement);

createRoot(rootElement).render(
  <StrictMode>
    <ArtifactGallerySurface />
  </StrictMode>,
);
