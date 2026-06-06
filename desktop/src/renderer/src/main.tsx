import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";

if (import.meta.env.DEV && !window.setta) {
  await import("./browser-dev-setta");
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing renderer root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
