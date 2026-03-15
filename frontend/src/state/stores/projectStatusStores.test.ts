import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { useProjectLoading, useRunControl } from "./projectStatusStores";

describe("projectStatusStores", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectLoading.getState().reset?.();
  });

  it("resets run control through the project reset path", () => {
    useRunControl.setState({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: "run-1",
    });

    resetProjectStores();

    expect(useRunControl.getState()).toEqual({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
      reset: expect.any(Function),
    });
  });

  it("keeps project loading on its local reset path", () => {
    useProjectLoading.setState({
      projectIsLoading: true,
      projectIs404: true,
    });

    useProjectLoading.getState().reset?.();

    expect(useProjectLoading.getState()).toEqual({
      projectIsLoading: false,
      projectIs404: false,
      reset: expect.any(Function),
    });
  });
});
