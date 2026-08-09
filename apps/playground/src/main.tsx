import { loadWorkspaceDocument, useWorkspaceAppearance } from "@setta/workspace";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { sliceDocument } from "./sliceDocument";

// The appearance store must reflect the boot dark-mode class before the document loads,
// because node projection derives style-color backgrounds from it.
useWorkspaceAppearance.setState({
  darkMode: document.documentElement.classList.contains("dark"),
});
loadWorkspaceDocument(sliceDocument);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("playground root element missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
