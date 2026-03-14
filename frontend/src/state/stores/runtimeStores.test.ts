import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetProjectStores } from "../utils";
import {
  DEFAULT_BACKEND_LOG_EVENTS_FILTER,
  useBackendLogEvents,
  useRunControl,
} from "./runtimeStores";

describe("runtimeStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("starts run control in once mode with no active continuous run", () => {
    expect(useRunControl.getState()).toEqual({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
      reset: expect.any(Function),
    });
  });

  it("clones the default backend log filter into store state", () => {
    const state = useBackendLogEvents.getState();
    expect(state.events).toEqual([]);
    expect(state.unreadHighSeverityCount).toBe(0);
    expect(state.filter).toEqual(DEFAULT_BACKEND_LOG_EVENTS_FILTER);
    expect(state.filter).not.toBe(DEFAULT_BACKEND_LOG_EVENTS_FILTER);
  });
});
