import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { buildParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, type ZustandProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { GetParamSwitch } from "./GetParamSwitch";
import { buildFilteredRequiredParamSet } from "./getParamSwitchUtils";
import {
  ParamDndProvider,
  useParamDndChildrenForParent,
} from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
};

type ParamDuplicateIndexCacheEntry = {
  codeObjsRef: ZustandProjectState["codeObjs"];
  result: ReturnType<typeof buildParamDuplicateIndex>;
};

type ParamTreeCacheEntry = {
  codeObjsRef: ZustandProjectState["codeObjs"];
  codeObjVariantsRef: ZustandProjectState["codeObjVariants"];
  codeObjImplsRef: ZustandProjectState["codeObjImpls"];
  result: ReturnType<typeof buildParamTreeView>;
};

type FilteredRequiredParamIdsCacheEntry = {
  projectConfigRef: ZustandProjectState["projectConfig"];
  codeObjsRef: ZustandProjectState["codeObjs"];
  codeObjVariantsRef: ZustandProjectState["codeObjVariants"];
  codeObjImplsRef: ZustandProjectState["codeObjImpls"];
  paramFilter: string;
  result: ReadonlySet<string> | null;
};

const duplicateIndexCacheBySectionImpl = new WeakMap<
  object,
  ParamDuplicateIndexCacheEntry
>();
const filteredRequiredParamIdsCacheBySectionImpl = new WeakMap<
  object,
  WeakMap<Record<string, string[]>, FilteredRequiredParamIdsCacheEntry>
>();
const paramTreeCacheBySectionImpl = new WeakMap<
  object,
  WeakMap<string[], WeakMap<Record<string, string[]>, ParamTreeCacheEntry>>
>();

function getCachedDuplicateIndex(
  state: ZustandProjectState,
  sectionId: string,
): ReturnType<typeof buildParamDuplicateIndex> {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const cached = duplicateIndexCacheBySectionImpl.get(sectionImpl);
  if (cached && cached.codeObjsRef === state.codeObjs) {
    return cached.result;
  }
  const result = buildParamDuplicateIndex(state, sectionId);
  duplicateIndexCacheBySectionImpl.set(sectionImpl, {
    codeObjsRef: state.codeObjs,
    result,
  });
  return result;
}

function getCachedFilteredRequiredParamIds(
  state: ZustandProjectState,
  sectionId: string,
  requiredParamIdsToPaths: Record<string, string[]>,
): ReadonlySet<string> | null {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  let cacheByRequiredParamIds =
    filteredRequiredParamIdsCacheBySectionImpl.get(sectionImpl);
  if (!cacheByRequiredParamIds) {
    cacheByRequiredParamIds = new WeakMap<
      Record<string, string[]>,
      FilteredRequiredParamIdsCacheEntry
    >();
    filteredRequiredParamIdsCacheBySectionImpl.set(
      sectionImpl,
      cacheByRequiredParamIds,
    );
  }
  const cached = cacheByRequiredParamIds.get(requiredParamIdsToPaths);
  if (
    cached &&
    cached.projectConfigRef === state.projectConfig &&
    cached.codeObjsRef === state.codeObjs &&
    cached.codeObjVariantsRef === state.codeObjVariants &&
    cached.codeObjImplsRef === state.codeObjImpls &&
    cached.paramFilter === sectionImpl.paramFilter
  ) {
    return cached.result;
  }
  const result = buildFilteredRequiredParamSet({
    paramFilter: sectionImpl.paramFilter,
    requiredParamIdsToPaths,
    getParamName: (paramId) => getParamDisplayName(state, sectionId, paramId),
  });
  cacheByRequiredParamIds.set(requiredParamIdsToPaths, {
    projectConfigRef: state.projectConfig,
    codeObjsRef: state.codeObjs,
    codeObjVariantsRef: state.codeObjVariants,
    codeObjImplsRef: state.codeObjImpls,
    paramFilter: sectionImpl.paramFilter,
    result,
  });
  return result;
}

function getCachedParamTreeView(
  state: ZustandProjectState,
  sectionId: string,
  paramIds: string[],
  requiredParamIdsToPaths: Record<string, string[]>,
): ReturnType<typeof buildParamTreeView> {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  let cacheByParamIds = paramTreeCacheBySectionImpl.get(sectionImpl);
  if (!cacheByParamIds) {
    cacheByParamIds = new WeakMap<
      string[],
      WeakMap<Record<string, string[]>, ParamTreeCacheEntry>
    >();
    paramTreeCacheBySectionImpl.set(sectionImpl, cacheByParamIds);
  }
  let cacheByRequiredParamIds = cacheByParamIds.get(paramIds);
  if (!cacheByRequiredParamIds) {
    cacheByRequiredParamIds = new WeakMap<
      Record<string, string[]>,
      ParamTreeCacheEntry
    >();
    cacheByParamIds.set(paramIds, cacheByRequiredParamIds);
  }
  const cached = cacheByRequiredParamIds.get(requiredParamIdsToPaths);
  if (
    cached &&
    cached.codeObjsRef === state.codeObjs &&
    cached.codeObjVariantsRef === state.codeObjVariants &&
    cached.codeObjImplsRef === state.codeObjImpls
  ) {
    return cached.result;
  }
  const result = buildParamTreeView(
    state,
    sectionId,
    paramIds,
    requiredParamIdsToPaths,
  );
  cacheByRequiredParamIds.set(requiredParamIdsToPaths, {
    codeObjsRef: state.codeObjs,
    codeObjVariantsRef: state.codeObjVariants,
    codeObjImplsRef: state.codeObjImpls,
    result,
  });
  return result;
}

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  hasSectionStyleTheme,
}: ParamDndListProps) {
  const duplicateIndex = useProjectState(
    (state) => getCachedDuplicateIndex(state, sectionId),
    _.isEqual,
  );
  const filteredRequiredParamIds = useProjectState(
    (state) =>
      getCachedFilteredRequiredParamIds(
        state,
        sectionId,
        requiredParamIdsToPaths,
      ),
    _.isEqual,
  );
  const paramFilterActive = filteredRequiredParamIds !== null;
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const { canEditStructure } = useShareCapabilities();
  const enabled = isSelectingParams && canEditStructure && !paramFilterActive;
  const tree = useProjectState((state) => {
    if (!enabled) {
      return null;
    }
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    if (impl.type === SectionTypeEnum.Callable) {
      if (!impl.callable) {
        return null;
      }
    } else if (
      impl.type === SectionTypeEnum.Dict ||
      impl.type === SectionTypeEnum.GlobalVariables
    ) {
      if (!impl.topLevelParamId) {
        return null;
      }
    } else {
      return null;
    }
    return getCachedParamTreeView(
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    );
  }, _.isEqual);

  if (!tree) {
    return (
      <ParamDuplicateIndexProvider value={duplicateIndex}>
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
          filteredRequiredParamIds={filteredRequiredParamIds}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </ParamDuplicateIndexProvider>
    );
  }

  return (
    <ParamDuplicateIndexProvider value={duplicateIndex}>
      <ParamDndProvider
        sectionId={sectionId}
        listKey={listKey}
        tree={tree}
        enabled={enabled}
      >
        <ParamDndListBody
          sectionId={sectionId}
          rootId={tree.rootId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={isTopLevel}
          listKey={listKey}
          filteredRequiredParamIds={filteredRequiredParamIds}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}

function ParamDndListBody({
  sectionId,
  rootId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  isTopLevel,
  listKey,
  filteredRequiredParamIds,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  rootId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevel: boolean;
  listKey: ParamListKey;
  filteredRequiredParamIds: ReadonlySet<string> | null;
  hasSectionStyleTheme: boolean;
}) {
  const renderParamIds = useParamDndChildrenForParent(rootId, paramIds);

  return (
    <GetParamSwitch
      sectionId={sectionId}
      paramIds={renderParamIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevel={isTopLevel}
      listKey={listKey}
      filteredRequiredParamIds={filteredRequiredParamIds}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
}
