import { Item } from "components/Utils/atoms/dropdown/item";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { clearActiveSectionIds } from "state/actions/activeSections";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  dispatchOptimisticProjectStateUpdate,
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useContextMenus, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_delete_sections,
  route_group_sections,
  route_toggle_position_locks,
  route_toggle_section_visibility,
} from "utils/generatedEndpoints";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu() {
  const { isOpen, x, y, nodeIds } = useContextMenus(
    (x) => x.selection,
    _.isEqual,
  );
  const { canEditLayout, canEditStructure } = useShareCapabilities();

  const { allVisible, allLocked, isEditingViewMode, isUserView } =
    useProjectState((state) => {
      const viewMode = getActiveViewModeConfig(state);
      const { isEditingViewMode } = state.projectConfig;

      let allVisible = true;
      let allLocked = true;

      for (const id of nodeIds) {
        const impl = getCurrEffectiveSectionImpl(state, id);
        const visibility = viewMode.visibilityBySectionId[id];
        if (visibility === undefined) {
          throw new Error(
            `Missing visibility for section ${id} in view mode ${viewMode.id}`,
          );
        }
        if (!visibility) {
          allVisible = false;
        }

        if (!impl.positionAndSizeLocked) {
          allLocked = false;
        }

        if (!allVisible && !allLocked) {
          break;
        }
      }

      return {
        allVisible,
        allLocked,
        isEditingViewMode,
        isUserView: viewMode.isUserFacing && !isEditingViewMode,
      };
    }, _.isEqual);

  const closeContextMenu = () => {
    closeAllContextMenus();
    useReactFlow.setState({ nodesSelectionDims: null });
  };

  function onClickCreate() {
    if (!canEditStructure) {
      return;
    }
    route_group_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: nodeIds,
    });
    closeContextMenu();
  }

  function onClickDelete() {
    if (!canEditStructure) {
      return;
    }
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: nodeIds,
    });
    closeContextMenu();
    clearActiveSectionIds();
  }

  function onClickLock() {
    if (!canEditLayout) {
      return;
    }
    const state = useProjectState.getState();
    const targetLocked = !allLocked;
    const sectionIdsToToggle = nodeIds.filter((sectionId: string) => {
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      return impl.positionAndSizeLocked !== targetLocked;
    });
    if (sectionIdsToToggle.length > 0) {
      dispatchOptimisticProjectStateUpdate({
        apply: (draft) => {
          for (const sectionId of sectionIdsToToggle) {
            setCurrEffectiveSectionImplValue(draft, sectionId, {
              positionAndSizeLocked: targetLocked,
            });
          }
        },
        send: (frontendOpId) =>
          route_toggle_position_locks({
            projectConfigId: getCurrProjectConfigId(),
            sectionIds: sectionIdsToToggle,
            frontendOpId,
          }),
      });
    }
    closeContextMenu();
  }

  function onClickVisibility() {
    if (!canEditStructure) {
      return;
    }
    route_toggle_section_visibility({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: nodeIds,
    });
    closeContextMenu();
  }

  const lockItem = allLocked
    ? "Unlock Position & Size"
    : "Lock Position & Size";

  const visibilityItem = allVisible ? "Hide" : "Show";

  if (isUserView) {
    return null;
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      isOpen={isOpen}
      closeContextMenu={closeContextMenu}
    >
      <Item onClick={onClickCreate} disabled={!canEditStructure}>
        Create Group
      </Item>
      <Item onClick={onClickDelete} disabled={!canEditStructure}>
        Delete
      </Item>
      <Item onClick={onClickLock} disabled={!canEditLayout}>
        {lockItem}
      </Item>
      {isEditingViewMode && (
        <Item onClick={onClickVisibility} disabled={!canEditStructure}>
          {visibilityItem}
        </Item>
      )}
    </ContextMenuCore>
  );
}
