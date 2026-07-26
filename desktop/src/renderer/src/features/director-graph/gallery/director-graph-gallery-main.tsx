import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./director-graph-gallery.css";
import { DirectorGraphGallerySurface } from "./DirectorGraphGallerySurface";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing director graph gallery root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <DirectorGraphGallerySurface />
  </StrictMode>,
);
