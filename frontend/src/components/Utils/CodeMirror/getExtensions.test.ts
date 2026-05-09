import { describe, expect, it } from "vitest";
import { getExtensions } from "./getExtensions";

describe("getExtensions", () => {
  it("includes distinct language support extensions for json, yaml, and toml", () => {
    const jsonExtensions = getExtensions({
      language: "json",
      wrapLines: false,
    });
    const yamlExtensions = getExtensions({
      language: "yaml",
      wrapLines: false,
    });
    const tomlExtensions = getExtensions({
      language: "toml",
      wrapLines: false,
    });
    const noLanguageExtensions = getExtensions({
      language: null,
      wrapLines: false,
    });

    expect(jsonExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(yamlExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(tomlExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(jsonExtensions[1]).not.toBe(yamlExtensions[1]);
    expect(tomlExtensions[1]).not.toBe(yamlExtensions[1]);
  });

  it("omits language support when no language is provided", () => {
    expect(getExtensions({ language: null, wrapLines: false })).toHaveLength(2);
  });
});
