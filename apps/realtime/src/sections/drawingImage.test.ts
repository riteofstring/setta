import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareDrawingImage } from "./drawingImage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("drawing image preparation", () => {
  it("rejects unsupported and oversized source files before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const unsupported = new File(["setta"], "drawing.svg", {
      type: "image/svg+xml",
    });
    const oversized = new File(["setta"], "drawing.png", {
      type: "image/png",
    });
    Object.defineProperty(oversized, "size", { value: 21 * 1024 * 1024 });

    await expect(prepareDrawingImage(unsupported)).rejects.toThrow(
      "Choose a PNG, JPEG, or WebP image.",
    );
    await expect(prepareDrawingImage(oversized)).rejects.toThrow(
      "Choose an image smaller than 20 MB.",
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it("downscales and bounds the embedded WebP payload", async () => {
    const close = vi.fn();
    const bitmap = { close, height: 2000, width: 4000 } as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const encodedSizes = [700 * 1024, 100];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        const size = encodedSizes.shift() ?? 100;
        callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
      },
    );

    const source = await prepareDrawingImage(
      new File(["setta"], "drawing.png", { type: "image/png" }),
    );

    expect(source).toMatch(/^data:image\/webp;base64,/u);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.calls[0]?.slice(3)).toEqual([2048, 1024]);
    expect(drawImage.mock.calls[1]?.slice(3)).toEqual([1761, 881]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("releases decoded resources when the image cannot be bounded", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close, height: 2048, width: 2048 }) as ImageBitmap),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) =>
        callback(
          new Blob([new Uint8Array(700 * 1024)], { type: "image/webp" }),
        ),
    );

    await expect(
      prepareDrawingImage(
        new File(["setta"], "drawing.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("too detailed to embed");
    expect(close).toHaveBeenCalledOnce();
  });
});
