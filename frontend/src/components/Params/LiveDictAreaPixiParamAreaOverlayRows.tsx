import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import { useMemo } from "react";
import { useProjectSearch, useTypeErrors } from "state/definitions";
import { LiveDictAreaPixiDragOverlayPlaceholderRow } from "./LiveDictAreaPixiDragOverlayPlaceholderRow";
import {
  DEFAULT_LIVE_DICT_AREA_PIXI_DRAG_OVERLAY_ROW_STATE,
  buildLiveDictAreaPixiDragOverlayRowStateLookup,
  type LiveDictAreaPixiDragOverlayRowStateLookup,
} from "./liveDictAreaPixiDragOverlayRowState";
import {
  LiveDictAreaPixiDragOverlaySceneRow,
  type LiveDictAreaPixiDragOverlaySceneRowPacket,
} from "./LiveDictAreaPixiDragOverlaySceneRow";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

type LiveDictAreaPixiParamAreaOverlayRowsProps = {
  hasSectionStyleTheme: boolean;
  isSelectingParams: boolean;
  listKey: ParamListKey;
  paramIds: string[];
  sceneRows: ParamSceneRowPacket[];
  sectionId: string;
  selectedParamIds: string[];
};

type LiveDictAreaPixiDragOverlaySceneRowLookup = {
  childIdsByParentId: Record<string, string[]>;
  sceneRowsById: Record<string, ParamSceneRowPacket>;
};

export function LiveDictAreaPixiParamAreaOverlayRows({
  hasSectionStyleTheme,
  isSelectingParams,
  listKey,
  paramIds,
  sceneRows,
  sectionId,
  selectedParamIds,
}: LiveDictAreaPixiParamAreaOverlayRowsProps) {
  const sceneRowLookup = useMemo(
    () =>
      buildLiveDictAreaPixiDragOverlaySceneRowLookup({
        sceneRows,
      }),
    [sceneRows],
  );
  const searchState = useProjectSearch(
    (state) => ({
      focused: state.focused,
      lookup: state.lookup,
    }),
    _.isEqual,
  );
  const paramErrorsById = useTypeErrors(
    (state) => state.errors[sectionId]?.params ?? {},
    _.isEqual,
  );
  const rowStateLookup = useMemo(
    () =>
      buildLiveDictAreaPixiDragOverlayRowStateLookup({
        focusedSearchResult: searchState.focused,
        paramErrorsById,
        sceneRows,
        searchLookup: searchState.lookup,
        sectionId,
        selectedParamIds,
      }),
    [
      paramErrorsById,
      sceneRows,
      searchState.focused,
      searchState.lookup,
      sectionId,
      selectedParamIds,
    ],
  );

  return paramIds.map((paramInfoId) => (
    <LiveDictAreaPixiParamAreaOverlayRowBranch
      key={paramInfoId}
      depth={0}
      hasSectionStyleTheme={hasSectionStyleTheme}
      isSelectingParams={isSelectingParams}
      listKey={listKey}
      paramInfoId={paramInfoId}
      rowStateLookup={rowStateLookup}
      sceneRowLookup={sceneRowLookup}
      sectionId={sectionId}
    />
  ));
}

function LiveDictAreaPixiParamAreaOverlayRowBranch({
  depth,
  hasSectionStyleTheme,
  isSelectingParams,
  listKey,
  paramInfoId,
  rowStateLookup,
  sceneRowLookup,
  sectionId,
}: {
  depth: number;
  hasSectionStyleTheme: boolean;
  isSelectingParams: boolean;
  listKey: ParamListKey;
  paramInfoId: string;
  rowStateLookup: LiveDictAreaPixiDragOverlayRowStateLookup;
  sceneRowLookup: LiveDictAreaPixiDragOverlaySceneRowLookup;
  sectionId: string;
}) {
  const fallbackChildIds = sceneRowLookup.childIdsByParentId[paramInfoId] ?? [];
  const childParamIds = useParamDndChildrenForParent(
    paramInfoId,
    fallbackChildIds,
  );
  const baseScenePacket = sceneRowLookup.sceneRowsById[paramInfoId];

  if (isTempParam(paramInfoId)) {
    return (
      <>
        <LiveDictAreaPixiDragOverlayPlaceholderRow
          depth={depth}
          hasSectionStyleTheme={hasSectionStyleTheme}
          listKey={listKey}
          paramInfoId={paramInfoId}
          sectionId={sectionId}
        />
        {childParamIds.map((childParamId) => (
          <LiveDictAreaPixiParamAreaOverlayRowBranch
            key={childParamId}
            depth={depth + 1}
            hasSectionStyleTheme={hasSectionStyleTheme}
            isSelectingParams={isSelectingParams}
            listKey={listKey}
            paramInfoId={childParamId}
            rowStateLookup={rowStateLookup}
            sceneRowLookup={sceneRowLookup}
            sectionId={sectionId}
          />
        ))}
      </>
    );
  }

  if (!baseScenePacket) {
    throw new Error(
      `Expected drag-overlay scene packet for visible row ${paramInfoId}.`,
    );
  }

  const scenePacket: LiveDictAreaPixiDragOverlaySceneRowPacket = {
    ...baseScenePacket,
    childIds: fallbackChildIds,
    depth,
  };

  return (
    <>
      <LiveDictAreaPixiDragOverlaySceneRow
        hasSectionStyleTheme={hasSectionStyleTheme}
        isSelectingParams={isSelectingParams}
        listKey={listKey}
        rowState={
          rowStateLookup[paramInfoId] ??
          DEFAULT_LIVE_DICT_AREA_PIXI_DRAG_OVERLAY_ROW_STATE
        }
        scenePacket={scenePacket}
        sectionId={sectionId}
      />
      {childParamIds.map((childParamId) => (
        <LiveDictAreaPixiParamAreaOverlayRowBranch
          key={childParamId}
          depth={depth + 1}
          hasSectionStyleTheme={hasSectionStyleTheme}
          isSelectingParams={isSelectingParams}
          listKey={listKey}
          paramInfoId={childParamId}
          rowStateLookup={rowStateLookup}
          sceneRowLookup={sceneRowLookup}
          sectionId={sectionId}
        />
      ))}
    </>
  );
}

function buildLiveDictAreaPixiDragOverlaySceneRowLookup({
  sceneRows,
}: {
  sceneRows: ParamSceneRowPacket[];
}): LiveDictAreaPixiDragOverlaySceneRowLookup {
  const childIdsByParentId: Record<string, string[]> = {};
  const sceneRowsById: Record<string, ParamSceneRowPacket> = {};
  const groupStack: string[] = [];

  for (const sceneRow of sceneRows) {
    sceneRowsById[sceneRow.id] = sceneRow;

    while (groupStack.length > sceneRow.depth) {
      groupStack.pop();
    }

    if (sceneRow.depth > 0) {
      const parentId = groupStack[sceneRow.depth - 1];
      if (!parentId) {
        throw new Error(
          `Expected drag-overlay group parent for row ${sceneRow.id}.`,
        );
      }
      if (!(parentId in childIdsByParentId)) {
        childIdsByParentId[parentId] = [];
      }
      childIdsByParentId[parentId].push(sceneRow.id);
    }

    if (sceneRow.kind === "group") {
      groupStack[sceneRow.depth] = sceneRow.id;
    }
  }

  return {
    childIdsByParentId,
    sceneRowsById,
  };
}
