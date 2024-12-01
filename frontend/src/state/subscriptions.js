import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useKeywordRegex, useSectionInfos } from "state/definitions";
import { getRegexAndColorMap } from "./actions/keywordRegex";
import { getSectionIdToChildrenToShow } from "./actions/sectionVariants";

export function subscribe() {
  useSectionInfos.subscribe(
    singletonSectionsSubscriptionFn,
    (x) => {
      useSectionInfos.setState((state) => {
        state.singletonSections = x;
      });
    },
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    keywordRegexSubscriptionFn,
    (x) => {
      console.log("keywordRegexSubscription triggered");
      useKeywordRegex.setState(getRegexAndColorMap(x));
    },
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getSectionIdToChildrenToShow,
    (x) => {
      console.log("dndchildren subscription!!!!!!!!!!")
      useDndChildren.getState().update(x);
    },
    { equalityFn: _.isEqual },
  );

  useReactFlow.subscribe(
    reactFitViewOnInitSubscriptionFn,
    (newState, prevState) => {
      if (prevState.fitViewOnInit && newState.fitViewOnInit) {
        // set fitViewOnInit to false if it was and is true
        // because that means zoom or x/y position changed
        useReactFlow.setState({ fitViewOnInit: false });
      }
    },
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
  const output = {
    details: {},
    codeInfo: x.codeInfo,
    globalVariableId: x.singletonSections[C.GLOBAL_VARIABLES],
  };

  for (const [id, s] of Object.entries(x.x)) {
    output.details[id] = {
      name: s.name,
      sectionChildren: x.variants[s.variantId].children,
      codeInfoChildren:
        x.codeInfoCols[x.variants[s.variantId].codeInfoColId].children,
      sectionTypeName: x.uiTypes[s.uiTypeId].type,
      selectedItem: x.variants[s.variantId].selectedItem,
      isTopLevel:
        !s.parentId &&
        [
          C.GLOBAL_VARIABLES,
          C.SECTION,
          C.LIST_ROOT,
          C.DICT_ROOT,
          C.DECK,
        ].includes(x.uiTypes[s.uiTypeId].type),
    };
  }

  return output;
}

function reactFitViewOnInitSubscriptionFn(state) {
  return { transform: state.transform, fitViewOnInit: state.fitViewOnInit };
}
