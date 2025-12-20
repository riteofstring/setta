import { Item } from "components/Utils/atoms/dropdown/item";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { clearActiveSectionIds } from "state/actions/activeSections";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  getActiveViewModeConfig,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useContextMenus, useProjectState } from "state/definitions";
import { route_delete_sections, route_group_sections } from "utils/generatedEndpoints";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu() {
  const { isOpen, x, y, nodeIds } = useContextMenus(
    (x) => x.selection,
    _.isEqual,
  );

  const { allVisible, allLocked, isEditingViewMode, isUserView } =
    useProjectState((state) => {
      const viewMode = getActiveViewModeConfig(state);
      const nodeMap = state.sections;
      const { isEditingViewMode } = state.projectConfig;

      let allVisible = true;
      let allLocked = true;

      for (const id of nodeIds) {
        const node = nodeMap[id];
        const visibility = viewMode.visibilityBySectionId[id];
        if (visibility === undefined) {
          throw new Error(
            `Missing visibility for section ${id} in view mode ${viewMode.id}`,
          );
        }
        if (!visibility) {
          allVisible = false;
        }

        if (!node.positionAndSizeLocked) {
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
    route_group_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: nodeIds,
    });
    closeContextMenu();
  }

  function onClickDelete() {
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: nodeIds,
    });
    closeContextMenu();
    clearActiveSectionIds();
  }

  function onClickLock() {
    useProjectState.setState((state) => {
      for (const n of nodeIds) {
        state.sections[n].positionAndSizeLocked = !allLocked;
      }
    });
    closeContextMenu();
  }

  function onClickVisibility() {
    useProjectState.setState((state) => {
      const viewMode = getActiveViewModeConfig(state);
      for (const n of nodeIds) {
        const visibility = viewMode.visibilityBySectionId[n];
        if (visibility === undefined) {
          throw new Error(
            `Missing visibility for section ${n} in view mode ${viewMode.id}`,
          );
        }
        viewMode.visibilityBySectionId[n] = !allVisible;
      }
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
      <Item onClick={onClickCreate}>Create Group</Item>
      <Item onClick={onClickDelete}>Delete</Item>
      <Item onClick={onClickLock}>{lockItem}</Item>
      {isEditingViewMode && (
        <Item onClick={onClickVisibility}>{visibilityItem}</Item>
      )}
    </ContextMenuCore>
  );
}
