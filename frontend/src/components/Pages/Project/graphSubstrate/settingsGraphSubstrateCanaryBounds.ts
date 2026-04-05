import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanaryObservedElementSizes,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { GraphRect } from "./viewportTransform";

export function getSettingsGraphSubstrateCanarySceneBounds(
  sections: Array<GraphSubstrateCanarySection>,
  observedElementSizes: SettingsGraphSubstrateCanaryObservedElementSizes,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): GraphRect | null {
  return resolveSettingsGraphSubstrateCanarySceneSnapshot(
    sections,
    observedElementSizes,
    sectionPositionOverride,
  ).sceneBounds;
}
