import { beforeEach, describe, expect, it, vi } from "vitest";

const realtimeMocks = vi.hoisted(() => ({
  sendRealtimeDependencyEvent: vi.fn(),
  sendRealtimeSectionParamLiteral: vi.fn(),
}));

vi.mock("state/actions/realtimeDependencySend", () => ({
  sendRealtimeDependencyEvent: realtimeMocks.sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral:
    realtimeMocks.sendRealtimeSectionParamLiteral,
}));

import { createRuntimeAppSubsystemFrontendHost } from "./appSubsystemFrontendHost";

describe("appSubsystemFrontendHost", () => {
  beforeEach(() => {
    realtimeMocks.sendRealtimeDependencyEvent.mockReset();
    realtimeMocks.sendRealtimeSectionParamLiteral.mockReset();
  });

  it("forwards realtime host APIs to the shared websocket send helpers", () => {
    const frontendHost = createRuntimeAppSubsystemFrontendHost();
    const dependencyEvent = {
      dependencyKey: {
        type: "Section",
        sectionId: "section-1",
      } as never,
      payload: null,
      timestampMs: 42,
    };

    frontendHost.emitRealtimeDependencyEvent(dependencyEvent, "config-1");
    frontendHost.emitRealtimeSectionParamLiteral(
      "section-1",
      "param-1",
      "value",
      "config-1",
    );

    expect(realtimeMocks.sendRealtimeDependencyEvent).toHaveBeenCalledWith(
      dependencyEvent,
      "config-1",
    );
    expect(realtimeMocks.sendRealtimeSectionParamLiteral).toHaveBeenCalledWith(
      "section-1",
      "param-1",
      "value",
      "config-1",
    );
  });
});
