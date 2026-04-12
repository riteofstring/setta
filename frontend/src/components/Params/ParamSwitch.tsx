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
import React, { memo, useCallback } from "react";
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
import { ParamContainer } from "./ParamContainer";
import { useParamDndContext } from "./ParamDndContext";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

type ParamSwitchProps = {
  sectionId: string;
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  isTopLevelWithPad?: boolean;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
};

type TempParamPlaceholderShellProps = {
  dndAttributes: Record<string, unknown>;
  dndListeners: Record<string, unknown>;
  dndRef: (node: HTMLElement | null) => void;
  rowStyle: React.CSSProperties;
};

type TempParamPlaceholderRowProps = TempParamPlaceholderShellProps & {
  placeholderHeight: number | null;
  placeholderWidth: number | null;
};

function _ParamSwitch(props: ParamSwitchProps) {
  if (isTempParam(props.paramInfoId)) {
    return <TempParamSwitch {...props} />;
  }
  return <RealParamSwitch {...props} />;
}

export const TempParamPlaceholderRow = memo(function TempParamPlaceholderRow({
  dndAttributes,
  dndListeners,
  dndRef,
  rowStyle,
  placeholderHeight,
  placeholderWidth,
}: TempParamPlaceholderRowProps) {
  const zoom = useReactFlow((state) => state.transform[2]);
  const safeZoom = zoom > 0 ? zoom : 1;
  const normalizedWidth =
    placeholderWidth !== null ? placeholderWidth / safeZoom : null;
  const normalizedHeight =
    placeholderHeight !== null ? placeholderHeight / safeZoom : null;
  const columnWidth = "var(--param-column-width, 200px)";

  return (
    <TempParamPlaceholderShell
      dndAttributes={dndAttributes}
      dndListeners={dndListeners}
      dndRef={dndRef}
      rowStyle={{
        gridTemplateColumns: `minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...rowStyle,
        height: normalizedHeight ?? undefined,
        width: normalizedWidth ?? undefined,
      }}
    />
  );
});

export const TempParamPlaceholderShell = memo(
  function TempParamPlaceholderShell({
    dndAttributes,
    dndListeners,
    dndRef,
    rowStyle,
  }: TempParamPlaceholderShellProps) {
    return (
      <article
        className="section-args-nested-key-value section-key-value section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm bg-blue-500/40 px-[2px] dark:bg-blue-600/40"
        style={rowStyle}
        data-param-row="true"
        ref={dndRef}
        {...dndAttributes}
        {...dndListeners}
      />
    );
  },
);

export function TempParamSwitch({
  sectionId,
  paramInfoId,
  listKey,
}: Pick<ParamSwitchProps, "sectionId" | "paramInfoId" | "listKey">) {
  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const activeListKey = listKey ?? dndContext?.listKey ?? null;
  const { placeholderWidth, placeholderHeight } = useParamDndState(
    (state) => ({
      placeholderWidth: state.placeholderWidth,
      placeholderHeight: state.placeholderHeight,
    }),
    _.isEqual,
  );

  if (!activeListKey) {
    return null;
  }
  const dndId = isTempParam(paramInfoId)
    ? paramInfoId
    : getParamDndItemId(paramInfoId, activeListKey);
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
      paramId: null,
      sectionId,
      listKey: activeListKey,
      isTopLevel: false,
      hasNested: false,
      onlyChildId: null,
    },
  });
  const { role: _role, ...restAttributes } = attributes;
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <TempParamPlaceholderRow
      dndAttributes={restAttributes ?? {}}
      dndListeners={listeners ?? {}}
      dndRef={setNodeRef}
      rowStyle={dndStyle}
      placeholderHeight={placeholderHeight}
      placeholderWidth={placeholderWidth}
    />
  );
}

function RealParamSwitch(props: ParamSwitchProps) {
  const { sectionId, paramInfoId, hasSectionStyleTheme } = props;

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

  const paramsImpl = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ),
  );
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImplWithTypeGuard(
      x,
      sectionId,
      paramInfoId,
      isBaseParamCodeObjImpl,
    ),
  );
  const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
  const paramIsSelected = paramsImpl.selectedParams.includes(paramInfoId);
  const isKwarg = codeObjImpl.coreNameEditable;
  const paramChildren = isNestedParam ? codeObjImpl.children : [];

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

  const label = isKwarg ? (
    <ParamNameInput
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      hasChildren={hasChildren}
      onMouseDown={onMouseDownConditional}
      border={hasChildren ? border : ""}
      bg={hasChildren ? bg : ""}
    />
  ) : (
    <ParamTextLabel
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      onMouseDown={onMouseDownConditional}
      bg={hasChildren ? bg : ""}
    />
  );

  const sharedProps = {
    ...props,
    bg,
    border,
    hasSectionStyleTheme,
    isKwarg,
    isNestedParam,
    label,
    maybeErrorMessage,
    onClick: handleParamClick,
    onMouseDown: onMouseDownAlways,
    paramChildren,
  };

  return <SortableRealParamSwitchRow {...sharedProps} />;
}

export const ParamSwitch = React.memo(_ParamSwitch, _.isEqual);

function SortableRealParamSwitchRow({
  sectionId,
  paramInfoId,
  listKey,
  paramChildren,
  label,
  ...props
}: ParamSwitchProps & {
  bg: string;
  border: string;
  isKwarg: boolean;
  isNestedParam: boolean;
  label: React.ReactNode;
  maybeErrorMessage: string;
  onClick: React.MouseEventHandler;
  onMouseDown: React.MouseEventHandler;
  paramChildren: string[];
}) {
  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const dndId = getParamDndItemId(paramInfoId, listKey);
  const hasNested = paramChildren.length > 0;
  const onlyChildId = paramChildren.length === 1 ? paramChildren[0] : null;
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
      paramId: paramInfoId,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested,
      onlyChildId,
    },
  });
  const { role: _role, ...restAttributes } = attributes;
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <ParamContainer
      {...props}
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      listKey={listKey}
      paramChildren={paramChildren}
      dndAttributes={restAttributes}
      dndListeners={listeners}
      dndRef={setNodeRef}
      dndStyle={dndStyle}
      dndClassName={isDragging ? "opacity-80" : ""}
    >
      {label}
    </ParamContainer>
  );
}
