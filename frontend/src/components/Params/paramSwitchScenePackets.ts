import { isTempParam } from "forks/dnd-kit/paramDndState";
import type { ParamEditorKind } from "./paramEditorActivation";
import { resolveVisibleParamIds } from "./paramSwitchView";

export type ParamSceneRowPacketKind = "group" | "placeholder" | "value";

type ParamSceneGroupRowPacket = {
  depth: number;
  id: string;
  kind: "group";
  label: string | null;
};

type ParamScenePlaceholderRowPacket = {
  depth: number;
  id: string;
  kind: "placeholder";
  label: null;
};

type ParamSceneValueRowPacket = {
  depth: number;
  editorKind?: ParamEditorKind;
  id: string;
  kind: "value";
  label: string;
  valuePreview: string | null;
};

export type ParamSceneRowPacket =
  | ParamSceneGroupRowPacket
  | ParamScenePlaceholderRowPacket
  | ParamSceneValueRowPacket;

type BuildVisibleParamScenePacketsArgs = {
  getParamEditorKind?: (paramId: string) => ParamEditorKind;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  paramFilter: string;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePreview?: (paramId: string) => string | null;
};

export function buildVisibleParamScenePackets({
  getParamEditorKind,
  paramIds,
  requiredParamIdsToPaths,
  paramFilter,
  getParamDisplayName,
  getParamValuePreview,
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

    const kind = groupIds.has(paramId) ? "group" : "value";

    return {
      depth: path.length - 1,
      ...(kind === "value" && getParamEditorKind
        ? {
            editorKind: getParamEditorKind(paramId),
          }
        : {}),
      ...(kind === "value"
        ? {
            valuePreview: getParamValuePreview
              ? getParamValuePreview(paramId)
              : null,
          }
        : {}),
      id: paramId,
      kind,
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
