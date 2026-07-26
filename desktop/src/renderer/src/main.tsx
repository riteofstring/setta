import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { App } from "./App";
import "./styles.css";
import { runRendererPageTeardown } from "./renderer-page-lifecycle";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing renderer root element");
}

const root = createRoot(rootElement);
installPageTeardown(root);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function installPageTeardown(root: Root): void {
  let unmounted = false;
  const teardown = () => {
    if (unmounted) {
      return;
    }
    unmounted = true;
    runRendererPageTeardown();
    root.unmount();
  };
  window.addEventListener("beforeunload", teardown, { once: true });
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) {
        teardown();
      }
    },
    { once: true },
  );
}
