import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import { SliderInput } from "components/Params/ParamUIs/SliderInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { BiPaint } from "react-icons/bi";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { sendToInteractiveTasks } from "state/actions/interactive";
import {
  base64RequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import {
  useArtifacts,
  useMisc,
  useSectionInfos,
  useTemporaryMiscState,
} from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";
import useDeepCompareEffect from "use-deep-compare-effect";
import { createNewId } from "utils/idNameCreation";
import {
  newArtifact,
  newDrawAreaLocalLayerState,
  newLayerSettings,
} from "utils/objs/artifact";

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const {
    size: { width, height },
    canvasSettings: {
      layerSettings,
      color,
      brushSize,
      brushShape,
      eraserBrushSize,
    },
  } = useSectionInfos((x) => {
    return {
      size: x.x[sectionId].size,
      canvasSettings: x.x[sectionId].canvasSettings,
    };
  }, _.isEqual);
  const [layers, setLayers] = useState({});
  const [activeLayerId, setActiveLayerId] = useState(null);
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const prevPointRef = useRef(null);
  const artifactIdUsedToSetCanvasSize = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  function setColor(v) {
    setCanvasSettings(sectionId, "color", v);
  }
  function setBrushOpacity(v) {
    setLayerSettings(sectionId, activeLayerId, "brushOpacity", v);
  }
  function setBrushSize(v) {
    setCanvasSettings(sectionId, "brushSize", v);
  }
  function setBrushShape(v) {
    setCanvasSettings(sectionId, "brushShape", v);
  }
  function setLayerOpacity(v) {
    setLayerSettings(sectionId, activeLayerId, "opacity", v);
  }
  function setEraserBrushSize(v) {
    setCanvasSettings(sectionId, "eraserBrushSize", v);
  }

  function setDraftCanvasProperties() {
    if (!activeLayerId) {
      return;
    }
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    clearCanvas(draftCanvasRef);
    if (isEraser) {
      dCtx.globalCompositeOperation = "destination-out";
      dCtx.strokeStyle = "rgba(0,0,0,1)";
      dCtx.lineWidth = eraserBrushSize;
      dCtx.lineCap = brushShape;
      dCtx.globalAlpha = 1;
    } else {
      dCtx.globalCompositeOperation = "source-over";
      dCtx.strokeStyle = hexToRGBA(
        color,
        layerSettings[activeLayerId].brushOpacity,
      );
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = brushShape;
      dCtx.globalAlpha = 1;
      draftCanvas.style.opacity = layerSettings[activeLayerId].opacity;
    }
    console.log("setDraftCanvasProperties", dCtx);
  }

  function setCanvasSize() {
    const [canvas] = getCanvasAndCtx(canvasRef);
    const [tempCanvas] = getCanvasAndCtx(tempCanvasRef);
    const [draftCanvas] = getCanvasAndCtx(draftCanvasRef);

    let imgSize = null;
    let isNewImg = false;
    for (const [id, layer] of Object.entries(layers)) {
      if (layer.image.complete) {
        const image = layer.image;
        imgSize = { width: image.width, height: image.height };
        isNewImg = id !== artifactIdUsedToSetCanvasSize.current;
        artifactIdUsedToSetCanvasSize.current = id;
        break;
      }
    }

    const canvasSize = setDrawAreaSectionSize({
      sectionId,
      imgSize,
      isNewImg,
    });

    console.log("canvasSize:", canvasSize);

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    tempCanvas.width = canvasSize.width;
    tempCanvas.height = canvasSize.height;

    draftCanvas.width = canvasSize.width;
    draftCanvas.height = canvasSize.height;
    console.log("setCanvasSize");
  }

  function drawAllLayers() {
    const [canvas, ctx] = getCanvasAndCtx(canvasRef);
    clearCanvas(canvasRef);

    for (const [id, layer] of Object.entries(layers)) {
      const { opacity: layerOpacity } = layerSettings[id];
      if (layer.image.complete) {
        const image = layer.image;

        const scale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height,
        );
        const x = canvas.width / 2 - (image.width / 2) * scale;
        const y = canvas.height / 2 - (image.height / 2) * scale;

        ctx.globalAlpha = layerOpacity;
        ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      } else if (layer.strokes.length > 0) {
        drawStrokes(canvasRef, tempCanvasRef, layer.strokes, layerOpacity);
      }
    }

    console.log("drawAllLayers");
  }

  async function processLoadedArtifacts() {
    if (!isLoaded) {
      return;
    }
    let firstBrushStrokeLayerId = null;
    const newLayerState = _.cloneDeep(layers);
    for (const [artifactId, v] of Object.entries(artifacts)) {
      if (!(artifactId in newLayerState)) {
        newLayerState[artifactId] = newDrawAreaLocalLayerState();
      }
      if (v.type === "img") {
        const base64String = `data:image/png;base64,${v.value}`;
        const storedImage = newLayerState[artifactId].image;
        if (storedImage.src !== base64String) {
          storedImage.src = base64String;
          await storedImage.decode();
        }
      } else if (v.type === "brushStrokes") {
        newLayerState[artifactId].strokes = _.cloneDeep(v.value);
        if (!firstBrushStrokeLayerId) {
          firstBrushStrokeLayerId = artifactId;
        }
      }
    }

    if (!firstBrushStrokeLayerId) {
      firstBrushStrokeLayerId = createNewId();
      newLayerState[firstBrushStrokeLayerId] = newDrawAreaLocalLayerState();
    }

    useSectionInfos.setState((x) => {
      const currLayerSettings = x.x[sectionId].canvasSettings.layerSettings;
      for (const id of Object.keys(newLayerState)) {
        if (!(id in currLayerSettings)) {
          currLayerSettings[id] = newLayerSettings();
        }
      }
    });

    setLayers(newLayerState);
    if (!activeLayerId) {
      setActiveLayerId(firstBrushStrokeLayerId);
    }
  }

  useEffect(() => {
    tempCanvasRef.current = document.createElement("canvas");

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

  useDeepCompareEffect(() => {
    processLoadedArtifacts();
  }, [Object.keys(artifacts), isLoaded]);

  useDeepCompareEffect(() => {
    setCanvasSize();
    drawAllLayers();
  }, [height, width, Object.keys(layers)]);

  useEffect(() => {
    setDraftCanvasProperties();
  }, [isEraser, color, brushSize, eraserBrushSize, brushShape, activeLayerId]);

  function startNewStroke(firstPoint) {
    const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
    strokesRef.current.push({
      strokeStyle: dCtx.strokeStyle,
      lineWidth: dCtx.lineWidth,
      lineCap: dCtx.lineCap,
      points: [firstPoint],
      canvasHeight: draftCanvas.height,
      canvasWidth: draftCanvas.width,
      globalCompositeOperation: dCtx.globalCompositeOperation,
    });
  }

  function drawDraftStroke(from, to) {
    const ctx = getCtx(draftCanvasRef);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  }

  function onMouseDown(e, offsetX, offsetY) {
    if (useMisc.getState().mouseDownDraggingSection) {
      return;
    }

    if (!useMisc.getState().mouseDownDrawArea) {
      // We want to do this just on the first mouse down.
      setActiveSectionIdAndUpdateZIndex(sectionId);
    }
    useMisc.setState({ mouseDownDrawArea: true });

    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    let point;
    if (offsetX && offsetY) {
      point = [offsetX, offsetY];
    } else {
      point = getXY(e);
    }
    startNewStroke(point);
    drawDraftStroke(point, point);
    prevPointRef.current = point;
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];
    // if (!isEraser && currStroke.points.length >= 10000) {
    //   console.log("strokesRef.current)", strokesRef.current);
    //   drawStrokes(
    //     canvasRef,
    //     tempCanvasRef,
    //     strokesRef.current,
    //     layerSettings[activeLayerId].opacity,
    //   );
    //   clearCanvas(draftCanvasRef);
    //   startNewStroke(point);
    //   prevPointRef.current = point;
    // } else {
    drawDraftStroke(prevPointRef.current, point);
    currStroke.points.push(point);
    prevPointRef.current = point;
    // }
  }

  function onMouseUp() {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    if (!isEraser) {
      drawAllLayers();
      clearCanvas(draftCanvasRef);
    }
    // debouncedSetBrushStrokesArtifact(
    //   sectionId,
    //   activeLayerId,
    //   strokesRef.current,
    // );
    // debouncedSendDrawingToInteractiveTasks(sectionId, toBase64);
  }

  function onMouseEnter(e) {
    if (e.buttons === 1) {
      // have to compute offset this way for some reason
      // otherwise it's inaccurate
      const zoom = getZoom();
      const rect = draftCanvasRef.current.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / zoom;
      const offsetY = (e.clientY - rect.top) / zoom;
      onMouseDown(e, offsetX, offsetY);
    }
  }

  function clearStrokes() {
    strokesRef.current = [];
    clearCanvas(canvasRef);
    clearCanvas(draftCanvasRef);
    debouncedSetBrushStrokesArtifact(
      sectionId,
      strokesArtifactId,
      strokesRef.current,
    );
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
    return base64;
  }

  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        // The base64 string is in reader.result
        const base64String = reader.result.replace(
          /^data:image\/[a-z]+;base64,/,
          "",
        );
        const artifactId = createNewId();
        useArtifacts.setState((x) => {
          x.x[artifactId] = newArtifact({
            value: base64String,
            type: "img",
          });
        });
        useSectionInfos.setState((state) => {
          state.x[sectionId].artifactIds.push(artifactId);
        });
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
      };

      // Read the file as a Data URL (base64)
      reader.readAsDataURL(file);
    });
  }, []);
  const { getRootProps, isDragActive } = useDropzone({ onDrop });

  const canvasClassName = `single-cell-child max-w-full place-self-center ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`;
  const cursorIcon = isEraser
    ? "cursor-[url(../../../erase.svg)_0_24,_pointer]"
    : "cursor-[url(../../../pen.svg)_0_24,_pointer]";

  return (
    <>
      <div className="section-search section-w-full z-10 flex  flex-wrap items-center gap-2 rounded-xl border-b border-solid border-white px-3 py-3 shadow-sm @container dark:border-setta-700 [&_.colorpicker]:!max-h-6 [&_.colorpicker]:max-w-24 ">
        <DrawAreaColorPicker
          sectionId={sectionId}
          color={color}
          setColor={setColor}
        />
        {!!activeLayerId && (
          <div className="flex self-stretch">
            <button
              className={`flex w-8 cursor-pointer items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${!isEraser ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-200 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
              onClick={() => {
                setIsEraser(false);
              }}
            >
              <BiPaint />
            </button>
            <StandardPopover
              arrowClasses="fill-white dark:fill-setta-800"
              contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
              trigger={
                <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
                  <i className="gg-chevron-down" />
                </button>
              }
              header={"Brush Settings"}
            >
              <BrushSettings
                opacity={layerSettings[activeLayerId].brushOpacity}
                setOpacity={setBrushOpacity}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
                brushShape={brushShape}
                setBrushShape={setBrushShape}
              />
            </StandardPopover>
          </div>
        )}
        {!!activeLayerId && (
          <div className="flex self-stretch">
            <button
              className={`flex w-8 cursor-pointer  items-center justify-center gap-1 rounded-l-lg bg-setta-200/30 py-1 text-xs ${isEraser ? "text-blue-500" : "text-setta-700 dark:text-setta-400"}  hover:bg-setta-300 dark:bg-setta-800/50  dark:hover:bg-setta-900`}
              onClick={() => {
                setIsEraser(true);
              }}
            >
              <i className="gg-erase" />
            </button>
            <StandardPopover
              arrowClasses="fill-white dark:fill-setta-800"
              contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
              trigger={
                <button className="flex w-6 cursor-pointer items-center justify-center gap-1 rounded-r-lg border border-setta-300/5 bg-setta-200 py-1  text-xs text-setta-700 hover:bg-setta-300 dark:bg-setta-800  dark:text-setta-400 dark:hover:bg-setta-900">
                  <i className="gg-chevron-down" />
                </button>
              }
              header={"Brush Settings"}
            >
              <EraserSettings
                brushSize={eraserBrushSize}
                setBrushSize={setEraserBrushSize}
              />
            </StandardPopover>
          </div>
        )}

        {!!activeLayerId && (
          <StandardPopover
            arrowClasses="fill-white dark:fill-setta-800"
            contentClasses="z-20 bg-white dark:bg-setta-800 flex relative px-2 py-1 rounded-lg min-w-48"
            trigger={
              <button className="flex w-12 cursor-pointer items-center justify-center gap-0 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
                <i className="gg-image" />
                <i className="gg-chevron-down" />
              </button>
            }
            header={"Layer Opacity"}
          >
            <LayerSettings
              opacity={layerSettings[activeLayerId].opacity}
              setOpacity={setLayerOpacity}
            />
          </StandardPopover>
        )}

        <button
          className="flex w-8 cursor-pointer items-center justify-center gap-1 self-stretch rounded-lg bg-setta-200/30 py-1 text-xs text-setta-700 hover:bg-red-600 hover:text-white dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-red-800 dark:hover:text-white"
          onClick={clearStrokes}
        >
          <i className="gg-trash" />
        </button>
      </div>
      <section
        className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0"
        {...getRootProps()}
      >
        <div className="single-cell-child single-cell-container">
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseEnter={onMouseEnter}
            className={`${cursorIcon} ${canvasClassName}`}
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

function DrawAreaColorPicker({ sectionId, color, setColor }) {
  const colorChoices = useSectionInfos(
    (x) => x.x[sectionId].canvasSettings?.colorChoices,
    _.isEqual,
  );

  return (
    <ColorPickerInput
      colorChoices={colorChoices}
      value={color}
      onChange={setColor}
      colorPickerChoicesClasses="inline-flex cursor-pointer items-center overflow-hidden rounded-lg single-cell-container h-8 min-h-0 w-full min-w-0 max-w-24 items-center text-white"
      wrapperClassName="single-cell-container justify-self-start self-center min-w-8 max-w-48 h-full"
    />
  );
}

function BrushSettings({
  opacity,
  setOpacity,
  brushSize,
  setBrushSize,
  brushShape,
  setBrushShape,
}) {
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
      <p className="self-center text-xs font-bold text-setta-600 dark:text-setta-400">
        Brush Shape
      </p>
      <div className="flex gap-1">
        <button
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === "round" ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50  focus-visible:ring-1 dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape("round")}
        >
          <i className="gg-shape-circle" />
        </button>
        <button
          className={`flex w-min cursor-pointer gap-2 rounded-lg border-solid ${brushShape === "butt" ? "border-setta-300 text-blue-500 dark:border-setta-700" : "border-transparent text-setta-600 dark:text-setta-400"} p-1 text-xs font-bold  hover:bg-setta-200/50   dark:hover:bg-setta-900/50`}
          onClick={() => setBrushShape("butt")}
        >
          <i className="gg-shape-square" />
        </button>
      </div>
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

function LayerSettings({ opacity, setOpacity }) {
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
        Layer Opacity
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

const debouncedSetBrushStrokesArtifact = _.debounce(
  (sectionId, activeLayerId, strokes) => {
    // layer ids are the same as artifact ids
    // because we assume each artifact gets its own layer
    useArtifacts.setState((x) => {
      if (!(activeLayerId in x.x)) {
        x.x[activeLayerId] = newArtifact({
          type: "brushStrokes",
          value: _.cloneDeep(strokes),
        });
      } else {
        x.x[activeLayerId].value = _.cloneDeep(strokes);
      }
    });

    useSectionInfos.setState((x) => {
      const artifactIds = x.x[sectionId].artifactIds;
      if (!artifactIds.includes(activeLayerId)) {
        artifactIds.push(activeLayerId);
      }
    });
  },
  500,
);

function exportStrokesToBase64(strokes, width, height) {
  // Create a temporary canvas
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");

  // Draw strokes on the temporary canvas
  strokes.forEach((stroke) => {
    drawStrokeOnTempCanvas(tempCanvas, tempCtx, stroke);
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

function drawStrokes(canvasRef, tempCanvasRef, strokes, layerOpacity) {
  const [tempCanvas, tempCtx] = getCanvasAndCtx(tempCanvasRef);
  strokes.forEach((stroke) => {
    drawStrokeOnTempCanvas(tempCanvas, tempCtx, stroke);
  });

  const ctx = getCanvasAndCtx(canvasRef)[1];
  ctx.globalAlpha = layerOpacity;
  ctx.drawImage(tempCanvas, 0, 0);

  clearCanvas(tempCanvasRef);
}

function drawStrokeOnTempCanvas(canvas, ctx, stroke) {
  const scale = Math.min(
    canvas.width / stroke.canvasWidth,
    canvas.height / stroke.canvasHeight,
  );
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.globalCompositeOperation = stroke.globalCompositeOperation;
  ctx.strokeStyle = stroke.strokeStyle;
  ctx.globalAlpha = 1;
  ctx.lineWidth = stroke.lineWidth;
  ctx.lineCap = stroke.lineCap;
  let prevPoint = stroke.points[0];
  console.log("drawing to ctx:", ctx);
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

function setCanvasSettings(sectionId, attr, value) {
  useSectionInfos.setState((x) => {
    x.x[sectionId].canvasSettings[attr] = value;
  });
}

function setLayerSettings(sectionId, activeLayerId, attr, value) {
  useSectionInfos.setState((x) => {
    x.x[sectionId].canvasSettings.layerSettings[activeLayerId][attr] = value;
  });
}

function hexToRGBA(_hex, opacity) {
  // Remove # if present
  const hex = _hex.replace("#", "");

  // Parse r, g, b values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
