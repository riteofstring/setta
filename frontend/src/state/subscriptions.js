import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { updateKeywordRegex } from "state/actions/keywordRegex";
import { useMisc, useSectionInfos } from "state/definitions";
import { getSectionIdToChildrenToShow } from "./actions/sectionVariants";

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

export function subscribe() {
  useSectionInfos.subscribe(
    singletonSectionsSubscriptionFn,
    (x) => {
      useMisc.setState((state) => {
        state.singletonSections = x;
      });
    },
    { equalityFn: _.isEqual },
  );

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

  // useSectionInfos.subscribe(
  //   (x) => _.mapValues(x.x, (v) => v.parentId),
  //   (parentIds, oldParentIds) => {
  //     const globalParamSweepSectionId =
  //       useMisc.getState().singletonSections[C.GLOBAL_PARAM_SWEEP];
  //     if (!globalParamSweepSectionId) {
  //       return;
  //     }
  //     const needUpdate = {};
  //     for (const [sectionId, parentId] of Object.entries(parentIds)) {
  //       if (parentId === oldParentIds[sectionId]) {
  //         continue;
  //       }
  //       needUpdate[sectionId] = parentId;
  //     }
  //     if (_.size(needUpdate) === 0) {
  //       return;
  //     }
  //     useSectionInfos.setState((x) => {
  //       for (const variantId of x.x[globalParamSweepSectionId].variantIds) {
  //         const runGroup = x.variants[variantId].runGroup;
  //         for (const [sectionId, parentId] of Object.entries(needUpdate)) {
  //           if (sectionId in runGroup && parentId in runGroup[sectionId]) {
  //             runGroup[sectionId];
  //           }
  //         }
  //       }
  //     });
  //   },
  //   { equalityFn: _.isEqual },
  // );
}
