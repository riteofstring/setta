const DRAWING_IMAGE_ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DRAWING_IMAGE_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DRAWING_IMAGE_MAX_EDGE = 2048;
const DRAWING_IMAGE_MAX_EMBEDDED_BYTES = 600 * 1024;
const DRAWING_IMAGE_MINIMUM_QUALITY = 0.58;
const DRAWING_IMAGE_ATTEMPTS = 8;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("Realtime could not encode this image."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () =>
      reject(new Error("Realtime could not read the encoded image.")),
    );
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Realtime could not read the encoded image."));
        return;
      }
      resolve(reader.result);
    });
    reader.readAsDataURL(blob);
  });
}

function initialScale(width: number, height: number): number {
  return Math.min(1, DRAWING_IMAGE_MAX_EDGE / Math.max(width, height));
}

export async function prepareDrawingImage(file: File): Promise<string> {
  if (!DRAWING_IMAGE_ACCEPTED_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > DRAWING_IMAGE_MAX_FILE_BYTES) {
    throw new Error("Choose an image smaller than 20 MB.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Realtime could not decode this image.");
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error("Choose an image with a non-empty width and height.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Realtime could not prepare this image.");
    }
    let scale = initialScale(bitmap.width, bitmap.height);
    let quality = 0.88;
    for (let attempt = 0; attempt < DRAWING_IMAGE_ATTEMPTS; attempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= DRAWING_IMAGE_MAX_EMBEDDED_BYTES) {
        return blobDataUrl(blob);
      }
      const reduction = Math.min(
        0.86,
        Math.sqrt(DRAWING_IMAGE_MAX_EMBEDDED_BYTES / blob.size) * 0.94,
      );
      scale *= Math.max(0.5, reduction);
      quality = Math.max(DRAWING_IMAGE_MINIMUM_QUALITY, quality - 0.06);
    }
    throw new Error("This image is too detailed to embed in the drawing.");
  } finally {
    bitmap.close();
  }
}
