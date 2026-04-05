import { withProjectState, withResetFn } from "state/utils";
import { createWithEqualityFn } from "zustand/traditional";
import {
  createEmptySettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";

type ZustandSettingsGraphSubstrateCanarySceneStore = {
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
};

export const useSettingsGraphSubstrateCanarySceneStore = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandSettingsGraphSubstrateCanarySceneStore>(() => ({
      sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
    })),
  ),
);

export function setSettingsGraphSubstrateCanarySceneSnapshot(
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot,
) {
  useSettingsGraphSubstrateCanarySceneStore.setState({ sceneSnapshot });
}

export function resetSettingsGraphSubstrateCanarySceneSnapshot() {
  useSettingsGraphSubstrateCanarySceneStore.setState({
    sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
  });
}
