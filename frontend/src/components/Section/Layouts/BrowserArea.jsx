import { ResizeHandle } from "components/Params/ResizeHandle";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { useState } from "react";
import { BiChevronRight } from "react-icons/bi";
import { FiFileText } from "react-icons/fi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdBrush, MdDataArray, MdList } from "react-icons/md";
import { TbCarouselHorizontal } from "react-icons/tb";
import { useSectionInfos } from "state/definitions";
import { useResizableColumn } from "state/hooks/useResizableColumns";
import { testItems } from "./BrowserArea/testitems";

const artifactTypes = [
  { type: "Image", icon: <IoImageOutline /> },
  { type: "Video", icon: <IoVideocam /> },
  { type: "Text", icon: <FiFileText /> },
  { type: "Data", icon: <MdDataArray /> },
  { type: "Brushes", icon: <MdBrush /> },
];

export function BrowserArea({ sectionId }) {
  const width = useSectionInfos((x) => {
    const w = x.x[sectionId].size.width;
    return w === "auto" ? getSectionRect(sectionId)?.width : w;
  });
  return (
    <div className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col gap-2 overflow-y-scroll pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible">
      <GroupColumn width={width} />
      <ItemsColumn sectionId={sectionId} />
    </div>
  );
}

function GroupColumn({ width }) {
  return (
    <>
      <ResizableColumn width={width}>
        <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
          Groups
        </h3>
        <FilterSection />

        <div className="nodrag relative -mr-2 flex flex-col pr-1">
          {artifactTypes.map((x) => (
            <CheckboxNextToLabel icon={x.icon}>
              <p className="truncate">{x.type}</p>
            </CheckboxNextToLabel>
          ))}
        </div>
      </ResizableColumn>
    </>
  );
}

function ViewSelectorButton({ view, setView, viewType, children }) {
  return (
    <button
      onClick={() => {
        setView(viewType);
      }}
      className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-md p-1  hover:bg-setta-50  dark:hover:bg-setta-800 ${view === viewType ? "bg-blue-100 text-blue-600 dark:bg-transparent dark:text-blue-600" : "bg-transparent text-setta-400 dark:text-setta-500"}`}
    >
      {children}
    </button>
  );
}

function ViewSelector({ view, setView }) {
  return (
    <div className="flex gap-0.5">
      <ViewSelectorButton view={view} setView={setView} viewType="list">
        <MdList />
      </ViewSelectorButton>
      <ViewSelectorButton view={view} setView={setView} viewType="thumbnail">
        <HiOutlineViewGrid />
      </ViewSelectorButton>
      <ViewSelectorButton view={view} setView={setView} viewType="carousel">
        <TbCarouselHorizontal />
      </ViewSelectorButton>
    </div>
  );
}

function ThumbnailItem({ size = "96px", thumbnail, children }) {
  console.log("thumbnail: ", thumbnail);
  return (
    <div
      className="group/thumbnail flex cursor-pointer flex-col items-center gap-1"
      style={{ width: size }}
    >
      <div
        className="single-cell-container overflow-clip rounded-md border border-solid border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800"
        style={{ width: size, height: size }}
      >
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              className="single-cell-child z-10 object-cover"
            />
            <IoImageOutline className="single-cell-child z-0 place-self-center text-setta-200 dark:text-setta-600" />
          </>
        ) : (
          <FiFileText
            size={20}
            className="single-cell-child place-self-center text-setta-200 dark:text-setta-600"
          />
        )}
        <input
          className="single-cell-child z-10 ml-1 mt-1 h-4 w-4 cursor-pointer rounded-full bg-transparent transition-colors checked:bg-blue-500 group-hover/thumbnail:bg-setta-500/70 group-hover/thumbnail:checked:bg-blue-600 dark:checked:bg-blue-700"
          type="checkbox"
        ></input>
      </div>
      <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
        {children}
      </p>
    </div>
  );
}

function ResizableFileList({ items, sectionId, children }) {
  const { headerRef, contentRef, handleResize, getRowProps } =
    useResizableColumn(sectionId, {
      minWidth: 120,
      maxWidth: 400,
      defaultWidth: 180,
    });

  return (
    <div className="flex flex-col overflow-y-auto overflow-x-clip">
      {/* Header Row */}
      <div
        ref={headerRef}
        className="grid border-b border-solid border-setta-200 text-xs text-setta-300 dark:border-setta-700 dark:text-setta-700"
        style={{ gridTemplateColumns: "minmax(min-content, 180px) 1fr" }}
      >
        <div className="relative flex items-center px-1 py-2">
          <p>Name</p>
          <div className="absolute right-0 top-0 h-full">
            <ResizeHandle showResizeHandle={true} onMouseDown={handleResize} />
          </div>
        </div>
        <div className="flex items-center px-1 py-2">
          <p>Last Modified</p>
        </div>
      </div>

      {/* List Items */}
      <div ref={contentRef}>
        {items.map((item) => (
          <div
            key={item.id}
            className="group/listitem grid"
            style={{ gridTemplateColumns: "minmax(min-content, 180px) 1fr" }}
            {...getRowProps()}
          >
            <div className="relative flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-700 group-hover/listitem:!text-blue-500 dark:text-setta-200">
              {item.id}
              <button className="mr-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-transparent outline-blue-500 hover:!text-setta-500 focus-visible:outline group-hover/listitem:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/listitem:text-setta-600">
                <i className="gg-pen" />
              </button>
            </div>

            <p className="flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-400 group-hover/listitem:!text-blue-500 dark:text-setta-600">
              {item.lastModified}
            </p>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

function ViewSwitch({ view, children, sectionId }) {
  switch (view) {
    case "list":
      return (
        <ResizableFileList items={testItems} sectionId={sectionId}>
          {children}
        </ResizableFileList>
      );

    case "thumbnail":
      return (
        <div className="nodrag h-full w-full overflow-y-auto overflow-x-hidden">
          <div className="grid w-max max-w-full grid-flow-row auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 ">
            {testItems.map((x) => (
              <ThumbnailItem thumbnail={x.content?.thumbnail}>
                {x.id}
              </ThumbnailItem>
            ))}
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

function ItemsColumn({ sectionId }) {
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
        <ViewSelector view={view} setView={setView} />
      </div>
      <ViewSwitch view={view} sectionId={sectionId} />
    </div>
  );
}

function ResizableColumn({
  width,
  minContainerWidth = 384,
  children,
  minWidth = 100,
  maxWidth = "70%",
  enable = { right: true },
  className = "nodrag relative -mr-2 flex flex-col overflow-y-auto overflow-x-clip pr-1",
  handleClasses = {
    right:
      "before:bg-transparent before:absolute before:top-0 before:h-3/4 before:bottom-0 before:left-0 before:right-0  before:m-auto before:w-1/4 hover:before:bg-blue-500 before:rounded-full",
  },
}) {
  if (width > minContainerWidth) {
    return (
      <ResizableWithScale
        className={className}
        enable={enable}
        minWidth={minWidth}
        maxWidth={maxWidth}
        handleClasses={handleClasses}
      >
        {children}
      </ResizableWithScale>
    );
  }
  return <article className="-mr-2 flex flex-col pr-2">{children}</article>;
}

function TextItem({
  children,
  checked,
  shown,
  onChange,
  onClick,
  onMouseEnter,
  lastModified,
}) {
  return (
    <li className="group/textitem flex justify-between">
      <div className="flex w-full justify-between gap-1">
        <p className="flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs  text-setta-700 group-hover/textitem:!text-blue-500 dark:text-setta-200">
          {children}
        </p>
        <p className="flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-400 group-hover/textitem:!text-blue-500 dark:text-setta-600">
          {lastModified}
        </p>
      </div>

      <button
        className={`mr-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-transparent outline-blue-500 hover:!text-setta-500  focus-visible:outline group-hover/textitem:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/textitem:text-setta-600`}
        // onClick={onClick}
      >
        <i className="gg-pen" />
      </button>
    </li>
  );
}

function CheckboxNextToLabel({
  children,
  checked,
  shown,
  onChange,
  onClick,
  onMouseEnter,
  icon,
}) {
  // label ${shown ? "font-bold !text-blue-500" : ""}
  // button ${shown ? "!text-blue-500" : ""}
  // h-4 w-4 min-w-4 cursor-pointer rounded-md bg-setta-500/15 outline-offset-2 outline-blue-500 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 focus-visible:outline
  return (
    <li
      className="group/checkboxlabel flex justify-between"
      // onMouseEnter={onMouseEnter}
    >
      <label
        className={`flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-700  group-hover/checkboxlabel:!text-blue-500 dark:text-setta-200`}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          // checked={checked}
          // onChange={onChange}
        />
        <i className="peer-checked:text-blue-600">{icon}</i>

        {children}
      </label>
      <button
        className={`mr-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-transparent outline-blue-500 hover:!text-setta-500  focus-visible:outline group-hover/checkboxlabel:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/checkboxlabel:text-setta-600`}
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
