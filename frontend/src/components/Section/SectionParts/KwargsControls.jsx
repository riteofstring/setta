import _ from "lodash";
import {
  addKwarg,
  deleteKwarg,
  deleteSelectedKwargs,
  pinSelectedKwargs,
} from "state/actions/kwargs/kwargs";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import {
  useActiveSection,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import { shortcutPrettified } from "utils/utils";
import { getAllSelectedParams } from "../../../state/actions/kwargs/utils";

export function KwargsControls({
  sectionId,
  objInfoId,
  bgColor = "bg-transparent",
}) {
  const paramFilterValue = useSectionInfos((x) => x.x[sectionId].paramFilter);
  const variantIsDisabled = useSectionVariantIsFrozen(sectionId);

  const sectionIsActive = useActiveSection((x) =>
    _.isEqual(x.ids, [sectionId]),
  );
  const searchShortcut = useSettings((x) =>
    shortcutPrettified(x.searchShortcut),
  );
  const onClickAddKwarg = onClickAddKwargFn(sectionId, objInfoId);
  const onClickDeleteKwarg = onClickDeleteKwargFn(sectionId, objInfoId);
  function onSearchChange(e) {
    useSectionInfos.setState((state) => {
      state.x[sectionId].paramFilter = e.target.value;
    });
  }

  const onClickDeleteSelectedKwargs = () => {
    deleteSelectedKwargs({ sectionId, parentId: objInfoId });
  };

  function onClickPinParam() {
    pinSelectedKwargs(sectionId);
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

            <button
              className={classes}
              onClick={onClickDeleteKwarg}
              tabIndex="0"
              disabled={variantIsDisabled}
            >
              <i className="gg-math-minus before:!left-0 " />
            </button>
            <button
              className={classes}
              onClick={onClickAddKwarg}
              tabIndex="0"
              disabled={variantIsDisabled}
            >
              <i className="gg-math-plus !scale-50" />
            </button>

            <button className={classes} onClick={onClickPinParam} tabIndex="0">
              <i className="gg-pin-alt mt-1 !scale-50" />
            </button>
            <button
              className={classes}
              onClick={onClickDeleteSelectedKwargs}
              tabIndex="0"
              disabled={variantIsDisabled}
            >
              <i className="gg-close !scale-50" />
            </button>
          </section>
        </article>

        <search className="nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center ">
          <i className="gg-sort-az -mr-2 text-setta-300 dark:text-setta-600" />
          <input
            id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
            value={paramFilterValue}
            className="min-w-0 flex-1 cursor-auto truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs text-setta-700 placeholder-setta-600  outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300"
            placeholder={`${sectionIsActive ? searchShortcut : "Filter"}`}
            tabIndex="0"
            onChange={onSearchChange}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.target.blur();
              }
            }}
          />
        </search>
      </section>
    </>
  );
}

function onClickAddKwargFn(sectionId, objInfoId) {
  return () => {
    useSectionInfos.setState((state) => {
      const selectedParams = getAllSelectedParams(sectionId, state);
      if (selectedParams.length > 0) {
        const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
        const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
        for (const p of selectedParams) {
          let parentId, insertIdx;
          for (const [id, children] of Object.entries(codeInfoChildren)) {
            if (children.includes(p.id)) {
              parentId = id;
              insertIdx = children.indexOf(p.id) + 1;
              break;
            }
          }
          addKwarg({ sectionId, parentId, insertIdx, state });
        }
      } else {
        addKwarg({ sectionId, parentId: objInfoId, state });
      }
    });
    maybeIncrementProjectStateVersion(true);
  };
}

function onClickDeleteKwargFn(sectionId, objInfoId) {
  return () => {
    useSectionInfos.setState((state) => {
      const selectedParams = getAllSelectedParams(sectionId, state);
      if (selectedParams.length > 0) {
        const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
        const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
        for (const p of selectedParams) {
          let parentId, idx;
          for (const [id, children] of Object.entries(codeInfoChildren)) {
            if (children.includes(p.id)) {
              parentId = id;
              idx = children.indexOf(p.id);
              break;
            }
          }
          if (parentId) {
            const kwargId = codeInfoChildren[parentId][idx + 1];
            if (kwargId) {
              deleteKwarg({ sectionId, parentId: parent.id, kwargId, state });
            }
          }
        }
      } else {
        deleteKwarg({
          sectionId,
          parentId: objInfoId,
          state,
        });
      }
    });
    maybeIncrementProjectStateVersion(true);
  };
}
