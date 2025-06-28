import _ from "lodash";
import { matchSorter } from "match-sorter";
import { getEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel = false,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
}) {
  // TODO: make this more efficient
  const filteredIds = useProjectState((x) => {
    let matches = paramIds;
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (!isBaseSectionWithParamsImpl(impl)) {
      throw new Error();
    }

    if (impl.paramFilter) {
      const requiredParamIdsWithNames = Object.keys(
        requiredParamIdsToPaths,
      ).map((id) => ({
        id,
        name: x.codeObjs[id].name,
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

    return paramIds.filter((p) => filteredRequired.has(p));
  }, _.isEqual);

  return filteredIds.map((e, idx) => (
    <ParamSwitch
      key={e}
      sectionId={sectionId}
      paramInfoId={e}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={isTopLevel && idx > 0}
    />
  ));
}
