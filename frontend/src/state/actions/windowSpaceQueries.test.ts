import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createWindowSpaceConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRandomNameMock } = vi.hoisted(() => ({
  createRandomNameMock: vi.fn(),
}));

vi.mock("utils/idNameCreation", async () => {
  const actual = await vi.importActual<typeof import("utils/idNameCreation")>(
    "utils/idNameCreation",
  );
  return {
    ...actual,
    createRandomName: () => createRandomNameMock(),
  };
});

import {
  canMutateWindowSpaceLayout,
  resolveNextWindowSpaceName,
  sortWindowSpaces,
} from "./windowSpaceQueries";

describe("windowSpaceQueries", () => {
  beforeEach(() => {
    resetProjectStores();
    createRandomNameMock.mockReset();
  });

  afterEach(() => {
    createRandomNameMock.mockReset();
  });

  it("sorts saved window spaces by index, normalized name, then id", () => {
    const sorted = sortWindowSpaces([
      createWindowSpaceConfig({
        id: "gamma-id",
        name: "Beta",
        sortIndex: 1,
        windowsById: {},
        order: [],
      }),
      createWindowSpaceConfig({
        id: "beta-id",
        name: "alpha",
        sortIndex: 1,
        windowsById: {},
        order: [],
      }),
      createWindowSpaceConfig({
        id: "alpha-id",
        name: "Alpha",
        sortIndex: 1,
        windowsById: {},
        order: [],
      }),
      createWindowSpaceConfig({
        id: "delta-id",
        name: "Delta",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
    ]);

    expect(sorted.map((windowSpace) => windowSpace.id)).toEqual([
      "delta-id",
      "alpha-id",
      "beta-id",
      "gamma-id",
    ]);
  });

  it("skips generated names whose sanitized slug already exists", () => {
    createRandomNameMock
      .mockReturnValueOnce("Alpha")
      .mockReturnValueOnce("Alpha  ")
      .mockReturnValueOnce("Gamma");

    const nextName = resolveNextWindowSpaceName({
      "alpha-id": createWindowSpaceConfig({
        id: "alpha-id",
        name: "Alpha",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
      "beta-id": createWindowSpaceConfig({
        id: "beta-id",
        name: "Beta",
        sortIndex: 1,
        windowsById: {},
        order: [],
      }),
    });

    expect(nextName).toBe("Gamma");
    expect(createRandomNameMock).toHaveBeenCalledTimes(3);
  });

  it("allows layout mutations outside deployment mode or when the policy opts in", () => {
    expect(canMutateWindowSpaceLayout()).toBe(true);

    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: true,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });

    expect(canMutateWindowSpaceLayout()).toBe(true);
  });

  it("blocks layout mutations when deployment policy disallows them", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });

    expect(canMutateWindowSpaceLayout()).toBe(false);
  });
});
