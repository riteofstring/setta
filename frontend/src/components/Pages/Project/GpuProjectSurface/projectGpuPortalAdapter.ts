import type { GpuFlowPortalDescriptor } from "gpuFlow/portals/portalManager";

import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";

export const PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID =
  "setta-gpu-retained-codemirror-tooltips";
export const PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID =
  "setta-gpu-retained-param-validation";

const PROJECT_GPU_PORTALS = [
  {
    className: "setta-codemirror-tooltips",
    coordinateSpace: "source-local",
    id: CODEMIRROR_TOOLTIP_PARENT_ID,
  },
  {
    className: "setta-codemirror-tooltips setta-retained-codemirror-tooltips",
    coordinateSpace: "viewport",
    id: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  },
  {
    className: "setta-retained-param-validation",
    coordinateSpace: "viewport",
    id: PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
  },
] as const satisfies readonly GpuFlowPortalDescriptor[];

export function getProjectGpuPortalDescriptors(): readonly GpuFlowPortalDescriptor[] {
  return PROJECT_GPU_PORTALS;
}
