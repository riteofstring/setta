import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentControlRenderOwner =
  | "canvas-owned"
  | "dom-owned"
  | "gpu-native";

type RetainedDomControlLifecycleState =
  | "unmounted"
  | "passive-projected"
  | "active-projected"
  | "active-editing"
  | "detaching";

type RetainedDomControlLayerSlot =
  | "dom-control-plane"
  | "active-dom-control-plane";

type GpuRetainedDomControlInteractionPolicy = {
  readonly click: "activate";
  readonly drag: "viewport-pan-or-text-selection";
  readonly focus: "active-only";
  readonly keyboard: "active-dom-control";
  readonly pointerEvents: "active-only";
  readonly wheel: "retained-scroll-or-editor-scroll";
};

export type GpuRetainedTextSnapshotCacheKey = {
  readonly appThemeRevision: string;
  readonly codeMirrorThemeRevision: string;
  readonly cssStyleRevision: string;
  readonly defaultValue: string;
  readonly devicePixelRatioBucket: number;
  readonly disabled: boolean;
  readonly editorExtensionGeneration: string;
  readonly editorKind: "code" | "text" | "textarea";
  readonly error: boolean;
  readonly fontGeneration: string;
  readonly language: string | null;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly measuredLayoutMode: "multiline" | "single-line";
  readonly placeholder: string;
  readonly rendererFamily: string;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly syntaxGeneration: string;
  readonly value: string;
  readonly wrapLines: boolean;
  readonly zoomBucket: number;
};

export type GpuRetainedDomControlVisualSemantics = {
  readonly accessibility: "active-browser-editor" | "visual-only-aria-hidden";
  readonly focusable: boolean;
  readonly pointer: "active-browser-editor" | "retained-activation-model";
  readonly selectable: "browser-editor" | "none";
};

type GpuRetainedDomControlProjectionVisibility =
  | "viewport-visible"
  | "overscan-visible"
  | "outside-viewport"
  | "clipped-empty";

type GpuRetainedDomControlVisualPolicy =
  | "live-dom"
  | "snapshot"
  | "blocked-awaiting-browser-visual"
  | "outside-viewport"
  | "clipped-empty";

export type GpuRetainedDomControlActivation = {
  readonly clientPoint: {
    readonly x: number;
    readonly y: number;
  };
  readonly kind: "keyboard" | "pointer";
};

export type GpuRetainedDomControlSourceDescriptor = {
  readonly active: boolean;
  readonly activation?: GpuRetainedDomControlActivation | undefined;
  readonly clipRectSurfaceCssPx: GpuRect;
  readonly clipChainRevision: string;
  readonly controlId: string;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly defaultValue: string;
  readonly disabled: boolean;
  readonly editorKind: "code" | "text" | "textarea";
  readonly error: boolean;
  readonly geometryRevision: string;
  readonly interactionPolicy: GpuRetainedDomControlInteractionPolicy;
  readonly language: string | null;
  readonly layerSlot: RetainedDomControlLayerSlot;
  readonly lifecycleState: RetainedDomControlLifecycleState;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly rendererFamily: string;
  readonly role: "text-like";
  readonly rowId: string;
  readonly sectionClipRectFlowPx: GpuRect;
  readonly sectionId: string;
  readonly sectionScrollOffset: {
    readonly x: number;
    readonly y: number;
  };
  readonly sectionScrollRevision: number;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceRectCssPx: GpuRect;
  readonly projectionVisibility: GpuRetainedDomControlProjectionVisibility;
  readonly snapshotSurfaceId: string | null;
  readonly surfaceId: string;
  readonly value: string;
  readonly snapshotCacheKey: GpuRetainedTextSnapshotCacheKey;
  readonly snapshotCacheKeyRevision: string;
  readonly valueStyleKey: string;
  readonly valueStyleRevision: string;
  readonly viewportRectCssPx: GpuRect;
  readonly viewportSampleRevision: string;
  readonly visualPolicy: GpuRetainedDomControlVisualPolicy;
  readonly visualSemantics: GpuRetainedDomControlVisualSemantics;
  readonly worldRectFlowPx: GpuRect;
  readonly wrapLines: boolean;
  readonly zOrder: number;
};

export const GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY: GpuRetainedDomControlInteractionPolicy =
  Object.freeze({
    click: "activate",
    drag: "viewport-pan-or-text-selection",
    focus: "active-only",
    keyboard: "active-dom-control",
    pointerEvents: "active-only",
    wheel: "retained-scroll-or-editor-scroll",
  });
