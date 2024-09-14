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
  const imageRef = useRef(null);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#ff0000");
  const [opacity, setOpacity] = useState(0.5);
  const [isEraser, setIsEraser] = useState(false);
  const strokesRef = useRef([]);

  function setCanvasSize() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (image && image.complete) {
      canvas.width = width === "auto" ? image.width : width;
      canvas.height = height === "auto" ? image.height : height;

      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, { width: image.width, height: image.height });
      }

      setCanvasProperties();
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

  function setCanvasProperties() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgb(255,0,0)";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.globalAlpha = opacity
  }

  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      imageRef.current = image;
      setCanvasSize();
    };
  }, [imageUrl]);

  useEffect(() => {
    setCanvasSize();
  }, [height, width]);

  useEffect(() => {
    if (!isEraser) {
      setCanvasProperties();
    }
  }, [color, opacity]);

  useEffect(() => {
    if (isEraser) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgb(0,0,0)";
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
      ctx.globalAlpha = 1;
    } else {
      setCanvasProperties();
    }
  }, [isEraser]);

  function onMouseDown(e) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    console.log("color", ctx.strokeStyle);
    prevPointRef.current = getXY(e);
    strokesRef.current.push({
      color: ctx.strokeStyle,
      opacity: ctx.globalAlpha,
      points: [prevPointRef.current],
      globalCompositeOperation: ctx.globalCompositeOperation,
    });
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const point = getXY(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(prevPointRef.current.x, prevPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    prevPointRef.current = point;
    strokesRef.current[strokesRef.current.length - 1].points.push(point);
  }

  function onMouseUp() {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    drawStrokes(ctx);
  }

  function toggleEraserMode() {
    setIsEraser(!isEraser);
  }

  function toBase64() {
    const base64Canvas = canvasRef.current
      .toDataURL("image/jpeg")
      .split(";base64,")[1];
    console.log("base64Canvas", base64Canvas);
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
        <button onClick={toBase64}>To Base64</button>
      </div>
      <div
        className="relative"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        <img
          src={imageRef.current?.src}
          className="absolute left-0 top-0 h-full w-full border border-gray-300"
        />
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="absolute left-0 top-0 z-10 h-full w-full border border-gray-300"
        />
      </div>
    </div>
  );
}

function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return { x: offsetX, y: offsetY };
}
