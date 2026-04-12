import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration,
} from "../Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import { GetParamSwitch } from "./GetParamSwitch";
import {
  ParamDndProvider,
  useParamDndChildrenForParent,
} from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";

function handleParamDndListRowsRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionParamDndListRowsReactRender",
    actualDuration,
  );
}

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
};

function _ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
}: ParamDndListProps) {
  const duplicateIndex = useProjectState(
    (state) =>
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "presentedSceneSectionParamDndListDuplicateIndexResolve",
        () => buildParamDuplicateIndex(state, sectionId),
      ),
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
    return measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionParamDndListTreeResolve",
      () =>
        buildParamTreeView(state, sectionId, paramIds, requiredParamIdsToPaths),
    );
  }, _.isEqual);

  if (!tree) {
    return (
      <ParamDuplicateIndexProvider value={duplicateIndex}>
        <React.Profiler
          id={`param-dnd-list-rows:${sectionId}:${listKey}`}
          onRender={handleParamDndListRowsRender}
        >
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={paramIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={onResizeStart}
            isTopLevel={isTopLevel}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </React.Profiler>
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
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}

export const ParamDndList = React.memo(_ParamDndList, _.isEqual);

function ParamDndListBody({
  sectionId,
  rootId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  rootId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
}) {
  const renderParamIds = useParamDndChildrenForParent(rootId, paramIds);

  return (
    <React.Profiler
      id={`param-dnd-list-rows:${sectionId}:${listKey}`}
      onRender={handleParamDndListRowsRender}
    >
      <GetParamSwitch
        sectionId={sectionId}
        paramIds={renderParamIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isTopLevel={isTopLevel}
        listKey={listKey}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    </React.Profiler>
  );
}
