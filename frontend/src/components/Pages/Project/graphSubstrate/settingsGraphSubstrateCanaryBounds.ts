import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { GraphRect } from "./viewportTransform";

export function getSettingsGraphSubstrateCanarySceneBounds(
  sections: Array<GraphSubstrateCanarySection>,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): GraphRect | null {
  return resolveSettingsGraphSubstrateCanarySceneSnapshot(
    sections,
    sectionPositionOverride,
  ).sceneBounds;
}
