import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../icons.css";
import { App } from "./App";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

reportWebVitals();
