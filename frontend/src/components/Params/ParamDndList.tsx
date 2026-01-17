import _ from "lodash";
import React from "react";
import { buildParamTreeView } from "state/actions/params/paramTree";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { isBaseSectionWithParamsImpl, SectionTypeEnum } from "utils/generatedTypes";
import { GetParamSwitch } from "./GetParamSwitch";
import { ParamDndProvider } from "./ParamDndContext";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
};

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
}: ParamDndListProps) {
  const tree = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    if (impl.type === SectionTypeEnum.Callable) {
      if (!impl.callable) {
        return null;
      }
    } else if (impl.type === SectionTypeEnum.Dict) {
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

  if (!tree) {
    return (
      <GetParamSwitch
        sectionId={sectionId}
        paramIds={paramIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isTopLevel={isTopLevel}
      />
    );
  }

  return (
    <ParamDndProvider sectionId={sectionId} tree={tree} enabled={enabled}>
      <GetParamSwitch
        sectionId={sectionId}
        paramIds={paramIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isTopLevel={isTopLevel}
      />
    </ParamDndProvider>
  );
}
