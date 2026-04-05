import _ from "lodash";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { getAuthoritativeTopLevelSectionNodeSize } from "state/actions/sectionInfos";
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
  const sectionsById = useMemo(() => {
    return new Map(sections.map((section) => [section.sectionId, section]));
  }, [sections]);
  const missingMeasuredSectionIds = useMemo(() => {
    return measuredSectionIds.filter(
      (sectionId) => !measuredSectionElementSizes[sectionId],
    );
  }, [measuredSectionElementSizes, measuredSectionIds]);
  const fallbackSectionElementSizes = useNodeInternals((state) => {
    const nextSectionElementSizes: Record<
      string,
      { width: number; height: number }
    > = {};

    for (const sectionId of missingMeasuredSectionIds) {
      const section = sectionsById.get(sectionId);
      if (!section) {
        continue;
      }

      const authoritativeSize = getAuthoritativeTopLevelSectionNodeSize(
        {
          w: section.width,
          h: section.height,
        },
        state.x.get(sectionId),
      );
      if (
        typeof authoritativeSize.width !== "number" ||
        authoritativeSize.width <= 0 ||
        typeof authoritativeSize.height !== "number" ||
        authoritativeSize.height <= 0
      ) {
        continue;
      }

      nextSectionElementSizes[sectionId] = {
        width: authoritativeSize.width,
        height: authoritativeSize.height,
      };
    }

    return nextSectionElementSizes;
  }, _.isEqual);
  const sectionElementSizes = useMemo(() => {
    if (Object.keys(fallbackSectionElementSizes).length === 0) {
      return measuredSectionElementSizes;
    }

    return {
      ...measuredSectionElementSizes,
      ...fallbackSectionElementSizes,
    };
  }, [fallbackSectionElementSizes, measuredSectionElementSizes]);
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
