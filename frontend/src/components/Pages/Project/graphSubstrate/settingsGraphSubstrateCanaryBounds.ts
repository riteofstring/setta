import type { ObservedSectionElementSizes } from "state/hooks/observedSectionElementSizes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { GraphRect } from "./viewportTransform";

export function getSettingsGraphSubstrateCanarySceneBounds(
  sections: Array<GraphSubstrateCanarySection>,
  observedElementSizes: ObservedSectionElementSizes,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): GraphRect | null {
  return resolveSettingsGraphSubstrateCanarySceneSnapshot(
    sections,
    observedElementSizes,
    sectionPositionOverride,
  ).sceneBounds;
}
