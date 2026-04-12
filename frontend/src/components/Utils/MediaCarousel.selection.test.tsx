/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaCarousel, type MediaCarouselItem } from "./MediaCarousel";

const mixedItems: Array<MediaCarouselItem> = [
  {
    id: "text-1",
    label: "Readme.md",
    text: "Text preview",
  },
  {
    id: "image-1",
    label: "Diagram.png",
    imageUrl: "https://example.com/diagram-full.png",
    thumbnailUrl: "https://example.com/diagram-thumb.png",
  },
];

describe("MediaCarousel selection sync", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("promotes the preferred media item when uncontrolled selection is missing", async () => {
    const onSelect = vi.fn();

    await act(async () => {
      root.render(<MediaCarousel items={mixedItems} onSelect={onSelect} />);
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("image-1");
    expect(
      host.querySelector('img[src="https://example.com/diagram-full.png"]'),
    ).not.toBeNull();
  });

  it("requests the preferred media item when external selection is invalid", async () => {
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        <MediaCarousel
          items={mixedItems}
          selectedId="missing-id"
          onSelect={onSelect}
        />,
      );
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("image-1");
  });
});
