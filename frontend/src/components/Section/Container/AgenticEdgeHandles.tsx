import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useNodeId } from "forks/xyflow/core/contexts/NodeIdContext";
import { useReactFlow } from "forks/xyflow/core/store";
import { HandlePosition } from "forks/xyflow/core/types";
import { useMemo } from "react";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdgeConnections";
import { createAgenticEdgeFromConnection } from "state/actions/agenticEdgeMutations";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

export function AgenticEdgeHandles({ isUserView }: { isUserView: boolean }) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const isSelectingEdge = useReactFlow(
    (state) => state.connectionStartHandle !== null,
  );
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges,
  );
  const connectionMask = useMemo(() => {
    if (!sectionId) {
      return 0;
    }
    let mask = 0;
    for (const edge of agenticEdges) {
      if (edge.targetSectionId === sectionId) {
        mask |= 1;
      }
      if (edge.sourceSectionId === sectionId) {
        mask |= 2;
      }
      if (mask === 3) {
        break;
      }
    }
    return mask;
  }, [agenticEdges, sectionId]);
  const hasIncomingAgenticEdge = (connectionMask & 1) !== 0;
  const hasOutgoingAgenticEdge = (connectionMask & 2) !== 0;

  if (isUserView) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle-safe-zone agentic-handle-safe-zone--left`}
      />
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.reverseStart}
        type="source"
        position={HandlePosition.Left}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--target agentic-handle--reverse-start${hasIncomingAgenticEdge ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        data-testid={`agentic-reverse-start-handle-${sectionId}`}
        data-reverse-start="true"
        aria-hidden="true"
        tabIndex={-1}
        isConnectable={canEditStructure}
        isConnectableStart={canEditStructure}
        isConnectableEnd={false}
        connectionStartSemanticType="target"
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
      />
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.target}
        type="target"
        position={HandlePosition.Left}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--target${hasIncomingAgenticEdge ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        isConnectable={canEditStructure}
        isConnectableStart={false}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
        aria-label="Agentic link target"
        {...getFloatingBoxHandlers({
          content: "Agentic link target",
        })}
      />
      <div
        aria-hidden="true"
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle-safe-zone agentic-handle-safe-zone--right`}
      />
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.source}
        type="source"
        position={HandlePosition.Right}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--source${hasOutgoingAgenticEdge ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        isConnectable={canEditStructure}
        isConnectableStart={canEditStructure}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
        aria-label="Agentic link source"
        {...getFloatingBoxHandlers({
          content: "Agentic link source",
        })}
      />
    </>
  );
}
