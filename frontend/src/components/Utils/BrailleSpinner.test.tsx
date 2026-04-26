/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import spinners from "unicode-animations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrailleSpinner } from "./BrailleSpinner";

const BRAILLE_SPINNER_FRAMES = [...spinners.braille.frames];

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
      vi.advanceTimersByTime(spinners.braille.interval);
    });
    expect(host.textContent).toBe(BRAILLE_SPINNER_FRAMES[1]);

    await act(async () => {
      vi.advanceTimersByTime(spinners.braille.interval);
    });
    expect(host.textContent).toBe(BRAILLE_SPINNER_FRAMES[2]);
  });

  it("shares one timer across multiple spinner instances", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    await act(async () => {
      root.render(
        <>
          {Array.from({ length: 10 }, (_, index) => (
            <BrailleSpinner key={index} />
          ))}
        </>,
      );
    });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(spinners.braille.interval);
    });

    const spinnerElements = Array.from(
      host.querySelectorAll('[data-unicode-spinner="braille"]'),
    );
    expect(spinnerElements).toHaveLength(10);
    expect(
      spinnerElements.every(
        (spinner) => spinner.textContent === BRAILLE_SPINNER_FRAMES[1],
      ),
    ).toBe(true);
  });
});
