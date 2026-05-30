import type { ReactNode } from "react";

import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";

type GpuFlowPortalCoordinateSpace =
  | "flow-anchored"
  | "source-local"
  | "viewport";

export type GpuFlowPortalDescriptor = {
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly coordinateSpace: GpuFlowPortalCoordinateSpace;
  readonly id: string;
  readonly testId?: string | undefined;
};

type GpuFlowPortalGroups = {
  readonly flowAnchored: readonly GpuFlowPortalDescriptor[];
  readonly sourceLocal: readonly GpuFlowPortalDescriptor[];
  readonly viewport: readonly GpuFlowPortalDescriptor[];
};

/*
 * Supported portal spaces:
 * - source-local: DOM owned by a source surface, such as editor tooltips.
 * - flow-anchored: graph-positioned UI that must become a renderer overlay or
 *   HTML surface before project code uses it.
 * - viewport: app/global UI that should stay outside the canvas source subtree.
 */
export function partitionGpuFlowPortals(
  portals: readonly GpuFlowPortalDescriptor[] | undefined,
): GpuFlowPortalGroups {
  const flowAnchored: GpuFlowPortalDescriptor[] = [];
  const sourceLocal: GpuFlowPortalDescriptor[] = [];
  const viewport: GpuFlowPortalDescriptor[] = [];
  for (const portal of portals ?? []) {
    switch (portal.coordinateSpace) {
      case "flow-anchored":
        flowAnchored.push(portal);
        break;
      case "source-local":
        sourceLocal.push(portal);
        break;
      case "viewport":
        viewport.push(portal);
        break;
      default:
        assertNever(portal.coordinateSpace);
    }
  }
  return { flowAnchored, sourceLocal, viewport };
}

export function assertGpuFlowPortalGroupsRenderable(
  portalGroups: GpuFlowPortalGroups,
) {
  if (portalGroups.flowAnchored.length === 0) {
    return;
  }
  throw new Error(
    "GpuFlow flow-anchored portals require renderer overlay or HTML surface descriptors.",
  );
}

export function GpuFlowPortalLayer({
  portals,
}: {
  readonly portals: readonly GpuFlowPortalDescriptor[] | undefined;
}) {
  if (!portals?.length) {
    return null;
  }
  return <>{portals.map(renderGpuFlowPortalRoot)}</>;
}

function renderGpuFlowPortalRoot(portal: GpuFlowPortalDescriptor) {
  return (
    <div
      className={getGpuFlowPortalClassName(portal)}
      data-gpu-flow-portal-root="true"
      data-gpu-flow-portal-space={portal.coordinateSpace}
      data-testid={portal.testId}
      id={portal.id}
      key={portal.id}
    >
      {portal.children}
    </div>
  );
}

export function getGpuFlowPortalClassName(
  portal: Pick<GpuFlowPortalDescriptor, "className" | "coordinateSpace">,
): string {
  return [
    GPU_FLOW_CLASS_NAMES.portalRoot,
    `${GPU_FLOW_CLASS_NAMES.portalRoot}--${portal.coordinateSpace}`,
    portal.className,
  ]
    .filter(Boolean)
    .join(" ");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported GpuFlow portal coordinate space: ${value}`);
}
