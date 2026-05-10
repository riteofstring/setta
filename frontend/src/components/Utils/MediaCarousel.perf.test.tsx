import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaCarousel, type MediaCarouselItem } from "./MediaCarousel";

describe("MediaCarousel (perf)", () => {
  it("renders large thumbnail strips within budget", () => {
    const items: Array<MediaCarouselItem> = Array.from(
      { length: 1200 },
      (_value, index) => ({
        id: `item-${index}`,
        label: `Item ${index}`,
        imageUrl: `https://example.com/${index}.png`,
        thumbnailUrl: `https://example.com/${index}-thumb.png`,
      }),
    );

    const start = performance.now();
    const markup = renderToStaticMarkup(
      <MediaCarousel items={items} selectedId="item-0" showNavButtons />,
    );
    const elapsedMs = performance.now() - start;

    expect(markup).toContain('data-media-carousel-item-id="item-0"');
    expect(elapsedMs).toBeLessThan(1800);
  });
});
