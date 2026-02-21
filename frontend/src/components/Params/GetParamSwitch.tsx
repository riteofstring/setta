import React from "react";
import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import { filterParamIdsForRender } from "./getParamSwitchUtils";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel = false,
  listKey,
  filteredRequiredParamIds,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  filteredRequiredParamIds: ReadonlySet<string> | null;
  hasSectionStyleTheme: boolean;
}) {
  const filteredIds = React.useMemo(
    () => filterParamIdsForRender(paramIds, filteredRequiredParamIds),
    [filteredRequiredParamIds, paramIds],
  );

  return filteredIds.map((paramId, idx) => (
    <ParamSwitch
      key={paramId}
      sectionId={sectionId}
      paramInfoId={paramId}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      listKey={listKey}
      filteredRequiredParamIds={filteredRequiredParamIds}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ));
}
