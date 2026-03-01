import { afterEach, describe, expect, it, vi } from "vitest";

import { focusOnSectionSearch } from "./tabbingLogic";

describe("focusOnSectionSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when the search input is missing", () => {
    vi.stubGlobal("document", {
      getElementById: () => null,
    });
    expect(() => focusOnSectionSearch("missing-section")).not.toThrow();
  });

  it("focuses the search input when it exists", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        id === "section-a-search" ? { focus } : null,
    });

    focusOnSectionSearch("section-a");

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
