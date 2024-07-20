import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "state/subscribe";
import { globalConstInit } from "utils/constants";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

globalConstInit();

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
