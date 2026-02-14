import { scan } from "react-scan"; // must be imported before React and React DOM

import "utils/backendOriginOverrideInit";
import "utils/workspaceHistoryHandoffInit";

import "@glideapps/glide-data-grid/dist/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { subscribe } from "state/subscriptions";
import "../icons.css";
import { App } from "./App";
import "./index.css";

scan({
  enabled: false,
});

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
