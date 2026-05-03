import type { GpuPortAnchorDescriptor } from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import { AGENTIC_EDGE_HANDLE_IDS } from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { getAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionInfos";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import type { ZustandProjectState } from "state/definitions";
import { getSectionHeaderHeightKey } from "utils/constants";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import {
  getProjectSceneMeasuredHeight,
  type ProjectGpuSceneResizePolicyContext,
} from "./projectGpuSceneResizePolicy";
import { getProjectSectionSceneSearchHeight } from "./projectSectionSceneSearchLayout";

const PROJECT_SECTION_LINK_HANDLE_OFFSET_X_PX = 19;

type ProjectSectionSceneLinkHandleMode =
  | "agentic"
  | "chat"
  | "none"
  | "state-machine";

export function getProjectSectionSceneLinkPortAnchors({
  projectState,
  resizePolicyContext,
  sectionId,
  sectionImpl,
  worldRect,
}: {
  readonly projectState: ZustandProjectState;
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): readonly GpuPortAnchorDescriptor[] {
  const mode = getProjectSectionSceneLinkHandleMode({
    projectState,
    sectionId,
    sectionImpl,
  });
  if (mode === "none") {
    return [];
  }
  const y = getProjectSectionSceneLinkHandleLocalY({
    resizePolicyContext,
    sectionId,
    sectionImpl,
    worldRect,
  });
  switch (mode) {
    case "agentic":
      return createProjectSectionSceneBidirectionalLinkAnchors({
        ids: AGENTIC_EDGE_HANDLE_IDS,
        y,
        worldRect,
      });
    case "chat":
      return createProjectSectionSceneBidirectionalLinkAnchors({
        ids: SHARED_CHAT_EDGE_HANDLE_IDS,
        y,
        worldRect,
      });
    case "state-machine":
      return createProjectSectionSceneWorkflowLinkAnchors({
        sectionImpl,
        y,
        worldRect,
      });
  }
}

function createProjectSectionSceneBidirectionalLinkAnchors({
  ids,
  worldRect,
  y,
}: {
  readonly ids: {
    readonly reverseStart: string;
    readonly source: string;
    readonly target: string;
  };
  readonly worldRect: GpuRect;
  readonly y: number;
}): readonly GpuPortAnchorDescriptor[] {
  return [
    createProjectSectionSceneReverseStartLinkAnchor({
      id: ids.reverseStart,
      y,
    }),
    createProjectSectionSceneTargetLinkAnchor({ id: ids.target, y }),
    createProjectSectionSceneSourceLinkAnchor({
      id: ids.source,
      width: worldRect.width,
      y,
    }),
  ];
}

function createProjectSectionSceneWorkflowLinkAnchors({
  sectionImpl,
  worldRect,
  y,
}: {
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
  readonly y: number;
}): readonly GpuPortAnchorDescriptor[] {
  switch (sectionImpl.type) {
    case SectionTypeEnum.StateMachineStart:
      return [
        createProjectSectionSceneSourceLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          width: worldRect.width,
          y,
        }),
      ];
    case SectionTypeEnum.StateMachineGate:
      return [
        createProjectSectionSceneReverseStartLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
          y,
        }),
        createProjectSectionSceneTargetLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          y,
        }),
        createProjectSectionSceneSourceLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          width: worldRect.width,
          y,
        }),
      ];
    case SectionTypeEnum.StateMachineEnd:
      return [
        createProjectSectionSceneReverseStartLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
          y,
        }),
        createProjectSectionSceneTargetLinkAnchor({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          y,
        }),
      ];
    default:
      return [];
  }
}

function createProjectSectionSceneTargetLinkAnchor({
  id,
  y,
}: {
  readonly id: string;
  readonly y: number;
}): GpuPortAnchorDescriptor {
  return {
    id,
    isConnectableStart: false,
    kind: "input",
    localPosition: { x: -PROJECT_SECTION_LINK_HANDLE_OFFSET_X_PX, y },
    side: "left",
  };
}

function createProjectSectionSceneReverseStartLinkAnchor({
  id,
  y,
}: {
  readonly id: string;
  readonly y: number;
}): GpuPortAnchorDescriptor {
  return {
    connectionStartSemanticType: "target",
    id,
    isConnectableEnd: false,
    isConnectableStart: true,
    kind: "output",
    localPosition: { x: -PROJECT_SECTION_LINK_HANDLE_OFFSET_X_PX, y },
    side: "left",
  };
}

function createProjectSectionSceneSourceLinkAnchor({
  id,
  width,
  y,
}: {
  readonly id: string;
  readonly width: number;
  readonly y: number;
}): GpuPortAnchorDescriptor {
  return {
    id,
    isConnectableStart: true,
    kind: "output",
    localPosition: {
      x: width + PROJECT_SECTION_LINK_HANDLE_OFFSET_X_PX,
      y,
    },
    side: "right",
  };
}

function getProjectSectionSceneLinkHandleMode({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): ProjectSectionSceneLinkHandleMode {
  if (isReadOnlyUserFacingView(projectState)) {
    return "none";
  }
  if (sectionImpl.type === SectionTypeEnum.Group) {
    return "none";
  }
  if (
    getAttachedTerminalParentIdForTerminalSection(projectState, sectionId) !==
    null
  ) {
    return "none";
  }
  if (sectionImpl.type === SectionTypeEnum.Chat) {
    return "chat";
  }
  return isStateMachineLinkSectionType(sectionImpl.type)
    ? "state-machine"
    : "agentic";
}

function isReadOnlyUserFacingView(projectState: ZustandProjectState): boolean {
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  const activeViewMode = activeViewModeId
    ? projectState.projectConfig.viewModes[activeViewModeId]
    : null;
  return Boolean(
    activeViewMode?.isUserFacing &&
      !projectState.projectConfig.isEditingViewMode,
  );
}

function isStateMachineLinkSectionType(
  type: BaseSectionImplUnion["type"],
): boolean {
  return (
    type === SectionTypeEnum.StateMachineStart ||
    type === SectionTypeEnum.StateMachineGate ||
    type === SectionTypeEnum.StateMachineEnd
  );
}

function getProjectSectionSceneLinkHandleLocalY({
  resizePolicyContext,
  sectionId,
  sectionImpl,
  worldRect,
}: {
  readonly resizePolicyContext: ProjectGpuSceneResizePolicyContext;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
  readonly worldRect: GpuRect;
}): number {
  const searchHeight = getProjectSectionSceneSearchHeight(sectionImpl);
  if (searchHeight > 0) {
    return (
      getProjectSceneMeasuredHeight(
        resizePolicyContext,
        getSectionHeaderHeightKey(sectionId),
      ) +
      searchHeight / 2
    );
  }
  return worldRect.height / 2;
}
