import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserSearchScope,
  type FileBrowserTypeFilter,
} from "utils/fileBrowserTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../utils";

export type FileBrowserState = {
  rootPath: string | null;
  selectedPath: string | null;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  pathSeparator: string;
  ignorePatterns: string[];
  typeFilters: Record<FileBrowserTypeFilter, boolean>;
  searchScope: FileBrowserSearchScope;
};

function createDefaultFileBrowserState(): FileBrowserState {
  return {
    rootPath: null,
    selectedPath: null,
    expandedPaths: {},
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    searchScope: "recursive",
  };
}

function createFileBrowserStore() {
  return createWithEqualityFn(
    withResetFn<FileBrowserState>(() => createDefaultFileBrowserState()),
  );
}

export const useFileBrowserState = createFileBrowserStore();
export const useHomeFileBrowserState = createFileBrowserStore();
export const useBrowserSectionFileBrowserState = createFileBrowserStore();
export const useDropzoneFileBrowserState = createFileBrowserStore();
