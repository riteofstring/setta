import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";

// The capability seam (extraction seam 4): the reference's `useShareCapabilities` collapses to
// the two capabilities the Phase 1 slice consumes. `canEditLayout` gates drag, resize, and lock;
// `canEditStructure` gates delete and title editing. Hosts set these; the package defaults to
// fully editable, matching the reference's owner session.
export type WorkspaceCapabilitiesState = {
  canEditLayout: boolean;
  canEditStructure: boolean;
};

export const useWorkspaceCapabilities = createWithEqualityFn(
  withResetFn<WorkspaceCapabilitiesState>(() => ({
    canEditLayout: true,
    canEditStructure: true,
  })),
);
