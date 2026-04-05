import { useEffect, useMemo, useState } from "react";
import { useNodeInternals } from "state/definitions";
import { useObservedSectionElementSizes } from "state/hooks/observedSectionElementSizes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";

export type SettingsGraphSubstrateCanarySceneState = {
  draggingSectionId: string | null;
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
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
  const canarySectionIds = useMemo(
    () => sections.map((section) => section.sectionId),
    [sections],
  );
  const observedElementSizes = useObservedSectionElementSizes(canarySectionIds);
  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.sectionId, section]));
  }, [sections]);
  const sceneSnapshot = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySceneSnapshot(
      sections,
      observedElementSizes,
      sectionPositionOverride,
      draggingSectionId,
    );
  }, [
    draggingSectionId,
    observedElementSizes,
    sectionPositionOverride,
    sections,
  ]);

  useEffect(() => {
    const nodeInternals = useNodeInternals.getState().x;
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      nodeInternals,
      sceneSnapshot,
    );
    if (nextNodeInternals === nodeInternals) {
      return;
    }
    useNodeInternals.setState({ x: nextNodeInternals });
  }, [sceneSnapshot]);

  return {
    draggingSectionId,
    sceneSnapshot,
    sectionById,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  };
}
