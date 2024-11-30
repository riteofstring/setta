import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useKeywordRegex, useMisc, useSectionInfos } from "state/definitions";
import { getRegexAndColorMap } from "./actions/keywordRegex";
import { getSectionIdToChildrenToShow } from "./actions/sectionVariants";

export function subscribe() {
  useSectionInfos.subscribe(singletonSectionsSubscriptionFn, (x) => {
    useMisc.setState((state) => {
      state.singletonSections = x;
    });
  });

  useSectionInfos.subscribe(
    keywordRegexSubscriptionFn,
    (x) =>
      useKeywordRegex.setState(
        getRegexAndColorMap(_.mapValues(x.x, (v) => v.name)),
      ),
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getSectionIdToChildrenToShow,
    (x) => useDndChildren.getState().update(x),
    { equalityFn: _.isEqual },
  );
}

function singletonSectionsSubscriptionFn(state) {
  const output = { [C.GLOBAL_VARIABLES]: null, [C.GLOBAL_PARAM_SWEEP]: null };
  for (const s of Object.values(state.x)) {
    const uiType = state.uiTypes[s.uiTypeId]?.type;
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

function keywordRegexSubscriptionFn(x) {
  // const sectionNames = {};
  // const sectionChildren = {};
  // for (const [sectionId, section] of Object.entries(x.x)) {
  //   sectionNames[sectionId] = section.name;
  //   sectionChildren[sectionId] = x.variants[x.x[section.variantId]].children;
  // }
  // return { sectionNames, sectionChildren };
  return x;
}
