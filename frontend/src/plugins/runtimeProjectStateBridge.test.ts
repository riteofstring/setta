import {
  cloneProjectStateSnapshot,
  normalizeProjectStateSelector,
  projectStateSubscriptionEquality,
  toProjectStateSectionSnapshot,
} from "plugins/runtimeProjectStateBridge";
import {
  PluginFrontendErrorCodeEnum,
  PluginRuntimeError,
} from "plugins/runtimeValidation";
import { describe, expect, it } from "vitest";

describe("runtimeProjectStateBridge", () => {
  it("normalizes supported selectors and trims section ids", () => {
    expect(
      normalizeProjectStateSelector("acme.plugin", {
        kind: "sections",
        sectionIds: [" first ", "second"],
      }),
    ).toEqual({
      kind: "sections",
      sectionIds: ["first", "second"],
    });
    expect(
      normalizeProjectStateSelector("acme.plugin", {
        kind: "section",
        sectionId: " detail-section ",
      }),
    ).toEqual({
      kind: "section",
      sectionId: "detail-section",
    });
  });

  it("rejects unsupported selectors with registration-invalid errors", () => {
    let capturedError: unknown = null;
    try {
      normalizeProjectStateSelector("acme.plugin", {
        kind: "full",
      } as never);
    } catch (error) {
      capturedError = error;
    }
    expect(capturedError).toBeInstanceOf(PluginRuntimeError);
    expect((capturedError as PluginRuntimeError).code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });

  it("reuses unchanged section snapshots and clones changed values", () => {
    const sectionIds = ["section-a", "section-b", "section-c"];
    const rawA = { value: "a" };
    const rawB = { value: "b" };
    const rawC = { value: "c" };
    const firstSnapshot = toProjectStateSectionSnapshot(sectionIds, [
      rawA,
      rawB,
      rawC,
    ]);

    const updatedRawB = { value: "b-updated" };
    const secondSnapshot = toProjectStateSectionSnapshot(
      sectionIds,
      [rawA, updatedRawB, rawC],
      [rawA, rawB, rawC],
      firstSnapshot,
    );

    expect(secondSnapshot["section-a"]).toBe(firstSnapshot["section-a"]);
    expect(secondSnapshot["section-c"]).toBe(firstSnapshot["section-c"]);
    expect(secondSnapshot["section-b"]).not.toBe(firstSnapshot["section-b"]);
    expect(secondSnapshot["section-b"]).toEqual({ value: "b-updated" });
  });

  it("only builds structural equality functions for array-backed selectors", () => {
    const activeIdsEquality = projectStateSubscriptionEquality({
      kind: "activeSectionIds",
    });
    expect(activeIdsEquality?.(["a"], ["a"])).toBe(true);
    expect(activeIdsEquality?.(["a"], ["b"])).toBe(false);

    const sectionsEquality = projectStateSubscriptionEquality({
      kind: "sections",
      sectionIds: ["one", "two"],
    });
    expect(sectionsEquality?.([1, 2], [1, 2])).toBe(true);
    expect(sectionsEquality?.([1, 2], [2, 1])).toBe(false);

    expect(
      projectStateSubscriptionEquality({
        kind: "projectConfig",
      }),
    ).toBeUndefined();
  });

  it("clones array and object snapshots without mutating the source", () => {
    const sourceArray = ["one", "two"];
    const clonedArray = cloneProjectStateSnapshot(sourceArray) as string[];
    expect(clonedArray).toEqual(sourceArray);
    expect(clonedArray).not.toBe(sourceArray);

    const sourceObject = {
      nested: {
        value: "x",
      },
    };
    const clonedObject = cloneProjectStateSnapshot(sourceObject) as {
      nested: {
        value: string;
      };
    };
    expect(clonedObject).toEqual(sourceObject);
    expect(clonedObject).not.toBe(sourceObject);
    expect(clonedObject.nested).not.toBe(sourceObject.nested);
  });
});
