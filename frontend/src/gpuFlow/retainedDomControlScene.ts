import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentControlRenderOwner =
  | "canvas-owned"
  | "dom-owned"
  | "gpu-native";

export type RetainedDomControlLifecycleState =
  | "unmounted"
  | "mounted-paint-pending"
  | "passive-texture-pending"
  | "passive-committed"
  | "active-preparing"
  | "active-projected"
  | "active-editing"
  | "detaching"
  | "parked";

export type RetainedDomControlLayerSlot =
  | "structural-base"
  | "passive-dom-control"
  | "structural-foreground"
  | "active-occlusion"
  | "active-projected-source"
  | "native-overlay";

export type GpuRetainedDomControlInteractionPolicy = {
  readonly click: "activate";
  readonly drag: "viewport-pan-or-text-selection";
  readonly focus: "active-only";
  readonly keyboard: "active-dom-control";
  readonly pointerEvents: "active-only";
  readonly wheel: "retained-scroll-or-editor-scroll";
};

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
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly defaultValue: string;
  readonly disabled: boolean;
  readonly editorKind: "code" | "text" | "textarea";
  readonly error: boolean;
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
  readonly sectionId: string;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceRectCssPx: GpuRect;
  readonly surfaceId: string;
  readonly textureRectCssPx: GpuRect;
  readonly textureRectDevicePx: GpuRect;
  readonly value: string;
  readonly valueStyleKey: string;
  readonly viewportRectCssPx: GpuRect;
  readonly worldRectFlowPx: GpuRect;
  readonly wrapLines: boolean;
  readonly zOrder: number;
};

export type GpuRetainedDomControlTextureDescriptor = {
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly rectCss: GpuRect;
  readonly rowId: string;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly textureRectDevicePx: GpuRect;
};

export type GpuRetainedDomControlPublishedVisual =
  | "none"
  | "previous-coherent-frame"
  | "passive-dom-control-texture"
  | "live-projected-source"
  | "diagnosed-cold-blank";

export type GpuRetainedDomControlPublicationDecision =
  | "none"
  | "passive-texture"
  | "live-projected-source"
  | "hold-previous"
  | "cold-blank";

export type GpuRetainedDomControlPublicationState = {
  readonly activeOcclusionReady: boolean;
  readonly activeProjectionReady: boolean;
  readonly blockingReasons: readonly string[];
  readonly coldBlankReason: string | null;
  readonly decision: GpuRetainedDomControlPublicationDecision;
  readonly heldTransactionReason: string | null;
  readonly passiveTextureReady: boolean;
  readonly previousCoherentFrameAvailable: boolean;
  readonly selectedVisual: GpuRetainedDomControlPublishedVisual;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourcePaintReady: boolean;
  readonly stalePassiveUnderActivePrevented: boolean;
  readonly textureUploadReady: boolean;
};

export type GpuRetainedDomControlPublicationInput = {
  readonly activeOcclusionReady: boolean;
  readonly activeProjectionReady: boolean;
  readonly gestureOwnershipReady: boolean;
  readonly passiveTextureReady: boolean;
  readonly previousCoherentFrameAvailable: boolean;
  readonly source: Pick<
    GpuRetainedDomControlSourceDescriptor,
    "active" | "lifecycleState" | "sourceId" | "sourceKey"
  >;
  readonly sourcePaintReady: boolean;
  readonly textureUploadReady: boolean;
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

export function resolveGpuRetainedDomControlPublicationState({
  activeOcclusionReady,
  activeProjectionReady,
  gestureOwnershipReady,
  passiveTextureReady,
  previousCoherentFrameAvailable,
  source,
  sourcePaintReady,
  textureUploadReady,
}: GpuRetainedDomControlPublicationInput): GpuRetainedDomControlPublicationState {
  const blockingReasons = source.active
    ? activeDomControlPublicationBlockingReasons({
        activeOcclusionReady,
        activeProjectionReady,
        gestureOwnershipReady,
        sourcePaintReady,
      })
    : passiveDomControlPublicationBlockingReasons({
        passiveTextureReady,
        sourcePaintReady,
        textureUploadReady,
      });
  if (blockingReasons.length === 0) {
    return freezeGpuRetainedDomControlPublicationState({
      activeOcclusionReady,
      activeProjectionReady,
      blockingReasons,
      coldBlankReason: null,
      decision: source.active ? "live-projected-source" : "passive-texture",
      heldTransactionReason: null,
      passiveTextureReady,
      previousCoherentFrameAvailable,
      selectedVisual: source.active
        ? "live-projected-source"
        : "passive-dom-control-texture",
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      sourcePaintReady,
      stalePassiveUnderActivePrevented: source.active,
      textureUploadReady,
    });
  }
  const blockedReason = blockingReasons.join(",");
  if (previousCoherentFrameAvailable) {
    return freezeGpuRetainedDomControlPublicationState({
      activeOcclusionReady,
      activeProjectionReady,
      blockingReasons,
      coldBlankReason: null,
      decision: "hold-previous",
      heldTransactionReason: blockedReason,
      passiveTextureReady,
      previousCoherentFrameAvailable,
      selectedVisual: "previous-coherent-frame",
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      sourcePaintReady,
      stalePassiveUnderActivePrevented: source.active,
      textureUploadReady,
    });
  }
  return freezeGpuRetainedDomControlPublicationState({
    activeOcclusionReady,
    activeProjectionReady,
    blockingReasons,
    coldBlankReason: blockedReason,
    decision: "cold-blank",
    heldTransactionReason: null,
    passiveTextureReady,
    previousCoherentFrameAvailable,
    selectedVisual: "diagnosed-cold-blank",
    sourceId: source.sourceId,
    sourceKey: source.sourceKey,
    sourcePaintReady,
    stalePassiveUnderActivePrevented: source.active && activeOcclusionReady,
    textureUploadReady,
  });
}

function activeDomControlPublicationBlockingReasons({
  activeOcclusionReady,
  activeProjectionReady,
  gestureOwnershipReady,
  sourcePaintReady,
}: {
  readonly activeOcclusionReady: boolean;
  readonly activeProjectionReady: boolean;
  readonly gestureOwnershipReady: boolean;
  readonly sourcePaintReady: boolean;
}): readonly string[] {
  const reasons: string[] = [];
  if (!sourcePaintReady) {
    reasons.push("source-paint-pending");
  }
  if (!activeProjectionReady) {
    reasons.push("active-projection-pending");
  }
  if (!activeOcclusionReady) {
    reasons.push("active-occlusion-pending");
  }
  if (!gestureOwnershipReady) {
    reasons.push("gesture-ownership-pending");
  }
  return reasons;
}

function passiveDomControlPublicationBlockingReasons({
  passiveTextureReady,
  sourcePaintReady,
  textureUploadReady,
}: {
  readonly passiveTextureReady: boolean;
  readonly sourcePaintReady: boolean;
  readonly textureUploadReady: boolean;
}): readonly string[] {
  const reasons: string[] = [];
  if (!sourcePaintReady) {
    reasons.push("source-paint-pending");
  }
  if (!passiveTextureReady) {
    reasons.push("passive-texture-pending");
  }
  if (!textureUploadReady) {
    reasons.push("texture-upload-pending");
  }
  return reasons;
}

function freezeGpuRetainedDomControlPublicationState(
  state: GpuRetainedDomControlPublicationState,
): GpuRetainedDomControlPublicationState {
  return Object.freeze({
    ...state,
    blockingReasons: Object.freeze([...state.blockingReasons]),
  });
}
