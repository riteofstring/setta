import { isTempParam, type ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
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
  // TODO: make this more efficient
  const filteredIds = useProjectState((x) => {
    let matches = paramIds;
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );

    if (impl.paramFilter) {
      const requiredParamIdsWithNames = Object.keys(
        requiredParamIdsToPaths,
      ).map((id) => ({
        id,
        name: getParamDisplayName(x, sectionId, id),
      }));

      matches = matchSorter(requiredParamIdsWithNames, impl.paramFilter, {
        keys: ["name"],
      });
    }

    const filteredRequired = new Set();
    for (const m of matches) {
      const path = requiredParamIdsToPaths[m.hasOwnProperty("id") ? m.id : m];
      if (!path) {
        continue;
      }
      for (const p of path) {
        filteredRequired.add(p);
      }
    }

    return paramIds.filter((p) => filteredRequired.has(p) || isTempParam(p));
  }, _.isEqual);

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
