import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useLayoutEffect, useRef } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
  updateShownParamIdsForPinnedParams,
} from "state/actions/sectionInfos";
import {
  useProjectState,
  useSettings,
  useTemporaryMiscState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { getKwargsControlsHeightKey } from "utils/constants";
import {
  route_add_kwarg,
  route_delete_kwarg,
  route_delete_selected_params,
  route_set_section_edge_inputs,
  route_set_section_param_filter,
  route_set_section_pinned_params,
} from "utils/generatedEndpoints";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { shortcutPrettified } from "utils/utils";

type KwargsControlsProps = {
  sectionId: string;
  bgColor?: string;
};

export function KwargsControls({
  sectionId,
  bgColor = "bg-transparent",
}: KwargsControlsProps) {
  const controlsRef = useRef<HTMLElement | null>(null);
  const lastMeasuredHeightRef = useRef<number | null>(null);
  const heightKey = getKwargsControlsHeightKey(sectionId);

  useLayoutEffect(() => {
    const node = controlsRef.current;
    if (!node) {
      lastMeasuredHeightRef.current = null;
      useTemporaryMiscState.setState({ [heightKey]: 0 });
      return;
    }
    const updateHeight = () => {
      const style = window.getComputedStyle(node);
      const marginHeight =
        (Number.parseFloat(style.marginTop) || 0) +
        (Number.parseFloat(style.marginBottom) || 0);
      const measuredHeight = node.offsetHeight + marginHeight;
      const nextHeight = Math.ceil(measuredHeight);
      if (lastMeasuredHeightRef.current === nextHeight) {
        return;
      }
      lastMeasuredHeightRef.current = nextHeight;
      useTemporaryMiscState.setState({
        [heightKey]: nextHeight > 0 ? nextHeight : 0,
      });
    };
    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      lastMeasuredHeightRef.current = null;
      useTemporaryMiscState.setState({ [heightKey]: 0 });
    };
  }, [heightKey]);

  // const variantIsFrozen = useSectionVariantIsFrozen(sectionId);
  const variantIsFrozen = false;
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const { callableMissing, isCallableSection } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const isCallableSection = impl.type === SectionTypeEnum.Callable;
    return {
      callableMissing: isCallableSection && impl.callable == null,
      isCallableSection,
    };
  }, _.isEqual);
  const kwargButtonsDisabled =
    variantIsFrozen || callableMissing || !canEditStructure;

  const {
    selectedParams,
    edgeInputParams,
    pinnedParams,
    deletableSelectedParamIds,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const deletableSelectedParamIds = impl.selectedParams.filter((paramId) => {
      const paramImpl = getCurrEffectiveCodeObjImpl(x, sectionId, paramId);
      return isBaseParamCodeObjImpl(paramImpl) && paramImpl.coreNameEditable;
    });
    return {
      selectedParams: impl.selectedParams,
      edgeInputParams: impl.edgeInputParams,
      pinnedParams: impl.pinnedParams,
      deletableSelectedParamIds,
    };
  }, _.isEqual);

  const canPinParams =
    selectedParams.length > 0 && !variantIsFrozen && canEditLayout;
  const pinParamsDisabled = !canPinParams;
  const shouldUnpinSelected =
    selectedParams.length > 0 &&
    selectedParams.every((paramId) => pinnedParams.includes(paramId));
  const pinButtonLabel = shouldUnpinSelected
    ? "Unpin selected args"
    : "Pin selected args";

  function onClickPinParam() {
    if (!canPinParams) {
      return;
    }
    const nextPinnedParams = shouldUnpinSelected
      ? pinnedParams.filter((paramId) => !selectedParams.includes(paramId))
      : Array.from(new Set([...pinnedParams, ...selectedParams]));
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          {
            pinnedParams: nextPinnedParams,
          },
        );
        updateShownParamIdsForPinnedParams(state, sectionId, nextPinnedParams);
      },
      send: (frontendOpId) => {
        const payload = {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          pinnedParams: nextPinnedParams,
          frontendOpId,
        };
        const res = route_set_section_pinned_params(payload);
        return res;
      },
    });
  }

  const canConvertToEdge =
    selectedParams.length > 0 && !variantIsFrozen && canEditStructure;
  const convertToEdgeDisabled = !canConvertToEdge;

  const canDeleteSelected =
    deletableSelectedParamIds.length > 0 &&
    !variantIsFrozen &&
    canEditStructure;
  const deleteSelectedDisabled = !canDeleteSelected;

  function onClickDeleteSelectedKwargs() {
    if (!canDeleteSelected) {
      return;
    }
    const payload = {
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoIds: deletableSelectedParamIds,
    };
    void route_delete_selected_params(payload);
  }

  function onClickConvertToEdgeInputs() {
    if (!canConvertToEdge) {
      return;
    }
    const nextInputs = Array.from(
      new Set([...edgeInputParams, ...selectedParams]),
    );
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          {
            edgeInputParams: nextInputs,
          },
        );
      },
      send: (frontendOpId) => {
        const payload = {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          edgeInputParams: nextInputs,
          frontendOpId,
        };
        const res = route_set_section_edge_inputs(payload);
        return res;
      },
    });
  }

  return (
    <>
      <section
        className={`section-args z-10 ${
          isCallableSection ? "mt-0 pb-0" : "mt-1 pb-1"
        } flex min-w-0 flex-wrap rounded-xl border-b border-solid border-white px-1 shadow-sm @container dark:border-setta-700 ${bgColor}`}
        ref={controlsRef}
      >
        <article
          className={`flex flex-wrap items-center ${
            isCallableSection ? "py-1" : ""
          }`}
        >
          <section className="ml-1 flex items-center gap-1">
            <h3 className="my-auto ml-2 mr-[.1rem] hidden text-xs font-bold uppercase tracking-tighter text-setta-600/70 @[300px]:block dark:text-setta-400/30">
              Args
            </h3>
            <button
              className="nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 hover:text-blue-500 focus-visible:ring-2 dark:hover:text-blue-500"
              onClick={() => {
                const payload = {
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                };
                void route_delete_kwarg(payload);
              }}
              tabIndex={0}
              disabled={kwargButtonsDisabled}
              aria-label="Remove arg"
              {...getFloatingBoxHandlers({ content: "Remove arg" })}
            >
              <i className="gg-math-minus before:!left-0 " />
            </button>
            <button
              className="nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 hover:text-blue-500 focus-visible:ring-2 dark:hover:text-blue-500"
              onClick={() => {
                const payload = {
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                };
                void route_add_kwarg(payload);
              }}
              tabIndex={0}
              disabled={kwargButtonsDisabled}
              aria-label="Add arg"
              {...getFloatingBoxHandlers({ content: "Add arg" })}
            >
              <i className="gg-math-plus !scale-50" />
            </button>

            <button
              className="nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 hover:text-blue-500 focus-visible:ring-2 dark:hover:text-blue-500"
              onClick={onClickPinParam}
              tabIndex={0}
              disabled={pinParamsDisabled}
              aria-label={pinButtonLabel}
              {...getFloatingBoxHandlers({ content: pinButtonLabel })}
            >
              <i className="gg-pin-alt mt-1 !scale-50" />
            </button>
            <button
              className="nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 hover:text-blue-500 focus-visible:ring-2 dark:hover:text-blue-500"
              onClick={onClickConvertToEdgeInputs}
              tabIndex={0}
              disabled={convertToEdgeDisabled}
              aria-disabled={convertToEdgeDisabled}
              aria-label="Convert to edge connectors"
              {...getFloatingBoxHandlers({
                content: "Convert selected args to edge connectors",
              })}
            >
              <i className="gg-link !scale-50" />
            </button>
            <button
              className="nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 hover:text-blue-500 focus-visible:ring-2 dark:hover:text-blue-500"
              onClick={onClickDeleteSelectedKwargs}
              tabIndex={0}
              disabled={deleteSelectedDisabled}
              aria-disabled={deleteSelectedDisabled}
              aria-label="Delete selected args"
              {...getFloatingBoxHandlers({ content: "Delete selected args" })}
            >
              <i className="gg-close !scale-50" />
            </button>
          </section>
        </article>

        <ParamFilter
          sectionId={sectionId}
          includeCallablePadding={isCallableSection}
        />
      </section>
    </>
  );
}

function ParamFilter({
  sectionId,
  includeCallablePadding,
}: {
  sectionId: string;
  includeCallablePadding: boolean;
}) {
  const { paramFilterValue, sectionIsActive } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return {
      paramFilterValue: impl.paramFilter,
      sectionIsActive: _.isEqual(x.projectConfig.activeIds, [sectionId]),
    };
  }, _.isEqual);

  const searchShortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.searchShortcut),
  );

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          paramFilter: e.target.value,
        },
      );
    });
    debouncedSetSectionParamFilter(sectionId, e.target.value);
  }

  return (
    <search
      className={`nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center ${
        includeCallablePadding ? "py-1" : ""
      }`}
    >
      <i className="gg-sort-az -mr-2 text-setta-300 dark:text-setta-600" />
      <input
        id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
        value={paramFilterValue}
        className="min-w-0 flex-1 cursor-auto truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs text-setta-700 placeholder-setta-400  outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300"
        placeholder={`${sectionIsActive ? searchShortcut : "Filter"}`}
        tabIndex={0}
        onChange={onSearchChange}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            e.currentTarget.blur();
            // focusOnSection(null, sectionId, false);
          }
        }}
      />
    </search>
  );
}

const debouncedSetSectionParamFilter = _.debounce((sectionId, value) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          paramFilter: value,
        },
      );
    },
    send: (frontendOpId) =>
      route_set_section_param_filter({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        value,
        frontendOpId,
      }),
  });
}, 200);
