import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
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

function matchesOriginInfoId(v, originInfoId) {
  return originInfoId && v.originInfoId === originInfoId;
}

export function isPreset(v) {
  return v.isPreset && v.type !== DECK;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

export function onlySectionTypes(v) {
  return isPreset(v) && isSectionType(v);
}

function filterUITypes(uiTypes, filterFn, originInfoId) {
  const matchesOrigin = _.filter(uiTypes, (v) =>
    matchesOriginInfoId(v, originInfoId)
  );
  const typesOfMatchesOrigin = _.map(matchesOrigin, (v) => v.type);
  const presets = _.filter(uiTypes, (v) => filterFn(v));

  // Remove base presets that have a corresponding uiType with a matching originInfoId
  const presetsFiltered = _.filter(
    presets,
    (v) =>
      !v.isBasePreset ||
      (v.isBasePreset && !typesOfMatchesOrigin.includes(v.type))
  );

  return [...presetsFiltered, ...matchesOrigin].map((v) => ({
    id: v.id,
    name: createName(v),
  }));
}

export function useAvailablePresetUITypes(originInfoId, filterFn = isPreset) {
  return useStoreState(
    (x) => filterUITypes(x.uiTypes.x, filterFn, originInfoId),
    _.isEqual
  );
}
