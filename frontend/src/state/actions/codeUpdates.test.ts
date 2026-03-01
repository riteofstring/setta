import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingGenCodeUpdates,
  queueGenCodePrefixUpdate,
} from "./codeUpdates";

const routeSetGenCodePrefixMock = vi.fn();
const dispatchOptimisticProjectStateUpdateMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_set_code: vi.fn(),
  route_set_gen_code_prefix: (...args: unknown[]) =>
    routeSetGenCodePrefixMock(...args),
  route_set_gen_code_suffix: vi.fn(),
}));

vi.mock("./sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate: (...args: unknown[]) =>
    dispatchOptimisticProjectStateUpdateMock(...args),
  getCurrProjectConfigId: () => "project-a",
  setCurrEffectiveSectionImplValue: vi.fn(),
}));

vi.mock("utils/codegenTargets", () => ({
  getPythonCodegenTarget: () => null,
}));

describe("code updates", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    routeSetGenCodePrefixMock.mockReset();
    dispatchOptimisticProjectStateUpdateMock.mockReset();
    routeSetGenCodePrefixMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    dispatchOptimisticProjectStateUpdateMock.mockImplementation(
      ({ send }: { send: (frontendOpId: string) => Promise<unknown> }) => {
        void send("frontend-op-test");
      },
    );
    await flushPendingGenCodeUpdates();
  });

  afterEach(async () => {
    vi.runOnlyPendingTimers();
    await flushPendingGenCodeUpdates();
    vi.useRealTimers();
  });

  it("coalesces rapid gen-code-prefix edits into one backend write", async () => {
    // Simulate a user typing rapidly in the gen prefix editor.
    queueGenCodePrefixUpdate("i", "gen-python-editor:onChange");
    queueGenCodePrefixUpdate("im", "gen-python-editor:onChange");
    queueGenCodePrefixUpdate("import", "gen-python-editor:onChange");
    queueGenCodePrefixUpdate("import math", "gen-python-editor:onChange");

    vi.advanceTimersByTime(60);
    await flushPendingGenCodeUpdates();

    expect(routeSetGenCodePrefixMock).toHaveBeenCalledTimes(1);
    expect(routeSetGenCodePrefixMock).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      genCodePrefix: "import math",
      frontendOpId: "frontend-op-test",
    });
  });

  it("emits separate writes for edits separated by the debounce window", async () => {
    // Distinct pauses between edits should preserve semantic checkpoints.
    queueGenCodePrefixUpdate("import", "gen-python-editor:onChange");
    vi.advanceTimersByTime(60);
    await flushPendingGenCodeUpdates();

    queueGenCodePrefixUpdate("import math", "gen-python-editor:onChange");
    vi.advanceTimersByTime(60);
    await flushPendingGenCodeUpdates();

    expect(routeSetGenCodePrefixMock).toHaveBeenCalledTimes(2);
    expect(routeSetGenCodePrefixMock).toHaveBeenNthCalledWith(1, {
      projectConfigId: "project-a",
      genCodePrefix: "import",
      frontendOpId: "frontend-op-test",
    });
    expect(routeSetGenCodePrefixMock).toHaveBeenNthCalledWith(2, {
      projectConfigId: "project-a",
      genCodePrefix: "import math",
      frontendOpId: "frontend-op-test",
    });
  });
});
