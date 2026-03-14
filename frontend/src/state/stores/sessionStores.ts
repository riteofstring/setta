import { SharePolicy } from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type ShareSessionState = {
  isDeploymentMode: boolean;
  shareSessionId: string | null;
  sessionRunCount: number;
  sharePolicy: SharePolicy | null;
  shareDeploymentName: string | null;
  shareDeploymentVersion: string | null;
  deploymentMode: "share" | "app" | null;
};

export const useShareSession = withProjectState(
  createWithEqualityFn(
    withResetFn<ShareSessionState>(() => ({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    })),
  ),
);

type ServerModeState = {
  mode: "ide" | "share" | "app" | "launcher" | null;
  modeResolved: boolean;
  modeError: string | null;
};

export const useServerMode = createWithEqualityFn<ServerModeState>(() => ({
  mode: null,
  modeResolved: false,
  modeError: null,
}));
