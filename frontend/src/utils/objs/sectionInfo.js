import DEFAULT_VALUES from "constants/defaultValues.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getDefaultDisplayMode } from "state/hooks/uiTypes";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createVarName, maybeNewId } from "../idNameCreation";

export function newSectionInfo({
  id,
  name,
  variantId,
  uiTypeId = BASE_UI_TYPE_IDS.SECTION,
  uiTypeColId,
  variantIds = [],
  ...props
}) {
  const _name = name
    ? name
    : createVarName(_.map(useSectionInfos.getState().x, (s) => s.name));
  const _variantId = maybeNewId(variantId);
  const _variantIds = [...variantIds, _variantId];
  const _displayMode = getDefaultDisplayMode(uiTypeId);

  return {
    ..._.cloneDeep(DEFAULT_VALUES.section),
    id: maybeNewId(id),
    name: _name,
    variantId: _variantId,
    uiTypeId,
    variantIds: _variantIds,
    displayMode: _displayMode,
    ...props,
  };
}
