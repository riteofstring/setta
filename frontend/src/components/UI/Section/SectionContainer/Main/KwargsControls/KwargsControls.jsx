import C from "constants/constants.json";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { addKwarg, deleteKwarg } from "thunks/kwargs";
import { getSectionTypeConfig } from "thunks/sections/getters";
import { updateParams } from "thunks/sections/sectionContents";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import { findAll } from "z_utils/getDescendants";

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

  function onPush(computeFn) {
    return () => {
      const { codeInfos, selectedParams } = getAllSelectedParams(sectionId);
      const newCodeInfoChildren = {};
      const numSiblingsInserted = {};
      for (const p of selectedParams) {
        console.log(p);
        computeFn(codeInfos, p, newCodeInfoChildren, numSiblingsInserted);
      }
      useCodeInfo.getState().batchUpdateChildren(newCodeInfoChildren);
      updateParams(sectionId);
    };
  }

  const onPushLeft = onPush(computeNewChildrenForLeftPush);
  const onPushRight = onPush(computeNewChildrenForRightPush);

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

function getAllSelectedParams(sectionId) {
  const codeInfos = findAll(useCodeInfo.getState().x, [
    getSectionTypeConfig(sectionId).codeInfoId,
  ]);
  return {
    codeInfos,
    selectedParams: codeInfos.filter(
      (x) => x.rcType === C.PARAMETER && x.isSelected,
    ),
  };
}

function computeNewChildrenForRightPush(codeInfos, paramInfo, newChildren) {
  const parentInfo = codeInfos.find((x) => x.children.includes(paramInfo.id));
  if (parentInfo.isSelected) {
    return;
  }

  const siblingList = parentInfo.children;
  const paramIdx = siblingList.indexOf(paramInfo.id);
  let prevUnselectedSiblingIdx = -1;
  for (let i = paramIdx - 1; i >= 0; i--) {
    if (!useCodeInfo.getState().x[siblingList[i]].isSelected) {
      prevUnselectedSiblingIdx = i;
      break;
    }
  }
  if (prevUnselectedSiblingIdx < 0) {
    return;
  }
  const siblingInfo =
    useCodeInfo.getState().x[siblingList[prevUnselectedSiblingIdx]];

  if (!(parentInfo.id in newChildren)) {
    newChildren[parentInfo.id] = parentInfo.children;
  }
  newChildren[parentInfo.id] = newChildren[parentInfo.id].filter(
    (x) => x !== paramInfo.id,
  );

  if (!(siblingInfo.id in newChildren)) {
    newChildren[siblingInfo.id] = siblingInfo.children;
  }
  newChildren[siblingInfo.id] = [...newChildren[siblingInfo.id], paramInfo.id];
}

function computeNewChildrenForLeftPush(
  codeInfos,
  paramInfo,
  newChildren,
  numSiblingsInserted,
) {
  const parentInfo = codeInfos.find((x) => x.children.includes(paramInfo.id));
  const gParentInfo = codeInfos.find((x) => x.children.includes(parentInfo.id));
  if (!gParentInfo || gParentInfo.isSelected || parentInfo.isSelected) {
    return;
  }

  if (!(parentInfo.id in newChildren)) {
    newChildren[parentInfo.id] = parentInfo.children;
  }
  newChildren[parentInfo.id] = newChildren[parentInfo.id].filter(
    (x) => x !== paramInfo.id,
  );

  const parentSiblingList = gParentInfo.children;
  const parentIdx = parentSiblingList.indexOf(parentInfo.id);
  if (!(parentInfo.id in numSiblingsInserted)) {
    numSiblingsInserted[parentInfo.id] = 0;
  }

  const insertIdx = parentIdx + 1 + numSiblingsInserted[parentInfo.id];
  console.log("insertIdx", insertIdx);
  if (!(gParentInfo.id in newChildren)) {
    newChildren[gParentInfo.id] = gParentInfo.children;
  }
  newChildren[gParentInfo.id] = [
    ...newChildren[gParentInfo.id].slice(0, insertIdx),
    paramInfo.id,
    ...newChildren[gParentInfo.id].slice(insertIdx),
  ];
  numSiblingsInserted[parentInfo.id] += 1;
}
