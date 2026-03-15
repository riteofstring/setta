import { describe, expect, it } from "vitest";

import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
} from "utils/generatedTypes";
import { resolveTextBlockImplOverrides } from "./createSectionImplDefaults";

describe("resolveTextBlockImplOverrides", () => {
  it("adds the edit display mode for empty text-block overrides", () => {
    expect(
      resolveTextBlockImplOverrides(SectionTypeEnum.TextBlock, null),
    ).toEqual({
      type: SectionTypeEnum.TextBlock,
      textDisplayMode: TextBlockDisplayModeEnum.Edit,
    });
  });

  it("fills in missing text-block type and display mode", () => {
    expect(
      resolveTextBlockImplOverrides(SectionTypeEnum.TextBlock, {
        text: "hello",
      }),
    ).toEqual({
      type: SectionTypeEnum.TextBlock,
      text: "hello",
      textDisplayMode: TextBlockDisplayModeEnum.Edit,
    });
  });

  it("preserves explicit text-block display mode", () => {
    expect(
      resolveTextBlockImplOverrides(SectionTypeEnum.TextBlock, {
        type: SectionTypeEnum.TextBlock,
        textDisplayMode: TextBlockDisplayModeEnum.Render,
        text: "hello",
      }),
    ).toEqual({
      type: SectionTypeEnum.TextBlock,
      textDisplayMode: TextBlockDisplayModeEnum.Render,
      text: "hello",
    });
  });
});
