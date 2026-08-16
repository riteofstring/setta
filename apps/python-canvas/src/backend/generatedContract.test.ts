import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DIAGNOSTIC_SEVERITY_ERROR_V1,
  DIAGNOSTIC_SEVERITY_INFORMATION_V1,
  DIAGNOSTIC_SEVERITY_WARNING_V1,
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1,
  PROJECT_CALLABLE_COMPLETIONS_PATH_V1,
  PROJECT_PATH_V1,
  PROJECT_SNAPSHOT_VERSION_V1,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
  PROVIDER_BASEDPYRIGHT_V1,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
  type ProjectSnapshotV1,
} from "./generatedContract";
import { parseProjectSnapshotV1 } from "./runtimeContract";

describe("generated V1 contract", () => {
  it("supplies the runtime constants and type used by the frontend boundary", () => {
    const snapshot = parseProjectSnapshotV1(projectSnapshotFixture);

    expect(PROJECT_PATH_V1).toBe("/api/v1/project");
    expect(PROJECT_CALLABLE_COMPLETIONS_PATH_V1).toBe(
      "/api/v1/project/callable/completions",
    );
    expect(snapshot.version).toBe(PROJECT_SNAPSHOT_VERSION_V1);
    expect([
      PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1,
      PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1,
      PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1,
      PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1,
      PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1,
    ]).toEqual([
      "positional_only",
      "positional_or_keyword",
      "keyword_only",
      "variadic_positional",
      "variadic_keyword",
    ]);
    expect([
      DIAGNOSTIC_SEVERITY_ERROR_V1,
      DIAGNOSTIC_SEVERITY_WARNING_V1,
      DIAGNOSTIC_SEVERITY_INFORMATION_V1,
    ]).toEqual(["error", "warning", "information"]);
    expect([
      PROVIDER_BASEDPYRIGHT_V1,
      PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
      PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
    ]).toEqual(["basedpyright", "unavailable", "not_started"]);
    expectTypeOf(snapshot).toEqualTypeOf<ProjectSnapshotV1>();
  });
});
