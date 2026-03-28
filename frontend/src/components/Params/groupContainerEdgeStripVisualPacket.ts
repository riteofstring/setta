import { HandlePosition } from "forks/xyflow/core/types";
import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaEdgeStripRendererPacket } from "./groupContainerSceneRendererPackets";

export type LiveDictAreaEdgeStripPortInput = {
  id: string;
  label: string;
};

export type LiveDictAreaEdgeStripInputPortVisualPacket = {
  handlePosition: HandlePosition.Left;
  handleType: "target";
  id: string;
  isSelectable: boolean;
  isSelected: boolean;
  label: string;
  side: "in";
};

export type LiveDictAreaEdgeStripOutputPortVisualPacket = {
  handlePosition: HandlePosition.Right;
  handleType: "source";
  id: string;
  label: string;
  side: "out";
};

export type LiveDictAreaEdgeStripVisualPacket = {
  blockId: "edges";
  canConnect: boolean;
  estimatedHeight: number;
  inputColumn: {
    ports: LiveDictAreaEdgeStripInputPortVisualPacket[];
    title: "In";
  };
  inputPortCount: number;
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
  outputColumn: {
    ports: LiveDictAreaEdgeStripOutputPortVisualPacket[];
    title: "Out";
  };
  outputPortCount: number;
  portRowCount: number;
  shouldRoundBottom: boolean;
  title: "Edges";
};

export function buildLiveDictAreaEdgeStripVisualPacket({
  canConnect,
  inputPorts,
  isSelectingParams,
  outputPorts,
  rendererPacket,
  selectedParamIds,
  shouldRoundBottom,
}: {
  canConnect: boolean;
  inputPorts: LiveDictAreaEdgeStripPortInput[];
  isSelectingParams: boolean;
  outputPorts: LiveDictAreaEdgeStripPortInput[];
  rendererPacket: LiveDictAreaEdgeStripRendererPacket;
  selectedParamIds: string[];
  shouldRoundBottom: boolean;
}): LiveDictAreaEdgeStripVisualPacket | null {
  if (inputPorts.length === 0 && outputPorts.length === 0) {
    return null;
  }

  const selectedParamIdSet = new Set(selectedParamIds);

  return {
    blockId: rendererPacket.blockId,
    canConnect,
    estimatedHeight: rendererPacket.estimatedHeight,
    inputColumn: {
      ports: inputPorts.map((port) => ({
        handlePosition: HandlePosition.Left,
        handleType: "target",
        id: port.id,
        isSelectable: isSelectingParams,
        isSelected: selectedParamIdSet.has(port.id),
        label: port.label,
        side: "in",
      })),
      title: "In",
    },
    inputPortCount: inputPorts.length,
    kind: "edge-strip",
    mount: rendererPacket.mount,
    outputColumn: {
      ports: outputPorts.map((port) => ({
        handlePosition: HandlePosition.Right,
        handleType: "source",
        id: port.id,
        label: port.label,
        side: "out",
      })),
      title: "Out",
    },
    outputPortCount: outputPorts.length,
    portRowCount: rendererPacket.portRowCount,
    shouldRoundBottom,
    title: rendererPacket.title,
  };
}
