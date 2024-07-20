import C from "constants/constants.json";
import _ from "lodash";
import { useUITypes } from "state/definitions/uiTypes";
import { SINGLETON_SECTIONS } from "utils/constants";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { useKeywordRegex } from "../definitions/keywordRegex";
import { useSectionInfos } from "../definitions/sectionInfos";

function getSingletonSubscriptionFn(type) {
  return (state) => {
    for (const s of Object.values(state.x)) {
      if (useUITypes.getState().x[s.uiTypeId]?.type === type) {
        return s.id;
      }
    }
    return null;
  };
}

useSectionInfos.subscribe(
  getSingletonSubscriptionFn(C.GLOBAL_VARIABLES),
  (x) => {
    SINGLETON_SECTIONS.globalVariables = x;
    useKeywordRegex.getState().updateGlobalVariables(x);
  },
);

useSectionInfos.subscribe(
  getSingletonSubscriptionFn(C.GLOBAL_PARAM_SWEEP),
  (x) => {
    SINGLETON_SECTIONS.globalParamSweep = x;
  },
);

useSectionInfos.subscribe(getSingletonSubscriptionFn(C.VAR_CONTROL), (x) => {
  SINGLETON_SECTIONS.varControl = x;
});

useSectionInfos.subscribe(
  (state) => _.mapValues(state.x, (v) => v.children),
  (x) => useDndChildren.getState().reset(x),
);

useSectionInfos.subscribe(
  (state) => _.mapValues(state.x, (v) => v.name),
  (x) => useKeywordRegex.getState().update(x),
  { equalityFn: _.isEqual },
);
