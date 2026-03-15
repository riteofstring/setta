import { describe, expect, it } from "vitest";
import {
  getSchemaEnumValues,
  getSchemaUiHint,
  getTopLevelPluginConfigFields,
  isSupportedTopLevelPluginConfigField,
  resolveSchemaType,
  setTopLevelPluginConfigValue,
} from "./pluginsPaneConfigSchema";

describe("pluginsPaneConfigSchema", () => {
  it("extracts sorted top-level fields with required metadata", () => {
    expect(
      getTopLevelPluginConfigFields({
        required: ["token"],
        properties: {
          retries: { type: "integer" },
          token: { type: "string", title: "Token" },
        },
      }),
    ).toEqual([
      {
        key: "retries",
        required: false,
        schema: { type: "integer" },
      },
      {
        key: "token",
        required: true,
        schema: { type: "string", title: "Token" },
      },
    ]);
  });

  it("resolves supported primitive and enum-backed fields", () => {
    expect(isSupportedTopLevelPluginConfigField({ type: "boolean" })).toBe(
      true,
    );
    expect(
      isSupportedTopLevelPluginConfigField({
        enum: ["always", "never"],
      }),
    ).toBe(true);
    expect(
      isSupportedTopLevelPluginConfigField({
        type: "object",
      }),
    ).toBe(false);
  });

  it("resolves schema type, enum values, and ui hints from schema objects", () => {
    expect(resolveSchemaType({ type: ["null", "string"] })).toBe("string");
    expect(getSchemaEnumValues({ enum: ["one", 2, true, null] })).toEqual([
      "one",
      2,
      true,
    ]);
    expect(getSchemaUiHint({ "x-setta-ui": "textarea" })).toBe("textarea");
    expect(getSchemaUiHint({ "x-setta-ui": "   " })).toBeNull();
  });

  it("sets and unsets top-level config values without mutating the input", () => {
    const current = {
      token: "abc",
      retries: 3,
    };

    expect(
      setTopLevelPluginConfigValue(current, "token", "next-token"),
    ).toEqual({
      token: "next-token",
      retries: 3,
    });
    expect(setTopLevelPluginConfigValue(current, "token", undefined)).toEqual({
      retries: 3,
    });
    expect(current).toEqual({
      token: "abc",
      retries: 3,
    });
  });
});
