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
  setSettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneStore";

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
  const canarySectionIds = useMemo(
    () => sections.map((section) => section.sectionId),
    [sections],
  );
  const sectionElementSizes = useSectionElementSizes(canarySectionIds);
  const sceneSnapshot = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySceneSnapshot(
      sections,
      sectionElementSizes,
      sectionPositionOverride,
      draggingSectionId,
    );
  }, [
    draggingSectionId,
    sectionElementSizes,
    sectionPositionOverride,
    sections,
  ]);

  useLayoutEffect(() => {
    setSettingsGraphSubstrateCanarySceneSnapshot(sceneSnapshot);
  }, [sceneSnapshot]);

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

  useEffect(() => {
    return () => {
      resetSettingsGraphSubstrateCanarySceneSnapshot();
    };
  }, []);

  return sceneSnapshot;
}
