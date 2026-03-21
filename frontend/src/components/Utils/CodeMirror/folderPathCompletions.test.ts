import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { route_get_folder_contents } from "utils/generatedEndpoints";
import { createFolderContentItem } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDynamicFolderPathCompletionSource,
  createFolderPathCompletionSource,
} from "./folderPathCompletions";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_folder_contents: vi.fn(),
}));

const mockedGetFolderContents = vi.mocked(route_get_folder_contents);

function buildContext(text: string, explicit = false) {
  const state = EditorState.create({ doc: text });
  return new CompletionContext(state, text.length, explicit);
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
    mockedGetFolderContents.mockResolvedValue({
      data: [
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
      ],
      status: 200,
      hasResponse: true,
    });

    const source = createFolderPathCompletionSource({
      rootPath: "/root",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/root/a"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      folderPath: "/root",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: false,
      missingFolderBehavior: "empty",
    });
    expect(result?.options.map((option) => option.label)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(result?.options[0].apply).toBe("alpha/");
    expect(result?.from).toBe("/root/".length);
  });

  it("returns null for absolute paths outside the root", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [],
      status: 200,
      hasResponse: true,
    });

    const source = createFolderPathCompletionSource({
      rootPath: "/root/project",
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/etc/"));
    expect(result).toBeNull();
    expect(mockedGetFolderContents).not.toHaveBeenCalled();
  });

  it("supports absolute completions outside the root when enabled", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "/Users/projects",
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const source = createFolderPathCompletionSource({
      rootPath: "/root/project",
      allowOutsideWorkspaceRoot: true,
    });
    if (!source) {
      throw new Error("Missing completion source.");
    }

    const result = await source(buildContext("/Users/p"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      folderPath: "/Users",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: true,
      missingFolderBehavior: "empty",
    });
    expect(result?.options.map((option) => option.label)).toEqual(["projects"]);
  });

  it("supports outside-root Windows absolute completions when enabled", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "C:/Users/projects",
        }),
      ],
      status: 200,
      hasResponse: true,
    });

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
      folderPath: "C:/Users",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: true,
      missingFolderBehavior: "empty",
    });
    expect(result?.options[0].apply).toBe("projects\\");
  });

  it("uses backslashes when completing Windows-style paths", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [
        createFolderContentItem({
          name: "src",
          type: "folder",
          fullPath: "C:\\repo\\src",
        }),
      ],
      status: 200,
      hasResponse: true,
    });

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
});

describe("createDynamicFolderPathCompletionSource", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("invalidates cache when allowOutsideWorkspaceRoot changes", async () => {
    mockedGetFolderContents
      .mockResolvedValueOnce({
        data: [
          createFolderContentItem({
            name: "alpha",
            type: "folder",
            fullPath: "/root/alpha",
          }),
        ],
        status: 200,
        hasResponse: true,
      })
      .mockResolvedValueOnce({
        data: [
          createFolderContentItem({
            name: "beta",
            type: "folder",
            fullPath: "/root/beta",
          }),
        ],
        status: 200,
        hasResponse: true,
      });

    const options = {
      rootPath: "/root",
      allowOutsideWorkspaceRoot: false,
    };
    const source = createDynamicFolderPathCompletionSource(() => options);

    const first = await source(buildContext("/root/a"));
    expect(first?.options.map((option) => option.label)).toEqual(["alpha"]);
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(1, {
      folderPath: "/root",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: false,
      missingFolderBehavior: "empty",
    });

    options.allowOutsideWorkspaceRoot = true;
    const second = await source(buildContext("/root/a"));
    expect(second?.options.map((option) => option.label)).toEqual(["beta"]);
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(2, {
      folderPath: "/root",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: true,
      missingFolderBehavior: "empty",
    });
  });

  it("supports outside-root Windows absolute completions", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [
        createFolderContentItem({
          name: "projects",
          type: "folder",
          fullPath: "C:/Users/projects",
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const source = createDynamicFolderPathCompletionSource(() => ({
      rootPath: "/workspace/project",
      allowOutsideWorkspaceRoot: true,
      pathSeparator: "\\",
    }));

    const result = await source(buildContext("C:\\Users\\p"));
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      folderPath: "C:/Users",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: true,
      missingFolderBehavior: "empty",
    });
    expect(result?.options[0].apply).toBe("projects\\");
  });
});
