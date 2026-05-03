import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuPortalDescriptors,
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";

describe("project GPU portal adapter", () => {
  it("classifies current project portal roots by GpuFlow coordinate space", () => {
    expect(getProjectGpuPortalDescriptors()).toEqual([
      {
        className: "setta-codemirror-tooltips",
        coordinateSpace: "source-local",
        id: CODEMIRROR_TOOLTIP_PARENT_ID,
        retainedContentNative: true,
      },
      {
        className:
          "setta-codemirror-tooltips setta-retained-codemirror-tooltips",
        coordinateSpace: "viewport",
        id: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
        retainedContentNative: true,
      },
      {
        className: "setta-retained-param-validation",
        coordinateSpace: "viewport",
        id: PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
      },
    ]);
  });
});
