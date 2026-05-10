/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RenderedEdgesStrip = {
  readonly host: HTMLDivElement;
  readonly root: Root;
};

function seedEdgeStripState(sectionId = "section-edge-strip") {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Dict",
        defaultVariant: variantId,
        variants: [variantId],
      }),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
        name: "Variant",
        nonPresetImpls: [implId],
      }),
    },
    sectionImpls: {
      [implId]: createDictSectionImpl({
        id: implId,
        edgeOutputPorts: [
          { id: "out-alpha", accessor: "alpha" },
          { id: "out-beta", accessor: "beta" },
        ],
      }),
    },
    shownParamIds: {
      [variantId]: {
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        unpinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    },
  });
  return sectionId;
}

async function renderEdgesStrip(
  sectionId: string,
): Promise<RenderedEdgesStrip> {
  const { EdgesStrip } = await import("./edgesStrip");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <EdgesStrip
        sectionId={sectionId}
        bgColor="bg-transparent"
        renderInteractiveInputHandles={false}
        renderInteractiveOutputHandles={false}
      />,
    );
  });

  return { host, root };
}

describe("EdgesStrip", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    vi.unstubAllGlobals();
  });

  it("renders edge rows without observing DOM layout", async () => {
    class ThrowingResizeObserver {
      constructor() {
        throw new Error("EdgesStrip should not instantiate ResizeObserver.");
      }
    }
    vi.stubGlobal("ResizeObserver", ThrowingResizeObserver);
    const sectionId = seedEdgeStripState();

    const rendered = await renderEdgesStrip(sectionId);

    expect(rendered.host.textContent).toContain("alpha");

    await act(async () => {
      rendered.root.unmount();
    });
  });
});
