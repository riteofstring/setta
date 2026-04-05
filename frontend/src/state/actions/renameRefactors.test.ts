import { useRenameRefactors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { RenameRefactorModeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptRenameRefactor, declineRenameRefactor } from "./renameRefactors";
const { routeAcceptRenameRefactorMock, routeDeclineRenameRefactorMock } =
  vi.hoisted(() => ({
    routeAcceptRenameRefactorMock: vi.fn(),
    routeDeclineRenameRefactorMock: vi.fn(),
  }));
vi.mock("openapi/http", () => ({
  acceptRenameRefactor: routeAcceptRenameRefactorMock,
  declineRenameRefactor: routeDeclineRenameRefactorMock,
}));
describe("rename refactor actions", () => {
  beforeEach(() => {
    resetProjectStores();
    routeAcceptRenameRefactorMock.mockReset();
    routeDeclineRenameRefactorMock.mockReset();
    routeAcceptRenameRefactorMock.mockResolvedValue({
      status: 200,
      data: null,
    });
    routeDeclineRenameRefactorMock.mockResolvedValue({
      status: 200,
      data: null,
    });
    useRenameRefactors.setState({
      byOpId: {
        "frontend-op-1": {
          frontendOpId: "frontend-op-1",
          projectConfigId: "project-alpha",
          renameMode: RenameRefactorModeEnum.ALWAYS_ASK,
          changedNodeValues: [],
        },
      },
      queue: ["frontend-op-1"],
      readyOpIds: {
        "frontend-op-1": true,
      },
    });
  });
  it("accepts rename refactors through the generated backend binding and clears the pending prompt", async () => {
    await acceptRenameRefactor("project-alpha", "frontend-op-1");
    expect(routeAcceptRenameRefactorMock).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-1",
    });
    expect(useRenameRefactors.getState().byOpId).toEqual({});
    expect(useRenameRefactors.getState().queue).toEqual([]);
    expect(useRenameRefactors.getState().readyOpIds).toEqual({});
  });
  it("declines rename refactors through the generated backend binding and clears the pending prompt", async () => {
    await declineRenameRefactor("project-alpha", "frontend-op-1");
    expect(routeDeclineRenameRefactorMock).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      frontendOpId: "frontend-op-1",
    });
    expect(useRenameRefactors.getState().byOpId).toEqual({});
    expect(useRenameRefactors.getState().queue).toEqual([]);
    expect(useRenameRefactors.getState().readyOpIds).toEqual({});
  });
});
