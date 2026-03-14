import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserSearchScope,
  type FileBrowserTypeFilter,
} from "utils/fileBrowserTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../utils";

type FileBrowserState = {
  rootPath: string | null;
  selectedPath: string | null;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  pathSeparator: string;
  ignorePatterns: string[];
  typeFilters: Record<FileBrowserTypeFilter, boolean>;
  searchScope: FileBrowserSearchScope;
};

function createFileBrowserStore() {
  return createWithEqualityFn(
    withResetFn<FileBrowserState>(() => ({
      rootPath: null,
      selectedPath: null,
      expandedPaths: {},
      filterText: "",
      pathSeparator: "/",
      ignorePatterns: [],
      typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
      searchScope: "recursive",
    })),
  );
}

export const useFileBrowserState = createFileBrowserStore();

export const useHomeFileBrowserState = createFileBrowserStore();

export const useBrowserSectionFileBrowserState = createFileBrowserStore();

export const useDropzoneFileBrowserState = createFileBrowserStore();
