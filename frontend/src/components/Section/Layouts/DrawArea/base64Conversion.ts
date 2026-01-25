import { LayerCanvasesType } from "./types";

function dataURLToBase64(dataURL) {
  return dataURL.split(";base64,")[1];
}

export function canvasToBase64(canvas) {
  return dataURLToBase64(canvas.toDataURL("image/png"));
}

export async function base64ToImageObj(input_value: string) {
  const imgSrc = base64StrToImgSrc(input_value);
  const value = new Image();
  value.src = imgSrc;
  await value.decode();
  return value;
}

export function serializeLayerStackToBase64(
  layerCanvases: LayerCanvasesType,
  draftCanvas: HTMLCanvasElement | null,
): string | null {
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

  return canvasToBase64(tempCanvas);
}

function base64StrToImgSrc(base64Str: string) {
  return base64Str.startsWith("data:image/")
    ? base64Str
    : `data:image/png;base64,${base64Str}`;
}
