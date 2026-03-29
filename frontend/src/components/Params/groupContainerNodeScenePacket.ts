import type { LiveDictAreaEdgeStripPortInput } from "./groupContainerEdgeStripVisualPacket";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import {
  buildLiveDictAreaNodeVisualPacket,
  type LiveDictAreaNodeVisualPacket,
} from "./groupContainerNodeVisualPacket";
import { buildLiveDictAreaSceneBlockView } from "./groupContainerSceneBlockView";
import {
  buildLiveDictAreaScenePacket,
  type LiveDictAreaScenePacket,
} from "./groupContainerScenePackets";
import { buildLiveDictAreaSceneRendererPackets } from "./groupContainerSceneRendererPackets";
import type {
  ParamEditorKind,
  ParamValuePresentationKind,
} from "./paramEditorActivation";

export type LiveDictAreaNodeEdgeStripScenePacket = {
  canConnect: boolean;
  inputPortCount: number;
  inputPorts: LiveDictAreaEdgeStripPortInput[];
  isSelectingParams: boolean;
  outputPortCount: number;
  outputPorts: LiveDictAreaEdgeStripPortInput[];
  selectedParamIds: string[];
};

export type LiveDictAreaNodeScenePacket = {
  edgeStrip: LiveDictAreaNodeEdgeStripScenePacket;
  scenePacket: LiveDictAreaScenePacket;
  visualPacket: LiveDictAreaNodeVisualPacket;
};

export function buildLiveDictAreaNodeScenePacket({
  canConnect,
  edgeInputParams,
  getParamEditorKind,
  hideUnpinnedParams,
  paramFilter,
  getParamDisplayName,
  getParamValuePresentationKind,
  getParamValuePreview,
  getParamValueSwatch,
  inputPorts,
  isSelectingParams,
  outputPorts,
  pinned,
  selectedParamIds,
  unpinned,
}: {
  canConnect: boolean;
  edgeInputParams: string[];
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePresentationKind?: (
    paramId: string,
  ) => ParamValuePresentationKind;
  getParamValuePreview?: (paramId: string) => string | null;
  getParamValueSwatch?: (paramId: string) => string | null;
  inputPorts: LiveDictAreaEdgeStripPortInput[];
  isSelectingParams: boolean;
  outputPorts: LiveDictAreaEdgeStripPortInput[];
  pinned: {
    requiredParamIdsToPaths: Record<string, string[]>;
    topLevelParamIds: string[];
  };
  selectedParamIds: string[];
  unpinned: {
    canEditLayout: boolean;
    configuredMinHeight: number | null | undefined;
    pinnedRequiredParamIdsToPaths: Record<string, string[]>;
    pinnedTopLevelParamIds: string[];
    positionAndSizeLocked: boolean;
    requiredParamIdsToPaths: Record<string, string[]>;
    topLevelParamIds: string[];
  };
}): LiveDictAreaNodeScenePacket {
  const edgeStrip = {
    canConnect,
    inputPortCount: inputPorts.length,
    inputPorts,
    isSelectingParams,
    outputPortCount: outputPorts.length,
    outputPorts,
    selectedParamIds,
  };
  const scenePacket = buildLiveDictAreaScenePacket({
    edgeInputParams,
    getParamEditorKind,
    hideUnpinnedParams,
    paramFilter,
    getParamDisplayName,
    getParamValuePresentationKind,
    getParamValuePreview,
    getParamValueSwatch,
    pinned,
    unpinned,
  });
  const nodeLayoutView = buildLiveDictAreaNodeLayoutView({
    inputPortCount: edgeStrip.inputPortCount,
    outputPortCount: edgeStrip.outputPortCount,
    liveScenePacket: scenePacket,
  });
  const sceneBlockView = buildLiveDictAreaSceneBlockView({
    nodeLayoutView,
  });
  const rendererPackets = buildLiveDictAreaSceneRendererPackets({
    sceneBlockView,
  });

  return {
    edgeStrip,
    scenePacket,
    visualPacket: buildLiveDictAreaNodeVisualPacket({
      edgeStrip,
      rendererPackets,
    }),
  };
}
