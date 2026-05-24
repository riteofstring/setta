import { type ParamListKey } from "forks/dnd-kit/paramDndState";
import { useMemo } from "react";
import { getCurrEffectiveSectionImplWithTypeGuardIfPresent } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { resolveFilteredParamRows } from "./paramListFiltering";
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
  const filteredRows = useMemo(() => {
    const state = useProjectState.getState();
    return resolveFilteredParamRows({
      paramFilter,
      paramIds,
      requiredParamIdsToPaths,
      sectionId,
      state,
    });
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

  return filteredRows.paramIds.map((paramId, idx) => (
    <ParamSwitch
      key={paramId}
      sectionId={sectionId}
      paramInfoId={paramId}
      requiredParamIdsToPaths={filteredRows.requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ));
}
