import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import { useMemo } from "react";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ParamSwitch } from "./ParamSwitch";
import { resolveParamEditorKindFromCodeObjImpl } from "./paramEditorActivation";
import type { ParamListRenderMode } from "./paramListRenderMode";
import { buildVisibleParamScenePackets } from "./paramSwitchScenePackets";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel = false,
  listKey,
  hasSectionStyleTheme,
  renderMode = "full",
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
  renderMode?: ParamListRenderMode;
}) {
  const paramsImpl = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ),
  );
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
  const scenePackets = useMemo(() => {
    const state = useProjectState.getState();
    return buildVisibleParamScenePackets({
      getParamEditorKind: (paramId: string) =>
        resolveParamEditorKindFromCodeObjImpl(
          getCurrEffectiveCodeObjImpl(state, sectionId, paramId),
        ),
      paramIds,
      requiredParamIdsToPaths,
      paramFilter: paramsImpl.paramFilter,
      getParamDisplayName: (paramId: string) =>
        getParamDisplayName(state, sectionId, paramId),
      getParamValuePreview: () => null,
    });
  }, [
    codeObjImpls,
    codeObjVariants,
    codeObjs,
    paramIds,
    paramsImpl.paramFilter,
    projectSectionVariantMap,
    requiredParamIdsToPaths,
    sectionId,
    sectionImpls,
    sections,
    sectionVariants,
    showParamDisplayNames,
  ]);

  return scenePackets.map((packet, idx) => (
    <ParamSwitch
      key={packet.id}
      sectionId={sectionId}
      paramInfoId={packet.id}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
      renderMode={renderMode}
      scenePacket={packet}
    />
  ));
}
