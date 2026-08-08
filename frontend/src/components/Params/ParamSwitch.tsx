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
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
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

type RealParamSwitchState = {
  hasChildren: boolean;
  isFocusedSearchResult: boolean;
  isKwarg: boolean;
  isNestedParam: boolean;
  isSearchResult: boolean;
  maybeErrorMessage: string;
  paramChildren: string[];
  paramIsSelected: boolean;
};

type ParamSelectionHandlers = {
  handleParamClick: React.MouseEventHandler;
  handleParamMouseDown: React.MouseEventHandler;
};

const PARAM_COLUMN_WIDTH = "var(--param-column-width, 200px)";

function _ParamSwitch(props: ParamSwitchProps) {
  if (isTempParam(props.paramInfoId)) {
    return <TempParamSwitch {...props} />;
  }
  return <RealParamSwitch {...props} />;
}

function omitRoleAttribute(attributes: Record<string, unknown>) {
  if (!("role" in attributes)) {
    return attributes;
  }
  const nextAttributes = { ...attributes };
  delete nextAttributes.role;
  return nextAttributes;
}

function normalizePlaceholderDimension(value: number | null, zoom: number) {
  if (value === null) {
    return undefined;
  }
  const safeZoom = zoom > 0 ? zoom : 1;
  return value / safeZoom;
}

function useTempParamPlaceholderStyle() {
  const { placeholderWidth, placeholderHeight } = useParamDndState(
    (state) => ({
      placeholderWidth: state.placeholderWidth,
      placeholderHeight: state.placeholderHeight,
    }),
    _.isEqual,
  );
  const zoom = useReactFlow((state) => state.transform[2]);

  return {
    height: normalizePlaceholderDimension(placeholderHeight, zoom),
    width: normalizePlaceholderDimension(placeholderWidth, zoom),
  };
}

function createSortableStyle({
  transform,
  transition,
  isDragging,
  height,
  width,
}: {
  transform: ReturnType<typeof useSortable>["transform"];
  transition: ReturnType<typeof useSortable>["transition"];
  isDragging: boolean;
  height?: number;
  width?: number;
}): React.CSSProperties {
  return {
    transform: transformToString(applyZoomToTransform(transform)),
    transition,
    zIndex: isDragging ? 1000 : undefined,
    height,
    width,
  };
}

function TempParamSwitch({
  sectionId,
  paramInfoId,
  listKey,
}: Pick<ParamSwitchProps, "sectionId" | "paramInfoId" | "listKey">) {
  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const { height, width } = useTempParamPlaceholderStyle();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: paramInfoId,
    disabled: !dndEnabled,
    data: {
      type: "param",
      paramId: null,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested: false,
      onlyChildId: null,
    },
  });
  const dndStyle = createSortableStyle({
    transform,
    transition,
    isDragging,
    height,
    width,
  });

  return (
    <article
      className="section-args-nested-key-value section-key-value section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm bg-blue-500/40 px-[2px] dark:bg-blue-600/40"
      style={{
        gridTemplateColumns: `minmax(min-content, ${PARAM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...dndStyle,
      }}
      data-param-row="true"
      ref={setNodeRef}
      {...omitRoleAttribute(attributes)}
      {...(listeners ?? {})}
    />
  );
}

function useRealParamSwitchState(
  sectionId: string,
  paramInfoId: string,
): RealParamSwitchState | null {
  const typeErrors = useTypeErrors(
    (x) => x.errors[sectionId]?.params?.[paramInfoId],
  );
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

  const paramState = useProjectState((x) => {
    const paramsImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      x,
      sectionId,
      paramInfoId,
      isBaseParamCodeObjImpl,
    );
    if (!paramsImpl || !codeObjImpl) {
      return null;
    }
    return { paramsImpl, codeObjImpl };
  }, _.isEqual);

  if (!paramState) {
    return null;
  }

  const { paramsImpl, codeObjImpl } = paramState;
  const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
  const paramChildren = isNestedParam ? codeObjImpl.children : [];

  return {
    hasChildren: paramChildren.length > 0,
    isFocusedSearchResult,
    isKwarg: Boolean(codeObjImpl.coreNameEditable),
    isNestedParam,
    isSearchResult,
    maybeErrorMessage: typeErrors?.join("\n") ?? "",
    paramChildren,
    paramIsSelected: paramsImpl.selectedParams.includes(paramInfoId),
  };
}

function useParamSelectionHandlers(
  sectionId: string,
  paramInfoId: string,
): ParamSelectionHandlers {
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const handleParamMouseDown: React.MouseEventHandler = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingParams) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    },
    [isSelectingParams],
  );
  const handleParamClick: React.MouseEventHandler = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingParams) {
        return;
      }
      e.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    },
    [isSelectingParams, sectionId, paramInfoId],
  );

  return { handleParamClick, handleParamMouseDown };
}

function resolveParamSelectionClass(hasSectionStyleTheme: boolean) {
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";

  return `transition-colors rounded-sm ${selectedBgClassName}`;
}

function resolveParamBackgroundClass({
  hasSectionStyleTheme,
  paramIsSelected,
}: {
  hasSectionStyleTheme: boolean;
  paramIsSelected: boolean;
}) {
  if (!paramIsSelected) {
    return "transition-colors rounded-sm";
  }

  return resolveParamSelectionClass(hasSectionStyleTheme);
}

function resolveParamBorderClass({
  hasError,
  isFocusedSearchResult,
  isSearchResult,
}: {
  hasError: boolean;
  isFocusedSearchResult: boolean;
  isSearchResult: boolean;
}) {
  if (hasError) {
    return "bg-red-200 dark:bg-red-800/30";
  }
  if (isFocusedSearchResult) {
    return "outline outline-4 outline-green-500 dark:outline-green-500/80";
  }
  if (isSearchResult) {
    return "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }
  return "";
}

function renderParamLabel({
  sectionId,
  paramInfoId,
  isKwarg,
  hasChildren,
  onMouseDown,
  border,
  bg,
}: {
  sectionId: string;
  paramInfoId: string;
  isKwarg: boolean;
  hasChildren: boolean;
  onMouseDown?: React.MouseEventHandler;
  border: string;
  bg: string;
}) {
  if (isKwarg) {
    return (
      <ParamNameInput
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        hasChildren={hasChildren}
        onMouseDown={onMouseDown}
        border={hasChildren ? border : ""}
        bg={hasChildren ? bg : ""}
      />
    );
  }

  return (
    <ParamTextLabel
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      onMouseDown={onMouseDown}
      bg={hasChildren ? bg : ""}
    />
  );
}

function RealParamSwitch(props: ParamSwitchProps) {
  const { sectionId, paramInfoId, hasSectionStyleTheme } = props;
  const paramState = useRealParamSwitchState(sectionId, paramInfoId);
  const { handleParamClick, handleParamMouseDown } = useParamSelectionHandlers(
    sectionId,
    paramInfoId,
  );

  if (!paramState) {
    return null;
  }

  const bg = resolveParamBackgroundClass({
    hasSectionStyleTheme,
    paramIsSelected: paramState.paramIsSelected,
  });
  const border = resolveParamBorderClass({
    hasError: paramState.maybeErrorMessage.length > 0,
    isFocusedSearchResult: paramState.isFocusedSearchResult,
    isSearchResult: paramState.isSearchResult,
  });
  const label = renderParamLabel({
    sectionId,
    paramInfoId,
    isKwarg: paramState.isKwarg,
    hasChildren: paramState.hasChildren,
    onMouseDown: paramState.hasChildren ? handleParamMouseDown : undefined,
    border,
    bg,
  });

  return (
    <SortableRealParamSwitchRow
      {...props}
      bg={bg}
      border={border}
      isKwarg={paramState.isKwarg}
      isNestedParam={paramState.isNestedParam}
      label={label}
      maybeErrorMessage={paramState.maybeErrorMessage}
      onClick={handleParamClick}
      onMouseDown={handleParamMouseDown}
      paramChildren={paramState.paramChildren}
    />
  );
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
  const dndStyle = createSortableStyle({
    transform,
    transition,
    isDragging,
  });

  return (
    <ParamContainer
      {...props}
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      listKey={listKey}
      paramChildren={paramChildren}
      dndAttributes={omitRoleAttribute(attributes)}
      dndListeners={listeners}
      dndRef={setNodeRef}
      dndStyle={dndStyle}
      dndClassName={isDragging ? "opacity-80" : ""}
    >
      {label}
    </ParamContainer>
  );
}
