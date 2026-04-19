import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import type { ZustandProjectState } from "state/definitions";
import { C } from "utils/c";
import {
  isBaseSectionWithParamsImpl,
  type BaseSectionWithParamsImpl,
} from "utils/generatedTypes";

type FilteredParamList = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

type ShownParamsState = ReturnType<typeof getCurrShownParamIds>;

export type EdgePortView = {
  id: string;
  label: string;
};

export type EdgeStripState = {
  inputPorts: Array<EdgePortView>;
  outputPorts: Array<EdgePortView>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  selectedParams: Array<string>;
  styleColor: string | null;
};

export type PinnedParamsState = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  styleColor: string | null;
};

export type UnpinnedParamsState = {
  hideUnpinnedParams: boolean;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
  hasPinnedParams: boolean;
  positionAndSizeLocked: boolean;
  styleColor: string | null;
};

type PinnedParamsSelectorDeps = {
  sectionImpl: BaseSectionWithParamsImpl;
  pinnedShown: ShownParamsState;
};

type UnpinnedParamsSelectorDeps = {
  sectionImpl: BaseSectionWithParamsImpl;
  pinnedShown: ShownParamsState;
  unpinnedShown: ShownParamsState;
};

type EdgeStripSelectorDeps = {
  sectionImpl: BaseSectionWithParamsImpl;
  pinnedShown: ShownParamsState;
  unpinnedShown: ShownParamsState;
  codeObjImpls: ZustandProjectState["codeObjImpls"];
  codeObjs: ZustandProjectState["codeObjs"];
  codeObjVariants: ZustandProjectState["codeObjVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sections: ZustandProjectState["sections"];
  showParamDisplayNames: boolean;
};

function filterEdgeInputs(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<string>,
  edgeInputParams: Array<string>,
): FilteredParamList {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }
  const filteredTopLevel = topLevelParamIds.filter(
    (paramId) => !edgeInputSet.has(paramId),
  );
  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: filteredTopLevel,
  };
}

function filterShownParamIds(
  shown: ShownParamsState,
  edgeInputParams: Array<string>,
): FilteredParamList {
  return filterEdgeInputs(
    shown.requiredParamIdsToPaths,
    shown.topLevelParamIds,
    edgeInputParams,
  );
}

function getSectionImpl(
  state: ZustandProjectState,
  sectionId: string,
): BaseSectionWithParamsImpl {
  return getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
}

function getShownParamsState(
  state: ZustandProjectState,
  sectionId: string,
  isPinned: boolean,
): ShownParamsState {
  return getCurrShownParamIds(state, sectionId, isPinned, true);
}

function getPinnedParamsSelectorDeps(
  state: ZustandProjectState,
  sectionId: string,
): PinnedParamsSelectorDeps {
  return {
    sectionImpl: getSectionImpl(state, sectionId),
    pinnedShown: getShownParamsState(state, sectionId, true),
  };
}

function getUnpinnedParamsSelectorDeps(
  state: ZustandProjectState,
  sectionId: string,
): UnpinnedParamsSelectorDeps {
  return {
    sectionImpl: getSectionImpl(state, sectionId),
    pinnedShown: getShownParamsState(state, sectionId, true),
    unpinnedShown: getShownParamsState(state, sectionId, false),
  };
}

function getEdgeStripSelectorDeps(
  state: ZustandProjectState,
  sectionId: string,
): EdgeStripSelectorDeps {
  return {
    sectionImpl: getSectionImpl(state, sectionId),
    pinnedShown: getShownParamsState(state, sectionId, true),
    unpinnedShown: getShownParamsState(state, sectionId, false),
    codeObjImpls: state.codeObjImpls,
    codeObjs: state.codeObjs,
    codeObjVariants: state.codeObjVariants,
    sectionImpls: state.sectionImpls,
    sectionVariantMap: state.projectConfig.sectionVariantMap,
    sectionVariants: state.sectionVariants,
    sections: state.sections,
    showParamDisplayNames: state.projectConfig.showParamDisplayNames,
  };
}

function arePinnedParamsSelectorDepsEqual(
  left: PinnedParamsSelectorDeps,
  right: PinnedParamsSelectorDeps,
) {
  return (
    left.sectionImpl === right.sectionImpl &&
    left.pinnedShown === right.pinnedShown
  );
}

function areUnpinnedParamsSelectorDepsEqual(
  left: UnpinnedParamsSelectorDeps,
  right: UnpinnedParamsSelectorDeps,
) {
  return (
    left.sectionImpl === right.sectionImpl &&
    left.pinnedShown === right.pinnedShown &&
    left.unpinnedShown === right.unpinnedShown
  );
}

function areEdgeStripSelectorDepsEqual(
  left: EdgeStripSelectorDeps,
  right: EdgeStripSelectorDeps,
) {
  return (
    left.sectionImpl === right.sectionImpl &&
    left.pinnedShown === right.pinnedShown &&
    left.unpinnedShown === right.unpinnedShown &&
    left.codeObjImpls === right.codeObjImpls &&
    left.codeObjs === right.codeObjs &&
    left.codeObjVariants === right.codeObjVariants &&
    left.sectionImpls === right.sectionImpls &&
    left.sectionVariantMap === right.sectionVariantMap &&
    left.sectionVariants === right.sectionVariants &&
    left.sections === right.sections &&
    left.showParamDisplayNames === right.showParamDisplayNames
  );
}

function getEdgeInputPortLabel(
  state: ZustandProjectState,
  sectionId: string,
  paramId: string,
  requiredParamIdsToPaths: Record<string, Array<string>>,
) {
  const path = requiredParamIdsToPaths[paramId];
  const rawLabel = path
    ? paramNameFromPathArray(state, sectionId, path)
    : getParamDisplayNameIfPresent(state, sectionId, paramId) ?? paramId;
  return rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;
}

function buildEdgeInputPorts(
  state: ZustandProjectState,
  sectionId: string,
  edgeInputParams: Array<string>,
  requiredParamIdsToPaths: Record<string, Array<string>>,
): Array<EdgePortView> {
  return edgeInputParams.map((paramId) => ({
    id: paramId,
    label: getEdgeInputPortLabel(
      state,
      sectionId,
      paramId,
      requiredParamIdsToPaths,
    ),
  }));
}

function buildEdgeOutputPorts(
  edgeOutputPorts: Array<{ id: string; accessor: string }>,
): Array<EdgePortView> {
  return edgeOutputPorts.map((port) => ({
    id: port.id,
    label:
      port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
  }));
}

function buildPinnedParamsStateFromDeps(
  deps: PinnedParamsSelectorDeps,
): PinnedParamsState {
  const filteredPinned = filterShownParamIds(
    deps.pinnedShown,
    deps.sectionImpl.edgeInputParams,
  );
  return {
    ...filteredPinned,
    shouldRoundBottom: !deps.sectionImpl.hideUnpinnedParams,
    positionAndSizeLocked: deps.sectionImpl.positionAndSizeLocked,
    styleColor: deps.sectionImpl.styleColor ?? null,
  };
}

function buildUnpinnedParamsStateFromDeps(
  deps: UnpinnedParamsSelectorDeps,
): UnpinnedParamsState {
  const filteredPinned = filterShownParamIds(
    deps.pinnedShown,
    deps.sectionImpl.edgeInputParams,
  );
  const filteredUnpinned = filterShownParamIds(
    deps.unpinnedShown,
    deps.sectionImpl.edgeInputParams,
  );
  return {
    hideUnpinnedParams: deps.sectionImpl.hideUnpinnedParams,
    requiredParamIdsToPaths: filteredUnpinned.requiredParamIdsToPaths,
    topLevelParamIds: filteredUnpinned.topLevelParamIds,
    hasPinnedParams: filteredPinned.topLevelParamIds.length > 0,
    positionAndSizeLocked: deps.sectionImpl.positionAndSizeLocked,
    styleColor: deps.sectionImpl.styleColor ?? null,
  };
}

function buildEdgeStripStateFromDeps(
  state: ZustandProjectState,
  sectionId: string,
  deps: EdgeStripSelectorDeps,
): EdgeStripState {
  const filteredPinned = filterShownParamIds(
    deps.pinnedShown,
    deps.sectionImpl.edgeInputParams,
  );
  const requiredParamIdsToPaths = {
    ...deps.pinnedShown.requiredParamIdsToPaths,
    ...deps.unpinnedShown.requiredParamIdsToPaths,
  };
  return {
    inputPorts: buildEdgeInputPorts(
      state,
      sectionId,
      deps.sectionImpl.edgeInputParams,
      requiredParamIdsToPaths,
    ),
    outputPorts: buildEdgeOutputPorts(deps.sectionImpl.edgeOutputPorts),
    shouldRoundBottom:
      filteredPinned.topLevelParamIds.length === 0 &&
      deps.sectionImpl.hideUnpinnedParams,
    positionAndSizeLocked: deps.sectionImpl.positionAndSizeLocked,
    selectedParams: deps.sectionImpl.selectedParams ?? [],
    styleColor: deps.sectionImpl.styleColor ?? null,
  };
}

export function buildPinnedParamsState(
  state: ZustandProjectState,
  sectionId: string,
): PinnedParamsState {
  return buildPinnedParamsStateFromDeps(
    getPinnedParamsSelectorDeps(state, sectionId),
  );
}

export function buildUnpinnedParamsState(
  state: ZustandProjectState,
  sectionId: string,
): UnpinnedParamsState {
  return buildUnpinnedParamsStateFromDeps(
    getUnpinnedParamsSelectorDeps(state, sectionId),
  );
}

export function buildEdgeStripState(
  state: ZustandProjectState,
  sectionId: string,
): EdgeStripState {
  return buildEdgeStripStateFromDeps(
    state,
    sectionId,
    getEdgeStripSelectorDeps(state, sectionId),
  );
}

export function createPinnedParamsStateSelector(sectionId: string) {
  let previousDeps: PinnedParamsSelectorDeps | null = null;
  let previousResult: PinnedParamsState | null = null;

  return (state: ZustandProjectState): PinnedParamsState => {
    const nextDeps = getPinnedParamsSelectorDeps(state, sectionId);
    if (
      previousDeps &&
      previousResult &&
      arePinnedParamsSelectorDepsEqual(previousDeps, nextDeps)
    ) {
      return previousResult;
    }

    const nextResult = buildPinnedParamsStateFromDeps(nextDeps);
    previousDeps = nextDeps;
    previousResult = nextResult;
    return nextResult;
  };
}

export function createUnpinnedParamsStateSelector(sectionId: string) {
  let previousDeps: UnpinnedParamsSelectorDeps | null = null;
  let previousResult: UnpinnedParamsState | null = null;

  return (state: ZustandProjectState): UnpinnedParamsState => {
    const nextDeps = getUnpinnedParamsSelectorDeps(state, sectionId);
    if (
      previousDeps &&
      previousResult &&
      areUnpinnedParamsSelectorDepsEqual(previousDeps, nextDeps)
    ) {
      return previousResult;
    }

    const nextResult = buildUnpinnedParamsStateFromDeps(nextDeps);
    previousDeps = nextDeps;
    previousResult = nextResult;
    return nextResult;
  };
}

export function createEdgeStripStateSelector(sectionId: string) {
  let previousDeps: EdgeStripSelectorDeps | null = null;
  let previousResult: EdgeStripState | null = null;

  return (state: ZustandProjectState): EdgeStripState => {
    const nextDeps = getEdgeStripSelectorDeps(state, sectionId);
    if (
      previousDeps &&
      previousResult &&
      areEdgeStripSelectorDepsEqual(previousDeps, nextDeps)
    ) {
      return previousResult;
    }

    const nextResult = buildEdgeStripStateFromDeps(state, sectionId, nextDeps);
    previousDeps = nextDeps;
    previousResult = nextResult;
    return nextResult;
  };
}
