import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import {
  updateGlobalVariablesRegex,
  updateKeywordRegex,
} from "state/actions/keywordRegex";
import {
  useSectionConfigs,
  useSectionInfos,
  useSectionVariants,
  useUITypes,
} from "state/definitions";
import { SINGLETON_SECTIONS } from "utils/constants";

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
      updateGlobalVariablesRegex(x);
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
    (state) => _.mapValues(state.x, (v) => v.name),
    (x) => updateKeywordRegex(x),
    { equalityFn: _.isEqual },
  );

  useSectionVariants.subscribe(
    (state) => {
      const output = {};
      const sConfigState = useSectionConfigs.getState().x;
      for (const [dbSource, variants] of Object.entries(state.x)) {
        for (const [variantId, variantInfo] of Object.entries(variants)) {
          const sConfig = _.find(
            sConfigState,
            (obj) => obj.variantId === variantId,
          );
          if (sConfig) {
            output[sConfig.id] = variantInfo.children;
          }
        }
      }
      return _.mapValues(state.x, (v) => v.children);
    },
    (x) => useDndChildren.getState().update(x),
  );
}
