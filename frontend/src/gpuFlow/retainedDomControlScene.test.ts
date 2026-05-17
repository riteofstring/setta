import { describe, expect, it } from "vitest";

import {
  resolveGpuRetainedDomControlPublicationState,
  type GpuRetainedDomControlPublicationInput,
} from "./retainedDomControlScene";

describe("retained DOM-control publication resolver", () => {
  it("publishes passive controls from ready DOM-control textures", () => {
    const state = resolveGpuRetainedDomControlPublicationState(
      publicationInput({
        passiveTextureReady: true,
        source: passiveSource(),
        textureUploadReady: true,
      }),
    );

    expect(state.decision).toBe("passive-texture");
    expect(state.selectedVisual).toBe("passive-dom-control-texture");
    expect(state.blockingReasons).toEqual([]);
  });

  it("publishes active controls only after projection, occlusion, and gesture ownership are ready", () => {
    const state = resolveGpuRetainedDomControlPublicationState(
      publicationInput({
        activeOcclusionReady: true,
        activeProjectionReady: true,
        gestureOwnershipReady: true,
        source: activeSource(),
      }),
    );

    expect(state.decision).toBe("live-projected-source");
    expect(state.selectedVisual).toBe("live-projected-source");
    expect(state.stalePassiveUnderActivePrevented).toBe(true);
  });

  it("holds the previous coherent frame when warm active publication is blocked", () => {
    const state = resolveGpuRetainedDomControlPublicationState(
      publicationInput({
        activeProjectionReady: true,
        gestureOwnershipReady: true,
        previousCoherentFrameAvailable: true,
        source: activeSource(),
      }),
    );

    expect(state.decision).toBe("hold-previous");
    expect(state.selectedVisual).toBe("previous-coherent-frame");
    expect(state.heldTransactionReason).toBe("active-occlusion-pending");
    expect(state.coldBlankReason).toBeNull();
  });

  it("diagnoses a cold blank only when no previous coherent frame exists", () => {
    const state = resolveGpuRetainedDomControlPublicationState(
      publicationInput({
        source: passiveSource(),
      }),
    );

    expect(state.decision).toBe("cold-blank");
    expect(state.selectedVisual).toBe("diagnosed-cold-blank");
    expect(state.coldBlankReason).toBe(
      "passive-texture-pending,texture-upload-pending",
    );
  });
});

function publicationInput(
  overrides: Partial<GpuRetainedDomControlPublicationInput> = {},
): GpuRetainedDomControlPublicationInput {
  return {
    activeOcclusionReady: false,
    activeProjectionReady: false,
    gestureOwnershipReady: false,
    passiveTextureReady: false,
    previousCoherentFrameAvailable: false,
    source: passiveSource(),
    sourcePaintReady: true,
    textureUploadReady: false,
    ...overrides,
  };
}

function passiveSource(): GpuRetainedDomControlPublicationInput["source"] {
  return {
    active: false,
    lifecycleState: "passive-texture-pending",
    sourceId: "source-a",
    sourceKey: "source-key-a",
  };
}

function activeSource(): GpuRetainedDomControlPublicationInput["source"] {
  return {
    active: true,
    lifecycleState: "active-projected",
    sourceId: "source-a",
    sourceKey: "source-key-a",
  };
}
