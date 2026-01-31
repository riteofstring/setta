import { ResizeHandle } from "components/Params/ResizeHandle";
import { MediaCarousel } from "components/Utils/MediaCarousel";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useRef, useState } from "react";
import { BiSolidSelectMultiple } from "react-icons/bi";
import { FiFileText, FiMusic } from "react-icons/fi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdBrush, MdCategory, MdDataArray, MdList } from "react-icons/md";
import { TbCarouselHorizontal } from "react-icons/tb";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { useLocalPendingValue } from "state/hooks/utils";
import { res200 } from "utils/endpointUtils";
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "utils/attachmentExtensions";
import {
  route_get_folder_contents,
  route_set_browser_area_view_mode,
} from "utils/generatedEndpoints";
import {
  BrowserAreaItem,
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

const artifactTypes = [
  // { type: "Select All" },
  { type: "Image", icon: <IoImageOutline /> },
  { type: "Video", icon: <IoVideocam /> },
  { type: "Text", icon: <FiFileText /> },
  { type: "Data", icon: <MdDataArray /> },
  { type: "Brushes", icon: <MdBrush /> },
  { type: "Other", icon: <MdCategory /> },
];

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;
type BrowserPreviewKind = "image" | "pdf" | "audio" | "video" | "text" | "other";

type PreviewIcon = React.ComponentType<{ className?: string; size?: number }>;

const PREVIEW_KIND_ICON_MAP: Record<BrowserPreviewKind, PreviewIcon> = {
  image: IoImageOutline,
  pdf: FiFileText,
  audio: FiMusic,
  video: IoVideocam,
  text: FiFileText,
  other: FiFileText,
};

const PREVIEW_KIND_ICON_CLASS_MAP: Record<BrowserPreviewKind, string> = {
  image: "text-setta-200 dark:text-setta-600",
  pdf: "text-rose-500/80 dark:text-rose-300",
  audio: "text-amber-500/80 dark:text-amber-300",
  video: "text-emerald-500/80 dark:text-emerald-300",
  text: "text-sky-500/80 dark:text-sky-300",
  other: "text-setta-300 dark:text-setta-600",
};

const PREVIEW_KIND_BADGE_CLASS_MAP: Record<BrowserPreviewKind, string> = {
  image: "",
  pdf: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  audio: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  video: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  text: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  other: "bg-setta-200 text-setta-700 dark:bg-setta-700/40 dark:text-setta-200",
};

function extractExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const baseName = value.split(/[/\\]/).pop() ?? value;
  if (!baseName) {
    return null;
  }
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return null;
  }
  return baseName.slice(dotIndex).toLowerCase();
}

function getExtensionBadge(value: string | undefined): string | null {
  const extension = extractExtension(value);
  if (!extension) {
    return null;
  }
  const label = extension.replace(".", "").toUpperCase();
  if (!label) {
    return null;
  }
  return label.length > 6 ? label.slice(0, 6) : label;
}

function getBrowserPreviewKind(item: BrowserAreaItem): BrowserPreviewKind {
  const extension = extractExtension(item.id);
  if (extension) {
    if (IMAGE_EXTENSIONS.has(extension)) {
      return "image";
    }
    if (PDF_EXTENSIONS.has(extension)) {
      return "pdf";
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
      return "audio";
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
      return "video";
    }
    if (TEXT_EXTENSIONS.has(extension)) {
      return "text";
    }
  }
  const type = item.type?.toString().toLowerCase();
  if (type === "image") {
    return "image";
  }
  if (type === "video") {
    return "video";
  }
  if (type === "text") {
    return "text";
  }
  return "other";
}

function BrowserThumbnailContent({
  previewKind,
  thumbnailUrl,
  badgeText,
  label,
}: {
  previewKind: BrowserPreviewKind;
  thumbnailUrl?: string | null;
  badgeText?: string | null;
  label: string;
}) {
  if (previewKind === "image" && thumbnailUrl) {
    return (
      <>
        <img
          src={thumbnailUrl}
          className="single-cell-child z-10 h-full w-full object-cover"
          alt={label}
        />
        <IoImageOutline className="single-cell-child z-0 place-self-center text-setta-200 dark:text-setta-600" />
      </>
    );
  }
  const Icon = PREVIEW_KIND_ICON_MAP[previewKind];
  const iconClassName = PREVIEW_KIND_ICON_CLASS_MAP[previewKind];
  const badgeClassName = PREVIEW_KIND_BADGE_CLASS_MAP[previewKind];
  return (
    <>
      <div className="single-cell-child flex flex-col items-center justify-center gap-2">
        <Icon size={26} className={iconClassName} />
      </div>
      {badgeText ? (
        <span
          className={`single-cell-child mb-1 mr-1 justify-self-end self-end rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] ${badgeClassName}`}
        >
          {badgeText}
        </span>
      ) : null}
    </>
  );
}

export function BrowserArea({ sectionId }: { sectionId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, hideColumn, viewMode, folder } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Browser,
    );
    return {
      width:
        impl.size.width === "auto"
          ? getSectionRect(sectionId)?.width
          : impl.size.width,
      hideColumn: impl.hideColumn,
      viewMode: impl.viewMode,
      folder: impl.folder,
    };
  }, _.isEqual);
  const handleTypesColumnResizeStart = useBrowserColumnWidth({
    sectionId,
    outerRef: containerRef,
    widthKey: "typesColumnWidth",
    cssVarName: "--browser-types-column-width",
  });
  const typesColumnWidth = "var(--browser-types-column-width, 50%)";

  return (
    <div
      className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col-reverse gap-2 pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible"
      ref={containerRef}
    >
      {!hideColumn && (
        <TypesColumn
          width={width}
          columnWidth={typesColumnWidth}
          onResizeStart={handleTypesColumnResizeStart}
        />
      )}
      <ItemsColumn sectionId={sectionId} viewMode={viewMode} folder={folder} />
    </div>
  );
}

function TypesColumn({
  width,
  columnWidth,
  onResizeStart,
}: {
  width: number;
  columnWidth: string;
  onResizeStart: React.MouseEventHandler<HTMLDivElement>;
}) {
  const { ref, isScrollable } = useIsScrollable();
  const isResizable = width > TYPES_COLUMN_MIN_CONTAINER_WIDTH;
  return (
    <article
      className="nodrag relative flex min-w-0 flex-col pr-1"
      style={isResizable ? { width: columnWidth } : undefined}
    >
      {isResizable && (
        <div className="absolute right-0 top-0 flex h-full items-center">
          <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        </div>
      )}
      <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
        Types
      </h3>

      <div
        ref={ref}
        className={`relative mb-2 mt-2 flex min-h-0 flex-col overflow-y-auto pr-1 ${isScrollable ? "nowheel" : ""}`}
      >
        {artifactTypes.map((x) => (
          <CheckboxNextToLabel key={x.type} icon={x.icon}>
            <p className="truncate">{x.type}</p>
          </CheckboxNextToLabel>
        ))}
      </div>
      <button className="nodrag mt-auto flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-2 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:!border-blue-500 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400">
        <BiSolidSelectMultiple />
        Select All
      </button>
    </article>
  );
}

function ViewSelectorButton({
  view,
  setView,
  viewType,
  children,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
  viewType: BrowserAreaViewMode;
  children: React.ReactNode;
}) {
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

function ViewSelector({
  view,
  setView,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
}) {
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

function ThumbnailItem({
  size = "96px",
  thumbnailUrl,
  previewKind,
  badgeText,
  label,
  children,
}: {
  size: string;
  thumbnailUrl?: string | null;
  previewKind: BrowserPreviewKind;
  badgeText?: string | null;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="group/thumbnail flex cursor-pointer flex-col items-center gap-1"
      style={{ width: size }}
    >
      <div
        className="single-cell-container overflow-clip rounded-md border border-solid border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800"
        style={{ width: size, height: size }}
      >
        <BrowserThumbnailContent
          previewKind={previewKind}
          thumbnailUrl={thumbnailUrl}
          badgeText={badgeText}
          label={label}
        />
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

function ResizableFileList({
  items,
  sectionId,
}: {
  items: Array<BrowserAreaItem>;
  sectionId: string;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const handleResize = useBrowserColumnWidth({
    sectionId,
    outerRef,
    widthKey: "columnWidth",
    cssVarName: "--browser-column-width",
  });
  const { ref, isScrollable } = useIsScrollable();
  const columnWidth = "var(--browser-column-width, 50%)";

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={outerRef}>
      {/* Header Row */}
      <div
        className="mb-3 grid border-b border-solid border-setta-200 text-xs text-setta-300 dark:border-setta-700 dark:text-setta-700"
        style={{
          gridTemplateColumns: `minmax(min-content, ${columnWidth}) 1fr`,
        }}
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
      <div
        className={`min-h-0 flex-1 overflow-x-auto overflow-y-scroll ${isScrollable ? "nowheel" : ""}`}
        ref={ref}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="group/listitem grid"
            style={{
              gridTemplateColumns: `minmax(min-content, ${columnWidth}) 1fr`,
            }}
          >
            <div className="relative w-full">
              <div className="absolute min-h-6 w-full min-w-0 cursor-pointer items-center gap-2 overflow-clip truncate rounded px-1 py-0.5 text-xs text-setta-700 group-hover/listitem:!text-blue-500 dark:text-setta-200">
                <div className="flex w-full justify-between">
                  <p className="min-w-0 truncate">{item.id}</p>

                  <button className="bottom-0 right-0 top-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-transparent outline-blue-500 hover:!text-setta-500 focus-visible:outline group-hover/listitem:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/listitem:text-setta-600">
                    <i className="gg-pen" />
                  </button>
                </div>
              </div>
            </div>
            <p className="min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-400 group-hover/listitem:!text-blue-500 dark:text-setta-600">
              {item.lastModified}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewSwitch({
  view,
  sectionId,
  items,
}: {
  view: BrowserAreaViewMode;
  sectionId: string;
  items: Array<BrowserAreaItem>;
}) {
  const { ref, isScrollable } = useIsScrollable();
  switch (view) {
    case BrowserAreaViewModeEnum.list:
      return <ResizableFileList items={items} sectionId={sectionId} />;

    case BrowserAreaViewModeEnum.thumbnail:
      return (
        <div
          ref={ref}
          className={`nodrag h-full w-full overflow-y-auto overflow-x-hidden ${isScrollable ? "nowheel" : ""}`}
        >
          <div className="grid w-max max-w-full grid-flow-row auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 ">
            {items.map((item) => {
              const previewKind = getBrowserPreviewKind(item);
              const badgeText =
                previewKind === "image"
                  ? null
                  : getExtensionBadge(item.id) ?? previewKind.toUpperCase();
              return (
                <ThumbnailItem
                  key={item.id}
                  previewKind={previewKind}
                  badgeText={badgeText}
                  thumbnailUrl={null}
                  label={item.id}
                >
                  {item.id}
                </ThumbnailItem>
              );
            })}
          </div>
        </div>
      );

    case BrowserAreaViewModeEnum.carousel:
      return (
        <MediaCarousel
          items={items.map((item) => ({
            id: item.id,
            label: item.id,
            data: item,
          }))}
          renderThumbnail={(item) => {
            const data = item.data as BrowserAreaItem | undefined;
            if (!data) {
              return null;
            }
            const previewKind = getBrowserPreviewKind(data);
            const badgeText =
              previewKind === "image"
                ? null
                : getExtensionBadge(data.id) ?? previewKind.toUpperCase();
            const thumbnailUrl =
              previewKind === "image" ? item.thumbnailUrl : null;
            return (
              <BrowserThumbnailContent
                previewKind={previewKind}
                thumbnailUrl={thumbnailUrl}
                badgeText={badgeText}
                label={item.label}
              />
            );
          }}
          renderThumbnailOverlay={() => (
            <input
              className="single-cell-child z-10 ml-1 mt-1 h-4 w-4 cursor-pointer rounded-full bg-transparent transition-colors checked:bg-blue-500 group-hover/thumbnail:bg-setta-500/70 group-hover/thumbnail:checked:bg-blue-600 dark:checked:bg-blue-700"
              type="checkbox"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        />
      );

    default:
      return view satisfies never;
  }
}

function ItemsColumn({
  sectionId,
  viewMode,
  folder,
}: {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
}) {
  const [value, setValue] = useLocalPendingValue(viewMode);
  const [items, setItems] = useState<Array<BrowserAreaItem>>([]);

  function setView(newView: BrowserAreaViewMode) {
    setValue(newView);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
          viewMode: newView,
        });
      },
      send: (frontendOpId) =>
        route_set_browser_area_view_mode({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          viewMode: newView,
          frontendOpId,
        }),
    });
  }

  async function setFolder(newFolder: string) {
    const res = await route_get_folder_contents({ folderPath: newFolder });
    if (res200(res)) {
      console.log("res", res.data);
      setItems(
        res.data.map((d) => ({ id: d.name, type: d.type, lastModified: "" })),
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
      <div className="-mt-[4.5px] mb-1 flex flex-row">
        <div className="flex w-full min-w-0 gap-2">
          <div className="flex items-center gap-1 text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
            Artifacts
          </div>
          {/* <FilterSection /> */}
          <FolderPath folder={folder} setFolder={setFolder} />
        </div>
        <ViewSelector view={value} setView={setView} />
      </div>
      <ViewSwitch
        view={value}
        sectionId={sectionId}
        items={items}
      />
    </div>
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
          className={
            icon
              ? "peer sr-only"
              : "h-[12px] w-[12px] min-w-[12px] cursor-pointer rounded-sm bg-setta-500/15 outline-offset-2 outline-blue-500 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 focus-visible:outline"
          }
          // checked={checked}
          // onChange={onChange}
        />
        {icon && <i className="peer-checked:text-blue-600">{icon}</i>}

        {children}
      </label>
    </li>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-4 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <StandardSearch
      leftElement={
        <i className="gg-sort-az mb-[2px] !scale-50 text-setta-400" />
      }
      placeholder="Filter"
      inputStyles={inputStyles}
      outerClasses="flex-1"
    />
  );
}

function FolderPath({
  folder,
  setFolder,
}: {
  folder: string;
  setFolder: (newFolder: string) => void;
}) {
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    folder,
    setFolder,
    () => true,
  );

  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-4 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <search
      className={
        "nodrag relative mx-[2px] flex min-w-0 flex-1 items-center dark:text-setta-200"
      }
    >
      <input
        className={inputStyles}
        value={inputValue}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
    </search>
  );
}
