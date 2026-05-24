import {
  getProjectGpuHandleConnectionProps,
  getProjectGpuReverseStartHandleConnectionProps,
} from "components/Pages/Project/GpuProjectSurface/projectGpuHandleAdapter";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "gpuFlow/Handle";
import { useNodeId } from "gpuFlow/NodeIdContext";
import { HandlePosition } from "gpuFlow/flowTypes";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import { useMemo } from "react";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

const EDGE_HANDLE_SAFE_ZONE_GUARD_CLASSES = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;

export function AgenticEdgeHandles({
  isUserView,
  scenePortGeometry,
}: {
  isUserView: boolean;
  scenePortGeometry?: boolean;
}) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const isSelectingEdge = useGpuFlowViewportStore(
    (state) => state.connectionStartHandle !== null,
  );
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges ?? [],
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
  const registerPortGeometry = scenePortGeometry !== true;
  const canStartDomConnection = registerPortGeometry && canEditStructure;

  if (isUserView) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={`${EDGE_HANDLE_SAFE_ZONE_GUARD_CLASSES} agentic-handle-metrics agentic-handle-safe-zone agentic-handle-safe-zone--left`}
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
        isConnectableStart={canStartDomConnection}
        isConnectableEnd={false}
        connectionStartSemanticType="target"
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuReverseStartHandleConnectionProps(
          AGENTIC_EDGE_HANDLE_IDS.reverseStart,
        )}
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
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuHandleConnectionProps(AGENTIC_EDGE_HANDLE_IDS.target)}
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
        aria-label="Agentic link target"
        {...getFloatingBoxHandlers({
          content: "Agentic link target",
        })}
      />
      <div
        aria-hidden="true"
        className={`${EDGE_HANDLE_SAFE_ZONE_GUARD_CLASSES} agentic-handle-metrics agentic-handle-safe-zone agentic-handle-safe-zone--right`}
      />
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.source}
        type="source"
        position={HandlePosition.Right}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics agentic-handle agentic-handle--source${hasOutgoingAgenticEdge ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        isConnectable={canEditStructure}
        isConnectableStart={canStartDomConnection}
        isConnectableEnd={canEditStructure}
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuHandleConnectionProps(AGENTIC_EDGE_HANDLE_IDS.source)}
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
