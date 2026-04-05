import { useMemo, useState } from "react";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { type SettingsGraphSubstrateCanarySectionPositionOverride } from "./settingsGraphSubstrateCanarySceneSnapshot";

export type SettingsGraphSubstrateCanarySceneState = {
  draggingSectionId: string | null;
  sectionById: Map<string, GraphSubstrateCanarySection>;
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride;
  setDraggingSectionId: (sectionId: string | null) => void;
  setSectionPositionOverride: (
    override: SettingsGraphSubstrateCanarySectionPositionOverride,
  ) => void;
};

export function useSettingsGraphSubstrateCanarySceneState(
  sections: Array<GraphSubstrateCanarySection>,
): SettingsGraphSubstrateCanarySceneState {
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [sectionPositionOverride, setSectionPositionOverride] =
    useState<SettingsGraphSubstrateCanarySectionPositionOverride>(null);
  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.sectionId, section]));
  }, [sections]);

  return {
    draggingSectionId,
    sectionById,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  };
}
