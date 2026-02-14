import { describe, expect, it } from "vitest";
import { getLanguageExtensions } from "./getExtensions";

describe("getLanguageExtensions", () => {
  it("returns language support extensions for json and yaml", () => {
    const jsonExtensions = getLanguageExtensions("json", false);
    const yamlExtensions = getLanguageExtensions("yaml", false);

    expect(jsonExtensions).toHaveLength(1);
    expect(yamlExtensions).toHaveLength(1);
    expect(jsonExtensions[0]).not.toBe(yamlExtensions[0]);
  });

  it("returns no language extension for null language", () => {
    expect(getLanguageExtensions(null, false)).toEqual([]);
  });
});
