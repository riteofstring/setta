import type { Node } from "forks/xyflow/core/types";
import type { SettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";

export type SettingsGraphSubstrateCanarySectionSeedNode = Pick<
  Node,
  "height" | "sizeAuthority" | "width"
>;

export type SettingsGraphSubstrateCanarySectionSeedNodes = ReadonlyMap<
  string,
  SettingsGraphSubstrateCanarySectionSeedNode | undefined
>;

export function resolveSettingsGraphSubstrateCanarySectionSeedNodes(
  seedNodes: SettingsGraphSubstrateCanarySectionSeedNodes,
  sceneSnapshot: Pick<SettingsGraphSubstrateCanarySceneSnapshot, "sections">,
): SettingsGraphSubstrateCanarySectionSeedNodes {
  let nextSeedNodes: Map<
    string,
    SettingsGraphSubstrateCanarySectionSeedNode | undefined
  > | null = null;

  for (const section of sceneSnapshot.sections) {
    if (section.sizeAuthority !== "sharedNode") {
      continue;
    }

    const localSeed = getSharedNodeLocalSeed(section);
    if (!localSeed) {
      continue;
    }

    const currentSeed = seedNodes.get(section.sectionId);
    if (
      currentSeed?.sizeAuthority === "sharedNode" &&
      currentSeed.width === localSeed.width &&
      currentSeed.height === localSeed.height
    ) {
      continue;
    }

    if (!nextSeedNodes) {
      nextSeedNodes = new Map(seedNodes);
    }
    nextSeedNodes.set(section.sectionId, localSeed);
  }

  return nextSeedNodes ?? seedNodes;
}

function getSharedNodeLocalSeed(
  section: SettingsGraphSubstrateCanarySceneSnapshot["sections"][number],
): SettingsGraphSubstrateCanarySectionSeedNode | null {
  const resolvedWidth = section.resolvedSize?.width ?? null;
  const resolvedHeight = section.resolvedSize?.height ?? null;
  if (hasPositiveSeedSize(resolvedWidth, resolvedHeight)) {
    return {
      width: resolvedWidth,
      height: resolvedHeight,
      sizeAuthority: "sharedNode",
    };
  }

  const sectionWidth = section.width ?? null;
  const sectionHeight = section.height ?? null;
  if (hasPositiveSeedSize(sectionWidth, sectionHeight)) {
    return {
      width: sectionWidth,
      height: sectionHeight,
      sizeAuthority: "sharedNode",
    };
  }

  return null;
}

function hasPositiveSeedSize(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  return (
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
  );
}
