/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { parseDropzoneValue, serializeDropzoneValue } from "utils/dropzone";
import {
  route_binary_upload,
  route_update_artifacts,
} from "utils/generatedEndpoints";
import { ArtifactTypeEnum, createContentRef } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropzoneInput } from "./DropzoneInput";

const generatedEndpoints = vi.hoisted(() => ({
  route_binary_upload: vi.fn(),
  route_update_artifacts: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_binary_upload: generatedEndpoints.route_binary_upload,
    route_update_artifacts: generatedEndpoints.route_update_artifacts,
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
    generatedEndpoints.route_binary_upload.mockReset();
    generatedEndpoints.route_update_artifacts.mockReset();
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

  it("uploads local files through the Go binary route before updating artifacts", async () => {
    vi.mocked(route_binary_upload).mockResolvedValue({
      data: createContentRef({
        contentId: "uploaded-dropzone-ref",
        byteLength: 4,
        mimeType: "image/png",
        sha256: null,
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(route_update_artifacts).mockResolvedValue({
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
        expect(route_binary_upload).toHaveBeenCalledTimes(1);
        expect(route_update_artifacts).toHaveBeenCalledTimes(1);
      });

      const updateRequest = vi.mocked(route_update_artifacts).mock
        .calls[0]?.[0];
      const uploadedArtifact = updateRequest?.artifacts?.[0];
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
      expect(route_update_artifacts).toHaveBeenCalledWith({
        artifacts: [
          {
            type: ArtifactTypeEnum.File,
            id: uploadedArtifact?.id,
            value: uploadedArtifact?.value,
          },
        ],
        uploadScope: "generic",
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
