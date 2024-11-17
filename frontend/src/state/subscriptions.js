import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { updateKeywordRegex } from "state/actions/keywordRegex";
import { useMisc, useSectionInfos, useUITypes } from "state/definitions";

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
      useMisc.setState((state) => {
        state.singletonSections.globalVariables = x;
      });
    },
  );

  useSectionInfos.subscribe(
    getSingletonSubscriptionFn(C.GLOBAL_PARAM_SWEEP),
    (x) => {
      useMisc.setState((state) => {
        state.singletonSections.globalParamSweep = x;
      });
    },
  );

  useSectionInfos.subscribe(
    (state) => _.mapValues(state.x, (v) => v.name),
    (x) => updateKeywordRegex(x),
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    (state) => Object.keys(state.x),
    (x) => useDndChildren.getState().updateKeys(x),
    { equalityFn: _.isEqual },
  );
}
