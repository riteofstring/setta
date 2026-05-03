/* @vitest-environment jsdom */

import type { GpuDomIsland } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paramInputProps: vi.fn(),
  subscribeToGpuViewportRepositionMock: vi.fn(),
  unsubscribeViewportRepositionMock: vi.fn(),
}));

vi.mock("components/Params/ParamItems/ParamInput", () => ({
  ParamInput: (props: {
    paramInfoId: string;
    sectionId: string;
    tooltipParentDivId?: string | null;
  }) => {
    mocks.paramInputProps(props);
    return (
      <div
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
      />
    );
  },
}));

vi.mock("gpuFlow/viewportReposition", () => ({
  subscribeToGpuViewportReposition: () => {
    mocks.subscribeToGpuViewportRepositionMock();
    return mocks.unsubscribeViewportRepositionMock;
  },
}));

import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";
import { renderProjectGpuDomIsland } from "./projectGpuRetainedParamInteractionAdapter";

type RenderedIsland = {
  host: HTMLDivElement;
  root: Root;
};

async function renderIsland(island: GpuDomIsland): Promise<RenderedIsland> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<>{renderProjectGpuDomIsland(island)}</>);
  });

  return { host, root };
}

async function cleanupRenderedIsland(rendered: RenderedIsland) {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("project GPU retained param DOM islands", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.paramInputProps.mockClear();
    mocks.subscribeToGpuViewportRepositionMock.mockClear();
    mocks.unsubscribeViewportRepositionMock.mockClear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("mounts retained param inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
          sectionId: "section-1",
          tooltipParentDivId: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
        }),
      );
      expect(
        rendered.host
          .querySelector('[data-testid="param-input"]')
          ?.getAttribute("data-tooltip-parent"),
      ).toBe(PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID);
      expect(mocks.subscribeToGpuViewportRepositionMock).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }

    expect(mocks.unsubscribeViewportRepositionMock).toHaveBeenCalledTimes(1);
  });
});

function retainedParamIsland(): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 160, x: 0, y: 0 },
    id: "param-control:section-1:param-1",
    kind: "retained-content-control",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 160, x: 10, y: 20 },
    source: {
      hitRecordId: "control:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
  };
}
