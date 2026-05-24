import type { BrowserVisualActor } from "./surfaceCompositor/browserVisualActorAdapter";

export type GpuFlowPreparedContentBrowserVisualContract = Pick<
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
