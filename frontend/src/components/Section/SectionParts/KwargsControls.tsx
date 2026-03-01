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
  useLocalStorage,
  useProjectState,
  useSettings,
  useTemporaryMiscState,
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

type KwargsControlsProps = {
  sectionId: string;
};

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
    _.isEqual,
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
  const argsBgColorClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-bg)]"
    : "";
  const argsBorderColorClassName = hasSectionStyleTheme
    ? "border-[color:var(--setta-section-style-border)]"
    : "border-white dark:border-setta-700";
  const argsLabelColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-600/70 dark:text-setta-400/30";
  const argsIconButtonColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]"
    : "text-setta-500 hover:text-blue-500 dark:hover:text-blue-500";
  const argsIconGlyphColorClassName =
    "text-current before:text-current after:text-current";
  const argsIconButtonBaseClassName = `nodrag flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:ring-2 ${argsIconButtonColorClassName}`;
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
    <section
      className={`section-args z-10 ${
        isCallableSection ? "mt-0 pb-0" : "mt-1 pb-1"
      } flex min-w-0 flex-wrap rounded-xl border-b border-solid px-1 shadow-sm @container ${argsBgColorClassName} ${argsBorderColorClassName}`}
      ref={controlsRef}
    >
      <section
        className={`ml-1 flex flex-wrap items-center gap-1 ${
          isCallableSection ? "py-1" : ""
        }`}
      >
        <h3
          className={`my-auto ml-2 mr-[.1rem] hidden text-xs font-bold uppercase tracking-tighter @[300px]:block ${argsLabelColorClassName}`}
        >
          Args
        </h3>
        <button
          className={`${argsIconButtonBaseClassName} gg-math-minus before:!left-0 ${argsIconGlyphColorClassName}`}
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
        />
        <button
          className={`${argsIconButtonBaseClassName} gg-math-plus ${argsIconGlyphColorClassName}`}
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
        />

        <button
          className={`${argsIconButtonBaseClassName} gg-pin-alt mt-1 !scale-50 ${argsIconGlyphColorClassName}`}
          onClick={onClickPinParam}
          tabIndex={0}
          disabled={pinParamsDisabled}
          aria-label={pinButtonLabel}
          {...getFloatingBoxHandlers({ content: pinButtonLabel })}
        />
        <button
          className={`${argsIconButtonBaseClassName} ${convertToEdgeIconClassName} !scale-50 ${argsIconGlyphColorClassName}`}
          onClick={onClickConvertToEdgeInputs}
          tabIndex={0}
          disabled={convertToEdgeDisabled}
          aria-disabled={convertToEdgeDisabled}
          aria-label={convertToEdgeAriaLabel}
          {...getFloatingBoxHandlers({ content: convertToEdgeTooltip })}
        />
        <button
          className={`${argsIconButtonBaseClassName} gg-close !scale-50 ${argsIconGlyphColorClassName}`}
          onClick={onClickDeleteSelectedKwargs}
          tabIndex={0}
          disabled={deleteSelectedDisabled}
          aria-disabled={deleteSelectedDisabled}
          aria-label="Delete selected args"
          {...getFloatingBoxHandlers({ content: "Delete selected args" })}
        />
      </section>

      <ParamFilter
        sectionId={sectionId}
        includeCallablePadding={isCallableSection}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    </section>
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
      data-param-filter-icon-host="true"
      className={`nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center bg-[linear-gradient(currentColor,currentColor)] bg-[length:8px_2px] bg-[position:0.35rem_center] bg-no-repeat before:pointer-events-none before:absolute before:left-[0.15rem] before:top-1/2 before:h-[2px] before:w-[12px] before:-translate-y-[4px] before:rounded-[4px] before:bg-current before:content-[''] after:pointer-events-none after:absolute after:left-[0.55rem] after:top-1/2 after:h-[2px] after:w-[4px] after:translate-y-[4px] after:rounded-[4px] after:bg-current after:content-[''] ${sortIconColorClassName} ${
        includeCallablePadding ? "py-1" : ""
      }`}
    >
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
