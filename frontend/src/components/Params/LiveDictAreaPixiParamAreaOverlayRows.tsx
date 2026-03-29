import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import { useMemo, type MouseEventHandler } from "react";
import {
  LiveDictAreaPixiDragOverlaySceneRow,
  type LiveDictAreaPixiDragOverlaySceneRowPacket,
} from "./LiveDictAreaPixiDragOverlaySceneRow";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamSwitch } from "./ParamSwitch";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

type LiveDictAreaPixiParamAreaOverlayRowsProps = {
  hasSectionStyleTheme: boolean;
  listKey: ParamListKey;
  onResizeStart: MouseEventHandler;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  sceneRows: ParamSceneRowPacket[];
  sectionId: string;
};

type LiveDictAreaPixiDragOverlaySceneRowLookup = {
  childIdsByParentId: Record<string, string[]>;
  sceneRowsById: Record<string, ParamSceneRowPacket>;
};

export function LiveDictAreaPixiParamAreaOverlayRows({
  hasSectionStyleTheme,
  listKey,
  onResizeStart,
  paramIds,
  requiredParamIdsToPaths,
  sceneRows,
  sectionId,
}: LiveDictAreaPixiParamAreaOverlayRowsProps) {
  const sceneRowLookup = useMemo(
    () =>
      buildLiveDictAreaPixiDragOverlaySceneRowLookup({
        sceneRows,
      }),
    [sceneRows],
  );

  return paramIds.map((paramInfoId) => (
    <LiveDictAreaPixiParamAreaOverlayRowBranch
      key={paramInfoId}
      depth={0}
      hasSectionStyleTheme={hasSectionStyleTheme}
      listKey={listKey}
      onResizeStart={onResizeStart}
      paramInfoId={paramInfoId}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      sceneRowLookup={sceneRowLookup}
      sectionId={sectionId}
    />
  ));
}

function LiveDictAreaPixiParamAreaOverlayRowBranch({
  depth,
  hasSectionStyleTheme,
  listKey,
  onResizeStart,
  paramInfoId,
  requiredParamIdsToPaths,
  sceneRowLookup,
  sectionId,
}: {
  depth: number;
  hasSectionStyleTheme: boolean;
  listKey: ParamListKey;
  onResizeStart: MouseEventHandler;
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
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
        <ParamSwitch
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevelWithPad={false}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          renderMode="drag-overlay"
        />
        {childParamIds.map((childParamId) => (
          <LiveDictAreaPixiParamAreaOverlayRowBranch
            key={childParamId}
            depth={depth + 1}
            hasSectionStyleTheme={hasSectionStyleTheme}
            listKey={listKey}
            onResizeStart={onResizeStart}
            paramInfoId={childParamId}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
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
        listKey={listKey}
        scenePacket={scenePacket}
        sectionId={sectionId}
      />
      {childParamIds.map((childParamId) => (
        <LiveDictAreaPixiParamAreaOverlayRowBranch
          key={childParamId}
          depth={depth + 1}
          hasSectionStyleTheme={hasSectionStyleTheme}
          listKey={listKey}
          onResizeStart={onResizeStart}
          paramInfoId={childParamId}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
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
