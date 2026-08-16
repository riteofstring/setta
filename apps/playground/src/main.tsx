import {
  createWorkspaceHost,
  setWorkspaceColorMode,
  WorkspaceProvider,
} from "@setta/workspace";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import {
  registerPlaygroundKeyBindings,
  registerPlaygroundMenuExtensions,
} from "./menuExtensions";
import { PerformanceProfileApp } from "./PerformanceProfileApp";
import { performanceProfileDocument } from "./performanceProfileDocument";
import { playgroundDocument } from "./playgroundDocument";
import { registerPlaygroundSectionKinds } from "./sectionKinds";

// The appearance store must reflect the boot dark-mode class before the document loads,
// because node projection derives style-color backgrounds from it. Kind registration also
// precedes the load: loading validates section kinds against the registry.
const workspaceHost = createWorkspaceHost();
setWorkspaceColorMode(
  workspaceHost,
  document.documentElement.classList.contains("dark") ? "dark" : "light",
);
registerPlaygroundSectionKinds(workspaceHost);
registerPlaygroundMenuExtensions(workspaceHost);
registerPlaygroundKeyBindings(workspaceHost);
const isPerformanceProfile = new URLSearchParams(window.location.search).has(
  "performance-profile",
);
workspaceHost.loadDocument(
  isPerformanceProfile ? performanceProfileDocument : playgroundDocument,
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("playground root element missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceProvider host={workspaceHost}>
      {isPerformanceProfile ? <PerformanceProfileApp /> : <App />}
    </WorkspaceProvider>
  </StrictMode>,
);
