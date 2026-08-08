import { createEmptyWorkspaceDocument } from "@setta/workspace/core";
import {
  Workspace,
  type WorkspaceExternalDropHandler,
  type WorkspaceExternalDropValidator,
  type WorkspaceGroupFactory,
  type WorkspaceToolbarControl,
} from "@setta/workspace/react";
import "@setta/workspace/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing consumer root element.");
}

const workspaceDocument = createEmptyWorkspaceDocument();
const onExternalDrop: WorkspaceExternalDropHandler = () => undefined;
const validateExternalDrop: WorkspaceExternalDropValidator = ({ event }) =>
  event.dataTransferTypes.includes("application/x-consumer-section")
    ? { allowed: true, label: "Import consumer section" }
    : { allowed: false, reason: "Unsupported consumer drop." };
const groupFactory: WorkspaceGroupFactory = ({ sectionIds }) => ({
  data: null,
  id: `consumer-group-${String(sectionIds.length)}`,
  kind: "consumer-group",
  title: "Consumer group",
});
const toolbarControls = [
  {
    icon: <span>+</span>,
    id: "consumer-focus",
    label: "Focus consumer canvas",
    onPress: (controller) => void controller.setViewport({ x: 0, y: 0, zoom: 1 }),
    placement: "project",
  },
] satisfies readonly WorkspaceToolbarControl[];

createRoot(root).render(
  <StrictMode>
    <Workspace
      appearanceOptions={{ appearance: "light" }}
      ariaLabel="Consumer workspace"
      data-version={workspaceDocument.schemaVersion}
      gestureOptions={{ maxZoom: 2, minZoom: 0.5, panOnScroll: true, zoomOnScroll: false }}
      gridOptions={{ pattern: "cross", snap: false, spacing: [24, 18], visible: true }}
      groupFactory={groupFactory}
      onExternalDrop={onExternalDrop}
      toolbarControls={toolbarControls}
      validateExternalDrop={validateExternalDrop}
    />
  </StrictMode>,
);
