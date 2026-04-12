import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useNodeId } from "forks/xyflow/core/contexts/NodeIdContext";
import { HandlePosition } from "forks/xyflow/core/types";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

type AgenticConnectionVisibility = {
  hasIncoming: boolean;
  hasOutgoing: boolean;
};

function getAgenticConnectionVisibility(
  sectionId: string,
  state: ReturnType<typeof useProjectState.getState>,
): AgenticConnectionVisibility {
  let hasIncoming = false;
  let hasOutgoing = false;
  for (const edge of state.projectConfig.agenticEdges) {
    if (edge.targetSectionId === sectionId) {
      hasIncoming = true;
    }
    if (edge.sourceSectionId === sectionId) {
      hasOutgoing = true;
    }
    if (hasIncoming && hasOutgoing) {
      return { hasIncoming, hasOutgoing };
    }
  }
  return { hasIncoming, hasOutgoing };
}

export function AgenticEdgeHandles({ isUserView }: { isUserView: boolean }) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const connectionVisibility = useProjectState(
    (state) => {
      if (!sectionId) {
        return {
          hasIncoming: false,
          hasOutgoing: false,
        };
      }
      return getAgenticConnectionVisibility(sectionId, state);
    },
    (left, right) =>
      left.hasIncoming === right.hasIncoming &&
      left.hasOutgoing === right.hasOutgoing,
  );
  const hasIncomingAgenticEdge = connectionVisibility.hasIncoming;
  const hasOutgoingAgenticEdge = connectionVisibility.hasOutgoing;

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
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--target agentic-handle--reverse-start${hasIncomingAgenticEdge ? " agentic-handle--connected" : ""}`}
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
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--target${hasIncomingAgenticEdge ? " agentic-handle--connected" : ""}`}
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
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--source${hasOutgoingAgenticEdge ? " agentic-handle--connected" : ""}`}
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
