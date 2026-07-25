export type PrototypeCategory = "niri-background" | "agent-form" | "thinking-backdrop";

export type AgentVisualState =
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "complete"
  | "failed";

export type PrototypeQuality = "low" | "standard" | "high";

export type NiriGridMode = "off" | "fixed" | "spatial";

export type NiriBackgroundVariant =
  | "veil-drift"
  | "nebula-fold"
  | "dust-parallax"
  | "aurora-current";

export type AgentShaderID =
  | "orbital-lattice"
  | "folding-bloom"
  | "thought-knot"
  | "signal-polyhedron"
  | "quantum-lens"
  | "conversation-constellation";

export type ThinkingBackdropVariant =
  | "raster-echo"
  | "redacted-stream"
  | "peripheral-chorus"
  | "scanline-palimpsest";

export type PrototypeRenderer =
  | { kind: "css"; variant: NiriBackgroundVariant }
  | { kind: "webgl2"; shader: AgentShaderID }
  | { kind: "canvas2d"; variant: ThinkingBackdropVariant };

export interface PrototypeDefinition {
  accessibilityDescription: string;
  category: PrototypeCategory;
  description: string;
  id: string;
  motionCost: "compositor-only" | "bounded-webgl" | "redraw-on-change";
  name: string;
  renderer: PrototypeRenderer;
  supportsAgentState: boolean;
}

export interface PrototypeMetricsSnapshot {
  active: boolean;
  backingHeight: number;
  backingWidth: number;
  contextLosses: number;
  drawCalls: number;
  effectiveDpr: number;
  frameRequests: number;
  longTasks: number;
  maxDrawSubmissionMs: number;
  maxFrameIntervalMs: number;
  p50FrameIntervalMs: number;
  p95DrawSubmissionMs: number;
  p95FrameIntervalMs: number;
  p99FrameIntervalMs: number;
  prototypeId: string;
  resizeCount: number;
  runtime: PrototypeRenderer["kind"];
  shaderCompiles: number;
  skippedFrames: number;
}

export interface PrototypeGalleryDebugBridge {
  getMetrics: () => PrototypeMetricsSnapshot;
  pause: (paused: boolean) => void;
  seek: (timeMs: number | null) => void;
  select: (prototypeId: string) => boolean;
  setAdvancedEffects: (enabled: boolean) => void;
  setAgentState: (state: AgentVisualState) => void;
  setGridMode: (mode: NiriGridMode) => void;
}
