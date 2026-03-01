import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingParamEnteredValueUpdates,
  queueDirectParamEnteredValueUpdate,
  queueOptimisticParamEnteredValueUpdate,
  resetParamEnteredValueUpdatesForTests,
} from "./paramValueUpdates";

const routeSetParamEnteredValueMock = vi.fn();
const dispatchOptimisticProjectStateUpdateMock = vi.fn();
const setCurrEffectiveCodeObjImplValueIfPresentMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_set_param_entered_value: (...args: unknown[]) =>
    routeSetParamEnteredValueMock(...args),
}));

vi.mock("./sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate: (...args: unknown[]) =>
    dispatchOptimisticProjectStateUpdateMock(...args),
  getCurrProjectConfigId: () => "project-a",
  setCurrEffectiveCodeObjImplValueIfPresent: (...args: unknown[]) =>
    setCurrEffectiveCodeObjImplValueIfPresentMock(...args),
}));

describe("param value updates", () => {
  beforeEach(() => {
    resetParamEnteredValueUpdatesForTests();
    routeSetParamEnteredValueMock.mockReset();
    dispatchOptimisticProjectStateUpdateMock.mockReset();
    setCurrEffectiveCodeObjImplValueIfPresentMock.mockReset();
    routeSetParamEnteredValueMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    dispatchOptimisticProjectStateUpdateMock.mockImplementation(
      ({ send }: { send: (frontendOpId: string) => Promise<unknown> }) => {
        void send("frontend-op-test");
      },
    );
  });

  it("coalesces direct updates for the same parameter and sends the latest value", async () => {
    queueDirectParamEnteredValueUpdate(
      "project-a",
      "section-1",
      "param-1",
      "1",
      "test",
    );
    queueDirectParamEnteredValueUpdate(
      "project-a",
      "section-1",
      "param-1",
      "123",
      "test",
    );
    await flushPendingParamEnteredValueUpdates();

    expect(routeSetParamEnteredValueMock).toHaveBeenCalledTimes(1);
    expect(routeSetParamEnteredValueMock).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sectionId: "section-1",
      paramInfoId: "param-1",
      value: "123",
    });
  });

  it("keeps debounced updates isolated per parameter key", async () => {
    queueDirectParamEnteredValueUpdate(
      "project-a",
      "section-1",
      "param-1",
      "alpha",
      "test",
    );
    queueDirectParamEnteredValueUpdate(
      "project-a",
      "section-1",
      "param-2",
      "beta",
      "test",
    );
    await flushPendingParamEnteredValueUpdates();

    expect(routeSetParamEnteredValueMock).toHaveBeenCalledTimes(2);
    expect(routeSetParamEnteredValueMock).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sectionId: "section-1",
      paramInfoId: "param-1",
      value: "alpha",
    });
    expect(routeSetParamEnteredValueMock).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sectionId: "section-1",
      paramInfoId: "param-2",
      value: "beta",
    });
  });

  it("coalesces optimistic updates and forwards a frontend operation id", async () => {
    queueOptimisticParamEnteredValueUpdate(
      "section-1",
      "param-1",
      "first",
      "test",
    );
    queueOptimisticParamEnteredValueUpdate(
      "section-1",
      "param-1",
      "final",
      "test",
    );
    await flushPendingParamEnteredValueUpdates();

    expect(dispatchOptimisticProjectStateUpdateMock).toHaveBeenCalledTimes(1);
    expect(routeSetParamEnteredValueMock).toHaveBeenCalledTimes(1);
    expect(routeSetParamEnteredValueMock).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sectionId: "section-1",
      paramInfoId: "param-1",
      value: "final",
      frontendOpId: "frontend-op-test",
    });
  });
});
