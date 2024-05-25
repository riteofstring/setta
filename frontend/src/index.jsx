import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { C } from "utils/constants";
import constants from "../../constants/constants.json";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

const DEV_MODE = import.meta.env.DEV;
if (DEV_MODE) {
  C.BACKEND = `http://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
  C.WEBSOCKET = `ws://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
} else {
  C.BACKEND = `http://${location.host}`;
  C.WEBSOCKET = `ws://${location.host}`;
}

delete constants.DEFAULT_HOST;
delete constants.DEFAULT_PORT;
delete constants.DEV_MODE_FRONTEND_PORT;

for (const [k, v] of Object.entries(constants)) {
  C[k] = v;
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
