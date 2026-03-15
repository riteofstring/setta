import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  routeInterruptTerminalProcessesMock,
  routeRunCodeMock,
  addTemporaryNotificationMock,
  getCurrProjectConfigIdMock,
} = vi.hoisted(() => ({
  routeInterruptTerminalProcessesMock: vi.fn(),
  routeRunCodeMock: vi.fn(),
  addTemporaryNotificationMock: vi.fn(),
  getCurrProjectConfigIdMock: vi.fn(() => "project-1"),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_interrupt_terminal_processes: routeInterruptTerminalProcessesMock,
  route_run_code: routeRunCodeMock,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("./sectionInfos", async () => {
  const actual =
    await vi.importActual<typeof import("./sectionInfos")>("./sectionInfos");
  return {
    ...actual,
    getCurrProjectConfigId: getCurrProjectConfigIdMock,
  };
});

import { stopCode } from "./runOrImportCode";

describe("stopCode", () => {
  beforeEach(() => {
    routeInterruptTerminalProcessesMock.mockReset();
    routeRunCodeMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    getCurrProjectConfigIdMock.mockReset();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the canonical interrupt-terminal request for the current project", async () => {
    await stopCode();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Stopping subprocesses",
    );
    expect(routeInterruptTerminalProcessesMock).toHaveBeenCalledWith({
      projectId: "project-1",
    });
  });
});
