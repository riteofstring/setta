/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
  BrailleSpinner,
} from "./BrailleSpinner";

describe("BrailleSpinner", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  });

  it("renders the shared braille spinner contract with the first frame immediately", async () => {
    await act(async () => {
      root.render(<BrailleSpinner />);
    });

    const spinner = host.querySelector('[data-unicode-spinner="braille"]');
    expect(spinner).not.toBeNull();
    expect(spinner?.textContent).toBe(BRAILLE_SPINNER_FRAMES[0]);
    expect(host.textContent).toBe(BRAILLE_SPINNER_FRAMES[0]);
  });

  it("advances through the unicode-animations braille frames on the exported interval", async () => {
    await act(async () => {
      root.render(<BrailleSpinner />);
    });

    await act(async () => {
      vi.advanceTimersByTime(BRAILLE_SPINNER_INTERVAL_MS);
    });
    expect(host.textContent).toBe(BRAILLE_SPINNER_FRAMES[1]);

    await act(async () => {
      vi.advanceTimersByTime(BRAILLE_SPINNER_INTERVAL_MS);
    });
    expect(host.textContent).toBe(BRAILLE_SPINNER_FRAMES[2]);
  });
});
