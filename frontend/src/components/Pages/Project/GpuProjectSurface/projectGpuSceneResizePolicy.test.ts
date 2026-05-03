import { describe, expect, it } from "vitest";

import {
  getProjectSceneMeasuredHeight,
  getProjectSceneMeasuredHeightFromRecord,
  type ProjectGpuSceneResizePolicyContext,
} from "./projectGpuSceneResizePolicy";

describe("project GPU scene resize policy measured heights", () => {
  it("accepts only finite positive measured heights", () => {
    const measuredHeightsByKey = {
      empty: "",
      finite: 24,
      infinity: Number.POSITIVE_INFINITY,
      nan: Number.NaN,
      negative: -8,
      stringNumber: "32",
      zero: 0,
    };

    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "finite"),
    ).toBe(24);
    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "zero"),
    ).toBe(0);
    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "negative"),
    ).toBe(0);
    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "nan"),
    ).toBe(0);
    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "infinity"),
    ).toBe(0);
    expect(
      getProjectSceneMeasuredHeightFromRecord(
        measuredHeightsByKey,
        "stringNumber",
      ),
    ).toBe(0);
    expect(
      getProjectSceneMeasuredHeightFromRecord(measuredHeightsByKey, "missing"),
    ).toBe(0);
    expect(getProjectSceneMeasuredHeightFromRecord(undefined, "finite")).toBe(
      0,
    );
  });

  it("uses the same measured-height boundary for scene resize contexts", () => {
    const context: ProjectGpuSceneResizePolicyContext = {
      measuredHeightsByKey: {
        finite: 18,
        invalid: Number.NaN,
      },
      resizeEventBySectionId: {},
      sizingPolicy: {} as ProjectGpuSceneResizePolicyContext["sizingPolicy"],
    };

    expect(getProjectSceneMeasuredHeight(context, "finite")).toBe(18);
    expect(getProjectSceneMeasuredHeight(context, "invalid")).toBe(0);
  });
});
