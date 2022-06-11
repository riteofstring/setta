import { useStoreActions, useStoreState } from "easy-peasy";
import { DECK, SECTION_TYPE_NAMES, uiTypesToPretty } from "utils/constants";

export function usePresetUIType(uiTypeId) {
  const uiType = useStoreState((x) => x.uiTypes.x[uiTypeId]);
  const setConfig = useStoreActions((x) => x.uiTypes.setConfig);
  const _setConfig = (newConfig) => {
    setConfig({ uiTypeId, newStateFn: (x) => ({ ...x, ...newConfig }) });
  };

  return [uiType, _setConfig];
}

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (uiType.name) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function isPresetOrSelected(v, selectedId) {
  return (v.isPreset && v.type !== DECK) || v.id === selectedId;
}

function defaultFilterFn(x, selectedId) {
  return _.pickBy(x, (v) => isPresetOrSelected(v, selectedId));
}

export function onlySectionTypes(x, selectedId) {
  return _.pickBy(
    x,
    (v) =>
      isPresetOrSelected(v, selectedId) && SECTION_TYPE_NAMES.includes(v.type)
  );
}

export function useAvailablePresetUITypes(
  selectedId,
  filterFn = defaultFilterFn
) {
  return useStoreState(
    (x) =>
      _.map(filterFn(x.uiTypes.x, selectedId), (v, k) => ({
        id: k,
        name: createName(v),
      })),
    _.isEqual
  );
}
