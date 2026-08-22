import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { describe, expect, it } from "vitest";

import {
  ProjectSnapshotValidationError,
  parseCompletionResponseV2,
  parseErrorResponseV2,
  parseProjectSnapshotV2,
} from "./runtimeContract";

describe("parseProjectSnapshotV2", () => {
  it("accepts the Go-produced blank project fixture", () => {
    expect(parseProjectSnapshotV2(projectSnapshotFixture)).toEqual(
      projectSnapshotFixture,
    );
  });

  it("rejects unsupported versions and closed-shape violations", () => {
    for (const malformed of [
      { ...projectSnapshotFixture, version: "unsupported" },
      { ...projectSnapshotFixture, unexpected: true },
      {
        ...projectSnapshotFixture,
        diagnostics: {},
      },
      {
        ...projectSnapshotFixture,
        providerStatus: {
          provider: "basedpyright",
          state: "ready",
          status: "unavailable",
        },
      },
      {
        ...projectSnapshotFixture,
        generatedCode: {
          ...projectSnapshotFixture.generatedCode,
          generatedBodyRange: { start: 1, end: 57 },
        },
      },
    ]) {
      expect(() => parseProjectSnapshotV2(malformed)).toThrow(
        ProjectSnapshotValidationError,
      );
    }
  });

  it("strictly parses dynamic nested callables and parameter ownership", () => {
    const snapshot = dynamicSnapshot();

    expect(parseProjectSnapshotV2(snapshot).callables).toHaveLength(1);

    const callable = snapshot.callables.at(0);
    if (callable === undefined) {
      throw new Error("dynamic fixture is missing its callable");
    }
    const duplicateProviderOrdinal = {
      ...snapshot,
      callables: [
        {
          ...callable,
          parameters: [
            ...callable.parameters,
            {
              authoredExpression: "other",
              default: null,
              id: "parameter:other",
              name: "other",
              nameEditable: false,
              passingStyle: "positional_or_keyword",
              providerOrdinal: 0,
              typeAnnotation: "int",
            },
          ],
        },
      ],
    };
    expect(() => parseProjectSnapshotV2(duplicateProviderOrdinal)).toThrow(
      ProjectSnapshotValidationError,
    );

    const incoherentAppParameter = {
      ...snapshot,
      callables: [
        {
          ...callable,
          parameters: [
            callable.parameters[0],
            {
              ...callable.parameters[1],
              providerOrdinal: 1,
            },
          ],
        },
      ],
    };
    expect(() => parseProjectSnapshotV2(incoherentAppParameter)).toThrow(
      ProjectSnapshotValidationError,
    );
  });

  it("accepts an unannotated provider-derived parameter", () => {
    const snapshot = dynamicSnapshot();
    const callable = snapshot.callables[0];
    const parameter = callable?.parameters[0];
    if (callable === undefined || parameter === undefined) {
      throw new Error("dynamic fixture is missing its provider parameter");
    }
    const unannotatedSnapshot: unknown = {
      ...snapshot,
      callables: [
        {
          ...callable,
          parameters: [
            { ...parameter, typeAnnotation: null },
            ...callable.parameters.slice(1),
          ],
        },
      ],
    };

    expect(
      parseProjectSnapshotV2(unannotatedSnapshot).callables[0]?.parameters[0],
    ).toMatchObject({
      nameEditable: false,
      providerOrdinal: 0,
      typeAnnotation: null,
    });
  });

  it("strictly parses recursive dictionaries and the complete section forest", () => {
    const snapshot = {
      ...projectSnapshotFixture,
      callables: [
        {
          authoredExpression: "",
          id: "callable:child",
          name: "Child",
          parameters: [],
        },
      ],
      parameterDictionaries: [
        {
          entries: [
            {
              authoredExpression: "4",
              id: "entry:radius",
              kind: "leaf",
              name: "radius",
            },
            {
              children: [],
              id: "entry:options",
              kind: "parent",
              name: "options",
            },
          ],
          id: "dictionary:options",
          name: "Options",
        },
      ],
      lists: [
        {
          childSectionIds: ["callable:child", "dictionary:options"],
          id: "list:objects",
          name: "Objects",
        },
      ],
      topLevelSectionIds: ["list:objects"],
    };

    expect(parseProjectSnapshotV2(snapshot).lists[0]?.childSectionIds).toEqual([
      "callable:child",
      "dictionary:options",
    ]);
    expect(() =>
      parseProjectSnapshotV2({
        ...snapshot,
        parameterDictionaries: [
          {
            ...snapshot.parameterDictionaries[0],
            entries: [
              {
                ...snapshot.parameterDictionaries[0]?.entries[0],
                children: [],
              },
            ],
          },
        ],
      }),
    ).toThrow(ProjectSnapshotValidationError);
    expect(() =>
      parseProjectSnapshotV2({
        ...snapshot,
        topLevelSectionIds: ["list:objects", "callable:child"],
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });
});

describe("V2 error and completion decoders", () => {
  it("accepts only the closed conflict shape", () => {
    expect(
      parseErrorResponseV2({
        error: {
          code: "revision_conflict",
          currentRevision: 4,
          expectedRevision: 3,
          message: "Project changed.",
        },
      }),
    ).toEqual({
      error: {
        code: "revision_conflict",
        currentRevision: 4,
        expectedRevision: 3,
        message: "Project changed.",
      },
    });
    expect(() =>
      parseErrorResponseV2({
        error: { code: "revision_conflict", message: "Project changed." },
      }),
    ).toThrow(ProjectSnapshotValidationError);
    expect(() =>
      parseErrorResponseV2({
        error: {
          code: "validation_failed",
          currentRevision: 4,
          expectedRevision: 3,
          message: "Invalid.",
        },
      }),
    ).toThrow(ProjectSnapshotValidationError);
  });

  it("rejects malformed completion items", () => {
    expect(
      parseCompletionResponseV2({
        items: [{ insertText: "value", label: "value" }],
      }),
    ).toEqual({ items: [{ insertText: "value", label: "value" }] });
    expect(() =>
      parseCompletionResponseV2({ items: [{ label: "value" }] }),
    ).toThrow(ProjectSnapshotValidationError);
  });
});

function dynamicSnapshot() {
  return {
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "value",
        id: "callable:one",
        name: "One",
        parameters: [
          {
            authoredExpression: "value",
            default: null,
            id: "parameter:value",
            name: "value",
            nameEditable: false,
            passingStyle: "positional_or_keyword",
            providerOrdinal: 0,
            typeAnnotation: "float",
          },
          {
            authoredExpression: "2",
            default: null,
            id: "parameter:scale",
            name: "scale",
            nameEditable: true,
            passingStyle: "positional_or_keyword",
            providerOrdinal: null,
            typeAnnotation: null,
          },
        ],
      },
    ],
    topLevelSectionIds: ["callable:one"],
    generatedCode: {
      ...projectSnapshotFixture.generatedCode,
      sourceRangesByTargetId: {
        "callable:one": { end: 2, start: 2 },
        "parameter:scale": { end: 2, start: 2 },
        "parameter:value": { end: 2, start: 2 },
      },
    },
  };
}
