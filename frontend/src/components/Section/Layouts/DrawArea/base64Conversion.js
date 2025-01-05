export function dataURLToBase64(dataURL) {
  return dataURL.split(";base64,")[1];
}

export function canvasToBase64(canvas) {
  return dataURLToBase64(canvas.toDataURL("image/png"));
}

// function exportStrokesToBase64(strokes, width, height) {
//   // Create a temporary canvas
//   const tempCanvas = document.createElement("canvas");
//   tempCanvas.width = width;
//   tempCanvas.height = height;
//   const tempCtx = tempCanvas.getContext("2d");

//   // Draw strokes on the temporary canvas
//   strokes.forEach((stroke) => {
//     drawStrokeOnTempCanvas(tempCanvas, tempCtx, stroke);
//   });

//   return canvasToBase64(tempCanvas);
// }

// function exportImageToBase64(image, width, height) {
//   // Create a temporary canvas
//   const tempCanvas = document.createElement("canvas");
//   tempCanvas.width = width;
//   tempCanvas.height = height;
//   const tempCtx = tempCanvas.getContext("2d");
//   tempCtx.drawImage(image, 0, 0);
//   return canvasToBase64(tempCanvas);
// }

// export function allPartsToBase64(canvasRef) {
//   const [width, height] = [canvasRef.current.width, canvasRef.current.height];
//   const base64 = {};
//   base64["completeCanvas"] = canvasToBase64(canvasRef.current);
//   base64["strokes"] = exportStrokesToBase64(strokesRef.current, width, height);
//   if (imageRef.current) {
//     base64["image"] = exportImageToBase64(imageRef.current, width, height);
//   }
//   return base64;
// }

export function base64StrToImgSrc(base64Str) {
  return `data:image/png;base64,${base64Str}`;
}
