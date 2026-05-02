import { FileBrowserFilter } from "components/Panes/Overview/FileBrowser/FileBrowserPane";

import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";

import { useEffect, useMemo } from "react";

import { useBrowserSectionFileBrowserState } from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import { useLocalPendingValue } from "state/hooks/utils";

import { isAbsoluteBrowserPath } from "utils/browserPaths";

import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";

import { parseFileBrowserFilterText } from "utils/fileBrowserFilter";

import { BrowserAreaViewModeEnum } from "utils/generatedTypes";

import { ViewSelector, ViewSwitch } from "./BrowserAreaView";

import {
  BrowserAreaItemsColumnProps,
  useBrowserAreaCarouselState,
  useBrowserAreaPathState,
  useBrowserAreaRootInfo,
} from "./carouselState";

import {
  FolderHistoryControls,
  useBrowserAreaFilePreviewState,
  useBrowserAreaFolderState,
  useBrowserAreaHistoryState,
  useBrowserAreaOpenHandlers,
  useBrowserAreaSectionActions,
  useRecursiveBrowserFilterState,
  useVisibleBrowserItems,
} from "./filePreviewAndHistory";

export function BrowserAreaItemsColumn({
  sectionId,
  viewMode,
  folder,
  filesColumnWidth,
  onFilesColumnResizeStart,
  savedSearches,
  isFrozen,
}: BrowserAreaItemsColumnProps) {
  const [value, setValue] = useLocalPendingValue(viewMode);
  const { canEditLayout } = useShareCapabilities();
  const filterText = useBrowserSectionFileBrowserState(
    (state) => state.filterText,
  );
  const searchScope = useBrowserSectionFileBrowserState(
    (state) => state.searchScope,
  );
  const typeFilters = useBrowserSectionFileBrowserState(
    (state) => state.typeFilters,
  );
  const browserStateRootPath = useBrowserSectionFileBrowserState(
    (state) => state.rootPath,
  );
  const browserStateIgnorePatterns = useBrowserSectionFileBrowserState(
    (state) => state.ignorePatterns,
  );
  const browserStatePathSeparator = useBrowserSectionFileBrowserState(
    (state) => state.pathSeparator,
  );
  const canSaveSearch = canEditLayout && !isFrozen;
  const { rootInfo } = useBrowserAreaRootInfo({
    browserStateRootPath,
    browserStateIgnorePatterns,
    browserStatePathSeparator,
  });
  const isListView = value === BrowserAreaViewModeEnum.list;
  const filterQuery = useMemo(
    () => parseFileBrowserFilterText(filterText),
    [filterText],
  );
  const {
    items,
    folderContentsCacheRef,
    effectiveFolder,
    setFolder,
    breadcrumbs,
    parentFolderPath,
  } = useBrowserAreaFolderState({
    folder,
    rootInfo,
    isListView,
  });
  const { folderCompletionSource, getItemSubLabel, getItemTooltip } =
    useBrowserAreaPathState({
      effectiveFolder,
      rootInfo,
      browserStatePathSeparator,
      browserStateIgnorePatterns,
      filterQueryKind: filterQuery.kind,
      isListView,
    });
  const recursiveFilterResults = useRecursiveBrowserFilterState({
    isListView,
    searchScope,
    filterQuery,
    rootInfo,
    effectiveFolder,
    items,
    filterText,
    cache: folderContentsCacheRef,
  });
  const filteredVisibleItems = useVisibleBrowserItems({
    isListView,
    items,
    filterQuery,
    recursiveFilterResults,
    filterText,
    typeFilters,
  });
  const {
    fileUrlMap,
    textPreviewMap,
    requestFileUrls,
    getFileUrlEntry,
    requestTextPreview,
  } = useBrowserAreaFilePreviewState();
  const { selectedCarouselId, setSelectedCarouselId } =
    useBrowserAreaCarouselState({
      value,
      filteredVisibleItems,
      isListView,
      requestFileUrls,
      requestTextPreview,
    });
  const { setView, handleSaveSearch } = useBrowserAreaSectionActions({
    sectionId,
    setValue,
    canSaveSearch,
    savedSearches,
    searchScope,
    typeFilters,
  });
  const { handleOpenFolder, handleOpenFile } = useBrowserAreaOpenHandlers({
    setFolder,
    getFileUrlEntry,
  });
  const { canGoBack, canGoForward, handleGoBack, handleGoForward, handleGoUp } =
    useBrowserAreaHistoryState({
      effectiveFolder,
      isListView,
      parentFolderPath,
      setFolder,
    });
  useEffect(() => {
    const trimmed = effectiveFolder.trim();
    if (!trimmed) {
      return;
    }
    if (rootInfo?.rootPath && !isAbsoluteBrowserPath(trimmed)) {
      return;
    }
    useBrowserSectionFileBrowserState.setState({
      rootPath: trimmed,
    });
  }, [effectiveFolder, rootInfo?.rootPath]);
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
      <div className="-mt-[4.5px] mb-1 flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <FolderHistoryControls
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onBack={handleGoBack}
              onForward={handleGoForward}
            />
            <FileBrowserGoUpButton
              disabled={!parentFolderPath}
              onClick={handleGoUp}
            />
            <div className="min-w-[200px] flex-[1_1_320px]">
              <FileBrowserPathInput
                inputId={`CodeMirror-${sectionId}-browser-path`}
                value={effectiveFolder}
                onCommit={setFolder}
                completionSource={folderCompletionSource}
              />
            </div>
            <div className="min-w-[140px] max-w-[260px] flex-[0_1_200px]">
              <FileBrowserFilter
                useFileBrowserStateHook={useBrowserSectionFileBrowserState}
                tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
                saveSearchConfig={{
                  canSave: canSaveSearch,
                  onSaveSearch: handleSaveSearch,
                }}
              />
            </div>
          </div>
          <ViewSelector view={value} setView={setView} />
        </div>
        <FileBrowserBreadcrumbs
          breadcrumbs={breadcrumbs}
          currentPath={effectiveFolder}
          onSelect={(path) => {
            void setFolder(path);
          }}
          className="px-0.5"
        />
      </div>
      <ViewSwitch
        view={value}
        items={isListView ? items : filteredVisibleItems}
        filesColumnWidth={filesColumnWidth}
        onFilesColumnResizeStart={onFilesColumnResizeStart}
        fileUrlMap={fileUrlMap}
        selectedCarouselId={selectedCarouselId}
        onSelectCarouselId={setSelectedCarouselId}
        textPreviewMap={textPreviewMap}
        getItemSubLabel={getItemSubLabel}
        getItemTooltip={getItemTooltip}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
}
