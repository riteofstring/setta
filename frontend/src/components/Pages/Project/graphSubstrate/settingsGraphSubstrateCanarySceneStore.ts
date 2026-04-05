import { withProjectState, withResetFn } from "state/utils";
import { createWithEqualityFn } from "zustand/traditional";
import {
  createEmptySettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import { type SettingsGraphSubstrateCanarySectionSeedNodes } from "./settingsGraphSubstrateCanarySectionSeedNodes";

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
  sectionSeedNodes: SettingsGraphSubstrateCanarySectionSeedNodes,
) {
  useSettingsGraphSubstrateCanarySceneStore.setState(() => ({
    sceneSnapshot,
    sectionSeedNodes,
  }));
}

export function resetSettingsGraphSubstrateCanarySceneSnapshot() {
  useSettingsGraphSubstrateCanarySceneStore.setState(() => ({
    sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
    sectionSeedNodes: new Map(),
  }));
}
