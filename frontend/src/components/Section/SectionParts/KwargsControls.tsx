import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_add_kwarg,
  route_delete_kwarg,
  route_set_section_edge_inputs,
  route_set_section_param_filter,
  route_set_section_pinned_params,
} from "utils/generatedEndpoints";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { shortcutPrettified } from "utils/utils";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";

type KwargsControlsProps = {
  sectionId: string;
  bgColor?: string;
};

export function KwargsControls({
  sectionId,
  bgColor = "bg-transparent",
}: KwargsControlsProps) {
  // const variantIsFrozen = useSectionVariantIsFrozen(sectionId);
  const variantIsFrozen = false;
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const callableMissing = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    if (impl.type !== SectionTypeEnum.Callable) {
      return false;
    }
    return impl.callable == null;
  }, _.isEqual);
  const kwargButtonsDisabled =
    variantIsFrozen || callableMissing || !canEditStructure;

  const onClickDeleteSelectedKwargs = () => {};

  const { selectedParams, edgeInputParams, pinnedParams } = useProjectState(
    (x) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        x,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      return {
        selectedParams: impl.selectedParams,
        edgeInputParams: impl.edgeInputParams,
        pinnedParams: impl.pinnedParams,
      };
    },
    _.isEqual,
  );

  const canPinParams =
    selectedParams.length > 0 && !variantIsFrozen && canEditLayout;
  const pinParamsDisabled = !canPinParams;

  function onClickPinParam() {
    if (!canPinParams) {
      return;
    }
    const nextPinnedParams = Array.from(
      new Set([...pinnedParams, ...selectedParams]),
    );
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          {
            pinnedParams: nextPinnedParams,
          },
        );
      },
      send: (frontendOpId) =>
        route_set_section_pinned_params({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          pinnedParams: nextPinnedParams,
          frontendOpId,
        }),
    });
  }

  const canConvertToEdge =
    selectedParams.length > 0 && !variantIsFrozen && canEditStructure;
  const convertToEdgeDisabled = !canConvertToEdge;

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
      send: (frontendOpId) =>
        route_set_section_edge_inputs({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          edgeInputParams: nextInputs,
          frontendOpId,
        }),
    });
  }

  return (
    <>
      <section
        className={`section-args z-10 mt-1 flex min-w-0 flex-wrap rounded-xl border-b border-solid  border-white px-1 pb-1 shadow-sm @container dark:border-setta-700 ${bgColor}`}
      >
        <article className="flex flex-wrap items-center">
          <section className="ml-1 flex items-center gap-1">
            <h3 className="hidden @[300px]:block my-auto ml-2 mr-[.1rem] text-xs font-bold uppercase tracking-tighter text-setta-600/70 dark:text-setta-400/30">
              Args
            </h3>
            <button
              className="focus-visible:ring-2 flex h-[18px] w-[18px] nodrag cursor-pointer bg-transparent text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 rounded-full items-center justify-center"
              onClick={() =>
                route_delete_kwarg({
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                })
              }
              tabIndex={0}
              disabled={kwargButtonsDisabled}
              aria-label="Remove arg"
              {...getFloatingBoxHandlers({ content: "Remove arg" })}
            >
              <i className="gg-math-minus before:!left-0 " />
            </button>
            <button
              className="focus-visible:ring-2 flex h-[18px] w-[18px] nodrag cursor-pointer bg-transparent text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 rounded-full items-center justify-center"
              onClick={() =>
                route_add_kwarg({
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                })
              }
              tabIndex={0}
              disabled={kwargButtonsDisabled}
              aria-label="Add arg"
              {...getFloatingBoxHandlers({ content: "Add arg" })}
            >
              <i className="gg-math-plus !scale-50" />
            </button>

            <button
              className="focus-visible:ring-2 flex h-[18px] w-[18px] nodrag cursor-pointer bg-transparent text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 rounded-full items-center justify-center"
              onClick={onClickPinParam}
              tabIndex={0}
              disabled={pinParamsDisabled}
              aria-label="Pin selected args"
              {...getFloatingBoxHandlers({ content: "Pin selected args" })}
            >
              <i className="gg-pin-alt mt-1 !scale-50" />
            </button>
            <button
              className="focus-visible:ring-2 flex h-[18px] w-[18px] nodrag cursor-pointer bg-transparent text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 rounded-full items-center justify-center"
              onClick={onClickConvertToEdgeInputs}
              tabIndex={0}
              aria-disabled={convertToEdgeDisabled}
              aria-label="Convert to edge connectors"
              {...getFloatingBoxHandlers({
                content: "Convert selected args to edge connectors",
              })}
            >
              <i className="gg-link !scale-50" />
            </button>
            <button
              className="focus-visible:ring-2 flex h-[18px] w-[18px] nodrag cursor-pointer bg-transparent text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 rounded-full items-center justify-center"
              onClick={onClickDeleteSelectedKwargs}
              tabIndex={0}
              disabled={variantIsFrozen}
              aria-label="Delete selected args"
              {...getFloatingBoxHandlers({ content: "Delete selected args" })}
            >
              <i className="gg-close !scale-50" />
            </button>
          </section>
        </article>

        <ParamFilter sectionId={sectionId} />
      </section>
    </>
  );
}

function ParamFilter({ sectionId }: { sectionId: string }) {
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
    <search className="nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center ">
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
