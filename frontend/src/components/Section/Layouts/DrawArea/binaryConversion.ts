import { LayerCanvasesType } from "./types";

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = "image/png",
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType);
  });
}

export async function blobToImageObj(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.src = objectUrl;
  await img.decode();
  img.dataset.objectUrl = objectUrl;
  return img;
}

export async function serializeLayerStackToBlob(
  layerCanvases: LayerCanvasesType,
  draftCanvas: HTMLCanvasElement | null,
): Promise<Blob | null> {
  const canvasesInOrder = layerCanvases.filter(
    (canvas): canvas is HTMLCanvasElement => canvas !== null,
  );
  const referenceCanvas = canvasesInOrder[0] ?? draftCanvas;
  if (!referenceCanvas) {
    return null;
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = referenceCanvas.width;
  tempCanvas.height = referenceCanvas.height;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  for (const canvas of layerCanvases) {
    if (canvas) {
      ctx.drawImage(canvas, 0, 0);
    }
  }

  if (draftCanvas) {
    ctx.drawImage(draftCanvas, 0, 0);
  }

  return await canvasToBlob(tempCanvas);
}
