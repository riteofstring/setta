import { useSortable } from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import {
  getParamDndItemId,
  isTempParam,
  useParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React, { useCallback } from "react";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
  toggleParamSelected,
} from "state/actions/sectionInfos";
import {
  useMisc,
  useProjectSearch,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  isBaseParamCodeObjImpl,
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import {
  type NestedParentParamIdLookup,
  type RenderableParamIdLookup,
  getNestedParamSwitchRenderState,
  getVisibleRenderableParamIds,
} from "./getFilteredRenderableParamIds";
import { ParamContainer } from "./ParamContainer";
import {
  useParamDndChildrenForParent,
  useParamDndContext,
} from "./ParamDndContext";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";
import { ParamRowShell } from "./ParamRowShell";

type ParamSwitchProps = {
  sectionId: string;
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevelWithPad?: boolean;
  isNestedChildInTree?: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
  nestedParentParamIdLookup: NestedParentParamIdLookup | null;
  visibleParamIdLookup: RenderableParamIdLookup | null;
};

const EMPTY_NESTED_PARENT_PARAM_ID_LOOKUP: NestedParentParamIdLookup = {};

function _ParamSwitch(props: ParamSwitchProps) {
  if (isTempParam(props.paramInfoId)) {
    return <TempParamSwitch {...props} />;
  }
  return <RealParamSwitch {...props} />;
}

function useSortableParamRow({
  sectionId,
  paramInfoId,
  listKey,
  paramId,
  hasNested,
  onlyChildId,
  width,
  height,
}: {
  sectionId: string;
  paramInfoId: string;
  listKey: ParamListKey;
  paramId: string | null;
  hasNested: boolean;
  onlyChildId: string | null;
  width?: number | null;
  height?: number | null;
}) {
  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const dndId = isTempParam(paramInfoId)
    ? paramInfoId
    : getParamDndItemId(paramInfoId, listKey);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dndId,
    disabled: !dndEnabled,
    data: {
      type: "param",
      paramId,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested,
      onlyChildId,
    },
  });
  const { role: _role, ...restAttributes } = attributes;
  const scaledTransform = applyZoomToTransform(transform);

  return {
    dndAttributes: restAttributes,
    dndListeners: listeners,
    dndRef: setNodeRef,
    dndStyle: {
      transform: transformToString(scaledTransform),
      transition,
      zIndex: isDragging ? 1000 : undefined,
      height: height ?? undefined,
      width: width ?? undefined,
    },
    isDragging,
  };
}

function TempParamSwitch({
  sectionId,
  isNestedChildInTree = false,
  paramInfoId,
  listKey,
}: Pick<
  ParamSwitchProps,
  "sectionId" | "paramInfoId" | "listKey" | "isNestedChildInTree"
>) {
  const dndContext = useParamDndContext();
  const activeListKey = listKey ?? dndContext?.listKey ?? null;
  const { placeholderWidth, placeholderHeight } = useParamDndState(
    (state) => ({
      placeholderWidth: state.placeholderWidth,
      placeholderHeight: state.placeholderHeight,
    }),
    _.isEqual,
  );
  const zoom = useReactFlow((state) => state.transform[2]);
  const safeZoom = zoom > 0 ? zoom : 1;
  const normalizedWidth =
    placeholderWidth !== null ? placeholderWidth / safeZoom : null;
  const normalizedHeight =
    placeholderHeight !== null ? placeholderHeight / safeZoom : null;

  if (!activeListKey) {
    return null;
  }
  const { dndAttributes, dndListeners, dndRef, dndStyle } = useSortableParamRow(
    {
      sectionId,
      paramInfoId,
      listKey: activeListKey,
      paramId: null,
      hasNested: false,
      onlyChildId: null,
      width: normalizedWidth,
      height: normalizedHeight,
    },
  );
  return (
    <ParamRowShell
      isNestedChildInTree={isNestedChildInTree}
      justifyBetween={true}
      extraClassName="bg-blue-500/40 dark:bg-blue-600/40"
      style={dndStyle}
      dndRef={dndRef}
      dndAttributes={dndAttributes}
      dndListeners={dndListeners}
    />
  );
}

function RealParamSwitch(props: ParamSwitchProps) {
  const {
    sectionId,
    paramInfoId,
    onResizeStart,
    isTopLevelWithPad,
    hasSectionStyleTheme,
    isNestedChildInTree,
    listKey,
  } = props;
  const typeErrors = useTypeErrors(
    (x) => x.errors[sectionId]?.params?.[paramInfoId],
  );
  const typeErrorMessage = typeErrors?.join("\n") ?? "";
  const maybeErrorMessage = typeErrorMessage;
  const hasError = maybeErrorMessage.length > 0;
  const { isFocusedSearchResult, isSearchResult } = useProjectSearch((x) => {
    return {
      isFocusedSearchResult:
        x.focused?.sectionId === sectionId &&
        x.focused?.paramInfoId === paramInfoId,
      isSearchResult: x.lookup.has(
        createProjectSearchLookupKey(sectionId, paramInfoId),
      ),
    };
  }, _.isEqual);
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseParamCodeObjImpl,
    ),
  );
  const paramIsSelected = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ).selectedParams.includes(paramInfoId),
  );
  const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
  const isKwarg = codeObjImpl.coreNameEditable;
  const paramChildren = isNestedParam ? codeObjImpl.children : [];
  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const visibleRenderChildren = getVisibleRenderableParamIds({
    renderParamIds: renderChildren,
    visibleParamIdLookup: props.visibleParamIdLookup,
  });
  const hasChildren = paramChildren.length > 0;
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const handleParamMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingParams) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    },
    [isSelectingParams],
  );
  const handleParamClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingParams) {
        return;
      }
      e.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    },
    [isSelectingParams, sectionId, paramInfoId],
  );

  const onMouseDownConditional = hasChildren ? handleParamMouseDown : undefined;
  const onMouseDownAlways = handleParamMouseDown;

  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";
  const bg = paramIsSelected
    ? `transition-colors rounded-sm ${selectedBgClassName}`
    : "transition-colors rounded-sm";

  let border = "";
  if (hasError) {
    border = "bg-red-200 dark:bg-red-800/30";
  } else if (isFocusedSearchResult) {
    border = "outline outline-4 outline-green-500 dark:outline-green-500/80";
  } else if (isSearchResult) {
    border = "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }

  let labelShapeKey:
    | "nameInputLeaf"
    | "nameInputParent"
    | "textLabelLeaf"
    | "textLabelParent";
  if (isKwarg) {
    labelShapeKey = hasChildren ? "nameInputParent" : "nameInputLeaf";
  } else {
    labelShapeKey = hasChildren ? "textLabelParent" : "textLabelLeaf";
  }
  const label = isKwarg ? (
    <ParamNameInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      labelShapeKey={labelShapeKey}
      hasChildren={hasChildren}
      onMouseDown={onMouseDownConditional}
      border={hasChildren ? border : ""}
      bg={hasChildren ? bg : ""}
    />
  ) : (
    <ParamTextLabel
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      labelShapeKey={labelShapeKey}
      onMouseDown={onMouseDownConditional}
      bg={hasChildren ? bg : ""}
      hasChildren={hasChildren}
    />
  );

  const hasNested = paramChildren.length > 0;
  const onlyChildId = paramChildren.length === 1 ? paramChildren[0] : null;
  const { dndAttributes, dndListeners, dndRef, dndStyle, isDragging } =
    useSortableParamRow({
      sectionId,
      paramInfoId,
      listKey,
      paramId: paramInfoId,
      hasNested,
      onlyChildId,
    });

  return (
    <>
      <ParamContainer
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        labelShapeKey={labelShapeKey}
        onResizeStart={onResizeStart}
        isTopLevelWithPad={isTopLevelWithPad}
        isNestedChildInTree={isNestedChildInTree}
        hasSectionStyleTheme={hasSectionStyleTheme}
        bg={bg}
        border={border}
        isNestedParam={isNestedParam}
        maybeErrorMessage={maybeErrorMessage}
        onClick={handleParamClick}
        onMouseDown={onMouseDownAlways}
        dndAttributes={dndAttributes}
        dndListeners={dndListeners}
        dndRef={dndRef}
        dndStyle={dndStyle}
        dndClassName={isDragging ? "opacity-80" : ""}
      >
        {label}
      </ParamContainer>
      {visibleRenderChildren.map((childParamId) => {
        const nestedRenderState = getNestedParamSwitchRenderState({
          paramId: childParamId,
          requiredParamIdsToPaths: props.requiredParamIdsToPaths,
          nestedParentParamIdLookup:
            props.nestedParentParamIdLookup ??
            EMPTY_NESTED_PARENT_PARAM_ID_LOOKUP,
          visibleParamIdLookup: props.visibleParamIdLookup,
        });

        return (
          <ParamSwitch
            key={childParamId}
            sectionId={sectionId}
            paramInfoId={childParamId}
            requiredParamIdsToPaths={nestedRenderState.requiredParamIdsToPaths}
            onResizeStart={onResizeStart}
            isNestedChildInTree={true}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
            nestedParentParamIdLookup={
              nestedRenderState.nestedParentParamIdLookup
            }
            visibleParamIdLookup={nestedRenderState.visibleParamIdLookup}
          />
        );
      })}
    </>
  );
}

function areParamSwitchPropsEqual(
  prevProps: ParamSwitchProps,
  nextProps: ParamSwitchProps,
) {
  return (
    prevProps.sectionId === nextProps.sectionId &&
    prevProps.paramInfoId === nextProps.paramInfoId &&
    prevProps.requiredParamIdsToPaths === nextProps.requiredParamIdsToPaths &&
    prevProps.onResizeStart === nextProps.onResizeStart &&
    prevProps.isTopLevelWithPad === nextProps.isTopLevelWithPad &&
    prevProps.isNestedChildInTree === nextProps.isNestedChildInTree &&
    prevProps.listKey === nextProps.listKey &&
    prevProps.hasSectionStyleTheme === nextProps.hasSectionStyleTheme &&
    prevProps.nestedParentParamIdLookup === nextProps.nestedParentParamIdLookup &&
    prevProps.visibleParamIdLookup === nextProps.visibleParamIdLookup
  );
}

export const ParamSwitch = React.memo(_ParamSwitch, areParamSwitchPropsEqual);
