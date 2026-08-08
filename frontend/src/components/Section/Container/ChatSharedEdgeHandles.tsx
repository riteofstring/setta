import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useNodeId } from "forks/xyflow/core/contexts/NodeIdContext";
import { useReactFlow } from "forks/xyflow/core/store";
import { HandlePosition } from "forks/xyflow/core/types";
import {
  createSharedChatEdgeFromConnection,
  getChatSharedEdgeModeLabel,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

type SharedChatConnectionVisibility = {
  hasIncoming: boolean;
  hasOutgoing: boolean;
};

function getSharedChatConnectionVisibility(
  sectionId: string,
  state: ReturnType<typeof useProjectState.getState>,
): SharedChatConnectionVisibility {
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
  for (const edge of state.projectConfig.stateMachineEdges) {
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

export function ChatSharedEdgeHandles({ isUserView }: { isUserView: boolean }) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const isSelectingEdge = useReactFlow(
    (state) => state.connectionStartHandle !== null,
  );
  const chatSharedEdgeMode = useLocalStorage(
    (state) => state.chatSharedEdgeMode,
  );
  const connectionVisibility = useProjectState(
    (state) => {
      if (!sectionId) {
        return {
          hasIncoming: false,
          hasOutgoing: false,
        };
      }
      return getSharedChatConnectionVisibility(sectionId, state);
    },
    (left, right) =>
      left.hasIncoming === right.hasIncoming &&
      left.hasOutgoing === right.hasOutgoing,
  );

  if (isUserView || !sectionId) {
    return null;
  }

  const sharedModeLabel = getChatSharedEdgeModeLabel(chatSharedEdgeMode);

  return (
    <>
      <div
        aria-hidden="true"
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle-safe-zone chat-shared-handle-safe-zone agentic-handle-safe-zone--left`}
      />
      <Handle
        id={SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart}
        type="source"
        position={HandlePosition.Left}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle chat-shared-handle agentic-handle--target agentic-handle--reverse-start${connectionVisibility.hasIncoming ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        data-testid={`chat-shared-reverse-start-handle-${sectionId}`}
        data-reverse-start="true"
        aria-hidden="true"
        tabIndex={-1}
        isConnectable={canEditStructure}
        isConnectableStart={canEditStructure}
        isConnectableEnd={false}
        connectionStartSemanticType="target"
        isValidConnection={isValidSharedChatEdgeConnection}
        onConnect={createSharedChatEdgeFromConnection}
      />
      <Handle
        id={SHARED_CHAT_EDGE_HANDLE_IDS.target}
        type="target"
        position={HandlePosition.Left}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle chat-shared-handle agentic-handle--target${connectionVisibility.hasIncoming ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        data-testid={`chat-shared-target-handle-${sectionId}`}
        isConnectable={canEditStructure}
        isConnectableStart={false}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidSharedChatEdgeConnection}
        onConnect={createSharedChatEdgeFromConnection}
        aria-label="Shared chat input"
        {...getFloatingBoxHandlers({
          content: `Shared chat input (${sharedModeLabel} mode for Chat to Chat)`,
        })}
      />
      <div
        aria-hidden="true"
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle-safe-zone chat-shared-handle-safe-zone agentic-handle-safe-zone--right`}
      />
      <Handle
        id={SHARED_CHAT_EDGE_HANDLE_IDS.source}
        type="source"
        position={HandlePosition.Right}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle chat-shared-handle agentic-handle--source${connectionVisibility.hasOutgoing ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        data-testid={`chat-shared-source-handle-${sectionId}`}
        isConnectable={canEditStructure}
        isConnectableStart={canEditStructure}
        isConnectableEnd={canEditStructure}
        isValidConnection={isValidSharedChatEdgeConnection}
        onConnect={createSharedChatEdgeFromConnection}
        aria-label="Shared chat output"
        {...getFloatingBoxHandlers({
          content: `Shared chat output (${sharedModeLabel} mode for Chat to Chat)`,
        })}
      />
    </>
  );
}
