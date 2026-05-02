import { type GpuNodePointerHandoffTarget } from "../activeNodeTargeting";

import type { DirtyNodeReason, NodeTexturePriority } from "../dirtyTracking";

import type { GpuFrameReason } from "../gpuRenderer";

import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";

export type GpuNodeInteractionFrameResult = {
  readonly budgetExhausted: boolean;
  readonly remainingDirtyNodeIds: readonly string[];
  readonly uploadedNodeIds: readonly string[];
};

export type GpuNodeInteractionState = {
  readonly activeNodeId: string | null;
};

export type GpuNodeInteractionDirtyController = {
  attach(canvas: HTMLElement, ownerDocument?: Document): () => void;
  clearNode(nodeId: string): void;
  completeFrame(result: GpuNodeInteractionFrameResult): void;
  getActiveNodeId(): string | null;
};

export type GpuNodeInteractionDirtyControllerOptions = {
  readonly deferPassiveDirty?: (() => boolean) | undefined;
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly getFrame: () => number;
  readonly onStateChange?:
    | ((state: GpuNodeInteractionState) => void)
    | undefined;
  readonly projectPointerInteraction?:
    | ((nodeId: string, event: PointerEvent) => void)
    | undefined;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly resolvePointerHandoffTarget?:
    | ((event: PointerEvent) => GpuNodePointerHandoffTarget | null)
    | undefined;
  readonly resolveWheelHandoffTarget?:
    | ((event: WheelEvent) => GpuNodePointerHandoffTarget | null)
    | undefined;
  readonly textureManager: () => Pick<
    HtmlSurfaceTextureManager,
    "markSurfaceTextureDirty" | "setSurfaceTexturePriority"
  > | null;
};

export type DirtyEventKind =
  | "focus"
  | "input"
  | "pointer"
  | "scroll"
  | "selection";

export type MarkInteractionDirtyInput = {
  readonly nodeId: string;
  readonly priority: NodeTexturePriority;
  readonly reason: DirtyNodeReason;
};

export type NodeInteractionStatePatch = {
  readonly activeNodeId?: string | null | undefined;
  readonly releaseAfterUploadNodeId?: string | null | undefined;
};

export type PendingPointerHandoffClick = {
  readonly pointerId: number;
  readonly target: HTMLElement;
};

export const GPU_FLOW_NODE_SELECTOR = '[data-gpu-flow-node="true"]';

export const GPU_FLOW_MOUSE_ACTIVATION_SELECTOR =
  '[data-gpu-flow-activation="mousedown"]';

export const GPU_FLOW_PERSISTENT_FOCUS_SELECTOR = [
  "iframe",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-section-main-editor]",
  "[role='searchbox']",
  "[role='textbox']",
  ".cm-content",
  ".cm-editor",
  ".xterm",
  ".xterm-screen",
].join(",");

export const TRUSTED_POINTER_HANDOFF_CLICK_SUPPRESSION_MS = 120;

export const WHEEL_LINE_DELTA_PX = 20;
