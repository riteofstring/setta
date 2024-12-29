import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useInfoToEVReferrer,
  useKeywordRegex,
  useMisc,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import {
  getInfoToEVReferrers,
  maybeOpenRenameReferencesModal,
} from "./actions/infoToEVReferrer";
import { getRegexAndColorMap } from "./actions/keywordRegex";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./actions/nodeInternals";
import { updateRunGroupsWithNewHierarchy } from "./actions/runGroups/runGroups";
import {
  getCodeInfoCol,
  getDisplayedSectionIdToChildren,
  getSectionIdToParentId,
  getSectionType,
  getSectionVariant,
} from "./actions/sectionInfos";

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
      if (useSectionInfos.getState().shouldRenameReferences) {
        // reset the flag used by subscriptions
        useSectionInfos.setState({ shouldRenameReferences: false });
        maybeOpenRenameReferencesModal();
      }
    },
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getDisplayedSectionIdToChildren,
    (x) => {
      useDndChildren.getState().update(x);
    },
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getSectionIdToParentId,
    (newVal, oldVal) => {
      updateRunGroupsWithNewHierarchy(newVal, oldVal);
    },
    { equalityFn: _.isEqual },
  );

  useReactFlow.subscribe(
    reactFitViewOnInitSubscriptionFn,
    (newState, prevState) => {
      if (
        prevState.fitViewOnInit &&
        prevState.fitViewOnInitDone &&
        newState.fitViewOnInit &&
        newState.fitViewOnInitDone
      ) {
        // set fitViewOnInit to false if it was and is true
        // and fitViewOnInitDone was and is done (need to wait for it to execute the fitView function on project load)
        // because that means zoom or x/y position must have changed
        useReactFlow.setState({ fitViewOnInit: false });
      }
    },
    { equalityFn: _.isEqual },
  );

  useMisc.subscribe(
    updateNodeDimensionsSubscriptionFn,
    (shouldUpdate) => {
      if (shouldUpdate) {
        updateNodeDimensions(
          getNodeUpdateInformation(useNodeInternals.getState().x.keys(), false),
        );
        useMisc.setState({
          undoOrRedoWasTriggered: false,
          requestUpdateNodeDimensions: false,
        });
      }
    },
    { equalityFn: _.isEqual },
  );

  useSectionInfos.subscribe(
    getInfoToEVReferrers,
    (infoToEVReferrers) => {
      useInfoToEVReferrer.setState(infoToEVReferrers);
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
    codeInfo: _.mapValues(x.codeInfo, (c) => ({ id: c.id, name: c.name })),
    globalVariableId: x.singletonSections[C.GLOBAL_VARIABLES],
  };

  let sectionVariant, sectionTypeName;
  for (const [id, s] of Object.entries(x.x)) {
    sectionVariant = getSectionVariant(id, x);
    sectionTypeName = getSectionType(id, x);
    output.details[id] = {
      name: s.name,
      sectionChildren: sectionVariant.children,
      codeInfoChildren: getCodeInfoCol(id, x).children,
      sectionTypeName,
      selectedItem: sectionVariant.selectedItem,
      isTopLevel:
        !s.parentId &&
        [
          C.GLOBAL_VARIABLES,
          C.SECTION,
          C.LIST_ROOT,
          C.DICT_ROOT,
          C.GROUP,
        ].includes(sectionTypeName),
    };
  }

  return output;
}

function reactFitViewOnInitSubscriptionFn(state) {
  return {
    transform: state.transform,
    fitViewOnInit: state.fitViewOnInit,
    fitViewOnInitDone: state.fitViewOnInitDone,
  };
}

function updateNodeDimensionsSubscriptionFn(state) {
  return state.undoOrRedoWasTriggered || state.requestUpdateNodeDimensions;
}
