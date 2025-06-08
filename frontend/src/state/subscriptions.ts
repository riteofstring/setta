import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  dbFileWatchApiKeys,
  dbFileWatchGenPythonCode,
  dbFileWatchJsonSource,
} from "requests/jsonSource";
import {
  useAIStore,
  useArtifacts,
  useMisc,
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { UITypeNameEnum } from "utils/generatedTypes";
import { getNamePathTypeKey } from "./actions/artifacts";
import { maybeRequestDrawAreaUpdate } from "./actions/artifactsDrawArea";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
  updateNodeVisibility,
} from "./actions/nodeInternals";
import { updateBackendProjectState } from "./actions/project/generateCode";
import {
  getDisplayedSectionIdToChildren,
  getSectionShouldRender,
  getSectionType,
  getSectionViewingEditingModeVisibility,
} from "./actions/sectionInfos";

export function subscribe() {
  useProjectState.subscribe(
    singletonSectionsSubscriptionFn,
    (x) => {
      useProjectState.setState((state) => {
        state.singletonSections = x;
      });
      dbFileWatchGenPythonCode({
        watch: Boolean(x[UITypeNameEnum.GEN_PYTHON_CODE]),
        projectConfigId: useProjectState.getState().projectConfig.id,
      });
    },
    { equalityFn: _.isEqual },
  );

  useProjectState.subscribe(
    getDisplayedSectionIdToChildren,
    (x) => {
      useDndChildren.getState().update(x);
    },
    { equalityFn: _.isEqual },
  );

  useProjectState.subscribe(jsonFilenameSubscriptionFn, dbFileWatchJsonSource, {
    equalityFn: _.isEqual,
  });

  useProjectState.subscribe(
    topLevelSectionVisibilitySubscriptionFn,
    (newVal) => {
      updateNodeVisibility(newVal);
    },
    { equalityFn: _.isEqual },
  );

  useProjectState.subscribe(entryCodeBlockSubscriptionFn, (codeBlockIds) => {
    useProjectState.setState((state) => {
      const configState = state.projectConfig;
      if (codeBlockIds.length === 0) {
        configState.entryCodeBlockId = null;
      } else if (
        !configState.entryCodeBlockId ||
        !codeBlockIds.includes(configState.entryCodeBlockId)
      ) {
        configState.entryCodeBlockId = codeBlockIds[0];
      }
    });
  });

  useProjectState.subscribe(updateBackendSubscriptionFn, () => {
    updateBackendProjectState();
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

  useAIStore.subscribe(apiKeysFilepathSubscriptionFn, dbFileWatchApiKeys, {
    equalityFn: _.isEqual,
    fireImmediately: true,
  });
}

function singletonSectionsSubscriptionFn(state) {
  const output = {
    [UITypeNameEnum.GLOBAL_VARIABLES]: null,
    [UITypeNameEnum.GEN_PYTHON_CODE]: null,
  };
  for (const s of Object.values(state.sections)) {
    const uiType = state.uiTypes[s.uiTypeId]?.type;
    if (
      output[UITypeNameEnum.GLOBAL_VARIABLES] &&
      output[UITypeNameEnum.GEN_PYTHON_CODE] &&
      output.temporaryTerminalGroup
    ) {
      break;
    }
    if (
      !output[UITypeNameEnum.GLOBAL_VARIABLES] &&
      uiType === UITypeNameEnum.GLOBAL_VARIABLES
    ) {
      output[UITypeNameEnum.GLOBAL_VARIABLES] = s.id;
    }
    if (
      !output[UITypeNameEnum.GEN_PYTHON_CODE] &&
      uiType === UITypeNameEnum.GEN_PYTHON_CODE
    ) {
      output[UITypeNameEnum.GEN_PYTHON_CODE] = s.id;
    }
    // TODO: need better way of knowing if it's the temporaryTerminalGroup
    if (
      !output.temporaryTerminalGroup &&
      uiType === UITypeNameEnum.GROUP &&
      s.isTemporary
    ) {
      output.temporaryTerminalGroup = s.id;
    }
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

function jsonFilenameSubscriptionFn(state) {
  const filenameSet = new Set();
  for (const v of Object.values(state.variants)) {
    if (v.isJsonSource) {
      filenameSet.add(v.name);
    }
  }
  return Array.from(filenameSet);
}

function topLevelSectionVisibilitySubscriptionFn(state) {
  const output = {};
  for (const [id, section] of Object.entries(state.sections)) {
    if (!section.parentId) {
      const { visibility, viewingEditingMode } =
        getSectionViewingEditingModeVisibility(id, state);

      output[id] = getSectionShouldRender(visibility, viewingEditingMode);
    }
  }
  return output;
}

function entryCodeBlockSubscriptionFn(state: ZustandProjectState) {
  const codeBlockIds: Array<string> = [];
  for (const s of Object.values(state.sections)) {
    if (getSectionType(s.id) === UITypeNameEnum.CODE) {
      codeBlockIds.push(s.id);
    }
  }
  return codeBlockIds;
}

function apiKeysFilepathSubscriptionFn(state) {
  return [state.apiKeysFilepath];
}

function updateBackendSubscriptionFn(state) {
  return state.version;
}
