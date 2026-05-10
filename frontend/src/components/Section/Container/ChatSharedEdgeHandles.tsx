import {
  getProjectGpuHandleConnectionProps,
  getProjectGpuReverseStartHandleConnectionProps,
} from "components/Pages/Project/GpuProjectSurface/projectGpuHandleAdapter";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "gpuFlow/Handle";
import { useNodeId } from "gpuFlow/NodeIdContext";
import { HandlePosition } from "gpuFlow/flowTypes";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import {
  createSharedChatEdgeFromConnection,
  getChatSharedEdgeModeLabel,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

type SharedChatConnectionVisibility = {
  hasIncoming: boolean;
  hasOutgoing: boolean;
};

const SHARED_CHAT_HANDLE_SAFE_ZONE_GUARD_CLASSES = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
const EMPTY_SHARED_CHAT_CONNECTION_VISIBILITY = {
  hasIncoming: false,
  hasOutgoing: false,
} satisfies SharedChatConnectionVisibility;

type SectionConnectionEdge = {
  sourceSectionId: string;
  targetSectionId: string;
};

function mergeSharedChatConnectionVisibility(
  visibility: SharedChatConnectionVisibility,
  edge: SectionConnectionEdge,
  sectionId: string,
): void {
  visibility.hasIncoming ||= edge.targetSectionId === sectionId;
  visibility.hasOutgoing ||= edge.sourceSectionId === sectionId;
}

function getSharedChatConnectionVisibility(
  sectionId: string,
  state: ReturnType<typeof useProjectState.getState>,
): SharedChatConnectionVisibility {
  const visibility = {
    hasIncoming: false,
    hasOutgoing: false,
  };
  for (const edge of state.projectConfig.agenticEdges ?? []) {
    mergeSharedChatConnectionVisibility(visibility, edge, sectionId);
    if (visibility.hasIncoming && visibility.hasOutgoing) {
      return visibility;
    }
  }
  for (const edge of state.projectConfig.stateMachineEdges ?? []) {
    mergeSharedChatConnectionVisibility(visibility, edge, sectionId);
    if (visibility.hasIncoming && visibility.hasOutgoing) {
      return visibility;
    }
  }
  return visibility;
}

function useSharedChatConnectionVisibility(sectionId: string | null) {
  return useProjectState(
    (state) =>
      sectionId
        ? getSharedChatConnectionVisibility(sectionId, state)
        : EMPTY_SHARED_CHAT_CONNECTION_VISIBILITY,
    areSharedChatConnectionVisibilityEqual,
  );
}

function areSharedChatConnectionVisibilityEqual(
  left: SharedChatConnectionVisibility,
  right: SharedChatConnectionVisibility,
) {
  return (
    left.hasIncoming === right.hasIncoming &&
    left.hasOutgoing === right.hasOutgoing
  );
}

function shouldHideChatSharedEdgeHandles(
  isUserView: boolean,
  sectionId: string | null,
): boolean {
  return isUserView || !sectionId;
}

export function ChatSharedEdgeHandles({
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
  const chatSharedEdgeMode = useLocalStorage(
    (state) => state.chatSharedEdgeMode,
  );
  const connectionVisibility = useSharedChatConnectionVisibility(sectionId);

  if (shouldHideChatSharedEdgeHandles(isUserView, sectionId)) {
    return null;
  }

  const sharedModeLabel = getChatSharedEdgeModeLabel(chatSharedEdgeMode);
  const registerPortGeometry = scenePortGeometry !== true;
  const canStartDomConnection = registerPortGeometry && canEditStructure;

  return (
    <>
      <div
        aria-hidden="true"
        className={`${SHARED_CHAT_HANDLE_SAFE_ZONE_GUARD_CLASSES} agentic-handle-metrics chat-shared-handle-metrics agentic-handle-safe-zone chat-shared-handle-safe-zone agentic-handle-safe-zone--left`}
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
        isConnectableStart={canStartDomConnection}
        isConnectableEnd={false}
        connectionStartSemanticType="target"
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuReverseStartHandleConnectionProps(
          SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart,
        )}
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
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuHandleConnectionProps(
          SHARED_CHAT_EDGE_HANDLE_IDS.target,
        )}
        isValidConnection={isValidSharedChatEdgeConnection}
        onConnect={createSharedChatEdgeFromConnection}
        aria-label="Shared chat input"
        {...getFloatingBoxHandlers({
          content: `Shared chat input (${sharedModeLabel} mode for Chat to Chat)`,
        })}
      />
      <div
        aria-hidden="true"
        className={`${SHARED_CHAT_HANDLE_SAFE_ZONE_GUARD_CLASSES} agentic-handle-metrics chat-shared-handle-metrics agentic-handle-safe-zone chat-shared-handle-safe-zone agentic-handle-safe-zone--right`}
      />
      <Handle
        id={SHARED_CHAT_EDGE_HANDLE_IDS.source}
        type="source"
        position={HandlePosition.Right}
        className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics chat-shared-handle-metrics agentic-handle chat-shared-handle agentic-handle--source${connectionVisibility.hasOutgoing ? " agentic-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}`}
        data-testid={`chat-shared-source-handle-${sectionId}`}
        isConnectable={canEditStructure}
        isConnectableStart={canStartDomConnection}
        isConnectableEnd={canEditStructure}
        registerPortGeometry={registerPortGeometry}
        {...getProjectGpuHandleConnectionProps(
          SHARED_CHAT_EDGE_HANDLE_IDS.source,
        )}
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
