import { isTempParam } from "forks/dnd-kit/paramDndState";
import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import {
  buildParamTreeView,
  type ParamTreeView,
} from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getFilteredRenderableParamIdLookup,
  getNestedParamSwitchRenderState,
  getNestedParentParamIdLookup,
  type NestedParentParamIdLookup,
  type RenderableParamIdLookup,
} from "./getFilteredRenderableParamIds";

type GetParamDndListRenderModelArgs = {
  state: ZustandProjectState;
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  allowTree: boolean;
};

export type ParamDndListRenderEntry = {
  paramId: string;
  isTopLevelWithPad: boolean;
  isNestedChildInTree: boolean;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  nestedParentParamIdLookup: NestedParentParamIdLookup | null;
  visibleParamIdLookup: RenderableParamIdLookup | null;
};

const PARAM_RENDER_ROOT_ID = "__setta_param_render_root__";

function buildFallbackRenderableParamTree({
  state,
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
}: Omit<GetParamDndListRenderModelArgs, "allowTree">): ParamTreeView {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const visibleSet = new Set(Object.keys(requiredParamIdsToPaths));
  const flat: ParamTreeView["flat"] = [];
  const visibleChildrenByParent: Record<string, Array<string>> = {
    [PARAM_RENDER_ROOT_ID]: [],
  };
  const parentById: Record<string, string | null> = {
    [PARAM_RENDER_ROOT_ID]: null,
  };

  function hasParamVariant(paramId: string) {
    return Object.prototype.hasOwnProperty.call(
      sectionImpl.codeObjVariantMap,
      paramId,
    );
  }

  function walk(paramId: string, depth: number, parentId: string) {
    if (!visibleSet.has(paramId) || !hasParamVariant(paramId)) {
      return;
    }
    if (!visibleChildrenByParent[parentId]) {
      visibleChildrenByParent[parentId] = [];
    }
    visibleChildrenByParent[parentId].push(paramId);
    parentById[paramId] = parentId;

    const impl = getCurrEffectiveCodeObjImpl(state, sectionId, paramId);
    const isParent = isBaseParentCodeObjImpl(impl);
    flat.push({ id: paramId, parentId, depth, isParent });

    if (!isParent) {
      return;
    }
    for (const childId of impl.children) {
      walk(childId, depth + 1, paramId);
    }
  }

  for (const paramId of paramIds) {
    walk(paramId, 0, PARAM_RENDER_ROOT_ID);
  }

  return {
    rootId: PARAM_RENDER_ROOT_ID,
    parentById,
    flat,
    visibleChildrenByParent,
  };
}

function buildRenderableParamTree({
  state,
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
}: Omit<GetParamDndListRenderModelArgs, "allowTree">): ParamTreeView | null {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );

  if (impl.type === SectionTypeEnum.Callable) {
    if (!impl.callable) {
      return buildFallbackRenderableParamTree({
        state,
        sectionId,
        paramIds,
        requiredParamIdsToPaths,
      });
    }
  } else if (
    impl.type === SectionTypeEnum.Dict ||
    impl.type === SectionTypeEnum.GlobalVariables
  ) {
    if (!impl.topLevelParamId) {
      return buildFallbackRenderableParamTree({
        state,
        sectionId,
        paramIds,
        requiredParamIdsToPaths,
      });
    }
  } else {
    return buildFallbackRenderableParamTree({
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    });
  }

  return buildParamTreeView(state, sectionId, paramIds, requiredParamIdsToPaths);
}

export function getParamDndListRenderEntries({
  rootId,
  visibleChildrenByParent,
  requiredParamIdsToPaths,
  nestedParentParamIdLookup,
  visibleParamIdLookup,
}: {
  rootId: string;
  visibleChildrenByParent: Record<string, Array<string>>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  nestedParentParamIdLookup: NestedParentParamIdLookup;
  visibleParamIdLookup: RenderableParamIdLookup | null;
}): Array<ParamDndListRenderEntry> {
  const entries: Array<ParamDndListRenderEntry> = [];

  function walk(parentId: string) {
    const childParamIds = (visibleChildrenByParent[parentId] ?? []).filter(
      (paramId) =>
        visibleParamIdLookup === null ||
        visibleParamIdLookup[paramId] === true ||
        isTempParam(paramId),
    );
    childParamIds.forEach((paramId, idx) => {
      const nestedRenderState = getNestedParamSwitchRenderState({
        paramId,
        requiredParamIdsToPaths,
        nestedParentParamIdLookup,
        visibleParamIdLookup,
      });
      entries.push({
        paramId,
        isTopLevelWithPad: parentId === rootId && idx > 0,
        isNestedChildInTree: parentId !== rootId,
        requiredParamIdsToPaths: nestedRenderState.requiredParamIdsToPaths,
        nestedParentParamIdLookup: nestedRenderState.nestedParentParamIdLookup,
        visibleParamIdLookup: nestedRenderState.visibleParamIdLookup,
      });
      walk(paramId);
    });
  }

  walk(rootId);
  return entries;
}

export function getParamDndListRenderModel({
  state,
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  allowTree,
}: GetParamDndListRenderModelArgs) {
  const duplicateIndex = buildParamDuplicateIndex(state, sectionId);
  const nestedParentParamIdLookup = getNestedParentParamIdLookup(
    requiredParamIdsToPaths,
  );
  const visibleParamIdLookup = getFilteredRenderableParamIdLookup({
    state,
    sectionId,
    requiredParamIdsToPaths,
  });
  const renderTree = buildRenderableParamTree({
    state,
    sectionId,
    paramIds,
    requiredParamIdsToPaths,
  });
  const paramFilterActive = visibleParamIdLookup !== null;

  if (!renderTree || !allowTree || paramFilterActive) {
    return {
      duplicateIndex,
      nestedParentParamIdLookup,
      paramFilterActive,
      renderTree,
      tree: null,
      visibleParamIdLookup,
    };
  }

  return {
    duplicateIndex,
    nestedParentParamIdLookup,
    paramFilterActive,
    renderTree,
    tree: renderTree,
    visibleParamIdLookup,
  };
}
