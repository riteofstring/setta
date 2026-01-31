import {
  useAgenticLinkState,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  route_create_agentic_edge,
  route_delete_agentic_edges,
  route_set_agentic_edges,
  route_update_agentic_edge,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";

function getSectionTypeById(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): SectionTypeEnum | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl.type ?? null;
}

export function toggleAgenticEdgeSelection(
  edgeId: string,
  multiSelect: boolean,
) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edges = state.projectConfig.agenticEdges;
      for (const edge of edges) {
        if (edge.id === edgeId) {
          edge.selected = multiSelect ? !edge.selected : true;
        } else if (!multiSelect) {
          edge.selected = false;
        }
      }
    },
    send: (frontendOpId) => {
      if (multiSelect) {
        const edge = useProjectState
          .getState()
          .projectConfig.agenticEdges.find(
            (candidate) => candidate.id === edgeId,
          );
        if (!edge) {
          return;
        }
        return route_update_agentic_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.agenticEdges,
        frontendOpId,
      });
    },
  });
}

export function deleteSelectedAgenticEdges(): boolean {
  if (useShareSession.getState().isShareMode) {
    return false;
  }
  const state = useProjectState.getState();
  const selectedIds = state.projectConfig.agenticEdges
    .filter((edge) => edge.selected)
    .map((edge) => edge.id);

  if (selectedIds.length === 0) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !selectedIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
  });

  return true;
}

export function deleteAgenticEdgesById(edgeIds: string[]): void {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  if (edgeIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !edgeIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds,
        frontendOpId,
      }),
  });
}

export function createAgenticEdgeFromSections({
  sourceSectionId,
  targetSectionId,
  kind,
  contextMode = AgenticEdgeContextModeEnum.reference_only,
}: {
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKindEnum;
  contextMode?: AgenticEdgeContextModeEnum;
}): void {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  if (sourceSectionId === targetSectionId) {
    return;
  }
  const existingEdges = useProjectState.getState().projectConfig.agenticEdges;
  const alreadyExists = existingEdges.some((edge) => {
    if (edge.kind !== kind) {
      return false;
    }
    if (kind === AgenticEdgeKindEnum.chat_chat) {
      return (
        (edge.sourceSectionId === sourceSectionId &&
          edge.targetSectionId === targetSectionId) ||
        (edge.sourceSectionId === targetSectionId &&
          edge.targetSectionId === sourceSectionId)
      );
    }
    return (
      edge.sourceSectionId === sourceSectionId &&
      edge.targetSectionId === targetSectionId
    );
  });
  if (alreadyExists) {
    return;
  }

  void route_create_agentic_edge({
    projectConfigId: getCurrProjectConfigId(),
    sourceSectionId,
    targetSectionId,
    kind,
    contextMode,
  });
}

export function handleAgenticLinkClick(targetSectionId: string): boolean {
  const sourceSectionId = useAgenticLinkState.getState().sourceSectionId;
  if (!sourceSectionId) {
    return false;
  }
  useAgenticLinkState.setState({ sourceSectionId: null });
  if (useShareSession.getState().isShareMode) {
    return true;
  }
  if (sourceSectionId === targetSectionId) {
    return true;
  }
  const state = useProjectState.getState();
  const sourceType = getSectionTypeById(state, sourceSectionId);
  const targetType = getSectionTypeById(state, targetSectionId);
  if (!sourceType || !targetType) {
    return true;
  }
  let kind: AgenticEdgeKindEnum | null = null;
  if (
    sourceType === SectionTypeEnum.Chat &&
    targetType === SectionTypeEnum.Chat
  ) {
    kind = AgenticEdgeKindEnum.chat_chat;
  } else if (sourceType === SectionTypeEnum.Chat) {
    kind = AgenticEdgeKindEnum.chat_section;
  } else if (targetType === SectionTypeEnum.Chat) {
    kind = AgenticEdgeKindEnum.section_chat;
  }
  if (!kind) {
    return true;
  }
  createAgenticEdgeFromSections({
    sourceSectionId,
    targetSectionId,
    kind,
  });
  return true;
}
