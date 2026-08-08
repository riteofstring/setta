import { createEmptyWorkspaceDocument } from "@setta/workspace/core";
import { Workspace } from "@setta/workspace/react";
import "@setta/workspace/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing consumer root element.");
}

const workspaceDocument = createEmptyWorkspaceDocument();

createRoot(root).render(
  <StrictMode>
    <Workspace
      appearanceOptions={{ appearance: "light" }}
      ariaLabel="Consumer workspace"
      data-version={workspaceDocument.schemaVersion}
      gestureOptions={{ maxZoom: 2, minZoom: 0.5, panOnScroll: true, zoomOnScroll: false }}
      gridOptions={{ pattern: "cross", snap: false, spacing: [24, 18], visible: true }}
    />
  </StrictMode>,
);
