import { describe, expect, it } from "vitest";

import {
  selectRetainedContentTexturePageReplacementDescriptor,
} from "./retainedContentTexturePageCoverageFrame";
import type { RetainedContentTexturePageReplacementDescriptor } from "./retainedContentTexturePageManagerTypes";
import type { RetainedReplacementRequest } from "./retainedVisibleCoveragePlanner";

describe("retained content texture page coverage frame", () => {
  it("keeps visible-hole repair ahead of refinement for the same descriptor", () => {
    const refinement = replacementDescriptor("visible-refinement");
    const visibleHole = replacementDescriptor("visible-hole");

    expect(
      selectRetainedContentTexturePageReplacementDescriptor({
        current: refinement,
        next: visibleHole,
      }).replacementRequest.priority,
    ).toBe("visible-hole");
    expect(
      selectRetainedContentTexturePageReplacementDescriptor({
        current: visibleHole,
        next: refinement,
      }).replacementRequest.priority,
    ).toBe("visible-hole");
  });
});

function replacementDescriptor(
  priority: RetainedReplacementRequest["priority"],
): RetainedContentTexturePageReplacementDescriptor {
  return {
    descriptor: {},
    replacementRequest: {
      priority,
    },
  } as RetainedContentTexturePageReplacementDescriptor;
}
