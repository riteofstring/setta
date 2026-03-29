import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
  updateShownParamIdsForPinnedParams,
} from "state/actions/sectionInfos";
import { useIsSolelySectionUIActive } from "state/activeSectionUI";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  getKwargsControlsHeightKey,
  getSectionStylePreviewColorKey,
} from "utils/constants";
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
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { shortcutPrettified } from "utils/utils";
import { shallow } from "zustand/shallow";
import { getKwargsControlsContainerClassName } from "./kwargsControlsStyles";

type KwargsControlsProps = {
  sectionId: string;
};

function getDeletableSelectedParamIds(
  state: ZustandProjectState,
  sectionId: string,
  selectedParams: Array<string>,
) {
  return selectedParams.filter((paramId) => {
    const paramImpl = getCurrEffectiveCodeObjImplIfPresent(
      state,
      sectionId,
      paramId,
    );
    if (!paramImpl) {
      return false;
    }
    return isBaseParamCodeObjImpl(paramImpl) && paramImpl.coreNameEditable;
  });
}

export function KwargsControls({ sectionId }: KwargsControlsProps) {
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
  const { callableMissing, isCallableSection, styleColor } = useProjectState(
    (x) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        x,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const isCallableSection = impl.type === SectionTypeEnum.Callable;
      return {
        callableMissing: isCallableSection && impl.callable == null,
        isCallableSection,
        styleColor: impl.styleColor ?? null,
      };
    },
    shallow,
  );
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );
  const controlsContainerClassName = getKwargsControlsContainerClassName({
    hasSectionStyleTheme,
    isCallableSection,
  });
  const argsLabelColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-600/70 dark:text-setta-400/30";
  const argsIconButtonColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]"
    : "text-setta-500 hover:text-blue-500 dark:hover:text-blue-500";
  const argsIconGlyphColorClassName =
    "text-current before:text-current after:text-current";
  const kwargButtonsDisabled =
    variantIsFrozen || callableMissing || !canEditStructure;

  const paramsImpl = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ),
  );
  const { codeObjs, codeObjVariants, codeObjImpls, sectionVariants } =
    useProjectState(
      (state) => ({
        codeObjs: state.codeObjs,
        codeObjVariants: state.codeObjVariants,
        codeObjImpls: state.codeObjImpls,
        sectionVariants: state.sectionVariants,
      }),
      shallow,
    );
  const selectedParams = paramsImpl.selectedParams;
  const edgeInputParams = paramsImpl.edgeInputParams;
  const pinnedParams = paramsImpl.pinnedParams;
  const deletableSelectedParamIds = useMemo(() => {
    return getDeletableSelectedParamIds(
      useProjectState.getState(),
      sectionId,
      selectedParams,
    );
  }, [
    codeObjImpls,
    codeObjVariants,
    codeObjs,
    paramsImpl,
    sectionId,
    sectionVariants,
    selectedParams,
  ]);

  const selectedAreAllEdgeInputs =
    selectedParams.length > 0 &&
    selectedParams.every((paramId) => edgeInputParams.includes(paramId));
  const selectedHasAnyEdgeInputs = selectedParams.some((paramId) =>
    edgeInputParams.includes(paramId),
  );

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

    // If any selected args are currently edge connectors, pin/unpin also converts them
    // back into normal params by removing them from `edgeInputParams`.
    if (!canEditStructure || !selectedHasAnyEdgeInputs) {
      return;
    }
    const nextEdgeInputs = edgeInputParams.filter(
      (paramId) => !selectedParams.includes(paramId),
    );
    if (_.isEqual(nextEdgeInputs, edgeInputParams)) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          { edgeInputParams: nextEdgeInputs },
        );
      },
      send: (frontendOpId) =>
        route_set_section_edge_inputs({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          edgeInputParams: nextEdgeInputs,
          frontendOpId,
        }),
    });
  }

  const canConvertToEdge =
    selectedParams.length > 0 && !variantIsFrozen && canEditStructure;
  const convertToEdgeDisabled = !canConvertToEdge;
  const convertToEdgeAriaLabel = selectedAreAllEdgeInputs
    ? "Convert selected edge args back to params"
    : "Convert to edge connectors";
  const convertToEdgeIconClassName = selectedAreAllEdgeInputs
    ? "gg-unlink"
    : "gg-link";
  let convertToEdgeTooltip = "Convert selected args to edge connectors";
  if (selectedAreAllEdgeInputs) {
    convertToEdgeTooltip = "Convert selected edge args back to params";
    if (canEditLayout) {
      convertToEdgeTooltip = "Move selected edge args back to unpinned";
    }
  }

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
    if (selectedAreAllEdgeInputs) {
      const nextInputs = edgeInputParams.filter(
        (paramId) => !selectedParams.includes(paramId),
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

      // Requested UX: unlinking an edge arg should move it back into the unpinned
      // params list (when allowed).
      if (!canEditLayout) {
        return;
      }
      const nextPinnedParams = pinnedParams.filter(
        (paramId) => !selectedParams.includes(paramId),
      );
      if (_.isEqual(nextPinnedParams, pinnedParams)) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            {
              pinnedParams: nextPinnedParams,
            },
          );
          updateShownParamIdsForPinnedParams(
            state,
            sectionId,
            nextPinnedParams,
          );
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
      <section className={controlsContainerClassName} ref={controlsRef}>
        <article
          className={`flex flex-wrap items-center ${
            isCallableSection ? "py-1" : ""
          }`}
        >
          <section className="ml-1 flex items-center gap-1">
            <h3
              className={`my-auto ml-2 mr-[.1rem] hidden text-xs font-bold uppercase tracking-tighter @[300px]:block ${argsLabelColorClassName}`}
            >
              Args
            </h3>
            <button
              className={`nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`}
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
              <i
                className={`gg-math-minus before:!left-0 ${argsIconGlyphColorClassName}`}
              />
            </button>
            <button
              className={`nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`}
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
              <i
                className={`gg-math-plus !scale-50 ${argsIconGlyphColorClassName}`}
              />
            </button>

            <button
              className={`nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`}
              onClick={onClickPinParam}
              tabIndex={0}
              disabled={pinParamsDisabled}
              aria-label={pinButtonLabel}
              {...getFloatingBoxHandlers({ content: pinButtonLabel })}
            >
              <i
                className={`gg-pin-alt mt-1 !scale-50 ${argsIconGlyphColorClassName}`}
              />
            </button>
            <button
              className={`nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`}
              onClick={onClickConvertToEdgeInputs}
              tabIndex={0}
              disabled={convertToEdgeDisabled}
              aria-disabled={convertToEdgeDisabled}
              aria-label={convertToEdgeAriaLabel}
              {...getFloatingBoxHandlers({ content: convertToEdgeTooltip })}
            >
              <i
                className={`${convertToEdgeIconClassName} !scale-50 ${argsIconGlyphColorClassName}`}
              />
            </button>
            <button
              className={`nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`}
              onClick={onClickDeleteSelectedKwargs}
              tabIndex={0}
              disabled={deleteSelectedDisabled}
              aria-disabled={deleteSelectedDisabled}
              aria-label="Delete selected args"
              {...getFloatingBoxHandlers({ content: "Delete selected args" })}
            >
              <i
                className={`gg-close !scale-50 ${argsIconGlyphColorClassName}`}
              />
            </button>
          </section>
        </article>

        <ParamFilter
          sectionId={sectionId}
          includeCallablePadding={isCallableSection}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </section>
    </>
  );
}

function ParamFilter({
  sectionId,
  includeCallablePadding,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  includeCallablePadding: boolean;
  hasSectionStyleTheme: boolean;
}) {
  const paramsImpl = useProjectState((x) =>
    getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    ),
  );
  const paramFilterValue = paramsImpl.paramFilter;
  const sectionIsActive = useIsSolelySectionUIActive(sectionId);

  const searchShortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.searchShortcut),
  );
  const sortIconColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 dark:text-setta-600";
  const inputColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-text)] placeholder-[color:var(--setta-section-style-muted-text)] focus-visible:border-[color:var(--setta-section-style-outline)]"
    : "text-setta-700 placeholder-setta-400 focus-visible:border-blue-300 dark:text-setta-300";

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
      <i className={`gg-sort-az -mr-2 ${sortIconColorClassName}`} />
      <input
        id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
        value={paramFilterValue}
        className={`min-w-0 flex-1 cursor-auto truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs outline-0 [border-width:0_0_1px_0] ${inputColorClassName}`}
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
