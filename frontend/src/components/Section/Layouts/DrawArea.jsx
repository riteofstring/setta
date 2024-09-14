import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { setSectionSize } from "state/actions/sections/setters";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import { createRandomName } from "utils/idNameCreation";

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#ff0000");
  const [opacity, setOpacity] = useState(0.5);
  const [isEraser, setIsEraser] = useState(false);
  const strokesRef = useRef([]);

  function setDraftCanvasProperties() {
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    draftCanvas.width = canvasRef.current.width;
    draftCanvas.height = canvasRef.current.height;
    if (isEraser) {
      dCtx.globalCompositeOperation = "destination-out";
      dCtx.strokeStyle = "rgba(0,0,0,1)";
      dCtx.lineWidth = 16;
      dCtx.lineCap = "round";
      dCtx.globalAlpha = 1;
      draftCanvas.style.opacity = 1;
    } else {
      dCtx.globalCompositeOperation = "source-over";
      dCtx.strokeStyle = color;
      dCtx.lineWidth = 16;
      dCtx.lineCap = "round";
      dCtx.globalAlpha = 1;
      draftCanvas.style.opacity = opacity;
    }
  }

  function setCanvasProperties({ doDrawStrokes }) {
    const [canvas, ctx] = getCanvasAndCtx(canvasRef);
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
      clearCanvas(canvasRef);
      if (doDrawStrokes) {
        drawStrokes(canvas, ctx);
      }
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      ctx.globalCompositeOperation = "source-over";
    } else {
      const [defaultWidth, defaultHeight] = [500, 500];
      canvas.width = width === "auto" ? defaultWidth : width;
      canvas.height = height === "auto" ? defaultHeight : height;
      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, {
          width: canvas.width,
          height: canvas.height,
        });
      }
      clearCanvas(canvasRef);
      if (doDrawStrokes) {
        drawStrokes(canvas, ctx);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawStrokes(canvas, ctx) {
    const startingProps = _.pick(ctx, [
      "globalCompositeOperation",
      "strokeStyle",
      "globalAlpha",
      "lineWidth",
      "lineCap",
    ]);
    strokesRef.current.forEach((stroke) => {
      drawStroke(canvas, ctx, stroke);
    });
    for (const [k, v] of Object.entries(startingProps)) {
      ctx[k] = v;
    }
  }

  function drawStroke(canvas, ctx, stroke) {
    const scale = Math.min(
      canvas.width / stroke.canvasWidth,
      canvas.height / stroke.canvasHeight,
    );
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.globalCompositeOperation;
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    let prevPoint = stroke.points[0];
    stroke.points.forEach((point) => {
      ctx.moveTo(prevPoint[0], prevPoint[1]);
      ctx.lineTo(point[0], point[1]);
      prevPoint = point;
    });
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  async function processLoadedArtifacts() {
    if (!isLoaded) {
      return;
    }
    console.log(artifacts);
    for (const v of Object.values(artifacts)) {
      console.log("v", v);
      if (v.type === "img") {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${v.value}`;
        await image.decode();
        imageRef.current = image;
      } else if (v.type === "brushStrokes") {
        strokesRef.current = _.cloneDeep(v.value);
      }
    }
    setCanvasProperties({ doDrawStrokes: true });
    setDraftCanvasProperties();
  }

  useDeepCompareEffect(() => {
    processLoadedArtifacts();
  }, [artifacts, isLoaded]);

  useEffect(() => {
    setCanvasProperties({ doDrawStrokes: true });
    setDraftCanvasProperties();
  }, [height, width]);

  useEffect(() => {
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    if (isEraser) {
      setCanvasProperties({ doDrawStrokes: false });
      clearCanvas(draftCanvasRef);
      setDraftCanvasProperties();
      drawStrokes(draftCanvas, dCtx);
    } else {
      setCanvasProperties({ doDrawStrokes: true });
      setDraftCanvasProperties();
      clearCanvas(draftCanvasRef);
    }
  }, [isEraser, opacity, color]);

  function onMouseDown(e) {
    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    prevPointRef.current = getXY(e);
    strokesRef.current.push({
      color: isEraser ? dCtx.strokeStyle : color,
      opacity: isEraser ? 1 : opacity,
      points: [prevPointRef.current],
      canvasHeight: draftCanvas.height,
      canvasWidth: draftCanvas.width,
      globalCompositeOperation: dCtx.globalCompositeOperation,
    });
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const ctx = getCtx(draftCanvasRef);
    ctx.beginPath();
    ctx.moveTo(prevPointRef.current[0], prevPointRef.current[1]);
    ctx.lineTo(point[0], point[1]);
    ctx.stroke();
    prevPointRef.current = point;
    strokesRef.current[strokesRef.current.length - 1].points.push(point);
  }

  function onMouseUp() {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    if (!isEraser) {
      setCanvasProperties({ doDrawStrokes: true });
      setDraftCanvasProperties();
      clearCanvas(draftCanvasRef);
    }
    debouncedSetBrushStrokesArtifact(sectionId, strokesRef.current);
  }

  function toggleEraserMode() {
    setIsEraser(!isEraser);
  }

  function clearStrokes() {
    strokesRef.current = [];
    setCanvasProperties({ doDrawStrokes: true });
    clearCanvas(draftCanvasRef);
    debouncedSetBrushStrokesArtifact(sectionId, strokesRef.current);
  }

  function toBase64() {
    const base64Canvas = canvasRef.current
      .toDataURL("image/jpeg")
      .split(";base64,")[1];
    console.log(base64Canvas);
  }

  return (
    <div className="nodrag">
      <div className="flex items-center gap-4">
        <input
          id="colorPicker"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="-mt-16 h-10 w-10 rounded border border-gray-300"
        />
        <input
          id="opacitySlider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="-mt-16 w-40"
        />
        <span>{opacity.toFixed(1)}</span>
        <button className="-mt-16" onClick={toggleEraserMode}>
          {isEraser ? "Erasing" : "Drawing"}
        </button>
        <button className="-mt-16" onClick={clearStrokes}>
          Clear
        </button>
        <button className="-mt-16" onClick={toBase64}>
          To Base64
        </button>
      </div>

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
  );
}

function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return [offsetX, offsetY];
}

function clearCanvas(canvasRef) {
  const ctx = getCtx(canvasRef);
  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
}

function getCanvasAndCtx(canvasRef) {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  return [canvas, ctx];
}

function getCtx(canvasRef) {
  return canvasRef.current.getContext("2d");
}

const debouncedSetBrushStrokesArtifact = _.debounce((sectionId, strokes) => {
  const path = `data:${sectionId}-brushStrokes`;
  useArtifacts.setState((x) => {
    if (path in x.x) {
      x.x[path].value = strokes;
    } else {
      x.x[path] = {
        type: "brushStrokes",
        displayName: createRandomName(),
        value: strokes,
      };
    }
  });
  console.log("useArtifacts", useArtifacts.getState().x);
}, 500);
