import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  assertGpuFlowPortalGroupsRenderable,
  getGpuFlowPortalClassName,
  GpuFlowPortalLayer,
  partitionGpuFlowPortals,
  type GpuFlowPortalDescriptor,
} from "./portalManager";

describe("GpuFlow portal manager", () => {
  it("partitions portals by coordinate space", () => {
    const portals: readonly GpuFlowPortalDescriptor[] = [
      { coordinateSpace: "viewport", id: "viewport-root" },
      { coordinateSpace: "source-local", id: "source-root" },
      { coordinateSpace: "flow-anchored", id: "flow-root" },
    ];

    expect(partitionGpuFlowPortals(portals)).toEqual({
      flowAnchored: [{ coordinateSpace: "flow-anchored", id: "flow-root" }],
      sourceLocal: [{ coordinateSpace: "source-local", id: "source-root" }],
      viewport: [{ coordinateSpace: "viewport", id: "viewport-root" }],
    });
  });

  it("renders classified portal roots", () => {
    const markup = renderToStaticMarkup(
      <GpuFlowPortalLayer
        portals={[
          {
            children: <span>child</span>,
            className: "project-root",
            coordinateSpace: "source-local",
            id: "source-root",
            retainedContentNative: true,
            testId: "source-root-testid",
          },
        ]}
      />,
    );

    expect(markup).toContain('id="source-root"');
    expect(markup).toContain('data-gpu-flow-portal-root="true"');
    expect(markup).toContain('data-gpu-flow-portal-space="source-local"');
    expect(markup).toContain('data-gpu-flow-retained-content-native="true"');
    expect(markup).toContain('data-testid="source-root-testid"');
    expect(markup).toContain("project-root");
    expect(markup).toContain("<span>child</span>");
  });

  it("rejects flow-anchored portals until they have renderer surfaces", () => {
    const portalGroups = partitionGpuFlowPortals([
      { coordinateSpace: "flow-anchored", id: "flow-root" },
    ]);

    expect(() => assertGpuFlowPortalGroupsRenderable(portalGroups)).toThrow(
      "GpuFlow flow-anchored portals require renderer overlay or HTML surface descriptors.",
    );
  });

  it("includes generic and coordinate-space classes", () => {
    expect(
      getGpuFlowPortalClassName({
        className: "setta-root",
        coordinateSpace: "viewport",
      }),
    ).toBe(
      "setta-gpu-flow__portal-root setta-gpu-flow__portal-root--viewport nodrag nopan setta-root",
    );
  });
});
