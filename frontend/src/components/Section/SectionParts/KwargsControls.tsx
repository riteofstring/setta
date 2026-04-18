import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import {
  isCanvasOwnedSectionArgsLabelRestingText,
  isCanvasOwnedSectionLightweightParamFilter,
  isCanvasOwnedSectionParamFilterIcon,
  isCanvasOwnedSectionParamFilterUnderline,
  isCanvasOwnedSectionShell,
} from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import _ from "lodash";
import { addKwarg, deleteKwarg, deleteSelectedParams, setSectionEdgeInputs, setSectionParamFilter, setSectionPinnedParams } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
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
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { shortcutPrettified } from "utils/utils";
import { shallow } from "zustand/shallow";
import { CanvasOwnedParamFilterActivator } from "./CanvasOwnedParamFilterActivator";
import { KwargsActionIconButton } from "./KwargsActionIconButton";
import {
  getKwargsControlsActionState,
  getKwargsControlsThemeState,
} from "./kwargsControlsState";
type KwargsControlsProps = {
  sectionId: string;
};

function getCanvasOwnedCallableToolbarStyle(
  canvasOwnedCallableToolbar: boolean,
): CSSProperties | undefined {
  if (!canvasOwnedCallableToolbar) {
    return undefined;
  }

  return {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
  };
}

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
  const heightKey = getKwargsControlsHeightKey(sectionId);
  useKwargsControlsHeightMeasurement(controlsRef, heightKey);
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
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
  const {
    hasSectionStyleTheme,
    controlsContainerClassName,
    argsLabelColorClassName,
    argsIconButtonColorClassName,
  } = getKwargsControlsThemeState({
    resolvedStyleColor,
    darkMode,
    isCallableSection,
  });
  const canvasOwnedCallableToolbar =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionShell(sectionId);
  const canvasOwnedArgsLabel =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionArgsLabelRestingText(sectionId);
  const canvasOwnedLightweightActionButtons =
    graphSurfaceImplementation === "canvas-shell-underlay";
  const argsIconGlyphColorClassName =
    "text-current before:text-current after:text-current";
  const argsIconButtonClassName =
    `nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`.trim();
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
  const {
    selectedAreAllEdgeInputs,
    selectedHasAnyEdgeInputs,
    shouldUnpinSelected,
    canPinParams,
    pinParamsDisabled,
    canConvertToEdge,
    convertToEdgeDisabled,
    convertToEdgeAriaLabel,
    convertToEdgeIconClassName,
    convertToEdgeTooltip,
    deleteSelectedDisabled,
  } = getKwargsControlsActionState({
    selectedParams,
    edgeInputParams,
    pinnedParams,
    deletableSelectedParamIds,
    canEditLayout,
    canEditStructure,
    variantIsFrozen,
  });
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
        const res = callOpenAPI(
          setSectionPinnedParams({ body: payload } as Parameters<
            typeof setSectionPinnedParams
          >[0]),
        );
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
        callOpenAPI(
          setSectionEdgeInputs({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              edgeInputParams: nextEdgeInputs,
              frontendOpId,
            },
          } as Parameters<typeof setSectionEdgeInputs>[0]),
        ),
    });
  }
  function onClickDeleteSelectedKwargs() {
    if (deleteSelectedDisabled) {
      return;
    }
    const payload = {
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoIds: deletableSelectedParamIds,
    };
    void callOpenAPI(
      deleteSelectedParams({ body: payload } as Parameters<
        typeof deleteSelectedParams
      >[0]),
    );
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
          const res = callOpenAPI(
            setSectionEdgeInputs({ body: payload } as Parameters<
              typeof setSectionEdgeInputs
            >[0]),
          );
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
          const res = callOpenAPI(
            setSectionPinnedParams({ body: payload } as Parameters<
              typeof setSectionPinnedParams
            >[0]),
          );
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
        const res = callOpenAPI(
          setSectionEdgeInputs({ body: payload } as Parameters<
            typeof setSectionEdgeInputs
          >[0]),
        );
        return res;
      },
    });
  }
  return (
    <>
      <section
        className={controlsContainerClassName}
        data-canvas-owned-callable-toolbar={
          canvasOwnedCallableToolbar ? "true" : undefined
        }
        ref={controlsRef}
        style={getCanvasOwnedCallableToolbarStyle(canvasOwnedCallableToolbar)}
      >
        <article
          className={`flex flex-wrap items-center ${isCallableSection ? "py-1" : ""}`}
        >
          <section className="ml-1 flex items-center gap-1">
            <h3
              className={`my-auto ml-2 mr-[.1rem] hidden text-xs font-bold uppercase tracking-tighter @[300px]:block ${argsLabelColorClassName} ${canvasOwnedArgsLabel ? "opacity-0" : ""}`}
              data-canvas-owned-resting-text={
                canvasOwnedArgsLabel ? "true" : undefined
              }
            >
              Args
            </h3>
            <KwargsActionIconButton
              ariaLabel="Remove arg"
              className={argsIconButtonClassName}
              disabled={kwargButtonsDisabled}
              iconClassName={`gg-math-minus before:!left-0 ${argsIconGlyphColorClassName}`}
              lightweightActivator={canvasOwnedLightweightActionButtons}
              onActivate={() => {
                const payload = {
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                };
                void callOpenAPI(
                  deleteKwarg({ body: payload } as Parameters<
                    typeof deleteKwarg
                  >[0]),
                );
              }}
              tooltipContent="Remove arg"
            />
            <KwargsActionIconButton
              ariaLabel="Add arg"
              className={argsIconButtonClassName}
              disabled={kwargButtonsDisabled}
              iconClassName={`gg-math-plus !scale-50 ${argsIconGlyphColorClassName}`}
              lightweightActivator={canvasOwnedLightweightActionButtons}
              onActivate={() => {
                const payload = {
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                };
                void callOpenAPI(
                  addKwarg({ body: payload } as Parameters<typeof addKwarg>[0]),
                );
              }}
              tooltipContent="Add arg"
            />

            <KwargsActionIconButton
              ariaLabel={pinButtonLabel}
              className={argsIconButtonClassName}
              disabled={pinParamsDisabled}
              iconClassName={`gg-pin-alt mt-1 !scale-50 ${argsIconGlyphColorClassName}`}
              lightweightActivator={canvasOwnedLightweightActionButtons}
              onActivate={onClickPinParam}
              tooltipContent={pinButtonLabel}
            />
            <KwargsActionIconButton
              ariaLabel={convertToEdgeAriaLabel}
              className={argsIconButtonClassName}
              disabled={convertToEdgeDisabled}
              iconClassName={`${convertToEdgeIconClassName} !scale-50 ${argsIconGlyphColorClassName}`}
              lightweightActivator={canvasOwnedLightweightActionButtons}
              onActivate={onClickConvertToEdgeInputs}
              tooltipContent={convertToEdgeTooltip}
            />
            <KwargsActionIconButton
              ariaLabel="Delete selected args"
              className={argsIconButtonClassName}
              disabled={deleteSelectedDisabled}
              iconClassName={`gg-close !scale-50 ${argsIconGlyphColorClassName}`}
              lightweightActivator={canvasOwnedLightweightActionButtons}
              onActivate={onClickDeleteSelectedKwargs}
              tooltipContent="Delete selected args"
            />
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
  const inputTextColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-text)] placeholder-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-700 placeholder-setta-400 dark:text-setta-300";
  const inputFocusUnderlineClassName = hasSectionStyleTheme
    ? "focus-visible:border-[color:var(--setta-section-style-outline)]"
    : "focus-visible:border-blue-300 dark:focus-visible:border-blue-400/50";
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const canvasOwnedFilterIcon =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionParamFilterIcon(sectionId);
  const canvasOwnedFilterUnderline =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionParamFilterUnderline(sectionId);
  const canvasOwnedLightweightFilter =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionLightweightParamFilter(sectionId);
  const filterBaseClassName =
    `peer/dictfilter min-w-0 w-full truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs outline-0 [border-width:0_0_1px_0] ${inputTextColorClassName}`.trim();
  const filterInputClassName =
    `${filterBaseClassName} cursor-auto ${canvasOwnedFilterUnderline ? "border-b-transparent" : inputFocusUnderlineClassName}`.trim();
  const filterActivatorClassName =
    `${filterBaseClassName} flex items-center cursor-text ${canvasOwnedFilterUnderline ? "border-b-transparent" : inputFocusUnderlineClassName}`.trim();
  const filterPlaceholderClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-400 dark:text-setta-600";
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
      className={`nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center ${includeCallablePadding ? "py-1" : ""}`}
    >
      <i
        className={`gg-sort-az -mr-2 ${sortIconColorClassName} ${canvasOwnedFilterIcon ? "opacity-0" : ""}`}
        data-canvas-owned-filter-icon={
          canvasOwnedFilterIcon ? "true" : undefined
        }
      />
      <span className="relative min-w-0 flex-1">
        {canvasOwnedLightweightFilter ? (
          <CanvasOwnedParamFilterActivator
            activatorClassName={filterActivatorClassName}
            id={`${sectionId}-args-filter`}
            inputClassName={filterInputClassName}
            onChange={onSearchChange}
            placeholder={sectionIsActive ? searchShortcut : "Filter"}
            placeholderClassName={filterPlaceholderClassName}
            value={paramFilterValue}
          />
        ) : (
          <input
            id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
            value={paramFilterValue}
            className={filterInputClassName}
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
        )}
        {canvasOwnedFilterUnderline ? (
          <span
            className={`pointer-events-none absolute bottom-0 left-0 right-0 border-b border-setta-200/50 opacity-0 dark:border-setta-600/30 ${hasSectionStyleTheme ? "peer-focus-visible/dictfilter:border-[color:var(--setta-section-style-outline)]" : "peer-focus-visible/dictfilter:border-blue-300 dark:peer-focus-visible/dictfilter:border-blue-400/50"} peer-focus-visible/dictfilter:opacity-100`}
            data-canvas-owned-underline="true"
          />
        ) : null}
      </span>
    </search>
  );
}

function useKwargsControlsHeightMeasurement(
  controlsRef: React.RefObject<HTMLElement | null>,
  heightKey: string,
) {
  const lastMeasuredHeightRef = useRef<number | null>(null);

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
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
      lastMeasuredHeightRef.current = null;
      useTemporaryMiscState.setState({ [heightKey]: 0 });
    };
  }, [controlsRef, heightKey]);
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
      callOpenAPI(
        setSectionParamFilter({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            value,
            frontendOpId,
          },
        } as Parameters<typeof setSectionParamFilter>[0]),
      ),
  });
}, 200);
