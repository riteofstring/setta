import { describe, expect, it } from "vitest";
import { getWorkspaceScopeClassName } from "./workspaceScope.js";

describe("getWorkspaceScopeClassName", () => {
  it("adds the package dark selector only for resolved dark appearance", () => {
    expect(getWorkspaceScopeClassName(false)).toBe("setta-workspace");
    expect(getWorkspaceScopeClassName(true)).toBe(
      "setta-workspace setta-workspace-dark",
    );
  });
});
