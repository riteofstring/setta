import type { PrototypeMetricsCollector } from "../prototype-metrics";
import { resolveAgentShaderPalette, type AgentShaderPalette } from "../prototype-theme-palette";
import type { AgentShaderID, AgentVisualState, PrototypeQuality } from "../prototype-types";

import conversationConstellationFragmentSource from "./shaders/conversation-constellation.glsl?raw";
import foldingBloomFragmentSource from "./shaders/folding-bloom.glsl?raw";
import orbitalLatticeFragmentSource from "./shaders/orbital-lattice.glsl?raw";
import quantumLensFragmentSource from "./shaders/quantum-lens.glsl?raw";
import signalPolyhedronFragmentSource from "./shaders/signal-polyhedron.glsl?raw";
import thoughtKnotFragmentSource from "./shaders/thought-knot.glsl?raw";
import vertexSource from "./shaders/vertex.glsl?raw";

export type AgentWebGLRuntimeStatus = "context-lost" | "ready" | "unavailable";

export interface AgentWebGLRuntimeUpdate {
  active: boolean;
  advancedEffects: boolean;
  fixedTimeMs: number | null;
  quality: PrototypeQuality;
  shader: AgentShaderID;
  state: AgentVisualState;
}

export interface AgentWebGLRuntimeOptions extends AgentWebGLRuntimeUpdate {
  canvas: HTMLCanvasElement;
  metrics: PrototypeMetricsCollector;
  onStatusChange: (status: AgentWebGLRuntimeStatus) => void;
}

interface AgentUniforms {
  background: WebGLUniformLocation | null;
  effects: WebGLUniformLocation | null;
  listeningTime: WebGLUniformLocation | null;
  primary: WebGLUniformLocation | null;
  progress: WebGLUniformLocation | null;
  quality: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  respondingTime: WebGLUniformLocation | null;
  secondary: WebGLUniformLocation | null;
  state: WebGLUniformLocation | null;
  tertiary: WebGLUniformLocation | null;
  thinkingTime: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
}

interface AgentPhaseBasis {
  baseMs: number;
  listeningMs: number;
  respondingMs: number;
  thinkingMs: number;
}

type AgentPhaseExtraClock = "listening" | "responding" | "thinking";

const fragmentSources = {
  "conversation-constellation": conversationConstellationFragmentSource,
  "folding-bloom": foldingBloomFragmentSource,
  "orbital-lattice": orbitalLatticeFragmentSource,
  "quantum-lens": quantumLensFragmentSource,
  "signal-polyhedron": signalPolyhedronFragmentSource,
  "thought-knot": thoughtKnotFragmentSource,
} satisfies Record<AgentShaderID, string>;

const completeSettleDurationMs = 1_200;
const dprLimit = 1.5;
const listeningFrameIntervalMs = 1_000 / 30;
const animatedFrameIntervalMs = 1_000 / 60;
const frameIntervalToleranceMs = 0.75;

export class AgentWebGLRuntime {
  private active: boolean;
  private advancedEffects: boolean;
  private baseAnimationElapsedMs = 0;
  private readonly canvas: HTMLCanvasElement;
  private completeExtraClock: AgentPhaseExtraClock | null = null;
  private disposed = false;
  private fixedTimeMs: number | null;
  private frameHandle = 0;
  private gl: WebGL2RenderingContext | null = null;
  private hasRecordedResize = false;
  private lastDrawTimeMs = 0;
  private listeningAnimationElapsedMs = 0;
  private readonly metrics: PrototypeMetricsCollector;
  private readonly onStatusChange: (status: AgentWebGLRuntimeStatus) => void;
  private palette: AgentShaderPalette;
  private program: WebGLProgram | null = null;
  private quality: PrototypeQuality;
  private readonly resizeObserver: ResizeObserver | null;
  private respondingAnimationElapsedMs = 0;
  private shader: AgentShaderID;
  private state: AgentVisualState;
  private stateElapsedMs = 0;
  private staticDrawQueued = false;
  private status: AgentWebGLRuntimeStatus | null = null;
  private readonly themeObserver: MutationObserver | null;
  private thinkingAnimationElapsedMs = 0;
  private timelineAnchorMs: number | null = null;
  private uniforms: AgentUniforms | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private readonly view: Window;

  constructor(options: AgentWebGLRuntimeOptions) {
    this.active = options.active;
    this.advancedEffects = options.advancedEffects;
    this.canvas = options.canvas;
    this.fixedTimeMs = options.fixedTimeMs;
    this.metrics = options.metrics;
    this.metrics.resetRenderedFrameIntervalBaseline();
    this.onStatusChange = options.onStatusChange;
    this.quality = options.quality;
    this.shader = options.shader;
    this.state = options.state;

    const view = this.canvas.ownerDocument.defaultView;
    if (!view) {
      throw new Error("Agent WebGL runtime requires a window.");
    }
    this.view = view;
    this.timelineAnchorMs = this.shouldAdvanceTimeline() ? this.view.performance.now() : null;
    this.palette = resolveAgentShaderPalette(this.canvas.ownerDocument.documentElement);

    this.canvas.addEventListener("webglcontextlost", this.handleContextLoss);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestoration);

    this.resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(this.handleResize);
    this.resizeObserver?.observe(this.canvas);

    this.themeObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(this.handleThemeMutation);
    this.themeObserver?.observe(this.canvas.ownerDocument.documentElement, {
      attributeFilter: ["class", "data-color-mode", "style"],
      attributes: true,
    });

    this.initializeContext();
    this.resizeFromCanvas();
    this.invalidate();
  }

  update(update: AgentWebGLRuntimeUpdate): void {
    const nowMs = this.view.performance.now();
    const wasActive = this.active;
    const advancedEffectsChanged = update.advancedEffects !== this.advancedEffects;
    const fixedTimeChanged = update.fixedTimeMs !== this.fixedTimeMs;
    const qualityChanged = update.quality !== this.quality;
    const shaderChanged = update.shader !== this.shader;
    const stateChanged = update.state !== this.state;

    this.captureTimeline(nowMs);
    const wasAdvancing = this.shouldAdvanceTimeline();
    this.active = update.active;
    this.advancedEffects = update.advancedEffects;
    this.fixedTimeMs = update.fixedTimeMs;
    this.quality = update.quality;

    if (stateChanged) {
      this.completeExtraClock =
        update.state === "complete" ? phaseExtraClockForState(this.state) : null;
      this.state = update.state;
      this.stateElapsedMs = 0;
    }

    const isAdvancing = this.shouldAdvanceTimeline();
    this.reconcileTimeline(nowMs);

    if (
      stateChanged ||
      fixedTimeChanged ||
      advancedEffectsChanged ||
      wasAdvancing !== isAdvancing
    ) {
      this.lastDrawTimeMs = 0;
      this.metrics.resetRenderedFrameIntervalBaseline();
    }

    if (shaderChanged) {
      this.shader = update.shader;
      this.hasRecordedResize = false;
      if (this.gl && this.status !== "context-lost") {
        this.rebuildResources();
      }
    }

    if (qualityChanged || shaderChanged) {
      this.resizeFromCanvas();
    }

    if (!this.active) {
      this.cancelFrame();
    } else if (!wasActive) {
      this.lastDrawTimeMs = 0;
      this.metrics.resetRenderedFrameIntervalBaseline();
    }

    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLoss);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestoration);
    this.releaseResources(true);
    this.gl = null;
  }

  private readonly handleAnimationFrame = (timeMs: number): void => {
    this.frameHandle = 0;
    this.metrics.recordFrameRequest();
    if (!this.canDraw()) {
      return;
    }

    const intervalMs = this.targetFrameIntervalMs();
    if (
      intervalMs > 0 &&
      this.lastDrawTimeMs > 0 &&
      timeMs - this.lastDrawTimeMs + frameIntervalToleranceMs < intervalMs
    ) {
      this.metrics.recordSkippedFrame();
      this.invalidate();
      return;
    }

    const rendered = this.draw(timeMs);
    const continueAnimating = this.shouldContinue();
    if (rendered) {
      this.metrics.recordRenderedFrame(timeMs);
      this.lastDrawTimeMs = timeMs;
      if (!continueAnimating) {
        this.metrics.resetRenderedFrameIntervalBaseline();
      }
    }
    if (continueAnimating) {
      this.invalidate();
    }
  };

  private readonly handleContextLoss = (event: Event): void => {
    event.preventDefault();
    this.cancelFrame();
    this.releaseResources(false);
    this.metrics.recordContextLoss();
    this.setStatus("context-lost");
  };

  private readonly handleContextRestoration = (): void => {
    if (!this.gl) {
      this.setStatus("unavailable");
      return;
    }
    this.lastDrawTimeMs = 0;
    this.metrics.resetRenderedFrameIntervalBaseline();
    this.rebuildResources();
    this.resizeFromCanvas();
    this.invalidate();
  };

  private readonly handleResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    if (this.resize(entry.contentRect.width, entry.contentRect.height)) {
      this.invalidate();
    }
  };

  private readonly handleThemeMutation = (): void => {
    this.palette = resolveAgentShaderPalette(this.canvas.ownerDocument.documentElement);
    this.invalidate();
  };

  private initializeContext(): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "low-power",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) {
      this.setStatus("unavailable");
      return;
    }

    this.gl = gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    this.rebuildResources();
  }

  private rebuildResources(): void {
    const gl = this.gl;
    if (!gl) {
      return;
    }

    try {
      const nextProgram = createProgram(
        gl,
        vertexSource,
        fragmentSources[this.shader],
        this.metrics,
      );
      const nextVao = gl.createVertexArray();
      if (!nextVao) {
        gl.deleteProgram(nextProgram);
        throw new Error("WebGL could not create a vertex array.");
      }
      const nextUniforms = readUniforms(gl, nextProgram);

      this.releaseResources(true);
      this.program = nextProgram;
      this.vao = nextVao;
      this.uniforms = nextUniforms;
      gl.useProgram(nextProgram);
      gl.bindVertexArray(nextVao);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.setStatus("ready");
    } catch (error) {
      this.releaseResources(true);
      this.setStatus("unavailable");
      console.error("Agent WebGL prototype initialization failed.", error);
    }
  }

  private releaseResources(deleteResources: boolean): void {
    if (deleteResources && this.gl) {
      if (this.vao) {
        this.gl.deleteVertexArray(this.vao);
      }
      if (this.program) {
        this.gl.deleteProgram(this.program);
      }
    }
    this.vao = null;
    this.program = null;
    this.uniforms = null;
  }

  private resizeFromCanvas(): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    return this.resize(bounds.width, bounds.height);
  }

  private resize(cssWidth: number, cssHeight: number): boolean {
    const safeCssWidth = Math.max(1, cssWidth);
    const safeCssHeight = Math.max(1, cssHeight);
    const requestedDpr = Math.min(this.view.devicePixelRatio || 1, dprLimit);
    const requestedWidth = Math.max(1, Math.round(safeCssWidth * requestedDpr));
    const requestedHeight = Math.max(1, Math.round(safeCssHeight * requestedDpr));
    const requestedPixels = requestedWidth * requestedHeight;
    const pixelLimit = backingPixelLimit(this.quality);
    const scale = requestedPixels > pixelLimit ? Math.sqrt(pixelLimit / requestedPixels) : 1;
    const backingWidth = Math.max(1, Math.floor(requestedWidth * scale));
    const backingHeight = Math.max(1, Math.floor(requestedHeight * scale));
    const effectiveDpr = Math.min(backingWidth / safeCssWidth, backingHeight / safeCssHeight);

    const dimensionsChanged =
      this.canvas.width !== backingWidth || this.canvas.height !== backingHeight;
    if (dimensionsChanged) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.gl?.viewport(0, 0, backingWidth, backingHeight);
    }
    if (dimensionsChanged || !this.hasRecordedResize) {
      this.metrics.recordResize(backingWidth, backingHeight, effectiveDpr);
      this.hasRecordedResize = true;
    }
    return dimensionsChanged;
  }

  private invalidate(): void {
    if (this.active) {
      this.requestFrame();
      return;
    }
    this.queueStaticDraw();
  }

  private queueStaticDraw(): void {
    if (this.staticDrawQueued || !this.resourcesReady()) {
      return;
    }
    this.staticDrawQueued = true;
    this.view.queueMicrotask(() => {
      this.staticDrawQueued = false;
      if (!this.disposed && !this.active && this.resourcesReady()) {
        this.draw(this.view.performance.now());
      }
    });
  }

  private requestFrame(): void {
    if (this.frameHandle !== 0 || !this.canDraw()) {
      return;
    }
    this.frameHandle = this.view.requestAnimationFrame(this.handleAnimationFrame);
  }

  private cancelFrame(): void {
    if (this.frameHandle === 0) {
      return;
    }
    this.view.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private canDraw(): boolean {
    return this.active && this.resourcesReady();
  }

  private resourcesReady(): boolean {
    return (
      this.status === "ready" &&
      this.gl !== null &&
      this.program !== null &&
      this.uniforms !== null &&
      this.vao !== null
    );
  }

  private targetFrameIntervalMs(): number {
    if (this.fixedTimeMs !== null || this.state === "idle" || this.state === "failed") {
      return 0;
    }
    return this.state === "listening" ? listeningFrameIntervalMs : animatedFrameIntervalMs;
  }

  private shouldContinue(): boolean {
    return this.shouldAdvanceTimeline();
  }

  private shouldAdvanceTimeline(): boolean {
    if (!this.active || this.fixedTimeMs !== null) {
      return false;
    }
    if (this.state === "idle" || this.state === "failed") {
      return false;
    }
    return this.state !== "complete" || this.stateElapsedMs < completeSettleDurationMs;
  }

  private captureTimeline(timeMs: number): void {
    if (this.timelineAnchorMs === null) {
      return;
    }
    const elapsedMs = Math.max(0, timeMs - this.timelineAnchorMs);
    if (this.state === "complete") {
      const previousStateElapsedMs = this.stateElapsedMs;
      this.stateElapsedMs = Math.min(
        completeSettleDurationMs,
        previousStateElapsedMs + elapsedMs,
      );
      const phaseElapsedMs =
        completePhaseElapsedMs(this.stateElapsedMs) -
        completePhaseElapsedMs(previousStateElapsedMs);
      this.advancePhaseBasis(phaseElapsedMs, this.completeExtraClock);
    } else {
      this.stateElapsedMs += elapsedMs;
      this.advancePhaseBasis(elapsedMs, phaseExtraClockForState(this.state));
    }
    this.timelineAnchorMs = timeMs;
    if (!this.shouldAdvanceTimeline()) {
      this.timelineAnchorMs = null;
    }
  }

  private advancePhaseBasis(
    elapsedMs: number,
    extraClock: AgentPhaseExtraClock | null,
  ): void {
    this.baseAnimationElapsedMs += elapsedMs;
    switch (extraClock) {
      case "listening":
        this.listeningAnimationElapsedMs += elapsedMs;
        break;
      case "responding":
        this.respondingAnimationElapsedMs += elapsedMs;
        break;
      case "thinking":
        this.thinkingAnimationElapsedMs += elapsedMs;
        break;
      case null:
        break;
    }
  }

  private reconcileTimeline(timeMs: number): void {
    if (this.shouldAdvanceTimeline()) {
      this.timelineAnchorMs = timeMs;
    } else {
      this.timelineAnchorMs = null;
    }
  }

  private livePhaseBasis(): AgentPhaseBasis {
    return {
      baseMs: this.baseAnimationElapsedMs,
      listeningMs: this.listeningAnimationElapsedMs,
      respondingMs: this.respondingAnimationElapsedMs,
      thinkingMs: this.thinkingAnimationElapsedMs,
    };
  }

  private draw(timeMs: number): boolean {
    const gl = this.gl;
    const uniforms = this.uniforms;
    if (!gl || !this.program || !this.vao || !uniforms) {
      return false;
    }

    this.captureTimeline(timeMs);
    const phaseBasis =
      this.fixedTimeMs === null
        ? this.livePhaseBasis()
        : fixedPhaseBasis(this.state, this.fixedTimeMs);
    const renderStateTimeMs = this.fixedTimeMs ?? this.stateElapsedMs;
    const settleElapsedMs = this.state === "complete" ? renderStateTimeMs : 0;
    const settleProgress = Math.min(1, settleElapsedMs / completeSettleDurationMs);
    const palette = this.palette;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(uniforms.time, phaseBasis.baseMs / 1_000);
    gl.uniform1f(uniforms.listeningTime, phaseBasis.listeningMs / 1_000);
    gl.uniform1f(uniforms.thinkingTime, phaseBasis.thinkingMs / 1_000);
    gl.uniform1f(uniforms.respondingTime, phaseBasis.respondingMs / 1_000);
    gl.uniform1f(uniforms.state, visualStateValue(this.state));
    gl.uniform1f(uniforms.progress, settleProgress);
    gl.uniform1f(uniforms.quality, qualityValue(this.quality));
    gl.uniform1f(uniforms.effects, this.advancedEffects ? 1 : 0);
    gl.uniform3f(
      uniforms.background,
      palette.background[0],
      palette.background[1],
      palette.background[2],
    );
    gl.uniform3f(uniforms.primary, palette.primary[0], palette.primary[1], palette.primary[2]);
    gl.uniform3f(
      uniforms.secondary,
      palette.secondary[0],
      palette.secondary[1],
      palette.secondary[2],
    );
    gl.uniform3f(
      uniforms.tertiary,
      palette.tertiary[0],
      palette.tertiary[1],
      palette.tertiary[2],
    );
    const submissionStartedAtMs = this.view.performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.metrics.recordDraw(this.view.performance.now() - submissionStartedAtMs);
    return true;
  }

  private setStatus(status: AgentWebGLRuntimeStatus): void {
    if (status === this.status) {
      return;
    }
    this.status = status;
    this.onStatusChange(status);
  }

}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string,
  metrics: PrototypeMetricsCollector,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource, metrics);
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource, metrics);
    program = gl.createProgram();
    if (!program) {
      throw new Error("WebGL could not create a shader program.");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "WebGL shader program linking failed.");
    }
    return program;
  } catch (error) {
    if (program) {
      gl.deleteProgram(program);
    }
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) {
      gl.deleteShader(fragmentShader);
    }
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  metrics: PrototypeMetricsCollector,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("WebGL could not create a shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  metrics.recordShaderCompile();
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "WebGL shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function readUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): AgentUniforms {
  return {
    background: gl.getUniformLocation(program, "u_background"),
    effects: gl.getUniformLocation(program, "u_effects"),
    listeningTime: gl.getUniformLocation(program, "u_listening_time"),
    primary: gl.getUniformLocation(program, "u_primary"),
    progress: gl.getUniformLocation(program, "u_progress"),
    quality: gl.getUniformLocation(program, "u_quality"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    respondingTime: gl.getUniformLocation(program, "u_responding_time"),
    secondary: gl.getUniformLocation(program, "u_secondary"),
    state: gl.getUniformLocation(program, "u_state"),
    tertiary: gl.getUniformLocation(program, "u_tertiary"),
    thinkingTime: gl.getUniformLocation(program, "u_thinking_time"),
    time: gl.getUniformLocation(program, "u_time"),
  };
}

function phaseExtraClockForState(state: AgentVisualState): AgentPhaseExtraClock | null {
  switch (state) {
    case "listening":
      return "listening";
    case "responding":
      return "responding";
    case "thinking":
      return "thinking";
    case "complete":
    case "failed":
    case "idle":
      return null;
    default:
      return assertNever(state);
  }
}

function completePhaseElapsedMs(stateElapsedMs: number): number {
  const elapsedMs = Math.min(completeSettleDurationMs, Math.max(0, stateElapsedMs));
  return elapsedMs - (elapsedMs * elapsedMs) / (2 * completeSettleDurationMs);
}

function fixedPhaseBasis(state: AgentVisualState, fixedTimeMs: number): AgentPhaseBasis {
  const emptyBasis = {
    baseMs: 0,
    listeningMs: 0,
    respondingMs: 0,
    thinkingMs: 0,
  } satisfies AgentPhaseBasis;
  switch (state) {
    case "listening":
      return { ...emptyBasis, baseMs: fixedTimeMs, listeningMs: fixedTimeMs };
    case "thinking":
      return { ...emptyBasis, baseMs: fixedTimeMs, thinkingMs: fixedTimeMs };
    case "responding":
      return { ...emptyBasis, baseMs: fixedTimeMs, respondingMs: fixedTimeMs };
    case "complete":
      // Fixed-time complete has no prior-state history, so use a deterministic base-only settle.
      return { ...emptyBasis, baseMs: completePhaseElapsedMs(fixedTimeMs) };
    case "failed":
    case "idle":
      return emptyBasis;
    default:
      return assertNever(state);
  }
}

function backingPixelLimit(quality: PrototypeQuality): number {
  switch (quality) {
    case "low":
      return 480_000;
    case "standard":
      return 921_600;
    case "high":
      return 2_073_600;
    default:
      return assertNever(quality);
  }
}

function qualityValue(quality: PrototypeQuality): number {
  switch (quality) {
    case "low":
      return 0.7;
    case "standard":
      return 1;
    case "high":
      return 1.3;
    default:
      return assertNever(quality);
  }
}

function visualStateValue(state: AgentVisualState): number {
  switch (state) {
    case "idle":
      return 0;
    case "listening":
      return 1;
    case "thinking":
      return 2;
    case "responding":
      return 3;
    case "complete":
      return 4;
    case "failed":
      return 5;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported agent WebGL value: ${String(value)}`);
}
