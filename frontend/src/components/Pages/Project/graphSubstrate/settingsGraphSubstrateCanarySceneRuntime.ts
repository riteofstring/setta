import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useNodeInternals } from "state/definitions";
import { useSectionElementSizes } from "state/hooks/sectionElementSizes";
import { updateSettingsGraphSubstrateCanaryInstrumentationSnapshot } from "./settingsGraphSubstrateCanaryInstrumentation";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import {
  areSettingsGraphSubstrateCanarySceneSnapshotsEqual,
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resetSettingsGraphSubstrateCanarySceneSnapshot,
  updateSettingsGraphSubstrateCanarySceneSnapshot,
  useSettingsGraphSubstrateCanarySceneStore,
} from "./settingsGraphSubstrateCanarySceneStore";
import {
  areSettingsGraphSubstrateCanarySectionSeedNodesEqual,
  resolveSettingsGraphSubstrateCanarySectionSeedNodes,
  shouldObserveSettingsGraphSubstrateCanarySectionSeedSize,
} from "./settingsGraphSubstrateCanarySectionSeedNodes";

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
  const sceneSyncCountRef = useRef(0);
  const stableSceneSnapshotRef =
    useRef<SettingsGraphSubstrateCanarySceneSnapshot | null>(null);
  const measuredSectionIds = useMemo(
    () =>
      sections
        .filter((section) =>
          shouldObserveSettingsGraphSubstrateCanarySectionSeedSize(section),
        )
        .map((section) => section.sectionId),
    [sections],
  );
  const measuredSectionElementSizes =
    useSectionElementSizes(measuredSectionIds);
  const sceneSnapshot = useMemo(() => {
    const nextSceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      sections,
      sectionPositionOverride,
      draggingSectionId,
    );
    const currentSceneSnapshot = stableSceneSnapshotRef.current;
    if (
      currentSceneSnapshot &&
      areSettingsGraphSubstrateCanarySceneSnapshotsEqual(
        currentSceneSnapshot,
        nextSceneSnapshot,
      )
    ) {
      return currentSceneSnapshot;
    }
    return nextSceneSnapshot;
  }, [draggingSectionId, sectionPositionOverride, sections]);
  stableSceneSnapshotRef.current = sceneSnapshot;

  useLayoutEffect(() => {
    const currentSceneState =
      useSettingsGraphSubstrateCanarySceneStore.getState();
    const nextSectionSeedNodes =
      resolveSettingsGraphSubstrateCanarySectionSeedNodes(
        currentSceneState.sectionSeedNodes,
        sections,
        measuredSectionElementSizes,
      );
    if (
      currentSceneState.sceneSnapshot !== sceneSnapshot ||
      !areSettingsGraphSubstrateCanarySectionSeedNodesEqual(
        currentSceneState.sectionSeedNodes,
        nextSectionSeedNodes,
      )
    ) {
      updateSettingsGraphSubstrateCanarySceneSnapshot(
        sceneSnapshot,
        nextSectionSeedNodes,
      );
      sceneSyncCountRef.current += 1;
    }
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSceneSectionCount: sceneSnapshot.sections.length,
      sceneSyncCount: sceneSyncCountRef.current,
      unresolvedSectionSeedFallbackCount: measuredSectionIds.length,
    });
  }, [
    measuredSectionElementSizes,
    measuredSectionIds.length,
    sceneSnapshot,
    sections,
  ]);

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
      updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
        mountedSceneSectionCount: 0,
        sceneSyncCount: 0,
        unresolvedSectionSeedFallbackCount: 0,
      });
    };
  }, []);

  return sceneSnapshot;
}
