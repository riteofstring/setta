import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Handle } from "gpuFlow/Handle";
import { useNodeId } from "gpuFlow/NodeIdContext";
import { HandlePosition } from "gpuFlow/flowTypes";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import {
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
  STATE_MACHINE_EDGE_HANDLE_IDS,
} from "state/actions/stateMachineEdges";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

type ConnectionVisibility = {
  hasIncoming: boolean;
  hasOutgoing: boolean;
  sectionType: SectionType | null;
};

type HandleLayout = {
  canSource: boolean;
  canTarget: boolean;
  chatOffsetClassName: string;
  alwaysVisibleClassName: string;
};

type HandleRenderConfig = {
  id: string;
  type: "source" | "target";
  position: HandlePosition;
  className: string;
  dataTestId: string;
  isConnectableStart: boolean;
  isConnectableEnd: boolean;
  ariaLabel?: string;
  ariaHidden?: boolean;
  tabIndex?: number;
  dataReverseStart?: string;
  connectionStartSemanticType?: "target";
  floatingBoxContent?: string;
};

type HandleGroupConfig = {
  side: "left" | "right";
  safeZoneClassName: string;
  handles: HandleRenderConfig[];
};

type ProjectStateSnapshot = ReturnType<typeof useProjectState.getState>;

const EMPTY_CONNECTION_VISIBILITY: ConnectionVisibility = {
  hasIncoming: false,
  hasOutgoing: false,
  sectionType: null,
};

const HANDLE_LAYOUT_BY_SECTION_TYPE: Partial<
  Record<SectionType, HandleLayout>
> = {
  [SectionTypeEnum.Chat]: {
    canSource: true,
    canTarget: true,
    chatOffsetClassName: " workflow-handle-scope--chat",
    alwaysVisibleClassName: "",
  },
  [SectionTypeEnum.StateMachineStart]: {
    canSource: true,
    canTarget: false,
    chatOffsetClassName: "",
    alwaysVisibleClassName: " agentic-handle--always-visible",
  },
  [SectionTypeEnum.StateMachineGate]: {
    canSource: true,
    canTarget: true,
    chatOffsetClassName: "",
    alwaysVisibleClassName: " agentic-handle--always-visible",
  },
  [SectionTypeEnum.StateMachineEnd]: {
    canSource: false,
    canTarget: true,
    chatOffsetClassName: "",
    alwaysVisibleClassName: " agentic-handle--always-visible",
  },
};

function getConnectionVisibility(
  sectionId: string,
  state: ProjectStateSnapshot,
): ConnectionVisibility {
  const sectionType = getSectionType(sectionId, state);
  if (sectionType === null) {
    return EMPTY_CONNECTION_VISIBILITY;
  }
  const { hasIncoming, hasOutgoing } = getEdgeVisibility(
    sectionId,
    state.projectConfig.stateMachineEdges,
  );
  return {
    hasIncoming,
    hasOutgoing,
    sectionType,
  };
}

function getSectionType(
  sectionId: string,
  state: ProjectStateSnapshot,
): SectionType | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  const variant = variantId ? state.sectionVariants[variantId] : null;
  if (!variant) {
    return null;
  }
  const sectionType = state.sectionImpls[variant.impl]?.type;
  return sectionType ? (sectionType as SectionType) : null;
}

function getEdgeVisibility(
  sectionId: string,
  edges: ProjectStateSnapshot["projectConfig"]["stateMachineEdges"],
): Pick<ConnectionVisibility, "hasIncoming" | "hasOutgoing"> {
  let hasIncoming = false;
  let hasOutgoing = false;
  for (const edge of edges ?? []) {
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
  };
}

function getHandleLayout(sectionType: SectionType | null): HandleLayout | null {
  return sectionType === null
    ? null
    : HANDLE_LAYOUT_BY_SECTION_TYPE[sectionType] ?? null;
}

function getScopeClassName(chatOffsetClassName: string): string {
  return `workflow-handle-scope${chatOffsetClassName}`;
}

function joinHandleClasses(
  scopeClassName: string,
  variantClassName: string,
  isConnected: boolean,
  isSelectingEdge: boolean,
  alwaysVisibleClassName: string,
): string {
  return [
    SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
    SETTA_PREVENT_SECTION_ACTIVE_CSS,
    "agentic-handle-metrics",
    "workflow-handle-metrics",
    scopeClassName,
    "agentic-handle",
    "workflow-handle",
    variantClassName,
    isConnected ? "agentic-handle--connected workflow-handle--connected" : null,
    isSelectingEdge ? "agentic-handle--selecting" : null,
    alwaysVisibleClassName.trim() || null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getSafeZoneClassName(
  scopeClassName: string,
  side: "left" | "right",
): string {
  return [
    SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
    SETTA_PREVENT_SECTION_ACTIVE_CSS,
    NO_DRAG_CLASS_NAME,
    NO_PAN_CLASS_NAME,
    "agentic-handle-metrics",
    "workflow-handle-metrics",
    scopeClassName,
    "agentic-handle-safe-zone",
    "workflow-handle-safe-zone",
    `workflow-handle-safe-zone--${side}`,
  ].join(" ");
}

function getHandleGroups({
  sectionId,
  layout,
  hasIncoming,
  hasOutgoing,
  isSelectingEdge,
}: {
  sectionId: string;
  layout: HandleLayout;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  isSelectingEdge: boolean;
}): HandleGroupConfig[] {
  const scopeClassName = getScopeClassName(layout.chatOffsetClassName);
  const groups: HandleGroupConfig[] = [];

  if (layout.canTarget) {
    groups.push({
      side: "left",
      safeZoneClassName: getSafeZoneClassName(scopeClassName, "left"),
      handles: [
        {
          id: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
          type: "source",
          position: HandlePosition.Left,
          className: joinHandleClasses(
            scopeClassName,
            "workflow-handle--target agentic-handle--reverse-start",
            hasIncoming,
            isSelectingEdge,
            layout.alwaysVisibleClassName,
          ),
          dataTestId: `workflow-reverse-start-handle-${sectionId}`,
          isConnectableStart: true,
          isConnectableEnd: false,
          ariaHidden: true,
          tabIndex: -1,
          dataReverseStart: "true",
          connectionStartSemanticType: "target",
        },
        {
          id: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          type: "target",
          position: HandlePosition.Left,
          className: joinHandleClasses(
            scopeClassName,
            "workflow-handle--target",
            hasIncoming,
            isSelectingEdge,
            layout.alwaysVisibleClassName,
          ),
          dataTestId: `workflow-target-handle-${sectionId}`,
          isConnectableStart: false,
          isConnectableEnd: true,
          ariaLabel: "Workflow edge target",
          floatingBoxContent: "Workflow edge target",
        },
      ],
    });
  }

  if (layout.canSource) {
    groups.push({
      side: "right",
      safeZoneClassName: getSafeZoneClassName(scopeClassName, "right"),
      handles: [
        {
          id: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          type: "source",
          position: HandlePosition.Right,
          className: joinHandleClasses(
            scopeClassName,
            "workflow-handle--source",
            hasOutgoing,
            isSelectingEdge,
            layout.alwaysVisibleClassName,
          ),
          dataTestId: `workflow-source-handle-${sectionId}`,
          isConnectableStart: true,
          isConnectableEnd: true,
          ariaLabel: "Workflow edge source",
          floatingBoxContent: "Workflow edge source",
        },
      ],
    });
  }

  return groups;
}

function StateMachineHandleGroup({
  group,
  canEditStructure,
}: {
  group: HandleGroupConfig;
  canEditStructure: boolean;
}) {
  return (
    <>
      <div aria-hidden="true" className={group.safeZoneClassName} />
      {group.handles.map((handle) => {
        const floatingBoxHandlers = handle.floatingBoxContent
          ? getFloatingBoxHandlers({
              content: handle.floatingBoxContent,
            })
          : {};
        const optionalHandleProps = {
          ...(handle.dataReverseStart === undefined
            ? {}
            : { "data-reverse-start": handle.dataReverseStart }),
          ...(handle.ariaHidden === undefined
            ? {}
            : { "aria-hidden": handle.ariaHidden }),
          ...(handle.tabIndex === undefined
            ? {}
            : { tabIndex: handle.tabIndex }),
          ...(handle.connectionStartSemanticType === undefined
            ? {}
            : {
                connectionStartSemanticType: handle.connectionStartSemanticType,
              }),
          ...(handle.ariaLabel === undefined
            ? {}
            : { "aria-label": handle.ariaLabel }),
        };
        return (
          <Handle
            key={`${group.side}-${handle.id}`}
            id={handle.id}
            type={handle.type}
            position={handle.position}
            className={handle.className}
            data-testid={handle.dataTestId}
            isConnectable={canEditStructure}
            isConnectableStart={canEditStructure && handle.isConnectableStart}
            isConnectableEnd={canEditStructure && handle.isConnectableEnd}
            isValidConnection={isValidStateMachineEdgeConnection}
            onConnect={createStateMachineEdgeFromConnection}
            {...optionalHandleProps}
            {...floatingBoxHandlers}
          />
        );
      })}
    </>
  );
}

export function StateMachineEdgeHandles({
  isUserView,
}: {
  isUserView: boolean;
}) {
  const sectionId = useNodeId();
  const { canEditStructure } = useShareCapabilities();
  const isSelectingEdge = useGpuFlowViewportStore(
    (state) => state.connectionStartHandle !== null,
  );
  const connectionVisibility = useProjectState(
    (state) =>
      sectionId
        ? getConnectionVisibility(sectionId, state)
        : EMPTY_CONNECTION_VISIBILITY,
    (left, right) =>
      left.hasIncoming === right.hasIncoming &&
      left.hasOutgoing === right.hasOutgoing &&
      left.sectionType === right.sectionType,
  );
  const handleLayout = getHandleLayout(connectionVisibility.sectionType);

  if (isUserView || !sectionId || handleLayout === null) {
    return null;
  }

  const handleGroups = getHandleGroups({
    sectionId,
    layout: handleLayout,
    hasIncoming: connectionVisibility.hasIncoming,
    hasOutgoing: connectionVisibility.hasOutgoing,
    isSelectingEdge,
  });

  return (
    <>
      {handleGroups.map((group) => (
        <StateMachineHandleGroup
          key={group.side}
          group={group}
          canEditStructure={canEditStructure}
        />
      ))}
    </>
  );
}
