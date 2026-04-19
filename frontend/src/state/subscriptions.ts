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
  areViewportTransformsEqual,
  dispatchViewportUpdateWhileInteracting,
  dispatchViewportUpdateImmediately,
  getCurrEffectiveSectionImpl,
  getDisplayedSectionIdToChildren,
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
      const autoFitTransition =
        newState.fitViewOnInitDone &&
        (newState.fitViewOnInit || prevState.fitViewOnInit);
      if (autoFitTransition) {
        if (newState.fitViewOnInit) {
          useReactFlow.setState({ fitViewOnInit: false });
        } else {
          // Auto-fit chooses an authoritative camera for the current
          // document, so persist it immediately instead of waiting on the
          // gesture debounce.
          dispatchViewportUpdateImmediately();
        }
      } else {
        if (newState.viewportInteractionActive) {
          dispatchViewportUpdateWhileInteracting();
        } else if (
          prevState.viewportInteractionActive ||
          !areViewportTransformsEqual(newState.transform, prevState.transform)
        ) {
          debouncedDispatchViewportUpdate();
        }
      }

      // used by forked xterm to make text appear correctly
      window.reactFlowZoom = newState.transform[2];
    },
    { equalityFn: areReactFlowTransformSubscriptionStatesEqual },
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
        if (!img || !requiredDecodedImages.includes(path)) {
          continue;
        }
        const decoded = decodedImages[path];
        if (!decoded || decoded.dataset.contentId !== img.value.contentId) {
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
    viewportInteractionActive: state.viewportInteractionActive,
  };
}

function areReactFlowTransformSubscriptionStatesEqual(
  left: ReturnType<typeof reactFlowTransformSubscriptionFn>,
  right: ReturnType<typeof reactFlowTransformSubscriptionFn>,
) {
  return (
    left.fitViewOnInit === right.fitViewOnInit &&
    left.fitViewOnInitDone === right.fitViewOnInitDone &&
    left.viewportInteractionActive === right.viewportInteractionActive &&
    areViewportTransformsEqual(left.transform, right.transform)
  );
}

function updateNodeDimensionsSubscriptionFn(state) {
  return state.undoOrRedoWasTriggered || state.requestUpdateNodeDimensions;
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
