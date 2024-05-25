import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { URLS } from "utils/constants";
import constants from "../../constants/constants.json";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

const DEV_MODE = import.meta.env.DEV;
if (DEV_MODE) {
  URLS.BACKEND = `http://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
  URLS.WEBSOCKET = `ws://${constants.DEFAULT_HOST}:${constants.DEFAULT_PORT}`;
} else {
  URLS.BACKEND = `http://${location.host}`;
  URLS.WEBSOCKET = `ws://${location.host}`;
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
