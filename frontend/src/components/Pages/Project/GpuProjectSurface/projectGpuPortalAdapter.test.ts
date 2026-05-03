import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuPortalDescriptors,
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
} from "./projectGpuPortalAdapter";

describe("project GPU portal adapter", () => {
  it("classifies current project portal roots by GpuFlow coordinate space", () => {
    expect(getProjectGpuPortalDescriptors()).toEqual([
      {
        className: "setta-codemirror-tooltips",
        coordinateSpace: "source-local",
        id: CODEMIRROR_TOOLTIP_PARENT_ID,
      },
      {
        className:
          "setta-codemirror-tooltips setta-retained-codemirror-tooltips",
        coordinateSpace: "viewport",
        id: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
      },
      {
        className: "setta-popover-portals",
        coordinateSpace: "viewport",
        id: SETTA_POPOVER_PORTAL_PARENT_ID,
      },
    ]);
  });
});
