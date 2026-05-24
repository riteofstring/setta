/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";

describe("GPU animation frame requirements", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser requestAnimationFrame API", () => {
    const callback = vi.fn();
    const requestAnimationFrame = vi.fn(() => 42);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    expect(requestGpuAnimationFrame(callback)).toBe(42);
    expect(requestAnimationFrame).toHaveBeenCalledWith(callback);
  });

  it("uses the browser cancelAnimationFrame API", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    cancelGpuAnimationFrame(42);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it("fails loudly when requestAnimationFrame is unavailable", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);

    expect(() => requestGpuAnimationFrame(() => {})).toThrow(
      "Setta GPU flow requires requestAnimationFrame.",
    );
  });

  it("fails loudly when cancelAnimationFrame is unavailable", () => {
    vi.stubGlobal("cancelAnimationFrame", undefined);

    expect(() => cancelGpuAnimationFrame(42)).toThrow(
      "Setta GPU flow requires cancelAnimationFrame.",
    );
  });
});
