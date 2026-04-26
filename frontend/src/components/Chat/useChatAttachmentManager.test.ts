/* @vitest-environment jsdom */

import { act, createElement, type ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

const attachmentManagerMocks = vi.hoisted(() => ({
  addTemporaryNotificationMock: vi.fn(),
  getAttachmentPolicyMock: vi.fn(),
  updateArtifactsMock: vi.fn(),
  uploadBinaryMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  deleteArtifacts: vi.fn(),
  importFilesToArtifacts: vi.fn(),
  updateArtifacts: attachmentManagerMocks.updateArtifactsMock,
  uploadBinary: attachmentManagerMocks.uploadBinaryMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
    getAttachmentPolicy: attachmentManagerMocks.getAttachmentPolicyMock,
  };
});

vi.mock("state/actions/modal", () => ({
  openDropzoneFilePickerModal: vi.fn(),
}));

vi.mock("state/actions/notifications", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/notifications")
  >("state/actions/notifications");
  return {
    ...actual,
    addTemporaryNotification:
      attachmentManagerMocks.addTemporaryNotificationMock,
  };
});

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditParams: true,
  }),
}));

type AttachmentManagerHarnessState = ReturnType<
  typeof useChatAttachmentManager
>;

let latestManager: AttachmentManagerHarnessState | null = null;

function Harness() {
  latestManager = useChatAttachmentManager({});
  return createElement("div");
}

function createFile(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function settleAsyncWork() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("useChatAttachmentManager", () => {
  let host: HTMLDivElement;
  let root: Root;

  async function renderHarness() {
    await act(async () => {
      root.render(createElement(Harness));
    });
  }

  async function triggerFileInput(files: File[]) {
    expect(latestManager).not.toBeNull();
    const manager = latestManager;
    if (!manager) {
      throw new Error("Attachment manager did not render");
    }
    const target = {
      files,
      value: "selected",
    } as unknown as HTMLInputElement;
    await act(async () => {
      manager.handleFileInputChange({
        target,
      } as ChangeEvent<HTMLInputElement>);
    });
    await settleAsyncWork();
    expect(target.value).toBe("");
  }

  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    attachmentManagerMocks.addTemporaryNotificationMock.mockReset();
    attachmentManagerMocks.getAttachmentPolicyMock.mockReset();
    attachmentManagerMocks.updateArtifactsMock.mockReset();
    attachmentManagerMocks.uploadBinaryMock.mockReset();
    attachmentManagerMocks.getAttachmentPolicyMock.mockReturnValue({
      scope: "chat",
      maxFiles: 4,
      maxFilesDisabled: false,
      maxFileBytes: 10,
      maxFileLabel: "10 B",
      maxTotalBytes: null,
      maxTotalLabel: null,
      allowedMimePrefixes: ["image/"],
      allowedMimeLabel: "Allowed types: image/.",
    });
    attachmentManagerMocks.uploadBinaryMock.mockImplementation(
      async ({ body }: { body: { file: File } }) => ({
        status: 200,
        data: { path: body.file.name },
      }),
    );
    attachmentManagerMocks.updateArtifactsMock.mockResolvedValue({
      status: 200,
      data: null,
    });
    latestManager = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("keeps supported uploads and reports each skipped category once", async () => {
    await renderHarness();

    const validFile = createFile("design.png", 5, "image/png");
    const rejectedByType = createFile("notes.txt", 3, "text/plain");
    const rejectedByImageSupport = createFile("photo.avif", 3, "image/avif");
    const rejectedBySize = createFile("large.png", 11, "image/png");
    const ignoredPastLimit = createFile("ignored.png", 3, "image/png");

    await triggerFileInput([
      validFile,
      rejectedByType,
      rejectedByImageSupport,
      rejectedBySize,
      ignoredPastLimit,
    ]);

    expect(
      attachmentManagerMocks.addTemporaryNotificationMock,
    ).toHaveBeenNthCalledWith(
      1,
      "Some files were skipped due to type restrictions. Allowed types: image/.",
      NotificationTypeEnum.warning,
    );
    expect(
      attachmentManagerMocks.addTemporaryNotificationMock,
    ).toHaveBeenNthCalledWith(
      2,
      "Some images were skipped. Supported image types: JPEG, PNG, GIF, WebP.",
      NotificationTypeEnum.warning,
    );
    expect(
      attachmentManagerMocks.addTemporaryNotificationMock,
    ).toHaveBeenNthCalledWith(
      3,
      "File exceeds 10 B limit.",
      NotificationTypeEnum.warning,
    );
    expect(attachmentManagerMocks.uploadBinaryMock).toHaveBeenCalledTimes(1);
    expect(attachmentManagerMocks.updateArtifactsMock).toHaveBeenCalledTimes(1);
    expect(
      latestManager?.attachments.map((attachment) => attachment.name),
    ).toEqual(["design.png"]);
  });

  it("uploads valid files without warning notifications", async () => {
    await renderHarness();

    const files = [
      createFile("diagram.png", 5, "image/png"),
      createFile("reference.webp", 8, "image/webp"),
    ];

    await triggerFileInput(files);

    expect(
      attachmentManagerMocks.addTemporaryNotificationMock,
    ).not.toHaveBeenCalled();
    expect(attachmentManagerMocks.uploadBinaryMock).toHaveBeenCalledTimes(2);
    expect(attachmentManagerMocks.updateArtifactsMock).toHaveBeenCalledTimes(1);
    expect(
      latestManager?.attachments.map((attachment) => attachment.name),
    ).toEqual(["diagram.png", "reference.webp"]);
  });
});
