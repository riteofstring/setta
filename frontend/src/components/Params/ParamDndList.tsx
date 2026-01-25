import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React, { useEffect } from "react";
import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { GetParamSwitch } from "./GetParamSwitch";
import {
  ParamDndProvider,
  useParamDndChildrenForParent,
} from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
};

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
}: ParamDndListProps) {
  const duplicateIndex = useProjectState(
    (state) => buildParamDuplicateIndex(state, sectionId),
    _.isEqual,
  );
  const paramFilterActive = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return impl.paramFilter.trim().length > 0;
  });
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const { canEditStructure } = useShareCapabilities();
  const enabled = isSelectingParams && canEditStructure && !paramFilterActive;
  useEffect(() => {
    console.log("[dnd-debug] ParamDndList", {
      sectionId,
      listKey,
      enabled,
      isSelectingParams,
      canEditStructure,
      paramFilterActive,
      paramIdsCount: paramIds.length,
    });
  }, [
    sectionId,
    listKey,
    enabled,
    isSelectingParams,
    canEditStructure,
    paramFilterActive,
    paramIds.length,
  ]);
  const tree = useProjectState((state) => {
    if (!enabled) {
      return null;
    }
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    if (impl.type === SectionTypeEnum.Callable) {
      if (!impl.callable) {
        return null;
      }
    } else if (
      impl.type === SectionTypeEnum.Dict ||
      impl.type === SectionTypeEnum.GlobalVariables
    ) {
      if (!impl.topLevelParamId) {
        return null;
      }
    } else {
      return null;
    }
    return buildParamTreeView(
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    );
  }, _.isEqual);

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
        <ParamDndListBody
          sectionId={sectionId}
          rootId={tree.rootId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}

function ParamDndListBody({
  sectionId,
  rootId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
}: {
  sectionId: string;
  rootId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
}) {
  const renderParamIds = useParamDndChildrenForParent(rootId, paramIds);

  return (
    <GetParamSwitch
      sectionId={sectionId}
      paramIds={renderParamIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevel={isTopLevel}
      listKey={listKey}
    />
  );
}
