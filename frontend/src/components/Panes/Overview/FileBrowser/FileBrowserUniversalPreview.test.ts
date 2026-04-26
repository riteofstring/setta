/* @vitest-environment jsdom */

import {
  downloadBinary,
  getFileBrowserDownloadUrls,
  getFileBrowserFileContent,
  type FilebrowserFileBrowserDownloadUrlEntry,
  type FilebrowserFileContentResponse,
} from "openapi/http";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileBrowserUniversalPreview } from "./FileBrowserUniversalPreview";
import { resolveFileBrowserPreviewKind } from "./fileBrowserUniversalPreviewState";

const openAPI = vi.hoisted(() => ({
  getFileBrowserDownloadUrls: vi.fn(),
  getFileBrowserFileContent: vi.fn(),
}));

const { downloadBinaryMock } = vi.hoisted(() => ({
  downloadBinaryMock: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    downloadBinary: downloadBinaryMock,
    getFileBrowserDownloadUrls: openAPI.getFileBrowserDownloadUrls,
    getFileBrowserFileContent: openAPI.getFileBrowserFileContent,
  };
});

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
  openAPI.getFileBrowserDownloadUrls.mockReset();
  openAPI.getFileBrowserFileContent.mockReset();
  downloadBinaryMock.mockReset();
  document.body.innerHTML = "";
});

function createFileContentResponse(
  options: Partial<FilebrowserFileContentResponse> = {},
): FilebrowserFileContentResponse {
  return {
    contentId: "",
    mimeType: "",
    mtimeNs: 0,
    path: "",
    size: 0,
    ...options,
  };
}

function createFileBrowserDownloadUrlEntry(
  options: Partial<FilebrowserFileBrowserDownloadUrlEntry> = {},
): FilebrowserFileBrowserDownloadUrlEntry {
  return {
    expiresAt: 0,
    path: "",
    url: "",
    ...options,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

  it("loads text previews through the Go file-content and binary routes", async () => {
    vi.mocked(getFileBrowserFileContent).mockResolvedValue({
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

      expect(getFileBrowserFileContent).toHaveBeenCalledWith({
        body: {
          path: "/workspace/readme.md",
          maxBytes: 1024 * 1024,
        },
      });
      expect(downloadBinary).toHaveBeenCalledWith({
        path: { contentId: "content-1" },
        parseAs: "blob",
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

  it("ignores stale text preview responses after the selected file changes", async () => {
    const fileContentResponses = new Map<
      string,
      ReturnType<
        typeof createDeferred<{
          data: FilebrowserFileContentResponse;
          status: number;
          hasResponse: true;
        }>
      >
    >();
    const binaryResponses = new Map<
      string,
      ReturnType<
        typeof createDeferred<{
          data: Blob;
          status: number;
          hasResponse: true;
        }>
      >
    >();

    vi.mocked(getFileBrowserFileContent).mockImplementation(({ body }) => {
      const deferred = createDeferred<{
        data: FilebrowserFileContentResponse;
        status: number;
        hasResponse: true;
      }>();
      fileContentResponses.set(body.path, deferred);
      return deferred.promise;
    });
    vi.mocked(downloadBinary).mockImplementation(({ path }) => {
      const deferred = createDeferred<{
        data: Blob;
        status: number;
        hasResponse: true;
      }>();
      binaryResponses.set(path.contentId, deferred);
      return deferred.promise;
    });

    const { host, root } = await renderFileBrowserUniversalPreview({
      selectedNode: {
        name: "first.md",
        fullPath: "/workspace/first.md",
        type: "file",
        parentPath: "/workspace",
      },
    });

    try {
      await flushEffects();
      expect(fileContentResponses.has("/workspace/first.md")).toBe(true);

      await act(async () => {
        root.render(
          createElement(FileBrowserUniversalPreview, {
            selectedNode: {
              name: "second.md",
              fullPath: "/workspace/second.md",
              type: "file",
              parentPath: "/workspace",
            },
          }),
        );
      });

      await flushEffects();
      expect(fileContentResponses.has("/workspace/second.md")).toBe(true);

      await act(async () => {
        fileContentResponses.get("/workspace/second.md")?.resolve({
          data: createFileContentResponse({
            path: "/workspace/second.md",
            contentId: "content-second",
            mimeType: "text/markdown",
          }),
          status: 200,
          hasResponse: true,
        });
        await Promise.resolve();
      });

      await act(async () => {
        binaryResponses.get("content-second")?.resolve({
          data: new Blob(["Second preview"], { type: "text/plain" }),
          status: 200,
          hasResponse: true,
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        host.querySelector(
          '[data-testid="file-browser-universal-preview-text"]',
        )?.textContent,
      ).toContain("Second preview");

      await act(async () => {
        fileContentResponses.get("/workspace/first.md")?.resolve({
          data: createFileContentResponse({
            path: "/workspace/first.md",
            contentId: "content-first",
            mimeType: "text/markdown",
          }),
          status: 200,
          hasResponse: true,
        });
        await Promise.resolve();
      });

      await act(async () => {
        binaryResponses.get("content-first")?.resolve({
          data: new Blob(["First preview"], { type: "text/plain" }),
          status: 200,
          hasResponse: true,
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        host.querySelector(
          '[data-testid="file-browser-universal-preview-text"]',
        )?.textContent,
      ).toContain("Second preview");
      expect(host.textContent).not.toContain("First preview");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("loads image previews through the Go download-url route", async () => {
    vi.mocked(getFileBrowserDownloadUrls).mockResolvedValue({
      data: [
        createFileBrowserDownloadUrlEntry({
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

      expect(getFileBrowserDownloadUrls).toHaveBeenCalledWith({
        body: {
          paths: ["/workspace/photo.png"],
        },
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
