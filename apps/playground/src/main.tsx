import {
  createWorkspaceHost,
  registerWorkspaceClipboardAuthority,
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

const isPerformanceProfile = new URLSearchParams(window.location.search).has(
  "performance-profile",
);
const workspaceHost = isPerformanceProfile
  ? createWorkspaceHost()
  : createWorkspaceHost({ history: { kind: "local" } });
setWorkspaceColorMode(
  workspaceHost,
  document.documentElement.classList.contains("dark") ? "dark" : "light",
);
registerPlaygroundSectionKinds(workspaceHost);
registerWorkspaceClipboardAuthority(workspaceHost, {
  id: "setta-playground",
  kind: "local",
});
registerPlaygroundMenuExtensions(workspaceHost);
registerPlaygroundKeyBindings(workspaceHost);
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
