import _ from "lodash";
import { type ParamListKey } from "forks/dnd-kit/paramDndState";
import { useProjectState } from "state/definitions";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamSwitch } from "./ParamSwitch";
import { getFilteredRenderableParamIds } from "./getFilteredRenderableParamIds";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel = false,
  isNestedChildInTree = false,
  dndParentId,
  listKey,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  isNestedChildInTree?: boolean;
  dndParentId?: string;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
}) {
  const renderParamIds = useParamDndChildrenForParent(dndParentId ?? "", paramIds);
  const filteredIds = useProjectState(
    (state) =>
      getFilteredRenderableParamIds({
        state,
        sectionId,
        renderParamIds,
        requiredParamIdsToPaths,
      }),
    _.isEqual,
  );

  return filteredIds.map((paramId, idx) => (
    <ParamSwitch
      key={paramId}
      sectionId={sectionId}
      paramInfoId={paramId}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
      isNestedChildInTree={isNestedChildInTree}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  ));
}
