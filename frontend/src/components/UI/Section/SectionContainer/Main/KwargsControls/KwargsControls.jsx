import { useCodeInfo } from "models/info/codeInfo";
import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { CgPushDown, CgPushUp } from "react-icons/cg";
import { addKwarg, deleteKwarg } from "thunks/kwargs";
import { updateParams } from "thunks/sections/sectionContents";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import {
  computeNewChildrenForLeftPush,
  computeNewChildrenForRightPush,
  computeNewChildrenForVerticalPush,
  getAllSelectedParams,
} from "./utils";

export function KwargsControls({ sectionId, objInfoId }) {
  const setParamFilter = useSectionParamFilter((x) => x.setFilter);

  function onClickAddKwarg() {
    addKwarg({ sectionId, objInfoId, incrementVersion: true });
  }
  function onClickDeleteKwarg() {
    deleteKwarg({
      sectionId,
      parentId: objInfoId,
      deleteLast: true,
      incrementVersion: true,
    });
  }
  function onSearchChange(e) {
    setParamFilter({ sectionId, filter: e.target.value });
  }

  function onPush(computeFn, processInReverse = false) {
    return () => {
      let { codeInfos, selectedParams } = getAllSelectedParams(sectionId);
      if (processInReverse) {
        selectedParams.reverse();
      }
      const newCodeInfoChildren = {};
      const numChildrenInserted = {};
      for (const p of selectedParams) {
        console.log(p);
        computeFn(codeInfos, p, newCodeInfoChildren, numChildrenInserted);
      }
      useCodeInfo.getState().batchUpdateChildren(newCodeInfoChildren);
      updateParams(sectionId);
    };
  }

  const onPushLeft = onPush(computeNewChildrenForLeftPush);
  const onPushRight = onPush(computeNewChildrenForRightPush);
  const onPushUp = onPush(computeNewChildrenForVerticalPush("up"));
  const onPushDown = onPush(computeNewChildrenForVerticalPush("down"), true);

  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto truncate bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-6 py-1 placeholder-runcoder-600 text-runcoder-300";

  const buttonClass =
    "focus-visible:ring-2 grid grid-cols-[1fr] grid-rows-[1fr] place-items-center nodrag cursor-pointer flex bg-transparent hover:bg-runcoder-100 dark:hover:bg-runcoder-950/50 text-runcoder-500 dark:hover:text-runcoder-300 rounded-full ";

  return (
    <>
      <section className="card-args-control flex min-w-0  rounded-xl border-b border-solid border-white px-5  pb-1 shadow-sm @container dark:border-runcoder-700 dark:from-transparent">
        <div className="flex min-w-0 flex-grow flex-col @[12rem]:flex-row">
          <article className="flex items-center">
            <h3 className="pr-1  font-heading text-xs font-bold uppercase text-runcoder-600/70 before:content-['arguments'] @[11.99rem]:before:content-['arguments'] @[12rem]:before:content-['args'] @[16rem]:before:content-['arguments'] dark:text-runcoder-400/70 "></h3>
            <button className={buttonClass} onClick={onClickDeleteKwarg}>
              <i className="gg-math-minus col-start-1 row-start-1" />
            </button>
            <button className={buttonClass} onClick={onClickAddKwarg}>
              <i className="gg-math-plus col-start-1 row-start-1" />
            </button>
            <button className={buttonClass} onClick={onPushLeft}>
              <i className="gg-push-left col-start-1 row-start-1" />
            </button>
            <button className={buttonClass} onClick={onPushRight}>
              <i className="gg-push-right col-start-1 row-start-1" />
            </button>
            <button className={buttonClass} onClick={onPushUp}>
              <CgPushUp />
            </button>
            <button className={buttonClass} onClick={onPushDown}>
              <CgPushDown />
            </button>
            <VerticalLine inputStyles="ml-2 mr-3 self-stretch invisible @[12rem]:visible" />
          </article>

          <search className="nodrag relative flex w-full min-w-0 items-center">
            <i className="gg-sort-az -mr-4 text-runcoder-300 dark:text-runcoder-600" />
            <input
              id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
              className={inputStyles}
              placeholder="Filter"
              tabIndex="0"
              onChange={onSearchChange}
            />
          </search>
        </div>
        {/* <StandardSearch
          id={`${sectionId}-args-filter`} // IMPORTANT, used for ctrl-k shortcut
          leftElement={<BiFilter className="text-runcoder-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
          onChange={onSearchChange}
        /> */}
      </section>
      {/* <hr className="col-span-full row-start-5 row-end-6 " /> */}
    </>
  );
}
