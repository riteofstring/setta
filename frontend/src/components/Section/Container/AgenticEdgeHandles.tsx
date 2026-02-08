import { Handle } from "forks/xyflow/core/components/Handle";
import { HandlePosition } from "forks/xyflow/core/types";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import { useShareCapabilities } from "state/hooks/share";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

export function AgenticEdgeHandles({ isUserView }: { isUserView: boolean }) {
  const { canEditStructure } = useShareCapabilities();

  if (isUserView) {
    return null;
  }

  return (
    <>
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.target}
        type="target"
        position={HandlePosition.Left}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle agentic-handle--target`}
        isConnectable={canEditStructure}
        isConnectableStart={false}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
        title="Agentic link target"
        aria-label="Agentic link target"
      />
      <Handle
        id={AGENTIC_EDGE_HANDLE_IDS.source}
        type="source"
        position={HandlePosition.Right}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle agentic-handle--source`}
        isConnectable={canEditStructure}
        isConnectableStart={canEditStructure}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidAgenticEdgeConnection}
        onConnect={createAgenticEdgeFromConnection}
        title="Agentic link source"
        aria-label="Agentic link source"
      />
    </>
  );
}
