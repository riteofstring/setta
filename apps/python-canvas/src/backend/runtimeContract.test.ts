import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, it } from "vitest";

import {
  ProjectSnapshotValidationError,
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
            targetId: "callable:missing",
          },
        ],
      }),
    ).toThrow(ProjectSnapshotValidationError);
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
