import * as Slider from "@radix-ui/react-slider";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
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
      if (width === "auto" || height === "auto") {
        canvas.width = image.width;
        canvas.height = image.height;
        setSectionSize(sectionId, {
          width: image.width + SECTION_SIZE_CANVAS_WIDTH_DIFF,
          height: image.height + SECTION_SIZE_CANVAS_HEIGHT_DIFF,
        });
      } else {
        canvas.width = width - SECTION_SIZE_CANVAS_WIDTH_DIFF;
        canvas.height = height - SECTION_SIZE_CANVAS_HEIGHT_DIFF;
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
      canvas.width =
        width === "auto"
          ? defaultWidth
          : width - SECTION_SIZE_CANVAS_WIDTH_DIFF;
      canvas.height =
        height === "auto"
          ? defaultHeight
          : height - SECTION_SIZE_CANVAS_HEIGHT_DIFF;
      if (width === "auto" || height === "auto") {
        setSectionSize(sectionId, {
          width: canvas.width + SECTION_SIZE_CANVAS_WIDTH_DIFF,
          height: canvas.height + SECTION_SIZE_CANVAS_HEIGHT_DIFF,
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

  function onMouseDown(e, offsetX, offsetY) {
    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    if (offsetX && offsetY) {
      prevPointRef.current = { offsetX, offsetY };
    } else {
      prevPointRef.current = getXY(e);
    }
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
    debouncedSendDrawingToInteractiveTasks(sectionId, toBase64);
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
            onClick={toggleEraserMode}
          >
            <i className="gg-pen z-" />
          </button>
          <StandardPopover
            popoverContent={
              <BrushSettings opacity={opacity} setOpacity={setOpacity} />
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
          <button className="flex w-8 cursor-pointer  items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
            <i className="gg-erase" />
          </button>
          <StandardPopover
            popoverContent={<EraserSettings />}
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

        <button
          className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white"
          onClick={clearStrokes}
        >
          <i className="gg-trash" />
        </button>
      </div>
      <section className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0">
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
      </section>
    </>
  );
}

function BrushSettings({ opacity, setOpacity }) {
  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Opacity
      </p>
      <div className="flex gap-2">
        <Slider.Root
          id="opacitySlider"
          // type="range"
          className={sliderRootClassName}
          min={0}
          max={1}
          step={0.1}
          value={[opacity]}
          onValueChange={(v) => setOpacity(v[0])}
        >
          <Slider.Track className={sliderTrackClassName}>
            <Slider.Range className={sliderRangeClassName} />
          </Slider.Track>
          <Slider.Thumb className={sliderThumbClassName} />
        </Slider.Root>
        <input
          value={opacity.toFixed(1)}
          // onChange={() => {}}
          className="my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400"
        />
      </div>
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <div className="flex gap-2">
        <Slider.Root
          id="opacitySlider"
          className={sliderRootClassName}
          min={0}
          max={1}
          step={0.1}
        >
          <Slider.Track className={sliderTrackClassName}>
            <Slider.Range className={sliderRangeClassName} />
          </Slider.Track>
          <Slider.Thumb className={sliderThumbClassName} />
        </Slider.Root>
        <input className="my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400" />
      </div>
    </div>
  );
}

function EraserSettings() {
  const sliderRootClassName =
    "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex flex-1 min-w-16 touch-none select-none items-center my-auto data-[orientation='horizontal']:h-5";
  const sliderTrackClassName =
    "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
  const sliderRangeClassName = "absolute h-full rounded-full bg-blue-500";
  const sliderThumbClassName =
    "block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:bg-setta-100 focus:border-blue-500 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600";
  return (
    <div className="grid w-full grid-cols-[1fr,_2fr] gap-2">
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Opacity
      </p>
      <div className="flex gap-2">
        <Slider.Root
          id="opacitySlider"
          className={sliderRootClassName}
          min={0}
          max={1}
          step={0.1}
        >
          <Slider.Track className={sliderTrackClassName}>
            <Slider.Range className={sliderRangeClassName} />
          </Slider.Track>
          <Slider.Thumb className={sliderThumbClassName} />
        </Slider.Root>
        <input className="my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400" />
      </div>
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Size
      </p>
      <div className="flex gap-2">
        <Slider.Root
          id="opacitySlider"
          className={sliderRootClassName}
          min={0}
          max={1}
          step={0.1}
        >
          <Slider.Track className={sliderTrackClassName}>
            <Slider.Range className={sliderRangeClassName} />
          </Slider.Track>
          <Slider.Thumb className={sliderThumbClassName} />
        </Slider.Root>
        <input className="my-auto w-7 rounded-lg border border-solid border-setta-600/10 px-2 py-1 text-center font-mono text-xs text-setta-700 dark:border-setta-600/30 dark:text-setta-400" />
      </div>
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
