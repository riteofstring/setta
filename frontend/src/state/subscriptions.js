import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { updateKeywordRegex } from "state/actions/keywordRegex";
import {
  useSectionInfos,
  useSectionVariants,
  useUITypes,
} from "state/definitions";
import { SINGLETON_SECTIONS } from "utils/constants";
import { getSectionIdToChildren } from "./actions/sectionVariants";

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

export function subscribe() {
  useSectionInfos.subscribe(
    getSingletonSubscriptionFn(C.GLOBAL_VARIABLES),
    (x) => {
      SINGLETON_SECTIONS.globalVariables = x;
    },
  );

  useSectionInfos.subscribe(
    getSingletonSubscriptionFn(C.GLOBAL_PARAM_SWEEP),
    (x) => {
      SINGLETON_SECTIONS.globalParamSweep = x;
    },
  );

  useSectionInfos.subscribe(
    (state) => _.mapValues(state.x, (v) => v.name),
    (x) => updateKeywordRegex(x),
    { equalityFn: _.isEqual },
  );

  useSectionVariants.subscribe(
    (state) => {
      return getSectionIdToChildren(state.x);
    },
    (x) => {
      useDndChildren.getState().update(x);
    },
    { equalityFn: _.isEqual },
  );
}
