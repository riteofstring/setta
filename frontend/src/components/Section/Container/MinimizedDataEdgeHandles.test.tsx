/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createUserDefaultDictSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";

vi.mock("state/actions/edgeHandles", () => ({
  registerEdgeHandlesWithSharedElement: vi.fn(),
  unregisterEdgeHandle: vi.fn(),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

type RenderedProfiledHandles = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledHandles(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledHandles> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="minimized-data-edge-handles-profiler" onRender={onRender}>
        <MinimizedDataEdgeHandles sectionId="section-1" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("MinimizedDataEdgeHandles store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
      });
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Section",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: createDictSectionImpl(createUserDefaultDictSectionImpl(), {
          id: implId,
          isMinimized: true,
          edgeInputParams: ["input-1"],
          edgeOutputPorts: [{ id: "output-1", accessor: "result" }],
        }),
      };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated project-state commits when minimized handle inputs are unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledHandles(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview writes should not re-run every mounted minimized handle selector.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelectorAll(".arg-edge-handle--target").length,
      ).toBeGreaterThan(0);
      expect(
        host.querySelectorAll(".arg-edge-handle--source").length,
      ).toBeGreaterThan(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when this section's minimized output ports change", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledHandles(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (!impl || impl.type !== "Dict") {
            throw new Error(`Missing dict impl ${implId}`);
          }
          impl.edgeOutputPorts = [
            { id: "output-1", accessor: "result" },
            { id: "output-2", accessor: "secondary" },
          ];
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(
        host.querySelectorAll(".arg-edge-handle--source").length,
      ).toBeGreaterThan(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
