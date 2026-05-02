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

    const { host, root } = await renderDropzoneInput();

    try {
      const input = host.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement | null;
      if (!input) {
        throw new Error("Expected dropzone file input.");
      }
      const file = new File(["png!"], "photo.png", { type: "image/png" });
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });

      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      await vi.waitFor(() => {
        expect(uploadBinary).toHaveBeenCalledTimes(1);
        expect(updateArtifacts).toHaveBeenCalledTimes(1);
      });

      const updateRequest = vi.mocked(updateArtifacts).mock.calls[0]?.[0];
      const uploadedArtifact = updateRequest?.body?.artifacts?.[0];
      const serializedValue =
        host.querySelector('[data-testid="dropzone-value"]')?.textContent ?? "";
      const parsedValue = parseDropzoneValue(serializedValue);

      expect(uploadedArtifact?.value).toEqual(
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
              id: uploadedArtifact?.id,
              value: uploadedArtifact?.value,
            },
          ],
          uploadScope: "generic",
        },
      });
      expect(host.textContent).toContain("photo.png");
      expect(parsedValue?.attachments[0]?.kind).toBe("file");
      expect(parsedValue?.attachments[0]?.name).toBe("photo.png");
      expect(parsedValue?.attachments[0]?.id).toBe(uploadedArtifact?.id);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
