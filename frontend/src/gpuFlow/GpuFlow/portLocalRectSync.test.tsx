/* @vitest-environment jsdom */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuFlowLayoutStore,
  type GpuFlowLayoutStoreApi,
} from "../layoutStore";
import { useGpuFlowPortLocalRectSync } from "./portLocalRectSync";

let root: Root | null = null;

describe("GpuFlow port local rect sync", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = "";
  });

  it("schedules DOM port rect updates for non-scene layout size changes", () => {
    const store = createGpuFlowLayoutStore();
    const schedulePortLocalRectUpdate = vi.fn();

    renderHookHarness(
      <PortLocalRectSyncHarness
        enabled
        schedulePortLocalRectUpdate={schedulePortLocalRectUpdate}
        store={store}
      />,
    );

    act(() => {
      store.getState().upsertNodes([layoutNode("section-a")], {
        dirty: ["source-size"],
        reason: "intrinsic-size",
      });
    });

    expect(schedulePortLocalRectUpdate).toHaveBeenCalledTimes(1);
    expect(schedulePortLocalRectUpdate).toHaveBeenCalledWith(["section-a"]);
  });

  it("does not subscribe to DOM port rect updates for scene-backed layouts", () => {
    const store = createGpuFlowLayoutStore();
    const schedulePortLocalRectUpdate = vi.fn();

    renderHookHarness(
      <PortLocalRectSyncHarness
        enabled={false}
        schedulePortLocalRectUpdate={schedulePortLocalRectUpdate}
        store={store}
      />,
    );

    act(() => {
      store.getState().upsertNodes([layoutNode("section-a")], {
        dirty: ["source-size"],
        reason: "intrinsic-size",
      });
    });

    expect(schedulePortLocalRectUpdate).not.toHaveBeenCalled();
  });
});

function PortLocalRectSyncHarness({
  enabled,
  schedulePortLocalRectUpdate,
  store,
}: {
  readonly enabled: boolean;
  readonly schedulePortLocalRectUpdate: (nodeIds: readonly string[]) => void;
  readonly store: GpuFlowLayoutStoreApi;
}) {
  useGpuFlowPortLocalRectSync(store, {
    enabled,
    schedulePortLocalRectUpdate,
  });
  return null;
}

function renderHookHarness(element: ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}

function layoutNode(nodeId: string) {
  return {
    height: 80,
    nodeId,
    width: 120,
    x: 0,
    y: 0,
  };
}
