import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  getFolderContents,
  type FilebrowserFolderContentItem,
} from "openapi/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDynamicFolderPathCompletionSource } from "./folderPathCompletions";

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

describe("folder path completions integration", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("refreshes completion cache across mode toggles and supports Windows absolute outside-root paths", async () => {
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
        buildFolderContentsResponse("C:/Users", [
          createFolderContentItem({
            name: "projects",
            type: "folder",
            fullPath: "C:/Users/projects",
          }),
        ]),
      );

    const options = {
      rootPath: "/root",
      allowOutsideWorkspaceRoot: false,
      pathSeparator: "\\",
    };
    const source = createDynamicFolderPathCompletionSource(() => options);

    const insideRoot = await source(buildContext("/root/a"));
    expect(insideRoot?.options.map((option) => option.label)).toEqual([
      "alpha",
    ]);

    options.allowOutsideWorkspaceRoot = true;
    const outsideRoot = await source(buildContext("C:\\Users\\p"));
    expect(outsideRoot?.options.map((option) => option.label)).toEqual([
      "projects",
    ]);
    expect(outsideRoot?.options[0].apply).toBe("projects\\");

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
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(2, {
      body: {
        baseFolderPath: null,
        folderPath: "C:/Users",
        ignorePatterns: null,
        maxEntries: null,
        allowOutsideWorkspaceRoot: true,
        missingFolderBehavior: "empty",
      },
    });
  });
});
