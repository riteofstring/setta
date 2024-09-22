import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { BiPaint } from "react-icons/bi";
import { sendToInteractiveTasks } from "state/actions/interactive";
import {
  setAspectRatioInfo,
  setSectionSize,
} from "state/actions/sections/setters";
import {
  base64RequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import {
  useArtifacts,
  useSectionInfos,
  useTemporaryMiscState,
} from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import { createRandomName } from "utils/idNameCreation";

const SECTION_SIZE_CANVAS_HEIGHT_DIFF = 120;
const SECTION_SIZE_CANVAS_WIDTH_DIFF = 24;

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );
  const backgroundCanvasRef = useRef(null);
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#ff0000");
  const [opacity, setOpacity] = useState(0.5);
  const [brushSize, setBrushSize] = useState(16);
  const [canvasOpacity, setCanvasOpacity] = useState(0.5);
  const [eraserBrushSize, setEraserBrushSize] = useState(16);
  const [isEraser, setIsEraser] = useState(false);
  const [isContinuingStroke, setIsContinuingStroke] = useState(false);
  const strokesRef = useRef([]);

  function setDraftCanvasProperties() {
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    draftCanvas.width = canvasRef.current.width;
    draftCanvas.height = canvasRef.current.height;
    if (isEraser) {
      dCtx.globalCompositeOperation = "destination-out";
      dCtx.strokeStyle = "rgba(0,0,0,1)";
      dCtx.lineWidth = eraserBrushSize;
      dCtx.lineCap = "round";
      dCtx.globalAlpha = 1;
      draftCanvas.style.opacity = 1;
    } else {
      dCtx.globalCompositeOperation = "source-over";
      dCtx.strokeStyle = color;
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = "round";
      dCtx.globalAlpha = 1;
      draftCanvas.style.opacity = opacity;
    }
  }

  function setCanvasProperties({ doDrawStrokes }) {
    const [canvas] = getCanvasAndCtx(canvasRef);
    const [backgroundCanvas, backgroundCtx] =
      getCanvasAndCtx(backgroundCanvasRef);

    const image = imageRef.current;
    if (image && image.complete) {
      if (width === "auto" || height === "auto") {
        backgroundCanvas.width = image.width;
        backgroundCanvas.height = image.height;
        setSectionSize(sectionId, {
          width: image.width + SECTION_SIZE_CANVAS_WIDTH_DIFF,
          height: image.height + SECTION_SIZE_CANVAS_HEIGHT_DIFF,
        });
      } else {
        backgroundCanvas.width = width - SECTION_SIZE_CANVAS_WIDTH_DIFF;
        backgroundCanvas.height = height - SECTION_SIZE_CANVAS_HEIGHT_DIFF;
      }
      canvas.width = backgroundCanvas.width;
      canvas.height = backgroundCanvas.height;

      const scale = Math.min(
        backgroundCanvas.width / image.width,
        backgroundCanvas.height / image.height,
      );
      const x = backgroundCanvas.width / 2 - (image.width / 2) * scale;
      const y = backgroundCanvas.height / 2 - (image.height / 2) * scale;
      clearCanvas(backgroundCanvasRef);
      backgroundCtx.globalAlpha = 1;
      backgroundCtx.drawImage(
        image,
        x,
        y,
        image.width * scale,
        image.height * scale,
      );
    } else {
      const [defaultWidth, defaultHeight] = [500, 500];
      backgroundCanvas.width =
        width === "auto"
          ? defaultWidth
          : width - SECTION_SIZE_CANVAS_WIDTH_DIFF;
      backgroundCanvas.height =
        height === "auto"
          ? defaultHeight
          : height - SECTION_SIZE_CANVAS_HEIGHT_DIFF;
      canvas.width = backgroundCanvas.width;
      canvas.height = backgroundCanvas.height;
      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, {
          width: backgroundCanvas.width + SECTION_SIZE_CANVAS_WIDTH_DIFF,
          height: backgroundCanvas.height + SECTION_SIZE_CANVAS_HEIGHT_DIFF,
        });
      }
      clearCanvas(backgroundCanvasRef);
    }

    clearCanvas(canvasRef);
    if (doDrawStrokes) {
      drawStrokesAndKeepOriginalProps(canvasRef, strokesRef.current);
    }
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
        image.src = `data:image/png;base64,${v.value}`;
        await image.decode();
        imageRef.current = image;
        setAspectRatioInfo({
          sectionId,
          aspectRatio: imageRef.current.width / imageRef.current.height,
          aspectRatioExtraHeight: SECTION_SIZE_CANVAS_HEIGHT_DIFF,
          aspectRatioExtraWidth: SECTION_SIZE_CANVAS_WIDTH_DIFF,
        });
      } else if (v.type === "brushStrokes") {
        strokesRef.current = _.cloneDeep(v.value);
      }
    }
    setCanvasProperties({ doDrawStrokes: true });
    setDraftCanvasProperties();
  }

  useDeepCompareEffect(() => {
    processLoadedArtifacts();
  }, [Object.keys(artifacts), isLoaded]);

  useEffect(() => {
    setCanvasProperties({ doDrawStrokes: true });
    setDraftCanvasProperties();
  }, [height, width]);

  useEffect(() => {
    if (isEraser) {
      setCanvasProperties({ doDrawStrokes: false });
      setDraftCanvasProperties();
      clearCanvas(draftCanvasRef);
      drawStrokesAndKeepOriginalProps(draftCanvasRef, strokesRef.current);
    } else {
      setCanvasProperties({ doDrawStrokes: true });
      setDraftCanvasProperties();
      clearCanvas(draftCanvasRef);
    }
  }, [isEraser, opacity, color, brushSize, eraserBrushSize]);

  useEffect(() => {
    const id = base64RequestId(sectionId);
    const unsub = useTemporaryMiscState.subscribe(
      (x) => x[id],
      (x) => {
        if (x === true) {
          setTemporaryMiscState(id, toBase64());
        }
      },
    );
    return unsub;
  }, []);

  function startNewStroke(firstPoint, inputOpacity) {
    console.log("startNewStroke", firstPoint);
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    strokesRef.current.push({
      color: isEraser ? dCtx.strokeStyle : color,
      opacity: isEraser ? 1 : inputOpacity ?? opacity,
      lineWidth: dCtx.lineWidth,
      lineCap: dCtx.lineCap,
      points: [firstPoint],
      canvasHeight: draftCanvas.height,
      canvasWidth: draftCanvas.width,
      globalCompositeOperation: dCtx.globalCompositeOperation,
    });
  }

  function onMouseDown(e, offsetX, offsetY) {
    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    if (offsetX && offsetY) {
      prevPointRef.current = [offsetX, offsetY];
    } else {
      prevPointRef.current = getXY(e);
    }
    startNewStroke(prevPointRef.current);
    // const ctx = getCtx(draftCanvasRef);
    // ctx.beginPath();
    // ctx.moveTo(prevPointRef.current[0], prevPointRef.current[1]);
    // ctx.lineTo(prevPointRef.current[0], prevPointRef.current[1]);
    // ctx.stroke();
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const dCtx = getCtx(draftCanvasRef);
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];

    if (isContinuingStroke) {
      // if (
      //   !doPointsOverlap(
      //     point,
      //     prevPointRef.current,
      //     ctx.lineWidth,
      //     ctx.lineWidth,
      //   )
      // ) {
      //   prevPointRef.current = point;
      //   startNewStroke(prevPointRef.current);
      //   setIsContinuingStroke(false);
      // }
    } else if (!isEraser && currStroke.points.length >= 50) {
      const [canvas, ctx] = getCanvasAndCtx(canvasRef);
      clearCanvas(draftCanvasRef);
      drawStroke(canvas, ctx, currStroke);
      // dCtx.beginPath();
      // dCtx.moveTo(prevPointRef.current[0], prevPointRef.current[1]);
      // dCtx.lineTo(point[0], point[1]);
      // dCtx.stroke();
      // startNewStroke(point, 0);
      // const newStroke = strokesRef.current[strokesRef.current.length - 1];
      // newStroke.points.push(point);
      // drawStroke(canvas, ctx, newStroke);

      // setIsContinuingStroke(true);
    } else {
      dCtx.beginPath();
      dCtx.moveTo(prevPointRef.current[0], prevPointRef.current[1]);
      dCtx.lineTo(point[0], point[1]);
      dCtx.stroke();
      prevPointRef.current = point;
      currStroke.points.push(prevPointRef.current);
    }
  }

  function onMouseUp() {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    if (!isEraser) {
      // drawLatestStroke(canvasRef, strokesRef.current);
      clearCanvas(draftCanvasRef);
    }
    // debouncedSetBrushStrokesArtifact(sectionId, strokesRef.current);
    // debouncedSendDrawingToInteractiveTasks(sectionId, toBase64);
  }

  function onMouseEnter(e) {
    if (e.buttons === 1) {
      // have to compute offset this way for some reason
      // otherwise it's inaccurate
      const rect = draftCanvasRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      onMouseDown(e, offsetX, offsetY);
    }
  }

  function clearStrokes() {
    strokesRef.current = [];
    clearCanvas(canvasRef);
    clearCanvas(draftCanvasRef);
    // debouncedSetBrushStrokesArtifact(sectionId, strokesRef.current);
  }

  function toBase64() {
    const [width, height] = [canvasRef.current.width, canvasRef.current.height];
    const base64 = {};
    base64["completeCanvas"] = canvasToBase64(canvasRef.current);
    base64["strokes"] = exportStrokesToBase64(
      strokesRef.current,
      width,
      height,
    );
    if (imageRef.current) {
      base64["image"] = exportImageToBase64(imageRef.current, width, height);
    }
    console.log("toBase64");
    return base64;
  }

  const canvasClassName = "single-cell-child max-w-full place-self-center";

  return (
    <>
      <div className="section-search section-w-full z-10  flex flex-wrap items-center gap-2 rounded-xl border-b border-solid border-white px-3 py-3 shadow-sm @container dark:border-setta-700 ">
        <input
          id="colorPicker"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="min-h-4 min-w-4 cursor-pointer"
        />

        <div className="flex">
          <button
            className="flex w-8 cursor-pointer items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900"
            onClick={() => {
              setIsEraser(false);
            }}
          >
            <BiPaint />
          </button>
          <StandardPopover
            popoverContent={
              <BrushSettings
                opacity={opacity}
                setOpacity={setOpacity}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
              />
            }
            arrowClasses="fill-white dark:fill-setta-800"
            inputClasses="rounded-lg"
            contentClasses="bg-white dark:bg-setta-800 -mt-4 flex relative px-2 py-1 rounded-lg min-w-48"
            trigger={
              <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-800  py-1 text-xs text-setta-700 hover:bg-setta-200  dark:text-setta-400 dark:hover:bg-setta-900">
                <i className="gg-chevron-down" />
              </button>
            }
            header={"Brush Settings"}
          />
        </div>
        <div className="flex">
          <button
            className="flex w-8 cursor-pointer  items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900"
            onClick={() => {
              setIsEraser(true);
            }}
          >
            <i className="gg-erase" />
          </button>
          <StandardPopover
            popoverContent={
              <EraserSettings
                brushSize={eraserBrushSize}
                setBrushSize={setEraserBrushSize}
              />
            }
            arrowClasses="fill-white dark:fill-setta-800"
            inputClasses="rounded-lg"
            contentClasses="bg-white dark:bg-setta-800 -mt-4 flex relative px-2 py-1 rounded-lg min-w-48"
            trigger={
              <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-800  py-1 text-xs text-setta-700 hover:bg-setta-200  dark:text-setta-400 dark:hover:bg-setta-900">
                <i className="gg-chevron-down" />
              </button>
            }
            header={"Brush Settings"}
          />
        </div>

        <StandardPopover
          popoverContent={
            <CanvasSettings
              opacity={canvasOpacity}
              setOpacity={setCanvasOpacity}
            />
          }
          arrowClasses="fill-white dark:fill-setta-800"
          inputClasses="rounded-lg"
          contentClasses="bg-white dark:bg-setta-800 -mt-4 flex relative px-2 py-1 rounded-lg min-w-48"
          trigger={
            <button className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white">
              <i className="gg-image" />
            </button>
          }
          header={"Layer Opacity"}
        />

        <button
          className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white"
          onClick={clearStrokes}
        >
          <i className="gg-trash" />
        </button>
      </div>
      <section className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0">
        <canvas ref={backgroundCanvasRef} className={canvasClassName} />
        <div
          className="single-cell-child single-cell-container"
          style={{ opacity: canvasOpacity }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseEnter={onMouseEnter}
            className={canvasClassName}
          />
          <canvas
            ref={draftCanvasRef}
            className={`pointer-events-none z-10 ${canvasClassName}`}
          />
        </div>
      </section>
    </>
  );
}

function BrushSettings({ opacity, setOpacity, brushSize, setBrushSize }) {
  const [localOpacity, setLocalOpacity] = useState(opacity);
  const [localBrushSize, setLocalBrushSize] = useState(brushSize);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    setLocalBrushSize(brushSize);
  }, [brushSize]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Opacity
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={0.1}
        max={1}
        step={0.1}
        value={localOpacity}
        onChange={setLocalOpacity}
        onCommit={setOpacity}
      />
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={1}
        max={100}
        step={1}
        value={localBrushSize}
        onChange={setLocalBrushSize}
        onCommit={setBrushSize}
      />
    </div>
  );
}

function EraserSettings({ brushSize, setBrushSize }) {
  const [localBrushSize, setLocalBrushSize] = useState(brushSize);

  useEffect(() => {
    setLocalBrushSize(brushSize);
  }, [brushSize]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={1}
        max={100}
        step={1}
        value={localBrushSize}
        onChange={setLocalBrushSize}
        onCommit={setBrushSize}
      />
    </div>
  );
}

function CanvasSettings({ opacity, setOpacity }) {
  const [localOpacity, setLocalOpacity] = useState(opacity);

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  const textInputClassName =
    "my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <SliderInput
        sliderRootClassName={sliderRootClassName}
        sliderTrackClassName={sliderTrackClassName}
        sliderRangeClassName={sliderRangeClassName}
        sliderThumbClassName={sliderThumbClassName}
        textInputClassName={textInputClassName}
        wrapperDivClass="flex gap-2"
        min={0.1}
        max={1}
        step={0.1}
        value={localOpacity}
        onChange={setLocalOpacity}
        onCommit={setOpacity}
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
      x.x[path].value = _.cloneDeep(strokes);
    } else {
      x.x[path] = {
        type: "brushStrokes",
        displayName: createRandomName(),
        value: _.cloneDeep(strokes),
      };
    }
  });

  useSectionInfos.setState((x) => {
    const paths = x.x[sectionId].artifacts;
    if (!paths.includes(path)) {
      paths.push(path);
    }
  });

  console.log("useArtifacts", useArtifacts.getState().x);
}, 500);

function exportStrokesToBase64(strokes, width, height) {
  // Create a temporary canvas
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");

  // Draw strokes on the temporary canvas
  strokes.forEach((stroke) => {
    drawStroke(tempCanvas, tempCtx, stroke);
  });

  return canvasToBase64(tempCanvas);
}

function exportImageToBase64(image, width, height) {
  // Create a temporary canvas
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(image, 0, 0);
  return canvasToBase64(tempCanvas);
}

function doPointsOverlap(point1, point2, point1LineWidth, point2LineWidth) {
  // Calculate the distance between the points
  const dx = point2[0] - point1[0];
  const dy = point2[1] - point1[1];
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Calculate the sum of their radii (half of their lineWidths)
  const totalRadius = (point1LineWidth + point2LineWidth) / 2;

  // If the distance is less than or equal to the total radius, they overlap
  return distance <= totalRadius * 0.5;
}

function drawStrokesAndKeepOriginalProps(canvasRef, strokes) {
  const [canvas, ctx] = getCanvasAndCtx(canvasRef);
  const startingProps = _.pick(ctx, [
    "globalCompositeOperation",
    "strokeStyle",
    "globalAlpha",
    "lineWidth",
    "lineCap",
  ]);
  strokes.forEach((stroke) => {
    drawStroke(canvas, ctx, stroke);
  });
  for (const [k, v] of Object.entries(startingProps)) {
    ctx[k] = v;
  }
}

function drawLatestStroke(canvasRef, strokes) {
  const [canvas, ctx] = getCanvasAndCtx(canvasRef);
  const currStroke = strokes[strokes.length - 1];
  drawStroke(canvas, ctx, currStroke);
}

function drawStroke(canvas, ctx, stroke) {
  console.log("drawStroke", stroke);
  const scale = Math.min(
    canvas.width / stroke.canvasWidth,
    canvas.height / stroke.canvasHeight,
  );
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.globalCompositeOperation = stroke.globalCompositeOperation;
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity;
  ctx.lineWidth = stroke.lineWidth;
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

function dataURLToBase64(dataURL) {
  return dataURL.split(";base64,")[1];
}

function canvasToBase64(canvas) {
  return dataURLToBase64(canvas.toDataURL("image/png"));
}

const debouncedSendDrawingToInteractiveTasks = _.debounce(
  (sectionId, fnToBase64) => {
    sendToInteractiveTasks([sectionId, "drawing"], fnToBase64());
  },
  500,
);
