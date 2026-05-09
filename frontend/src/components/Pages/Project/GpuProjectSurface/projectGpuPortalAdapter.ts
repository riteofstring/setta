import type { GpuFlowPortalDescriptor } from "gpuFlow/portals/portalManager";

import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";

const PROJECT_GPU_PORTALS = [
  {
    className: "setta-codemirror-tooltips",
    coordinateSpace: "source-local",
    id: CODEMIRROR_TOOLTIP_PARENT_ID,
  },
  {
    className: "setta-popover-portals",
    coordinateSpace: "viewport",
    id: SETTA_POPOVER_PORTAL_PARENT_ID,
  },
] as const satisfies readonly GpuFlowPortalDescriptor[];

export function getProjectGpuPortalDescriptors(): readonly GpuFlowPortalDescriptor[] {
  return PROJECT_GPU_PORTALS;
}
