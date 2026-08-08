import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildStandaloneWindowSpacePath,
  resolveStandaloneWindowSpaceSlug,
} from "./windowSpacePaths";

describe("windowSpacePaths", () => {
  it("resolves a saved window space by canonical slug", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-id": {
            id: "space-id",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "found",
      windowSpaceId: "space-id",
      windowSpace: state.projectConfig.windowSpaces["space-id"],
    });
  });

  it("uses the explicit windowspace namespace when building paths", () => {
    expect(buildStandaloneWindowSpacePath("demo", "Research Board")).toBe(
      "/demo/windowspace/research_board",
    );
  });

  it("treats empty window-space state as not found", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    };

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "not_found",
      windowSpaceSlug: "research_board",
    });
  });

  it("reports ambiguous slugs instead of guessing when duplicates exist", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-a": {
            id: "space-a",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
          "space-b": {
            id: "space-b",
            name: "research_board",
            sortIndex: 1,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "ambiguous",
      windowSpaceSlug: "research_board",
      windowSpaceIds: ["space-a", "space-b"],
    });
  });

  it("rebuilds the slug index after an in-place rename", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-id": {
            id: "space-id",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "found",
      windowSpaceId: "space-id",
      windowSpace:
        state.projectConfig.windowSpaces["space-id"] ??
        (() => {
          throw new Error("Expected a saved window space.");
        })(),
    });

    state.projectConfig.windowSpaces["space-id"].name = "Planning Board";

    expect(resolveStandaloneWindowSpaceSlug(state, "planning_board")).toEqual({
      kind: "found",
      windowSpaceId: "space-id",
      windowSpace:
        state.projectConfig.windowSpaces["space-id"] ??
        (() => {
          throw new Error("Expected a renamed window space.");
        })(),
    });
    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "not_found",
      windowSpaceSlug: "research_board",
    });
  });

  it("rebuilds the slug index after an in-place delete", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-id": {
            id: "space-id",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "found",
      windowSpaceId: "space-id",
      windowSpace: state.projectConfig.windowSpaces["space-id"],
    });

    delete state.projectConfig.windowSpaces["space-id"];

    expect(resolveStandaloneWindowSpaceSlug(state, "research_board")).toEqual({
      kind: "not_found",
      windowSpaceSlug: "research_board",
    });
  });
});
