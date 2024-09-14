import _ from "lodash";
import { getStroke } from "perfect-freehand";
import { useEffect, useRef, useState } from "react";
import { setSectionSize } from "state/actions/sections/setters";
import { useSectionInfos } from "state/definitions";

export function DrawOnImage({ sectionId }) {
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );
  const imageUrl = "https://kevinmusgrave.com/img/kevin-musgrave2.png";
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [mode, setMode] = useState("draw");

  const drawImageOnCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const image = imageRef.current;

    if (image && image.complete) {
      canvas.width = width === "auto" ? image.width : width;
      canvas.height = height === "auto" ? image.height : height;
      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, { width: image.width, height: image.height });
      }

      // Fit image to canvas size while maintaining aspect ratio
      const scale = Math.min(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const x = canvas.width / 2 - (image.width / 2) * scale;
      const y = canvas.height / 2 - (image.height / 2) * scale;
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
    }
  };

  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      imageRef.current = image;
      drawImageOnCanvas();
    };
  }, [imageUrl]);

  useEffect(() => {
    drawImageOnCanvas();
  }, [height, width]);

  const drawStroke = (strokePoints) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const stroke = getStroke(strokePoints, {
      size: 20,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    });

    ctx.beginPath();
    if (mode === "draw") {
      ctx.fillStyle = "rgba(255, 0, 0, 0.1)"; // Semi-transparent red
    } else {
      ctx.globalCompositeOperation = "destination-out";
    }

    for (const [x, y] of stroke) {
      ctx.lineTo(x, y);
    }
    ctx.fill();

    if (mode === "erase") {
      ctx.globalCompositeOperation = "source-over";
    }
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const { offsetX, offsetY } = e.nativeEvent;
    const newPoints = [[offsetX, offsetY, Date.now()]];
    setPoints(newPoints);
    drawStroke(newPoints); // Draw a dot immediately on mouse down
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = e.nativeEvent;
    const newPoints = [...points, [offsetX, offsetY, Date.now()]];
    setPoints(newPoints);
    drawStroke(newPoints);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    setPoints([]);
  };

  const toggleMode = () => {
    setMode(mode === "draw" ? "erase" : "draw");
  };

  return (
    <div className="nodrag relative">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseOut={endDrawing}
        className="border border-gray-300"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
      <div className="absolute right-2 top-2 flex space-x-2">
        <button
          onClick={toggleMode}
          className={`rounded p-2 ${mode === "draw" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          {mode === "draw" ? "Eraser" : "Pencil"}
        </button>
      </div>
    </div>
  );
}
