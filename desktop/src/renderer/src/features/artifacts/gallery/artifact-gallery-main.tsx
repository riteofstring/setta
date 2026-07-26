import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../../styles.css";
import "./artifact-gallery.css";
import { ArtifactGallerySurface } from "./ArtifactGallerySurface";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing artifact gallery root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <ArtifactGallerySurface />
  </StrictMode>,
);
