import { batchUpdateCodeInfoChildren } from "state/actions/codeInfo";
import { addKwarg, deleteKwarg } from "state/actions/kwargs";
import { updateParams } from "state/actions/sectionContents";
import { setSectionParamFilter } from "state/actions/sectionParamFilter";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useCodeInfo } from "state/definitions";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import {
  computeNewChildrenForLeftPush,
  computeNewChildrenForRightPush,
  computeNewChildrenForVerticalPush,
  getAllSelectedParams,
} from "./utils";

export function KwargsControls({ sectionId, objInfoId }) {
  const onClickAddKwarg = onClickAddKwargFn(sectionId, objInfoId);
  const onClickDeleteKwarg = onClickDeleteKwargFn(sectionId, objInfoId);
  function onSearchChange(e) {
    setSectionParamFilter({ sectionId, filter: e.target.value });
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
      batchUpdateCodeInfoChildren(newCodeInfoChildren);
      updateParams(sectionId);
    };
  }

  const onPushLeft = onPush(computeNewChildrenForLeftPush);
  const onPushRight = onPush(computeNewChildrenForRightPush);
  const onPushUp = onPush(computeNewChildrenForVerticalPush("up"));
  const onPushDown = onPush(computeNewChildrenForVerticalPush("down"), true);

  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto truncate bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-6 py-1 placeholder-setta-600 text-setta-300";

  const classes =
    "focus-visible:ring-2 grid grid-cols-[1fr] grid-rows-[1fr] place-items-center nodrag cursor-pointer bg-transparent hover:bg-setta-100 dark:hover:bg-setta-950/50 text-setta-500 dark:hover:text-setta-300 rounded-full h-6 w-6";

  return (
    <>
      <section className="card-args-control flex min-w-0  rounded-xl border-b border-solid border-white px-2  pb-1 shadow-sm @container dark:border-setta-700 dark:from-transparent">
        <div className="flex w-full min-w-0 flex-wrap ">
          <article className=" flex items-center">
            {/* <h3 className="pr-1 font-heading text-xs uppercase text-setta-600/70 before:content-['arguments'] @[11.99rem]:before:content-['arguments'] @[12rem]:before:content-['args'] @[16rem]:before:content-['arguments'] dark:text-setta-400/70 "></h3> */}
            <button className={classes} onClick={onClickDeleteKwarg}>
              <i className="gg-math-minus w-full" />
            </button>
            <button className={classes} onClick={onClickAddKwarg}>
              <i className="gg-math-plus" />
            </button>
            <button className={classes} onClick={onPushLeft}>
              <i className="gg-push-left ml-[2px]" />
            </button>
            <button className={classes} onClick={onPushRight}>
              <i className="gg-push-right mr-[2px]" />
            </button>
            <button className={classes} onClick={onPushUp}>
              <i className="gg-push-up mt-[2px]" />
            </button>
            <button className={classes} onClick={onPushDown}>
              <i className="gg-push-down mb-[2px]" />
            </button>
            <VerticalLine inputStyles="ml-2 mr-3 self-stretch hidden" />
          </article>

          <search className="nodrag relative mx-2 flex min-w-12 flex-1 items-center">
            <i className="gg-sort-az -mr-4 text-setta-300 dark:text-setta-600" />
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
          leftElement={<BiFilter className="text-setta-400" />}
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

function onClickAddKwargFn(sectionId, objInfoId) {
  return () => {
    const { selectedParams } = getAllSelectedParams(sectionId);
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
    const { selectedParams } = getAllSelectedParams(sectionId);
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
