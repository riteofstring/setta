import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { useHomePageSearch, useProjectSearch } from "./searchStores";

describe("searchStores", () => {
  beforeEach(() => {
    useHomePageSearch.getState().reset?.();
    resetProjectStores();
  });

  it("resets the extracted home-page search store locally", () => {
    useHomePageSearch.setState({ value: "workspace" });

    useHomePageSearch.getState().reset?.();

    expect(useHomePageSearch.getState()).toEqual({
      value: "",
      reset: expect.any(Function),
    });
  });

  it("resets project search through the project store reset path", () => {
    // Project search is still project-scoped after moving to searchStores.ts.
    useProjectSearch.setState({
      codeInfo: [
        {
          sectionId: "section-1",
          paramInfoId: "param-1",
          name: "Prompt",
        },
      ],
      focused: {
        sectionId: "section-1",
        paramInfoId: "param-1",
        name: "Prompt",
      },
      lookup: new Set(["section-1:param-1"]),
    });

    resetProjectStores();

    expect(useProjectSearch.getState()).toEqual({
      codeInfo: [],
      focused: null,
      lookup: new Set(),
      mode: "find",
      reset: expect.any(Function),
    });
  });
});
