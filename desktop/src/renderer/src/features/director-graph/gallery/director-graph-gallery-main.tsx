import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./director-graph-gallery.css";
import { DirectorGraphGallerySurface } from "./DirectorGraphGallerySurface";
import { installGraphModeCssVariables } from "../render/graph-mode-css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing director graph gallery root element");
}

installGraphModeCssVariables(document.documentElement);

createRoot(rootElement).render(
  <StrictMode>
    <DirectorGraphGallerySurface />
  </StrictMode>,
);
