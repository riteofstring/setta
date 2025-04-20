import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { useState } from "react";
import { BiChevronRight } from "react-icons/bi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { MdList } from "react-icons/md";
import { TbCarouselHorizontal } from "react-icons/tb";
import { useSectionInfos } from "state/definitions";

export function BrowserArea({ sectionId }) {
  const width = useSectionInfos((x) => {
    const w = x.x[sectionId].size.width;
    return w === "auto" ? getSectionRect(sectionId)?.width : w;
  });
  return (
    <div className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col gap-2 overflow-y-scroll pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible">
      <GroupColumn width={width} />
      <ItemsColumn />
    </div>
  );
}

function GroupColumn({ width }) {
  return (
    <>
      <ResizablePane width={width}>
        <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
          Groups
        </h3>
        <FilterSection />

        <div className="nodrag relative -mr-2 flex flex-col pr-1">
          <CheckboxNextToLabel>Main</CheckboxNextToLabel>
          <CheckboxNextToLabel>OLD</CheckboxNextToLabel>
          <CheckboxNextToLabel>Images</CheckboxNextToLabel>
          <CheckboxNextToLabel>Text</CheckboxNextToLabel>
          <CheckboxNextToLabel>Video</CheckboxNextToLabel>
        </div>
      </ResizablePane>
    </>
  );
}

function ViewSelector({ setView }) {
  return (
    <div className="flex">
      <button
        onClick={() => {
          setView("list");
        }}
      >
        <MdList />
      </button>
      <button
        onClick={() => {
          setView("thumbnail");
        }}
      >
        <HiOutlineViewGrid />
      </button>
      <button
        onClick={() => {
          setView("carousel");
        }}
      >
        <TbCarouselHorizontal />
      </button>
    </div>
  );
}

function ThumbnailItem({ size = "96px" }) {
  return (
    <div
      className="single-cell-container group/thumbnail rounded-md bg-setta-100 dark:bg-setta-800"
      style={{ width: size, height: size }}
    >
      <input
        className="single-cell-child ml-1 mt-1 h-4 w-4 cursor-pointer rounded-full bg-transparent transition-colors checked:bg-blue-500 group-hover/thumbnail:bg-setta-400 group-hover/thumbnail:checked:bg-blue-600 dark:checked:bg-blue-700"
        type="checkbox"
      ></input>
    </div>
  );
}

function ViewSwitch({ view, children }) {
  switch (view) {
    case "list":
      return <div className="flex">{children}</div>;

    case "thumbnail":
      return (
        <div className="nodrag h-full w-full overflow-y-auto overflow-x-hidden">
          <div className="grid w-max max-w-full grid-flow-row auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 ">
            {children}
          </div>
        </div>
      );

    case "carousel":
      return <div className="flex">{children}</div>;

    default:
      return <>{children}</>;
  }
}

function ItemsColumn() {
  const [view, setView] = useState("list");
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-clip pb-2 ">
      <div className="flex flex-row">
        <div className="flex w-full min-w-0 flex-col">
          <div className="flex items-center gap-1 text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
            <span>Artifacts</span>
            <BiChevronRight />
            <span>Select</span>
          </div>
          <FilterSection />
        </div>
        <ViewSelector setView={setView} />
      </div>
      <ViewSwitch view={view}>
        {/* <CheckboxNextToLabel>Main</CheckboxNextToLabel>
        <CheckboxNextToLabel>OLD</CheckboxNextToLabel>
        <CheckboxNextToLabel>Images</CheckboxNextToLabel>
        <CheckboxNextToLabel>Text</CheckboxNextToLabel>
        <CheckboxNextToLabel>Video</CheckboxNextToLabel> */}
        <ThumbnailItem />
        <ThumbnailItem />
        <ThumbnailItem />
        <ThumbnailItem />
      </ViewSwitch>
    </div>
  );
}

function ResizablePane({ width, children }) {
  if (width > 384) {
    return (
      <ResizableWithScale
        className="nodrag relative -mr-2 flex flex-col pr-1"
        enable={{ right: true }}
        minWidth={100}
        maxWidth="70%"
        handleClasses={{
          right:
            "before:bg-transparent before:absolute before:top-0 before:h-3/4 before:bottom-0 before:left-0 before:right-0  before:m-auto before:w-1/4 hover:before:bg-blue-500 before:rounded-full",
        }}
      >
        {children}
      </ResizableWithScale>
    );
  }
  return <article className="-mr-2 flex flex-col pr-2">{children}</article>;
}

function CheckboxNextToLabel({
  children,
  checked,
  shown,
  onChange,
  onClick,
  onMouseEnter,
}) {
  // label ${shown ? "font-bold !text-blue-500" : ""}
  // button ${shown ? "!text-blue-500" : ""}
  return (
    <li
      className="group/runitem flex justify-between"
      // onMouseEnter={onMouseEnter}
    >
      <label
        className={`flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-700  group-hover/runitem:!text-blue-500 dark:text-setta-200`}
      >
        <input
          type="checkbox"
          className="h-4 w-4 min-w-4 cursor-pointer rounded-md bg-setta-500/15 outline-offset-2 outline-blue-500 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 focus-visible:outline"
          // checked={checked}
          // onChange={onChange}
        />

        <p className="truncate">{children}</p>
      </label>
      <button
        className={`mr-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-transparent outline-blue-500 hover:!text-setta-500  focus-visible:outline group-hover/runitem:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/runitem:text-setta-600`}
        // onClick={onClick}
      >
        <i className="gg-pen" />
      </button>
    </li>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-4 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <div className="min-w-0">
      <StandardSearch
        leftElement={
          <i className="gg-sort-az mb-[2px] !scale-50 text-setta-400" />
        }
        placeholder="Filter"
        inputStyles={inputStyles}
        outerClasses="flex-1"
      />
    </div>
  );
}
