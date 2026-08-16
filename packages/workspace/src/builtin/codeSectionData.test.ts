import { describe, expect, it } from "vitest";
import {
  createWorkspaceCodeSectionData,
  getWorkspaceCodeSectionEditorLanguage,
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MODES,
} from "./codeSectionData";

// The built-in code section's data is package-owned, so it is a parsed contract rather than
// opaque host data: every field is required, unknown fields are a typed failure, and a
// registration that narrows its languages narrows what the document may say.

describe("code section data", () => {
  it("creates the reference's code section defaults", () => {
    expect(createWorkspaceCodeSectionData()).toEqual({
      code: "",
      language: "python",
      wrapLines: false,
      lineNumbers: true,
      indentWidth: 4,
      mode: "editable",
    });
  });

  it("accepts every declared mode and rejects anything else", () => {
    for (const mode of WORKSPACE_CODE_SECTION_MODES) {
      const data = createWorkspaceCodeSectionData({ mode });
      expect(parseWorkspaceCodeSectionData("code", data).mode).toBe(mode);
    }
    const { mode: _mode, ...withoutMode } = createWorkspaceCodeSectionData();
    for (const data of [
      withoutMode,
      { ...withoutMode, mode: true },
      { ...withoutMode, mode: "generated" },
    ]) {
      expect(() => parseWorkspaceCodeSectionData("code", data)).toThrow(
        /one of the modes editable, read-only, generated-output/u,
      );
    }
  });

  it("rejects the boolean this mode replaced", () => {
    const { mode: _mode, ...withoutMode } = createWorkspaceCodeSectionData();
    expect(() =>
      parseWorkspaceCodeSectionData("code", {
        ...withoutMode,
        readOnly: true,
      }),
    ).toThrow(/unknown field readOnly/u);
  });

  it("applies explicit creation overrides", () => {
    expect(
      createWorkspaceCodeSectionData({ code: "ls -la", language: "bash" }),
    ).toMatchObject({
      code: "ls -la",
      language: "bash",
    });
  });

  it("parses a complete document payload", () => {
    const data = createWorkspaceCodeSectionData({
      code: "x = 1",
      indentWidth: 2,
    });
    expect(parseWorkspaceCodeSectionData("code", data)).toEqual(data);
  });

  it("accepts every declared language", () => {
    for (const language of WORKSPACE_CODE_SECTION_LANGUAGES) {
      const data = createWorkspaceCodeSectionData({ language });
      expect(parseWorkspaceCodeSectionData("code", data).language).toBe(
        language,
      );
    }
  });

  it("rejects data that is not a record", () => {
    expect(() => parseWorkspaceCodeSectionData("code", undefined)).toThrow(
      /missing its code section data/u,
    );
    expect(() => parseWorkspaceCodeSectionData("code", [])).toThrow(
      /missing its code section data/u,
    );
  });

  it("rejects a missing or mistyped field", () => {
    const { code: _code, ...withoutCode } = createWorkspaceCodeSectionData();
    expect(() => parseWorkspaceCodeSectionData("code", withoutCode)).toThrow(
      /string code field/u,
    );
    expect(() =>
      parseWorkspaceCodeSectionData("code", {
        ...createWorkspaceCodeSectionData(),
        wrapLines: 1,
      }),
    ).toThrow(/boolean wrapLines field/u);
  });

  it("rejects an unknown field", () => {
    expect(() =>
      parseWorkspaceCodeSectionData("code", {
        ...createWorkspaceCodeSectionData(),
        codeFileBinding: null,
      }),
    ).toThrow(/unknown field codeFileBinding/u);
  });

  it("rejects an indent width outside the supported range", () => {
    for (const indentWidth of [0, 9, 2.5]) {
      expect(() =>
        parseWorkspaceCodeSectionData(
          "code",
          createWorkspaceCodeSectionData({ indentWidth }),
        ),
      ).toThrow(/integer indentWidth between 1 and 8/u);
    }
  });

  it("rejects a language outside the registration's allowed list", () => {
    expect(() =>
      parseWorkspaceCodeSectionData(
        "code",
        createWorkspaceCodeSectionData({ language: "bash" }),
        ["python", "json"],
      ),
    ).toThrow(
      /names the language bash, which this registration does not allow/u,
    );
  });

  it("resolves plain text to no language pack", () => {
    expect(getWorkspaceCodeSectionEditorLanguage("plaintext")).toBeNull();
    expect(getWorkspaceCodeSectionEditorLanguage("bash")).toBe("bash");
  });
});
