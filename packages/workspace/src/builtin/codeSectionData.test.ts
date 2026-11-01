import { describe, expect, it } from "vitest";
import {
  createWorkspaceCodeSectionData,
  getWorkspaceCodeSectionEditorLanguage,
  parseWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MODES,
  type WorkspaceCodeSectionMode,
} from "./codeSectionData.js";
import type { WorkspaceSectionData } from "../document/types.js";

const GENERATED_PREFIX = "import math";
const GENERATED_SUFFIX = "state = value";
const GENERATED_CODE = `${GENERATED_PREFIX}\n\nvalue = math.sqrt(3)\n\n${GENERATED_SUFFIX}`;
const GENERATED_REGION = {
  from: GENERATED_PREFIX.length,
  to: GENERATED_CODE.length - GENERATED_SUFFIX.length,
};

function makeModeData(mode: WorkspaceCodeSectionMode) {
  return mode === "generated-document"
    ? createWorkspaceCodeSectionData({
        code: GENERATED_CODE,
        generatedRegion: GENERATED_REGION,
        mode,
      })
    : createWorkspaceCodeSectionData({ mode });
}

function makeGeneratedData(generatedRegion: WorkspaceSectionData | undefined): {
  [key: string]: WorkspaceSectionData;
} {
  return {
    ...createWorkspaceCodeSectionData({ code: GENERATED_CODE }),

    ...(generatedRegion === undefined ? {} : { generatedRegion }),
    mode: "generated-document",
  };
}

describe("code section data", () => {
  it("creates the reference's code section defaults", () => {
    expect(createWorkspaceCodeSectionData()).toEqual({
      code: "",
      diagnostics: [],
      language: "python",
      wrapLines: false,
      lineNumbers: true,
      indentWidth: 4,
      mode: "editable",
    });
  });

  it("accepts every declared mode and rejects anything else", () => {
    for (const mode of WORKSPACE_CODE_SECTION_MODES) {
      const data = makeModeData(mode);
      expect(parseWorkspaceCodeSectionData("code", data)).toEqual(data);
    }
    const { mode: _mode, ...withoutMode } = createWorkspaceCodeSectionData();
    for (const data of [
      withoutMode,
      { ...withoutMode, mode: true },
      { ...withoutMode, mode: "generated" },

      { ...withoutMode, mode: "generated-output" },
    ]) {
      expect(() => parseWorkspaceCodeSectionData("code", data)).toThrow(
        /one of the modes editable, read-only, generated-document/u,
      );
    }
  });

  it("requires one region inside the document it paints", () => {
    const document = makeGeneratedData(GENERATED_REGION);
    expect(parseWorkspaceCodeSectionData("code", document)).toEqual(document);

    const requirement = new RegExp(
      `generated region of integer from/to offsets where 0 <= from < to <= ${String(GENERATED_CODE.length)}`,
      "u",
    );
    const malformedRegions: ReadonlyArray<WorkspaceSectionData | undefined> = [
      undefined,
      null,
      "0-4",

      { from: 4, to: 4 },
      { from: 9, to: 4 },
      { from: 0.5, to: 4 },
      { from: -1, to: 4 },
      { from: 0, to: GENERATED_CODE.length + 1 },
      { from: 0 },
    ];
    for (const region of malformedRegions) {
      expect(() =>
        parseWorkspaceCodeSectionData("code", makeGeneratedData(region)),
      ).toThrow(requirement);
    }
    expect(() =>
      parseWorkspaceCodeSectionData(
        "code",
        makeGeneratedData({ from: 0, length: 4, to: 4 }),
      ),
    ).toThrow(/generated region carries the unknown field length/u);
  });

  it("rejects a region on a mode that does not paint one", () => {
    for (const mode of ["editable", "read-only"]) {
      expect(() =>
        parseWorkspaceCodeSectionData("code", {
          ...makeGeneratedData(GENERATED_REGION),
          mode,
        }),
      ).toThrow(
        new RegExp(`carries a generated region on its ${mode} mode`, "u"),
      );
    }
  });

  it("rejects the boolean this mode replaced", () => {
    expect(() =>
      parseWorkspaceCodeSectionData("code", {
        ...createWorkspaceCodeSectionData(),
        readOnly: true,
      }),
    ).toThrow(/unknown field readOnly/u);
  });

  it("applies explicit creation overrides", () => {
    expect(
      createWorkspaceCodeSectionData({
        code: "ls -la",
        diagnostics: [
          {
            from: 0,
            message: "Unknown command.",
            severity: "warning",
            to: 2,
          },
        ],
        language: "bash",
      }),
    ).toMatchObject({
      code: "ls -la",
      diagnostics: [
        {
          from: 0,
          message: "Unknown command.",
          severity: "warning",
          to: 2,
        },
      ],
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

  it("validates document-local diagnostics against the code they describe", () => {
    const code = "𝜋 = 1";
    const valid = createWorkspaceCodeSectionData({
      code,
      diagnostics: [
        {
          from: 0,
          message: "Undefined name 𝜋.",
          severity: "error",

          to: 2,
        },
        {
          from: code.length,
          message: "End marker.",
          severity: "info",
          to: code.length,
        },
      ],
    });
    expect(parseWorkspaceCodeSectionData("code", valid)).toEqual(valid);

    for (const diagnostics of [
      null,
      [{ from: -1, message: "Bad start.", severity: "error", to: 0 }],
      [{ from: 2, message: "Reversed.", severity: "error", to: 1 }],
      [{ from: 0, message: " ", severity: "error", to: 1 }],
      [{ from: 0, message: "Unsupported.", severity: "fatal", to: 1 }],
      [
        {
          from: 0,
          message: "Extra.",
          severity: "error",
          to: 1,
          targetId: null,
        },
      ],
    ]) {
      expect(() =>
        parseWorkspaceCodeSectionData("code", {
          ...valid,
          diagnostics,
        }),
      ).toThrow(/diagnostic|diagnostics/u);
    }
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
    const { diagnostics: _diagnostics, ...withoutDiagnostics } =
      createWorkspaceCodeSectionData();
    expect(() =>
      parseWorkspaceCodeSectionData("code", withoutDiagnostics),
    ).toThrow(/diagnostics array/u);
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
