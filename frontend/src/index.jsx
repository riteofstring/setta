import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { COMMON_CONSTS } from "utils/constants";
import constants from "../../constants/constants.json";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

const DEV_MODE = import.meta.env.DEV;
if (DEV_MODE) {
  COMMON_CONSTS["BACKEND"] =
    `http://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
  COMMON_CONSTS["WEBSOCKET"] =
    `ws://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
} else {
  COMMON_CONSTS["BACKEND"] = `http://${location.host}`
  COMMON_CONSTS["WEBSOCKET"] = `ws://${location.host}`
}

delete constants.DEFAULT_HOST;
delete constants.DEFAULT_PORT;
delete constants.DEV_MODE_FRONTEND_PORT;

console.log(COMMON_CONSTS)

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
