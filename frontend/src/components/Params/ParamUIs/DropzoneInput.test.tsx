/* @vitest-environment jsdom */

import {
  parseDropzoneValue,
  serializeDropzoneValue,
} from "@setta/app-subsystem-frontend-sdk";
import { updateArtifacts, uploadBinary } from "openapi/http";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { ArtifactTypeEnum, createContentRef } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropzoneInput } from "./DropzoneInput";

const { uploadBinaryMock, routeUpdateArtifactsMock } = vi.hoisted(() => ({
  uploadBinaryMock: vi.fn(),
  routeUpdateArtifactsMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  updateArtifacts: routeUpdateArtifactsMock,
  uploadBinary: uploadBinaryMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

type RenderedDropzoneInput = {
  host: HTMLDivElement;
  root: Root;
};

function StatefulDropzoneHarness() {
  const [value, setValue] = useState("");
  return (
    <>
      <DropzoneInput
        value={value}
        onChange={(nextValue) => setValue(nextValue)}
      />
      <output data-testid="dropzone-value">{value}</output>
    </>
  );
}

async function renderDropzoneInput() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<StatefulDropzoneHarness />);
  });

  return { host, root } satisfies RenderedDropzoneInput;
}

function mustDropzoneFileInput(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected dropzone file input.");
  }
  return input;
}

function dropzoneSerializedValue(host: HTMLElement): string {
  return host.querySelector('[data-testid="dropzone-value"]')?.textContent ?? "";
}

function firstUpdateArtifactRequest() {
  return vi.mocked(updateArtifacts).mock.calls[0]?.[0];
}

function configureSuccessfulUploadMocks() {
  vi.mocked(uploadBinary).mockResolvedValue({
    data: createContentRef({
      contentId: "uploaded-dropzone-ref",
      byteLength: 4,
      mimeType: "image/png",
      sha256: null,
    }),
    status: 200,
    hasResponse: true,
  });
  vi.mocked(updateArtifacts).mockResolvedValue({
    data: [],
    status: 200,
    hasResponse: true,
  });
}

async function uploadFileThroughDropzone(host: HTMLElement, file: File) {
  const input = mustDropzoneFileInput(host);
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForDropzoneUpload() {
  await vi.waitFor(() => {
    expect(uploadBinary).toHaveBeenCalledTimes(1);
    expect(updateArtifacts).toHaveBeenCalledTimes(1);
  });
}

function firstUploadedArtifact() {
  const uploadedArtifact = firstUpdateArtifactRequest()?.body?.artifacts?.[0];
  if (!uploadedArtifact) {
    throw new Error("Expected uploaded artifact update request.");
  }
  return uploadedArtifact;
}

function firstDropzoneAttachment(host: HTMLElement) {
  const attachment = parseDropzoneValue(
    dropzoneSerializedValue(host),
  )?.attachments[0];
  if (!attachment) {
    throw new Error("Expected serialized dropzone attachment.");
  }
  return attachment;
}

async function cleanupRenderedDropzone({ host, root }: RenderedDropzoneInput) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

describe("DropzoneInput attachment display", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    uploadBinaryMock.mockReset();
    routeUpdateArtifactsMock.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("formats attachment size using shared formatBytes", () => {
    const value = serializeDropzoneValue([
      {
        kind: "file",
        id: "artifacts/test.txt",
        name: "test.txt",
        mimeType: "text/plain",
        size: 1024,
      },
    ]);

    const markup = renderToStaticMarkup(
      <DropzoneInput value={value} onChange={() => undefined} />,
    );

    expect(markup).toContain("1 KB");
  });

  it("marks the drop target as an explicit GPU flow interactive nodrag region", () => {
    const markup = renderToStaticMarkup(
      <DropzoneInput value="" onChange={() => undefined} />,
    );

    expect(markup).toContain('data-gpu-flow-control="dropzone"');
    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("nodrag nopan section-value");
  });

  it("rejects invalid stored file metadata when parsing saved values", () => {
    expect(
      parseDropzoneValue(
        JSON.stringify({
          attachments: [
            {
              kind: "file",
              id: "artifacts/test.txt",
              name: "test.txt",
              mimeType: 42,
            },
          ],
        }),
      ),
    ).toBeNull();

    expect(
      parseDropzoneValue(
        JSON.stringify({
          attachments: [
            {
              kind: "file",
              id: "artifacts/test.txt",
              name: "test.txt",
              size: Number.NaN,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("uploads local files through the Go binary route before updating artifacts", async () => {
    configureSuccessfulUploadMocks();
    const rendered = await renderDropzoneInput();
    const { host } = rendered;

    try {
      const file = new File(["png!"], "photo.png", { type: "image/png" });
      await uploadFileThroughDropzone(host, file);
      await waitForDropzoneUpload();

      const uploadedArtifact = firstUploadedArtifact();
      const attachment = firstDropzoneAttachment(host);
      expect(uploadedArtifact.value).toEqual(
        createContentRef({
          contentId: "uploaded-dropzone-ref",
          byteLength: 4,
          mimeType: "image/png",
          sha256: null,
        }),
      );
      expect(updateArtifacts).toHaveBeenCalledWith({
        body: {
          artifacts: [
            {
              type: ArtifactTypeEnum.File,
              id: uploadedArtifact.id,
              value: uploadedArtifact.value,
            },
          ],
          uploadScope: "generic",
        },
      });
      expect(host.textContent).toContain("photo.png");
      expect(attachment.kind).toBe("file");
      expect(attachment.name).toBe("photo.png");
      expect(attachment.id).toBe(uploadedArtifact.id);
    } finally {
      await cleanupRenderedDropzone(rendered);
    }
  });
});
