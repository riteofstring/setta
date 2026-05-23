import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { BrowserVisualActorCoverageState } from "./browserVisualActorAdapter";
import { requiresLiveDomControlTextActorRepresentation } from "./browserVisualActorRepresentation";

type BrowserVisualActorRequiredVisualProof = "browser-visual" | "none";

type BrowserVisualActorActualVisualProof =
  | "blocked"
  | "compatible-previous"
  | "exact-live-host"
  | "exact-snapshot"
  | "not-required"
  | "same-live-host-compatible-projection";

type BrowserVisualActorInteractionProof =
  | "active-editor-live"
  | "blocked"
  | "inactive-visual-only"
  | "live-focusable"
  | "live-hit-compatible"
  | "none"
  | "not-required";

export type BrowserVisualActorProof = {
  readonly actualInteraction: BrowserVisualActorInteractionProof;
  readonly actualVisual: BrowserVisualActorActualVisualProof;
  readonly requiredInteraction: BrowserVisualActorInteractionProof;
  readonly requiredVisual: BrowserVisualActorRequiredVisualProof;
};

export function createDomControlBrowserVisualActorProof({
  control,
  coverageRequired,
  coverageState,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageRequired: boolean;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserVisualActorProof {
  const requiredInteraction = getDomControlRequiredInteractionProof({
    control,
    coverageRequired,
  });
  const actualVisual = getBrowserVisualActorActualVisualProof(coverageState);
  return freezeBrowserVisualActorProof({
    actualInteraction: getActualInteractionProof({
      actualVisual,
      requiredInteraction,
    }),
    actualVisual,
    requiredInteraction,
    requiredVisual: coverageRequired ? "browser-visual" : "none",
  });
}

export function createDomIslandBrowserVisualActorProof({
  coverageRequired,
  coverageState,
}: {
  readonly coverageRequired: boolean;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserVisualActorProof {
  const actualVisual = getBrowserVisualActorActualVisualProof(coverageState);
  const requiredInteraction = coverageRequired ? "live-hit-compatible" : "none";
  return freezeBrowserVisualActorProof({
    actualInteraction: getActualInteractionProof({
      actualVisual,
      requiredInteraction,
    }),
    actualVisual,
    requiredInteraction,
    requiredVisual: coverageRequired ? "browser-visual" : "none",
  });
}

function getDomControlRequiredInteractionProof({
  control,
  coverageRequired,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageRequired: boolean;
}): BrowserVisualActorInteractionProof {
  if (!coverageRequired) {
    return "none";
  }
  if (requiresLiveDomControlTextActorRepresentation(control)) {
    return "active-editor-live";
  }
  if (control.visualSemantics.focusable) {
    return "live-focusable";
  }
  if (control.visualSemantics.pointer === "active-browser-editor") {
    return "live-hit-compatible";
  }
  return "inactive-visual-only";
}

function getBrowserVisualActorActualVisualProof(
  coverageState: BrowserVisualActorCoverageState,
): BrowserVisualActorActualVisualProof {
  switch (coverageState) {
    case "live-host-ready":
      return "exact-live-host";
    case "exact-snapshot-ready":
      return "exact-snapshot";
    case "compatible-previous-ready":
      return "compatible-previous";
    case "coverage-exempt":
      return "not-required";
    case "blocked-awaiting-live-host":
    case "blocked-awaiting-snapshot":
    case "true-hole":
      return "blocked";
  }
}

function getActualInteractionProof({
  actualVisual,
  requiredInteraction,
}: {
  readonly actualVisual: BrowserVisualActorActualVisualProof;
  readonly requiredInteraction: BrowserVisualActorInteractionProof;
}): BrowserVisualActorInteractionProof {
  if (requiredInteraction === "none") {
    return "not-required";
  }
  if (actualVisual === "blocked" || actualVisual === "not-required") {
    return "blocked";
  }
  if (requiredInteraction === "inactive-visual-only") {
    return "inactive-visual-only";
  }
  if (
    actualVisual === "exact-live-host" ||
    actualVisual === "same-live-host-compatible-projection"
  ) {
    return requiredInteraction;
  }
  return "blocked";
}

function freezeBrowserVisualActorProof(
  proof: BrowserVisualActorProof,
): BrowserVisualActorProof {
  return Object.freeze({ ...proof });
}
