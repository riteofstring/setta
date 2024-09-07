import {
  addKwarg,
  deleteKwarg,
  deleteSelectedKwargs,
  pinSelectedKwargs,
} from "state/actions/kwargs/kwargs";
import { setSectionParamFilter } from "state/actions/sections/sectionParamFilter";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useCodeInfo } from "state/definitions";
import { useAreAnyParamsSelected } from "state/hooks/sectionContents";
import { getAllSelectedParams } from "../../../state/actions/kwargs/utils";

export function KwargsControls({
  sectionId,
  objInfoId,
  bgColor = "bg-transparent",
}) {
  const anyParamsSelected = useAreAnyParamsSelected(sectionId);

  const onClickAddKwarg = onClickAddKwargFn(sectionId, objInfoId);
  const onClickDeleteKwarg = onClickDeleteKwargFn(sectionId, objInfoId);
  function onSearchChange(e) {
    setSectionParamFilter({ sectionId, filter: e.target.value });
  }

  const onClickDeleteSelectedKwargs = () => {
    deleteSelectedKwargs({ sectionId, parentId: objInfoId });
  };

  function onClickPinParam() {
    pinSelectedKwargs(sectionId);
  }

  const inputStyles = "";

  const classes =
    "focus-visible:ring-2 grid grid-cols-[1fr] grid-rows-[1fr] place-items-center nodrag cursor-pointer bg-transparent hover:bg-setta-100 dark:hover:bg-setta-950/50 text-setta-500 dark:hover:text-setta-300 rounded-full h-6 w-6";

  return (
    <>
      <section
        className={`section-args z-10 mt-1 flex min-w-0 flex-wrap rounded-xl border-b border-solid  border-white px-1 pb-1 shadow-sm @container dark:border-setta-700 ${bgColor}`}
      >
        <article className="flex flex-wrap items-center">
          <section className="flex">
            <h3 className="my-auto ml-2 pr-1 font-heading text-[0.6rem] font-bold uppercase text-setta-600/70 dark:text-setta-400/50 ">
              Args
            </h3>

            <button
              className={classes}
              onClick={onClickDeleteKwarg}
              tabIndex="-1"
            >
              <i className="gg-math-minus w-full" />
            </button>
            <button className={classes} onClick={onClickAddKwarg} tabIndex="-1">
              <i className="gg-math-plus" />
            </button>
            {anyParamsSelected && (
              <>
                <button
                  className={classes}
                  onClick={onClickPinParam}
                  tabIndex="-1"
                >
                  <i className="gg-pin-alt mt-1" />
                </button>
                <button
                  className={classes}
                  onClick={onClickDeleteSelectedKwargs}
                  tabIndex="-1"
                >
                  <i className="gg-close-r" />
                </button>
              </>
            )}
          </section>
          {/* {anyParamsSelected && (
            <section className="flex">
              <h3 className="my-auto ml-2 pr-1 font-heading text-[0.6rem] font-bold uppercase text-setta-600/70 dark:text-setta-400/50 ">
                Position
              </h3>

              <button className={classes} onClick={onPushLeft} tabIndex="-1">
                <i className="gg-push-left ml-[2px]" />
              </button>
              <button className={classes} onClick={onPushRight} tabIndex="-1">
                <i className="gg-push-right mr-[2px]" />
              </button>
              <button className={classes} onClick={onPushUp} tabIndex="-1">
                <i className="gg-push-up mt-[2px]" />
              </button>
              <button className={classes} onClick={onPushDown} tabIndex="-1">
                <i className="gg-push-down mb-[2px]" />
              </button>
            </section>
          )} */}
        </article>

        <search className="nodrag relative mx-2 flex min-w-20 flex-1 items-center justify-self-center">
          <i className="gg-sort-az -mr-2 text-setta-300 dark:text-setta-600" />
          <input
            id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
            className="min-w-0 flex-1 cursor-auto truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs text-setta-300 placeholder-setta-600 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300"
            placeholder="Filter"
            tabIndex="-1"
            onChange={onSearchChange}
          />
        </search>
      </section>
    </>
  );
}

function onClickAddKwargFn(sectionId, objInfoId) {
  return () => {
    const selectedParams = getAllSelectedParams(sectionId);
    if (selectedParams.length > 0) {
      for (const p of selectedParams) {
        const parent = Object.values(useCodeInfo.getState().x).find((x) =>
          x.children.includes(p.id),
        );
        const insertIdx = parent.children.indexOf(p.id) + 1;
        addKwarg({ sectionId, parentId: parent.id, insertIdx });
      }
      maybeIncrementProjectStateVersion(true);
    } else {
      addKwarg({ sectionId, parentId: objInfoId, incrementVersion: true });
    }
  };
}

function onClickDeleteKwargFn(sectionId, objInfoId) {
  return () => {
    const selectedParams = getAllSelectedParams(sectionId);
    if (selectedParams.length > 0) {
      for (const p of selectedParams) {
        const parent = Object.values(useCodeInfo.getState().x).find((x) =>
          x.children.includes(p.id),
        );
        const kwargId = parent.children[parent.children.indexOf(p.id) + 1];
        if (kwargId) {
          deleteKwarg({ sectionId, parentId: parent.id, kwargId });
        }
      }
      maybeIncrementProjectStateVersion(true);
    } else {
      deleteKwarg({
        sectionId,
        parentId: objInfoId,
        deleteLast: true,
        incrementVersion: true,
      });
    }
  };
}
