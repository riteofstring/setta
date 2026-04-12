import { useState } from "react";
import { useFileBrowserState } from "state/definitions";
import { FileBrowserFilter } from "./FileBrowserFilter";
import { FileBrowserPaneView } from "./FileBrowserPaneView";
import {
  buildFileBrowserLoadingPathOwner,
  forEachWithConcurrencyLimit,
  getResolvedFileBrowserRootState,
  getSettaBadgeRefreshFolderPaths,
  isEditableFileBrowserTarget,
  isOwnedFileBrowserLoadingPath,
  shouldCheckRootWorkspaceInitialization,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshMovedExpandedFolder,
  shouldRefreshRootAfterFileBrowserTransfer,
  shouldRefreshSettaBadgeDataOnToggleChange,
  shouldShowSettaInitializedFolderIcon,
  shouldSkipFileBrowserTransfer,
} from "./fileBrowserPaneCore";
import {
  type FileBrowserPaneProps,
  type FileNode,
} from "./fileBrowserPaneShared";
import { flattenFileBrowserTree, sortChildPaths } from "./fileBrowserPaneTree";
import { useFileBrowserPaneData } from "./useFileBrowserPaneData";
import { useFileBrowserPaneDerivedState } from "./useFileBrowserPaneDerivedState";
import { useFileBrowserPaneHandlers } from "./useFileBrowserPaneHandlers";
import { useFileBrowserPaneLayout } from "./useFileBrowserPaneLayout";
import { useFileBrowserPreviewUrls } from "./useFileBrowserPreviewUrls";
import { useFileBrowserTransfer } from "./useFileBrowserTransfer";

export {
  buildFileBrowserLoadingPathOwner,
  FileBrowserFilter,
  flattenFileBrowserTree,
  forEachWithConcurrencyLimit,
  getResolvedFileBrowserRootState,
  getSettaBadgeRefreshFolderPaths,
  isEditableFileBrowserTarget,
  isOwnedFileBrowserLoadingPath,
  shouldCheckRootWorkspaceInitialization,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshMovedExpandedFolder,
  shouldRefreshRootAfterFileBrowserTransfer,
  shouldRefreshSettaBadgeDataOnToggleChange,
  shouldShowSettaInitializedFolderIcon,
  shouldSkipFileBrowserTransfer,
  sortChildPaths,
};
export type { FileNode };

function resolveFileBrowserStateHook(
  useFileBrowserStateHook: FileBrowserPaneProps["useFileBrowserStateHook"],
) {
  return useFileBrowserStateHook ?? useFileBrowserState;
}

function shouldShowSearchPathTooltips(
  filterText: string,
  isTooltipKeyHeld: boolean,
): boolean {
  return filterText.trim().length > 0 ? isTooltipKeyHeld : false;
}

export function FileBrowserPane({
  onFileOpen,
  onFolderOpen,
  onSelectionChange,
  useFileBrowserStateHook,
  showFilter = true,
  showPathNavigation = true,
  includeSettaInitializedFolders = false,
  showSettaInitializedBadgePill = true,
  allowOutsideWorkspaceRoot = false,
  metaPaddingClassName,
  listInsetLeft = 0,
  columnWidthConfig,
}: FileBrowserPaneProps = {}) {
  const fileBrowserState = resolveFileBrowserStateHook(useFileBrowserStateHook);
  const {
    rootPath,
    expandedPaths,
    selectedPath,
    filterText,
    typeFilters,
    searchScope,
  } = fileBrowserState((state) => ({
    rootPath: state.rootPath,
    expandedPaths: state.expandedPaths,
    selectedPath: state.selectedPath,
    filterText: state.filterText,
    typeFilters: state.typeFilters,
    searchScope: state.searchScope,
  }));
  const [dragTargetFolderPath, setDragTargetFolderPath] = useState<
    string | null
  >(null);
  const {
    isTooltipKeyHeld,
    listRef,
    listWrapperRef,
    pathInputId,
    listHeight,
    listWidth,
    columnWidth,
    handleResizeStart,
    gridTemplateColumns,
  } = useFileBrowserPaneLayout({ columnWidthConfig });

  const {
    nodesByPath,
    nodesByPathRef,
    childrenByPath,
    loadingPaths,
    errorByPath,
    browserRootPath,
    ignorePatterns,
    pathSeparator,
    rootError,
    fetchFolderContents,
    applyRootPath,
  } = useFileBrowserPaneData({
    fileBrowserState,
    rootPath,
    expandedPaths,
    filterText,
    searchScope,
    allowOutsideWorkspaceRoot,
    includeSettaInitializedFolders,
  });
  const { fileUrlMap, requestFileUrls } = useFileBrowserPreviewUrls();
  const { clipboardEntryRef, handleDropIntoFolder, handlePasteClipboard } =
    useFileBrowserTransfer({
      fileBrowserState,
      nodesByPathRef,
      rootPath,
      selectedPath,
      fetchFolderContents,
    });
  const {
    sortKey,
    fileSortDirection,
    dateSortDirection,
    handleSort,
    pathCompletionSource,
    breadcrumbs,
    parentPath,
    displayedItems,
    selectedIndex,
  } = useFileBrowserPaneDerivedState({
    allowOutsideWorkspaceRoot,
    browserRootPath,
    childrenByPath,
    expandedPaths,
    filterText,
    ignorePatterns,
    nodesByPath,
    pathSeparator,
    rootPath,
    searchScope,
    selectedPath,
    showPathNavigation,
    typeFilters,
  });
  const {
    handleToggle,
    handleSelect,
    handleOpen,
    handleNavigateToPath,
    handleKeyDown,
    handleRowsRendered,
  } = useFileBrowserPaneHandlers({
    childrenByPath,
    clipboardEntryRef,
    expandedPaths,
    fetchFolderContents,
    fileBrowserState,
    handlePasteClipboard,
    listRef,
    nodesByPath,
    onFileOpen,
    onFolderOpen,
    onSelectionChange,
    requestFileUrls,
    rootPath,
    selectedIndex,
    displayedItems,
    applyRootPath,
  });

  return (
    <FileBrowserPaneView
      breadcrumbs={breadcrumbs}
      columnWidth={columnWidth}
      displayedItems={displayedItems}
      dragTargetFolderPath={dragTargetFolderPath}
      errorByPath={errorByPath}
      expandedPaths={expandedPaths}
      fileBrowserState={fileBrowserState}
      fileSortDirection={fileSortDirection}
      fileUrlMap={fileUrlMap}
      gridTemplateColumns={gridTemplateColumns}
      handleDropIntoFolder={handleDropIntoFolder}
      handleKeyDown={handleKeyDown}
      handleNavigateToPath={handleNavigateToPath}
      handleOpen={handleOpen}
      handleResizeStart={handleResizeStart}
      handleRowsRendered={handleRowsRendered}
      handleSelect={handleSelect}
      handleSort={handleSort}
      handleToggle={handleToggle}
      includeSettaInitializedFolders={includeSettaInitializedFolders}
      listHeight={listHeight}
      listInsetLeft={listInsetLeft}
      listRef={listRef}
      listWidth={listWidth}
      listWrapperRef={listWrapperRef}
      loadingPaths={loadingPaths}
      metaPaddingClassName={metaPaddingClassName}
      parentPath={parentPath}
      pathCompletionSource={pathCompletionSource}
      pathInputId={pathInputId}
      rootError={rootError}
      rootPath={rootPath}
      selectedPath={selectedPath}
      setDragTargetFolderPath={setDragTargetFolderPath}
      showFilter={showFilter}
      showPathNavigation={showPathNavigation}
      showSearchPathTooltips={shouldShowSearchPathTooltips(
        filterText,
        isTooltipKeyHeld,
      )}
      showSettaInitializedBadgePill={showSettaInitializedBadgePill}
      sortKey={sortKey}
      dateSortDirection={dateSortDirection}
    />
  );
}
