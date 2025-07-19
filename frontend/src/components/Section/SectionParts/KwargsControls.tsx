import _ from "lodash";
import { deleteCodeInfo } from "state/actions/codeInfo";
import {
  addKwarg,
  deleteLastKwarg,
  deleteSelectedKwargs,
  getAllSelectedParamIds,
  pinSelectedKwargs,
} from "state/actions/kwargs";
import {
  getEffectiveSectionImpl,
  getSectionVariant,
  setEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useProjectState, useSettings } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { shortcutPrettified } from "utils/utils";

export function KwargsControls({
  sectionId,
  objInfoId,
  bgColor = "bg-transparent",
}) {
  // const variantIsFrozen = useSectionVariantIsFrozen(sectionId);
  const variantIsFrozen = false;

  const onClickAddKwarg = onClickAddKwargFn(sectionId, objInfoId);
  const onClickDeleteKwarg = onClickDeleteKwargFn(sectionId, objInfoId);

  const onClickDeleteSelectedKwargs = () => {
    deleteSelectedKwargs(sectionId);
    maybeIncrementProjectStateVersion(true);
  };

  function onClickPinParam() {
    pinSelectedKwargs(sectionId);
    maybeIncrementProjectStateVersion(true);
  }

  const classes =
    "focus-visible:ring-2 flex nodrag cursor-pointer bg-transparent  text-setta-500 hover:text-blue-500 dark:hover:text-blue-500 w-[18px] rounded-full items-center justify-center";

  return (
    <>
      <section
        className={`section-args z-10 mt-1 flex min-w-0 flex-wrap rounded-xl border-b border-solid  border-white px-1 pb-1 shadow-sm @container dark:border-setta-700 ${bgColor}`}
      >
        <article className="flex flex-wrap items-center">
          <section className="ml-1 flex">
            {/* <h3 className=" my-auto ml-2 mr-[.1rem]  text-xs font-bold uppercase tracking-tighter text-setta-600/70  dark:text-setta-400/30 ">
              Args
            </h3> */}

            {/* <button
              className={classes}
              onClick={onClickDeleteKwarg}
              tabIndex={0}
              disabled={variantIsFrozen}
            >
              <i className="gg-math-minus before:!left-0 " />
            </button> */}
            {/* <button
              className={classes}
              onClick={onClickAddKwarg}
              tabIndex={0}
              disabled={variantIsFrozen}
            >
              <i className="gg-math-plus !scale-50" />
            </button> */}

            {/* <button className={classes} onClick={onClickPinParam} tabIndex={0}>
              <i className="gg-pin-alt mt-1 !scale-50" />
            </button> */}
            {/* <button
              className={classes}
              onClick={onClickDeleteSelectedKwargs}
              tabIndex={0}
              disabled={variantIsFrozen}
            >
              <i className="gg-close !scale-50" />
            </button> */}
          </section>
        </article>

        <ParamFilter sectionId={sectionId} />
      </section>
    </>
  );
}

function ParamFilter({ sectionId }) {
  const { paramFilterValue, sectionIsActive } = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (!isBaseSectionWithParamsImpl(impl)) {
      throw new Error();
    }
    return {
      paramFilterValue: impl.paramFilter,
      sectionIsActive: _.isEqual(x.activeIds, [sectionId]),
    };
  }, _.isEqual);

  const searchShortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.searchShortcut),
  );

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    useProjectState.setState((state) => {
      setEffectiveSectionImplValue<"BaseSectionWithParams">(state, sectionId, {
        paramFilter: e.target.value,
      });
    });
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

function onClickAddKwargFn(sectionId, objInfoId) {
  return () => {
    useProjectState.setState((state) => {
      function callbackFn({ sectionId, parentId, idx, state }) {
        addKwarg({ sectionId, parentId, insertIdx: idx + 1, state });
      }

      const paramsAreSelected = helperForAddDeleteKwarg(
        sectionId,
        state,
        callbackFn,
      );
      if (!paramsAreSelected) {
        addKwarg({ sectionId, parentId: objInfoId, state });
      }
    });

    maybeIncrementProjectStateVersion(true);
  };
}

function onClickDeleteKwargFn(sectionId, objInfoId) {
  return () => {
    useProjectState.setState((state) => {
      let kwargIds = [];

      function callbackFn({ codeInfoChildren, parentId, idx }) {
        if (parentId) {
          kwargIds.push(codeInfoChildren[parentId][idx + 1]);
        }
      }

      const paramsAreSelected = helperForAddDeleteKwarg(
        sectionId,
        state,
        callbackFn,
      );
      if (paramsAreSelected) {
        deleteCodeInfo(sectionId, kwargIds, state);
      } else {
        deleteLastKwarg({
          sectionId,
          parentId: objInfoId,
          state,
        });
      }
    });

    maybeIncrementProjectStateVersion(true);
  };
}

function helperForAddDeleteKwarg(sectionId, state, callbackFn) {
  const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, state);
  if (selectedParamIds.length > 0) {
    const { codeInfoColId } = getSectionVariant(sectionId, state);
    const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
    for (const p of selectedParamIds) {
      let parentId, idx;
      for (const [id, children] of Object.entries(codeInfoChildren)) {
        if (children.includes(p)) {
          parentId = id;
          idx = children.indexOf(p);
          break;
        }
      }
      callbackFn({ codeInfoChildren, sectionId, parentId, idx, state });
    }
    return true;
  }
  return false;
}
