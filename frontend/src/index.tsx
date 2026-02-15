import "utils/backendOriginOverrideInit";
import "utils/workspaceHistoryHandoffInit";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribe } from "state/subscriptions";
import "../icons.css";
import { App } from "./App";
import "./index.css";

subscribe();

const container = document.getElementById("root");
if (!container) {
  throw new Error();
}
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
