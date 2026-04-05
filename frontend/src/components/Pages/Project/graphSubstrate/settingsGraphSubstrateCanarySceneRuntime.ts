import { useEffect, useLayoutEffect, useMemo } from "react";
import { useNodeInternals } from "state/definitions";
import { useSectionElementSizes } from "state/hooks/sectionElementSizes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resetSettingsGraphSubstrateCanarySceneSnapshot,
  updateSettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneStore";
import { shouldObserveSettingsGraphSubstrateCanarySectionElementSize } from "./settingsGraphSubstrateCanarySectionGeometry";

type SettingsGraphSubstrateCanarySceneRuntimeArgs = {
  draggingSectionId: string | null;
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride;
  sections: Array<GraphSubstrateCanarySection>;
};

export function useSettingsGraphSubstrateCanarySceneRuntime({
  draggingSectionId,
  sectionPositionOverride,
  sections,
}: SettingsGraphSubstrateCanarySceneRuntimeArgs): SettingsGraphSubstrateCanarySceneSnapshot {
  const measuredSectionIds = useMemo(
    () =>
      sections
        .filter((section) =>
          shouldObserveSettingsGraphSubstrateCanarySectionElementSize(section),
        )
        .map((section) => section.sectionId),
    [sections],
  );
  const measuredSectionElementSizes =
    useSectionElementSizes(measuredSectionIds);
  const sceneSnapshot = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySceneSnapshot(
      sections,
      measuredSectionElementSizes,
      sectionPositionOverride,
      draggingSectionId,
    );
  }, [
    draggingSectionId,
    measuredSectionElementSizes,
    sectionPositionOverride,
    sections,
  ]);

  useLayoutEffect(() => {
    updateSettingsGraphSubstrateCanarySceneSnapshot(sceneSnapshot);
  }, [sceneSnapshot]);

  useEffect(() => {
    const currentNodeInternals = useNodeInternals.getState().x;
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      currentNodeInternals,
      sceneSnapshot,
    );
    if (nextNodeInternals === currentNodeInternals) {
      return;
    }
    useNodeInternals.setState({ x: nextNodeInternals });
  }, [sceneSnapshot]);

  useEffect(() => {
    return () => {
      resetSettingsGraphSubstrateCanarySceneSnapshot();
    };
  }, []);

  return sceneSnapshot;
}
