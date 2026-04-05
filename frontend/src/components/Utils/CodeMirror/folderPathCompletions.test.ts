import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  getFolderContents,
  type FilebrowserFolderContentItem,
} from "openapi/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDynamicFolderPathCompletionSource,
  createFolderPathCompletionSource,
} from "./folderPathCompletions";

vi.mock("openapi/http", () => ({
  getFolderContents: vi.fn(),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

const mockedGetFolderContents = vi.mocked(getFolderContents);

function buildContext(text: string, explicit = false) {
  const state = EditorState.create({ doc: text });
  return new CompletionContext(state, text.length, explicit);
}

function buildFolderContentsResponse(
  folderPath: string,
  items: FilebrowserFolderContentItem[],
) {
  return {
    data: {
      folderPath,
      items,
    },
    status: 200,
    hasResponse: true,
  };
}

function createFolderContentItem(
  options: Partial<FilebrowserFolderContentItem> = {},
): FilebrowserFolderContentItem {
  return {
    fullPath: "",
    name: "",
    type: "file",
    ...options,
  };
}

describe("createFolderPathCompletionSource", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("returns null when root path is missing", async () => {
    const source = createFolderPathCompletionSource({
      rootPath: null,
    });
    expect(source).toBeNull();
  });

  it("returns folder completions for the current directory", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("/root", [
        createFolderContentItem({
          name: "alpha",
          type: "folder",
          fullPath: "/root/alpha",
        }),
        createFolderContentItem({
          name: "beta",
          type: "folder",
          fullPath: "/root/beta",
        }),
        createFolderContentItem({
          name: "file.txt",
          type: "file",
          fullPath: "/root/file.txt",
        }),
      ]),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "/root",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/root/a"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: null,
        folderPath: "/root",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: false,
        missingFolderBehavior: "empty",
      },
    });
    expect(result?.options.map((option) => option.label)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(result?.options[0].apply).toBe("alpha/");
    expect(result?.from).toBe("/root/".length);
  });

  it("returns null for absolute paths outside the root", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("/etc", []),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "/root/project",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/etc/"));
    expect(result).toBeNull();
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: null,
        folderPath: "/etc",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: false,
        missingFolderBehavior: "empty",
      },
    });
  });

  it("supports absolute completions outside the root when enabled", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("/Users", [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "/Users/projects",
        }),
      ]),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "/root/project",
      allowOutsideWorkspaceRoot: true,
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/Users/p"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: null,
        folderPath: "/Users",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: true,
        missingFolderBehavior: "empty",
      },
    });
    expect(result?.options.map((option) => option.label)).toEqual(["projects"]);
  });

  it("supports outside-root Windows absolute completions when enabled", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("C:/Users", [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "C:/Users/projects",
        }),
      ]),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "C:\\workspace\\repo",
      allowOutsideWorkspaceRoot: true,
      pathSeparator: "\\",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("C:\\Users\\p"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: null,
        folderPath: "C:/Users",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: true,
        missingFolderBehavior: "empty",
      },
    });
    expect(result?.options[0].apply).toBe("projects\\");
  });

  it("uses backslashes when completing Windows-style paths", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("C:/repo", [
        createFolderContentItem({
          name: "src",
          type: "folder",
          fullPath: "C:\\repo\\src",
        }),
      ]),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "C:\\repo",
      pathSeparator: "\\",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("C:\\repo\\s"));
    expect(result?.options[0].apply).toBe("src\\");
  });

  it("resolves relative completions against the backend base folder", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("/root/src", [
        createFolderContentItem({
          name: "components",
          type: "folder",
          fullPath: "/root/src/components",
        }),
      ]),
    );

    const source = createFolderPathCompletionSource({
      rootPath: "/root",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("src/c"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: "/root",
        folderPath: "src",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: false,
        missingFolderBehavior: "empty",
      },
    });
    expect(result?.options.map((option) => option.label)).toEqual([
      "components",
    ]);
  });
});

describe("createDynamicFolderPathCompletionSource", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("invalidates cache when allowOutsideWorkspaceRoot changes", async () => {
    mockedGetFolderContents
      .mockResolvedValueOnce(
        buildFolderContentsResponse("/root", [
          createFolderContentItem({
            name: "alpha",
            type: "folder",
            fullPath: "/root/alpha",
          }),
        ]),
      )
      .mockResolvedValueOnce(
        buildFolderContentsResponse("/root", [
          createFolderContentItem({
            name: "beta",
            type: "folder",
            fullPath: "/root/beta",
          }),
        ]),
      );

    const options = {
      rootPath: "/root",
      allowOutsideWorkspaceRoot: false,
    };
    const source = createDynamicFolderPathCompletionSource(() => options);

    const first = await source(buildContext("/root/a"));
    expect(first?.options.map((option) => option.label)).toEqual(["alpha"]);
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(1, {
      body: {
        baseFolderPath: null,
        folderPath: "/root",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: false,
        missingFolderBehavior: "empty",
      },
    });

    options.allowOutsideWorkspaceRoot = true;
    const second = await source(buildContext("/root/a"));
    expect(second?.options.map((option) => option.label)).toEqual(["beta"]);
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(2, {
      body: {
        baseFolderPath: null,
        folderPath: "/root",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: true,
        missingFolderBehavior: "empty",
      },
    });
  });

  it("supports outside-root Windows absolute completions", async () => {
    mockedGetFolderContents.mockResolvedValue(
      buildFolderContentsResponse("C:/Users", [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "C:/Users/projects",
        }),
      ]),
    );

    const source = createDynamicFolderPathCompletionSource(() => ({
      rootPath: "/workspace/project",
      allowOutsideWorkspaceRoot: true,
      pathSeparator: "\\",
    }));

    const result = await source(buildContext("C:\\Users\\p"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      body: {
        baseFolderPath: null,
        folderPath: "C:/Users",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: true,
        missingFolderBehavior: "empty",
      },
    });
    expect(result?.options[0].apply).toBe("projects\\");
  });
});
