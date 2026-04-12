import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import React, { useMemo } from "react";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ParamSwitch } from "./ParamSwitch";

type GetParamSwitchProps = {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
};

const EMPTY_REQUIRED_PARAM_IDS_TO_PATHS: Record<string, Array<string>> = {};

function buildRequiredParamIdsToPathsByAncestor(
  requiredParamIdsToPaths: Record<string, Array<string>>,
): Map<string, Record<string, Array<string>>> {
  const requiredParamIdsToPathsByAncestor = new Map<
    string,
    Record<string, Array<string>>
  >();

  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    for (const ancestorId of path) {
      let ancestorPaths = requiredParamIdsToPathsByAncestor.get(ancestorId);
      if (!ancestorPaths) {
        ancestorPaths = {};
        requiredParamIdsToPathsByAncestor.set(ancestorId, ancestorPaths);
      }
      ancestorPaths[paramId] = path;
    }
  }

  return requiredParamIdsToPathsByAncestor;
}

function _GetParamSwitch(props: GetParamSwitchProps) {
  const {
    sectionId,
    paramIds,
    requiredParamIdsToPaths,
    onResizeStart,
    isTopLevel = false,
    listKey,
    hasSectionStyleTheme,
  } = props;
  const requiredParamIdsToPathsByAncestor = useMemo(
    () => buildRequiredParamIdsToPathsByAncestor(requiredParamIdsToPaths),
    [requiredParamIdsToPaths],
  );
  const paramFilter = useProjectState(
    (state) =>
      getCurrEffectiveSectionImplWithTypeGuard(
        state,
        sectionId,
        isBaseSectionWithParamsImpl,
      ).paramFilter,
  );
  const trimmedParamFilter = paramFilter.trim();

  if (trimmedParamFilter.length === 0) {
    return (
      <ParamSwitchRows
        sectionId={sectionId}
        paramIds={paramIds}
        requiredParamIdsToPathsByAncestor={requiredParamIdsToPathsByAncestor}
        onResizeStart={onResizeStart}
        isTopLevel={isTopLevel}
        listKey={listKey}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    );
  }

  return (
    <FilteredParamSwitchRows
      sectionId={sectionId}
      paramIds={paramIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      requiredParamIdsToPathsByAncestor={requiredParamIdsToPathsByAncestor}
      onResizeStart={onResizeStart}
      isTopLevel={isTopLevel}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
      trimmedParamFilter={trimmedParamFilter}
    />
  );
}

export const GetParamSwitch = React.memo(_GetParamSwitch, _.isEqual);

function ParamSwitchRows({
  sectionId,
  paramIds,
  requiredParamIdsToPathsByAncestor,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPathsByAncestor: ReadonlyMap<
    string,
    Record<string, Array<string>>
  >;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
}) {
  return paramIds.map((paramId, idx) => (
    <ParamSwitch
      key={paramId}
      sectionId={sectionId}
      paramInfoId={paramId}
      requiredParamIdsToPaths={
        requiredParamIdsToPathsByAncestor.get(paramId) ??
        EMPTY_REQUIRED_PARAM_IDS_TO_PATHS
      }
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ));
}

function FilteredParamSwitchRows({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  requiredParamIdsToPathsByAncestor,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
  trimmedParamFilter,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  requiredParamIdsToPathsByAncestor: ReadonlyMap<
    string,
    Record<string, Array<string>>
  >;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
  trimmedParamFilter: string;
}) {
  const filteredIds = useProjectState((state) => {
    const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
      (id) => ({
        id,
        name: getParamDisplayName(state, sectionId, id),
      }),
    );
    const matches = matchSorter(requiredParamIdsWithNames, trimmedParamFilter, {
      keys: ["name"],
    });

    const filteredRequired = new Set<string>();
    for (const match of matches) {
      const path = requiredParamIdsToPaths[match.id];
      if (!path) {
        continue;
      }
      for (const pathPart of path) {
        filteredRequired.add(pathPart);
      }
    }

    return paramIds.filter(
      (paramId) => filteredRequired.has(paramId) || isTempParam(paramId),
    );
  }, shallow);

  return (
    <ParamSwitchRows
      sectionId={sectionId}
      paramIds={filteredIds}
      requiredParamIdsToPathsByAncestor={requiredParamIdsToPathsByAncestor}
      onResizeStart={onResizeStart}
      isTopLevel={isTopLevel}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
}
