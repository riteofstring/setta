/* @vitest-environment jsdom */

import { loadCachedImageArtifacts } from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDecodedImages, useImages } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createContentRef,
  createImageArtifact,
  createPolicy,
} from "utils/generatedTypes";

const openAPIMocks = vi.hoisted(() => ({
  loadCachedImageArtifacts: vi.fn(),
}));

const decodeExistingRawImagesMock = vi.hoisted(() => vi.fn());

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    loadCachedImageArtifacts: openAPIMocks.loadCachedImageArtifacts,
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

vi.mock("state/hooks/artifacts", async () => {
  const actual = await vi.importActual<typeof import("state/hooks/artifacts")>(
    "state/hooks/artifacts",
  );
  return {
    ...actual,
    decodeExistingRawImages: decodeExistingRawImagesMock,
  };
});

import { AppRuntimeContext } from "./appContext";
import { appRegistry } from "./appRegistry";

type RenderedRegistryNode = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

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
    resetProjectStores();
    openAPIMocks.loadCachedImageArtifacts.mockReset();
    decodeExistingRawImagesMock.mockReset();
    document.body.innerHTML = "";
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
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
    decodeExistingRawImagesMock.mockImplementation(async (artifactIds) => {
      // Mirror the production decode step by publishing the decoded image to the shared store.
      expect(artifactIds).toEqual([artifact.id]);
      const decoded = document.createElement("img");
      decoded.src = "blob:test-output-image";
      decoded.dataset.contentId = artifact.value.contentId;
      useDecodedImages.setState((state) => ({
        x: { ...state.x, [artifact.id]: decoded },
        revisionById: {
          ...state.revisionById,
          [artifact.id]: (state.revisionById[artifact.id] ?? 0) + 1,
        },
      }));
    });

    const { host, root } = await renderRegistryNode();
    await flushEffects();

    expect(loadCachedImageArtifacts).toHaveBeenCalledWith({
      body: {
        paths: [artifact.id],
      },
    });
    expect(useImages.getState().x[artifact.id]).toEqual(artifact);
    const renderedImage = host.querySelector(
      'img[alt="Bound output image"]',
    ) as HTMLImageElement | null;
    expect(renderedImage?.src).toContain("blob:test-output-image");

    await act(async () => {
      root.unmount();
    });
  });
});
