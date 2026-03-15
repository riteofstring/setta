import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamSwitch } from "./ParamSwitch";
import {
  type NestedParentParamIdLookup,
  type RenderableParamIdLookup,
} from "./getFilteredRenderableParamIds";

const EMPTY_REQUIRED_PARAM_IDS_TO_PATHS: Record<string, Array<string>> = {};

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
  nestedParentParamIdLookup,
  visibleParamIdLookup,
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
  nestedParentParamIdLookup: NestedParentParamIdLookup;
  visibleParamIdLookup: RenderableParamIdLookup | null;
}) {
  const renderParamIds = useParamDndChildrenForParent(
    dndParentId ?? "",
    paramIds,
  );
  const filteredIds = visibleParamIdLookup
    ? renderParamIds.filter(
        (paramId) => visibleParamIdLookup[paramId] || isTempParam(paramId),
      )
    : renderParamIds;

  return filteredIds.map((paramId, idx) => {
    const isNestedParent = nestedParentParamIdLookup[paramId] === true;
    return (
      <ParamSwitch
        key={paramId}
        sectionId={sectionId}
        paramInfoId={paramId}
        requiredParamIdsToPaths={
          isNestedParent
            ? requiredParamIdsToPaths
            : EMPTY_REQUIRED_PARAM_IDS_TO_PATHS
        }
        onResizeStart={onResizeStart}
        isTopLevelWithPad={isTopLevel && idx > 0}
        isNestedChildInTree={isNestedChildInTree}
        listKey={listKey}
        hasSectionStyleTheme={hasSectionStyleTheme}
        nestedParentParamIdLookup={
          isNestedParent ? nestedParentParamIdLookup : null
        }
        visibleParamIdLookup={isNestedParent ? visibleParamIdLookup : null}
      />
    );
  });
}
