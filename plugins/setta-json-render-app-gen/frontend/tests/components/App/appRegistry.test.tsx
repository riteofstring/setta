/* @vitest-environment jsdom */

import {
  downloadBinary,
  loadCachedImageArtifacts,
} from "@setta/app-subsystem-frontend-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "testUtils/reactRefreshPreamble";
import {
  createContentRef,
  createImageArtifact,
  createPolicy,
} from "utils/generatedTypes";
import { resetAppSubsystemImageArtifactsState } from "../../../src/appSubsystemImageArtifacts";

const openAPIMocks = vi.hoisted(() => ({
  loadCachedImageArtifacts: vi.fn(),
  downloadBinary: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async () => {
  const actual = await vi.importActual<
    typeof import("@setta/app-subsystem-frontend-sdk")
  >("@setta/app-subsystem-frontend-sdk");
  return {
    ...actual,
    loadCachedImageArtifacts: openAPIMocks.loadCachedImageArtifacts,
    downloadBinary: openAPIMocks.downloadBinary,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

import { AppRuntimeContext } from "../../../src/components/App/appContext";
import { appRegistry } from "../../../src/components/App/appRegistry";

type RenderedRegistryNode = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalImageDecode = HTMLImageElement.prototype.decode;

async function renderRegistryNode(): Promise<RenderedRegistryNode> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ImageOutput = appRegistry.ImageOutput;

  await act(async () => {
    root.render(
      <AppRuntimeContext.Provider
        value={{
          dataBindings: {
            outputs: {
              preview: {
                artifactId: "artifacts/output.png",
                alt: "Bound output image",
              },
            },
          },
          actions: {},
          policy: createPolicy(),
          canEditParams: true,
          allowExternalLinks: true,
          allowFileDownloads: true,
          defaultConfigId: null,
          theme: null,
        }}
      >
        <ImageOutput element={{ props: { dataPath: "/outputs/preview" } }} />
      </AppRuntimeContext.Provider>,
    );
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await vi.dynamicImportSettled();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("appRegistry", () => {
  beforeEach(() => {
    resetAppSubsystemImageArtifactsState();
    openAPIMocks.loadCachedImageArtifacts.mockReset();
    openAPIMocks.downloadBinary.mockReset();
    document.body.innerHTML = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-output-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    resetAppSubsystemImageArtifactsState();
    document.body.innerHTML = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: originalImageDecode,
    });
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = originalReactActEnvironment;
  });

  it("hydrates image outputs through the Go cached-image contract", async () => {
    const artifact = createImageArtifact({
      id: "artifacts/output.png",
      value: createContentRef({
        contentId: "content-1",
        mimeType: "image/png",
      }),
    });

    openAPIMocks.loadCachedImageArtifacts.mockResolvedValue({
      data: [artifact],
      status: 200,
      hasResponse: true,
    });
    openAPIMocks.downloadBinary.mockResolvedValue({
      data: new Blob(["image"], {
        type: "image/png",
      }),
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderRegistryNode();
    await flushEffects();

    expect(loadCachedImageArtifacts).toHaveBeenCalledWith({
      body: {
        paths: [artifact.id],
      },
    });
    expect(downloadBinary).toHaveBeenCalledWith({
      path: {
        contentId: artifact.value.contentId,
      },
    });
    const renderedImage = host.querySelector(
      'img[alt="Bound output image"]',
    ) as HTMLImageElement | null;
    expect(renderedImage?.src).toContain("blob:test-output-image");

    await act(async () => {
      root.unmount();
    });
  });
});
