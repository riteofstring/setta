import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, it } from "vitest";

import {
  ProjectSnapshotValidationError,
  parseCallableCompletionResponseV1,
  parseErrorResponseV1,
  parseProjectSnapshotV1,
} from "./runtimeContract";

describe("parseProjectSnapshotV1", () => {
  it("accepts the Go-produced V1 fixture through the production boundary", () => {
    const snapshot = parseProjectSnapshotV1(projectSnapshotFixture);

    expect(snapshot).toEqual(projectSnapshotFixture);
  });

  it("rejects unsupported versions, closed-shape violations, and invalid values", () => {
    expect(() =>
      parseProjectSnapshotV1({ ...projectSnapshotFixture, version: "v2" }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({ ...projectSnapshotFixture, unexpected: true }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        project: { ...projectSnapshotFixture.project, revision: 1.5 },
      }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        providerStatus: {
          ...projectSnapshotFixture.providerStatus,
          state: "running",
        },
      }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        diagnostics: {},
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });

  it("accepts explicit available, pending, and failed provider states", () => {
    expect(
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        providerStatus: {
          provider: "basedpyright",
          status: "available",
          state: "ready",
        },
      }).providerStatus,
    ).toEqual({
      provider: "basedpyright",
      status: "available",
      state: "ready",
    });

    expect(
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        providerStatus: {
          provider: "basedpyright",
          status: "available",
          state: "pending",
        },
      }).providerStatus,
    ).toEqual({
      provider: "basedpyright",
      status: "available",
      state: "pending",
    });

    expect(
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        providerStatus: {
          provider: "basedpyright",
          status: "unavailable",
          state: "failed",
        },
      }).providerStatus,
    ).toEqual({
      provider: "basedpyright",
      status: "unavailable",
      state: "failed",
    });
  });

  it("rejects dangling IDs, invalid ranges, and dangling diagnostic targets", () => {
    const [callable] = projectSnapshotFixture.callables;
    if (callable === undefined) {
      throw new Error("The Go fixture must contain a callable.");
    }

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        callables: [{ ...callable, parameterIds: ["parameter:missing"] }],
      }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        generatedCode: {
          ...projectSnapshotFixture.generatedCode,
          code: "x",
          sourceRanges: [
            {
              targetId: projectSnapshotFixture.project.id,
              start: 1,
              end: 0,
            },
          ],
        },
      }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        diagnostics: [
          {
            id: "diagnostic:missing-target",
            severity: "error",
            message: "Missing target.",
            start: 0,
            end: 0,
            targetId: "callable:missing",
          },
        ],
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });

  it("accepts targetless document diagnostics and enforces UTF-8 byte boundaries", () => {
    const documentDiagnostic = {
      id: "diagnostic:document",
      severity: "error",
      message: "Undefined name.",
      start: 0,
      end: 2,
      targetId: null,
    };
    const snapshot = {
      ...projectSnapshotFixture,
      generatedCode: {
        body: "",
        code: "π",
        sourceRanges: [],
      },
      diagnostics: [documentDiagnostic],
    };

    expect(parseProjectSnapshotV1(snapshot).diagnostics).toEqual([
      documentDiagnostic,
    ]);
    expect(() =>
      parseProjectSnapshotV1({
        ...snapshot,
        diagnostics: [{ ...documentDiagnostic, start: 1 }],
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });

  // A parameter record says explicitly whether its name is the app's to write, and an authored
  // record may still be unnamed. Everything else about the record stays closed.
  it("parses a parameter record's declared name ownership and blank authored name", () => {
    const [callable] = projectSnapshotFixture.callables;
    if (callable === undefined) {
      throw new Error("The Go fixture must contain a callable.");
    }
    const parameter = {
      authoredExpression: "",
      default: null,
      id: "parameter:authored:1",
      name: "",
      nameEditable: true,
      passingStyle: "positional_or_keyword",
      typeAnnotation: "",
    };
    const withParameter = {
      ...projectSnapshotFixture,
      callables: [{ ...callable, parameterIds: [parameter.id] }],
      parameters: [parameter],
    };

    expect(parseProjectSnapshotV1(withParameter).parameters[0]).toEqual(
      parameter,
    );

    const { nameEditable: _declared, ...withoutNameOwnership } = parameter;
    for (const invalid of [
      { ...parameter, nameEditable: "yes" },
      { ...parameter, name: " scale " },
      { ...parameter, extra: true },
      withoutNameOwnership,
    ]) {
      expect(() =>
        parseProjectSnapshotV1({ ...withParameter, parameters: [invalid] }),
      ).toThrow(ProjectSnapshotValidationError);
    }
  });

  it("requires exactly one callable at the unknown JSON boundary", () => {
    const [callable] = projectSnapshotFixture.callables;
    if (callable === undefined) {
      throw new Error("The Go fixture must contain a callable.");
    }

    expect(() =>
      parseProjectSnapshotV1({ ...projectSnapshotFixture, callables: [] }),
    ).toThrow(ProjectSnapshotValidationError);

    expect(() =>
      parseProjectSnapshotV1({
        ...projectSnapshotFixture,
        callables: [
          callable,
          { ...callable, id: "callable:other", name: "Other" },
        ],
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });
});

describe("parseErrorResponseV1", () => {
  it("accepts only the generated V1 error shape", () => {
    expect(
      parseErrorResponseV1({
        error: {
          code: "provider_unavailable",
          message: "Basedpyright is unavailable",
        },
      }),
    ).toEqual({
      error: {
        code: "provider_unavailable",
        message: "Basedpyright is unavailable",
      },
    });

    expect(() =>
      parseErrorResponseV1({
        error: { code: "unknown", message: "Unavailable" },
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });
});

describe("parseCallableCompletionResponseV1", () => {
  it("accepts only the exact declared completion response shape", () => {
    expect(
      parseCallableCompletionResponseV1({
        items: [{ label: "sqrt", insertText: "sqrt" }],
      }),
    ).toEqual({
      items: [{ label: "sqrt", insertText: "sqrt" }],
    });
    expect(parseCallableCompletionResponseV1({ items: [] })).toEqual({
      items: [],
    });
  });

  it("rejects unknown, missing, and blank completion fields", () => {
    for (const response of [
      { items: [{ label: "sqrt" }] },
      { items: [{ label: "sqrt", insertText: "sqrt", unexpected: true }] },
      { items: [{ label: " ", insertText: "sqrt" }] },
      { items: {} },
      { items: [], unexpected: true },
    ]) {
      expect(() => parseCallableCompletionResponseV1(response)).toThrow(
        ProjectSnapshotValidationError,
      );
    }
  });
});
