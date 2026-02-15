import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { route_get_folder_contents } from "utils/generatedEndpoints";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFolderPathCompletionSource } from "./folderPathCompletions";

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
        { name: "alpha", type: "folder", fullPath: "/root/alpha" },
        { name: "beta", type: "folder", fullPath: "/root/beta" },
        { name: "file.txt", type: "file", fullPath: "/root/file.txt" },
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

  it("uses backslashes when completing Windows-style paths", async () => {
    mockedGetFolderContents.mockResolvedValue({
      data: [{ name: "src", type: "folder", fullPath: "C:\\repo\\src" }],
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
