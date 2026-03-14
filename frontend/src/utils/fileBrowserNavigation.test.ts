import { describe, expect, it } from "vitest";
import {
  buildFileBrowserBreadcrumbs,
  getFileBrowserParentPath,
} from "./fileBrowserNavigation";

describe("fileBrowserNavigation", () => {
  it("builds breadcrumbs relative to the configured browser root", () => {
    expect(
      buildFileBrowserBreadcrumbs({
        rootPath: "/workspace",
        currentPath: "/workspace/src/components",
      }),
    ).toEqual([
      { label: "workspace", path: "/workspace" },
      { label: "src", path: "/workspace/src" },
      { label: "components", path: "/workspace/src/components" },
    ]);
  });

  it("keeps slash roots readable when deriving ancestors", () => {
    expect(
      buildFileBrowserBreadcrumbs({
        rootPath: "/",
        currentPath: "/tmp/project",
      }),
    ).toEqual([
      { label: "/", path: "/" },
      { label: "tmp", path: "/tmp" },
      { label: "project", path: "/tmp/project" },
    ]);
  });

  it("returns the parent path without escaping the configured root", () => {
    // The up-navigation control should stop at the browser root.
    expect(
      getFileBrowserParentPath({
        rootPath: "/workspace",
        currentPath: "/workspace/src/components",
      }),
    ).toBe("/workspace/src");
    expect(
      getFileBrowserParentPath({
        rootPath: "/workspace",
        currentPath: "/workspace",
      }),
    ).toBeNull();
  });

  it("normalizes windows separators before deriving ancestors", () => {
    expect(
      buildFileBrowserBreadcrumbs({
        rootPath: "C:\\repo",
        currentPath: "C:\\repo\\src\\utils",
      }),
    ).toEqual([
      { label: "repo", path: "C:/repo" },
      { label: "src", path: "C:/repo/src" },
      { label: "utils", path: "C:/repo/src/utils" },
    ]);
  });
});
