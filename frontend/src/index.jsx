import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { pauseTemporal } from "state/pauseTemporal";
import { subscribe } from "state/subscribe";
import { globalConstInit } from "utils/constants";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

globalConstInit();
subscribe();
pauseTemporal();

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
