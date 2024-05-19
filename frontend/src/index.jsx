import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { COMMON_CONSTS } from "utils/constants";
import constants from "../../constants/constants.json";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

for (const [k, v] of Object.entries(constants)) {
  COMMON_CONSTS[k] = v;
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
