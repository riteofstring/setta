import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
} from "components/Panes/Overview/FileBrowser/fileBrowserPaneShared";
import { getSectionRect } from "gpuFlow/flowGeometry";
import _ from "lodash";
import { useRef } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { SectionTypeEnum } from "utils/generatedTypes";
import { clamp } from "utils/utils";
import { BrowserAreaItemsColumn } from "./BrowserAreaItemsColumn";
import { BrowserAreaTypesColumn } from "./BrowserAreaTypesColumn";

const BROWSER_TYPES_COLUMN_DEFAULT_RATIO = 0.24;
const BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH = 180;
const BROWSER_TYPES_COLUMN_DEFAULT_MAX_WIDTH = 260;
const BROWSER_FILES_COLUMN_DEFAULT_RATIO = 0.72;

export function BrowserArea({ sectionId }: { sectionId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, hideColumn, viewMode, folder, savedSearches, isFrozen } =
    useProjectState((state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
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
        savedSearches: impl.savedSearches ?? [],
        isFrozen: impl.isFrozen,
      };
    }, _.isEqual);
  const handleTypesColumnResizeStart = useBrowserColumnWidth({
    sectionId,
    outerRef: containerRef,
    widthKey: "typesColumnWidth",
    cssVarName: "--browser-types-column-width",
    getDefaultWidth: (containerWidth) =>
      clamp(
        containerWidth * BROWSER_TYPES_COLUMN_DEFAULT_RATIO,
        BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH,
        Math.min(
          BROWSER_TYPES_COLUMN_DEFAULT_MAX_WIDTH,
          Math.max(
            BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH,
            containerWidth - FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          ),
        ),
      ),
  });
  const handleFilesColumnResizeStart = useBrowserColumnWidth({
    sectionId,
    outerRef: containerRef,
    widthKey: "columnWidth",
    cssVarName: "--browser-column-width",
    getBoundedWidth: (widthValue, containerWidth) =>
      clamp(
        widthValue,
        FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
        Math.max(
          FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          containerWidth - FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
        ),
      ),
    getDefaultWidth: (containerWidth) =>
      clamp(
        containerWidth * BROWSER_FILES_COLUMN_DEFAULT_RATIO,
        FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
        Math.max(
          FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          containerWidth - FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
        ),
      ),
  });
  return (
    <div
      className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col gap-2 pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible"
      ref={containerRef}
    >
      {!hideColumn ? (
        <BrowserAreaTypesColumn
          width={width}
          columnWidth="var(--browser-types-column-width, 220px)"
          onResizeStart={handleTypesColumnResizeStart}
          savedSearches={savedSearches}
        />
      ) : null}
      <BrowserAreaItemsColumn
        sectionId={sectionId}
        viewMode={viewMode}
        folder={folder}
        filesColumnWidth="var(--browser-column-width, 72%)"
        onFilesColumnResizeStart={handleFilesColumnResizeStart}
        savedSearches={savedSearches}
        isFrozen={isFrozen}
      />
    </div>
  );
}
