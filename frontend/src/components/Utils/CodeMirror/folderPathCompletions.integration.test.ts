import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { route_get_folder_contents } from "utils/generatedEndpoints";
import { createFolderContentItem } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDynamicFolderPathCompletionSource } from "./folderPathCompletions";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_folder_contents: vi.fn(),
}));

const mockedGetFolderContents = vi.mocked(route_get_folder_contents);

function buildContext(text: string, explicit = false) {
  const state = EditorState.create({ doc: text });
  return new CompletionContext(state, text.length, explicit);
}

describe("folder path completions integration", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("refreshes completion cache across mode toggles and supports Windows absolute outside-root paths", async () => {
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
            name: "projects",
            type: "folder",
            fullPath: "C:/Users/projects",
          }),
        ],
        status: 200,
        hasResponse: true,
      });

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
      folderPath: "/root",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: false,
      missingFolderBehavior: "empty",
    });
    expect(mockedGetFolderContents).toHaveBeenNthCalledWith(2, {
      folderPath: "C:/Users",
      ignorePatterns: null,
      maxEntries: null,
      allowOutsideWorkspaceRoot: true,
      missingFolderBehavior: "empty",
    });
  });
});
