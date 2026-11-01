/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersReducedWorkspaceMotion,
  resolveWorkspaceMotionDuration,
  WORKSPACE_REDUCED_MOTION_QUERY,
} from "./motion.js";

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

function installMotionPreference(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });
  return matchMedia;
}

function restoreMatchMedia() {
  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
    return;
  }
  Reflect.deleteProperty(window, "matchMedia");
}

afterEach(() => {
  restoreMatchMedia();
  vi.restoreAllMocks();
});

describe("workspace motion preference", () => {
  it("preserves requested durations when motion is allowed", () => {
    const matchMedia = installMotionPreference(false);

    expect(prefersReducedWorkspaceMotion()).toBe(false);
    expect(resolveWorkspaceMotionDuration(170)).toBe(170);
    expect(matchMedia).toHaveBeenCalledWith(WORKSPACE_REDUCED_MOTION_QUERY);
  });

  it("makes package camera motion immediate when reduced motion is requested", () => {
    installMotionPreference(true);

    expect(prefersReducedWorkspaceMotion()).toBe(true);
    expect(resolveWorkspaceMotionDuration(170)).toBe(0);
  });

  it("uses the platform no-preference behavior when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });

    expect(prefersReducedWorkspaceMotion()).toBe(false);
    expect(resolveWorkspaceMotionDuration(170)).toBe(170);
  });
});
