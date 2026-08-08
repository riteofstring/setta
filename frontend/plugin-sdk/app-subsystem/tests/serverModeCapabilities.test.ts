import { describe, expect, it } from "vitest";

import { resolveServerModeCapabilities } from "../src/index";

describe("resolveServerModeCapabilities", () => {
  it("enables desktop-launcher management only in ide mode", () => {
    expect(resolveServerModeCapabilities("ide").canManageDesktopLauncher).toBe(
      true,
    );
    expect(
      resolveServerModeCapabilities("launcher").canManageDesktopLauncher,
    ).toBe(false);
    expect(
      resolveServerModeCapabilities("share").canManageDesktopLauncher,
    ).toBe(false);
    expect(resolveServerModeCapabilities("app").canManageDesktopLauncher).toBe(
      false,
    );
    expect(resolveServerModeCapabilities(null).canManageDesktopLauncher).toBe(
      false,
    );
  });
});
