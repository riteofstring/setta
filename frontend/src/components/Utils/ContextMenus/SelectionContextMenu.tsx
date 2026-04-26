import { Item } from "components/Utils/atoms/dropdown/item";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  deleteSections,
  groupSections,
  togglePositionLocks,
  toggleSectionVisibility,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
import { ContextMenuCore } from "./ContextMenuCore";
export function SelectionContextMenu() {
  const { isOpen, x, y, nodeIds } = useContextMenus(
    (x) => x.selection,
    _.isEqual,
  );
  if (!isOpen) {
    return null;
  }
  return <SelectionContextMenuOpen x={x} y={y} nodeIds={nodeIds} />;
}
type SelectionContextMenuOpenProps = {
  x: number;
  y: number;
  nodeIds: Array<string>;
};
function SelectionContextMenuOpen({
  x,
  y,
  nodeIds,
}: SelectionContextMenuOpenProps) {
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
    callOpenAPI(
      groupSections({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: nodeIds,
        },
      } as Parameters<typeof groupSections>[0]),
    );
    closeContextMenu();
  }
  function onClickDelete() {
    if (!canEditStructure) {
      return;
    }
    callOpenAPI(
      deleteSections({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: nodeIds,
        },
      } as Parameters<typeof deleteSections>[0]),
    );
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
          callOpenAPI(
            togglePositionLocks({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionIds: sectionIdsToToggle,
                frontendOpId,
              },
            } as Parameters<typeof togglePositionLocks>[0]),
          ),
      });
    }
    closeContextMenu();
  }
  function onClickVisibility() {
    if (!canEditStructure) {
      return;
    }
    callOpenAPI(
      toggleSectionVisibility({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: nodeIds,
        },
      } as Parameters<typeof toggleSectionVisibility>[0]),
    );
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
      isOpen={true}
      closeContextMenu={closeContextMenu}
    >
      <Item onClick={onClickCreate} disabled={!canEditStructure}>
        Create Dict
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
