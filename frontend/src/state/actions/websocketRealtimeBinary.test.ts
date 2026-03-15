import { C } from "utils/c";
import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addTemporaryNotificationMock = vi.hoisted(() => vi.fn());
const dependencyKeyCoveredMock = vi.hoisted(() => vi.fn());
const emitRealtimeDependencyValueMock = vi.hoisted(() => vi.fn());
const getCurrProjectConfigIdMock = vi.hoisted(() => vi.fn());
const routeBinaryUploadMock = vi.hoisted(() => vi.fn());
const createNewIdMock = vi.hoisted(() => vi.fn());

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("./listenerCoverage", () => ({
  dependencyKeyCovered: dependencyKeyCoveredMock,
}));

vi.mock("./sectionEffectiveImplSelectors", () => ({
  getCurrProjectConfigId: getCurrProjectConfigIdMock,
}));

vi.mock("./websocketRealtimeDispatch", () => ({
  emitRealtimeDependencyValue: emitRealtimeDependencyValueMock,
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_binary_upload: routeBinaryUploadMock,
  };
});

vi.mock("utils/idNameCreation", async () => {
  const actual = await vi.importActual<typeof import("utils/idNameCreation")>(
    "utils/idNameCreation",
  );
  return {
    ...actual,
    createNewId: createNewIdMock,
  };
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("websocketRealtimeBinary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    dependencyKeyCoveredMock.mockReturnValue(true);
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
    createNewIdMock.mockReturnValue("content-1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits inline binary realtime payloads below the upload threshold", async () => {
    const { sendRealtimeSectionBinary } = await import(
      "./websocketRealtimeBinary"
    );
    const payload = new ArrayBuffer(16);

    sendRealtimeSectionBinary(
      "section-inline",
      payload,
      "image/png",
      "project-1",
    );

    expect(emitRealtimeDependencyValueMock).toHaveBeenCalledWith(
      {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-inline",
      },
      {
        type: DependencyValueTypeEnum.Binary,
        payload: {
          contentId: "content-1",
          byteLength: 16,
          mimeType: "image/png",
        },
      },
      payload,
      "project-1",
    );
    expect(routeBinaryUploadMock).not.toHaveBeenCalled();
  });

  it("uploads oversized realtime payloads and emits the uploaded reference", async () => {
    const { sendRealtimeSectionBinary } = await import(
      "./websocketRealtimeBinary"
    );
    const payload = new ArrayBuffer(C.REALTIME_BINARY_MAX_BYTES + 1);
    routeBinaryUploadMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        contentId: "upload-1",
        byteLength: payload.byteLength,
        mimeType: "image/png",
      },
    });

    sendRealtimeSectionBinary(
      "section-upload",
      payload,
      "image/png",
      "project-1",
    );
    await flushPromises();

    expect(routeBinaryUploadMock).toHaveBeenCalledTimes(1);
    expect(dependencyKeyCoveredMock).toHaveBeenCalledWith("project-1", {
      type: DependencyKeyTypeEnum.Section,
      sectionId: "section-upload",
    });
    expect(emitRealtimeDependencyValueMock).toHaveBeenCalledWith(
      {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-upload",
      },
      {
        type: DependencyValueTypeEnum.Binary,
        payload: {
          contentId: "upload-1",
          byteLength: payload.byteLength,
          mimeType: "image/png",
        },
      },
      undefined,
      "project-1",
    );
  });

  it("throttles repeated oversize upload warnings until the cooldown expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:35:00.000Z"));
    const { sendRealtimeSectionBinary } = await import(
      "./websocketRealtimeBinary"
    );
    const payload = new ArrayBuffer(C.REALTIME_BINARY_MAX_BYTES + 1);
    routeBinaryUploadMock.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: null,
    });

    sendRealtimeSectionBinary(
      "section-warning",
      payload,
      "image/png",
      "project-1",
    );
    await flushPromises();
    sendRealtimeSectionBinary(
      "section-warning",
      payload,
      "image/png",
      "project-1",
    );
    await flushPromises();

    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(1);
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Realtime snapshot too large to send. Upload failed.",
      SettaNotificationTypeEnum.warning,
    );

    vi.setSystemTime(new Date("2026-03-15T10:35:06.000Z"));
    sendRealtimeSectionBinary(
      "section-warning",
      payload,
      "image/png",
      "project-1",
    );
    await flushPromises();

    expect(addTemporaryNotificationMock).toHaveBeenCalledTimes(2);
  });
});
