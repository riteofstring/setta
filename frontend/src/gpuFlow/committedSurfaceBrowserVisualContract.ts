import type { BrowserVisualActor } from "./surfaceCompositor/browserVisualActorAdapter";

export type GpuFlowCommittedSurfaceBrowserVisualContract = Pick<
  BrowserVisualActor,
  | "coverageExemption"
  | "coverageRequired"
  | "coverageState"
  | "nonemptyReason"
  | "proof"
  | "readinessFaultInjected"
  | "representation"
  | "representationKind"
  | "resourceHandles"
  | "visibilityReason"
>;
