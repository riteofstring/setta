import { useState } from "react";
import { type SettingsGraphSubstrateCanarySectionPositionOverride } from "./settingsGraphSubstrateCanarySceneSnapshot";

export type SettingsGraphSubstrateCanarySceneState = {
  draggingSectionId: string | null;
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride;
  setDraggingSectionId: (sectionId: string | null) => void;
  setSectionPositionOverride: (
    override: SettingsGraphSubstrateCanarySectionPositionOverride,
  ) => void;
};

export function useSettingsGraphSubstrateCanarySceneState(): SettingsGraphSubstrateCanarySceneState {
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [sectionPositionOverride, setSectionPositionOverride] =
    useState<SettingsGraphSubstrateCanarySectionPositionOverride>(null);

  return {
    draggingSectionId,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  };
}
