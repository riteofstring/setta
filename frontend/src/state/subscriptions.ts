import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useDecodedImages,
  useImages,
  useMisc,
  useNodeInternals,
  useProjectState,
  ZustandImages,
  ZustandProjectState,
} from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./actions/nodeInternals";
import {
  debouncedDispatchViewportUpdate,
  getCurrEffectiveSectionImpl,
  getDisplayedSectionIdToChildren,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "./actions/sectionInfos";
import { decodeExistingRawImages } from "./hooks/artifacts";

export function subscribe() {
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
    reactFlowTransformSubscriptionFn,
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

      debouncedDispatchViewportUpdate();
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

  useImages.subscribe(
    imagesToDecodeSubscriptionFn,
    (x) => {
      const requiredDecodedImages =
        useProjectState.getState().requiredDecodedImages;
      const decodedImages = useDecodedImages.getState().x;
      const needToDecode: Array<string> = [];
      for (const [path, img] of Object.entries(x)) {
        if (
          img &&
          requiredDecodedImages.includes(path) &&
          (!decodedImages[path] || decodedImages[path].src !== img.value)
        ) {
          needToDecode.push(path);
        }
      }
      if (needToDecode.length > 0) {
        decodeExistingRawImages(needToDecode);
      }
    },
    {
      equalityFn: _.isEqual,
    },
  );
}

function reactFlowTransformSubscriptionFn(state) {
  return {
    transform: state.transform,
    fitViewOnInit: state.fitViewOnInit,
    fitViewOnInitDone: state.fitViewOnInitDone,
  };
}

function updateNodeDimensionsSubscriptionFn(state) {
  return state.undoOrRedoWasTriggered || state.requestUpdateNodeDimensions;
}

function topLevelSectionVisibilitySubscriptionFn(state: ZustandProjectState) {
  const output: Record<string, boolean> = {};
  for (const id of Object.keys(state.projectConfig.topLevelSections)) {
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      id,
      state,
    );
    output[id] = getSectionShouldRender(visibility, isEditingViewMode);
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

function imagesToDecodeSubscriptionFn(state: ZustandImages) {
  return state.x;
}
