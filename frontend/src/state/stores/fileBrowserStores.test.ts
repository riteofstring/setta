import { DEFAULT_FILE_BROWSER_TYPE_FILTERS } from "utils/fileBrowserTypes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useBrowserSectionFileBrowserState,
  useDropzoneFileBrowserState,
  useFileBrowserState,
  useHomeFileBrowserState,
} from "./fileBrowserStores";

const fileBrowserStores = [
  useFileBrowserState,
  useHomeFileBrowserState,
  useBrowserSectionFileBrowserState,
  useDropzoneFileBrowserState,
] as const;

describe("fileBrowserStores", () => {
  beforeEach(() => {
    for (const store of fileBrowserStores) {
      store.getState().reset?.();
    }
  });

  it("keeps each extracted file-browser store independent", () => {
    // The four file-browser surfaces share defaults but must not share live
    // mutable state after moving out of definitions.ts.
    useFileBrowserState.setState({
      rootPath: "/workspace",
      selectedPath: "/workspace/readme.md",
    });
    useHomeFileBrowserState.setState({
      filterText: "notes",
    });
    useBrowserSectionFileBrowserState.setState({
      pathSeparator: "\\",
    });
    useDropzoneFileBrowserState.setState({
      ignorePatterns: ["node_modules"],
    });

    expect(useFileBrowserState.getState().rootPath).toBe("/workspace");
    expect(useHomeFileBrowserState.getState().rootPath).toBeNull();
    expect(useHomeFileBrowserState.getState().filterText).toBe("notes");
    expect(useBrowserSectionFileBrowserState.getState().pathSeparator).toBe(
      "\\",
    );
    expect(useDropzoneFileBrowserState.getState().ignorePatterns).toEqual([
      "node_modules",
    ]);
  });

  it("resets extracted file-browser stores back to the shared default state", () => {
    useFileBrowserState.setState({
      rootPath: "/workspace",
      filterText: "src",
      searchScope: "local",
      typeFilters: {
        ...DEFAULT_FILE_BROWSER_TYPE_FILTERS,
        image: false,
      },
    });

    useFileBrowserState.getState().reset?.();

    expect(useFileBrowserState.getState()).toEqual({
      rootPath: null,
      selectedPath: null,
      expandedPaths: {},
      filterText: "",
      pathSeparator: "/",
      ignorePatterns: [],
      typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
      searchScope: "recursive",
      reset: expect.any(Function),
    });
  });
});
