import { describe, expect, it } from "vitest";
import { sortChildPaths, type FileNode } from "./FileBrowserPane";

function buildNode(
  name: string,
  type: "folder" | "file",
  mtime: number,
): FileNode {
  return {
    name,
    fullPath: name,
    type,
    parentPath: "/root",
    mtime,
  };
}

describe("sortChildPaths", () => {
  it("sorts by name with folders first", () => {
    const nodesByPath: Record<string, FileNode> = {
      "folder": buildNode("folder", "folder", 10),
      "b.txt": buildNode("b.txt", "file", 20),
      "A.txt": buildNode("A.txt", "file", 30),
      "c.txt": buildNode("c.txt", "file", 40),
    };
    const paths = ["b.txt", "folder", "c.txt", "A.txt"];

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "name",
        sortDirection: "asc",
      }),
    ).toEqual(["folder", "A.txt", "b.txt", "c.txt"]);

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "name",
        sortDirection: "desc",
      }),
    ).toEqual(["folder", "c.txt", "b.txt", "A.txt"]);
  });

  it("sorts by modified date with folders first", () => {
    const nodesByPath: Record<string, FileNode> = {
      "folder": buildNode("folder", "folder", 5),
      "old.txt": buildNode("old.txt", "file", 100),
      "new.txt": buildNode("new.txt", "file", 300),
    };
    const paths = ["old.txt", "new.txt", "folder"];

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "modified",
        sortDirection: "asc",
      }),
    ).toEqual(["folder", "old.txt", "new.txt"]);

    expect(
      sortChildPaths({
        paths,
        nodesByPath,
        sortKey: "modified",
        sortDirection: "desc",
      }),
    ).toEqual(["folder", "new.txt", "old.txt"]);
  });
});
