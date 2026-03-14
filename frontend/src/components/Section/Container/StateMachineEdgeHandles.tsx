import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useNodeId } from "forks/xyflow/core/contexts/NodeIdContext";
import { useReactFlow } from "forks/xyflow/core/store";
import { HandlePosition } from "forks/xyflow/core/types";
import {
  isValidStateMachineEdgeConnection,
  STATE_MACHINE_EDGE_HANDLE_IDS,
} from "state/actions/stateMachineEdgeConnections";
import { createStateMachineEdgeFromConnection } from "state/actions/stateMachineEdgeMutations";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";

type ConnectionVisibility = {
  hasIncoming: boolean;
  hasOutgoing: boolean;
  sectionType: SectionTypeEnum | null;
};

function getConnectionVisibility(
  sectionId: string,
  state: ReturnType<typeof useProjectState.getState>,
): ConnectionVisibility {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return {
      hasIncoming: false,
      hasOutgoing: false,
      sectionType: null,
    };
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return {
      hasIncoming: false,
      hasOutgoing: false,
      sectionType: null,
    };
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return {
      hasIncoming: false,
      hasOutgoing: false,
      sectionType: null,
    };
  }
  let hasIncoming = false;
  let hasOutgoing = false;
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (edge.targetSectionId === sectionId) {
      hasIncoming = true;
    }
    if (edge.sourceSectionId === sectionId) {
      hasOutgoing = true;
    }
    if (hasIncoming && hasOutgoing) {
      break;
    }
  }
  return {
    hasIncoming,
    hasOutgoing,
    sectionType: impl.type ?? null,
  };
}

export function StateMachineEdgeHandles({
  isUserView,
}: {
  isUserView: boolean;
}) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const isSelectingEdge = useReactFlow(
    (state) => state.connectionStartHandle !== null,
  );
  const connectionVisibility = useProjectState(
    (state) => {
      if (!sectionId) {
        return {
          hasIncoming: false,
          hasOutgoing: false,
          sectionType: null,
        };
      }
      return getConnectionVisibility(sectionId, state);
    },
    (left, right) =>
      left.hasIncoming === right.hasIncoming &&
      left.hasOutgoing === right.hasOutgoing &&
      left.sectionType === right.sectionType,
  );

  if (isUserView || !sectionId || !connectionVisibility.sectionType) {
    return null;
  }

  const canSource =
    connectionVisibility.sectionType === SectionTypeEnum.Chat ||
    connectionVisibility.sectionType === SectionTypeEnum.StateMachineStart ||
    connectionVisibility.sectionType === SectionTypeEnum.StateMachineGate;
  const canTarget =
    connectionVisibility.sectionType === SectionTypeEnum.Chat ||
    connectionVisibility.sectionType === SectionTypeEnum.StateMachineGate ||
    connectionVisibility.sectionType === SectionTypeEnum.StateMachineEnd;
  const chatOffsetClassName =
    connectionVisibility.sectionType === SectionTypeEnum.Chat
      ? " workflow-handle-scope--chat"
      : "";
  const alwaysVisibleClassName =
    connectionVisibility.sectionType === SectionTypeEnum.Chat
      ? ""
      : " agentic-handle--always-visible";

  return (
    <>
      {canTarget ? (
        <>
          <div
            aria-hidden="true"
            className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics workflow-handle-metrics workflow-handle-scope${chatOffsetClassName} agentic-handle-safe-zone workflow-handle-safe-zone workflow-handle-safe-zone--left`}
          />
          <Handle
            id={STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart}
            type="source"
            position={HandlePosition.Left}
            className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics workflow-handle-metrics workflow-handle-scope${chatOffsetClassName} agentic-handle workflow-handle workflow-handle--target agentic-handle--reverse-start${connectionVisibility.hasIncoming ? " agentic-handle--connected workflow-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}${alwaysVisibleClassName}`}
            data-testid={`workflow-reverse-start-handle-${sectionId}`}
            data-reverse-start="true"
            aria-hidden="true"
            tabIndex={-1}
            isConnectable={canEditStructure}
            isConnectableStart={canEditStructure}
            isConnectableEnd={false}
            connectionStartSemanticType="target"
            isValidConnection={isValidStateMachineEdgeConnection}
            onConnect={createStateMachineEdgeFromConnection}
          />
          <Handle
            id={STATE_MACHINE_EDGE_HANDLE_IDS.target}
            type="target"
            position={HandlePosition.Left}
            className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics workflow-handle-metrics workflow-handle-scope${chatOffsetClassName} agentic-handle workflow-handle workflow-handle--target${connectionVisibility.hasIncoming ? " agentic-handle--connected workflow-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}${alwaysVisibleClassName}`}
            data-testid={`workflow-target-handle-${sectionId}`}
            isConnectable={canEditStructure}
            isConnectableStart={false}
            isConnectableEnd={canEditStructure}
            isValidConnection={isValidStateMachineEdgeConnection}
            onConnect={createStateMachineEdgeFromConnection}
            aria-label="Workflow edge target"
            {...getFloatingBoxHandlers({
              content: "Workflow edge target",
            })}
          />
        </>
      ) : null}
      {canSource ? (
        <>
          <div
            aria-hidden="true"
            className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics workflow-handle-metrics workflow-handle-scope${chatOffsetClassName} agentic-handle-safe-zone workflow-handle-safe-zone workflow-handle-safe-zone--right`}
          />
          <Handle
            id={STATE_MACHINE_EDGE_HANDLE_IDS.source}
            type="source"
            position={HandlePosition.Right}
            className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} agentic-handle-metrics workflow-handle-metrics workflow-handle-scope${chatOffsetClassName} agentic-handle workflow-handle workflow-handle--source${connectionVisibility.hasOutgoing ? " agentic-handle--connected workflow-handle--connected" : ""}${isSelectingEdge ? " agentic-handle--selecting" : ""}${alwaysVisibleClassName}`}
            data-testid={`workflow-source-handle-${sectionId}`}
            isConnectable={canEditStructure}
            isConnectableStart={canEditStructure}
            isConnectableEnd={canEditStructure}
            isValidConnection={isValidStateMachineEdgeConnection}
            onConnect={createStateMachineEdgeFromConnection}
            aria-label="Workflow edge source"
            {...getFloatingBoxHandlers({
              content: "Workflow edge source",
            })}
          />
        </>
      ) : null}
    </>
  );
}
