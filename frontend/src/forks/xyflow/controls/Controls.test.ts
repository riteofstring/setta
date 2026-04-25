import { describe, expect, it } from "vitest";

import { shouldShowWatchCodePortalControl } from "./Controls";

describe("shouldShowWatchCodePortalControl", () => {
  it("hides the Watch Code control in deployment mode", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: true,
      }),
    ).toBe(false);
  });

  it("shows the Watch Code control outside deployment mode", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: false,
      }),
    ).toBe(true);
  });
});
