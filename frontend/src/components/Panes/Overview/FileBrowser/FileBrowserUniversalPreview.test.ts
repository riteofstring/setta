/* @vitest-environment jsdom */

import { downloadBinary } from "openapi/http";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  route_get_file_browser_download_urls,
  route_get_file_browser_file_content,
} from "utils/generatedEndpoints";
import {
  createFileBrowserDownloadURLEntry,
  createFileContentResponse,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileBrowserUniversalPreview,
  isFileBrowserPreviewRequestStale,
  resolveFileBrowserPreviewKind,
} from "./FileBrowserUniversalPreview";

const generatedEndpoints = vi.hoisted(() => ({
  route_get_file_browser_download_urls: vi.fn(),
  route_get_file_browser_file_content: vi.fn(),
}));

const { downloadBinaryMock } = vi.hoisted(() => ({
  downloadBinaryMock: vi.fn(),
}));

vi.mock("openapi/http", () => ({
  downloadBinary: downloadBinaryMock,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_file_browser_download_urls:
      generatedEndpoints.route_get_file_browser_download_urls,
    route_get_file_browser_file_content:
      generatedEndpoints.route_get_file_browser_file_content,
  };
});

type FileBrowserUniversalPreviewProps = Parameters<
  typeof FileBrowserUniversalPreview
>[0];

type RenderedFileBrowserUniversalPreview = {
  host: HTMLDivElement;
  root: Root;
};

async function renderFileBrowserUniversalPreview(
  props: FileBrowserUniversalPreviewProps,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(FileBrowserUniversalPreview, props));
  });

  return { host, root } satisfies RenderedFileBrowserUniversalPreview;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  generatedEndpoints.route_get_file_browser_download_urls.mockReset();
  generatedEndpoints.route_get_file_browser_file_content.mockReset();
  downloadBinaryMock.mockReset();
  document.body.innerHTML = "";
});

describe("FileBrowserUniversalPreview kind resolution", () => {
  it("classifies spreadsheet paths as spreadsheet previews", () => {
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/report.csv",
        fileName: "report.csv",
      }),
    ).toBe("spreadsheet");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/report.xlsx",
        fileName: "report.xlsx",
      }),
    ).toBe("spreadsheet");
  });

  it("classifies common media/text kinds", () => {
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/photo.png",
        fileName: "photo.png",
      }),
    ).toBe("image");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/readme.md",
        fileName: "readme.md",
      }),
    ).toBe("text");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/archive.tar.gz",
        fileName: "archive.tar.gz",
      }),
    ).toBe("archive");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/blob.bin",
        fileName: "blob.bin",
      }),
    ).toBe("other");
  });

  it("detects stale async preview requests", () => {
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 2,
        requestId: 1,
        currentSelectedPath: "/workspace/a.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(true);
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/workspace/b.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(true);
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/workspace/a.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(false);
  });

  it("loads text previews through the Go file-content and binary routes", async () => {
    vi.mocked(route_get_file_browser_file_content).mockResolvedValue({
      data: createFileContentResponse({
        path: "/workspace/readme.md",
        contentId: "content-1",
        mimeType: "text/markdown",
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(downloadBinary).mockResolvedValue({
      data: new Blob(["Hello from the Go file browser."], {
        type: "text/plain",
      }),
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderFileBrowserUniversalPreview({
      selectedNode: {
        name: "readme.md",
        fullPath: "/workspace/readme.md",
        type: "file",
        parentPath: "/workspace",
      },
    });

    try {
      await flushEffects();

      expect(route_get_file_browser_file_content).toHaveBeenCalledWith({
        path: "/workspace/readme.md",
        maxBytes: 1024 * 1024,
      });
      expect(downloadBinary).toHaveBeenCalledWith({
        path: { contentId: "content-1" },
      });
      expect(
        host.querySelector(
          '[data-testid="file-browser-universal-preview-text"]',
        )?.textContent,
      ).toContain("Hello from the Go file browser.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("loads image previews through the Go download-url route", async () => {
    vi.mocked(route_get_file_browser_download_urls).mockResolvedValue({
      data: [
        createFileBrowserDownloadURLEntry({
          path: "/workspace/photo.png",
          url: "https://example.com/file-browser/photo.png",
          expiresAt: 123,
        }),
      ],
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderFileBrowserUniversalPreview({
      selectedNode: {
        name: "photo.png",
        fullPath: "/workspace/photo.png",
        type: "file",
        parentPath: "/workspace",
      },
    });

    try {
      await flushEffects();

      expect(route_get_file_browser_download_urls).toHaveBeenCalledWith({
        paths: ["/workspace/photo.png"],
      });
      expect(
        host
          .querySelector(
            '[data-testid="file-browser-universal-preview-image"] img',
          )
          ?.getAttribute("src"),
      ).toBe("https://example.com/file-browser/photo.png");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
