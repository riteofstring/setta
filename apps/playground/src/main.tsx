import {
  createWorkspaceHost,
  registerWorkspaceClipboardAuthority,
  setWorkspaceColorMode,
  WorkspaceProvider,
} from "@setta/workspace";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FocusedSectionApp } from "./FocusedSectionApp";
import "@setta/playground/styles.css";
import {
  registerPlaygroundKeyBindings,
  registerPlaygroundMenuExtensions,
} from "./menuExtensions";
import { PerformanceProfileApp } from "./PerformanceProfileApp";
import { performanceProfileDocument } from "./performanceProfileDocument";
import { playgroundDocument } from "./playgroundDocument";
import { registerPlaygroundSectionKinds } from "./sectionKinds";

const searchParams = new URLSearchParams(window.location.search);
const isPerformanceProfile = searchParams.has("performance-profile");
const focusedSectionId = searchParams.get("focused-section");
const requestedColorMode = searchParams.get("color-mode");
if (requestedColorMode === "dark" || requestedColorMode === "light") {
  document.documentElement.classList.toggle(
    "dark",
    requestedColorMode === "dark",
  );
}
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
      {isPerformanceProfile ? (
        <PerformanceProfileApp />
      ) : focusedSectionId === null ? (
        <App />
      ) : (
        <FocusedSectionApp sectionId={focusedSectionId} />
      )}
    </WorkspaceProvider>
  </StrictMode>,
);
