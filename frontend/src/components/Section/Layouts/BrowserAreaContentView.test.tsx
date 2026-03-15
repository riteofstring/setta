import { renderToStaticMarkup } from "react-dom/server";
import {
  BrowserAreaViewModeEnum,
  type FolderContentItem,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { BrowserAreaContentView } from "./BrowserAreaContentView";

const imageItem = {
  name: "photo.png",
  fullPath: "/tmp/photo.png",
  type: "file",
  size: 128,
} satisfies FolderContentItem;

describe("BrowserAreaContentView", () => {
  it("renders thumbnail items with preview images and sublabels in icon view", () => {
    // Cover the extracted thumbnail surface directly so BrowserArea no longer has to own this assertion.
    const markup = renderToStaticMarkup(
      <BrowserAreaContentView
        view={BrowserAreaViewModeEnum.thumbnail}
        items={[imageItem]}
        filesColumnWidth="320px"
        onFilesColumnResizeStart={() => undefined}
        fileUrlMap={{
          [imageItem.fullPath]: {
            url: "https://example.com/photo.png",
            expiresAt: 1_999_999_999,
          },
        }}
        selectedCarouselId={null}
        onSelectCarouselId={vi.fn()}
        textPreviewMap={{}}
        getItemSubLabel={() => "nested/folder"}
        onOpenFolder={vi.fn()}
        onOpenFile={vi.fn()}
      />,
    );

    expect(markup).toContain("photo.png");
    expect(markup).toContain("nested/folder");
    expect(markup).toContain('alt="photo.png"');
    expect(markup).toContain("https://example.com/photo.png");
    expect(markup).toContain('data-browser-thumbnail-path="/tmp/photo.png"');
  });
});
