import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import { matchSorter } from "match-sorter";
import { useMemo } from "react";
import {
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel = false,
  listKey,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
}) {
  const paramsImpl = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ),
  );
  if (!paramsImpl) {
    return null;
  }
  const {
    codeObjs,
    codeObjVariants,
    codeObjImpls,
    sectionVariants,
    sectionImpls,
    sections,
    showParamDisplayNames,
    projectSectionVariantMap,
  } = useProjectState(
    (state) => ({
      codeObjs: state.codeObjs,
      codeObjVariants: state.codeObjVariants,
      codeObjImpls: state.codeObjImpls,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sections: state.sections,
      showParamDisplayNames: state.projectConfig.showParamDisplayNames,
      projectSectionVariantMap: state.projectConfig.sectionVariantMap,
    }),
    shallow,
  );
  const paramFilter = paramsImpl?.paramFilter ?? null;
  const filteredIds = useMemo(() => {
    const state = useProjectState.getState();
    let matches = paramIds;

    if (paramFilter) {
      const requiredParamIdsWithNames = Object.keys(
        requiredParamIdsToPaths,
      ).map((id) => ({
        id,
        name: getParamDisplayNameIfPresent(state, sectionId, id) ?? id,
      }));

      matches = matchSorter(requiredParamIdsWithNames, paramFilter, {
        keys: ["name"],
      });
    }

    const filteredRequired = new Set<string>();
    for (const match of matches) {
      const path =
        requiredParamIdsToPaths[
          Object.prototype.hasOwnProperty.call(match, "id") ? match.id : match
        ];
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
  }, [
    codeObjImpls,
    codeObjVariants,
    codeObjs,
    paramFilter,
    paramIds,
    projectSectionVariantMap,
    requiredParamIdsToPaths,
    sectionId,
    sectionImpls,
    sections,
    sectionVariants,
    showParamDisplayNames,
  ]);

  if (!paramsImpl) {
    return null;
  }

  return filteredIds.map((paramId, idx) => (
    <ParamSwitch
      key={paramId}
      sectionId={sectionId}
      paramInfoId={paramId}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ));
}
