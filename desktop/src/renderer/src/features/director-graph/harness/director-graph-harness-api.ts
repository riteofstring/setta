/**
 * The control surface the measurement workflow drives the harness through.
 *
 * The workflow talks to the page over CDP, so this is deliberately narrow and
 * JSON-shaped: name a scenario, get a run record back. Keeping the executable
 * part here rather than in an evaluated string is what lets it be typed,
 * linted, and type-checked with the renderer it drives.
 */

import type { DirectorGraphCanvas, GraphCanvasQuality } from "../render/director-graph-canvas";
import type { GraphCanvasPixelCheck } from "../render/graph-pixel-check";
import {
  DirectorGraphHarness,
  type GraphReplayClock,
  type DirectorGraphHarnessRun,
  type DirectorGraphScenarioOverrides,
  type DirectorGraphViewportReport,
} from "./director-graph-harness";
import {
  directorGraphScenarioNames,
  type DirectorGraphScenarioName,
} from "./director-graph-scenarios";

const directorGraphHarnessVersion = "setta-director-graph-harness-v1";

interface DirectorGraphHarnessEnvironment {
  readonly version: string;
  readonly ready: boolean;
  readonly webgl2: boolean;
  readonly glRenderer: string;
  readonly glVendor: string;
  readonly gpuTimerQuery: boolean;
  readonly viewport: DirectorGraphViewportReport;
  /** The CSS box the canvas actually occupies, after a viewport change lands. */
  readonly surface: { readonly width: number; readonly height: number };
  readonly quality: GraphCanvasQuality | null;
  readonly reducedMotion: boolean;
  readonly scenarios: readonly DirectorGraphScenarioName[];
}

interface DirectorGraphRunStatus {
  readonly state: "idle" | "running" | "done" | "failed";
  readonly scenario: string;
  readonly run: DirectorGraphHarnessRun | null;
  readonly error: string;
}

interface DirectorGraphHarnessApi {
  readonly version: string;
  environment(): DirectorGraphHarnessEnvironment;
  /** Judges whatever is on the canvas now; the empty graph is the check's floor. */
  pixelCheck(): Promise<GraphCanvasPixelCheck>;
  /**
   * Starts a scenario and returns immediately. A soak runs for minutes, which
   * is longer than a single evaluation may block the debugging channel, so the
   * result is collected from `status` instead of awaited.
   */
  start(scenario: string, overrides?: DirectorGraphScenarioOverrides): DirectorGraphRunStatus;
  status(): DirectorGraphRunStatus;
}

declare global {
  interface Window {
    __settaDirectorGraphHarness?: DirectorGraphHarnessApi;
  }
}

interface HarnessState {
  canvas: DirectorGraphCanvas | null;
}

function viewportReport(view: Window): DirectorGraphViewportReport {
  return {
    width: view.innerWidth,
    height: view.innerHeight,
    devicePixelRatio: view.devicePixelRatio,
  };
}

function surfaceBox(view: Window): { readonly width: number; readonly height: number } {
  const canvas = view.document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return { width: 0, height: 0 };
  }
  return { width: canvas.clientWidth, height: canvas.clientHeight };
}

function glStrings(view: Window): {
  webgl2: boolean;
  glRenderer: string;
  glVendor: string;
  gpuTimerQuery: boolean;
} {
  const canvas = view.document.querySelector("canvas");
  const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext("webgl2") : null;
  if (gl === null) {
    return { webgl2: false, glRenderer: "", glVendor: "", gpuTimerQuery: false };
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: true,
    glRenderer: info === null ? "" : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)),
    glVendor: info === null ? "" : String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)),
    gpuTimerQuery: gl.getExtension("EXT_disjoint_timer_query_webgl2") !== null,
  };
}

/**
 * Chromium's used JS heap. It is not in the standard `Performance` surface, so
 * it is read defensively and reported as unavailable rather than assumed: a
 * report that cannot state memory behaviour says so.
 */
function usedHeapBytes(view: Window): number | null {
  const memory = (view.performance as Performance & { memory?: { usedJSHeapSize?: number } })
    .memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function scenarioName(value: string): DirectorGraphScenarioName {
  const known = directorGraphScenarioNames.find((candidate) => candidate === value);
  if (known === undefined) {
    throw new Error(`unknown director graph scenario: ${value}`);
  }
  return known;
}

/**
 * Installs the control surface on the page. The state object is written by the
 * React mount, so the API exists before the canvas does and reports `ready`
 * false until it is there.
 */
export function installDirectorGraphHarnessApi(
  view: Window,
  state: HarnessState,
  clock: GraphReplayClock,
): void {
  let status: DirectorGraphRunStatus = { state: "idle", scenario: "", run: null, error: "" };
  const requireCanvas = (): DirectorGraphCanvas => {
    if (state.canvas === null) {
      throw new Error("director graph harness canvas is not mounted");
    }
    return state.canvas;
  };
  view.__settaDirectorGraphHarness = {
    version: directorGraphHarnessVersion,
    environment: () => ({
      version: directorGraphHarnessVersion,
      ready: state.canvas !== null,
      ...glStrings(view),
      viewport: viewportReport(view),
      surface: surfaceBox(view),
      quality: state.canvas === null ? null : state.canvas.qualityState(),
      reducedMotion: view.matchMedia("(prefers-reduced-motion: reduce)").matches,
      scenarios: directorGraphScenarioNames,
    }),
    pixelCheck: () => requireCanvas().requestPixelCheck(),
    start: (scenario: string, overrides: DirectorGraphScenarioOverrides = {}) => {
      if (status.state === "running") {
        throw new Error(`a director graph scenario is already running: ${status.scenario}`);
      }
      const harness = new DirectorGraphHarness(
        requireCanvas(),
        {
          requestFrame: (callback) => view.requestAnimationFrame(callback),
          now: () => view.performance.now(),
          heapBytes: () => usedHeapBytes(view),
        },
        clock,
        () => viewportReport(view),
      );
      const name = scenarioName(scenario);
      status = { state: "running", scenario: name, run: null, error: "" };
      harness.run(name, overrides).then(
        (run) => {
          status = { state: "done", scenario: name, run, error: "" };
        },
        (error: unknown) => {
          status = {
            state: "failed",
            scenario: name,
            run: null,
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
          };
        },
      );
      return status;
    },
    status: () => status,
  };
}
