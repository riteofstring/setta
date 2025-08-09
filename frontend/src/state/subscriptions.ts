import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useAIStore,
  useArtifacts,
  useMisc,
  useNodeInternals,
  useProjectState,
  ZustandAIStore,
  ZustandProjectState,
  ZustandSingletonSections,
} from "state/definitions";
import {
  route_file_watch_gen_python_code,
  route_file_watch_list,
  route_update_from_frontend_top_level_section_layout,
} from "utils/generatedEndpoints";
import { FileWatchGroupNameEnum, SectionTypeEnum } from "utils/generatedTypes";
import { getNamePathTypeKey } from "./actions/artifacts";
import { maybeRequestDrawAreaUpdate } from "./actions/artifactsDrawArea";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./actions/nodeInternals";
import {
  createTopLevelSectionLayoutDict,
  getDisplayedSectionIdToChildren,
  getEffectiveImpl,
  getEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewingEditingModeVisibility,
} from "./actions/sectionInfos";

export function subscribe() {
  useProjectState.subscribe(
    singletonSectionsSubscriptionFn,
    (x) => {
      useProjectState.setState((state) => {
        state.singletonSections = x;
      });
      route_file_watch_gen_python_code({
        watch: Boolean(x[SectionTypeEnum.GenPythonCode]),
        projectConfigId: useProjectState.getState().projectConfig.id,
      });
    },
    { equalityFn: _.isEqual },
  );

  useProjectState.subscribe(
    getDisplayedSectionIdToChildren,
    (x) => {
      updateDndChildren(x);
    },
    { equalityFn: _.isEqual },
  );

  useProjectState.subscribe(
    jsonFilenameSubscriptionFn,
    (filepaths) =>
      route_file_watch_list({
        filepaths,
        fileWatchGroupName: FileWatchGroupNameEnum.jsonSource,
      }),
    {
      equalityFn: _.isEqual,
    },
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

  useMisc.subscribe(
    nodeInternalsWidthHeightWasNullSubscriptionFn,
    (nodeInternalsWidthHeightWasNull) => {
      if (nodeInternalsWidthHeightWasNull) {
        // When the backend creates sections, the node size on the backend is null.
        // This subscription gets triggered when updating a node dimension (like on first render).
        // Specifically, if the current node dimensions (before the update) are null,
        // then that means backend thinkss the node dimensions aren null. 
        // So this sends the true node dimensions to fix that.
        route_update_from_frontend_top_level_section_layout({
          projectConfigId: useProjectState.getState().projectConfig.id,
          topLevelSections: createTopLevelSectionLayoutDict(
            useProjectState.getState().sections,
            useNodeInternals.getState().x,
          ),
        });
        useMisc.setState({ nodeInternalsWidthHeightWasNull: false });
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

  useAIStore.subscribe(
    apiKeysFilepathSubscriptionFn,
    (filepaths) =>
      route_file_watch_list({
        filepaths,
        fileWatchGroupName: FileWatchGroupNameEnum.apiKeys,
      }),
    {
      equalityFn: _.isEqual,
      fireImmediately: true,
    },
  );
}

function singletonSectionsSubscriptionFn(state: ZustandProjectState) {
  const output: ZustandSingletonSections = {
    [SectionTypeEnum.GlobalVariables]: null,
    [SectionTypeEnum.GenPythonCode]: null,
    temporaryTerminalGroup: null,
  };
  for (const s of Object.values(state.sections)) {
    if (
      output[SectionTypeEnum.GlobalVariables] &&
      output[SectionTypeEnum.GenPythonCode] &&
      output.temporaryTerminalGroup
    ) {
      break;
    }

    const sectionImpl = getEffectiveSectionImpl(state, s.id);

    if (
      !output[SectionTypeEnum.GlobalVariables] &&
      sectionImpl.type === SectionTypeEnum.GlobalVariables
    ) {
      output[SectionTypeEnum.GlobalVariables] = s.id;
    }
    if (
      !output[SectionTypeEnum.GenPythonCode] &&
      sectionImpl.type === SectionTypeEnum.GenPythonCode
    ) {
      output[SectionTypeEnum.GenPythonCode] = s.id;
    }
    // TODO: need better way of knowing if it's the temporaryTerminalGroup
    if (
      !output.temporaryTerminalGroup &&
      sectionImpl.type === SectionTypeEnum.Group &&
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

function jsonFilenameSubscriptionFn(state: ZustandProjectState) {
  const filenameSet: Set<string> = new Set();
  for (const section of Object.values(state.sections)) {
    for (const layeringId of section.implLayerings) {
      const layering = state.sectionImplLayerings[layeringId];
      if (!layering) {
        throw new Error();
      }
      const baseImpl = state.sectionImpls[layering.impl];
      if (!baseImpl) {
        throw new Error();
      }
      const impl = getEffectiveImpl(baseImpl, section, layering);
      if (impl.type === SectionTypeEnum.Dict && impl.isJsonSource) {
        filenameSet.add(layering.name);
      }
    }
  }
  return Array.from(filenameSet);
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
    if (getEffectiveSectionImpl(state, s.id).type === SectionTypeEnum.Code) {
      codeBlockIds.push(s.id);
    }
  }
  return codeBlockIds;
}

function apiKeysFilepathSubscriptionFn(state: ZustandAIStore) {
  return [state.apiKeysFilepath];
}

function nodeInternalsWidthHeightWasNullSubscriptionFn(state) {
  return state.nodeInternalsWidthHeightWasNull;
}
