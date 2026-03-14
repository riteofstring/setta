import { C } from "utils/c";
import {
  buildSharePath,
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  pathRelativeToProject,
  resolveHomePath,
  SETTINGS_ROUTER_PATH,
} from "utils/constants/routes";
import { describe, expect, it } from "vitest";

describe("route path helpers", () => {
  it("uses the index route when no target project is provided", () => {
    expect(buildSharePath(null)).toBe(INDEX_ROUTER_PATH);
    expect(buildSharePath(undefined)).toBe(INDEX_ROUTER_PATH);
  });

  it("builds a direct share path when a project name is provided", () => {
    expect(buildSharePath("alpha-project")).toBe("/alpha-project");
  });

  it("keeps the home route stable regardless of current pathname", () => {
    expect(resolveHomePath("/anywhere")).toBe(HOME_ROUTER_PATH);
  });

  it("builds project-relative navigation paths", () => {
    expect(pathRelativeToProject("alpha-project")).toBe("../alpha-project");
  });

  it("keeps settings path aligned with the canonical settings project name", () => {
    expect(SETTINGS_ROUTER_PATH).toBe(`/${C.SETTINGS_PROJECT_NAME}`);
  });
});
