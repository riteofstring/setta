import { Handle } from "forks/xyflow/core/components/Handle";
import { HandlePosition } from "forks/xyflow/core/types";
import _ from "lodash";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
} from "state/actions/edges";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
  toggleParamSelected,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  useMisc,
  useProjectState,
  useTemporaryMiscState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import {
  getEdgesStripHeightKey,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { resolveEdgeStripHeight } from "./edgeStripUtils";
import { useHasSectionStyleTheme } from "./paramSectionStyleTheme";

type ProjectStateSnapshot = Parameters<typeof getCurrShownParamIds>[0];

type EdgePortView = {
  id: string;
  label: string;
};

type EdgeStripState = {
  inputPorts: Array<EdgePortView>;
  outputPorts: Array<EdgePortView>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  selectedParams: Array<string>;
  styleColor: string | null;
};

type EdgeStripAppearance = {
  handlePreventSectionClassName: string;
  handleSelectableClassName: string;
  rowPreventSectionClassName: string;
  stripBorderColorClassName: string;
  edgeLabelColorClassName: string;
  edgeRowHoverClassName: string;
  edgeRowSelectedClassName: string;
  edgeRowTextColorClassName: string;
  dividerColorClassName: string;
  edgeStripBgColorClassName: string;
  roundedBottomClassName: string;
};

type EdgesStripVariant = "section-body" | "bare-node";

function resolveThemeClassName(
  hasSectionStyleTheme: boolean,
  themedClassName: string,
  fallbackClassName: string,
) {
  return hasSectionStyleTheme ? themedClassName : fallbackClassName;
}

function getRoundedBottomClassName(
  shouldRoundBottom: boolean,
  positionAndSizeLocked: boolean,
) {
  if (!shouldRoundBottom) {
    return "";
  }
  return positionAndSizeLocked ? "rounded-b-sm" : "rounded-b-xl";
}

function filterEdgeInputs<T>(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<T>,
  edgeInputParams: Array<T>,
): {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<T>;
} {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  return {
    requiredParamIdsToPaths: Object.fromEntries(
      Object.entries(requiredParamIdsToPaths).filter(
        ([paramId]) => !edgeInputSet.has(paramId as T),
      ),
    ),
    topLevelParamIds: topLevelParamIds.filter(
      (paramId) => !edgeInputSet.has(paramId),
    ),
  };
}

function getEdgeInputPortLabel(
  state: ProjectStateSnapshot,
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
  state: ProjectStateSnapshot,
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

function selectEdgeStripState(
  state: ProjectStateSnapshot,
  sectionId: string,
): EdgeStripState {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const pinned = getCurrShownParamIds(state, sectionId, true, true);
  const unpinned = getCurrShownParamIds(state, sectionId, false, true);
  const filteredPinned = filterEdgeInputs(
    pinned.requiredParamIdsToPaths,
    pinned.topLevelParamIds,
    impl.edgeInputParams,
  );
  const requiredParamIdsToPaths = {
    ...pinned.requiredParamIdsToPaths,
    ...unpinned.requiredParamIdsToPaths,
  };
  return {
    inputPorts: buildEdgeInputPorts(
      state,
      sectionId,
      impl.edgeInputParams,
      requiredParamIdsToPaths,
    ),
    outputPorts: buildEdgeOutputPorts(impl.edgeOutputPorts),
    shouldRoundBottom:
      filteredPinned.topLevelParamIds.length === 0 && impl.hideUnpinnedParams,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    selectedParams: impl.selectedParams ?? [],
    styleColor: impl.styleColor ?? null,
  };
}

function getEdgeStripAppearance({
  hasSectionStyleTheme,
  bgColor,
  isSelectingParams,
  shouldRoundBottom,
  positionAndSizeLocked,
}: {
  hasSectionStyleTheme: boolean;
  bgColor: string;
  isSelectingParams: boolean;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
}): EdgeStripAppearance {
  const handlePreventSectionClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`;
  return {
    handlePreventSectionClassName,
    handleSelectableClassName: isSelectingParams
      ? "arg-edge-handle--selecting"
      : "",
    rowPreventSectionClassName: isSelectingParams
      ? handlePreventSectionClassName
      : "",
    stripBorderColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "border-[color:var(--setta-section-style-border)]",
      "border-white dark:border-setta-700/30",
    ),
    edgeLabelColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "text-[color:var(--setta-section-style-muted-text)]",
      "text-setta-300 dark:text-setta-500",
    ),
    edgeRowHoverClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "hover:bg-[color:var(--setta-section-style-border)]",
      "hover:bg-setta-100/50 hover:dark:bg-setta-800/70",
    ),
    edgeRowSelectedClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]",
      "!bg-blue-700 !text-white active:!bg-cyan-300",
    ),
    edgeRowTextColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "text-[color:var(--setta-section-style-muted-text)]",
      "text-setta-600 dark:text-setta-200",
    ),
    dividerColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "bg-[color:var(--setta-section-style-border)]",
      "bg-setta-200/80 dark:bg-setta-700/60",
    ),
    edgeStripBgColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "bg-[color:var(--setta-section-style-panel-bg)]",
      bgColor,
    ),
    roundedBottomClassName: getRoundedBottomClassName(
      shouldRoundBottom,
      positionAndSizeLocked,
    ),
  };
}

function preventSelectingEdgeMouseDown(
  event: React.MouseEvent<HTMLElement>,
  isSelectingParams: boolean,
) {
  if (!isSelectingParams) {
    return;
  }
  event.stopPropagation();
  event.preventDefault();
}

function toggleSelectedEdgeParam(
  event: React.MouseEvent<HTMLElement>,
  isSelectingParams: boolean,
  sectionId: string,
  paramId: string,
) {
  if (!isSelectingParams) {
    return;
  }
  event.stopPropagation();
  toggleParamSelected(sectionId, paramId);
}

type EdgeInputPortRowProps = {
  port: EdgePortView;
  sectionId: string;
  selected: boolean;
  isSelectingParams: boolean;
  canConnect: boolean;
  appearance: EdgeStripAppearance;
};

function EdgeInputPortRow({
  port,
  sectionId,
  selected,
  isSelectingParams,
  canConnect,
  appearance,
}: EdgeInputPortRowProps) {
  const rowClassName = `relative flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${appearance.edgeRowHoverClassName} ${
    selected
      ? appearance.edgeRowSelectedClassName
      : appearance.edgeRowTextColorClassName
  } ${isSelectingParams ? "cursor-pointer" : ""} ${appearance.rowPreventSectionClassName}`;
  const handleClassName = `arg-edge-handle arg-edge-handle--target ${appearance.handlePreventSectionClassName} ${appearance.handleSelectableClassName}`;

  return (
    <div
      className={rowClassName}
      onMouseDown={(event) =>
        preventSelectingEdgeMouseDown(event, isSelectingParams)
      }
      onClick={(event) =>
        toggleSelectedEdgeParam(event, isSelectingParams, sectionId, port.id)
      }
      data-edge-param-id={port.id}
      data-edge-param-side="in"
    >
      <Handle
        id={port.id}
        type="target"
        position={HandlePosition.Left}
        onConnect={createEdgeFromConnection}
        isValidConnection={isValidDataEdgeConnection}
        isConnectable={canConnect}
        isConnectableStart={canConnect}
        isConnectableEnd={canConnect}
        className={handleClassName}
        onClick={(event) =>
          toggleSelectedEdgeParam(event, isSelectingParams, sectionId, port.id)
        }
      />
      <span className="truncate">{port.label}</span>
    </div>
  );
}

function EdgeOutputPortRow({
  port,
  canConnect,
  appearance,
}: {
  port: EdgePortView;
  canConnect: boolean;
  appearance: EdgeStripAppearance;
}) {
  return (
    <div
      className={`relative flex items-center justify-end gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${appearance.edgeRowTextColorClassName} ${appearance.edgeRowHoverClassName}`}
      data-edge-param-id={port.id}
      data-edge-param-side="out"
    >
      <span className="truncate">{port.label}</span>
      <Handle
        id={port.id}
        type="source"
        position={HandlePosition.Right}
        onConnect={createEdgeFromConnection}
        isValidConnection={isValidDataEdgeConnection}
        isConnectable={canConnect}
        isConnectableStart={canConnect}
        isConnectableEnd={canConnect}
        className={`arg-edge-handle arg-edge-handle--source ${appearance.handlePreventSectionClassName}`}
      />
    </div>
  );
}

function getEdgesStripClassName(
  appearance: EdgeStripAppearance,
  variant: EdgesStripVariant,
) {
  if (variant === "bare-node") {
    return `relative z-0 flex shrink-0 flex-col overflow-visible border-t ${appearance.stripBorderColorClassName} ${appearance.edgeStripBgColorClassName} ${appearance.roundedBottomClassName}`;
  }

  return `section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-visible border-b pt-5 ${appearance.stripBorderColorClassName} ${appearance.edgeStripBgColorClassName} ${appearance.roundedBottomClassName}`;
}

function getEdgesStripGridClassName(variant: EdgesStripVariant) {
  if (variant === "bare-node") {
    return "grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] px-1 py-1";
  }

  return "grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] py-2";
}

export function EdgesStrip({
  sectionId,
  bgColor,
  allowRoundedBottom = true,
  variant = "section-body",
}: {
  sectionId: string;
  bgColor: string;
  allowRoundedBottom?: boolean;
  variant?: EdgesStripVariant;
}) {
  const { canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const lastHeightRef = useRef(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const heightKey = getEdgesStripHeightKey(sectionId);
  const {
    inputPorts,
    outputPorts,
    shouldRoundBottom,
    positionAndSizeLocked,
    selectedParams,
    styleColor,
  } = useProjectState(
    (state) => selectEdgeStripState(state, sectionId),
    _.isEqual,
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const hasEdges = inputPorts.length > 0 || outputPorts.length > 0;
  const selectedParamIdSet = new Set(selectedParams);
  const canConnect = canEditStructure && !isSelectingParams;
  const appearance = getEdgeStripAppearance({
    hasSectionStyleTheme,
    bgColor,
    isSelectingParams,
    shouldRoundBottom: allowRoundedBottom && shouldRoundBottom,
    positionAndSizeLocked,
  });

  useLayoutEffect(() => {
    if (!hasEdges) {
      setMeasuredHeight(null);
      return;
    }
    const element = stripRef.current;
    if (!element) {
      setMeasuredHeight(null);
      return;
    }
    let frameId = 0;

    const updateMeasuredHeight = () => {
      const nextHeight = Math.ceil(element.scrollHeight);
      setMeasuredHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredHeight);
    };

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(element);
    scheduleMeasure();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [hasEdges, inputPorts.length, outputPorts.length]);

  useEffect(() => {
    if (!hasEdges) {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
      return;
    }
    const nextHeight = resolveEdgeStripHeight({
      measuredHeight,
      inputPortCount: inputPorts.length,
      outputPortCount: outputPorts.length,
    });
    if (nextHeight === lastHeightRef.current) {
      return;
    }
    lastHeightRef.current = nextHeight;
    useTemporaryMiscState.setState({ [heightKey]: nextHeight });
  }, [
    hasEdges,
    heightKey,
    inputPorts.length,
    measuredHeight,
    outputPorts.length,
  ]);

  useEffect(() => {
    return () => {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
    };
  }, [heightKey]);

  if (!hasEdges) {
    return null;
  }

  return (
    <section
      className={getEdgesStripClassName(appearance, variant)}
      ref={stripRef}
      data-params-fixed="true"
      data-testid={
        variant === "bare-node"
          ? "bare-section-edge-strip"
          : "section-edge-strip"
      }
    >
      <div className={getEdgesStripGridClassName(variant)}>
        <div className="flex flex-col pl-2">
          <div
            className={`text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            In
          </div>
          <div className="-ml-2 flex flex-col gap-1 pt-1">
            {inputPorts.map((port) => (
              <EdgeInputPortRow
                key={port.id}
                port={port}
                sectionId={sectionId}
                selected={selectedParamIdSet.has(port.id)}
                isSelectingParams={isSelectingParams}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none flex items-stretch justify-center"
          aria-hidden="true"
        >
          <div className={`h-full w-px ${appearance.dividerColorClassName}`} />
        </div>
        <div className="flex flex-col pr-2">
          <div
            className={`text-right text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            Out
          </div>
          <div className="-mr-2 flex flex-col gap-1 pt-1">
            {outputPorts.map((port) => (
              <EdgeOutputPortRow
                key={port.id}
                port={port}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
