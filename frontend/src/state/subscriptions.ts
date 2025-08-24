import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useArtifacts,
  useMisc,
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { getNamePathTypeKey } from "./actions/artifacts";
import { maybeRequestDrawAreaUpdate } from "./actions/artifactsDrawArea";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./actions/nodeInternals";
import {
  debounced_route_set_active_ids,
  getCurrEffectiveSectionImpl,
  getDisplayedSectionIdToChildren,
  getSectionShouldRender,
  getSectionViewingEditingModeVisibility,
} from "./actions/sectionInfos";

export function subscribe() {
  useProjectState.subscribe(
    activeIdsSubscriptionFn,
    () => {
      debounced_route_set_active_ids();
    },
    {
      equalityFn: _.isEqual,
    },
  );

  useProjectState.subscribe(
    getDisplayedSectionIdToChildren,
    (x) => {
      updateDndChildren(x);
    },
    { equalityFn: _.isEqual },
  );

  // useProjectState.subscribe(
  //   topLevelSectionVisibilitySubscriptionFn,
  //   (newVal) => {
  //     updateNodeVisibility(newVal);
  //   },
  //   { equalityFn: _.isEqual },
  // );

  useProjectState.subscribe(entryCodeBlockSubscriptionFn, (codeBlockIds) => {
    useProjectState.setState((state) => {
      const configState = state.projectConfig;
      if (codeBlockIds.length === 0) {
        configState.entryCodeBlockId = null;
      } else if (
        configState.entryCodeBlockId &&
        !codeBlockIds.includes(configState.entryCodeBlockId)
      ) {
        configState.entryCodeBlockId = codeBlockIds[0] ?? null;
      }
    });
  });

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

      // used by forked xterm to make text appear correctly
      window.reactFlowZoom = newState.transform[2];
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
          requestUpdateNodeDimensions: false,
        });
      }
    },
    { equalityFn: _.isEqual },
  );

  useMisc.subscribe(
    (x) => x.undoOrRedoWasTriggered,
    (undoOrRedoWasTriggered) => {
      if (undoOrRedoWasTriggered) {
        useMisc.setState((state) => ({
          updateAllDrawAreas: state.updateAllDrawAreas + 1,
          undoOrRedoWasTriggered: false,
        }));
      }
    },
  );

  useArtifacts.subscribe(
    artifactNamePathTypeToIdSubscriptionFn,
    (artifacts) => {
      useArtifacts.setState(() => {
        const namePathTypeToId = {};
        for (const [id, a] of Object.entries(artifacts)) {
          namePathTypeToId[getNamePathTypeKey(a)] = id;
        }
        return { namePathTypeToId };
      });
    },
    { equalityFn: _.isEqual },
  );

  useArtifacts.subscribe(
    artifactWhoModifiedSubscriptionFn,
    maybeRequestDrawAreaUpdate,
    {
      equalityFn: _.isEqual,
    },
  );
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

function artifactNamePathTypeToIdSubscriptionFn(state) {
  const output = {};
  for (const [id, a] of Object.entries(state.x)) {
    output[id] = { name: a.name, path: a.path, type: a.type };
  }
  return output;
}

function artifactWhoModifiedSubscriptionFn(state) {
  const output = {};
  for (const [id, a] of Object.entries(state.x)) {
    if (a.modifiedByInfo) {
      output[id] = a.modifiedByInfo;
    }
  }
  return output;
}

function topLevelSectionVisibilitySubscriptionFn(state: ZustandProjectState) {
  const output: Record<string, boolean> = {};
  for (const id of Object.keys(state.projectConfig.topLevelSections)) {
    const { visibility, viewingEditingMode } =
      getSectionViewingEditingModeVisibility(id, state);
    output[id] = getSectionShouldRender(visibility, viewingEditingMode);
  }
  return output;
}

function entryCodeBlockSubscriptionFn(state: ZustandProjectState) {
  const codeBlockIds: Array<string> = [];
  for (const s of Object.values(state.sections)) {
    if (
      getCurrEffectiveSectionImpl(state, s.id).type === SectionTypeEnum.Code
    ) {
      codeBlockIds.push(s.id);
    }
  }
  return codeBlockIds;
}

function activeIdsSubscriptionFn(state: ZustandProjectState) {
  return state.projectConfig.activeIds;
}
