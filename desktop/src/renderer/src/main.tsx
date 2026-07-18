import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { App } from "./App";
import "./styles.css";
import { installWebSettaAPIIfNeeded } from "./web/setta-web-api";

installWebSettaAPIIfNeeded();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing renderer root element");
}

const root = createRoot(rootElement);
installE2ETeardown(root);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function installE2ETeardown(root: Root): void {
  if (new URLSearchParams(window.location.search).get("settaE2E") !== "1") {
    return;
  }
  window.addEventListener(
    "setta:e2e-teardown-app",
    () => {
      root.unmount();
    },
    { once: true },
  );
}
