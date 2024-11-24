import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { updateKeywordRegex } from "state/actions/keywordRegex";
import { useMisc, useSectionInfos, useUITypes } from "state/definitions";
import { getSectionIdToChildrenToShow } from "./actions/sectionVariants";

function singletonSectionsSubscriptionFn(state) {
  const uiTypeState = useUITypes.getState();
  const output = { [C.GLOBAL_VARIABLES]: null, [C.GLOBAL_PARAM_SWEEP]: null };
  for (const s of Object.values(state.x)) {
    const uiType = uiTypeState.x[s.uiTypeId]?.type;
    if (output[C.GLOBAL_VARIABLES] && output[C.GLOBAL_PARAM_SWEEP]) {
      break;
    }
    if (!output[C.GLOBAL_VARIABLES] && uiType === C.GLOBAL_VARIABLES) {
      output[C.GLOBAL_VARIABLES] = s.id;
    }
    if (!output[C.GLOBAL_PARAM_SWEEP] && uiType === C.GLOBAL_PARAM_SWEEP) {
      output[C.GLOBAL_PARAM_SWEEP] = s.id;
    }
  }
  return output;
}

export function subscribe() {
  useSectionInfos.subscribe(singletonSectionsSubscriptionFn, (x) => {
    useMisc.setState((state) => {
      state.singletonSections.globalVariables = x[C.GLOBAL_VARIABLES];
      state.singletonSections.globalParamSweep = x[C.GLOBAL_PARAM_SWEEP];
    });
  });

  useSectionInfos.subscribe(
    (state) => _.mapValues(state.x, (v) => v.name),
    (x) => updateKeywordRegex(x),
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getSectionIdToChildrenToShow,
    (x) => useDndChildren.getState().update(x),
    { equalityFn: _.isEqual },
  );
}
