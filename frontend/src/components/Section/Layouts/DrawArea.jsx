import _ from "lodash";
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
  const draftCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#ff0000");
  const [opacity, setOpacity] = useState(0.5);
  const [isEraser, setIsEraser] = useState(false);
  const strokesRef = useRef([]);

  const drawImageOnCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    drawBackgroundImage({ canvas, ctx, doDrawStrokes: true });

    if (!isEraser) {
      const draftCanvas = draftCanvasRef.current;
      const dCtx = draftCanvas.getContext("2d");
      draftCanvas.width = canvas.width;
      draftCanvas.height = canvas.height;
      dCtx.strokeStyle = color;
      dCtx.lineWidth = 16;
      dCtx.lineCap = "round";
      draftCanvas.style.opacity = opacity;
    }
  };

  function drawBackgroundImage({ canvas, ctx, doDrawStrokes }) {
    const image = imageRef.current;
    if (image && image.complete) {
      canvas.width = width === "auto" ? image.width : width;
      canvas.height = height === "auto" ? image.height : height;

      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, { width: image.width, height: image.height });
      }

      const scale = Math.min(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const x = canvas.width / 2 - (image.width / 2) * scale;
      const y = canvas.height / 2 - (image.height / 2) * scale;
      ctx.clearRect(0, 0, width, height);
      if (doDrawStrokes) {
        ctx.globalCompositeOperation = "source-over";
        drawStrokes(ctx);
      }
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawStrokes(ctx) {
    strokesRef.current.forEach((stroke) => {
      drawStroke(ctx, stroke);
    });
  }

  const drawStroke = (ctx, stroke) => {
    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.globalCompositeOperation;
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.forEach((point) => {
      ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
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
  }, [height, width, color, opacity]);

  useEffect(() => {
    if (isEraser) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      drawBackgroundImage({ canvas, ctx, doDrawStrokes: false });
      const draftCanvas = draftCanvasRef.current;
      const dCtx = draftCanvas.getContext("2d");
      dCtx.clearRect(
        0,
        0,
        draftCanvasRef.current.width,
        draftCanvasRef.current.height,
      );

      drawStrokes(dCtx);
      dCtx.globalCompositeOperation = "destination-out";
      dCtx.strokeStyle = "rgba(0,0,0,1)";
      dCtx.lineWidth = 16;
      dCtx.lineCap = "round";
      draftCanvas.style.opacity = 1;
      dCtx.globalAlpha = 1;
    } else {
      const draftCanvas = draftCanvasRef.current;
      const dCtx = draftCanvas.getContext("2d");
      drawImageOnCanvas();
      dCtx.clearRect(
        0,
        0,
        draftCanvasRef.current.width,
        draftCanvasRef.current.height,
      );
    }
  }, [isEraser]);

  function onMouseDown(e) {
    setIsDrawing(true);
    const draftCanvas = draftCanvasRef.current;
    const dCtx = draftCanvas.getContext("2d");
    prevPointRef.current = getXY(e);
    strokesRef.current.push({
      color: isEraser ? dCtx.strokeStyle : color,
      opacity: isEraser ? 1 : opacity,
      points: [prevPointRef.current],
      globalCompositeOperation: dCtx.globalCompositeOperation,
    });
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const point = getXY(e);
    const ctx = draftCanvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(prevPointRef.current.x, prevPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    prevPointRef.current = point;
    strokesRef.current[strokesRef.current.length - 1].points.push(point);
  }

  function onMouseUp() {
    setIsDrawing(false);
    if (!isEraser) {
      drawImageOnCanvas();
      const draftCtx = draftCanvasRef.current.getContext("2d");
      draftCtx.clearRect(
        0,
        0,
        draftCanvasRef.current.width,
        draftCanvasRef.current.height,
      );
    }
  }

  function toggleEraserMode() {
    setIsEraser(!isEraser);
  }

  return (
    <div className="nodrag">
      <div className="flex items-center gap-4">
        <input
          id="colorPicker"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-10 rounded border border-gray-300"
        />
        <input
          id="opacitySlider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="w-40"
        />
        <span>{opacity.toFixed(1)}</span>
        <button onClick={toggleEraserMode}>
          {isEraser ? "Erasing" : "Drawing"}
        </button>
      </div>
      <div
        className="relative"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="absolute left-0 top-0 h-full w-full border border-gray-300"
        />
        <canvas
          ref={draftCanvasRef}
          className="pointer-events-none absolute left-0 top-0 z-10 h-full w-full border border-gray-300"
        />
      </div>
    </div>
  );
}

function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return { x: offsetX, y: offsetY };
}
