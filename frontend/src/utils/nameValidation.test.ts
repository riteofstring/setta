import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateParamNameInput,
  validateProjectNameInput,
  validateSectionNameInput,
  validateViewModeNameInput,
  validateWindowSpaceNameInput,
} from "./nameValidation";

type NameValidationCase = {
  name: string;
  error: string | null;
};

type NameValidationFixtures = {
  project: NameValidationCase[];
  section: NameValidationCase[];
  viewMode: NameValidationCase[];
  windowSpace: NameValidationCase[];
  param: NameValidationCase[];
};

const FIXTURE_PATH = fileURLToPath(
  new URL(
    "../../../tests/fixtures/name_validation_cases.json",
    import.meta.url,
  ),
);
const FIXTURES = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf-8"),
) as NameValidationFixtures;

describe("validateViewModeNameInput", () => {
  it("rejects reserved names", () => {
    expect(validateViewModeNameInput("home")).toBeTruthy();
    expect(validateViewModeNameInput("settings")).toBeTruthy();
  });

  it("rejects path separators", () => {
    expect(validateViewModeNameInput("bad/name")).toBeTruthy();
    expect(validateViewModeNameInput("bad\\name")).toBeTruthy();
  });

  it("rejects dotdot segments", () => {
    expect(validateViewModeNameInput("bad..name")).toBeTruthy();
  });

  it("rejects invalid characters", () => {
    expect(validateViewModeNameInput("bad@name")).toBeTruthy();
  });

  it("rejects names invalid after sanitization", () => {
    expect(validateViewModeNameInput("__")).toBeTruthy();
  });

  it("accepts simple names", () => {
    expect(validateViewModeNameInput("Alpha-2 _Beta")).toBeNull();
  });
});

describe("validateWindowSpaceNameInput", () => {
  it("accepts non-project reserved names because the windowspace namespace is explicit", () => {
    expect(validateWindowSpaceNameInput("home")).toBeNull();
    expect(validateWindowSpaceNameInput("settings")).toBeNull();
  });

  it("rejects path separators", () => {
    expect(validateWindowSpaceNameInput("bad/name")).toBeTruthy();
    expect(validateWindowSpaceNameInput("bad\\name")).toBeTruthy();
  });

  it("rejects dotdot segments", () => {
    expect(validateWindowSpaceNameInput("bad..name")).toBeTruthy();
  });

  it("rejects invalid characters", () => {
    expect(validateWindowSpaceNameInput("bad@name")).toBeTruthy();
  });

  it("rejects names invalid after sanitization", () => {
    expect(validateWindowSpaceNameInput("__")).toBeTruthy();
  });

  it("accepts simple names", () => {
    expect(validateWindowSpaceNameInput("Alpha-2 _Beta")).toBeNull();
  });
});

describe("validateParamNameInput", () => {
  it("allows empty param names when empties are allowed", () => {
    expect(
      validateParamNameInput("", {
        allowEmpty: true,
        requirePythonIdentifier: true,
      }),
    ).toBeNull();
  });

  it("rejects empty param names when empties are not allowed", () => {
    expect(
      validateParamNameInput("", {
        allowEmpty: false,
        requirePythonIdentifier: true,
      }),
    ).toBe("Param name cannot be empty.");
  });

  it("skips path checks when requested", () => {
    expect(
      validateParamNameInput("path/to/param", {
        allowEmpty: false,
        requirePythonIdentifier: false,
        skipPathChecks: true,
      }),
    ).toBeNull();
  });
});

describe("name validation matches backend fixtures", () => {
  it("validates project names", () => {
    for (const testCase of FIXTURES.project) {
      expect(validateProjectNameInput(testCase.name)).toBe(testCase.error);
    }
  });

  it("validates section names", () => {
    for (const testCase of FIXTURES.section) {
      expect(validateSectionNameInput(testCase.name)).toBe(testCase.error);
    }
  });

  it("validates view mode names", () => {
    for (const testCase of FIXTURES.viewMode) {
      expect(validateViewModeNameInput(testCase.name)).toBe(testCase.error);
    }
  });

  it("validates window space names", () => {
    for (const testCase of FIXTURES.windowSpace) {
      expect(validateWindowSpaceNameInput(testCase.name)).toBe(testCase.error);
    }
  });

  it("validates param names", () => {
    for (const testCase of FIXTURES.param) {
      expect(
        validateParamNameInput(testCase.name, {
          allowEmpty: true,
          requirePythonIdentifier: true,
        }),
      ).toBe(testCase.error);
    }
  });
});
