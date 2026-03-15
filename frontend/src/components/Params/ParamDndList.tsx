import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { GetParamSwitch } from "./GetParamSwitch";
import { ParamDndProvider } from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";
import { getParamDndListRenderModel } from "./getParamDndListRenderModel";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
};

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
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
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          nestedParentParamIdLookup={nestedParentParamIdLookup}
          visibleParamIdLookup={visibleParamIdLookup}
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
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          dndParentId={tree.rootId}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          nestedParentParamIdLookup={nestedParentParamIdLookup}
          visibleParamIdLookup={visibleParamIdLookup}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}
