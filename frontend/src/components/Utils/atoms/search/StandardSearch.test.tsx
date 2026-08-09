/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";
import { StandardSearch } from "./StandardSearch";

type RenderedStandardSearch = {
  host: HTMLDivElement;
  root: Root;
};

async function renderStandardSearch(
  props: ComponentProps<typeof StandardSearch> = {},
): Promise<RenderedStandardSearch> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<StandardSearch {...props} />);
  });

  return { host, root };
}

async function unmountRenderedSearch(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

describe("StandardSearch", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the default placeholder, classes, and left icon", async () => {
    const { host, root } = await renderStandardSearch();

    try {
      const search = host.querySelector("search");
      const input = host.querySelector("input");

      expect(search?.className).toContain("dark:text-setta-200");
      expect(input?.getAttribute("placeholder")).toBe("Search");
      expect(input?.className).toContain("placeholder-setta-300");
      expect(host.querySelector(".gg-sort-az")).not.toBeNull();
    } finally {
      await unmountRenderedSearch(root);
    }
  });

  it("renders custom slots and hides the left adornment when requested", async () => {
    const { host, root } = await renderStandardSearch({
      inputStyles: "custom-input",
      outerClasses: "custom-shell",
      leftElement: <span data-testid="left-slot">left</span>,
      noLeftElement: true,
      rightElement: <span data-testid="right-slot">right</span>,
    });

    try {
      const search = host.querySelector("search");
      const input = host.querySelector("input");

      expect(search?.className).toContain("custom-shell");
      expect(input?.className).toBe("custom-input");
      expect(host.querySelector("[data-testid='left-slot']")).toBeNull();
      expect(host.querySelector(".gg-sort-az")).toBeNull();
      expect(
        host.querySelector("[data-testid='right-slot']")?.textContent,
      ).toBe("right");
    } finally {
      await unmountRenderedSearch(root);
    }
  });
});
