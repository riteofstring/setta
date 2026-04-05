import { withProjectState, withResetFn } from "state/utils";
import { createWithEqualityFn } from "zustand/traditional";
import {
  createEmptySettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanarySectionSeedNodes,
  type SettingsGraphSubstrateCanarySectionSeedNodes,
} from "./settingsGraphSubstrateCanarySectionSeedNodes";

type ZustandSettingsGraphSubstrateCanarySceneStore = {
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  sectionSeedNodes: SettingsGraphSubstrateCanarySectionSeedNodes;
};

export const useSettingsGraphSubstrateCanarySceneStore = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandSettingsGraphSubstrateCanarySceneStore>(() => ({
      sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
      sectionSeedNodes: new Map(),
    })),
  ),
);

export function updateSettingsGraphSubstrateCanarySceneSnapshot(
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot,
) {
  useSettingsGraphSubstrateCanarySceneStore.setState((state) => ({
    sceneSnapshot,
    sectionSeedNodes: resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      state.sectionSeedNodes,
      sceneSnapshot,
    ),
  }));
}

export function resetSettingsGraphSubstrateCanarySceneSnapshot() {
  useSettingsGraphSubstrateCanarySceneStore.setState((state) => ({
    sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
    sectionSeedNodes: state.sectionSeedNodes,
  }));
}
