import * as fabric from "fabric";
import { useEffect, useRef, useState } from "react";

export const DrawOnImage = () => {
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState(null);

  useEffect(() => {
    const initCanvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      width: 500,
      height: 500,
    });

    setCanvas(initCanvas);

    // Load an image (replace with your image URL)
    fabric.Image.fromURL(
      "https://kevinmusgrave.com/img/kevin-musgrave2.png",
      function (img) {
        initCanvas.setBackgroundImage(
          img,
          initCanvas.renderAll.bind(initCanvas),
          {
            scaleX: initCanvas.width / img.width,
            scaleY: initCanvas.height / img.height,
          },
        );
      },
    );

    return () => {
      initCanvas.dispose();
    };
  }, []);

  const setDrawMode = () => {
    if (canvas) {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = "red";
      canvas.freeDrawingBrush.width = 5;
    }
  };

  const setEraseMode = () => {
    if (canvas) {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = "white";
      canvas.freeDrawingBrush.width = 20;
    }
  };

  const saveImage = () => {
    if (canvas) {
      const dataURL = canvas.toDataURL({
        format: "png",
        quality: 0.8,
      });
      const link = document.createElement("a");
      link.download = "canvas-image.png";
      link.href = dataURL;
      link.click();
    }
  };

  return (
    <div className="nodrag flex flex-col items-center">
      <div className="mb-4 border border-gray-300">
        <canvas ref={canvasRef} />
      </div>
      <div className="flex space-x-4">
        <button
          className="rounded bg-blue-500 px-4 py-2 text-white"
          onClick={setDrawMode}
        >
          Draw Mode
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 text-white"
          onClick={setEraseMode}
        >
          Erase Mode
        </button>
        <button
          className="rounded bg-green-500 px-4 py-2 text-white"
          onClick={saveImage}
        >
          Save Image
        </button>
      </div>
    </div>
  );
};

// import _ from "lodash";
// import { useEffect, useRef, useState } from "react";
// import { setSectionSize } from "state/actions/sections/setters";
// import { useSectionInfos } from "state/definitions";

// // some code from https://stackoverflow.com/a/29073539

// export function DrawOnImage({ sectionId }) {
//   const { width, height } = useSectionInfos(
//     (x) => x.x[sectionId].size,
//     _.isEqual,
//   );
//   const imageUrl = "https://kevinmusgrave.com/img/kevin-musgrave2.png";
//   const canvasRef = useRef(null);
//   const draftCanvasRef = useRef(null);
//   const imageRef = useRef(null);
//   const prevPointRef = useRef(null);
//   const [isDrawing, setIsDrawing] = useState(false);

//   const drawImageOnCanvas = () => {
//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     const image = imageRef.current;

//     if (image && image.complete) {
//       canvas.width = width === "auto" ? image.width : width;
//       canvas.height = height === "auto" ? image.height : height;

//       if (width === "auto" || height === "auto") {
//         setSectionSize(sectionId, { width: image.width, height: image.height });
//       }

//       // Fit image to canvas size while maintaining aspect ratio
//       const scale = Math.min(
//         canvas.width / image.width,
//         canvas.height / image.height,
//       );
//       const x = canvas.width / 2 - (image.width / 2) * scale;
//       const y = canvas.height / 2 - (image.height / 2) * scale;
//       ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
//     }

//     const draftCanvas = draftCanvasRef.current;
//     draftCanvas.width = canvas.width;
//     draftCanvas.height = canvas.height;
//     const dCtx = draftCanvas.getContext("2d");
//     dCtx.strokeStyle = "rgb(255,0,0)";
//     dCtx.lineWidth = 16;
//     dCtx.lineCap = "round";

//     const alpha = 0.5;
//     // set up alpha
//     draftCanvas.style.opacity = alpha; // CSS alpha for draft
//     ctx.globalAlpha = alpha; // context alpha for main
//   };

//   useEffect(() => {
//     const image = new Image();
//     image.src = imageUrl;
//     image.onload = () => {
//       imageRef.current = image;
//       drawImageOnCanvas();
//     };
//   }, [imageUrl]);

//   useEffect(() => {
//     drawImageOnCanvas();
//   }, [height, width]);

//   function onMouseDown(e) {
//     setIsDrawing(true);
//     prevPointRef.current = getXY(e);
//   }

//   function onMouseMove(e) {
//     if (!isDrawing) return;
//     const point = getXY(e);
//     const ctx = draftCanvasRef.current.getContext("2d");
//     ctx.beginPath(); // new path
//     ctx.moveTo(prevPointRef.current.x, prevPointRef.current.y);
//     ctx.lineTo(point.x, point.y);
//     ctx.stroke();
//     prevPointRef.current = point;
//   }

//   function onMouseUp() {
//     setIsDrawing(false); // when up:
//     const ctx = canvasRef.current.getContext("2d");
//     ctx.drawImage(draftCanvasRef.current, 0, 0);

//     const draftCtx = draftCanvasRef.current.getContext("2d");
//     draftCtx.clearRect(
//       0,
//       0,
//       draftCanvasRef.current.width,
//       draftCanvasRef.current.height,
//     );
//   }

//   return (
//     <div
//       className="nodrag"
//       style={{
//         position: "relative",
//         width: `${width}px`,
//         height: `${height}px`,
//       }}
//     >
//       <canvas
//         ref={canvasRef}
//         onMouseDown={onMouseDown}
//         onMouseMove={onMouseMove}
//         onMouseUp={onMouseUp}
//         onMouseLeave={onMouseUp}
//         className="border border-gray-300"
//         style={{
//           position: "absolute",
//           top: 0,
//           left: 0,
//           width: "100%",
//           height: "100%",
//         }}
//       />
//       <canvas
//         ref={draftCanvasRef}
//         className="pointer-events-none border border-gray-300"
//         style={{
//           position: "absolute",
//           top: 0,
//           left: 0,
//           width: "100%",
//           height: "100%",
//           zIndex: 1,
//         }}
//       />
//     </div>
//   );
// }

// function getXY(e) {
//   const { offsetX, offsetY } = e.nativeEvent;
//   return { x: offsetX, y: offsetY };
// }
