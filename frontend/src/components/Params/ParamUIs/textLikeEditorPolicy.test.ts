import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveTextLikeParamEditorPolicy } from "./textLikeEditorPolicy";

describe("resolveTextLikeParamEditorPolicy", () => {
  it("maps TextParam to an explicit single-line policy", () => {
    expect(
      resolveTextLikeParamEditorPolicy({
        codeObjType: CodeObjTypeEnum.TextParam,
        configLanguage: "python",
      }),
    ).toEqual({
      editorKind: "text",
      language: "python",
      linePolicy: "single-line",
      maxVisibleLines: 1,
      minVisibleLines: 1,
      wrapLines: false,
    });
  });

  it("maps code and textarea params to fixed multiline policies", () => {
    expect(
      resolveTextLikeParamEditorPolicy({
        codeObjType: CodeObjTypeEnum.CodeParam,
        configLanguage: "python",
      }),
    ).toMatchObject({
      editorKind: "code",
      linePolicy: "multiline-fixed",
      minVisibleLines: 4,
      wrapLines: true,
    });
    expect(
      resolveTextLikeParamEditorPolicy({
        codeObjType: CodeObjTypeEnum.TextAreaParam,
        configLanguage: "python",
      }),
    ).toMatchObject({
      editorKind: "textarea",
      linePolicy: "multiline-fixed",
      minVisibleLines: 4,
      wrapLines: true,
    });
  });
});
