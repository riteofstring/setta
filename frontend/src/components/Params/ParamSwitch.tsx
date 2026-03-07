import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
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
  getParamDisplayName,
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

function _ParamSwitch(props: ParamSwitchProps) {
  if (isTempParam(props.paramInfoId)) {
    return <TempParamSwitch {...props} />;
  }
  return <RealParamSwitch {...props} />;
}

function TempParamSwitch({
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
  const zoom = useReactFlow((state) => state.transform[2]);
  const safeZoom = zoom > 0 ? zoom : 1;
  const normalizedWidth =
    placeholderWidth !== null ? placeholderWidth / safeZoom : null;
  const normalizedHeight =
    placeholderHeight !== null ? placeholderHeight / safeZoom : null;

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
    height: normalizedHeight ?? undefined,
    width: normalizedWidth ?? undefined,
  };
  const columnWidth = "var(--param-column-width, 200px)";

  return (
    <article
      className="section-args-nested-key-value section-key-value section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm bg-blue-500/40 px-[2px] dark:bg-blue-600/40"
      style={{
        gridTemplateColumns: `minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...(dndStyle ?? {}),
      }}
      data-param-row="true"
      ref={setNodeRef}
      {...(restAttributes ?? {})}
      {...(listeners ?? {})}
    />
  );
}

function RealParamSwitch(props: ParamSwitchProps) {
  const { sectionId, paramInfoId, hasSectionStyleTheme } = props;
  const benchmark = useSettingsAllSettingsBenchmark();

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

  const { paramIsSelected, isKwarg, paramChildren, isNestedParam } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        x,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        paramInfoId,
        isBaseParamCodeObjImpl,
      );
      const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
      return {
        paramIsSelected: impl.selectedParams.includes(paramInfoId),
        isKwarg: codeObjImpl.coreNameEditable,
        paramChildren: isNestedParam ? codeObjImpl.children : [],
        isNestedParam,
      };
    }, _.isEqual);

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

  const label = benchmark.renderLiveParamLabels ? (
    isKwarg ? (
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
    )
  ) : (
    <BenchmarkParamLabel
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      onMouseDown={onMouseDownConditional}
      bg={hasChildren ? bg : ""}
      isKwarg={isKwarg}
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

  return benchmark.renderParamSortable ? (
    <SortableRealParamSwitchRow {...sharedProps} />
  ) : (
    <StaticRealParamSwitchRow {...sharedProps} />
  );
}

export const ParamSwitch = React.memo(_ParamSwitch, _.isEqual);

function StaticRealParamSwitchRow({
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
  return (
    <ParamContainer
      {...props}
      benchmarkParamRowMode="static"
      dndClassName=""
      dndStyle={undefined}
      dndRef={undefined}
      dndAttributes={undefined}
      dndListeners={undefined}
    >
      {label}
    </ParamContainer>
  );
}

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
      benchmarkParamRowMode="sortable"
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

function BenchmarkParamLabel({
  sectionId,
  paramInfoId,
  onMouseDown,
  bg,
  isKwarg,
}: {
  sectionId: string;
  paramInfoId: string;
  onMouseDown?: React.MouseEventHandler;
  bg: string;
  isKwarg: boolean;
}) {
  const name = useProjectState((x) =>
    getParamDisplayName(x, sectionId, paramInfoId),
  );

  return (
    <p
      className={`${bg} truncate py-[.125rem] text-xs ${isKwarg ? "font-mono" : "font-semibold"} text-setta-700 dark:text-setta-200`}
      onMouseDownCapture={onMouseDown}
      data-settings-benchmark-light-label="true"
    >
      {name}
    </p>
  );
}
