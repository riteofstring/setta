import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaCarousel, type MediaCarouselItem } from "./MediaCarousel";

const imageItems: Array<MediaCarouselItem> = [
  {
    id: "image-1",
    label: "Image One",
    imageUrl: "https://example.com/full.png",
    thumbnailUrl: "https://example.com/thumb.png",
  },
  {
    id: "image-2",
    label: "Image Two",
    imageUrl: "https://example.com/second.png",
    thumbnailUrl: "https://example.com/second-thumb.png",
  },
];

const textItems: Array<MediaCarouselItem> = [
  {
    id: "text-1",
    label: "Text One",
    text: "Hello preview",
  },
  {
    id: "image-3",
    label: "Image Three",
    imageUrl: "https://example.com/third.png",
  },
];

describe("MediaCarousel", () => {
  it("renders the selected image preview", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={imageItems} selectedId="image-1" />,
    );

    expect(markup).toContain('src="https://example.com/full.png"');
    expect(markup).toContain("Image One");
  });

  it("renders text content for selected text items", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={textItems} selectedId="text-1" />,
    );

    expect(markup).toContain("Hello preview");
  });

  it("shows navigation buttons when enabled", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={imageItems} selectedId="image-1" showNavButtons />,
    );

    expect(markup).toContain('aria-label="Previous item"');
    expect(markup).toContain('aria-label="Next item"');
  });

  it("omits navigation buttons by default", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={imageItems} selectedId="image-1" />,
    );

    expect(markup).not.toContain('aria-label="Previous item"');
    expect(markup).not.toContain('aria-label="Next item"');
  });

  it("marks preview and thumbnail row for scroll handling", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={imageItems} selectedId="image-1" />,
    );

    expect(markup).toContain("nowheel");
    expect(markup).toContain("nopan");
  });

  it("renders stable thumbnail identifiers and optional drag attributes", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel
        items={imageItems}
        selectedId="image-1"
        isThumbnailDraggable={(item) => item.id === "image-1"}
      />,
    );

    expect(markup).toContain('data-media-carousel-item-id="image-1"');
    expect(markup).toContain('data-media-carousel-item-id="image-2"');
    expect(markup).toContain('draggable="true"');
  });

  it("keeps the shared thumbnail shell off single-cell helpers", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel items={imageItems} selectedId="image-1" />,
    );

    // The shared carousel shell should now be a plain relative flex wrapper so
    // every host can reuse it without the old single-cell grid contract.
    expect(markup).toContain(
      "relative flex shrink-0 items-center justify-center overflow-clip rounded-md border border-solid",
    );
    expect(markup).not.toContain("single-cell-container");
    expect(markup).not.toContain("single-cell-child");
  });

  it("preserves custom thumbnail content inside the shared shell", () => {
    const markup = renderToStaticMarkup(
      <MediaCarousel
        items={imageItems}
        selectedId="image-1"
        renderThumbnail={(item) => (
          <div data-custom-thumbnail={item.id} className="h-full w-full" />
        )}
      />,
    );

    expect(markup).toContain('data-custom-thumbnail="image-1"');
    expect(markup).toContain('data-custom-thumbnail="image-2"');
    expect(markup).not.toContain("single-cell-container");
    expect(markup).not.toContain("single-cell-child");
  });
});
