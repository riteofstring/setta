import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type RunMode = "once" | "continuous";

export type CustomRunAction =
  | { type: "runCodeBlock"; sectionId: string | null }
  | { type: "triggerListenerForceRefresh" };

export type CustomRunItem = {
  id: string;
  name: string;
  includeInRunDropdown: boolean;
  runMode: RunMode;
  action: CustomRunAction;
};

type ZustandRunControl = {
  runMode: RunMode;
  continuousRunStarted: boolean;
  continuousRunCustomRunId: string | null;
};

export const useRunControl = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandRunControl>(() => ({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    })),
  ),
);

type ProjectLoadingState = {
  projectIsLoading: boolean;
  projectIs404: boolean;
};

export const useProjectLoading = createWithEqualityFn(
  withResetFn<ProjectLoadingState>(() => ({
    projectIsLoading: false,
    projectIs404: false,
  })),
);
