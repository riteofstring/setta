import { isTempParam } from "forks/dnd-kit/paramDndState";
import { resolveVisibleParamIds } from "./paramSwitchView";

export type ParamSceneRowPacketKind = "group" | "placeholder" | "value";

export type ParamSceneRowPacket = {
  depth: number;
  id: string;
  kind: ParamSceneRowPacketKind;
  label: string | null;
};

type BuildVisibleParamScenePacketsArgs = {
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  paramFilter: string;
  getParamDisplayName: (paramId: string) => string;
};

export function buildVisibleParamScenePackets({
  paramIds,
  requiredParamIdsToPaths,
  paramFilter,
  getParamDisplayName,
}: BuildVisibleParamScenePacketsArgs): ParamSceneRowPacket[] {
  const visibleParamIds = resolveVisibleParamIds({
    paramIds,
    requiredParamIdsToPaths,
    paramFilter,
    getParamDisplayName,
  });
  const pathByParamId = buildVisibleParamPathMap(requiredParamIdsToPaths);
  const groupIds = buildVisibleGroupIdSet(requiredParamIdsToPaths);

  return visibleParamIds.map((paramId) => {
    if (isTempParam(paramId)) {
      return {
        depth: 0,
        id: paramId,
        kind: "placeholder",
        label: null,
      };
    }

    const path = pathByParamId[paramId];
    if (!path) {
      throw new Error(`Missing visible param path for ${paramId}.`);
    }

    return {
      depth: path.length - 1,
      id: paramId,
      kind: groupIds.has(paramId) ? "group" : "value",
      label: getParamDisplayName(paramId),
    };
  });
}

function buildVisibleParamPathMap(
  requiredParamIdsToPaths: Record<string, string[]>,
): Record<string, string[]> {
  const pathByParamId: Record<string, string[]> = {};

  for (const path of Object.values(requiredParamIdsToPaths)) {
    path.forEach((paramId, index) => {
      if (!(paramId in pathByParamId)) {
        pathByParamId[paramId] = path.slice(0, index + 1);
      }
    });
  }

  return pathByParamId;
}

function buildVisibleGroupIdSet(
  requiredParamIdsToPaths: Record<string, string[]>,
): Set<string> {
  const groupIds = new Set<string>();

  for (const path of Object.values(requiredParamIdsToPaths)) {
    path.slice(0, -1).forEach((paramId) => {
      groupIds.add(paramId);
    });
  }

  return groupIds;
}
