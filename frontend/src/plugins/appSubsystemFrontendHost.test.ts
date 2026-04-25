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

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createRuntimeAppSubsystemFrontendHost,
  DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST,
} from "./appSubsystemFrontendHost";

describe("appSubsystemFrontendHost", () => {
  beforeEach(() => {
    realtimeMocks.sendRealtimeDependencyEvent.mockReset();
    realtimeMocks.sendRealtimeSectionParamLiteral.mockReset();
    resetProjectStores();
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

  it("resets project stores through the default runtime host", () => {
    useProjectState.setState((state) => ({
      projectConfig: {
        ...state.projectConfig,
        name: "Dirty Project",
      },
    }));

    expect(useProjectState.getState().projectConfig.name).toBe("Dirty Project");

    DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST.resetProjectRuntimeState();

    expect(useProjectState.getState().projectConfig.name).toBe("");
  });
});
