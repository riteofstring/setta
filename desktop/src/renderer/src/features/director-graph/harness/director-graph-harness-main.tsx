/**
 * Entry point for the graph measurement page.
 *
 * It is a second renderer entry rather than a mode of the app shell: the shell
 * would put its own React work, stores, and DOM into every frame sample and
 * every pixel check, and Phase 2 measures the graph alone.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./director-graph-harness.css";
import { DirectorGraphHarnessSurface } from "./DirectorGraphHarnessSurface";
import { GraphReplayClock } from "./director-graph-harness";
import { installDirectorGraphHarnessApi } from "./director-graph-harness-api";
import type { DirectorGraphCanvas } from "../render/director-graph-canvas";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing director graph harness root element");
}

const clock = new GraphReplayClock();
const state: { canvas: DirectorGraphCanvas | null } = { canvas: null };
installDirectorGraphHarnessApi(window, state, clock);

createRoot(rootElement).render(
  <StrictMode>
    <DirectorGraphHarnessSurface
      clock={clock}
      onCanvas={(canvas) => {
        state.canvas = canvas;
      }}
    />
  </StrictMode>,
);
