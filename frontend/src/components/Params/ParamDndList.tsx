import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { ParamDndProvider } from "./ParamDndContext";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";
import { ParamSwitch } from "./ParamSwitch";
import {
  getNestedParamSwitchRenderState,
  getVisibleRenderableParamIds,
} from "./getFilteredRenderableParamIds";
import { getParamDndListRenderModel } from "./getParamDndListRenderModel";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
  showResizeHandle?: boolean;
};

function ParamDndListRows({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
  nestedParentParamIdLookup,
  visibleParamIdLookup,
  dndParentId,
  showResizeHandle = true,
}: ParamDndListProps & {
  nestedParentParamIdLookup: Record<string, true>;
  visibleParamIdLookup: Record<string, true> | null;
  dndParentId: string;
}) {
  const renderParamIds = useParamDndChildrenForParent(dndParentId, paramIds);
  const visibleParamIds = getVisibleRenderableParamIds({
    renderParamIds,
    visibleParamIdLookup,
  });

  return visibleParamIds.map((paramId, idx) => {
    const nestedRenderState = getNestedParamSwitchRenderState({
      paramId,
      requiredParamIdsToPaths,
      nestedParentParamIdLookup,
      visibleParamIdLookup,
    });

    return (
      <ParamSwitch
        key={paramId}
        sectionId={sectionId}
        paramInfoId={paramId}
        requiredParamIdsToPaths={nestedRenderState.requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isTopLevelWithPad={isTopLevel && idx > 0}
        listKey={listKey}
        hasSectionStyleTheme={hasSectionStyleTheme}
        nestedParentParamIdLookup={nestedRenderState.nestedParentParamIdLookup}
        visibleParamIdLookup={nestedRenderState.visibleParamIdLookup}
        showResizeHandle={showResizeHandle}
      />
    );
  });
}

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
  showResizeHandle = true,
}: ParamDndListProps) {
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const { canEditStructure } = useShareCapabilities();
  const allowTree = isSelectingParams && canEditStructure;
  const {
    duplicateIndex,
    nestedParentParamIdLookup,
    paramFilterActive,
    tree,
    visibleParamIdLookup,
  } = useProjectState(
    (state) =>
      getParamDndListRenderModel({
        state,
        sectionId,
        paramIds,
        requiredParamIdsToPaths,
        allowTree,
      }),
    _.isEqual,
  );
  const enabled = allowTree && !paramFilterActive;

  if (!tree) {
    return (
      <ParamDuplicateIndexProvider value={duplicateIndex}>
        <ParamDndListRows
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          nestedParentParamIdLookup={nestedParentParamIdLookup}
          visibleParamIdLookup={visibleParamIdLookup}
          dndParentId=""
          showResizeHandle={showResizeHandle}
        />
      </ParamDuplicateIndexProvider>
    );
  }

  return (
    <ParamDuplicateIndexProvider value={duplicateIndex}>
      <ParamDndProvider
        sectionId={sectionId}
        listKey={listKey}
        tree={tree}
        enabled={enabled}
      >
        <ParamDndListRows
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          nestedParentParamIdLookup={nestedParentParamIdLookup}
          visibleParamIdLookup={visibleParamIdLookup}
          dndParentId={tree.rootId}
          showResizeHandle={showResizeHandle}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}
